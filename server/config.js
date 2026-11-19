// All settings come from environment variables (see .env.example). Every outside service is optional:
// without its keys the app runs in test mode and says so in the console.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Load .env if present (simple KEY=VALUE lines, no dependency).
const envFile = path.join(__dirname, '..', '.env');
if (typeof Deno === 'undefined' && fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const E = process.env;
const num = (v, d) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) && n >= 0 ? n : d; };
// The Stripe key under another name (for example a secret added as PAYMENT_GATEWAY_API): any setting holding a Stripe secret key.
const stripeKeyName = E.STRIPE_SECRET_KEY ? 'STRIPE_SECRET_KEY' : (Object.keys(E).find(k => /^(sk|rk)_(live|test)_\S{10,}$/.test(String(E[k] || '').trim())) || '');
// On Supabase (an Edge Function) there is no disk to keep things on: the database and Storage hold everything.
const SERVERLESS = typeof Deno !== 'undefined' || E.SERVERLESS === '1';
const SB_URL = E.SUPABASE_URL || '';
// The project's server key: the classic service_role key, or the newer secret key Supabase also passes to functions.
const SB_KEY = E.SUPABASE_SERVICE_ROLE_KEY || (() => { try { const k = JSON.parse(E.SUPABASE_SECRET_KEYS || '{}'); return k.default || Object.values(k)[0] || ''; } catch (_) { return ''; } })();
const DATA = SERVERLESS ? '/tmp/bookingbooster' : path.resolve(E.DATA_DIR || path.join(__dirname, '..', 'data'));
if (!SERVERLESS) fs.mkdirSync(DATA, { recursive: true });

// A stable secret for signing cookies and guest links. Generated once and kept in data/ if not set.
function secret() {
  if (E.APP_SECRET) return E.APP_SECRET;
  // On Supabase, derive it from the project's service key, which only the server holds.
  if (SERVERLESS) { if (!SB_KEY) throw new Error('Set APP_SECRET'); return crypto.createHmac('sha256', SB_KEY).update('bookingbooster app secret').digest('hex'); }
  const f = path.join(DATA, '.secret');
  if (!fs.existsSync(f)) fs.writeFileSync(f, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  return fs.readFileSync(f, 'utf8').trim();
}

const port = +(E.PORT || 8080);
module.exports = {
  port,
  baseUrl: (E.BASE_URL || (SERVERLESS ? 'https://booking-booster.co.uk' : 'http://localhost:' + port)).replace(/\/$/, ''),
  // Host sites get their own subdomain on this domain, for example larch-fell.bookingbooster.site
  sitesDomain: (E.SITES_DOMAIN || '').toLowerCase(),
  dataDir: DATA,
  serverless: SERVERLESS,
  supabaseUrl: SB_URL,
  // Postgres: Supabase gives SUPABASE_DB_URL to its functions. Without a URL an embedded copy lives in DATA_DIR/pg.
  dbUrl: E.DATABASE_URL || E.SUPABASE_DB_URL || '',
  dbDir: E.DB_MEMORY === '1' ? '' : path.join(DATA, 'pg'),
  storage: SB_URL && SB_KEY && (SERVERLESS || E.USE_SUPABASE_STORAGE === '1') ? { url: SB_URL, key: SB_KEY, bucket: E.STORAGE_BUCKET || 'files' } : null,
  jobsKey: E.JOBS_KEY || '',
  secret: secret(),
  secureCookies: /^https:/.test(E.BASE_URL || (SERVERLESS ? 'https:' : '')),
  testClock: E.ALLOW_TEST_CLOCK === '1', // tests only: lets /admin/leads/run move the lead-email clock forward
  // A host's own domain: what their DNS should point at (defaults to the BASE_URL host), plus Fly.io certificates
  domains: { target: E.CUSTOM_DOMAIN_TARGET || '', ips: (E.CUSTOM_DOMAIN_IPS || '').split(',').map(x => x.trim()).filter(Boolean), flyToken: E.FLY_API_TOKEN || '', flyApp: E.FLY_APP_NAME || '',
    get fakeDns() { try { return E.ALLOW_TEST_CLOCK === '1' && E.DNS_FAKE_FILE ? JSON.parse(require('fs').readFileSync(E.DNS_FAKE_FILE, 'utf8')) : null; } catch (_) { return {}; } } },
  legalReviewed: /^\d{4}-\d{2}-\d{2}$/.test(E.LEGAL_REVIEWED || '') ? E.LEGAL_REVIEWED : '', // the date a solicitor signed off /privacy and /terms
  backupKeep: Math.max(1, +(E.BACKUP_KEEP || 14)),
  leads: { from: E.LEADS_FROM || '', signoff: E.LEADS_SIGNOFF || 'The Bookingbooster team' },
  company: { name: E.COMPANY_NAME || 'Bookingbooster Ltd', address: E.COMPANY_ADDRESS || 'Registered address to be confirmed', number: E.COMPANY_NUMBER || '', vat: E.VAT_NUMBER || '', support: E.SUPPORT_EMAIL || 'help@booking-booster.co.uk' },
  email: { apiBase: E.EMAIL_API_BASE, provider: E.RESEND_API_KEY ? 'resend' : E.POSTMARK_TOKEN ? 'postmark' : null, resendKey: E.RESEND_API_KEY, postmarkToken: E.POSTMARK_TOKEN, from: E.EMAIL_FROM || 'Bookingbooster <hello@booking-booster.co.uk>', guestFromDomain: E.GUEST_EMAIL_DOMAIN || 'mail.booking-booster.co.uk' },
  sms: { apiBase: E.SMS_API_BASE, sid: E.TWILIO_ACCOUNT_SID, token: E.TWILIO_AUTH_TOKEN, from: E.TWILIO_FROM },
  stripe: { apiBase: E.STRIPE_API_BASE, key: stripeKeyName ? String(E[stripeKeyName]).trim() : undefined, keyName: stripeKeyName, webhookSecret: E.STRIPE_WEBHOOK_SECRET, connectWebhookSecret: E.STRIPE_CONNECT_WEBHOOK_SECRET, prices: { Growth: E.STRIPE_PRICE_GROWTH, addon: E.STRIPE_PRICE_CALENDAR_SYNC,
    GrowthAnnual: E.STRIPE_PRICE_GROWTH_ANNUAL, addonAnnual: E.STRIPE_PRICE_CALENDAR_SYNC_ANNUAL }, feePct: +(E.STRIPE_APPLICATION_FEE_PCT || 0) },
  ai: { openai: E.OPENAI_API_KEY, openaiModel: E.OPENAI_MODEL || 'gpt-4o-mini', gemini: E.GEMINI_API_KEY, geminiModel: E.GEMINI_MODEL || 'gemini-2.0-flash', perplexity: E.PERPLEXITY_API_KEY, perplexityModel: E.PERPLEXITY_MODEL || 'sonar', anthropic: E.ANTHROPIC_API_KEY, anthropicBase: E.ANTHROPIC_API_BASE, anthropicModel: E.ANTHROPIC_MODEL || 'claude-sonnet-5-5', studioModel: E.ANTHROPIC_STUDIO_MODEL || 'claude-opus-5-5', studioEffort: E.ANTHROPIC_STUDIO_EFFORT || 'medium', serpapi: E.SERPAPI_KEY },
  // Event ads: our own event finder reads public what's-on and course pages in the background (server/studio/crawler.js).
  events: { crawl: E.EVENT_CRAWL !== 'off', seeds: E.EVENT_SEEDS || '' }, // EVENT_SEEDS: off, or a path to another starter list
  // AI credit: what each plan includes a month, in pounds, and how AI usage is priced (see server/credits.js).
  credits: { enabled: E.AI_CREDITS !== 'off', monthly: num(E.AI_CREDIT_MONTHLY, 50), demo: num(E.AI_CREDIT_DEMO, 1), markup: num(E.AI_CREDIT_MARKUP, 1), usdToGbp: num(E.AI_USD_TO_GBP, 0.79), lowWarning: num(E.AI_CREDIT_LOW, 5) },
  // Google Search Console for host sites, through Bookingbooster's own service account (see server/google-search.js).
  google: { serviceAccount: E.GOOGLE_SERVICE_ACCOUNT_JSON, oauthUrl: E.GOOGLE_OAUTH_URL, apiBase: E.GOOGLE_API_BASE },
  nuki: { token: E.NUKI_API_TOKEN },
  admins: String(E.ADMIN_EMAILS || '').toLowerCase().split(/[\s,]+/).filter(Boolean),
  // Partner programme (server/affiliates.js): share of every payment, how long a link is remembered, how long commission
  // is held for refunds, and the smallest payout (pence).
  affiliate: { rate: Math.max(0, Math.min(100, +(E.AFFILIATE_RATE || 25))), cookieDays: Math.max(1, +(E.AFFILIATE_COOKIE_DAYS || 90)), holdDays: Math.max(0, +(E.AFFILIATE_HOLD_DAYS || 30)), minPayout: Math.round(Math.max(0, +(E.AFFILIATE_MIN_PAYOUT || 50)) * 100) },
  icalEveryMin: +(E.ICAL_SYNC_MINUTES || 10),
};
