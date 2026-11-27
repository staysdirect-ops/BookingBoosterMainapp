// Pay first: the sign-up page only creates the account and opens Stripe Checkout. The host gets no access to the console
// until it is paid, and sets up their first home straight after, at /app/setup.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

let mock, t, signedUp; const bodies = []; const sessions = {};
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { s.writeHead(200, { 'content-type': 'application/json' });
    if (q.url.startsWith('/v1/checkout/sessions/')) return s.end(JSON.stringify(sessions[q.url.split('/').pop()] || { status: 'open', metadata: {} }));
    if (q.url === '/v1/checkout/sessions') bodies.push(new URLSearchParams(raw)); s.end('{"id":"cs_1","url":"https://checkout.stripe.test/cs_1"}'); }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: 'http://localhost:' + mock.address().port,
    STRIPE_PRICE_GROWTH: 'price_g_m', STRIPE_PRICE_GROWTH_ANNUAL: 'price_g_y', STRIPE_PRICE_CALENDAR_SYNC: 'price_a_m', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'price_a_y', STRIPE_WEBHOOK_SECRET: 'whsec_p' });
  signedUp = await t.signup({ property: undefined }); // what the pay-first sign-up page sends: the account only
});
test.after(() => { t.stop(); mock.close(); });
const wsId = () => bodies[0].get('metadata[workspace]');
const outbox = async like => (await t.sql('SELECT count(*)::int AS n FROM outbox WHERE subject LIKE ? OR meta LIKE ?', like, like))[0].n;

test('the sign-up page is the account and payment only, with £197 a month', async () => {
  const r = await t.call('/start'); assert.equal(r.status, 200); assert.match(r.body, /"payFirst":true/);
});

test('an account-only sign-up goes straight to Checkout at £197 a month, and nothing opens before payment', async () => {
  assert.equal(signedUp.status, 200); assert.equal(signedUp.body.redirect, 'https://checkout.stripe.test/cs_1');
  assert.equal(bodies[0].get('line_items[0][price]'), 'price_g_m'); assert.equal(bodies[0].get('line_items[1][price]'), null);
  assert.equal(bodies[0].get('subscription_data[trial_period_days]'), null, 'no free month');
  assert.equal((await t.call('/app')).headers.get('location'), '/app/pay');
  assert.equal((await t.call('/app/setup')).headers.get('location'), '/app/pay', 'setup is locked until it is paid too');
  assert.equal((await t.call('/api/setup', { body: { property: { name: 'Sneaky' } } })).status, 402);
  assert.match((await t.call('/app/pay')).body, /£197 for your first month/);
});

test('once paid, the host sets up their first home, then the console opens', async () => {
  sessions.cs_done = { id: 'cs_done', status: 'complete', customer: 'cus_p', metadata: { workspace: wsId(), kind: 'plan', plan: 'Growth' } };
  const done = await t.call('/app/pay/done?session=cs_done'); assert.equal(done.headers.get('location'), '/app/setup');
  assert.equal(await outbox('Welcome to Bookingbooster'), 0, 'the welcome email waits for the site');
  assert.equal((await t.call('/app')).headers.get('location'), '/app/setup', 'the console needs a home first');
  const page = await t.call('/app/setup'); assert.equal(page.status, 200); assert.match(page.body, /"setup":true/); assert.match(page.body, /"setupUrl":"\/api\/setup"/);
  assert.equal((await t.call('/api/setup', { body: { property: { name: '' } } })).status, 400);
  const r = await t.call('/api/setup', { body: { property: { name: 'Gull Cottage', theme: 'lake', nightly: 140, maxGuests: 4, bedrooms: 2, area: 'Whitby, North Yorkshire' }, domainMode: 'free' } });
  assert.equal(r.status, 200); assert.equal(r.body.redirect, '/app?welcome=1');
  assert.equal((await t.call('/app')).status, 200); assert.equal((await t.call('/app/setup')).headers.get('location'), '/app');
  const { p } = await t.home(); assert.equal(p.name, 'Gull Cottage');
  assert.equal(await t.until(async () => (await outbox('Welcome to Bookingbooster')) === 1), true, 'one welcome email, after setup');
  assert.equal(await outbox('%site-live%'), 0, 'the new site is still building, so no "site is live" email yet');
  await t.finish();
  assert.equal(await t.until(async () => (await outbox('%site-live%')) === 1), true, 'one "site is live" email, once it goes live');
  const again = await t.call('/api/setup', { body: { property: { name: 'Second' } } }); assert.equal(again.body.redirect, '/app');
  assert.equal((await t.call('/api/state')).body.state.properties.length, 1, 'setup adds the first home only once');
});
