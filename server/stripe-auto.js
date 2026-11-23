// Stripe prices and webhooks: created for you. Used two ways:
//  - scripts/stripe-setup.js (run by hand, prints the lines to add as secrets);
//  - the live server: once STRIPE_SECRET_KEY is set, the background tick creates the prices and both webhooks itself and keeps
//    their ids and signing secrets in the kv table (config:stripe), so nothing has to be copied by hand. Environment variables,
//    when set, always win over what is kept there. A different key (test to live, or another account) sets everything up again.
'use strict';
const crypto = require('crypto');

// One plan: £197 a month, paid from the first month (no setup fee). The calendar sync add-on is £15 a month on top.
const PLANS = [
  ['GROWTH', 'Bookingbooster Growth', 197],
  ['CALENDAR_SYNC', 'Bookingbooster calendar sync add-on', 15],
];
const PLATFORM_EVENTS = ['checkout.session.completed', 'checkout.session.expired', 'customer.subscription.updated', 'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.paid', 'charge.refunded', 'charge.dispute.closed'];
const CONNECT_EVENTS = ['account.updated'];

// Creates (or finds) everything. Returns { prices: { STRIPE_PRICE_...: id }, webhookSecret, connectWebhookSecret, endpoints }.
// recreate: an endpoint that already exists has a signing secret Stripe will not show again, so with recreate it is replaced.
async function setup(stripe, baseUrl, { recreate } = {}) {
  async function endpoint(url, events, connect) {
    const description = connect ? 'Bookingbooster Connect events' : 'Bookingbooster platform events';
    const all = await stripe.api('GET', '/webhook_endpoints', { limit: 100 });
    const ex = (all.data || []).find(e => e.url === url && e.description === description);
    if (ex && !recreate) { await stripe.api('POST', '/webhook_endpoints/' + ex.id, { enabled_events: events }); return { id: ex.id, secret: null }; }
    if (ex) await stripe.api('DELETE', '/webhook_endpoints/' + ex.id);
    const e = await stripe.api('POST', '/webhook_endpoints', Object.assign({ url, enabled_events: events, description }, connect ? { connect: true } : {}));
    return { id: e.id, secret: e.secret };
  }

  const prices = await makePrices(stripe);
  const url = baseUrl + '/webhooks/stripe';
  const a = await endpoint(url, PLATFORM_EVENTS, false), b = await endpoint(url, CONNECT_EVENTS, true);
  return { prices, webhookSecret: a.secret, connectWebhookSecret: b.secret, endpoints: [a.id, b.id] };
}

// The plan amounts, kept with the saved setup: when they change, new Stripe prices are made for new sign-ups.
// Hosts already subscribed stay on the price they signed up at until it is changed for them in Stripe.
const AMOUNTS = PLANS.map(x => x[0] + '=' + x[2]).join(',');

// Creates (or finds) the monthly and yearly price of each plan.
async function makePrices(stripe) {
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

  const prices = {};
  for (const [env, name, monthly] of PLANS) {
    const prod = await product(env, name);
    prices['STRIPE_PRICE_' + env] = await price(env, prod.id, monthly, 'month');
    // yearly: plans are 10 months' price (2 months free); the add-on is 12 × £15
    prices['STRIPE_PRICE_' + env + '_ANNUAL'] = await price(env, prod.id, env === 'CALENDAR_SYNC' ? monthly * 12 : monthly * 10, 'year');
  }
  return prices;
}

// The live server side: fills cfg.stripe from the kv table and creates what is missing.
function auto({ cfg, stripe, db, log }) {
  const get = db.prepare('SELECT v FROM kv WHERE k = ?'), set = db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)');
  const KEY = 'config:stripe';
  // Which Stripe key this was made with (a hash, never the key): a new key means a new setup.
  const fp = () => crypto.createHash('sha256').update(String(cfg.stripe.key || '')).digest('hex').slice(0, 16);
  const mode = () => /^(sk|rk)_live_/.test(cfg.stripe.key || '') ? 'live' : 'test';
  const P = { STRIPE_PRICE_GROWTH: 'Growth', STRIPE_PRICE_GROWTH_ANNUAL: 'GrowthAnnual', STRIPE_PRICE_CALENDAR_SYNC: 'addon', STRIPE_PRICE_CALENDAR_SYNC_ANNUAL: 'addonAnnual' };
  const read = async () => { const r = await get.get(KEY); try { return r ? JSON.parse(r.v) : null; } catch (_) { return null; } };
  const complete = s => !!(s && s.fp === fp() && s.prices && s.webhookSecret && s.connectWebhookSecret);
  // Only fills what the environment left empty.
  function apply(s) {
    if (!s || s.fp !== fp()) return;
    for (const [k, name] of Object.entries(P)) if (!cfg.stripe.prices[name] && s.prices && s.prices[k]) cfg.stripe.prices[name] = s.prices[k];
    if (!cfg.stripe.webhookSecret && s.webhookSecret) cfg.stripe.webhookSecret = s.webhookSecret;
    if (!cfg.stripe.connectWebhookSecret && s.connectWebhookSecret) cfg.stripe.connectWebhookSecret = s.connectWebhookSecret;
  }
  // The key itself can be saved from the team page when it cannot go into the server's environment. It is kept encrypted
  // with a key derived from the server secret; the environment's STRIPE_SECRET_KEY, when set, always wins.
  const envKey = !!cfg.stripe.key;
  const box = crypto.createHash('sha256').update('bb-stripe-key:' + cfg.secret).digest();
  const seal = t => { const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', box, iv); const e = Buffer.concat([c.update(t, 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), e]).toString('base64'); };
  const unseal = b64 => { const b = Buffer.from(b64, 'base64'), d = crypto.createDecipheriv('aes-256-gcm', box, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); };
  async function loadKey() {
    if (envKey) return;
    const r = await get.get('config:stripe_key'); let k = '';
    try { k = r ? unseal(r.v) : ''; } catch (_) { log('stripe config', 'saved Stripe key could not be read'); }
    cfg.stripe.key = k || undefined;
  }
  let loaded = null;
  function load() {
    if (!loaded) loaded = loadKey().then(() => stripe.enabled ? read().then(apply) : null).catch(e => { loaded = null; log('stripe config', e.message); });
    return loaded;
  }
  // From the team page. Checks the key with Stripe before keeping it, then sets up prices and webhooks straight away.
  async function saveKey(k) {
    k = String(k || '').trim();
    if (envKey) return { error: 'This server already has STRIPE_SECRET_KEY in its settings, which wins over a saved key.' };
    if (!/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/.test(k)) return { error: 'That does not look like a Stripe secret key. It starts with sk_live_.' };
    const was = cfg.stripe.key; cfg.stripe.key = k;
    try { await stripe.api('GET', '/balance'); } catch (e) { cfg.stripe.key = was; return { error: 'Stripe did not accept that key: ' + e.message }; }
    await set.run('config:stripe_key', seal(k));
    // the prices and webhooks are made again for a new key; clear any plain values loaded for the old one
    if (was !== k) { const p = cfg.stripe.prices; for (const n of Object.values(P)) delete p[n]; delete cfg.stripe.webhookSecret; delete cfg.stripe.connectWebhookSecret; }
    loaded = Promise.resolve();
    const r = await ensure();
    return { ok: true, mode: mode(), setup: r || null };
  }
  // Run from the tick. Retries a failed setup at most every 30 minutes.
  async function ensure(t = Date.now()) {
    await load();
    if (!stripe.enabled) return null;
    const s = await read();
    if (complete(s)) {
      // The £997 setup fee was dropped: archive its old Stripe price once (kept in Stripe for past payments, never deleted).
      if (s.prices.STRIPE_PRICE_SETUP) {
        try { await stripe.api('POST', '/prices/' + s.prices.STRIPE_PRICE_SETUP, { active: false }); log('stripe', 'Archived the old setup fee price'); delete s.prices.STRIPE_PRICE_SETUP; await set.run(KEY, JSON.stringify(s)); }
        catch (e) { log('stripe archive', e.message); }
      }
      // The plan price changed (e.g. £200 to £197 a month): make the new prices once and use them for new checkouts.
      if (s.amounts !== AMOUNTS) {
        try {
          const was = s.prices, now = await makePrices(stripe);
          for (const [k, name] of Object.entries(P)) if (cfg.stripe.prices[name] && cfg.stripe.prices[name] === was[k]) delete cfg.stripe.prices[name];
          s.prices = Object.assign({}, was, now); s.amounts = AMOUNTS; await set.run(KEY, JSON.stringify(s)); log('stripe', 'New plan prices set up: ' + AMOUNTS);
        } catch (e) { log('stripe prices', e.message); }
      }
      // New events added since the endpoint was made (refunds, for the partner programme): add them to it once.
      if (s.events !== PLATFORM_EVENTS.join(',') && s.endpoints && s.endpoints[0]) {
        try { await stripe.api('POST', '/webhook_endpoints/' + s.endpoints[0], { enabled_events: PLATFORM_EVENTS }); s.events = PLATFORM_EVENTS.join(','); await set.run(KEY, JSON.stringify(s)); } catch (e) { log('stripe events', e.message); }
      }
      apply(s); return s;
    }
    if (s && s.fp === fp() && s.error && t - (s.at || 0) < 30 * 60e3) return s;
    const envDone = cfg.stripe.webhookSecret && cfg.stripe.connectWebhookSecret && Object.values(P).every(n => cfg.stripe.prices[n]);
    if (envDone) return null; // set by hand in the environment: nothing to do
    try {
      const r = await setup(stripe, cfg.baseUrl, { recreate: true });
      const saved = { fp: fp(), mode: mode(), at: t, amounts: AMOUNTS, events: PLATFORM_EVENTS.join(','), prices: r.prices, webhookSecret: r.webhookSecret, connectWebhookSecret: r.connectWebhookSecret, endpoints: r.endpoints };
      await set.run(KEY, JSON.stringify(saved)); apply(saved); log('stripe', 'Prices and webhooks set up in ' + mode() + ' mode' + (cfg.stripe.keyName ? ', key from ' + cfg.stripe.keyName : ''));
      return saved;
    } catch (e) {
      log('stripe setup', e.message);
      await set.run(KEY, JSON.stringify({ fp: fp(), mode: mode(), at: t, error: e.message }));
      return { error: e.message };
    }
  }
  // For the team page: what is on, without any secret.
  async function status() {
    await load();
    if (!stripe.enabled) return { on: false, canSave: !envKey };
    const s = await read(); apply(s);
    const p = cfg.stripe.prices;
    return { on: true, mode: mode(), prices: !!(p.Growth && p.addon), webhooks: !!(cfg.stripe.webhookSecret && cfg.stripe.connectWebhookSecret), error: s && s.fp === fp() ? s.error || '' : '', at: s && s.at, canSave: !envKey, last4: String(cfg.stripe.key).slice(-4), keyName: cfg.stripe.keyName || 'team page' };
  }
  return { load, ensure, status, saveKey };
}

module.exports = { setup, auto, PLATFORM_EVENTS, CONNECT_EVENTS };
