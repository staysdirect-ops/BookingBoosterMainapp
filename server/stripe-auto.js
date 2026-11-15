// Stripe prices and webhooks: created for you. Used two ways:
//  - scripts/stripe-setup.js (run by hand, prints the lines to add as secrets);
//  - the live server: once STRIPE_SECRET_KEY is set, the background tick creates the prices and both webhooks itself and keeps
//    their ids and signing secrets in the kv table (config:stripe), so nothing has to be copied by hand. Environment variables,
//    when set, always win over what is kept there. A different key (test to live, or another account) sets everything up again.
'use strict';
const crypto = require('crypto');

// One plan: a one-off £997 setup fee, first month free, then £200 a month. The calendar sync add-on is £15 a month on top.
const PLANS = [
  ['GROWTH', 'Bookingbooster Growth', 200],
  ['CALENDAR_SYNC', 'Bookingbooster calendar sync add-on', 15],
];
const SETUP_FEE = 997;
const PLATFORM_EVENTS = ['checkout.session.completed', 'checkout.session.expired', 'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.paid'];
const CONNECT_EVENTS = ['account.updated'];

// Creates (or finds) everything. Returns { prices: { STRIPE_PRICE_...: id }, webhookSecret, connectWebhookSecret, endpoints }.
// recreate: an endpoint that already exists has a signing secret Stripe will not show again, so with recreate it is replaced.
async function setup(stripe, baseUrl, { recreate } = {}) {
  // The amount is part of the lookup key, so changing a price creates a new Stripe price instead of reusing the old one.
  async function price(env, product, amount, interval) {
    const lookup = 'bb_' + env.toLowerCase() + '_' + interval + '_' + amount;
    const found = await stripe.api('GET', '/prices', { lookup_keys: [lookup], active: true, limit: 1 });
    if (found.data && found.data[0]) return found.data[0].id;
    return (await stripe.api('POST', '/prices', Object.assign({ product, currency: 'gbp', unit_amount: amount * 100, tax_behavior: 'inclusive', lookup_key: lookup, nickname: lookup }, interval === 'once' ? {} : { recurring: { interval } }))).id;
  }
  async function product(env, name) {
    const prods = await stripe.api('GET', '/products', { active: true, limit: 100 });
    const prod = (prods.data || []).find(p => p.metadata && p.metadata.bb_plan === env);
    return prod || stripe.api('POST', '/products', { name, tax_code: 'txcd_10103001', metadata: { bb_plan: env } }); // SaaS, business use
  }
  async function endpoint(url, events, connect) {
    const description = connect ? 'Bookingbooster Connect events' : 'Bookingbooster platform events';
    const all = await stripe.api('GET', '/webhook_endpoints', { limit: 100 });
    const ex = (all.data || []).find(e => e.url === url && e.description === description);
    if (ex && !recreate) { await stripe.api('POST', '/webhook_endpoints/' + ex.id, { enabled_events: events }); return { id: ex.id, secret: null }; }
    if (ex) await stripe.api('DELETE', '/webhook_endpoints/' + ex.id);
    const e = await stripe.api('POST', '/webhook_endpoints', Object.assign({ url, enabled_events: events, description }, connect ? { connect: true } : {}));
    return { id: e.id, secret: e.secret };
  }

  const prices = {};
  for (const [env, name, monthly] of PLANS) {
    const prod = await product(env, name);
    prices['STRIPE_PRICE_' + env] = await price(env, prod.id, monthly, 'month');
    // yearly: plans are 10 months' price (2 months free); the add-on is 12 × £15
    prices['STRIPE_PRICE_' + env + '_ANNUAL'] = await price(env, prod.id, env === 'CALENDAR_SYNC' ? monthly * 12 : monthly * 10, 'year');
  }
  // The setup fee is a one-off price, charged at checkout; the plan itself starts after a free month.
  prices.STRIPE_PRICE_SETUP = await price('SETUP', (await product('SETUP', 'Bookingbooster setup')).id, SETUP_FEE, 'once');
  const url = baseUrl + '/webhooks/stripe';
  const a = await endpoint(url, PLATFORM_EVENTS, false), b = await endpoint(url, CONNECT_EVENTS, true);
  return { prices, webhookSecret: a.secret, connectWebhookSecret: b.secret, endpoints: [a.id, b.id] };
}

// The live server side: fills cfg.stripe from the kv table and creates what is missing.
function auto({ cfg, stripe, db, log }) {
  const get = db.prepare('SELECT v FROM kv WHERE k = ?'), set = db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)');
  const KEY = 'config:stripe';
  // Which Stripe key this was made with (a hash, never the key): a new key means a new setup.
  const fp = () => crypto.createHash('sha256').update(String(cfg.stripe.key || '')).digest('hex').slice(0, 16);
  const mode = () => /^(sk|rk)_live_/.test(cfg.stripe.key || '') ? 'live' : 'test';
  const P = { STRIPE_PRICE_GROWTH: 'Growth', STRIPE_PRICE_GROWTH_ANNUAL: 'GrowthAnnual', STRIPE_PRICE_CALENDAR_SYNC: 'addon', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'addonAnnual', STRIPE_PRICE_SETUP: 'setup' };
  const read = async () => { const r = await get.get(KEY); try { return r ? JSON.parse(r.v) : null; } catch (_) { return null; } };
  const complete = s => !!(s && s.fp === fp() && s.prices && s.webhookSecret && s.connectWebhookSecret);
  // Only fills what the environment left empty.
  function apply(s) {
    if (!s || s.fp !== fp()) return;
    for (const [k, name] of Object.entries(P)) if (!cfg.stripe.prices[name] && s.prices && s.prices[k]) cfg.stripe.prices[name] = s.prices[k];
    if (!cfg.stripe.webhookSecret && s.webhookSecret) cfg.stripe.webhookSecret = s.webhookSecret;
    if (!cfg.stripe.connectWebhookSecret && s.connectWebhookSecret) cfg.stripe.connectWebhookSecret = s.connectWebhookSecret;
  }
  let loaded = null;
  function load() {
    if (!stripe.enabled) return Promise.resolve();
    if (!loaded) loaded = read().then(apply).catch(e => { loaded = null; log('stripe config', e.message); });
    return loaded;
  }
  // Run from the tick. Retries a failed setup at most every 30 minutes.
  async function ensure(t = Date.now()) {
    if (!stripe.enabled) return null;
    const s = await read();
    if (complete(s)) { apply(s); return s; }
    if (s && s.fp === fp() && s.error && t - (s.at || 0) < 30 * 60e3) return s;
    const envDone = cfg.stripe.webhookSecret && cfg.stripe.connectWebhookSecret && Object.values(P).every(n => cfg.stripe.prices[n]);
    if (envDone) return null; // set by hand in the environment: nothing to do
    try {
      const r = await setup(stripe, cfg.baseUrl, { recreate: true });
      const saved = { fp: fp(), mode: mode(), at: t, prices: r.prices, webhookSecret: r.webhookSecret, connectWebhookSecret: r.connectWebhookSecret, endpoints: r.endpoints };
      await set.run(KEY, JSON.stringify(saved)); apply(saved); log('stripe', 'Prices and webhooks set up in ' + mode() + ' mode');
      return saved;
    } catch (e) {
      log('stripe setup', e.message);
      await set.run(KEY, JSON.stringify({ fp: fp(), mode: mode(), at: t, error: e.message }));
      return { error: e.message };
    }
  }
  // For the team page: what is on, without any secret.
  async function status() {
    if (!stripe.enabled) return { on: false };
    const s = await read(); apply(s);
    const p = cfg.stripe.prices;
    return { on: true, mode: mode(), prices: !!(p.Growth && p.setup && p.addon), webhooks: !!(cfg.stripe.webhookSecret && cfg.stripe.connectWebhookSecret), error: s && s.fp === fp() ? s.error || '' : '', at: s && s.at };
  }
  return { load, ensure, status };
}

module.exports = { setup, auto, PLATFORM_EVENTS, CONNECT_EVENTS };
