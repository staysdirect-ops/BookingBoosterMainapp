// Partner programme: anyone joins at /partners, their link or code credits the hosts they send, and they earn 25% of
// every payment those hosts make (the first plan payment and every renewal), with refunds taken back and payouts marked by the team.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

let mock, t, admin, partner, code, hostA;
const DAY = 864e5;
test.before(async () => {
  // Stripe stand-in: only the invoice lookup that newer API versions need for refunds.
  mock = http.createServer((q, s) => { const u = new URL(q.url, 'http://x'); s.writeHead(200, { 'content-type': 'application/json' });
    s.end(JSON.stringify(u.pathname === '/v1/invoice_payments' && u.searchParams.get('payment[payment_intent]') === 'pi_new' ? { data: [{ invoice: 'in_new' }] } : { data: [] })); }).listen(0);
  t = await start({ ADMIN_EMAILS: 'host@example.co.uk', STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: 'http://localhost:' + mock.address().port, STRIPE_WEBHOOK_SECRET: 'whsec_a', STRIPE_CONNECT_WEBHOOK_SECRET: 'whsec_c',
    STRIPE_PRICE_GROWTH: 'p1', STRIPE_PRICE_GROWTH_ANNUAL: 'p2', STRIPE_PRICE_CALENDAR_SYNC: 'p3', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'p4', STRIPE_PRICE_SETUP: 'p5' });
  await t.signup(); admin = t.cookie; // the team's own account, not referred
});
test.after(() => { t.stop(); mock.close(); });

const raw = (p, o = {}) => fetch(t.base + p, Object.assign({ redirect: 'manual' }, o));
const post = (p, data, cookie) => raw(p, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: cookie || '' }, body: new URLSearchParams(data).toString() });
const setCookie = (r, name) => (r.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const hook = async ev => { const body = JSON.stringify(ev), ts = Math.floor(Date.now() / 1000), sig = crypto.createHmac('sha256', 'whsec_a').update(ts + '.' + body).digest('hex');
  const r = await raw('/webhooks/stripe', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': 't=' + ts + ',v1=' + sig }, body }); assert.equal(r.status, 200); };
const wsOf = async email => (await t.sql('SELECT workspace_id FROM users WHERE email = ?', email))[0].workspace_id;
const comm = async id => (await t.sql('SELECT * FROM commissions WHERE id = ?', id))[0];
const hostSignup = (email, cookie, ref) => t.call('/api/signup', { headers: { cookie: cookie || '' }, body: { account: { name: 'Ref Host', email, password: 'correcthorse1' }, property: { name: 'Dune House', nightly: 150 }, ref } });

test('anyone can join and gets their own link and code', async () => {
  const r = await post('/partners/join', { name: 'Priya Shah', email: 'priya@example.com', password: 'partnerpass1', agree: 'on' });
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/partners/dashboard');
  partner = setCookie(r, 'bb_aff'); assert.ok(partner);
  const dash = await (await raw('/partners/dashboard', { headers: { cookie: partner } })).text();
  code = dash.match(/\/r\/([a-z0-9]+)/)[1]; assert.match(code, /^priya\d{3}$/);
  assert.match(dash, /25%/); assert.match(dash, /Nobody yet/);
  assert.equal((await t.sql("SELECT count(*)::int AS n FROM outbox WHERE recipient = 'priya@example.com'"))[0].n, 1, 'welcome email with the link');
  assert.equal((await post('/partners/join', { name: 'Priya', email: 'PRIYA@example.com', password: 'partnerpass1', agree: 'on' })).status, 400, 'one account per email');
  assert.equal((await raw('/partners/dashboard')).headers.get('location'), '/partners/login', 'signed in only');
  const again = await post('/partners/login', { email: 'priya@example.com', password: 'partnerpass1' }); assert.equal(again.status, 302); assert.ok(setCookie(again, 'bb_aff'));
  assert.equal((await post('/partners/login', { email: 'priya@example.com', password: 'wrong-password' })).status, 401);
});

test('the link is remembered for 90 days and credits the host who signs up', async () => {
  const r = await raw('/r/' + code + '?to=/pricing');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/pricing');
  const ref = r.headers.getSetCookie().find(c => c.startsWith('bb_ref=')); assert.match(ref, /Max-Age=7776000/); assert.match(ref, /HttpOnly/);
  await raw('/r/' + code); // the same visitor again the same day: one click
  assert.equal((await t.sql('SELECT sum(n)::int AS n FROM aff_clicks'))[0].n, 1);
  const q = await raw('/start?plan=growth&ref=' + code.toUpperCase()); assert.equal(q.headers.get('location'), '/start?plan=growth'); assert.ok(setCookie(q, 'bb_ref'));
  assert.equal(setCookie(await raw('/r/nobody123'), 'bb_ref'), '', 'an unknown code sets nothing');
  const startPage = await (await raw('/start', { headers: { cookie: 'bb_ref=' + code } })).text(); assert.match(startPage, new RegExp('"ref":"' + code + '"'), 'the code shows on the sign-up form');
  assert.equal((await hostSignup('a@example.co.uk', 'bb_ref=' + code)).status, 200);
  hostA = await wsOf('a@example.co.uk');
  const [row] = await t.sql('SELECT r.how, a.code FROM referrals r JOIN affiliates a ON a.id = r.affiliate_id WHERE r.workspace_id = ?', hostA);
  assert.deepEqual(row, { how: 'link', code });
  assert.ok((await t.sql("SELECT subject FROM outbox WHERE recipient = 'priya@example.com'")).some(m => /referred just joined/.test(m.subject)));
});

test('a typed code wins over the cookie, a mistyped one is refused, and nobody can refer themselves', async () => {
  const other = await post('/partners/join', { name: 'Tom Reed', email: 'tom@example.com', password: 'partnerpass1', agree: 'on' });
  const tomCode = (await (await raw('/partners/dashboard', { headers: { cookie: setCookie(other, 'bb_aff') } })).text()).match(/\/r\/([a-z0-9]+)/)[1];
  const bad = await hostSignup('typo@example.co.uk', 'bb_ref=' + code, 'tomm999'); assert.equal(bad.status, 400); assert.match(bad.body.error, /referral code/);
  assert.equal((await hostSignup('b@example.co.uk', 'bb_ref=' + code, ' ' + tomCode.toUpperCase())).status, 200);
  assert.equal((await t.sql('SELECT a.code, r.how FROM referrals r JOIN affiliates a ON a.id = r.affiliate_id WHERE r.workspace_id = ?', await wsOf('b@example.co.uk')))[0].code, tomCode);
  assert.equal((await hostSignup('priya@example.com', 'bb_ref=' + code)).status, 200);
  assert.equal((await t.sql('SELECT * FROM referrals WHERE workspace_id = ?', await wsOf('priya@example.com'))).length, 0, 'no self-referral');
});

test('25% of the first payment and of every plan payment after it, recorded once', async () => {
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_setup', amount_paid: 20000, billing_reason: 'subscription_create', customer: 'cus_a', charge: 'ch_setup', subscription_details: { metadata: { workspace: hostA, kind: 'plan' } } } } });
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_setup', amount_paid: 20000, billing_reason: 'subscription_create', customer: 'cus_a', charge: 'ch_setup', subscription_details: { metadata: { workspace: hostA, kind: 'plan' } } } } }); // Stripe retries
  const c = await comm('stripe:in_setup'); assert.equal(c.amount, 5000); assert.equal(c.kind, 'plan'); assert.equal(c.gross, 20000);
  // checkout completes and links the Stripe customer; later invoices carry only the customer
  await hook({ type: 'checkout.session.completed', data: { object: { id: 'cs_a', customer: 'cus_a', metadata: { workspace: hostA, kind: 'plan', plan: 'Growth' } } } });
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_m1', amount_paid: 20000, billing_reason: 'subscription_cycle', customer: 'cus_a', charge: 'ch_m1' } } });
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_new', amount_paid: 20000, billing_reason: 'subscription_cycle', customer: 'cus_a', parent: { subscription_details: { metadata: { workspace: hostA } } } } } });
  assert.equal((await comm('stripe:in_m1')).amount, 5000); assert.equal((await comm('stripe:in_m1')).kind, 'plan');
  assert.equal((await comm('stripe:in_new')).amount, 5000, 'newer Stripe API shape');
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_free', amount_paid: 0, billing_reason: 'subscription_cycle', customer: 'cus_a' } } });
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_team', amount_paid: 99700, billing_reason: 'subscription_create', subscription_details: { metadata: { workspace: await wsOf('host@example.co.uk') } } } } });
  assert.equal(await comm('stripe:in_free'), undefined); assert.equal(await comm('stripe:in_team'), undefined, 'hosts nobody referred earn nothing');
});

test('refunds and lost chargebacks take the same share back', async () => {
  await hook({ type: 'charge.refunded', data: { object: { id: 'ch_m1', invoice: 'in_m1', amount: 20000, amount_refunded: 10000 } } });
  let c = await comm('stripe:in_m1'); assert.equal(c.reversed, 2500); assert.equal(c.note, 'Part refunded');
  await hook({ type: 'charge.refunded', data: { object: { id: 'ch_m1', invoice: 'in_m1', amount: 20000, amount_refunded: 20000 } } });
  assert.equal((await comm('stripe:in_m1')).reversed, 5000);
  await hook({ type: 'charge.refunded', data: { object: { id: 'ch_x', payment_intent: 'pi_new', amount: 20000, amount_refunded: 20000 } } }); // no invoice on the charge
  assert.equal((await comm('stripe:in_new')).reversed, 5000);
  await hook({ type: 'charge.dispute.closed', data: { object: { id: 'dp_1', charge: 'ch_setup', amount: 20000, status: 'won' } } });
  assert.equal((await comm('stripe:in_setup')).reversed, 0, 'a won dispute changes nothing');
});

test('commission is on hold for 30 days, then the team pays it and marks it paid', async () => {
  let dash = await (await raw('/partners/dashboard', { headers: { cookie: partner } })).text();
  assert.match(dash, /£50\.00 on hold|£50\.00<\/div><small[^>]*>on hold/); assert.match(dash, /on hold until/); assert.match(dash, /Host 1/); assert.doesNotMatch(dash, /Ref Host|a@example\.co\.uk/, 'no host names');
  assert.equal((await raw('/admin/affiliates', { headers: { cookie: partner } })).status, 404, 'team only');
  await t.sql('UPDATE commissions SET clears_at = ?', Date.now() - DAY);
  const page = await (await raw('/admin/affiliates', { headers: { cookie: admin } })).text();
  assert.match(page, /Due £50\.00/);
  const id = (await t.sql('SELECT id FROM affiliates WHERE code = ?', code))[0].id;
  assert.equal((await post('/admin/affiliates/payout', { id, amount: '60', reference: 'BB-1' }, admin)).status, 400, 'not more than is due');
  assert.equal((await post('/admin/affiliates/payout', { id, amount: '50.00', reference: 'BB-1' }, admin)).status, 200);
  dash = await (await raw('/partners/dashboard', { headers: { cookie: partner } })).text();
  assert.match(dash, /£50\.00<\/div><small[^>]*>paid to you/); assert.match(dash, /BB-1/);
  assert.ok((await t.sql("SELECT subject FROM outbox WHERE recipient = 'priya@example.com'")).some(m => m.subject === 'We have paid you £50.00'));
  assert.equal((await post('/partners/details', { name: 'Priya Shah', payout: 'P Shah 12-34-56 12345678' }, partner)).status, 200);
  assert.match(await (await raw('/admin/affiliates', { headers: { cookie: admin } })).text(), /12-34-56 12345678/);
});

test('bank transfers the team records earn commission too, and a refund after payout comes off the next one', async () => {
  assert.equal((await post('/admin/affiliates/bank', { workspace: hostA, amount: '200.00', kind: 'plan', reference: 'HOSTA-DEC' }, admin)).status, 200);
  assert.equal((await post('/admin/affiliates/bank', { workspace: hostA, amount: '200.00', kind: 'plan', reference: 'HOSTA-DEC' }, admin)).status, 200);
  const rows = await t.sql("SELECT * FROM commissions WHERE source = 'bank'"); assert.equal(rows.length, 1); assert.equal(rows[0].amount, 5000);
  // the setup payment, already paid out, is refunded in full
  await hook({ type: 'charge.refunded', data: { object: { id: 'ch_setup', amount: 20000, amount_refunded: 20000 } } });
  const id = (await t.sql('SELECT id FROM affiliates WHERE code = ?', code))[0].id;
  assert.match(await (await raw('/admin/affiliates', { headers: { cookie: admin } })).text(), /Due -£50\.00/);
  assert.equal((await post('/admin/affiliates/reverse', { id: rows[0].id }, admin)).status, 200);
  assert.equal((await comm(rows[0].id)).reversed, 5000);
  assert.ok(id);
});

test('a paused partner stops earning, and the team can link a host by hand', async () => {
  const id = (await t.sql('SELECT id FROM affiliates WHERE code = ?', code))[0].id;
  await post('/admin/affiliates/status', { id, status: 'paused' }, admin);
  assert.equal(setCookie(await raw('/r/' + code), 'bb_ref'), '');
  await hook({ type: 'invoice.paid', data: { object: { id: 'in_m2', amount_paid: 20000, billing_reason: 'subscription_cycle', customer: 'cus_a' } } });
  assert.equal(await comm('stripe:in_m2'), undefined);
  await post('/admin/affiliates/status', { id, status: 'active' }, admin);
  assert.equal((await post('/admin/affiliates/link', { host: 'host@example.co.uk', code }, admin)).status, 200);
  assert.equal((await t.sql('SELECT how FROM referrals WHERE workspace_id = ?', await wsOf('host@example.co.uk')))[0].how, 'team');
  assert.equal((await post('/admin/affiliates/link', { host: 'a@example.co.uk', code }, admin)).status, 400, 'a host keeps their first partner');
});
