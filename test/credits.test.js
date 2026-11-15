// AI credit: £50 a month comes with the plan, AI actions are charged at token cost, they stop at zero, and Stripe top-ups
// from £10 to £20,000 add credit that rolls over. Runs against stand-ins for the Messages API and Stripe.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');
const Credits = require('../server/credits');

const pure = Credits({ cfg: { credits: { enabled: true, monthly: 50, demo: 1, markup: 1, usdToGbp: 0.8, lowWarning: 5 }, stripe: {} }, db: { prepare: () => ({}) } });

test('cost is tokens × the model price, in pounds', () => {
  // Sonnet 5.5: $2 in, $10 out per million. 1M in + 1M out = $12 = £9.60 at 0.8.
  assert.equal(pure.cost('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 1e6 }) / pure.UNIT, 9.6);
  // Opus 5.5 with cache: 1M cache read at $0.20 and 1M cache write at 1.25 × $4.
  assert.equal(pure.cost('claude-opus-5-5', { cache_read_input_tokens: 1e6, cache_creation_input_tokens: 1e6 }) / pure.UNIT, (0.2 + 5) * 0.8);
  assert.ok(pure.cost('some-new-model', { output_tokens: 1e6 }) >= pure.cost('claude-opus-5-5', { output_tokens: 1e6 }), 'unknown models are never undercharged');
  assert.ok(pure.cost('claude-sonnet-5-5', { input_tokens: 10 }) >= 1, 'a tiny call still costs something');
});

test('the billing month runs from the plan start date', () => {
  const anchor = Date.UTC(2026, 0, 31, 10); // 31 January
  assert.equal(pure.periodOf(anchor, Date.UTC(2026, 1, 27)).n, 0);
  assert.equal(pure.periodOf(anchor, Date.UTC(2026, 1, 28, 11)).n, 1, 'short months end on their last day');
  assert.equal(new Date(pure.periodOf(anchor, Date.UTC(2026, 2, 5)).end).toISOString().slice(0, 10), '2026-03-31');
});

test('top-up amounts are whole pounds from £10 to £20,000', () => {
  assert.equal(pure.topupAmount('10'), 10); assert.equal(pure.topupAmount('£20,000'), 20000); assert.equal(pure.topupAmount(75), 75);
  for (const bad of ['9', '20001', '12.50', '', 'abc', '-50']) assert.equal(pure.topupAmount(bad), null, bad);
});

/* ---- a host using AI until the credit runs out (card billing off, so the plan counts as paid) ---- */
let claude, a;
test.before(async () => {
  // Every draft "uses" 4M output tokens on Sonnet 5.5: $40, about £31.60.
  claude = http.createServer((q, s) => { q.resume(); q.on('end', () => { s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ model: 'claude-sonnet-5-5', content: [{ type: 'text', text: 'Yes, parking is on the drive.' }], usage: { input_tokens: 0, output_tokens: 4e6 } })); }); }).listen(0);
  a = await start({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_API_BASE: 'http://localhost:' + claude.address().port, ADMIN_EMAILS: 'host@example.co.uk', AI_USD_TO_GBP: '0.79' });
  await a.signup();
});
test.after(() => { a.stop(); claude.close(); });

async function guestThread(t) {
  const { p, slug } = await t.home();
  const r = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(20), checkOut: t.dateIn(23), adults: 2, name: 'Jo Guest', email: 'jo@example.co.uk' } }) });
  const bid = (await r.json()).bookingId;
  const th = await t.act('openThread', (await t.call('/api/state')).body.state.bookings.find(b => b.id === bid).guestId, bid);
  const tid = th.body.result.id;
  const link = (await t.call('/api/trip-link', { body: { bookingId: bid } })).body.url; const k = new URL(link).searchParams.get('k');
  await fetch(t.base + '/api/public/' + slug + '/trip/' + encodeURIComponent(bid) + '/act?k=' + k, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'sendMessage', args: [tid, 'guest', 'Is there parking?'] }) });
  return tid;
}

test('£50 a month, used by AI actions, then AI stops until there is more credit', async () => {
  let c = (await a.call('/api/credits')).body;
  assert.equal(c.included, 50); assert.equal(c.balance, 50); assert.equal(c.empty, false);
  const tid = await guestThread(a);

  assert.match((await a.call('/api/suggest', { body: { threadId: tid } })).body.text, /parking/);
  c = (await a.call('/api/credits')).body;
  assert.equal(c.balance.toFixed(2), '18.40'); assert.equal(c.byFeature[0].feature, 'reply'); assert.equal(c.recent[0].tokensOut, 4e6);

  await a.call('/api/suggest', { body: { threadId: tid } }); // takes it below zero
  c = (await a.call('/api/credits')).body; assert.equal(c.empty, true); assert.equal(c.balance, 0); assert.ok(c.topup < 0, 'the overdraft is remembered');

  const blocked = (await a.call('/api/suggest', { body: { threadId: tid } })).body;
  assert.equal(blocked.text, null); assert.equal(blocked.credit.empty, true); assert.match(blocked.credit.message, /run out.*Top up from £10/);
  assert.match((await a.call('/app/billing')).body, /Your AI credit has run out/);

  // the team adds goodwill credit from /admin; it covers the overdraft first
  const added = await a.call('/admin/credits/' + (await a.sql("SELECT id FROM workspaces WHERE kind = 'live'"))[0].id, { body: 'pounds=20', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  assert.match(added.body, /Added £20.00 of AI credit/); assert.match(added.body, /AI credit left/);
  c = (await a.call('/api/credits')).body; assert.equal(c.empty, false); assert.equal(c.balance.toFixed(2), '6.80');
  assert.ok((await a.call('/api/suggest', { body: { threadId: tid } })).body.text);
});

test('the allowance comes back next billing month; top-ups carry over', async () => {
  await a.sql('UPDATE ai_credit SET anchor = anchor - ?', 40 * 864e5); await a.sql('UPDATE ai_ledger SET created_at = created_at - ?', 40 * 864e5);
  const c = (await a.call('/api/credits')).body;
  assert.equal(c.includedLeft, 50); assert.equal(c.usedThisMonth, 0);
  assert.equal(c.balance.toFixed(2), (50 + c.topup).toFixed(2)); assert.ok(c.topup < 0, 'last month\'s overdraft still counts');
});

/* ---- buying top-ups through Stripe ---- */
let stripeMock, b; const sessions = [];
test.before(async () => {
  stripeMock = http.createServer((q, s) => { let raw = ''; q.on('data', x => raw += x); q.on('end', () => { if (q.url === '/v1/checkout/sessions') sessions.push(new URLSearchParams(raw)); s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"cs_' + sessions.length + '","url":"https://checkout.stripe.test/cs_' + sessions.length + '"}'); }); }).listen(0);
  b = await start({ STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: 'http://localhost:' + stripeMock.address().port, STRIPE_PRICE_GROWTH: 'price_g', STRIPE_PRICE_SETUP: 'price_s', STRIPE_WEBHOOK_SECRET: 'whsec_c' });
  await b.signup();
});
test.after(() => { b.stop(); stripeMock.close(); });

const form = v => ({ body: new URLSearchParams(v).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
async function hook(t, obj) {
  const raw = JSON.stringify({ type: 'checkout.session.completed', data: { object: obj } });
  const ts = Math.floor(Date.now() / 1000), sig = crypto.createHmac('sha256', 'whsec_c').update(ts + '.' + raw).digest('hex');
  return t.call('/webhooks/stripe', { body: raw, headers: { 'stripe-signature': 't=' + ts + ',v1=' + sig } });
}

test('a host who has not paid gets no allowance; paying the plan brings the full £50', async () => {
  let c = (await b.call('/api/credits')).body; assert.equal(c.included, 0); assert.equal(c.empty, true);
  const wid = (await b.sql("SELECT id FROM workspaces WHERE kind = 'live'"))[0].id;
  await hook(b, { id: 'cs_plan', customer: 'cus_1', payment_status: 'paid', metadata: { workspace: wid, kind: 'plan', plan: 'Growth' } });
  c = (await b.call('/api/credits')).body; assert.equal(c.included, 50); assert.equal(c.balance, 50);
});

test('top-ups from £10 to £20,000 go through Stripe Checkout and are added once', async () => {
  const page = (await b.call('/app/billing')).body;
  assert.match(page, /id="ai-credit"/); assert.match(page, /£50.00 left/); assert.match(page, /value="20000"|£20,000/);

  for (const bad of [{ amount: '5' }, { custom: '20001' }, { custom: '12.50' }]) {
    const r = await b.call('/app/billing/topup', form(bad)); assert.equal(r.status, 302); assert.match(r.headers.get('location'), /msg=topup/);
  }
  const n = sessions.length;
  let r = await b.call('/app/billing/topup', form({ amount: '25' }));
  assert.equal(r.headers.get('location'), 'https://checkout.stripe.test/cs_' + (n + 1));
  const s = sessions[n];
  assert.equal(s.get('mode'), 'payment'); assert.equal(s.get('line_items[0][price_data][unit_amount]'), '2500'); assert.equal(s.get('line_items[0][price_data][currency]'), 'gbp');
  assert.equal(s.get('metadata[kind]'), 'credit'); assert.equal(s.get('customer'), 'cus_1', 'billed to the host\'s own Stripe customer');

  r = await b.call('/app/billing/topup', form({ amount: '25', custom: '20,000' })); // a typed amount wins over the preset
  assert.equal(sessions[n + 1].get('line_items[0][price_data][unit_amount]'), '2000000');

  const wid = s.get('metadata[workspace]');
  const paid = { id: 'cs_t1', customer: 'cus_1', amount_total: 2500, payment_status: 'paid', metadata: { workspace: wid, kind: 'credit', pounds: '25' } };
  assert.equal((await hook(b, { ...paid, id: 'cs_unpaid', payment_status: 'unpaid' })).status, 200);
  assert.equal((await b.call('/api/credits')).body.balance, 50, 'nothing added before the money arrives');
  await hook(b, paid); await hook(b, paid); // Stripe can send an event twice
  const c = (await b.call('/api/credits')).body; assert.equal(c.balance, 75); assert.equal(c.topup, 25);
  assert.equal(c.recent.filter(x => x.kind === 'topup').length, 1);
});
