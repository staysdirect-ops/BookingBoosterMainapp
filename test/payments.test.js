// Card payments against a stand-in Stripe API: connect, instant booking, signed webhook, refund on cancel.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

const SECRET = 'whsec_test_123';
const seen = [];
let mock, t, WS;
test.before(async () => {
  mock = http.createServer((q, s) => {
    let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
      seen.push({ method: q.method, path: q.url, body: new URLSearchParams(raw) });
      const out = q.url === '/v1/accounts' ? { id: 'acct_test1' }
        : q.url === '/v1/account_links' ? { url: 'https://connect.stripe.test/onboard' }
        : q.url.startsWith('/v1/accounts/acct_test1') ? { id: 'acct_test1', charges_enabled: true, payouts_enabled: true, details_submitted: true, external_accounts: { data: [{ bank_name: 'Test Bank', last4: '6789' }] } }
        : q.url === '/v1/checkout/sessions' ? { id: 'cs_test_' + seen.length, url: 'https://checkout.stripe.test/cs_' + seen.length }
        : q.url === '/v1/refunds' ? { id: 're_1', status: 'succeeded' } : { id: 'x' };
      s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(out));
    });
  }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_GROWTH: 'price_g', STRIPE_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
  // The host pays the setup fee and first month, which puts their booking site live.
  await t.call('/app/billing/start', { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const plan = seen.filter(x => x.path === '/v1/checkout/sessions').pop();
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_plan', customer: 'cus_host', metadata: { workspace: plan.body.get('metadata[workspace]'), kind: 'plan', plan: 'Growth' } } } });
});
test.after(() => { t.stop(); mock.close(); });

function hook(event) {
  const raw = JSON.stringify(event), ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex');
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig } });
}

test('host connects Stripe through Connect onboarding', async () => {
  const go = await t.call('/app/stripe/connect'); assert.equal(go.status, 302); assert.match(go.headers.get('location'), /connect\.stripe\.test/);
  const back = await t.call('/app/stripe/return'); assert.equal(back.status, 302);
  const s = (await t.call('/api/state')).body.state; assert.equal(s.integrations.find(i => i.id === 'stripe').connected, true);
});

let bookingId, session;
test('a guest booking goes to Stripe Checkout and holds the dates', async () => {
  const { p, slug } = await t.home();
  const r = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(30), checkOut: t.dateIn(33), adults: 2, name: 'Pat Guest', email: 'pat@example.co.uk' } }) });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  assert.match(j.checkoutUrl, /checkout\.stripe\.test/);
  bookingId = j.bookingId;
  const call = seen.filter(x => x.path === '/v1/checkout/sessions').pop();
  session = 'cs_test_' + (seen.indexOf(call) + 1); WS = call.body.get('metadata[workspace]');
  assert.equal(call.body.get('payment_intent_data[transfer_data][destination]'), 'acct_test1', 'money goes to the host');
  assert.equal(call.body.get('line_items[0][price_data][currency]'), 'gbp');
  const b = (await t.call('/api/state')).body.state.bookings.find(x => x.id === bookingId);
  assert.equal(b.status, 'pending'); assert.equal(b.paid, false);
});

test('webhooks need a valid signature', async () => {
  const bad = await t.call('/webhooks/stripe', { body: JSON.stringify({ type: 'checkout.session.completed' }), headers: { 'stripe-signature': 't=1,v1=00' } });
  assert.equal(bad.status, 400);
});

test('a paid checkout confirms the booking', async () => {
  const r = await hook({ type: 'checkout.session.completed', data: { object: { id: session, payment_intent: 'pi_123', amount_total: 50000, metadata: { workspace: WS, booking: bookingId, kind: 'booking' } } } });
  assert.equal(r.status, 200);
  const b = await t.until(async () => { const x = (await t.call('/api/state')).body.state.bookings.find(y => y.id === bookingId); return x && x.paid ? x : null; });
  assert.ok(b, 'booking marked paid'); assert.equal(b.status, 'confirmed');
});

test('cancelling a paid booking refunds the card', async () => {
  const r = await t.act('cancelBooking', bookingId); assert.equal(r.status, 200);
  const refund = await t.until(async () => seen.find(x => x.path === '/v1/refunds'));
  assert.ok(refund, 'refund requested from Stripe'); assert.equal(refund.body.get('payment_intent'), 'pi_123');
});
