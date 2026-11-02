// Host plan billing: a yearly sign-up gets the yearly Stripe prices, add-on included, plus the one-off setup fee and a free first month.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

let mock, t; const bodies = [];
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { if (q.url === '/v1/checkout/sessions') bodies.push(new URLSearchParams(raw)); s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"cs_1","url":"https://checkout.stripe.test/cs_1"}'); }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: 'http://localhost:' + mock.address().port,
    STRIPE_PRICE_GROWTH: 'price_g_m', STRIPE_PRICE_GROWTH_ANNUAL: 'price_g_y', STRIPE_PRICE_CALENDAR_SYNC: 'price_a_m', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'price_a_y', STRIPE_PRICE_SETUP: 'price_setup', STRIPE_WEBHOOK_SECRET: 'whsec_b' });
  await t.signup({ annual: true, addon: true });
});
test.after(() => { t.stop(); mock.close(); });

test('a yearly sign-up is billed yearly', async () => {
  assert.match((await t.call('/app/billing')).body, /£2000 a year/);
  const r = await t.call('/app/billing/start', { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://checkout.stripe.test/cs_1');
  const b = bodies[0]; assert.equal(b.get('line_items[0][price]'), 'price_g_y'); assert.equal(b.get('line_items[1][price]'), 'price_a_y'); assert.equal(b.get('line_items[2][price]'), 'price_setup'); assert.equal(b.get('subscription_data[trial_period_days]'), '30');
  assert.match((await t.call('/app/billing')).body, /setup fee of £997/);
});

test('the booking site stays offline to guests until the first payment, but the host can preview it', async () => {
  const { url } = await t.home(); const path = new URL(url).pathname, slug = path.split('/')[2];
  const guest = p => fetch(t.base + p, { redirect: 'manual' });
  const before = await guest(path); assert.equal(before.status, 503); assert.match(await before.text(), /opening soon/);
  assert.equal((await t.call(path)).status, 200, 'host preview');
  const book = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); assert.equal(book.status, 403);
  const meta = new URLSearchParams(bodies[0].toString()); const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1', customer: 'cus_b', metadata: { workspace: meta.get('metadata[workspace]'), kind: 'plan', plan: 'Growth' } } } });
  const ts = Math.floor(Date.now() / 1000), sig = crypto.createHmac('sha256', 'whsec_b').update(ts + '.' + raw).digest('hex');
  assert.equal((await t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig } })).status, 200);
  assert.equal((await guest(path)).status, 200);
});
