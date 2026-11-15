// The live server sets up Stripe by itself: once a key is set, the tick creates the prices and both webhooks,
// keeps them in the kv table, and the plan checkout uses them. A new key sets everything up again.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');

const prices = [], products = [], hooks = [], deleted = [], sessions = [], archived = [];
let mock;
test.before(() => new Promise(r => { mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
  const u = new URL(q.url, 'http://x'), f = new URLSearchParams(raw), send = o => { s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(o)); };
  if (u.pathname === '/v1/prices' && q.method === 'GET') return send({ data: prices.filter(p => p.lookup_key === u.searchParams.get('lookup_keys[0]')) });
  if (u.pathname === '/v1/prices') { const p = { id: 'price_' + prices.length, lookup_key: f.get('lookup_key') }; prices.push(p); return send(p); }
  if (u.pathname === '/v1/products' && q.method === 'GET') return send({ data: products });
  if (u.pathname === '/v1/products') { const p = { id: 'prod_' + products.length, metadata: { bb_plan: f.get('metadata[bb_plan]') } }; products.push(p); return send(p); }
  if (u.pathname === '/v1/webhook_endpoints' && q.method === 'GET') return send({ data: hooks });
  if (u.pathname.startsWith('/v1/webhook_endpoints/') && q.method === 'DELETE') { const id = u.pathname.split('/').pop(); deleted.push(id); hooks.splice(hooks.findIndex(h => h.id === id), 1); return send({ id, deleted: true }); }
  if (u.pathname === '/v1/webhook_endpoints') { const h = { id: 'we_' + (hooks.length + deleted.length), url: f.get('url'), description: f.get('description'), secret: 'whsec_' + (hooks.length + deleted.length) }; hooks.push(h); return send(h); }
  if (/^\/v1\/prices\/price_/.test(u.pathname) && q.method === 'POST') { archived.push(u.pathname.split('/').pop() + ' ' + raw); return send({}); }
  if (u.pathname === '/v1/balance') { if (/bad/.test(q.headers.authorization)) { s.writeHead(401, { 'content-type': 'application/json' }); return s.end(JSON.stringify({ error: { message: 'Invalid API Key provided' } })); } return send({ object: 'balance' }); }
  if (u.pathname === '/v1/checkout/sessions') { sessions.push(raw); return send({ id: 'cs_1', url: 'https://checkout.stripe.test/cs_1' }); }
  send({});
}); }).listen(0, r); }));
test.after(() => mock.close());

function fakeDb() {
  const kv = new Map();
  return { kv, prepare: sql => ({ get: async k => kv.has(k) ? { v: kv.get(k) } : undefined, run: async (k, v) => { kv.set(k, v); } }) };
}
const mk = (key, db) => {
  const cfg = { secret: 'test-secret', baseUrl: 'https://app.example.co.uk', stripe: { key, apiBase: 'http://localhost:' + mock.address().port, prices: {}, feePct: 0 } };
  const stripe = require('../server/stripe')(cfg);
  return { cfg, stripe, a: require('../server/stripe-auto').auto({ cfg, stripe, db, log: () => {} }) };
};

test('creates prices and webhooks on the tick, keeps them, and the plan checkout uses them', async () => {
  const db = fakeDb();
  const { cfg, stripe, a } = mk('sk_live_one', db);
  assert.deepEqual(await a.status(), { on: true, mode: 'live', prices: false, webhooks: false, error: '', at: undefined, canSave: false, last4: '_one', keyName: 'team page' });
  await a.ensure();
  assert.equal(hooks.length, 2); assert.ok(cfg.stripe.webhookSecret && cfg.stripe.connectWebhookSecret);
  assert.ok(cfg.stripe.prices.Growth && cfg.stripe.prices.addon && cfg.stripe.prices.GrowthAnnual);
  const saved = JSON.parse(db.kv.get('config:stripe')); assert.ok(!JSON.stringify(saved).includes('sk_live_one'));
  // a fresh server (cold start) loads the same values without calling Stripe
  const again = mk('sk_live_one', db); await again.a.load(); assert.equal(again.cfg.stripe.webhookSecret, cfg.stripe.webhookSecret); assert.equal(again.cfg.stripe.prices.addon, cfg.stripe.prices.addon);
  await again.a.ensure(); assert.equal(hooks.length, 2); assert.equal(deleted.length, 0);
  await stripe.subscribe({ customerEmail: 'h@x.co', plan: 'Growth', successUrl: 'https://a/ok', cancelUrl: 'https://a/no', meta: { workspace: 'w1', kind: 'plan' } });
  assert.match(decodeURIComponent(sessions[0]), new RegExp('line_items\\[0\\]\\[price\\]=' + cfg.stripe.prices.Growth));
  // a different key: the old endpoints are replaced, so the new signing secrets are known
  const other = mk('sk_live_two', db); await other.a.load(); assert.equal(other.cfg.stripe.webhookSecret, undefined);
  await other.a.ensure(); assert.equal(deleted.length, 2); assert.equal(hooks.length, 2); assert.ok(other.cfg.stripe.webhookSecret && other.cfg.stripe.webhookSecret !== cfg.stripe.webhookSecret);
  assert.ok((await other.a.status()).webhooks);
});

test('without a key nothing happens', async () => {
  const { a } = mk('', fakeDb());
  assert.equal(await a.ensure(), null); assert.deepEqual(await a.status(), { on: false, canSave: true });
});

test('a key saved from the team page is checked, kept encrypted, survives a cold start, and sets Stripe up', async () => {
  const db = fakeDb();
  const { cfg, stripe, a } = mk('', db);
  assert.equal(stripe.enabled, false); assert.equal((await a.status()).canSave, true);
  assert.match((await a.saveKey('hello')).error, /does not look like/);
  assert.match((await a.saveKey('sk_live_bad0000000000000')).error, /did not accept/); assert.equal(stripe.enabled, false);
  const before = hooks.length + deleted.length;
  const r = await a.saveKey('sk_live_good000000000000'); assert.equal(r.ok, true); assert.equal(r.mode, 'live');
  assert.ok(stripe.enabled && cfg.stripe.webhookSecret && cfg.stripe.prices.Growth); assert.ok(hooks.length + deleted.length > before);
  assert.ok(![...db.kv.values()].some(v => v.includes('sk_live_good')), 'the key is not stored in plain text');
  const cold = mk('', db); await cold.a.load(); assert.equal(cold.cfg.stripe.key, 'sk_live_good000000000000'); assert.equal(cold.cfg.stripe.webhookSecret, cfg.stripe.webhookSecret);
  const st = await cold.a.status(); assert.equal(st.last4, '0000'); assert.ok(st.prices && st.webhooks);
  // the environment's key wins and cannot be replaced from the page
  const env = mk('sk_live_env', db); assert.match((await env.a.saveKey('sk_live_other0000000000')).error, /already has/);
});

test('the old £997 setup fee price is archived once, not deleted', async () => {
  const db = fakeDb();
  const { cfg, a } = mk('sk_live_arch', db);
  await a.ensure(); const s = JSON.parse(db.kv.get('config:stripe')); s.prices.STRIPE_PRICE_SETUP = 'price_old997'; db.kv.set('config:stripe', JSON.stringify(s));
  await a.ensure(); assert.deepEqual(archived, ['price_old997 active=false']);
  assert.equal(JSON.parse(db.kv.get('config:stripe')).prices.STRIPE_PRICE_SETUP, undefined); assert.equal(cfg.stripe.prices.setup, undefined);
  await a.ensure(); assert.equal(archived.length, 1);
});
