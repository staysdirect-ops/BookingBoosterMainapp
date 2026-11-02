// Launch check: says which settings are still missing before real hosts and guests use the app.
// Run `npm run preflight` (reads .env or the environment). The server also logs this on start in production.
'use strict';

function check(cfg, E) {
  const out = [];
  const add = (area, ok, need, must = true) => out.push({ area, ok: !!ok, need, must });
  const https = /^https:\/\//.test(cfg.baseUrl);
  add('Web address', https && !/localhost/.test(cfg.baseUrl), 'BASE_URL set to the https address, e.g. https://booking-booster.co.uk');
  add('Secret', (E.APP_SECRET || '').length >= 32, 'APP_SECRET set to a long random value (64 hex characters)');
  add('Team access', cfg.admins.length, 'ADMIN_EMAILS with at least one team email');
  add('Company', !/to be confirmed/i.test(cfg.company.address) && cfg.company.number, 'COMPANY_ADDRESS and COMPANY_NUMBER (shown in email footers and the legal pages)');
  add('VAT', cfg.company.vat, 'VAT_NUMBER, if you are VAT registered (prices are shown inc. VAT)', false);
  add('Email', cfg.email.provider, 'RESEND_API_KEY or POSTMARK_TOKEN, with your sending domain verified there');
  add('Stripe', cfg.stripe.key && /^sk_live_/.test(cfg.stripe.key), 'STRIPE_SECRET_KEY (a live sk_live_ key)');
  add('Stripe webhooks', cfg.stripe.webhookSecret && cfg.stripe.connectWebhookSecret, 'STRIPE_WEBHOOK_SECRET and STRIPE_CONNECT_WEBHOOK_SECRET (npm run stripe-setup prints both)');
  const p = cfg.stripe.prices;
  add('Plan prices', p.Growth && p.setup && p.addon, 'STRIPE_PRICE_GROWTH, STRIPE_PRICE_SETUP and STRIPE_PRICE_CALENDAR_SYNC (npm run stripe-setup creates them)');
  add('Annual prices', p.GrowthAnnual && p.addonAnnual, 'STRIPE_PRICE_*_ANNUAL for the yearly option the pricing page offers (npm run stripe-setup creates them)');
  add('No commission', !cfg.stripe.feePct, 'STRIPE_APPLICATION_FEE_PCT left at 0, because the site and billing page promise no commission');
  add('Texts', cfg.sms.sid && cfg.sms.token && cfg.sms.from, 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM, for text messages to guests', false);
  add('Free site addresses', cfg.sitesDomain, 'SITES_DOMAIN, e.g. bookingbooster.site, with a wildcard DNS record', false);
  add('Own domains', cfg.domains.flyToken && cfg.domains.flyApp ? true : !E.FLY_APP_NAME, 'FLY_API_TOKEN and FLY_APP_NAME, so hosts\' own domains get certificates', false);
  add('Legal review', cfg.legalReviewed, 'LEGAL_REVIEWED=YYYY-MM-DD once a solicitor has signed off /privacy and /terms');
  add('AI checks', cfg.ai.openai || cfg.ai.gemini || cfg.ai.perplexity || cfg.ai.serpapi, 'At least one of OPENAI_API_KEY, GEMINI_API_KEY, PERPLEXITY_API_KEY or SERPAPI_KEY', false);
  add('Reply drafts', cfg.ai.anthropic, 'ANTHROPIC_API_KEY, for suggested replies in the inbox', false);
  return out;
}

if (require.main === module) {
  const cfg = require('./config');
  const rows = check(cfg, process.env);
  for (const r of rows) console.log((r.ok ? '  ok   ' : r.must ? '  NEED ' : '  opt  ') + r.area.padEnd(20) + (r.ok ? '' : r.need));
  const missing = rows.filter(r => r.must && !r.ok).length;
  console.log(missing ? '\n' + missing + ' required setting' + (missing === 1 ? '' : 's') + ' missing. See LAUNCH.md.' : '\nReady for launch.');
  process.exitCode = missing ? 1 : 0;
}
module.exports = { check };
