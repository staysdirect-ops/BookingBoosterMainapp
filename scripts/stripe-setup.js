// One-off Stripe setup: creates the plan prices (monthly and yearly, GBP, VAT included), the one-off setup fee and the two webhook
// endpoints, then prints the lines to add to your secrets. Safe to run again: it reuses what already exists.
//   STRIPE_SECRET_KEY=sk_live_... BASE_URL=https://booking-booster.co.uk npm run stripe-setup
// On the live Supabase server you do not need this: once STRIPE_SECRET_KEY is set, the server does the same by itself
// (see server/stripe-auto.js).
'use strict';
const cfg = require('../server/config');
const stripe = require('../server/stripe')(cfg);
const { setup } = require('../server/stripe-auto');

(async () => {
  if (!stripe.enabled) { console.error('Set STRIPE_SECRET_KEY first.'); process.exit(1); }
  if (!/^https:\/\//.test(cfg.baseUrl)) { console.error('Set BASE_URL to your https address first, so Stripe can reach the webhook.'); process.exit(1); }
  const r = await setup(stripe, cfg.baseUrl);
  const lines = Object.entries(r.prices).map(([k, v]) => k + '=' + v);
  lines.push(r.webhookSecret ? 'STRIPE_WEBHOOK_SECRET=' + r.webhookSecret : '# STRIPE_WEBHOOK_SECRET: endpoint ' + r.endpoints[0] + ' already existed; copy its signing secret from the Stripe dashboard');
  lines.push(r.connectWebhookSecret ? 'STRIPE_CONNECT_WEBHOOK_SECRET=' + r.connectWebhookSecret : '# STRIPE_CONNECT_WEBHOOK_SECRET: endpoint ' + r.endpoints[1] + ' already existed; copy its signing secret from the Stripe dashboard');
  console.log('\nAdd these to your secrets (fly secrets set ...):\n\n' + lines.join('\n') + '\n');
})().catch(e => { console.error('Stripe setup failed: ' + e.message); process.exit(1); });
