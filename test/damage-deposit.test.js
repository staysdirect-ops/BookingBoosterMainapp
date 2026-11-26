// Damage deposits: the guest saves a card at check-in, and the host can charge up to £200 of it for damage,
// paid out to the host's own Stripe account. Against a stand-in Stripe API with signed webhooks.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

const SECRET = 'whsec_dmg';
const calls = []; let decline = false, mock, t, WS, slug, bid, n = 0;
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const body = new URLSearchParams(raw); calls.push({ method: q.method, path: q.url, body }); let out = { id: 'x' }, code = 200;
    if (q.url === '/v1/checkout/sessions') { const id = 'cs_dmg_' + (++n); out = { id, url: 'https://checkout.stripe.test/' + id }; }
    else if (q.url === '/v1/accounts') out = { id: 'acct_dmg' };
    else if (q.url === '/v1/account_links') out = { url: 'https://connect.stripe.test/onboard' };
    else if (q.url.startsWith('/v1/accounts/acct_dmg')) out = { id: 'acct_dmg', charges_enabled: true, payouts_enabled: true, details_submitted: true, external_accounts: { data: [] } };
    else if (q.url.startsWith('/v1/setup_intents/seti_dmg')) out = { id: 'seti_dmg', customer: 'cus_guest', payment_method: 'pm_guest' };
    else if (q.url === '/v1/payment_intents') { if (decline) { code = 402; out = { error: { code: 'card_declined', message: 'Your card was declined.' } }; } else out = { id: 'pi_dmg_' + calls.length, status: 'succeeded' }; }
    s.writeHead(code, { 'content-type': 'application/json' }); s.end(JSON.stringify(out));
  }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_dmg', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_GROWTH: 'price_g', STRIPE_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
  WS = calls.find(x => x.path === '/v1/checkout/sessions').body.get('metadata[workspace]');
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_plan', customer: 'cus_host', metadata: { workspace: WS, kind: 'plan', plan: 'Growth' } } } });
  await t.call('/app/stripe/connect'); await t.call('/app/stripe/return');
  const h = await t.home(); slug = h.slug;
  const r = await (await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: h.p.id, checkIn: t.dateIn(5), checkOut: t.dateIn(8), adults: 2, name: 'Dee Guest', email: 'dee@guest.co.uk' } }) })).json();
  bid = r.bookingId;
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_book', payment_intent: 'pi_book', amount_total: 50000, payment_status: 'paid', metadata: { workspace: WS, booking: bid, kind: 'booking' } } } });
});
test.after(() => { t.stop(); mock.close(); });
function hook(ev) { const raw = JSON.stringify(ev), ts = Math.floor(Date.now() / 1000);
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex') } }); }
const booking = async () => (await t.call('/api/state')).body.state.bookings.find(x => x.id === bid);
const charges = () => calls.filter(x => x.path === '/v1/payment_intents');

test('no card saved yet: the host cannot charge for damage', async () => {
  const r = await t.act('chargeDamage', bid, 50, 'Broken lamp'); assert.equal(r.body.result.ok, false);
  assert.equal(charges().length, 0);
});

test('once the guest saves a card, the host charges it for damage and the money goes to the host', async () => {
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_dep', setup_intent: 'seti_dmg', metadata: { workspace: WS, booking: bid, kind: 'deposit' } } } });
  assert.equal((await booking()).deposit, 'held');
  assert.equal((await t.act('chargeDamage', bid, 250, 'Too much')).body.result.ok, false, 'never more than the £200 deposit');
  assert.equal((await t.act('chargeDamage', bid, 50, '')).body.result.ok, false, 'a reason is needed');
  const r = await t.act('chargeDamage', bid, 50, 'Broken lamp'); assert.equal(r.body.result.ok, true);
  const c = await t.until(() => charges()[0]); assert.ok(c, 'Stripe was asked to charge the card');
  assert.equal(c.body.get('amount'), '5000'); assert.equal(c.body.get('customer'), 'cus_guest'); assert.equal(c.body.get('payment_method'), 'pm_guest');
  assert.equal(c.body.get('off_session'), 'true'); assert.equal(c.body.get('confirm'), 'true');
  assert.equal(c.body.get('transfer_data[destination]'), 'acct_dmg'); assert.equal(c.body.get('on_behalf_of'), 'acct_dmg');
  const d = await t.until(async () => { const b = await booking(); return b.damage && b.damage[0].status === 'paid' ? b.damage[0] : null; });
  assert.ok(d, 'marked charged'); assert.equal(d.amount, 50);
  assert.equal((await t.sql("SELECT amount FROM payments WHERE kind = 'damage' AND booking_id = ?", bid))[0].amount, 5000);
  assert.ok(await t.until(async () => (await t.sql("SELECT count(*)::int AS n FROM outbox WHERE meta LIKE '%damage-charge%' AND recipient = 'dee@guest.co.uk'"))[0].n === 1), 'the guest is told');
});

test('a declined card is shown as failed and does not use up the deposit', async () => {
  decline = true;
  assert.equal((await t.act('chargeDamage', bid, 150, 'Stained sofa')).body.result.ok, true);
  const d = await t.until(async () => { const b = await booking(); return b.damage[1] && b.damage[1].status === 'failed' ? b.damage[1] : null; });
  assert.ok(d); assert.match(d.error, /declined/);
  decline = false;
  assert.equal((await t.act('chargeDamage', bid, 151, 'Stained sofa')).body.result.ok, false, '£150 is left after the £50 charge');
  assert.equal((await t.act('chargeDamage', bid, 150, 'Stained sofa')).body.result.ok, true);
  assert.ok(await t.until(async () => (await booking()).damage[2].status === 'paid'));
  assert.equal((await t.act('chargeDamage', bid, 1, 'More')).body.result.ok, false, 'the whole £200 is used');
});
