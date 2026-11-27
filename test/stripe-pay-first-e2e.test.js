// The pay-first sign-up (£197 a month or £1,970 a year) against a stand-in Stripe API with signed webhooks:
// yearly prices, the webhook arriving before setup, a double-clicked setup, a cancel request, cancel and restart.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

const SECRET = 'whsec_pf';
const calls = [], sessions = {};
let mock, t, WS, n = 0;
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const body = new URLSearchParams(raw); calls.push({ method: q.method, path: q.url, body }); let out = { id: 'x' };
    if (q.url === '/v1/checkout/sessions') { const id = 'cs_pf_' + (++n); const md = {}; for (const [k, v] of body) { const m = /^metadata\[(\w+)\]$/.exec(k); if (m) md[m[1]] = v; }
      sessions[id] = { id, status: 'open', metadata: md }; out = { id, url: 'https://checkout.stripe.test/' + id }; }
    else if (q.url.startsWith('/v1/checkout/sessions/')) out = sessions[q.url.split('/').pop().split('?')[0]] || { status: 'open', metadata: {} };
    else if (q.url.startsWith('/v1/subscriptions')) out = { data: [] };
    s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(out));
  }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_pf', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_API_BASE: 'http://localhost:' + mock.address().port,
    STRIPE_PRICE_GROWTH: 'price_g_m', STRIPE_PRICE_GROWTH_ANNUAL: 'price_g_y', STRIPE_PRICE_CALENDAR_SYNC: 'price_a_m', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'price_a_y' });
});
test.after(() => { t.stop(); mock.close(); });

const hook = ev => { const raw = JSON.stringify(Object.assign({ id: 'evt_' + crypto.randomUUID() }, ev)), ts = Math.floor(Date.now() / 1000);
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex') } }); };
const count = async like => (await t.sql('SELECT count(*)::int AS n FROM outbox WHERE subject LIKE ? OR meta LIKE ?', like, like))[0].n;
const status = async () => (await t.sql('SELECT billing_status FROM workspaces WHERE id = ?', WS))[0].billing_status;
const lastCheckout = () => calls.filter(x => x.path === '/v1/checkout/sessions').pop().body;
const form = { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } };
const pause = ms => new Promise(r => setTimeout(r, ms));
const home = { name: 'Gull Cottage', theme: 'lake', nightly: 140, maxGuests: 4, bedrooms: 2, area: 'Whitby, North Yorkshire' };

let sid;
test('a yearly sign-up with the add-on checks out at the yearly prices, upfront, with no trial', async () => {
  const r = await t.signup({ property: undefined, annual: true, addon: true }); assert.equal(r.status, 200);
  sid = r.body.redirect.split('/').pop(); WS = sessions[sid].metadata.workspace;
  const b = lastCheckout();
  assert.equal(b.get('mode'), 'subscription'); assert.equal(b.get('line_items[0][price]'), 'price_g_y'); assert.equal(b.get('line_items[1][price]'), 'price_a_y');
  assert.equal(b.get('subscription_data[trial_period_days]'), null); assert.equal(b.get('metadata[kind]'), 'plan');
  assert.match((await t.call('/app/pay')).body, /£1970 for your first year/);
});

test('the webhook landing before setup opens setup, and no welcome goes out until the home exists', async () => {
  Object.assign(sessions[sid], { status: 'complete', customer: 'cus_pf' });
  assert.equal((await hook({ type: 'checkout.session.completed', data: { object: Object.assign({ payment_status: 'paid' }, sessions[sid]) } })).status, 200);
  assert.equal(await status(), 'active');
  assert.equal((await t.call('/app/pay/done?session=' + sid)).headers.get('location'), '/app/setup');
  await pause(400); assert.equal(await count('Welcome to Bookingbooster'), 0);
});

test('a double-clicked setup adds one home and sends one welcome and one "site is live"', async () => {
  const [a, b] = await Promise.all([t.call('/api/setup', { body: { property: home, domainMode: 'free' } }), t.call('/api/setup', { body: { property: home, domainMode: 'free' } })]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal((await t.call('/api/state')).body.state.properties.length, 1, 'one home');
  await pause(1200); assert.equal(await count('%site-live%'), 0, 'no "site is live" email while the new site is building');
  await t.finish();
  await t.until(async () => (await count('%site-live%')) > 0); await pause(1200);
  assert.equal(await count('Welcome to Bookingbooster'), 1, 'one welcome'); assert.equal(await count('%site-live%'), 1, 'one site-live');
});

test('asking to cancel in the Stripe portal is handled, and the site stays up until the period ends', async () => {
  const r = await hook({ type: 'customer.subscription.updated', data: { object: { id: 'sub_pf', customer: 'cus_pf', status: 'active', cancel_at_period_end: true, current_period_end: Math.floor(Date.now() / 1000) + 86400 * 300 } } });
  assert.equal(r.status, 200); assert.equal(await status(), 'active');
  const slug = (await t.sql('SELECT slug FROM workspaces WHERE id = ?', WS))[0].slug;
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 200);
});

test('when the plan ends the site goes offline, and restarting bills the yearly prices to the same customer', async () => {
  await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_pf', customer: 'cus_pf' } } });
  assert.equal(await status(), 'cancelled');
  assert.match((await t.call('/app/pay')).body, /Your plan has ended/);
  const r = await t.call('/app/billing/start', form); assert.match(r.headers.get('location'), /checkout\.stripe\.test/);
  const b = lastCheckout(); assert.equal(b.get('customer'), 'cus_pf'); assert.equal(b.get('line_items[0][price]'), 'price_g_y');
  const id = r.headers.get('location').split('/').pop(); Object.assign(sessions[id], { status: 'complete', customer: 'cus_pf' });
  assert.equal((await t.call('/app/pay/done?session=' + id)).headers.get('location'), '/app?welcome=1');
  assert.equal(await status(), 'active'); await pause(400);
  assert.equal(await count('Welcome to Bookingbooster'), 1, 'no second welcome on a restart');
});
