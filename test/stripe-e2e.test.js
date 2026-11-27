// End to end through Stripe's API shape (a stand-in server, signed webhooks): host sign-up, checkout, activation,
// the welcome and "site is live" emails, a failed renewal, cancellation and restarting, then guest card payments.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

const SECRET = 'whsec_e2e';
const calls = [], sessions = {};
let mock, t, WS, n = 0;
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const body = new URLSearchParams(raw); calls.push({ method: q.method, path: q.url, body });
    let out = { id: 'x' };
    if (q.url === '/v1/checkout/sessions') { const id = 'cs_e2e_' + (++n); const md = {}; for (const [k, v] of body) { const m = /^metadata\[(\w+)\]$/.exec(k); if (m) md[m[1]] = v; }
      sessions[id] = { id, status: 'open', mode: body.get('mode'), metadata: md }; out = { id, url: 'https://checkout.stripe.test/' + id }; }
    else if (q.url.startsWith('/v1/checkout/sessions/')) out = sessions[q.url.split('/').pop().split('?')[0]] || { error: { message: 'No such session' } };
    else if (q.url === '/v1/accounts') out = { id: 'acct_e2e' };
    else if (q.url === '/v1/account_links') out = { url: 'https://connect.stripe.test/onboard' };
    else if (q.url.startsWith('/v1/accounts/acct_e2e')) out = { id: 'acct_e2e', charges_enabled: true, payouts_enabled: true, details_submitted: true, external_accounts: { data: [{ bank_name: 'Test Bank', last4: '6789' }] } };
    else if (q.url === '/v1/billing_portal/sessions') out = { url: 'https://billing.stripe.test/p' };
    else if (q.url === '/v1/refunds') out = { id: 're_e2e', status: 'succeeded' };
    else if (q.url.startsWith('/v1/invoices/')) out = { id: 'in_e2e', payment_intent: { payment_method: { card: { brand: 'visa', last4: '0341' } }, last_payment_error: { decline_code: 'card_declined' } } };
    s.writeHead(out.error ? 404 : 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(out));
  }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_WEBHOOK_SECRET: SECRET, STRIPE_PRICE_GROWTH: 'price_g', STRIPE_PRICE_CALENDAR_SYNC: 'price_a', STRIPE_API_BASE: 'http://localhost:' + mock.address().port });
});
test.after(() => { t.stop(); mock.close(); });

const hook = event => { const raw = JSON.stringify(Object.assign({ id: 'evt_' + crypto.randomUUID() }, event)), ts = Math.floor(Date.now() / 1000);
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + crypto.createHmac('sha256', SECRET).update(ts + '.' + raw).digest('hex') } }); };
const count = async (where, ...a) => (await t.sql('SELECT count(*)::int AS n FROM outbox WHERE ' + where, ...a))[0].n;
const status = async () => (await t.sql('SELECT billing_status FROM workspaces WHERE id = ?', WS))[0].billing_status;
const form = { body: '', headers: { 'content-type': 'application/x-www-form-urlencoded' } };

let slug, planSession;
test('sign-up goes to a subscription checkout, and the site stays offline until it is paid', async () => {
  const r = await t.signup(); assert.equal(r.status, 200);
  planSession = r.body.redirect.split('/').pop(); assert.equal(sessions[planSession].mode, 'subscription'); WS = sessions[planSession].metadata.workspace;
  assert.equal(sessions[planSession].metadata.kind, 'plan');
  slug = (await t.sql('SELECT slug FROM workspaces WHERE id = ?', WS))[0].slug;
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 503);
  assert.equal(await status(), 'trial');
});

test('the return from Checkout and the webhook racing each other send one welcome and one "site is live"', async () => {
  Object.assign(sessions[planSession], { status: 'complete', customer: 'cus_e2e' });
  const ev = { type: 'checkout.session.completed', data: { object: Object.assign({}, sessions[planSession], { payment_status: 'paid' }) } };
  const [done, wh] = await Promise.all([t.call('/app/pay/done?session=' + planSession), hook(ev)]);
  assert.equal(done.headers.get('location'), '/app?welcome=1'); assert.equal(wh.status, 200);
  assert.equal(await status(), 'active');
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 503, 'paid, but still building until the site checklist is done');
  await new Promise(r => setTimeout(r, 800)); assert.equal(await count("meta LIKE '%site-live%'"), 0, 'no "site is live" email while it is building');
  await t.finish();
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 200, 'site is live to guests');
  await t.until(async () => await count("meta LIKE '%site-live%'") > 0);
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(await count("subject = 'Welcome to Bookingbooster'"), 1, 'one welcome email');
  assert.equal(await count("meta LIKE '%site-live%'"), 1, 'one "site is live" email');
  assert.equal((await hook(ev)).status, 200, 'Stripe retrying the same event is fine');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await count("subject = 'Welcome to Bookingbooster'"), 1);
});

test('a failed renewal marks the account and emails the host, and paying clears it', async () => {
  const now = Math.floor(Date.now() / 1000);
  await hook({ type: 'invoice.payment_failed', data: { object: { id: 'in_e2e', customer: 'cus_e2e', amount_due: 20000, billing_reason: 'subscription_cycle', created: now, next_payment_attempt: now + 3 * 86400 } } });
  assert.equal(await status(), 'past_due');
  assert.ok(await t.until(async () => await count("subject LIKE 'Action needed%'") === 1), 'payment failed email');
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 200, 'site stays up while Stripe retries');
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_e2e2', customer: 'cus_e2e' } } });
  assert.equal(await status(), 'active');
});

test('the first payment failing at checkout does not send a failed-payment email', async () => {
  const before = await count("subject LIKE 'Action needed%'");
  await hook({ type: 'invoice.payment_failed', data: { object: { id: 'in_first', customer: 'cus_e2e', billing_reason: 'subscription_create' } } });
  await new Promise(r => setTimeout(r, 300));
  assert.equal(await count("subject LIKE 'Action needed%'"), before);
});

test('billing opens the Stripe portal for a paying host', async () => {
  const r = await t.call('/app/billing/portal', form); assert.equal(r.headers.get('location'), 'https://billing.stripe.test/p');
});

test('cancelling the plan takes the site offline and lets the host restart it', async () => {
  await hook({ type: 'customer.subscription.deleted', data: { object: { id: 'sub_e2e', customer: 'cus_e2e' } } });
  assert.equal(await status(), 'cancelled');
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 503, 'a cancelled site is offline to guests');
  assert.equal((await t.call('/app')).headers.get('location'), '/app/pay', 'console asks them to restart the plan');
  assert.match((await t.call('/app/billing')).body, /action="\/app\/billing\/start"/, 'billing offers a restart');
  const r = await t.call('/app/billing/start', form); assert.match(r.headers.get('location') || '', /checkout\.stripe\.test/, 'restart goes to a new checkout');
  const sid = r.headers.get('location').split('/').pop(); assert.equal(calls.filter(x => x.path === '/v1/checkout/sessions').pop().body.get('customer'), 'cus_e2e', 'restart keeps the same Stripe customer');
  Object.assign(sessions[sid], { status: 'complete', customer: 'cus_e2e' });
  const welcomes = await count("subject = 'Welcome to Bookingbooster'");
  await hook({ type: 'checkout.session.completed', data: { object: Object.assign({}, sessions[sid], { payment_status: 'paid' }) } });
  assert.equal(await status(), 'active');
  assert.equal((await fetch(t.base + '/s/' + slug + '/')).status, 200);
  await new Promise(r2 => setTimeout(r2, 500));
  assert.equal(await count("subject = 'Welcome to Bookingbooster'"), welcomes, 'no second welcome on a restart');
});

let bookingId, bookSession;
test('guest card booking: Connect, checkout to the host account, paid by webhook', async () => {
  assert.equal((await t.call('/app/stripe/connect')).status, 302); await t.call('/app/stripe/return');
  const { p } = await t.home();
  const r = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(40), checkOut: t.dateIn(43), adults: 2, name: 'Pat Guest', email: 'pat@example.co.uk' } }) });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j)); bookingId = j.bookingId; bookSession = j.checkoutUrl.split('/').pop();
  const c = calls.filter(x => x.path === '/v1/checkout/sessions').pop();
  assert.equal(c.body.get('payment_intent_data[transfer_data][destination]'), 'acct_e2e');
  const ev = { type: 'checkout.session.completed', data: { object: { id: bookSession, payment_intent: 'pi_e2e', amount_total: 42000, payment_status: 'paid', metadata: sessions[bookSession].metadata } } };
  await hook(ev); await hook(ev); // Stripe can send it twice
  const s = (await t.call('/api/state')).body.state; const b = s.bookings.find(x => x.id === bookingId);
  assert.equal(b.status, 'confirmed'); assert.equal(b.paid, true);
  assert.equal((await t.sql("SELECT status FROM payments WHERE id = ?", bookSession))[0].status, 'paid');
});

test('a guest who walks away: the expired checkout releases the dates', async () => {
  const { p } = await t.home();
  const r = await (await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(60), checkOut: t.dateIn(62), adults: 2, name: 'Sam Leaver', email: 'sam@example.co.uk' } }) })).json();
  const sid = r.checkoutUrl.split('/').pop();
  await hook({ type: 'checkout.session.expired', data: { object: { id: sid, metadata: sessions[sid].metadata } } });
  assert.equal((await t.call('/api/state')).body.state.bookings.find(x => x.id === r.bookingId).status, 'cancelled');
});

test('a payment that lands after the hold was released is not left charged and cancelled', async () => {
  const { p } = await t.home();
  const r = await (await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(70), checkOut: t.dateIn(72), adults: 2, name: 'Lou Late', email: 'lou@example.co.uk' } }) })).json();
  const sid = r.checkoutUrl.split('/').pop();
  await t.sql("UPDATE payments SET status = 'pending' WHERE id = ?", sid);
  // the 30 minute hold runs out (the scheduler releases it) a moment before Stripe's own 31 minute session expiry
  await hook({ type: 'checkout.session.expired', data: { object: { id: 'cs_other', metadata: sessions[sid].metadata } } });
  await hook({ type: 'checkout.session.completed', data: { object: { id: sid, payment_intent: 'pi_late', amount_total: 28000, payment_status: 'paid', metadata: sessions[sid].metadata } } });
  const b = (await t.call('/api/state')).body.state.bookings.find(x => x.id === r.bookingId);
  const refunded = calls.some(x => x.path === '/v1/refunds' && x.body.get('payment_intent') === 'pi_late');
  assert.ok((b.status === 'confirmed' && b.paid) || refunded, 'either the stay is confirmed again or the guest is refunded: got ' + b.status + ', refund ' + refunded);
});

test('a late payment for nights someone else has since booked is refunded', async () => {
  const { p } = await t.home();
  const book = async (name, email) => (await (await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(80), checkOut: t.dateIn(82), adults: 2, name, email } }) })).json());
  const a = await book('Ann Slow', 'ann@example.co.uk'); const sa = a.checkoutUrl.split('/').pop();
  await hook({ type: 'checkout.session.expired', data: { object: { id: 'cs_hold', metadata: sessions[sa].metadata } } });
  const b = await book('Bo Quick', 'bo@example.co.uk'); const sb = b.checkoutUrl.split('/').pop();
  await hook({ type: 'checkout.session.completed', data: { object: { id: sb, payment_intent: 'pi_bo', amount_total: 28000, payment_status: 'paid', metadata: sessions[sb].metadata } } });
  const ev = { type: 'checkout.session.completed', data: { object: { id: sa, payment_intent: 'pi_ann', amount_total: 28000, payment_status: 'paid', metadata: sessions[sa].metadata } } };
  await hook(ev); await hook(ev);
  const st = (await t.call('/api/state')).body.state;
  assert.equal(st.bookings.find(x => x.id === b.bookingId).status, 'confirmed', 'the second guest keeps the stay');
  assert.equal(st.bookings.find(x => x.id === a.bookingId).status, 'cancelled');
  assert.ok(await t.until(() => calls.some(x => x.path === '/v1/refunds' && x.body.get('payment_intent') === 'pi_ann')), 'the late payer is refunded');
  await new Promise(r => setTimeout(r, 500));
  assert.equal(calls.filter(x => x.path === '/v1/refunds' && x.body.get('payment_intent') === 'pi_ann').length, 1, 'refunded once, even though the event came twice');
});
