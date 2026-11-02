// One-off Stripe setup: creates the plan prices (monthly and yearly, GBP, VAT included), the one-off setup fee and the two webhook
// endpoints, then prints the lines to add to your secrets. Safe to run again: it reuses what already exists.
//   STRIPE_SECRET_KEY=sk_live_... BASE_URL=https://booking-booster.co.uk npm run stripe-setup
'use strict';
const cfg = require('../server/config');
const stripe = require('../server/stripe')(cfg);

// One plan: a one-off £997 setup fee, first month free, then £200 a month. The calendar sync add-on is £15 a month on top.
const PLANS = [
  ['GROWTH', 'Bookingbooster Growth', 200],
  ['CALENDAR_SYNC', 'Bookingbooster calendar sync add-on', 15],
];
const SETUP_FEE = 997;
const PLATFORM_EVENTS = ['checkout.session.completed', 'checkout.session.expired', 'customer.subscription.deleted', 'invoice.payment_failed', 'invoice.paid'];
const CONNECT_EVENTS = ['account.updated'];

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
  if (ex) { await stripe.api('POST', '/webhook_endpoints/' + ex.id, { enabled_events: events }); return { id: ex.id, secret: null }; }
  const e = await stripe.api('POST', '/webhook_endpoints', Object.assign({ url, enabled_events: events, description }, connect ? { connect: true } : {}));
  return { id: e.id, secret: e.secret };
}

(async () => {
  if (!stripe.enabled) { console.error('Set STRIPE_SECRET_KEY first.'); process.exit(1); }
  if (!/^https:\/\//.test(cfg.baseUrl)) { console.error('Set BASE_URL to your https address first, so Stripe can reach the webhook.'); process.exit(1); }
  const lines = [];
  for (const [env, name, monthly] of PLANS) {
    const prod = await product(env, name);
    lines.push('STRIPE_PRICE_' + env + '=' + await price(env, prod.id, monthly, 'month'));
    // yearly: plans are 10 months' price (2 months free); the add-on is 12 × £15
    lines.push('STRIPE_PRICE_' + env + '_ANNUAL=' + await price(env, prod.id, env === 'CALENDAR_SYNC' ? monthly * 12 : monthly * 10, 'year'));
  }
  // The setup fee is a one-off price, charged at checkout; the plan itself starts after a free month.
  lines.push('STRIPE_PRICE_SETUP=' + await price('SETUP', (await product('SETUP', 'Bookingbooster setup')).id, SETUP_FEE, 'once'));
  const url = cfg.baseUrl + '/webhooks/stripe';
  const a = await endpoint(url, PLATFORM_EVENTS, false), b = await endpoint(url, CONNECT_EVENTS, true);
  lines.push(a.secret ? 'STRIPE_WEBHOOK_SECRET=' + a.secret : '# STRIPE_WEBHOOK_SECRET: endpoint ' + a.id + ' already existed; copy its signing secret from the Stripe dashboard');
  lines.push(b.secret ? 'STRIPE_CONNECT_WEBHOOK_SECRET=' + b.secret : '# STRIPE_CONNECT_WEBHOOK_SECRET: endpoint ' + b.id + ' already existed; copy its signing secret from the Stripe dashboard');
  console.log('\nAdd these to your secrets (fly secrets set ...):\n\n' + lines.join('\n') + '\n');
})().catch(e => { console.error('Stripe setup failed: ' + e.message); process.exit(1); });
