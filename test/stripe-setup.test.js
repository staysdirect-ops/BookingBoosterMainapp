// The one-off Stripe setup script against a stand-in Stripe API: creates prices and both webhooks, and reuses them on a second run.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const { execFile } = require('node:child_process');
const path = require('node:path');

const prices = [], products = [], hooks = [], posts = [];
let mock;
test.before(() => { mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
  const u = new URL(q.url, 'http://x'), f = new URLSearchParams(raw), send = o => { s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify(o)); };
  if (q.method === 'POST') posts.push(u.pathname + ' ' + raw);
  if (u.pathname === '/v1/prices' && q.method === 'GET') return send({ data: prices.filter(p => p.lookup_key === u.searchParams.get('lookup_keys[0]')) });
  if (u.pathname === '/v1/prices') { const p = { id: 'price_' + prices.length, lookup_key: f.get('lookup_key'), unit_amount: +f.get('unit_amount'), interval: f.get('recurring[interval]'), tax: f.get('tax_behavior') }; prices.push(p); return send(p); }
  if (u.pathname === '/v1/products' && q.method === 'GET') return send({ data: products });
  if (u.pathname === '/v1/products') { const p = { id: 'prod_' + products.length, metadata: { bb_plan: f.get('metadata[bb_plan]') } }; products.push(p); return send(p); }
  if (u.pathname === '/v1/webhook_endpoints' && q.method === 'GET') return send({ data: hooks });
  if (u.pathname === '/v1/webhook_endpoints') { const h = { id: 'we_' + hooks.length, url: f.get('url'), description: f.get('description'), connect: f.get('connect') === 'true', secret: 'whsec_' + hooks.length }; hooks.push(h); return send(h); }
  send({});
}); }).listen(0); });
test.after(() => mock.close());

const run = () => new Promise(res => execFile(process.execPath, [path.join(__dirname, '..', 'scripts', 'stripe-setup.js')], { env: Object.assign({}, process.env, { STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_API_BASE: 'http://localhost:' + mock.address().port, BASE_URL: 'https://app.example.co.uk', DATA_DIR: require('node:os').tmpdir() + '/bb-setup' }) }, (e, out, err) => res({ code: e ? e.code : 0, out, err })));

test('creates monthly and yearly prices and the setup fee with VAT included, and both webhooks', async () => {
  const r = await run(); assert.equal(r.code, 0, r.err);
  assert.equal(prices.length, 5); assert.ok(prices.every(p => p.tax === 'inclusive'));
  const amt = k => prices.find(p => p.lookup_key === k).unit_amount;
  assert.equal(amt('bb_growth_month_200'), 20000); assert.equal(amt('bb_growth_year_2000'), 200000); assert.equal(amt('bb_calendar_sync_year_180'), 18000);
  const setup = prices.find(p => p.lookup_key === 'bb_setup_once_997'); assert.equal(setup.unit_amount, 99700); assert.equal(setup.interval, null); assert.match(r.out, /STRIPE_PRICE_SETUP=price_\d/);
  assert.equal(hooks.length, 2); assert.ok(hooks.some(h => h.connect)); assert.ok(hooks.every(h => h.url === 'https://app.example.co.uk/webhooks/stripe'));
  assert.match(r.out, /STRIPE_PRICE_GROWTH_ANNUAL=price_\d/); assert.match(r.out, /STRIPE_CONNECT_WEBHOOK_SECRET=whsec_/);
  const again = await run(); assert.equal(again.code, 0); assert.equal(prices.length, 5); assert.equal(products.length, 3); assert.equal(hooks.length, 2);
  assert.match(again.out, /already existed/);
});
