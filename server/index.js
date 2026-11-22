// Bookingbooster server. Node 22+ locally (embedded Postgres), or the Supabase function "bb" in production.
//   node server/index.js        then open http://localhost:8080
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cfg = require('./config');
const dbm = require('./db');
// Supabase Postgres when a database URL is set (the Edge Function passes postgres.js in), else embedded PGlite.
const db = dbm.open({ driver: cfg.dbUrl ? dbm.pgjs(globalThis.__bbPostgres || require('postgres'), cfg.dbUrl) : dbm.pglite(cfg.dbDir), migrate: !cfg.serverless });
const files = require('./files')(cfg);
const ws = require('./workspaces')(db, cfg);
const auth = require('./auth')(db, cfg);
const pages = require('./pages');
const seo = require('./seo');
const mkt = require('./marketing');
const answers = require('./answers');
const pub = require('./public');
const invoice = require('./invoice');
const ical = require('./ical');
const msg = require('./messaging')(db, cfg);
const stripe = require('./stripe')(cfg);
const ai = require('./ai')(cfg);
const { seedDemo } = require('./engine');

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const ROOT = path.join(__dirname, '..');
const MAIN_HOST = new URL(cfg.baseUrl).host;

/* ---------------- urls ---------------- */
const urls = {
  site(w, p) {
    const d = (w.domains || []).find(x => x.property_id === p.id && x.verified && !(cfg.sitesDomain && x.host.endsWith('.' + cfg.sitesDomain)));
    if (d) return 'https://' + d.host + '/';
    if (cfg.sitesDomain) return 'https://' + ws.siteSub(w, p) + '.' + cfg.sitesDomain + '/';
    return cfg.baseUrl + '/s/' + w.slug + '/' + p.id;
  },
  invoice(w, b) { return cfg.baseUrl + '/trip/' + w.slug + '/' + encodeURIComponent(b.id) + '/invoice?k=' + auth.sign('trip', w.id, b.id); },
  trip(w, b, step) { return cfg.baseUrl + '/trip/' + w.slug + '/' + encodeURIComponent(b.id) + '?k=' + auth.sign('trip', w.id, b.id) + (step ? '&step=' + step : ''); },
  track(w, kind, c, g) { return cfg.baseUrl + '/' + kind + '/' + w.slug + '/' + encodeURIComponent(c.id) + '/' + encodeURIComponent(g.id) + '/' + auth.sign(kind === 'c' ? 'click' : 'open', w.id, c.id + ':' + g.id) + (kind === 'o' ? '.gif' : ''); },
  unsub(w, g) { return cfg.baseUrl + '/u/' + w.slug + '/' + encodeURIComponent(g.id) + '/' + auth.sign('unsub', w.id, g.id); },
  ical(w, p) { return cfg.baseUrl + '/ical/' + w.slug + '/' + encodeURIComponent(p.id) + '/' + auth.sign('ical', w.id, p.id) + '.ics'; },
};

/* ---------------- payments ---------------- */
const payIns = db.prepare('INSERT OR REPLACE INTO payments (id, workspace_id, booking_id, kind, amount, status, provider_ref, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const payUpd = db.prepare('UPDATE payments SET status = ?, provider_ref = COALESCE(?, provider_ref), updated_at = ? WHERE id = ?');
const stripeReady = w => { const r = w.row; return !!(stripe.enabled && r && r.kind === 'live' && r.stripe_account && w.state.integrations.some(i => i.id === 'stripe' && i.connected)); };
async function payUrl(w, b, back) {
  if (!stripeReady(w)) return null;
  const r = w.row; const p = w.state.properties.find(x => x.id === b.propertyId); const g = w.state.guests.find(x => x.id === b.guestId);
  const s = await stripe.checkoutBooking({ account: r.stripe_account, booking: b, property: p, email: g && g.email, successUrl: urls.trip(w, b) + '&paid=1', cancelUrl: back || urls.site(w, p), meta: { workspace: w.id, booking: b.id, kind: 'booking' } });
  await payIns.run(s.id, w.id, b.id, 'booking', Math.round(b.total * 100), 'pending', null, Date.now(), Date.now());
  return s.url;
}
const secrets = require('./secrets')(db, cfg);
const visits = require('./visits')(cfg.secret);
const assist = require('./assist')(cfg);
const seoTools = require('./seo-tools')(cfg);
const google = require('./google-search')(cfg, { get: k => kvGet.get(k), set: (k, v) => kvSet.run(k, v) }, (...a) => log(...a));
const credits = require('./credits')({ cfg, db, log });
const leads = require('./leads')({ db, cfg, msg, auth, log });
const domains = require('./domains')({ cfg, auth, log });
const registrar = require('./registrar')({ cfg, db, ws, stripe, domains, log });
const backup = require('./backup')({ db, cfg, log });
const hostMail = require('./host-emails')({ db, cfg, msg, auth, ws, urls, leads, log });
const signin = require('./signin')({ cfg, auth, msg, log });
const campaigns = require('./campaigns')({ db, cfg, msg, auth, leads, hostMail, log });
const campaignsAdmin = require('./campaigns-admin');
const flowsAdmin = require('./flows-admin');
const adminUi = require('./admin-shell');
const social = require('./social')({ db });
const adminContent = require('./admin-content');
const adminUsers = require('./admin-users');
const stripeAuto = require('./stripe-auto').auto({ cfg, stripe, db, log });
const flows = require('./flows')({ db, cfg, msg, auth, ws, leads, hostMail, stripe, log }); // sales automation flows, /admin/flows
const effects = require('./effects')({ cfg, ws, msg, stripe, ai, auth, urls, db, log, payUrl, secrets });
ws.onEffects((w, fx) => effects(w, fx).catch(e => log('effects', e.message)));

/* ---------------- http helpers ---------------- */
const SEC = Object.assign({ 'x-content-type-options': 'nosniff', 'referrer-policy': 'strict-origin-when-cross-origin', 'x-frame-options': 'SAMEORIGIN', 'permissions-policy': 'camera=(self), geolocation=()' },
  cfg.secureCookies ? { 'strict-transport-security': 'max-age=15552000' } : {}); // HTTPS only, once BASE_URL is https
function send(res, status, body, type, headers) {
  res.writeHead(status, Object.assign({ 'content-type': type || 'text/html; charset=utf-8' }, SEC, headers || {}));
  res.end(body);
}
const json = (res, obj, status, headers) => send(res, status || 200, JSON.stringify(obj), 'application/json; charset=utf-8', Object.assign({ 'cache-control': 'no-store' }, headers || {}));
const redirect = (res, to, headers) => send(res, 302, '', 'text/plain', Object.assign({ location: to }, headers || {}));
const notFound = res => send(res, 404, pages.plain({ title: 'Not found', body: '<h1>We could not find that page.</h1><p>The link may be old or mistyped.</p><p><a href="/">Go to the homepage</a></p>' }));
function cookies(req) { const o = {}; String(req.headers.cookie || '').split(/;\s*/).forEach(c => { const i = c.indexOf('='); if (i > 0) o[c.slice(0, i)] = decodeURIComponent(c.slice(i + 1)); }); return o; }
const cookie = (name, val, maxAge) => name + '=' + encodeURIComponent(val) + '; Path=/; HttpOnly; SameSite=Lax' + (cfg.secureCookies ? '; Secure' : '') + '; Max-Age=' + maxAge;
function body(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > (limit || 1e6)) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); req.on('error', reject);
  });
}
async function jsonBody(req, limit) { const t = await body(req, limit); try { return t ? JSON.parse(t) : {}; } catch (_) { throw Object.assign(new Error('Bad JSON'), { status: 400 }); } }
async function formBody(req) { return Object.fromEntries(new URLSearchParams(await body(req, 1e5))); }
// The visitor's address for rate limits: Fly.io's own header, else the entry our proxy added last (earlier ones can be faked).
const ip = req => String(req.headers['fly-client-ip'] || String(req.headers['x-forwarded-for'] || '').split(',').pop() || req.socket.remoteAddress || '').trim();
// Browsers send Origin on cross-site POSTs; we only accept our own pages (and same-host custom domains).
function sameOrigin(req) { const o = req.headers.origin; if (!o) return true; try { return new URL(o).host === req.headers.host; } catch (_) { return false; } }
async function me(req) { const s = await auth.session(cookies(req).bb_s); return s; }
// Live updates: a server-sent event stream, or on Supabase (no long-lived connections) a version the browser polls.
async function stream(res, u, wid, headers) {
  if (cfg.serverless || u.searchParams.has('poll')) return json(res, { v: await ws.version(wid) }, 200, headers);
  res.writeHead(200, Object.assign({ 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }, headers || {})); res.write('retry: 5000\n\n'); return ws.subscribe(wid, res);
}
const err = (status, message) => Object.assign(new Error(message), { status });
// The AI site builder and funnel creator (server/studio)
// Our own event finder for Event ads (server/studio/crawler.js): reads public what's-on and course pages, no event APIs
const eventFinder = require('./studio/crawler')({ cfg, kv: { get: k => kvGet.get(k), set: (k, v) => kvSet.run(k, v) }, log: (...a) => log(...a) });
// The partner (affiliate) programme: /partners, /r/<code> and /admin/affiliates (server/affiliates.js)
const aff = require('./affiliates')({ db, cfg, auth, msg, stripe, log, h: { ui: adminUi, esc: s => pages.esc(s), send: (...a) => send(...a), redirect: (...a) => redirect(...a), notFound: r => notFound(r), cookies: r => cookies(r), cookie: (...a) => cookie(...a), formBody: r => formBody(r), ip: r => ip(r), authPage: (...a) => authPage(...a) } });
const studio = require('./studio')({ cfg, ws, auth, pub, urls, stripeReady, credits, finder: eventFinder, log: (...a) => log(...a), json, jsonBody, send: (...a) => send(...a), err, ip, hidden: (req, w) => hiddenFrom(req, w) });

/* ---------------- static assets ---------------- */
const MIME = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8' };
function file(res, base, rel, cache, extra) {
  const f = path.normalize(path.join(base, rel));
  if (!f.startsWith(base + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return notFound(res);
  send(res, 200, fs.readFileSync(f), MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', Object.assign({ 'cache-control': cache || 'public, max-age=3600' }, extra || {}));
}
const APP_MANIFEST = { name: 'Bookingbooster', short_name: 'Bookings', description: 'Your bookings, guests and messages.', id: '/app/phone', start_url: '/app/phone', scope: '/app', display: 'standalone', orientation: 'portrait',
  background_color: '#F5F6FA', theme_color: '#3355FF', icons: [{ src: '/assets/icons/icon-192.png', sizes: '192x192', type: 'image/png' }, { src: '/assets/icons/icon-512.png', sizes: '512x512', type: 'image/png' }, { src: '/assets/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }],
  shortcuts: [{ name: 'Console', url: '/app', icons: [{ src: '/assets/icons/icon-192.png', sizes: '192x192' }] }] };
const MARK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="26" fill="#3355FF"/><path d="M31 79 V34" stroke="#fff" stroke-width="11" stroke-linecap="round"/><path d="M20 35 L31 22 L42 35" fill="none" stroke="#FFC233" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 56 L54 39 L77 56 V79 H31" fill="none" stroke="#fff" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/><rect x="49" y="62" width="10" height="17" rx="2" fill="#FFC233"/></svg>';

/* ---------------- boot objects ---------------- */
let marketingState = null;
const marketing = () => marketingState || (marketingState = seedDemo());
async function hostBoot(w, surface) {
  const s = w.state;
  return { aiCredit: credits.enabled ? await credits.summary(w.id) : null, mode: 'host', surface, slug: w.slug, state: s, version: w.version, actUrl: '/api/act', stateUrl: '/api/state', poll: cfg.serverless, streamUrl: '/api/stream', stripe: stripeReady(w), stripeAvailable: stripe.enabled, soon: SOON, aiDrafts: assist.enabled, guestFromDomain: cfg.email.guestFromDomain, support: cfg.company.support,
    ...hostLinks(w), aiEngines: ai.available(), test: testNotes() };
}
const SOON = ['cleaner', 'google', 'gsc', 'analytics', 'pricelabs']; // shown in live accounts as coming soon
function hostLinks(w) { const s = w.state; return { siteUrls: Object.fromEntries(s.properties.map(p => [p.id, urls.site(w, p)])), icalFeeds: Object.fromEntries(s.properties.map(p => [p.id, urls.ical(w, p)])) }; }
function testNotes() { const t = []; if (!cfg.email.provider) t.push('email'); if (!cfg.sms.sid) t.push('texts'); if (!stripe.enabled) t.push('card payments'); return t; }
function publicBoot(w, mode, extra) {
  const base = '/api/public/' + w.slug;
  return Object.assign({ mode, version: w.version, bookUrl: base + '/book', stripe: stripeReady(w) }, extra);
}

/* ---------------- property site & trip pages ---------------- */
// A live host's sites stay offline to guests until the first payment (only when Stripe is on).
// The signed-in host can still preview their own site on the main domain.
// Not paid yet, or the plan was cancelled: the site is offline to guests and the console shows the payment page.
const offPlan = st => !st || st === 'trial' || st === 'cancelled';
function unpaid(w) { if (!stripe.enabled || w.kind !== 'live') return false; return offPlan((w.row || {}).billing_status); }
async function hiddenFrom(req, w) { if (!unpaid(w)) return false; const s = await me(req); return !(s && s.workspace_id === w.id); }
function comingSoon(res, w) { return send(res, 503, pages.plain({ title: 'Coming soon', body: '<h1>' + E(w.state.account.business) + ' is opening soon.</h1><p>This booking site is not live yet. Check back soon.</p>' }), 'text/html; charset=utf-8', { 'retry-after': '86400', 'x-robots-tag': 'noindex', 'cache-control': 'no-store' }); }
// Search engines, with no sign-in for the host: every live home's site is submitted to Google Search Console through our
// service account (verified with a meta tag we serve), and Bing, Yandex, Seznam and Naver hear about changes via IndexNow.
// Runs daily from the scheduler and when the host presses Submit now. Results are saved on the home (p.indexing).
function sitemapOf(w, site) { return site.includes('/s/' + w.slug + '/') ? cfg.baseUrl + '/s/' + w.slug + '/sitemap.xml' : new URL(site).origin + '/sitemap.xml'; }
async function autoIndex(w, o) {
  const s = w.state, out = [], now = new Date().toISOString();
  for (const prop of s.properties.filter(x => x.published !== false)) {
    const site = urls.site(w, prop), origin = new URL(site).origin, sm = sitemapOf(w, site), cur = prop.indexing || {}, patch = {};
    if (google.enabled) {
      try { await google.submit(origin, sm); patch.google = { state: 'submitted', sitemap: sm, at: now, account: google.account };
        try { patch.perf = await google.performance(origin, site.includes('/s/') ? site : origin + '/'); } catch (e) { if (e.status !== 403) log('gsc perf', e.message); }
        out.push({ ok: true, message: prop.name + ': sitemap submitted to Google.' }); }
      catch (e) { patch.google = { state: 'error', sitemap: sm, at: now, error: String(e.message).slice(0, 200) }; out.push({ ok: false, message: prop.name + ': Google said "' + patch.google.error + '".' }); }
    }
    // IndexNow only when the page's words changed, as the protocol asks.
    const sig = crypto.createHash('sha1').update(seo.llms(s, prop, site)).digest('hex').slice(0, 16);
    if ((o && o.force) || (cur.indexnow || {}).sig !== sig) {
      const key = seo.indexNowKey(cfg.secret, w.id), onPath = site.includes('/s/' + w.slug + '/');
      const r = await seoTools.ping(new URL(site).host, key, onPath ? cfg.baseUrl + '/s/' + w.slug + '/' + key + '.txt' : origin + '/' + key + '.txt', [site, onPath ? site + '/llms.txt' : origin + '/llms.txt']);
      patch.indexnow = { state: r.ok ? 'sent' : 'error', at: now, sig: r.ok ? sig : (cur.indexnow || {}).sig, message: r.message };
      out.push({ ok: r.ok, message: prop.name + ': ' + r.message });
    }
    if (Object.keys(patch).length) await ws.withWs(w.id, BB => BB.act.setIndexing(prop.id, patch), { quiet: true });
  }
  return out;
}

// Search health tools in the console: what the site sends crawlers, AI-written drafts and IndexNow pings.
// Live accounts only call Claude and IndexNow; the demo gets the same files and rule-based drafts.
async function seoApi(req, res, p, m, w, live, headers) {
  const s = w.state; const j = m === 'POST' ? await jsonBody(req, 2e4) : {};
  const u = new URL(req.url, 'http://x'); const pid = j.propertyId || u.searchParams.get('propertyId');
  const prop = s.properties.find(x => x.id === pid) || s.properties[0]; if (!prop) throw err(404, 'Add a home first.');
  const site = live ? urls.site(w, prop) : 'https://' + prop.domain + '/';
  const root = site.replace(/^(https?:\/\/[^/]+).*$/, '$1') + '/', onPath = site.includes('/s/' + w.slug + '/');
  const key = seo.indexNowKey(cfg.secret, w.id), keyUrl = onPath ? cfg.baseUrl + '/s/' + w.slug + '/' + key + '.txt' : root + key + '.txt';
  if (p === '/api/seo/files' && m === 'GET') {
    return json(res, { site, sitemap: onPath ? cfg.baseUrl + '/s/' + w.slug + '/sitemap.xml' : root + 'sitemap.xml', robots: root + 'robots.txt', llmsUrl: onPath ? site + '/llms.txt' : root + 'llms.txt', keyUrl,
      jsonld: seo.jsonLd(s, prop, site), llms: seo.llms(s, prop, site), title: seo.titleOf(prop), description: seo.descOf(prop), writer: live && seoTools.enabled, indexNow: live, google: live && google.enabled }, 200, headers);
  }
  if (p === '/api/seo/write' && m === 'POST') {
    const what = String(j.what || ''); if (!['summary', 'area', 'meta', 'faqs'].includes(what)) throw err(400, 'Unknown draft');
    if (!live || !seoTools.enabled) return json(res, { draft: null, by: 'rules' }, 200, headers);
    if (!auth.limit('seo-write:' + w.id, 60, 3600e3)) throw err(429, 'Too many drafts this hour. Try again later.');
    try { await credits.check(w.id); } catch (e) { if (e.code === 'ai_credit') return json(res, { draft: null, by: 'rules', credit: { empty: true, message: e.message, url: e.topupUrl } }); throw e; }
    try { return json(res, { draft: await seoTools.write(s, prop, what, credits.meter(w.id, 'seo'), Array.isArray(j.questions) ? j.questions : []), by: 'claude' }); }
    catch (e) { log('seo write', e.message); return json(res, { draft: null, by: 'rules', error: 'Claude could not write this just now, so here is a draft from your facts.' }); }
  }
  if (p === '/api/seo/submit' && m === 'POST') {
    if (!live) return json(res, { ok: true, message: 'In the demo nothing is sent. In your account we submit every site to Google and Bing for you, every day.' }, 200, headers);
    if (!auth.limit('seo-submit:' + w.id, 6, 86400e3)) throw err(429, 'Already submitted several times today. We also resubmit every day by ourselves.');
    const out = await autoIndex(w, { force: true });
    return json(res, Object.assign({ ok: out.every(x => x.ok), message: out.map(x => x.message).join(' ') }, { state: (await ws.open(w.id)).state, version: await ws.version(w.id) }));
  }
  if (p === '/api/seo/ping' && m === 'POST') {
    if (!live) return json(res, { ok: true, message: 'In the demo nothing is sent. In your account this asks Bing and the other IndexNow engines to recrawl now.' }, 200, headers);
    if (!auth.limit('seo-ping:' + w.id, 10, 86400e3)) throw err(429, 'You have asked 10 times today. Search engines will pick up changes from your sitemap too.');
    const host = new URL(site).host; const list = onPath ? s.properties.map(x => cfg.baseUrl + '/s/' + w.slug + '/' + x.id) : [site, root + 'llms.txt'];
    const r = await seoTools.ping(host, key, keyUrl, list);
    await ws.withWs(w.id, BB => { BB.log('site', 'Search health', (r.ok ? 'Asked Bing and other IndexNow engines to recrawl ' : 'Could not ask IndexNow to recrawl ') + prop.domain + '. ' + r.message, prop.id, ['Search health', 'IndexNow']); BB.store.commit({}); });
    return json(res, Object.assign(r, { state: (await ws.open(w.id)).state, version: await ws.version(w.id) }));
  }
  return false;
}
async function sitePage(res, w, p, canonical, host, req) {
  const s = w.state; if (req && w.kind === 'live') visits.count(req, w.id, p.id, s.today);
  // A site on its own address carries our Google verification tag on its home page, so we can submit it to Search Console.
  const gsv = host && google.enabled ? await google.metaTag(new URL(canonical).origin) : '';
  const built = studio.publishedSite(w, p, canonical); // a site designed and published in the Site builder
  if (built) return send(res, 200, gsv ? built.replace('<head>', '<head>' + gsv) : built, 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
  const st = pub.siteState(s, p.id);
  send(res, 200, pages.page({
    title: seo.titleOf(p), description: seo.descOf(p), head: gsv + seo.head(s, p, canonical), content: seo.content(s, p, canonical),
    boot: publicBoot(w, 'site', { state: st, focus: p.id, opts: { propertyId: p.id }, siteUrl: canonical }),
    banner: stripeReady(w) ? null : (w.kind === 'live' ? null : '<b>Demo</b> No real bookings are taken here.'),
  }), 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
}
function tripPage(res, w, b, k, step) {
  const s = w.state; const st = pub.tripState(s, b.id);
  const base = '/api/public/' + w.slug + '/trip/' + encodeURIComponent(b.id);
  const q = '?k=' + encodeURIComponent(k);
  const p = s.properties.find(x => x.id === b.propertyId);
  send(res, 200, pages.page({ title: 'Your stay at ' + p.name, robots: 'noindex, nofollow',
    boot: publicBoot(w, 'trip', { state: st, trip: b.id, step: step || null, opts: { bookingId: b.id, step: step || undefined }, actUrl: base + '/act' + q, idUrl: base + '/id' + q, stateUrl: base + '/state' + q, poll: cfg.serverless, streamUrl: base + '/stream' + q, depositUrl: base + '/deposit' + q, siteUrl: urls.site(w, p), trips: { [b.id]: urls.trip(w, b) } }) }),
  'text/html; charset=utf-8', { 'cache-control': 'no-store' });
}

function sendInvoice(res, w, b, host) {
  const s = w.state; const p = s.properties.find(x => x.id === b.propertyId) || {}; const g = s.guests.find(x => x.id === b.guestId) || { name: 'Guest', email: '' };
  send(res, 200, invoice.render({ s, b, p, g, host }), 'text/html; charset=utf-8', { 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex' });
}

/* ---------------- public API (guests) ---------------- */
const BOOK_KEYS = ['propertyId', 'checkIn', 'checkOut', 'name', 'email', 'phone', 'adults', 'children', 'pets', 'promo', 'subscribe'];
const ISO = /^\d{4}-\d{2}-\d{2}$/;
async function publicBook(req, res, w) {
  if (!auth.limit('book:' + ip(req), 12, 600e3)) throw err(429, 'Too many attempts. Wait a few minutes and try again.');
  const { input = {}, kind } = await jsonBody(req, 2e4);
  const x = {}; BOOK_KEYS.forEach(k => { if (input[k] !== undefined) x[k] = input[k]; });
  if (!ISO.test(x.checkIn) || !ISO.test(x.checkOut)) throw err(400, 'Pick your dates.');
  if (!String(x.name || '').trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(x.email || ''))) throw err(400, 'Add your name and email.');
  ['adults', 'children'].forEach(k => x[k] = Math.max(0, Math.min(30, parseInt(x[k], 10) || 0))); x.adults = Math.max(1, x.adults); x.pets = x.pets ? 1 : 0;
  const p = w.state.properties.find(q => q.id === x.propertyId && q.published !== false); if (!p) throw err(404, 'That home is not taking bookings.');
  x.source = ['google', 'ai', 'campaign', 'referral'].includes(input.source) ? input.source : (input.source === 'guest-app' ? 'guest-app' : 'website');
  x.channel = 'direct';
  await effects.freshen(w, p.id); // re-read Airbnb and the rest first if they were not checked in the last few minutes
  const ready = stripeReady(w), how = pub.guestPay(w.state);
  // The host chose how guests pay. A bank-transfer-only home turns away card checkouts, and the other way round.
  if (kind === 'transfer' && how === 'card') return json(res, { ok: false, error: 'This home takes card payments only. Pay by card or send a booking request.' });
  if (kind !== 'transfer' && kind !== 'request' && how === 'transfer') return json(res, { ok: false, error: 'This home takes payment by bank transfer. Choose bank transfer to book.', transfer: true });
  let r;
  if (kind === 'transfer') { r = (await ws.act(w.id, 'bookByTransfer', [x])).result; }
  else if (kind === 'request' || (w.kind === 'live' && !ready)) { r = (await ws.act(w.id, x.source === 'guest-app' ? 'requestGuestBooking' : 'requestPropertyBooking', [x])).result; r && (r.request = true); }
  else if (ready) { r = (await ws.act(w.id, 'createBooking', [Object.assign(x, { pending: true })])).result; }
  else r = (await ws.act(w.id, 'createBooking', [x])).result; // demo workspace: simulated card payment
  if (!r || !r.ok) return json(res, { ok: false, error: (r && r.error) || 'Those dates could not be booked.' });
  const b = w.state.bookings.find(q => q.id === r.booking.id);
  const out = { ok: true, bookingId: b.id, tripUrl: urls.trip(w, b), request: !!r.request };
  if (b.payBy === 'transfer') out.invoiceUrl = urls.invoice(w, b);
  if (r.pending) { try { out.checkoutUrl = await payUrl(w, b, req.headers.referer); } catch (e) { await ws.act(w.id, 'expirePending', [b.id]); throw err(502, 'Card payments are not available right now. Try again, or send a booking request.'); } }
  out.state = pub.tripState(w.state, b.id); out.version = await ws.version(w.id);
  json(res, out);
}
const idFile = bid => String(bid).replace(/[^A-Za-z0-9-]/g, '_') + '-id.jpg';
const TRIP_ACTS = { checkin: 1, sendMessage: 1, rateStay: 1, review: 1, joinList: 1, buyExtra: 1, openThread: 1 };
const CHECKIN_KEYS = ['id', 'selfie', 'guests', 'agreement', 'signature', 'arrival'];
async function tripAct(w, b, name, args) {
  if (!TRIP_ACTS[name]) throw err(403, 'Not allowed.');
  if (name === 'checkin' && (b.status === 'request' || b.status === 'cancelled')) throw err(400, b.status === 'request' ? 'Online check-in opens once your host confirms your stay.' : 'This booking was cancelled.');
  const s = w.state; const t = s.threads.find(x => x.bookingId === b.id);
  if (name === 'checkin') { const patch = {}; CHECKIN_KEYS.forEach(k => { if (args[1] && args[1][k] !== undefined) patch[k] = k === 'arrival' || k === 'signature' ? String(args[1][k]).slice(0, 40) : !!args[1][k]; });
    if (args[1] && args[1].deposit && !stripeReady(w)) patch.deposit = true; // no card deposits for this host; with Stripe the deposit step goes through /deposit
    if (w.kind === 'live') { delete patch.id; delete patch.selfie; } // set only by a real ID upload
    args = [b.id, patch]; }
  else if (name === 'sendMessage') { if (!t || args[0] !== t.id) throw err(403, 'Not allowed.'); args = [t.id, 'guest', String(args[2] || '').slice(0, 2000), 'Guest app']; }
  else if (name === 'rateStay' || name === 'review') { if (b.status !== 'completed' && b.checkOut > s.today) throw err(400, 'You can rate your stay after checkout.'); args = [b.id, Math.max(1, Math.min(5, +args[1] || 5)), String(args[2] || '').slice(0, 1500), args[3] === true]; }
  else if (name === 'joinList') args = [b.guestId];
  else if (name === 'buyExtra') { const EXTRAS = { 'Early check-in': 25, 'Late checkout': 25, 'Firewood basket': 15, 'Welcome hamper': 35, 'Breakfast box': 18 }; const n = String(args[1]); const price = EXTRAS[n] != null ? EXTRAS[n] : +args[2]; if (!(price >= 0 && price <= 200)) throw err(400, 'Not allowed.'); args = [b.id, n.slice(0, 60), price]; }
  else if (name === 'openThread') args = [b.guestId, b.id];
  return await ws.act(w.id, name, args);
}

/* ---------------- Stripe webhook ---------------- */
async function stripeWebhook(req, res) {
  const raw = await body(req, 1e6);
  if (!stripe.verify(raw, req.headers['stripe-signature'])) return json(res, { error: 'bad signature' }, 400);
  const ev = JSON.parse(raw); const o = ev.data && ev.data.object || {}; const m = o.metadata || {};
  const w = m.workspace && await ws.open(m.workspace);
  try {
    if (ev.type === 'checkout.session.completed' && w) {
      if (m.kind === 'booking') { await payUpd.run('paid', o.payment_intent, Date.now(), o.id); await ws.act(w.id, 'paymentConfirmed', [m.booking, { intent: o.payment_intent, session: o.id }]); }
      if (m.kind === 'link') { await payIns.run(o.id, w.id, m.booking, 'booking', o.amount_total || 0, 'paid', o.payment_intent, Date.now(), Date.now()); await ws.act(w.id, 'paymentConfirmed', [m.booking, { intent: o.payment_intent, session: o.id }]); }
      if (m.kind === 'deposit') { await payIns.run(o.id, w.id, m.booking, 'deposit', 20000, 'card-saved', o.setup_intent, Date.now(), Date.now()); await ws.act(w.id, 'checkin', [m.booking, { deposit: true }]); }
      if (m.kind === 'extra') { await payIns.run(o.id, w.id, m.booking, 'extra', o.amount_total || 0, 'paid', o.payment_intent, Date.now(), Date.now()); }
      if (m.kind === 'plan') await planPaid(w.id, o.customer, m.plan);
    }
    if (ev.type === 'checkout.session.expired' && w && m.kind === 'booking') { await payUpd.run('expired', null, Date.now(), o.id); await ws.act(w.id, 'expirePending', [m.booking]); }
    if (ev.type === 'checkout.session.completed' && w && m.kind === 'credit' && o.payment_status === 'paid') { const pounds = (o.amount_total || 0) / 100; if (await credits.topup(w.id, pounds, o.id)) log('credits', w.id, 'topped up £' + pounds); }
    if (ev.type === 'account.updated' && o.id) { const r = await db.prepare('SELECT id FROM workspaces WHERE stripe_account = ?').get(o.id); if (r) await markStripe(r.id, !!o.charges_enabled); }
    if (ev.type === 'invoice.payment_failed' || ev.type === 'invoice.paid') {
      const r = o.customer && await db.prepare('SELECT id, billing_status FROM workspaces WHERE stripe_customer = ?').get(o.customer);
      if (r && ev.type === 'invoice.paid' && r.billing_status === 'past_due') await ws.setMeta(r.id, { billing_status: 'active' });
      if (r && ev.type === 'invoice.payment_failed' && o.billing_reason !== 'subscription_create') {
        await ws.setMeta(r.id, { billing_status: 'past_due' });
        let card = null;
        try { const inv = await stripe.api('GET', '/invoices/' + o.id, { expand: ['payment_intent.payment_method'] }); const pi = inv.payment_intent || {}; const c = (pi.payment_method && pi.payment_method.card) || {};
          card = { brand: c.brand, last4: c.last4, reason: pi.last_payment_error && (pi.last_payment_error.decline_code || pi.last_payment_error.message) }; } catch (e) { log('webhook', 'invoice card', e.message); }
        await hostMail.paymentFailed(r.id, o, card);
      }
    }
    if (ev.type === 'customer.subscription.updated') { const r = await db.prepare('SELECT id FROM workspaces WHERE stripe_customer = ?').get(o.customer); if (r) await flows.cancelling(r.id, o); } // cancel requested: offer a pause
    if (['invoice.paid', 'charge.refunded', 'charge.dispute.closed'].includes(ev.type)) await aff.stripeEvent(ev, async c => { const r = await db.prepare('SELECT id FROM workspaces WHERE stripe_customer = ?').get(c); return r && r.id; });
    if (ev.type === 'customer.subscription.deleted') { const r = await db.prepare('SELECT id FROM workspaces WHERE stripe_customer = ?').get(o.customer);
      // An old subscription ending after the host has already restarted on a new one must not switch the site off.
      let other = false; if (r) { try { const l = await stripe.api('GET', '/subscriptions', { customer: o.customer, status: 'all', limit: 20 }); other = (l.data || []).some(x => x.id !== o.id && ['active', 'trialing', 'past_due'].includes(x.status)); } catch (e) { log('webhook', 'subscriptions', e.message); } }
      if (r && !other) await ws.setMeta(r.id, { billing_status: 'cancelled' }); }
  } catch (e) { log('webhook', ev.type, e.message); return json(res, { error: 'not processed, retry' }, 500); } // a 500 makes Stripe send it again; every step above is safe to repeat
  json(res, { received: true });
}
async function markStripe(wid, on, bank) {
  await ws.withWs(wid, BB => { const i = BB.q.integration('stripe'); if (!i || i.connected === on) return; i.connected = on; i.lastSync = BB.stamp(); if (bank) i.detail = 'Cards, Apple Pay, Google Pay. Payouts to ' + bank;
    BB.log('payment', 'Stripe', on ? 'Stripe is connected. Guests can now pay by card, Apple Pay and Google Pay, and payouts go to your bank.' : 'Stripe needs more details before it can take payments.', 'stripe'); BB.store.commit({}); });
}

/* ---------------- sign-up from the onboarding flow ---------------- */
const PROP_KEYS = ['name', 'short', 'theme', 'domain', 'nightly', 'maxGuests', 'bedrooms', 'baths', 'petsAllowed', 'petFee', 'area', 'color', 'headline', 'sub', 'about', 'rules'];
async function signup(req, res) {
  if (!auth.limit('signup:' + ip(req), 6, 3600e3)) throw err(429, 'Too many sign-ups from here. Try again later.');
  const b = await jsonBody(req, 5e4); const a = b.account || {};
  const email = String(a.email || '').trim().toLowerCase(), name = String(a.name || '').trim().slice(0, 80), pw = String(a.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err(400, 'Enter a valid email.');
  if (name.length < 2) throw err(400, 'Enter your name.');
  if (pw.length < 10) throw err(400, 'Use a password of at least 10 characters.');
  if (await auth.userByEmail(email)) throw err(409, 'There is already an account for that email. Sign in instead.');
  const ref = await aff.forSignup(req, b.ref, email); // the partner who referred them, if any
  const plan = 'Growth'; // one plan: £200 a month, paid upfront, no setup fee
  // A new domain to buy for them: check it and the registration contact before anything is created.
  const buyDomain = registrar.enabled() && b.domainMode === 'new' && b.property && String(b.property.domain || '').toLowerCase().trim();
  const wantsBuy = buyDomain && !(cfg.sitesDomain && buyDomain.endsWith('.' + cfg.sitesDomain)) && !ws.isOurs(buyDomain);
  if (wantsBuy) {
    const bad = registrar.problem(buyDomain); if (bad) throw err(400, bad);
    const c = registrar.contact({ name, email }, b.registrant || {}); if (c.err) throw err(400, c.err);
    let s = null; try { s = await registrar.search([buyDomain]); } catch (e) { log('signup domain search', e.message); }
    if (s && s[0] && !s[0].ok) throw err(409, buyDomain + ' has just been taken. Go back to the domain step and pick another.');
  }
  const business = String(a.business || '').trim().slice(0, 80) || name.split(' ')[0] + "'s holiday lets";
  const wid = await ws.createLive({ business, owner: name, email, plan });
  const uid = await auth.createUser({ email, name, password: pw, workspaceId: wid });
  if (b.property && b.property.name) {
    const p = {}; PROP_KEYS.forEach(k => { if (b.property[k] !== undefined) p[k] = b.property[k]; });
    p.name = String(p.name).slice(0, 80); p.nightly = Math.max(30, Math.min(3000, +p.nightly || 120)); p.maxGuests = Math.max(1, Math.min(24, +p.maxGuests || 2));
    p.reviews = 0; p.rating = 0; // reviews are earned here, never copied in
    p.domain = String(p.domain || '').toLowerCase().replace(/[^a-z0-9.-]/g, '').slice(0, 80);
    await ws.act(wid, 'addProperty', [p]);
    if (wantsBuy) {
      const pid = (await ws.open(wid)).state.properties.slice(-1)[0].id;
      const o = await registrar.order(wid, pid, buyDomain, { name, email }, Object.assign({ organisation: a.business }, b.registrant || {}));
      if (o.err) log('signup domain', wid, buyDomain, o.err);
    }
    if (b.addon || b.annual) await ws.withWs(wid, BB => { const a = BB.store.get().account; if (b.addon) a.addon = true; if (b.annual) a.annual = true; BB.store.commit({}); });
  }
  await ws.setMeta(wid, { plan, billing_status: 'trial' });
  await aff.attach(wid, ref);
  const token = await auth.startSession(uid), set = { 'set-cookie': cookie('bb_s', token, 30 * 86400) };
  // Pay first: with card billing on, the new host goes straight to Stripe Checkout and gets into setup once it is paid.
  if (stripe.enabled) {
    let to = '/app/pay';
    try { to = (await planCheckout(await ws.open(wid))).url; } catch (e) { log('signup checkout', e.message); }
    return json(res, { ok: true, redirect: to }, 200, set);
  }
  ws.defer(welcome(wid), 'welcome');
  if (wantsBuy) ws.defer(registrar.due(wid), 'domain'); // no card billing on this server: buy it now
  json(res, { ok: true, redirect: '/app?welcome=1' }, 200, set);
}
// Plan checkout: the first month (or year) is paid today. Back to /app/pay/done, which confirms it without waiting for the webhook.
async function planCheckout(w) {
  const r = await ws.row(w.id), plan = r.plan || w.state.account.plan;
  return stripe.subscribe({ customer: r.stripe_customer || undefined, customerEmail: w.state.account.email, plan, addon: !!w.state.account.addon, annual: !!w.state.account.annual, successUrl: cfg.baseUrl + '/app/pay/done?session={CHECKOUT_SESSION_ID}', cancelUrl: cfg.baseUrl + '/app/pay', meta: { workspace: w.id, kind: 'plan', plan } });
}
// The plan is paid (from the webhook or the return from Checkout, whichever comes first): open the console and say welcome once.
async function planPaid(wid, customer, plan) {
  const r = await ws.row(wid); const first = !r || !r.billing_status || r.billing_status === 'trial';
  await ws.setMeta(wid, { billing_status: 'active', stripe_customer: customer, plan });
  await ws.withWs(wid, BB => { const a = BB.store.get().account; if (plan) a.plan = plan; a.billing = 'active'; BB.store.commit({}); });
  if (first) { ws.defer(welcome(wid), 'welcome'); ws.defer(effects.siteLive(wid), 'site-live'); } // the "site is live" email waits for payment too
  ws.defer(registrar.due(wid), 'domain'); // a new domain chosen at sign-up is only bought once the plan is paid
}
// Hosts who have not paid yet only see the payment page, their billing and their account. Team members are let through.
const PAY_OPEN = ['/app/pay', '/app/pay/done', '/app/billing', '/app/billing/start', '/app/billing/portal', '/app/account'];
async function mustPay(req, w) {
  if (!stripe.enabled || w.kind !== 'live') return false;
  const r = await ws.row(w.id); if (r && !offPlan(r.billing_status)) return false;
  return !await isAdmin(req);
}
function payPage(w, note) {
  const s = w.state, price = 200, ended = (w.row || {}).billing_status === 'cancelled';
  const due = s.account.annual ? '£' + price * 10 + (ended ? ' for the year' : ' for your first year') : '£' + price + (ended ? ' for the month' : ' for your first month');
  return authPage(ended ? 'Restart your plan' : 'Start your plan', (ended ? '<h1>Your plan has ended</h1><p>Your booking site is offline to guests. Pay ' + due + ' to restart your plan. Everything you set up is still here.</p>'
    : '<h1>One step left</h1><p>Pay ' + due + ' to open your console and start setting up ' + E((s.properties[0] || {}).name || s.account.business) + '.</p>') +
    (note ? '<p class="ok" role="status">' + E(note) + '</p>' : '') +
    '<div class="card"><b>' + E(s.account.plan) + ' plan · ' + (s.account.annual ? '£' + price * 10 + ' a year' : '£' + price + ' a month') + ' inc. VAT</b><p style="margin:6px 0 0">No setup fee. You pay ' + (s.account.annual ? 'the year' : 'the first month') + ' today, then it renews automatically. No commission on any booking. Cancel anytime.</p>' + (s.account.addon ? '<p style="margin:6px 0 0">Plus the calendar sync add-on, ' + (s.account.annual ? '£180 a year' : '£15 a month') + '.</p>' : '') + '</div>' +
    '<form method="post" action="/app/billing/start"><button>Pay securely with Stripe</button></form>' +
    '<div class="links"><a href="mailto:' + E(cfg.company.support) + '">Questions? Email us</a><a href="/app/account">Your account</a></div>' +
    '<form method="post" action="/logout" style="margin-top:8px"><button class="link" style="background:none;border:0;padding:0;color:inherit;text-decoration:underline;cursor:pointer">Sign out</button></form>');
}
async function welcome(wid) {
  const w = await ws.open(wid); const s = w.state; const p = s.properties[0];
  const v = { first_name: s.account.owner.split(' ')[0], plan_name: s.account.plan, plan_price: '£200 a month', property_name: p ? p.name : 'your home', go_live_date: 'today', site_url: p ? urls.site(w, p) : cfg.baseUrl, dashboard_url: cfg.baseUrl + '/app', account_url: cfg.baseUrl + '/app', setup_url: cfg.baseUrl + '/app', help_url: cfg.baseUrl + '/help', setup_lead_name: 'The Bookingbooster team', setup_lead_initials: 'BB', company_address: cfg.company.address, company_number: cfg.company.number, vat_number: cfg.company.vat, privacy_url: cfg.baseUrl + '/privacy', unsubscribe_url: cfg.baseUrl + '/app', preferences_url: cfg.baseUrl + '/app' };
  await msg.sendEmail({ workspaceId: wid, to: s.account.email, subject: 'Welcome to Bookingbooster', text: 'Welcome, ' + v.first_name + '. Your console: ' + v.dashboard_url, html: msg.template('host-o01-welcome', v), meta: { template: 'welcome' } });
}

/* ---------------- account pages ---------------- */
// Signed out: drop the offline copy of the console that the service worker keeps (web/sw.js).
const CLEAR_OFFLINE = '<script>try{caches.keys().then(function(k){k.forEach(function(n){if(n.indexOf("bb-app")===0)caches.delete(n)})})}catch(e){}</script>';
const authPage = (title, inner, wide, index) => pages.plain({ title, body: inner, wide, index });
// Company details we show in public. Placeholders such as "to be confirmed" are left out.
const publicCompany = () => { const c = cfg.company; return { name: c.name, number: c.number || '', vat: c.vat || '', address: /to be confirmed/i.test(c.address || '') ? '' : (c.address || ''), support: c.support }; };
const E = pages.esc;
function loginForm(o) {
  o = o || {};
  return authPage('Sign in', CLEAR_OFFLINE + '<h1>Sign in</h1><p>Your console, bookings and guests.</p>' + (o.err ? '<p class="err" role="alert">' + E(o.err) + '</p>' : '') + (o.ok ? '<p class="ok">' + E(o.ok) + '</p>' : '') +
    '<form method="post" action="/login"><input type="hidden" name="next" value="' + E(o.next || '/app') + '"><label>Email<input name="email" type="email" autocomplete="email" required value="' + E(o.email || '') + '"></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Sign in</button></form>' +
    '<p style="margin:12px 0 0;text-align:center"><a href="/login/email">Email me a sign-in link instead</a></p>' +
    '<div class="links"><a href="/forgot">Forgot your password?</a><a href="/start">Create an account</a></div><div class="card"><b>Just looking?</b><p style="margin:6px 0 0">Try the <a href="/demo">full demo</a> with a sample host account. Nothing you do there is real.</p></div>');
}

const MEDIA = new Map(); // /media files, kept in memory once read
const GUIDES_A = ['direct-booking-playbook.pdf', 'direct-booking-launch-checklist.pdf', 'ai-search-self-audit.pdf', 'fee-leak-worksheet.pdf'];
/* ---------------- router ---------------- */
async function route(req, res) {
  await db.ready;
  await stripeAuto.load(); // Stripe prices and webhook secrets kept in the database
  const u = new URL(req.url, 'http://x'); const p = u.pathname; const m = req.method;
  const host = String(req.headers.host || '').toLowerCase();
  if (m === 'POST' && !p.startsWith('/webhooks/') && !p.startsWith('/u/') && p !== '/api/leads' && !sameOrigin(req)) return json(res, { error: 'Cross-site request blocked' }, 403);

  /* on-demand TLS (Caddy and similar ask before issuing a certificate): only our hosts and connected domains */
  if (p === '/tls/ask') {
    const d = String(u.searchParams.get('domain') || '').toLowerCase(); const row = d && await ws.domain(d);
    return send(res, d === MAIN_HOST || d === 'www.' + MAIN_HOST || (row && row.verified) ? 200 : 404, '', 'text/plain');
  }
  /* www of our own domain: one canonical address for Google */
  if (host.replace(/:\d+$/, '') === 'www.' + MAIN_HOST) return send(res, 301, '', 'text/plain', { location: cfg.baseUrl + req.url });

  /* assets (any host) */
  if (p === '/favicon.ico') return send(res, 301, '', 'text/plain', { location: '/assets/icons/icon-192.png', 'cache-control': 'public, max-age=604800' });
  if (p.startsWith('/assets/')) {
    const a = pages.assets();
    if (p === '/assets/mark.svg') return send(res, 200, MARK_SVG, 'image/svg+xml', { 'cache-control': 'public, max-age=86400' });
    if (p === '/assets/app.' + a.hash.css + '.css') return send(res, 200, a.css, 'text/css; charset=utf-8', { 'cache-control': 'public, max-age=31536000, immutable' });
    if (p === '/assets/prod.' + a.hash.prod + '.js') return send(res, 200, a.prodJs, 'text/javascript; charset=utf-8', { 'cache-control': 'public, max-age=31536000, immutable' });
    if (p === '/assets/demo.' + a.hash.demo + '.js') return send(res, 200, a.demoJs, 'text/javascript; charset=utf-8', { 'cache-control': 'public, max-age=31536000, immutable' });
    if (p.startsWith('/assets/brand/')) return file(res, path.join(ROOT, 'web', 'brand'), p.slice('/assets/brand/'.length));
    if (p.startsWith('/assets/icons/')) return file(res, path.join(ROOT, 'web', 'icons'), p.slice('/assets/icons/'.length), 'public, max-age=604800');
    return notFound(res);
  }
  { const md = p.match(/^\/media\/([A-Za-z0-9_-]+)\/([a-z0-9-]+)\/([a-z0-9]+\.(?:jpg|png|webp))$/); if (md) { const b = await files.get('media/' + md[1] + '/' + md[2] + '/' + md[3]); return b ? send(res, 200, b, MIME['.' + md[3].split('.').pop()], { 'cache-control': 'public, max-age=31536000, immutable' }) : notFound(res); } }
  if (p === '/embed/forms.js') return file(res, path.join(ROOT, 'web', 'embed'), 'forms.js', 'public, max-age=3600');
  if (p.startsWith('/email-img/brand/')) return file(res, path.join(__dirname, 'emails', 'brand'), p.slice('/email-img/brand/'.length), 'public, max-age=86400');
  if (p.startsWith('/email-img/')) return file(res, path.join(__dirname, 'emails', 'guest-img'), p.slice('/email-img/'.length), 'public, max-age=86400');
  if (p === '/healthz') return json(res, { ok: true });
  if (p === '/bot') return send(res, 200, 'BookingboosterEvents is the event finder for Bookingbooster, a direct-booking tool for UK holiday lets.\n\nIt reads public what\'s-on, venue and training course pages, and calendar feeds, to find events near our hosts\' homes, so they can tell people travelling for those events that they have a room free. It keeps only the facts (name, dates, venue) and a link back to your page.\n\nIt asks robots.txt first and follows it, for "BookingboosterEvents" or for "*". It keeps to Crawl-delay, waits at least 1.5 seconds between pages, reads at most 25 pages of a site a day, skips noindex pages and does not follow nofollow links.\n\nTo stop it, add to your robots.txt:\nUser-agent: BookingboosterEvents\nDisallow: /\n', 'text/plain; charset=utf-8');
  /* test servers only (TEST_SQL=1, set by test/harness.js): lets tests read and change the database directly */
  if (p === '/test/sql' && m === 'POST' && process.env.TEST_SQL === '1' && /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) { const j = await jsonBody(req, 1e5); return json(res, { rows: await db.prepare(String(j.q)).all(...(j.args || [])) }); }
  /* background jobs on Supabase: pg_cron posts here every few minutes with the jobs key */
  if (p === '/jobs/tick' && m === 'POST') {
    const k = String(req.headers['x-jobs-key'] || ''); const jk = cfg.jobsKey || ((await kvGet.get('config:jobs_key')) || {}).v || ''; if (!jk || k.length !== jk.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(jk))) return notFound(res);
    return json(res, await tick());
  }
  /* the host app can be installed on a phone's home screen */
  if (p === '/app/manifest.webmanifest') return send(res, 200, JSON.stringify(APP_MANIFEST), 'application/manifest+json', { 'cache-control': 'public, max-age=3600' });
  if (p === '/app/sw.js') return file(res, path.join(ROOT, 'web'), 'sw.js', 'no-cache', { 'service-worker-allowed': '/app' });
  if (p === '/app/offline') return send(res, 200, authPage('Offline', '<h1>You are offline.</h1><p>Bookingbooster needs a connection to load your bookings. It will open again as soon as you have signal.</p><p><a href="/app/phone">Try again</a></p>'), 'text/html; charset=utf-8');
  if (p === '/webhooks/stripe' && m === 'POST') return await stripeWebhook(req, res);

  /* public guest API (any host) */
  let mm;
  if ((mm = p.match(/^\/api\/public\/([a-z0-9-]+)\/(.+)$/))) {
    const r = await ws.bySlug(mm[1]); if (!r) return json(res, { error: 'Not found' }, 404);
    const w = await ws.open(r.id); const rest = mm[2];
    if (rest === 'book' && m === 'POST') { if (unpaid(w)) return json(res, { error: 'This booking site is not live yet.' }, 403); return await publicBook(req, res, w); }
    const t = rest.match(/^trip\/([^/]+)\/(act|state|stream|deposit|id)$/);
    if (t) {
      const bid = decodeURIComponent(t[1]); const k = u.searchParams.get('k');
      if (!auth.verify(k, 'trip', w.id, bid)) return json(res, { error: 'This link has expired. Ask your host for a new one.' }, 403);
      w.catchUp();
      const b = w.state.bookings.find(x => x.id === bid); if (!b) return json(res, { error: 'Booking not found' }, 404);
      if (t[2] === 'state') return json(res, { state: pub.tripState(w.state, bid), version: await ws.version(w.id) });
      if (t[2] === 'stream') return await stream(res, u, w.id);
      if (t[2] === 'act' && m === 'POST') { if (!auth.limit('trip:' + ip(req), 120, 600e3)) throw err(429, 'Slow down a little and try again.'); const j = await jsonBody(req, 5e5); await tripAct(w, b, j.name, Array.isArray(j.args) ? j.args : []); return json(res, { state: pub.tripState(w.state, bid), version: await ws.version(w.id) }); }
      if (t[2] === 'id' && m === 'POST') {
        if (!auth.limit('id:' + ip(req), 10, 3600e3)) throw err(429, 'Too many uploads. Try again later.');
        if (b.status === 'request' || b.status === 'cancelled') throw err(400, 'Online check-in opens once your host confirms your stay.');
        const j = await jsonBody(req, 6e6); const mt = String(j.image || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
        if (!mt) throw err(400, 'That file is not a photo we can read. Try another.');
        const buf = Buffer.from(mt[2], 'base64'); if (buf.length > 4e6) throw err(413, 'That photo is too large.');
        await files.put('uploads/' + w.id + '/' + idFile(b.id), buf, 'image/' + mt[1]);
        await ws.act(w.id, 'checkin', [b.id, { id: true, selfie: true }]);
        return json(res, { ok: true, version: await ws.version(w.id) });
      }
      if (t[2] === 'deposit' && m === 'POST') {
        if (!stripeReady(w)) { await ws.act(w.id, 'checkin', [bid, { deposit: true }]); return json(res, { ok: true, state: pub.tripState(w.state, bid), version: await ws.version(w.id) }); }
        const g = w.state.guests.find(x => x.id === b.guestId);
        const s = await stripe.checkoutDeposit({ email: g && g.email, successUrl: urls.trip(w, b, 'checkin') + '&deposit=1', cancelUrl: urls.trip(w, b, 'checkin'), meta: { workspace: w.id, booking: b.id, kind: 'deposit' } });
        return json(res, { ok: true, checkoutUrl: s.url });
      }
    }
    return json(res, { error: 'Not found' }, 404);
  }

  /* trip app, calendar feeds and unsubscribe links (any host) */
  if ((mm = p.match(/^\/trip\/([a-z0-9-]+)\/([^/]+)\/invoice$/))) {
    const r = await ws.bySlug(mm[1]); const bid = decodeURIComponent(mm[2]); const k = u.searchParams.get('k');
    if (!r || !auth.verify(k, 'trip', r.id, bid)) return send(res, 403, pages.plain({ title: 'Link expired', body: '<h1>This invoice link has expired.</h1><p>Ask your host to send it again.</p>' }));
    const w = await ws.open(r.id); w.catchUp(); const b = w.state.bookings.find(x => x.id === bid); if (!b || b.channel !== 'direct' || b.status === 'request') return notFound(res);
    return sendInvoice(res, w, b, false);
  }
  if ((mm = p.match(/^\/trip\/([a-z0-9-]+)\/([^/]+)$/))) {
    const r = await ws.bySlug(mm[1]); const bid = decodeURIComponent(mm[2]); const k = u.searchParams.get('k');
    if (!r || !auth.verify(k, 'trip', r.id, bid)) return send(res, 403, pages.plain({ title: 'Link expired', body: '<h1>This trip link has expired.</h1><p>Ask your host to send it again.</p>' }));
    const w = await ws.open(r.id); w.catchUp(); const b = w.state.bookings.find(x => x.id === bid); if (!b) return notFound(res);
    const step = ['checkin', 'messages', 'guide', 'checkout', 'trip'].includes(u.searchParams.get('step')) ? u.searchParams.get('step') : (u.searchParams.get('done') || u.searchParams.get('paid') ? 'done' : null);
    return tripPage(res, w, b, k, step);
  }
  // <token>.ics carries direct bookings and blocks made here; <token>.<calendar>.ics (for example .airbnb.ics) also
  // carries the dates read from every other calendar, so Airbnb, Vrbo and Booking.com block each other through us.
  if ((mm = p.match(/^\/ical\/([a-z0-9-]+)\/([^/]+)\/([A-Za-z0-9_-]+)(?:\.([a-z]+))?\.ics$/))) {
    const r = await ws.bySlug(mm[1]); const pid = decodeURIComponent(mm[2]);
    if (!r || !auth.verify(mm[3], 'ical', r.id, pid) || (mm[4] && !ical.CHANNELS.includes(mm[4]))) return send(res, 404, 'Not found', 'text/plain');
    const w = await ws.open(r.id); w.catchUp(); const f = ical.feed(w.state, pid, MAIN_HOST, mm[4]); if (!f) return send(res, 404, 'Not found', 'text/plain');
    return send(res, 200, f, 'text/calendar; charset=utf-8', { 'cache-control': 'no-cache', 'content-disposition': 'inline; filename="' + pid + '.ics"' });
  }
  // Campaign click and open tracking: one count per guest, signed links only.
  if ((mm = p.match(/^\/(c|o)\/([a-z0-9-]+)\/([^/]+)\/([^/]+)\/([A-Za-z0-9_-]+)(\.gif)?$/))) {
    const r = await ws.bySlug(mm[2]); const w = r && await ws.open(r.id); const cid = decodeURIComponent(mm[3]), gid = decodeURIComponent(mm[4]);
    const ok = w && auth.verify(mm[5], mm[1] === 'c' ? 'click' : 'open', w.id, cid + ':' + gid);
    const c = ok && w.state.campaigns.find(x => x.id === cid);
    if (c) await ws.withWs(w.id, BB => { const x = BB.store.get().campaigns.find(y => y.id === cid); if (!x) return; x.openedBy = x.openedBy || []; x.clickedBy = x.clickedBy || [];
      let changed = false; if (!x.openedBy.includes(gid)) { x.openedBy.push(gid); changed = true; } if (mm[1] === 'c' && !x.clickedBy.includes(gid)) { x.clickedBy.push(gid); changed = true; }
      x.opens = x.openedBy.length; x.clicks = x.clickedBy.length; if (changed) BB.store.commit({ type: 'campaign', id: cid, quiet: true }); }, { quiet: true });
    if (mm[1] === 'o') return send(res, 200, Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'image/gif', { 'cache-control': 'no-store' });
    if (!c) return redirect(res, cfg.baseUrl);
    const prop = w.state.properties.find(x => x.id === (c.body || {}).propertyId) || w.state.properties[0];
    const dest = prop ? urls.site(w, prop) : cfg.baseUrl;
    return redirect(res, dest + (c.body && c.body.promo ? (dest.includes('?') ? '&' : '?') + 'promo=' + encodeURIComponent(c.body.promo) + '&utm_source=email&utm_campaign=' + encodeURIComponent(cid) : (dest.includes('?') ? '&' : '?') + 'utm_source=email&utm_campaign=' + encodeURIComponent(cid)));
  }
  if ((mm = p.match(/^\/u\/host\/([A-Za-z0-9_-]+)\/(setup|report|news)\/([A-Za-z0-9_-]+)$/))) {
    if (!hostMail.verifyUnsub(mm[1], mm[2], mm[3])) return notFound(res);
    const what = mm[2] === 'setup' ? 'setup tips' : mm[2] === 'news' ? 'news and offers' : 'the Monday report';
    if (m === 'POST') { await hostMail.setPrefs(mm[1], { [mm[2]]: false }); if (u.searchParams.get('c')) await campaigns.unsubscribed(u.searchParams.get('c'), 'h' + mm[1]); return send(res, 200, pages.plain({ title: 'Unsubscribed', body: '<h1>Done. No more ' + what + '.</h1><p>Booking, billing and security emails about your account still arrive. You can switch ' + what + ' back on in your account page.</p>' })); }
    return send(res, 200, pages.plain({ title: 'Unsubscribe', body: '<h1>Stop ' + what + '?</h1><p>Booking, billing and security emails still arrive.</p><form method="post"><button type="submit">Stop ' + what + '</button></form>' }));
  }
  // Team campaign opens and clicks (server/campaigns.js): one count per person, signed links only.
  if ((mm = p.match(/^\/t\/m\/([a-z0-9-]+)\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)\/(o\.gif|c)$/))) {
    const r = await campaigns.hit(mm[1], mm[2], mm[3], mm[4] === 'c' ? 'c' : 'o', u.searchParams.get('u'), u.searchParams.get('k'));
    if (mm[4] === 'o.gif') return send(res, 200, Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'), 'image/gif', { 'cache-control': 'no-store' });
    return redirect(res, r.to || cfg.baseUrl);
  }
  // Pause instead of cancel (server/flows.js): a signed link from the "before you go" email.
  if ((mm = p.match(/^\/u\/pause\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/))) {
    if (!flows.pauseOk(mm[1], mm[2])) return notFound(res);
    if (m === 'POST') {
      const f = await formBody(req), months = Math.max(1, Math.min(3, +f.months || 1)), r = await flows.pause(mm[1], months);
      if (r.alert) await flows.pauseFailed(mm[1], months);
      return send(res, 200, pages.plain({ title: r.ok ? 'Paused' : 'Pause', body: r.ok ? '<h1>Your plan is paused.</h1><p>Nothing will be charged until ' + E(new Date(r.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })) + ', when it starts again by itself. Your site, guest list and settings are all kept, and your plan is no longer set to cancel.</p><p><a href="/app/billing">See your billing</a></p>' : '<h1>Nearly there.</h1><p>' + E(r.error) + '</p>' }));
    }
    return send(res, 200, pages.plain({ title: 'Pause your plan', body: '<h1>Pause instead of cancelling</h1><p>Pick how long. Nothing is charged while your plan is paused, and your site, guest list and settings stay exactly as they are. It starts again by itself, and you can still cancel anytime.</p>' +
      '<form method="post">' + [1, 2, 3].map(n => '<p><label><input type="radio" name="months" value="' + n + '"' + (n === 1 ? ' checked' : '') + '> ' + n + ' month' + (n > 1 ? 's' : '') + '</label></p>').join('') + '<button type="submit">Pause my plan</button></form>' }));
  }
  if ((mm = p.match(/^\/u\/lead\/(\d+)\/([A-Za-z0-9_-]+)$/))) {
    if (!auth.verify(mm[2], 'lead', mm[1])) return notFound(res);
    if (m === 'POST') { await leads.unsubscribe(+mm[1]); if (u.searchParams.get('c')) await campaigns.unsubscribed(u.searchParams.get('c'), 'l' + mm[1]); return send(res, 200, pages.plain({ title: 'Unsubscribed', body: '<h1>You are unsubscribed.</h1><p>We will not email you again about our guides, tips or offers.</p>' })); }
    return send(res, 200, pages.plain({ title: 'Unsubscribe', body: '<h1>Stop emails from Bookingbooster?</h1><p>No more guides, tips or offers. This takes one click.</p><form method="post"><button type="submit">Unsubscribe</button></form>' }));
  }
  if ((mm = p.match(/^\/guides\/([a-z0-9-]+\.pdf)$/))) {
    if (cfg.serverless) { // on Supabase the PDFs ship as static files of two small functions (see supabase/config.toml)
      const fn = GUIDES_A.includes(mm[1]) ? 'guides-a' : 'guides-b';
      const r = await fetch(cfg.supabaseUrl + '/functions/v1/' + fn + '/' + mm[1]); if (!r.ok) return notFound(res);
      return send(res, 200, Buffer.from(await r.arrayBuffer()), 'application/pdf', { 'cache-control': 'public, max-age=86400' });
    }
    const f = path.join(ROOT, 'web', 'guides', mm[1]); if (!fs.existsSync(f)) return notFound(res);
    res.writeHead(200, Object.assign({}, SEC, { 'content-type': 'application/pdf', 'cache-control': 'public, max-age=86400', 'content-length': fs.statSync(f).size }));
    return fs.createReadStream(f).pipe(res);
  }
  if ((mm = p.match(/^\/media\/([a-z0-9-]+\.(mp4|jpg))$/))) { // explainer video and demo screenshots for the marketing site
    const type = mm[2] === 'mp4' ? 'video/mp4' : 'image/jpeg';
    let buf = MEDIA.get(mm[1]);
    if (!buf) {
      if (cfg.serverless) { // on Supabase they ship as static files of the small "media" function (see supabase/config.toml)
        const r = await fetch(cfg.supabaseUrl + '/functions/v1/media/' + mm[1]); if (!r.ok) return notFound(res);
        buf = Buffer.from(await r.arrayBuffer());
      } else {
        const f = path.join(ROOT, 'supabase', 'functions', 'media', 'files', mm[1]); if (!fs.existsSync(f)) return notFound(res);
        buf = fs.readFileSync(f);
      }
      MEDIA.set(mm[1], buf);
    }
    const hd = { 'cache-control': 'public, max-age=86400', 'accept-ranges': 'bytes' };
    const rg = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ''));
    if (rg && (rg[1] || rg[2])) { // browsers (Safari above all) stream video in byte ranges
      let a = rg[1] ? +rg[1] : Math.max(0, buf.length - +rg[2]), b = rg[1] && rg[2] ? Math.min(+rg[2], buf.length - 1) : buf.length - 1;
      if (a >= buf.length || a > b) { res.writeHead(416, Object.assign({}, SEC, { 'content-range': 'bytes */' + buf.length })); return res.end(); }
      res.writeHead(206, Object.assign({}, SEC, hd, { 'content-type': type, 'content-range': 'bytes ' + a + '-' + b + '/' + buf.length, 'content-length': b - a + 1 }));
      return res.end(req.method === 'HEAD' ? undefined : buf.subarray(a, b + 1));
    }
    res.writeHead(200, Object.assign({}, SEC, hd, { 'content-type': type, 'content-length': buf.length }));
    return res.end(req.method === 'HEAD' ? undefined : buf);
  }
  if ((mm = p.match(/^\/u\/([a-z0-9-]+)\/([^/]+)\/([A-Za-z0-9_-]+)$/))) {
    const r = await ws.bySlug(mm[1]); const gid = decodeURIComponent(mm[2]);
    if (!r || !auth.verify(mm[3], 'unsub', r.id, gid)) return notFound(res);
    const w = await ws.open(r.id);
    if (m === 'POST') { await ws.act(w.id, 'unsubscribe', [gid]); return send(res, 200, pages.plain({ title: 'Unsubscribed', body: '<h1>You are unsubscribed.</h1><p>You will not get offers from ' + E(w.state.account.business) + ' again. Booking emails for any stay you have booked still arrive.</p>' })); }
    return send(res, 200, pages.plain({ title: 'Unsubscribe', body: '<h1>Stop emails from ' + E(w.state.account.business) + '?</h1><p>You will still get emails about any stay you have booked.</p><form method="post"><button type="submit">Unsubscribe</button></form>' }));
  }

  /* funnels made in the funnel creator: /f/<host>/<funnel>[/<step>] */
  if (p.startsWith('/f/') && await studio.funnel(req, res, p, m, u)) return;

  /* custom domains and site subdomains: the host's own booking site */
  const dom = host && host !== MAIN_HOST && await ws.domain(host);
  if (dom) {
    if (!dom.verified) return send(res, 404, pages.plain({ title: 'Coming soon', body: '<h1>This booking site is being connected.</h1><p>Check back soon.</p>' }));
    if (host.startsWith('www.')) return send(res, 301, '', 'text/plain', { location: 'https://' + dom.host + req.url });
    const w = await ws.open(dom.workspace_id); w.catchUp(); const prop = w.state.properties.find(x => x.id === dom.property_id);
    if (!prop) return notFound(res);
    if (await hiddenFrom(req, w)) return comingSoon(res, w);
    const canonical = 'https://' + host.replace(/:\d+$/, '') + '/';
    if (p === '/robots.txt') return send(res, 200, seo.robots(canonical + 'sitemap.xml'), 'text/plain; charset=utf-8');
    if (p === '/sitemap.xml') return send(res, 200, seo.sitemapFor(w.state, [[prop, canonical]], [canonical + 'llms.txt']), 'application/xml');
    if (p === '/llms.txt') return send(res, 200, seo.llms(w.state, prop, canonical), 'text/plain; charset=utf-8');
    if (p === '/' + seo.indexNowKey(cfg.secret, w.id) + '.txt') return send(res, 200, seo.indexNowKey(cfg.secret, w.id), 'text/plain; charset=utf-8');
    if (p === '/' || p === '/book') return await sitePage(res, w, prop, canonical, host.replace(/:\d+$/, ''), req);
    return notFound(res);
  }

  /* property sites on the main domain: /s/<host>/<home> */
  if ((mm = p.match(/^\/s\/([a-z0-9-]+)(?:\/([^/]+))?(\/llms\.txt|\/sitemap\.xml)?\/?$/))) {
    const r = await ws.bySlug(mm[1]); if (!r) return notFound(res);
    const w = await ws.open(r.id); w.catchUp();
    if (mm[2] === seo.indexNowKey(cfg.secret, w.id) + '.txt' && !mm[3]) return send(res, 200, seo.indexNowKey(cfg.secret, w.id), 'text/plain; charset=utf-8');
    const prop = mm[2] && mm[2] !== 'sitemap.xml' && mm[2] !== 'llms.txt' ? w.state.properties.find(x => x.id === decodeURIComponent(mm[2])) : w.state.properties[0];
    if (!prop) return notFound(res);
    if (await hiddenFrom(req, w)) return comingSoon(res, w);
    const canonical = cfg.baseUrl + '/s/' + w.slug + '/' + prop.id;
    if (mm[3] === '/llms.txt' || mm[2] === 'llms.txt') return send(res, 200, seo.llms(w.state, prop, canonical), 'text/plain; charset=utf-8');
    if (mm[3] === '/sitemap.xml' || mm[2] === 'sitemap.xml') return send(res, 200, seo.sitemapFor(w.state, w.state.properties.map(x => [x, cfg.baseUrl + '/s/' + w.slug + '/' + x.id])), 'application/xml');
    if (!mm[2]) return redirect(res, canonical);
    return await sitePage(res, w, prop, canonical, null, req);
  }

  /* partner programme: referral links, /partners pages */
  if (await aff.route(req, res, u, p, m)) return;

  /* marketing site */
  if (p === '/signup' || p === '/register' || p === '/join') return redirect(res, '/start' + u.search);
  if (p === '/' || p === '/pricing' || p === '/start') {
    const view = p === '/start' ? 'onboard' : 'home';
    // Funnel checkouts hand off to /start?plan=Growth&annual=1&addon=1&email=…&name=…&business=… to prefill the sign-up.
    const q = k => String(u.searchParams.get(k) || '').trim().slice(0, 120);
    const pre = p === '/start' ? { plan: ['starter', 'growth', 'portfolio'].includes(q('plan').toLowerCase()) ? q('plan').toLowerCase() : undefined,
      annual: q('annual') === '1', addon: q('addon') === '1', ref: aff.cookieCode(req), email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(q('email')) ? q('email') : '', name: q('name'), business: q('business') } : {};
    const co = publicCompany();
    return send(res, 200, pages.page({ title: p === '/start' ? 'Start your booking site · Bookingbooster' : mkt.TITLE, description: mkt.DESCRIPTION,
      head: mkt.head(cfg.baseUrl, p) + (p === '/' ? mkt.ldScript(cfg.baseUrl, co) + (google.enabled ? await google.metaTag(new URL(cfg.baseUrl).origin) : '') : ''), content: p === '/' ? mkt.content(cfg.baseUrl, co) : '',
      boot: { mode: 'marketing', state: marketing(), opts: Object.assign({ view }, pre), company: co, signupUrl: '/api/signup', dns: await domains.targets(), domainOffer: registrar.offer(), domainSearchUrl: '/api/domains/search', payFirst: stripe.enabled, loggedIn: !!await me(req) } }), 'text/html; charset=utf-8', { 'cache-control': 'no-cache' });
  }
  if (m === 'GET' && Object.hasOwn(answers.PAGES, p)) { const a = answers.render(cfg.baseUrl, p); return send(res, 200, pages.plain({ title: a.title, head: a.head, body: a.body, wide: 'read', index: true }), 'text/html; charset=utf-8', { 'cache-control': 'no-cache' }); }
  if (p === '/robots.txt') return send(res, 200, seo.robots(cfg.baseUrl + '/sitemap.xml'), 'text/plain; charset=utf-8');
  if (p === '/sitemap.xml') {
    // Privacy and terms join the sitemap once a solicitor has reviewed them (LEGAL_REVIEWED); until then they say Draft and stay out of search.
    const list = [{ loc: cfg.baseUrl + '/' }, { loc: cfg.baseUrl + '/help' }].concat(answers.list().map(x => ({ loc: cfg.baseUrl + x.path }))).concat(cfg.legalReviewed ? [{ loc: cfg.baseUrl + '/privacy' }, { loc: cfg.baseUrl + '/terms' }] : []);
    for (const id of await ws.liveIds()) { const w = await ws.open(id); if (unpaid(w)) continue; for (const x of w.state.properties) if (x.published !== false) list.push({ loc: urls.site(w, x), lastmod: w.state.today }); }
    return send(res, 200, seo.sitemap(list.filter(x => x.loc.startsWith(cfg.baseUrl))), 'application/xml');
  }
  if (p === '/llms.txt') return send(res, 200, mkt.llms(cfg.baseUrl, publicCompany()), 'text/plain; charset=utf-8');
  if (p === '/llms-full.txt') return send(res, 200, mkt.llms(cfg.baseUrl, publicCompany()) + '\n---\n\n' + answers.fullText(cfg.baseUrl), 'text/plain; charset=utf-8');
  if (p === '/' + ownIndexKey() + '.txt') return send(res, 200, ownIndexKey(), 'text/plain; charset=utf-8');
  if (p === '/api/signup' && m === 'POST') return await signup(req, res);
  // Sign-up domain step: is this name free to register? { live: false } when buying domains is switched off.
  if (p === '/api/domains/search' && m === 'GET') {
    if (!auth.limit('dsearch:' + ip(req), 60, 3600e3)) throw err(429, 'Too many searches. Try again in a few minutes.');
    if (!registrar.enabled()) return json(res, { live: false });
    const names = String(u.searchParams.get('names') || '').split(',').slice(0, 8);
    try { return json(res, { live: true, results: await registrar.search(names) }); }
    catch (e) { log('domain search', e.message); throw err(502, 'We could not check domains just now. Try again in a minute.'); }
  }
  if (p === '/admin') return await adminPage(req, res);
  if (p === '/admin/affiliates' || p.startsWith('/admin/affiliates/')) { if (!await isAdmin(req)) return notFound(res); if (await aff.admin(req, res, p, m, ((await me(req)) || {}).email)) return; return notFound(res); }
  if (m === 'GET' && (p === '/admin/leads' || p === '/admin/settings')) return await adminPage(req, res, '', p.slice(7));
  if (p === '/admin/hosts' || p.startsWith('/admin/hosts/')) {
    if (!await isAdmin(req)) return notFound(res);
    const U = usersAdmin(req), hm = p.match(/^\/admin\/hosts\/([A-Za-z0-9_-]+)(\/reset)?$/);
    if (p === '/admin/hosts' && m === 'GET') return await U.listPage(res, u.searchParams);
    if (p === '/admin/hosts/export.csv' && m === 'GET') return await U.csv(res);
    if (hm && !hm[2] && m === 'GET') return await U.detailPage(res, hm[1]);
    if (hm && hm[2] && m === 'POST') { // the team sends the host the same reset link as /forgot
      const r0 = await db.prepare('SELECT email FROM users WHERE workspace_id = ? ORDER BY created_at LIMIT 1').get(hm[1]); const r = r0 && await auth.startReset(r0.email);
      if (r) { await signin.sendReset(r, req, true); log('admin', 'password reset sent for', hm[1]); }
      return await U.detailPage(res, hm[1], r ? 'Password reset link sent to ' + r.user.email + '. It works for one hour.' : '', r ? '' : 'This account has no sign-in email.');
    }
    return notFound(res);
  }
  if (p === '/admin/flows/run' && m === 'POST' && cfg.testClock && await isAdmin(req)) { const b = await jsonBody(req, 1e3); return json(res, { sent: await flows.run(+b.at || Date.now(), true) }); } // test servers only
  if (p === '/admin/flows' || p.startsWith('/admin/flows/')) { if (!await isAdmin(req)) return notFound(res); return await flowsAdmin({ flows, E, ui: adminUi, email: async () => ((await me(req)) || {}).email, send, redirect, formBody })(req, res, p, m); }
  if (p === '/admin/campaigns/run' && m === 'POST' && cfg.testClock && await isAdmin(req)) { const b = await jsonBody(req, 1e3); return json(res, { sent: await campaigns.run(+b.at || Date.now()) }); } // test servers only
  if (p === '/admin/campaigns' || p.startsWith('/admin/campaigns/')) { if (!await isAdmin(req)) return notFound(res); return await campaignsAdmin({ campaigns, leads, cfg, E, ui: adminUi, email: async () => ((await me(req)) || {}).email, send, redirect, formBody, me })(req, res, p, m, u); }
  if (p === '/admin/emails' || p.startsWith('/admin/emails/') || p === '/admin/social') { if (!await isAdmin(req)) return notFound(res); return await adminContent({ cfg, msg, leads, campaigns, social, ui: adminUi, E, send, email: async () => ((await me(req)) || {}).email })(req, res, p, m, u); }
  if (p === '/admin/backup') {
    if (!await isAdmin(req)) return notFound(res);
    const name = 'bookingbooster-' + new Date().toISOString().slice(0, 10) + '.json';
    return send(res, 200, JSON.stringify(await backup.dump()), 'application/json', { 'content-disposition': 'attachment; filename="' + name + '"', 'cache-control': 'no-store' });
  }
  if (p.startsWith('/admin/') && m === 'POST') {
    if (p === '/admin/hostmail/run' && cfg.testClock && await isAdmin(req)) { const b = await jsonBody(req, 1e3); return json(res, { sent: await hostMail.run(+b.at || Date.now()) }); } // test servers only
    if (p === '/admin/leads/outreach/enroll' && cfg.testClock && await isAdmin(req)) { const b = await jsonBody(req, 1e3); return json(res, await leads.outreach.enroll(+b.id, +b.at || undefined)); } // test servers only, until the outreach series are switched on
    if (p === '/admin/leads/run' && cfg.testClock && await isAdmin(req)) { const b = await jsonBody(req, 1e3); return json(res, { sent: await leads.run(+b.at || Date.now()) }); } // test servers only: run the clock forward
    if (p === '/admin/leads/import') return await leadImportPost(req, res);
    return await adminPost(req, res, p);
  }
  if (p === '/api/leads' && (m === 'POST' || m === 'OPTIONS')) return lead(req, res);

  /* demo */
  if (p === '/demo' || p.startsWith('/api/demo/') || p.startsWith('/demo/')) {
    const c = cookies(req); let wid = c.bb_demo; let r = wid && await ws.row(wid);
    const headers = {};
    if (!r || r.kind !== 'demo') { wid = await ws.createDemo(); headers['set-cookie'] = cookie('bb_demo', wid, 7 * 86400); }
    await ws.touch(wid);
    if (p === '/demo') { const w = await ws.open(wid); return send(res, 200, pages.page({ title: 'Bookingbooster demo', robots: 'noindex', bundle: 'demo', boot: { mode: 'demo', state: w.state, version: await ws.version(wid), actUrl: '/api/demo/act', stateUrl: '/api/demo/state', poll: cfg.serverless, streamUrl: '/api/demo/stream' } }), 'text/html; charset=utf-8', Object.assign({ 'cache-control': 'no-store' }, headers)); }
    if (p === '/api/demo/state') return json(res, { state: (await ws.open(wid)).state, version: await ws.version(wid) }, 200, headers);
    if (p === '/api/demo/stream') return await stream(res, u, wid, headers);
    if (p === '/api/demo/act' && m === 'POST') { const j = await jsonBody(req, 2e6); const r2 = await ws.act(wid, String(j.name), Array.isArray(j.args) ? j.args : []); return json(res, { state: r2.w.state, version: r2.version, result: r2.result }, 200, headers); }
    if (p.startsWith('/api/demo/seo/')) { const w = await ws.open(wid); if (await seoApi(req, res, p.replace('/api/demo/', '/api/'), m, w, false, headers)) return; }
    if (p.startsWith('/api/demo/studio/') || p.startsWith('/api/demo/funnels/') || p.startsWith('/api/demo/eventads/')) { const w = await ws.open(wid); if (await studio.host(req, res, p, m, w, headers)) return; }
    if (p.startsWith('/demo/studio/') || p.startsWith('/demo/funnel/')) { const w = await ws.open(wid); if (studio.preview(res, w, p, u.searchParams, true)) return; }
    if (p === '/api/demo/reset' && m === 'POST') { await ws.resetDemo(wid); return json(res, { state: (await ws.open(wid)).state, version: await ws.version(wid) }, 200, headers); }
    return notFound(res);
  }

  /* sign in, sign out, password reset */
  if (p === '/login' && m === 'GET') { if (await me(req)) return redirect(res, '/app'); return send(res, 200, loginForm({ next: u.searchParams.get('next') })); }
  if (p === '/login' && m === 'POST') {
    const f = await formBody(req);
    if (!auth.limit('login:' + ip(req), 10, 900e3)) return send(res, 429, loginForm({ err: 'Too many attempts. Wait 15 minutes.', email: f.email }));
    const user = await auth.login(f.email, f.password);
    if (!user) return send(res, 401, loginForm({ err: 'That email and password do not match.', email: f.email, next: f.next }));
    const next = /^\/app(\/|$|\?)/.test(f.next || '') && f.next !== '/app' ? f.next : (await isAdminEmail(user.email) ? '/admin' : '/app');
    return redirect(res, next, { 'set-cookie': cookie('bb_s', await auth.startSession(user.id), 30 * 86400) });
  }
  if (p.startsWith('/login/') && await signin.route(req, res, p, m, u, { authPage, formBody, send, redirect, ip,
    signIn: async (r, user) => redirect(r, await isAdminEmail(user.email) ? '/admin' : '/app', { 'set-cookie': cookie('bb_s', await auth.startSession(user.id), 30 * 86400) }) })) return;
  if (p === '/logout' && m === 'POST') { await auth.endSession(cookies(req).bb_s); return redirect(res, '/login', { 'set-cookie': cookie('bb_s', '', 0) }); }
  if (p === '/forgot' && m === 'GET') return send(res, 200, authPage('Reset password', '<h1>Reset your password</h1><p>We will email you a link.</p><form method="post"><label>Email<input name="email" type="email" required autocomplete="email"></label><button>Email me a link</button></form>'));
  if (p === '/forgot' && m === 'POST') {
    const f = await formBody(req);
    if (auth.limit('forgot:' + ip(req), 5, 3600e3)) { const r = await auth.startReset(f.email); if (r) signin.sendReset(r, req).catch(e => log('signin', 'reset email failed', e.message)); }
    return send(res, 200, authPage('Check your email', '<h1>Check your email</h1><p>If there is an account for that address, a reset link is on its way. It works for one hour.</p>'));
  }
  if (p === '/reset') {
    const t = u.searchParams.get('t') || '';
    if (m === 'GET') return send(res, 200, authPage('New password', '<h1>Choose a new password</h1><form method="post"><input type="hidden" name="t" value="' + E(t) + '"><label>New password<input name="password" type="password" minlength="10" required autocomplete="new-password"></label><button>Save and sign in</button></form>'));
    const f = await formBody(req); if (String(f.password || '').length < 10) return send(res, 400, authPage('New password', '<h1>Choose a new password</h1><p class="err">Use at least 10 characters.</p><p><a href="/reset?t=' + E(f.t) + '">Try again</a></p>'));
    const user = await auth.finishReset(f.t, f.password); if (!user) return send(res, 400, authPage('Link expired', '<h1>That link has expired.</h1><p><a href="/forgot">Ask for a new one</a></p>'));
    return redirect(res, '/app', { 'set-cookie': cookie('bb_s', await auth.startSession(user.id), 30 * 86400) });
  }
  if (p === '/help' || p === '/privacy' || p === '/terms') return send(res, 200, authPage({ help: 'Help', privacy: 'Privacy notice', terms: 'Terms of service' }[p.slice(1)] + ' · Bookingbooster', staticPage(p), p !== '/help' && 'read', p === '/help' || !!cfg.legalReviewed));

  /* host console and API (signed in) */
  if (p === '/app' || p.startsWith('/app/') || p.startsWith('/api/')) {
    const s = await me(req);
    if (!s) return p.startsWith('/api/') ? json(res, { error: 'Sign in again' }, 401) : redirect(res, '/login?next=' + encodeURIComponent(p));
    const w = await ws.open(s.workspace_id); if (!w) return json(res, { error: 'Workspace missing' }, 500);
    if (!PAY_OPEN.includes(p) && !p.startsWith('/app/account/') && await mustPay(req, w)) return p.startsWith('/api/') ? json(res, { error: 'Start your plan to begin setting up.', redirect: '/app/pay' }, 402) : redirect(res, '/app/pay');
    if (p === '/app/pay') { if (!await mustPay(req, w)) return redirect(res, '/app'); return send(res, 200, payPage(w, u.searchParams.get('msg') === 'pending' ? 'We are still confirming your payment with Stripe. Refresh this page in a minute.' : '')); }
    if (p === '/app/pay/done') {
      const sid = String(u.searchParams.get('session') || '');
      if (/^cs_[A-Za-z0-9_]+$/.test(sid) && stripe.enabled) {
        try { const cs = await stripe.api('GET', '/checkout/sessions/' + sid); const md = cs.metadata || {};
          if (cs.status === 'complete' && md.kind === 'plan' && md.workspace === w.id) await planPaid(w.id, cs.customer, md.plan); } catch (e) { log('pay done', e.message); }
      }
      return redirect(res, await mustPay(req, w) ? '/app/pay?msg=pending' : '/app?welcome=1');
    }
    if (w.catchUp()) ws.persist(w, { rollover: true });
    if (p === '/app' || p === '/app/phone') { flows.seen(w.id).catch(() => {}); } // for the quiet-host check
    if (p === '/app' || p === '/app/phone') return send(res, 200, pages.page({ title: w.state.account.business + ' · Bookingbooster', robots: 'noindex', app: true, boot: await hostBoot(w, p === '/app/phone' ? 'mobile' : 'app'), banner: testNotes().length && u.searchParams.get('welcome') ? '<b>Test mode</b> ' + E(testNotes().join(', ')) + ' are not switched on for this server yet.' : (await isAdmin(req) ? '<b>Team</b> <a href="/admin">Open the team admin</a>: leads and outreach, email campaigns and templates, host accounts, Stripe.' : null) }), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
    if (p === '/app/billing') return send(res, 200, await billingPage(w, u.searchParams));
    if (p === '/app/account' && m === 'GET') return send(res, 200, await accountPage(w, s, u.searchParams.get('msg')));
    if (p === '/app/account/export') { // everything in the account, as one JSON file (UK GDPR data portability)
      const out = { exported_at: new Date().toISOString(), account: w.state.account, homes: w.state.properties, bookings: w.state.bookings, guests: w.state.guests, messages: w.state.threads, campaigns: w.state.campaigns, automations: w.state.automations, blocks: w.state.blocks };
      return send(res, 200, JSON.stringify(out, null, 2), 'application/json; charset=utf-8', { 'content-disposition': 'attachment; filename="bookingbooster-' + w.slug + '.json"', 'cache-control': 'no-store' });
    }
    if (p === '/app/account/guests.csv') {
      const c = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
      const rows = [['Name', 'Email', 'Phone', 'City', 'Subscribed', 'Stays', 'Last stay', 'Tags']].concat(w.state.guests.map(g => { const st = w.state.bookings.filter(b => b.guestId === g.id && !['cancelled', 'request'].includes(b.status)); return [g.name, g.email, g.phone, g.city, g.subscribed ? 'yes' : 'no', st.length + (g.stays || 0), st.map(b => b.checkIn).sort().pop() || g.lastStay || '', (g.tags || []).join('; ')]; }));
      return send(res, 200, '\ufeff' + rows.map(r => r.map(c).join(',')).join('\r\n'), 'text/csv; charset=utf-8', { 'content-disposition': 'attachment; filename="guests-' + w.slug + '.csv"', 'cache-control': 'no-store' });
    }
    if (p.startsWith('/app/account/') && m === 'POST') return accountPost(req, res, p, w, s);
    if (p === '/app/billing/start' && m === 'POST') {
      if (!stripe.enabled) return redirect(res, '/app/billing?msg=stripe');
      const r = await ws.row(w.id); if (r.stripe_customer && !offPlan(r.billing_status)) return redirect(res, '/app/billing');
      return redirect(res, (await planCheckout(w)).url);
    }
    if (p === '/app/billing/topup' && m === 'POST') {
      const f = await formBody(req); const pounds = credits.topupAmount(f.custom ? f.custom : f.amount);
      if (!pounds) return redirect(res, '/app/billing?msg=topup#ai-credit');
      if (!stripe.enabled) return redirect(res, '/app/billing?msg=stripe#ai-credit');
      if (!auth.limit('topup:' + w.id, 20, 3600e3)) throw err(429, 'Too many tries. Try again in an hour.');
      const r = await ws.row(w.id);
      const sess = await stripe.checkoutCredit({ customer: r.stripe_customer, email: w.state.account.email, pounds, successUrl: cfg.baseUrl + '/app/billing?topup=' + pounds + '#ai-credit', cancelUrl: cfg.baseUrl + '/app/billing#ai-credit', meta: { workspace: w.id, kind: 'credit', pounds: String(pounds) } });
      return redirect(res, sess.url);
    }
    if (p === '/app/billing/portal' && m === 'POST') { const r = await ws.row(w.id); if (!r.stripe_customer) return redirect(res, '/app/billing'); return redirect(res, await stripe.portal(r.stripe_customer, cfg.baseUrl + '/app/billing')); }
    if (p === '/app/stripe/connect') {
      if (!stripe.enabled) return redirect(res, '/app?stripe=off');
      const r = await ws.row(w.id); const c = await stripe.connect({ email: w.state.account.email, business: w.state.account.business, accountId: r.stripe_account, returnUrl: cfg.baseUrl + '/app/stripe/return', refreshUrl: cfg.baseUrl + '/app/stripe/connect' });
      if (!r.stripe_account) await ws.setMeta(w.id, { stripe_account: c.account });
      return redirect(res, c.url);
    }
    if (p === '/app/stripe/return') { const r = await ws.row(w.id); if (r.stripe_account) { const a = await stripe.account(r.stripe_account); await markStripe(w.id, a.charges, a.bank); } return redirect(res, '/app#connections'); }
    if (p === '/api/state') return json(res, Object.assign({ state: w.state, version: await ws.version(w.id) }, hostLinks(w)));
    if (p === '/api/stream') return await stream(res, u, w.id);
    if ((p.startsWith('/api/studio/') || p.startsWith('/api/funnels/') || p.startsWith('/api/eventads/')) && await studio.host(req, res, p, m, w)) return;
    if ((p.startsWith('/app/studio/') || p.startsWith('/app/funnel/')) && studio.preview(res, w, p, u.searchParams)) return;
    if (p === '/api/act' && m === 'POST') {
      const j = await jsonBody(req, 3e6); const name = String(j.name || '');
      if (['nextDay', 'simulateCampaign', 'applyCalendar', 'applyAiResults', 'paymentConfirmed', 'expirePending', 'setIndexing'].includes(name)) throw err(403, 'That action is not available in a live account.');
      if (name === 'toggleIntegration' && j.args) {
        const iid = j.args[0], cur = w.state.integrations.find(i => i.id === iid);
        if (!cur) throw err(404, 'Unknown connection');
        if (SOON.includes(iid)) throw err(400, cur.name + ' is coming soon.');
        if (iid === 'lock' && !cur.connected) throw err(400, 'Paste your Nuki API token to connect your locks.');
        if (iid === 'lock' && cur.connected) await secrets.del(w.id, 'nuki');
        if (iid === 'sms' && !cur.connected && !cfg.sms.sid) { /* allowed: texts stay in the outbox until Twilio keys are set */ }
        if (cur.api && !cur.connected) throw err(400, 'Add your ' + cur.name + ' key to connect it.');
        if (cur.addon && !cur.api && !cur.connected) throw err(400, 'Paste a calendar link to turn on calendar sync.');
        if (cur.api && cur.connected) await effects.channels.disconnect(w, iid); // reopens the dates we closed there and forgets the key
      }
      if (name === 'toggleIntegration' && j.args && j.args[0] === 'stripe' && stripe.enabled) { const on = w.state.integrations.find(i => i.id === 'stripe').connected; if (!on) return json(res, { state: w.state, version: await ws.version(w.id), redirect: '/app/stripe/connect', notice: 'Opening Stripe to connect your account' }); }
      const r = await ws.act(w.id, name, Array.isArray(j.args) ? j.args : []);
      return json(res, Object.assign({ state: r.w.state, version: r.version, result: r.result }, name === 'addProperty' || name === 'updateProperty' ? hostLinks(r.w) : {}));
    }
    if ((mm = p.match(/^\/app\/invoice\/([^/]+)$/))) { const b = w.state.bookings.find(x => x.id === decodeURIComponent(mm[1])); if (!b || b.channel !== 'direct') return notFound(res); return sendInvoice(res, w, b, true); }
    if ((mm = p.match(/^\/app\/id\/([^/]+)$/))) { const b = await files.get('uploads/' + w.id + '/' + idFile(decodeURIComponent(mm[1]))); if (!b) return notFound(res); return send(res, 200, b, 'image/jpeg', { 'cache-control': 'private, no-store' }); }
    if ((mm = p.match(/^\/app\/photos\/([a-z0-9-]+)$/)) && m === 'POST') {
      const prop = w.state.properties.find(x => x.id === mm[1]); if (!prop) throw err(404, 'Home not found');
      if ((prop.photos || []).length >= 24) throw err(400, 'You can add up to 24 photos to a home.');
      const j = await jsonBody(req, 8e6); const mt = String(j.image || '').match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
      if (!mt) throw err(400, 'That file is not a photo we can read. Try a JPEG or PNG.');
      const buf = Buffer.from(mt[2], 'base64'); if (buf.length > 6e6) throw err(413, 'That photo is too large.');
      const magic = buf.slice(0, 4).toString('hex'); if (!/^ffd8ff|^89504e47|^52494646/.test(magic)) throw err(400, 'That file is not a photo we can read.');
      const ext = { jpeg: 'jpg', png: 'png', webp: 'webp' }[mt[1]]; const name = crypto.randomBytes(9).toString('hex') + '.' + ext;
      await files.put('media/' + w.id + '/' + prop.id + '/' + name, buf, 'image/' + mt[1]);
      const photo = { url: cfg.baseUrl + '/media/' + w.id + '/' + prop.id + '/' + name, cap: String(j.cap || '').trim().slice(0, 80) };
      const r = await ws.act(w.id, 'updateProperty', [prop.id, { photos: (prop.photos || []).concat(photo) }, true]);
      return json(res, Object.assign({ state: r.w.state, version: r.version, photo }, hostLinks(r.w)));
    }
    if ((p === '/app/domain' || p === '/app/domain/check') && m === 'POST') {
      const j = await jsonBody(req, 4e3); const prop = w.state.properties.find(x => x.id === j.propertyId); if (!prop) throw err(404, 'Home not found');
      if (p === '/app/domain') {
        const h = domains.clean(j.domain); const bad = domains.problem(h); if (bad) throw err(400, bad);
        if (h && w.state.properties.some(x => x.id !== prop.id && x.domain === h)) throw err(400, 'Another of your homes already uses ' + h + '.');
        const ex = h && await ws.domain(h);
        if (ex && ex.workspace_id !== w.id && !ex.verified) await ws.dropDomain(h); // an unproven claim from another account never blocks the owner
        await ws.act(w.id, 'updateProperty', [prop.id, { domain: h }, true]);
        if (!h) return json(res, Object.assign({ state: (await ws.open(w.id)).state, version: await ws.version(w.id), domain: null }, hostLinks(await ws.open(w.id))));
      }
      const h = domains.clean((await ws.open(w.id)).state.properties.find(x => x.id === prop.id).domain); if (!h) throw err(400, 'Add your web address first.');
      const c = await domains.check(w.id, h); const row = await ws.domain(h);
      if (c.live && !(row && row.workspace_id === w.id && row.verified)) { await ws.claimDomain(h, w.id, prop.id); domains.certify(h); log('domain live', w.id, h); }
      c.live = !!(await ws.domain(h) || {}).verified && (await ws.domain(h)).workspace_id === w.id;
      c.elsewhere = !c.live && !!row && row.workspace_id !== w.id;
      c.https = c.live ? await domains.https(h) : false;
      return json(res, Object.assign({ state: (await ws.open(w.id)).state, version: await ws.version(w.id), domain: c }, hostLinks(await ws.open(w.id))));
    }
    if (p === '/app/nuki' && m === 'POST') {
      const j = await jsonBody(req, 4e3); const token = String(j.token || '').trim();
      if (!/^[A-Za-z0-9._-]{20,400}$/.test(token)) throw err(400, 'That does not look like a Nuki API token. Create one in Nuki Web under API.');
      let locks;
      try {
        const r = await fetch('https://api.nuki.io/smartlock', { headers: { authorization: 'Bearer ' + token, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
        if (r.status === 401 || r.status === 403) throw err(400, 'Nuki did not accept that token. Check it has the "Manage smart locks" permission.');
        if (!r.ok) throw err(502, 'Nuki answered with error ' + r.status + '. Try again in a minute.');
        locks = (await r.json()).map(x => ({ id: String(x.smartlockId), name: String(x.name || 'Lock').slice(0, 60) }));
      } catch (e) { if (e.status) throw e; throw err(502, 'Could not reach Nuki. Try again in a minute.'); }
      await secrets.set(w.id, 'nuki', token);
      const r = await ws.withWs(w.id, BB => { const i = BB.q.integration('lock'); i.connected = true; i.lastSync = BB.store.get().today + 'T' + BB.store.get().clock; i.locks = locks; i.detail = locks.length + (locks.length === 1 ? ' lock' : ' locks') + ' found in your Nuki account';
        BB.log('sync', 'Nuki smart locks', 'Connected Nuki. Found ' + locks.length + (locks.length === 1 ? ' lock.' : ' locks.') + ' Pick the lock for each home in Website & SEO, Guest details.', 'lock'); BB.store.commit({ type: 'integration', id: 'lock' }); });
      return json(res, { state: (await ws.open(w.id)).state, version: await ws.version(w.id), locks });
    }
    if (p === '/api/suggest' && m === 'POST') {
      if (!assist.enabled) return json(res, { text: null });
      if (!auth.limit('suggest:' + w.id, 120, 3600e3)) throw err(429, 'Too many drafts this hour. Try again later.');
      const j = await jsonBody(req, 2e3); const t = w.state.threads.find(x => x.id === j.threadId); if (!t) throw err(404, 'Conversation not found');
      try { await credits.check(w.id); } catch (e) { if (e.code === 'ai_credit') return json(res, { text: null, credit: { empty: true, message: e.message, url: e.topupUrl } }); throw e; }
      try { return json(res, { text: await assist.draft(w.state, t, credits.meter(w.id, 'reply')) }); } catch (e) { log('assist', e.message); return json(res, { text: null }); }
    }
    if (p.startsWith('/api/seo/') && await seoApi(req, res, p, m, w, true)) return;
    if (p === '/api/credits') return json(res, Object.assign(await credits.summary(w.id), { recent: await credits.recent(w.id, 20) }));
    if (p === '/api/trip-link' && m === 'POST') { const j = await jsonBody(req); const b = w.state.bookings.find(x => x.id === j.bookingId); if (!b) throw err(404, 'Booking not found'); return json(res, { url: urls.trip(w, b) }); }
    if (p === '/api/outbox') return json(res, { items: await msg.outbox(w.id, 100) });
    if (p === '/api/calendar-feeds') return json(res, { feeds: w.state.properties.map(x => { const url = urls.ical(w, x); return { propertyId: x.id, name: x.name, url, channels: Object.fromEntries(ical.CHANNELS.map(c => [c, url.replace(/\.ics$/, '.' + c + '.ics')])) }; }) });
    // Calendar sync add-on: connect a channel manager with the host's own API key (kept encrypted, never sent to the browser).
    if (p === '/app/channel/connect' && m === 'POST') {
      const j = await jsonBody(req, 4e3); const id = String(j.id || ''); const A = effects.channels.ADAPTERS[id];
      if (!A) throw err(404, 'Unknown channel manager');
      if (!auth.limit('cm:' + w.id, 10, 600e3)) throw err(429, 'Too many tries. Wait a few minutes and try again.');
      const input = {}; for (const f of A.fields) input[f.key] = String((j.creds || {})[f.key] || '').trim().slice(0, 500);
      let listings; try { listings = await effects.channels.connect(w, id, input); } catch (e) { throw err(e.status && e.status < 500 ? 400 : 502, e.message); }
      effects.channels.sync(w, { id }).catch(e => log('channels', e.message));
      return json(res, { state: (await ws.open(w.id)).state, version: await ws.version(w.id), listings });
    }
    return notFound(res);
  }
  return notFound(res);
}

/* ---------------- leads from the marketing sites ---------------- */
const leadIns = db.prepare("INSERT INTO leads (kind, email, name, data, created_at, source, has_email) VALUES (?, ?, ?, ?, ?, 'website', 1)");
const leadImport = require('./lead-import')({ db });
// The team's CSV import (admin only). A plain form upload (multipart) from /admin/leads, or JSON { csv, source, dry_run } for scripts.
// Imported leads are stored only: they are not started on any follow-up series and team campaigns do not reach them.
async function leadImportPost(req, res) {
  if (!await isAdmin(req)) return notFound(res);
  const ct = String(req.headers['content-type'] || ''); let f;
  try {
    if (ct.includes('multipart/form-data')) f = require('./lead-import').multipart(Buffer.from(await body(req, 8e6), 'utf8'), ct) || {};
    else if (ct.includes('json')) f = await jsonBody(req, 8e6);
    else f = Object.fromEntries(new URLSearchParams(await body(req, 8e6)));
  } catch (e) { return ct.includes('json') ? json(res, { error: e.message }, e.status || 400) : await adminPage(req, res, '', 'leads', e.status === 413 ? 'That file is over 8 MB. Split it and import each part.' : 'Could not read the upload.'); }
  const dryRun = ['1', 'true', 'on', 'yes'].includes(String(f.dry_run || '').toLowerCase()) || f.dry_run === true;
  const r = await leadImport.importCsv(f.csv || f.file || '', { source: f.source, dryRun });
  if (!r.error) log('leads', 'import', r.batch, r.source, (dryRun ? 'dry run ' : '') + r.loaded + ' loaded, ' + r.rejected + ' rejected');
  if (ct.includes('json')) return json(res, r, r.error ? 400 : 200);
  if (r.error) return await adminPage(req, res, '', 'leads', r.error);
  const why = Object.entries(r.reasons).map(([k, n]) => n + ' ' + leadImport.REASONS[k].toLowerCase()).join(', ');
  return await adminPage(req, res, (r.dryRun ? 'Check only, nothing saved: ' + r.loaded + ' of ' + r.total + ' rows would load' : 'Imported ' + r.loaded + ' of ' + r.total + ' rows as ' + r.source) +
    ' (' + r.has_email + ' with email, ' + r.no_email + ' phone only).' + (r.rejected ? ' Rejected ' + r.rejected + ': ' + why + '.' : '') + (r.dryRun ? '' : ' None of them get emails.'), 'leads');
}
// Team view of leads and accounts, for the emails listed in ADMIN_EMAILS.
// Also config:admins in the kv table (comma separated), so team members can be added without changing the server's settings.
const isAdminEmail = async email => { email = String(email || '').toLowerCase(); if (!email) return false; if (cfg.admins.includes(email)) return true;
  const r = await db.prepare('SELECT v FROM kv WHERE k = ?').get('config:admins'); return !!r && String(r.v).toLowerCase().split(/[\s,]+/).includes(email); };
const isAdmin = async req => { const u = await me(req); return isAdminEmail(u && u.email); };
const usersAdmin = req => adminUsers({ db, ws, cfg, credits, urls, ui: adminUi, E, send, email: async () => ((await me(req)) || {}).email,
  admins: async () => { const r = await db.prepare('SELECT v FROM kv WHERE k = ?').get('config:admins'); return [...new Set(cfg.admins.concat(r ? String(r.v).toLowerCase().split(/[\s,]+/).filter(Boolean) : []))]; } });
async function adminPage(req, res, note, section, err) {
  if (!await isAdmin(req)) return notFound(res);
  section = section || 'overview';
  const A = adminUi, who = (await me(req)).email;
  const d = t => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const leadRows = await db.prepare('SELECT * FROM leads ORDER BY created_at DESC LIMIT 300').all();
  const info = new Map(await Promise.all(leadRows.map(async l => [l.id, await leads.info(l.id)])));
  const waiting = leadRows.filter(l => { const f = info.get(l.id); return f && f.status === 'waiting'; });
  const accts = await db.prepare("SELECT w.id, w.slug, w.plan, w.billing_status, w.created_at, c.allowance_left, c.topup_left, (SELECT coalesce(sum(l.amount), 0) FROM ai_ledger l WHERE l.workspace_id = w.id AND l.kind = 'use' AND l.created_at > ?) AS ai_used FROM workspaces w LEFT JOIN ai_credit c ON c.workspace_id = w.id WHERE w.kind = 'live' ORDER BY w.created_at DESC LIMIT 300").all(Date.now() - 30 * 864e5);
  const aiTotal = accts.reduce((a, x) => a + Number(x.ai_used || 0), 0) / credits.UNIT;
  const st = await leads.loadSettings();
  const field = (n, v, ph, type, label) => A.field(n, v, label || ph, { ph: label ? ph : '', type });
  const status = { active: 'Sending', waiting: 'Waiting for you', done: 'Finished', stopped: 'Stopped', unsubscribed: 'Unsubscribed', converted: 'Signed up' };
  const statusPill = { active: 'info', waiting: 'warn', done: 'muted', stopped: 'muted', unsubscribed: 'bad', converted: 'good' };
  const billing = { trial: ['warn', 'Not paid yet'], active: ['good', 'Paying'], past_due: ['bad', 'Payment failed'], cancelled: ['muted', 'Cancelled'] };
  const leadActions = l => {
    const f = info.get(l.id); let act = '';
    if (f && f.status === 'waiting' && f.seq === 'audit' && f.next === 'E2') act = '<details class="adm-x"><summary>Audit is ready</summary><form class="adm-form" method="post" action="/admin/leads/' + l.id + '/audit">' +
      field('audit_url', '', 'Link to the audit report') + field('score', '', 'Score out of 100', 'number') + field('mentions', '', 'Mentioned in how many of 8 questions', 'number') + field('top_fix', '', 'Top fix, e.g. add a dog policy page') +
      '<small class="adm-help">Optional, for the follow-up a week later:</small>' + field('top_question', '', 'Top question you re-ran on ChatGPT') + field('competitor_count', '', 'How many places the answer named', 'number') + '<button class="btn primary sm">Send the audit email</button></form></details>';
    if (f && f.seq === 'call' && f.next === 'E4A') act = '<details class="adm-x"><summary>Call done, send proposal</summary><form class="adm-form" method="post" action="/admin/leads/' + l.id + '/proposal">' + field('proposal_url', '', 'Link to the proposal') + '<button class="btn primary sm">Send the proposal email</button></form></details>';
    if (f && ['active', 'waiting'].includes(f.status)) act += '<form method="post" action="/admin/leads/' + l.id + '/stop" style="margin-top:6px"><button class="btn sm ghost">Stop emails</button></form>';
    return act;
  };
  const leadRow = l => {
    let x = {}; try { x = JSON.parse(l.data || '{}'); } catch (_) {}
    const f = info.get(l.id);
    const prog = f ? '<b>' + E(f.name) + '</b><div style="margin:4px 0">' + A.pill(statusPill[f.status] || 'muted', status[f.status] || f.status) + '</div><small>' + f.sent.length + ' of ' + f.total + ' sent' + (f.status === 'active' && f.next_at ? ' · next ' + d(f.next_at) : '') + (f.status === 'waiting' && f.next ? ' · next: ' + E(f.next) : '') + '</small>' : '<small>No emails</small>';
    return '<tr><td class="num" style="white-space:nowrap">' + d(l.created_at) + '</td><td>' + A.pill('muted', l.kind) + (l.source && l.source !== 'website' ? '<small>' + E(l.source) + '</small>' : '') + '</td><td><b>' + E(l.email || l.phone || '') + '</b><small>' + E(l.name || '') + (l.email && l.phone ? ' · ' + E(l.phone) : '') + (l.consent_at ? ' · consent ' + E(l.consent_at) : '') + '</small></td><td class="wrap">' + E(Object.entries(x).filter(([k]) => !['referrer'].includes(k)).map(([k, v]) => k + ': ' + v).join(' · ')) + '</td><td>' + prog + '</td><td style="min-width:240px">' + leadActions(l) + '</td></tr>';
  };
  const LEAD_HEADS = ['When', 'Form', 'Who', 'Answers', 'Emails', ''];
  const hostRow = a => {
    const left = a.allowance_left == null ? null : (Math.max(0, Number(a.allowance_left)) + Number(a.topup_left || 0)) / credits.UNIT, b = billing[a.billing_status] || ['muted', a.billing_status || 'Not paid yet'];
    return '<tr><td class="num" style="white-space:nowrap">' + d(a.created_at) + '</td><td><b>' + E(a.slug) + '</b></td><td>' + E(a.plan || '') + '</td><td>' + A.pill(b[0], b[1]) + '</td><td class="num">' + (left == null ? '<small>Not used yet</small>' : credits.money(left)) + '</td><td class="num">' + credits.money(Number(a.ai_used || 0) / credits.UNIT) + '</td>' +
      '<td><details class="adm-x"><summary>' + adminUi.icon('plus') + 'Add credit</summary><form class="adm-form" method="post" action="/admin/credits/' + E(a.id) + '">' + field('pounds', '', 'Pounds to add, e.g. 20', 'number') + '<button class="btn primary sm">Add AI credit</button></form></details></td></tr>';
  };
  const HOST_HEADS = ['Joined', 'Site', 'Plan', 'Billing', 'AI credit left', 'AI used, 30 days', ''];
  const sp = await stripeAuto.status();
  const stripeCard = A.card('Stripe', sp.on ? A.pill('good', sp.mode + ' mode') : A.pill('warn', 'Off'),
    '<div class="adm-list"><div><span><b>Key</b><small>' + (sp.on ? 'Ending ' + E(sp.last4) + ', from ' + E(sp.keyName) : 'Not connected') + '</small></span></div>' +
    '<div><span><b>Plan prices</b></span>' + A.pill(sp.prices ? 'good' : 'muted', sp.prices ? 'Ready' : 'Not yet') + '</div><div><span><b>Webhooks</b></span>' + A.pill(sp.webhooks ? 'good' : 'muted', sp.webhooks ? 'Ready' : 'Not yet') + '</div>' +
    (sp.error ? '<div><span><b>Last setup error</b><small>' + E(sp.error) + '</small></span></div>' : '') + '</div>' +
    (sp.canSave ? '<details class="adm-x" style="margin-top:12px"' + (sp.on ? '' : ' open') + '><summary>' + (sp.on ? 'Change the Stripe key' : 'Connect Stripe') + '</summary><form class="adm-form" method="post" action="/admin/stripe/key" autocomplete="off">' +
      '<small class="adm-help">Paste the secret key from dashboard.stripe.com/apikeys (live mode, it starts sk_live_). It is checked with Stripe, kept encrypted, and never shown again. Plan prices and webhooks are then set up automatically.</small>' +
      A.field('key', '', 'Stripe secret key', { type: 'password', ph: 'sk_live_...', req: true, extra: ' autocomplete="off" spellcheck="false"' }) + '<div class="row"><button class="btn primary sm">Save and connect</button></div></form></details>' : ''));
  const shell = o => send(res, 200, A.shell(Object.assign({ email: who, waiting: waiting.length, note, err }, o)), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });

  const importCard = A.card('Import leads from a CSV', 'Stored only, no emails', '<form class="adm-form" method="post" action="/admin/leads/import" enctype="multipart/form-data">' +
    '<small class="adm-help">One row per lead with an email or phone column (an optional consent date column too, e.g. 14/03/2026). Duplicates are skipped by email, then by phone. Imported leads are not started on any email series and campaigns do not reach them.</small>' +
    '<label>CSV file<input type="file" name="file" accept=".csv,text/csv" required></label>' +
    '<label>Source<select name="source" required><option value="">Choose…</option>' + leadImport.SOURCES.map(x => '<option value="' + x + '">' + x + '</option>').join('') + '</select></label>' +
    '<label class="row"><input type="checkbox" name="dry_run" value="1" checked> Check only, do not save</label><div class="row"><button class="btn primary sm">Import</button></div></form>');
  if (section === 'leads') return shell({ title: 'Leads', active: 'leads', sub: leadRows.length + ' leads from the website forms and imports. Website leads get their follow-up emails by themselves; imported leads get none; anything marked “Waiting for you” needs a person.',
    body: '<details class="adm-x" style="margin-bottom:16px"><summary>' + A.icon('plus') + 'Import leads from a CSV</summary>' + importCard + '</details><section class="a-card a-flush">' + A.table(LEAD_HEADS, leadRows.map(leadRow), 'No leads yet. They arrive here from the forms on the website.') + '</section>' });
  if (section === 'hosts') return shell({ title: 'Host accounts', active: 'hosts', sub: accts.length + ' host accounts · AI credit: each plan includes ' + credits.money(cfg.credits.monthly) + ' a month' + (cfg.credits.markup !== 1 ? ', usage charged at ' + cfg.credits.markup + '× cost' : ', usage charged at cost') + '.',
    body: '<div class="adm-kpis">' + A.kpi('Host accounts', accts.length) + A.kpi('Paying', accts.filter(a => a.billing_status === 'active').length) + A.kpi('Not paid yet', accts.filter(a => !a.billing_status || a.billing_status === 'trial').length) + A.kpi('AI used, 30 days', credits.money(aiTotal), '', 'by all hosts', true) + '</div>' +
      '<section class="a-card a-flush">' + A.table(HOST_HEADS, accts.map(hostRow), 'No host accounts yet.') + '</section>' });
  if (section === 'settings') {
    const wd = st.webinar_at ? new Date(st.webinar_at) : null;
    const ukParts = ms => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ms)); const g = k => (f.find(x => x.type === k) || {}).value; return [g('year') + '-' + g('month') + '-' + g('day'), g('hour') + ':' + g('minute')]; };
    const [wDay, wTime] = wd ? ukParts(st.webinar_at) : ['', '12:30'];
    const links = A.card('Live demo, call and report links', st.webinar_at ? 'Next demo ' + E(d(st.webinar_at)) : 'No demo date set', '<form class="adm-form" method="post" action="/admin/settings">' +
      '<small class="adm-help">The live demo emails (reminders, replay, follow-ups) are timed from the next session. People who register before you set a date get the details once you add it.</small>' +
      '<div class="adm-two">' + A.field('webinar_day', wDay, 'Next live demo date (UK)', { type: 'date' }) + A.field('webinar_time', wTime, 'Start time (UK)', { type: 'time' }) + '</div>' +
      '<div class="adm-two">' + field('join_url', st.join_url, 'https://meet.google.com/…', '', 'Joining link') + field('replay_url', st.replay_url, 'https://…', '', 'Replay link (sent after the session)') + '</div>' +
      '<div class="adm-two">' + field('meeting_url', st.meeting_url, 'https://meet.google.com/…', '', 'Walkthrough call joining link') + field('book_call_url', st.book_call_url, 'https://…/book-call', '', 'Page where people book a walkthrough') + '</div>' +
      field('sample_report_url', st.sample_report_url, 'https://…/sample-report', '', 'Sample audit report page') + '<div class="row"><button class="btn primary">Save</button></div></form>');
    const bk = A.card('Backups', backup.list().length + ' kept', '<p class="adm-help" style="margin:0 0 12px">' + backup.list().length + ' daily database backups kept on the server.</p><a class="btn sm" href="/admin/backup">' + A.icon('down') + 'Download the latest</a>');
    return shell({ title: 'Settings', heading: 'Stripe, links and backups', active: 'settings', sub: 'Payments, the links the lead emails use, and backups.', body: '<div class="adm-cols"><div class="adm-stack">' + stripeCard + bk + '</div>' + links + '</div>' });
  }
  // overview
  const since = Date.now() - 30 * 864e5;
  const hour = +new Date().toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false });
  const needs = waiting.length ? '<section class="a-card a-flush">' + A.table(LEAD_HEADS, waiting.map(leadRow)) + '</section>' : '<div class="a-empty">' + A.icon('check') + '<p>Nothing is waiting for you. Lead emails are going out by themselves.</p></div>';
  return shell({ title: 'Overview', heading: (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening') + ', team', active: 'overview',
    sub: 'Leads and accounts · ' + leadRows.length + ' leads · ' + accts.length + ' host accounts. Emails go out automatically; anything marked “Waiting for you” needs a person.',
    actions: '<a class="btn sm" href="/admin/leads">' + A.icon('users') + 'All leads</a><a class="btn sm" href="/admin/campaigns">' + A.icon('mail') + 'Email campaigns</a>',
    body: '<div class="adm-kpis">' + A.kpi('Leads, last 30 days', leadRows.filter(l => l.created_at > since).length, '', leadRows.length + ' in total') + A.kpi('Waiting for you', waiting.length, waiting.length ? '' : 'All clear', 'need a person to act') +
      A.kpi('Host accounts', accts.length, '', accts.filter(a => a.billing_status === 'active').length + ' paying') + A.kpi('AI used, 30 days', credits.money(aiTotal), '', 'by all hosts', true) + '</div>' + await marketingRow(A) +
      '<div class="a-grid adm-top"><div class="a-s8">' + A.card('Waiting for you', waiting.length + ' lead' + (waiting.length === 1 ? '' : 's'), needs, waiting.length ? 'a-flush' : '').replace('<div class="a-card-h">', waiting.length ? '<div class="a-card-h" style="padding:18px 20px 0">' : '<div class="a-card-h">') + '</div>' +
      '<div class="a-s4 adm-stack">' + A.card('Newest leads', '<a href="/admin/leads">See all</a>', '<div class="adm-list">' + (leadRows.slice(0, 6).map(l => '<div><span><b>' + E(l.email || l.phone || '') + '</b><small>' + E(l.kind) + ' · ' + d(l.created_at) + '</small></span></div>').join('') || '<div><span><small>No leads yet.</small></span></div>') + '</div>') + stripeCard + '</div></div>' });
}
// the overview's marketing row: write an email, what is going out on social, and the email library
async function marketingRow(A) {
  const sp = await social.posts().catch(() => ({ posts: [] })), now = Date.now(), at = x => Date.parse(x.at + 'Z');
  const soon = sp.posts.filter(x => at(x) >= now && x.kind !== 'story'), week = sp.posts.filter(x => at(x) >= now && at(x) < now + 7 * 864e5).length, failed = sp.posts.filter(x => x.nets.some(n => n[1] === 'error')).length;
  const when = t => new Date(t).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const camps = await campaigns.overview(), sentC = camps.filter(o => o.s.status === 'sent').length, drafts = camps.filter(o => o.s.kind === 'custom' && o.s.status === 'draft').length;
  return '<div class="a-grid adm-top" style="margin-bottom:16px">' +
    '<div class="a-s4">' + A.card('Write a marketing email', drafts ? drafts + ' draft' + (drafts === 1 ? '' : 's') : '', '<p class="adm-help" style="margin:0 0 14px">To leads, hosts or both. Write it, send yourself a test, then send it now or schedule it. ' + sentC + ' campaign' + (sentC === 1 ? '' : 's') + ' sent so far.</p><div class="adm-inline"><a class="btn primary" href="/admin/campaigns/write">' + A.icon('pen') + 'Write an email</a><a class="btn ghost" href="/admin/campaigns">All campaigns</a></div>') + '</div>' +
    '<div class="a-s4">' + A.card('Social this week', '<a href="/admin/social">Calendar</a>', '<p class="adm-help" style="margin:0 0 8px"><b>' + week + '</b> posts and stories scheduled in the next 7 days' + (failed ? ' · <a href="/admin/social?show=problems#list">' + failed + ' failed on a network</a>' : '') + '.</p><div class="adm-list">' +
      (soon.slice(0, 3).map(x => '<div><span><b>' + E((x.text || x.title || x.kind).split('\n')[0].slice(0, 70)) + '</b><small>' + when(at(x)) + ' · ' + E(x.kind) + ' · ' + E(x.nets.map(n => n[0]).join(', ')) + '</small></span></div>').join('') || '<div><span><small>Nothing scheduled.</small></span></div>') + '</div>') + '</div>' +
    '<div class="a-s4">' + A.card('Email templates', '<a href="/admin/emails">See them all</a>', '<p class="adm-help" style="margin:0 0 8px">Every email the system sends, as it goes out: lead follow-ups, host onboarding and reports, guest booking emails and the designed campaigns.</p><a class="btn" href="/admin/emails">' + A.icon('doc') + 'Open the email templates</a>') + '</div></div>';
}
async function adminPost(req, res, p) {
  if (!await isAdmin(req)) return notFound(res);
  const f = await formBody(req); let mm;
  const url = v => { v = String(v || '').trim(); return /^https?:\/\/[^\s"<>]+$/i.test(v) ? v.slice(0, 500) : ''; };
  if (p === '/admin/stripe/key') { const r = await stripeAuto.saveKey(f.key); return r.error ? await adminPage(req, res, '', 'settings', r.error) : await adminPage(req, res, 'Stripe is connected in ' + r.mode + ' mode.' + (r.setup && r.setup.error ? ' Prices and webhooks could not be set up yet: ' + r.setup.error : ' Plan prices and webhooks are ready.'), 'settings'); }
  if (p === '/admin/settings') {
    const at = f.webinar_day ? leads.ukAt(f.webinar_day, f.webinar_time || '12:30') : 0;
    await leads.saveSettings({ webinar_at: at, join_url: url(f.join_url), replay_url: url(f.replay_url), meeting_url: url(f.meeting_url), book_call_url: url(f.book_call_url), sample_report_url: url(f.sample_report_url) });
    await leads.run(); return await adminPage(req, res, 'Saved.', 'settings');
  }
  if ((mm = p.match(/^\/admin\/credits\/([A-Za-z0-9_-]+)$/))) { // goodwill credit from the team, e.g. after a support issue
    const pounds = Math.round(Number(f.pounds) * 100) / 100; const r = await ws.row(mm[1]);
    if (!r || !(pounds > 0) || pounds > 20000) return await adminPage(req, res, '', 'hosts', 'Enter an amount between £0.01 and £20,000.');
    await credits.topup(mm[1], pounds, null, 'grant'); log('credits', mm[1], 'team added £' + pounds);
    if (f.back === 'detail') return await usersAdmin(req).detailPage(res, mm[1], 'Added ' + credits.money(pounds) + ' of AI credit.');
    return await adminPage(req, res, 'Added ' + credits.money(pounds) + ' of AI credit to ' + (r.slug || mm[1]) + '.', 'hosts');
  }
  if ((mm = p.match(/^\/admin\/leads\/(\d+)\/(audit|proposal|stop)$/))) {
    const id = +mm[1];
    if (mm[2] === 'stop') await leads.stop(id);
    if (mm[2] === 'audit') {
      if (!url(f.audit_url) || f.score === '' || f.mentions === '' || !String(f.top_fix || '').trim()) return await adminPage(req, res, '', 'leads', 'Add the audit link, score, mentions and top fix.');
      await leads.setVars(id, { audit_url: url(f.audit_url), score: Math.max(0, Math.min(100, Math.round(+f.score || 0))), mentions: Math.max(0, Math.min(8, Math.round(+f.mentions || 0))), top_fix: String(f.top_fix).trim().slice(0, 200),
        top_question: String(f.top_question || '').trim().slice(0, 200), competitor_count: f.competitor_count ? Math.round(+f.competitor_count) : '', audit_ready_at: Date.now() });
    }
    if (mm[2] === 'proposal') { if (!url(f.proposal_url)) return await adminPage(req, res, '', 'leads', 'Add the proposal link.'); await leads.setVars(id, { proposal_url: url(f.proposal_url), proposal_ready_at: Date.now() }); }
    await leads.advance(id); return await adminPage(req, res, mm[2] === 'stop' ? 'Emails stopped.' : 'Sent.', 'leads');
  }
  return notFound(res);
}
async function lead(req, res) {
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST', 'access-control-allow-headers': 'content-type' };
  if (req.method === 'OPTIONS') return send(res, 204, '', 'text/plain', cors);
  if (!auth.limit('lead:' + ip(req), 20, 3600e3)) return json(res, { error: 'Too many requests' }, 429, cors);
  const ct = String(req.headers['content-type'] || '');
  const d = ct.includes('json') ? await jsonBody(req, 2e4) : await formBody(req);
  const email = String(d.email || '').trim().slice(0, 160);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json(res, { error: 'Enter a valid email.' }, 400, cors);
  if (d.company_website) return json(res, { ok: true }, 200, cors); // honeypot
  const kind = String(d.kind || d.form || 'contact').slice(0, 40);
  const extra = {}; Object.keys(d).filter(k => !['email', 'name', 'kind', 'form'].includes(k)).slice(0, 30).forEach(k => extra[k] = String(d[k]).slice(0, 2000));
  const leadId = Number((await leadIns.run(kind, email, String(d.name || '').slice(0, 120), JSON.stringify(extra), Date.now())).lastInsertRowid);
  if (await leads.start(leadId, kind, email, Object.assign({}, extra, { page: extra.page || kind }))) ws.defer(leads.advance(leadId), 'leads');
  msg.sendEmail({ to: cfg.company.support, subject: 'New ' + kind + ' lead: ' + email, text: JSON.stringify(Object.assign({ email, name: d.name }, extra), null, 2), meta: { lead: kind } });
  if (/\bhtml\b/.test(String(req.headers.accept)) && !ct.includes('json')) return send(res, 200, authPage('Thanks', '<h1>Thanks, we have got it.</h1><p>We will be in touch at ' + E(email) + '.</p><p><a href="/">Back to Bookingbooster</a></p>'), 'text/html; charset=utf-8', cors);
  json(res, { ok: true }, 200, cors);
}

async function accountPage(w, sess, note, err) {
  const a = w.state.account; const inp = (label, name, val, type, extra) => '<label>' + label + '<input name="' + name + '" value="' + E(val || '') + '" type="' + (type || 'text') + '"' + (extra || '') + '></label>';
  const msgs = { saved: 'Saved.', password: 'Password changed. Other devices have been signed out.', emails: 'Email choices saved.' };
  const pr = await hostMail.prefs(w.id), box = (name, on, label) => '<label style="display:flex;gap:10px;align-items:flex-start;font-weight:500"><input type="checkbox" name="' + name + '"' + (on ? ' checked' : '') + ' style="margin-top:4px">' + label + '</label>';
  return authPage('Account', '<h1>Your account</h1><p>' + E(a.business) + '</p>' + (err ? '<p class="err" role="alert">' + E(err) + '</p>' : '') + (msgs[note] ? '<p class="ok">' + E(msgs[note]) + '</p>' : '') +
    '<form class="card" method="post" action="/app/account/profile"><b>Details</b>' + inp('Your name', 'owner', a.owner, 'text', ' required autocomplete="name"') + inp('Business name', 'business', a.business, 'text', ' required') + inp('Email you sign in with', 'email', sess.email, 'email', ' required autocomplete="email"') + '<button>Save details</button></form>' +
    '<form class="card" method="post" action="/app/account/password"><b>Password</b>' + inp('Current password', 'current', '', 'password', ' required autocomplete="current-password"') + inp('New password (at least 10 characters)', 'next', '', 'password', ' required minlength="10" autocomplete="new-password"') + '<button>Change password</button></form>' +
    '<form class="card" id="emails" method="post" action="/app/account/emails"><b>Emails from us</b>' + box('report', pr.report, 'The Monday report: last week’s bookings, direct revenue and site visits') + box('setup', pr.setup, 'Setup tips in your first month') + box('news', pr.news, 'News and offers from Bookingbooster, now and then') +
    '<p style="margin:0"><small>Booking, billing and security emails always arrive.</small></p><button>Save email choices</button></form>' +
    '<div class="card"><b>Your data</b><p style="margin:6px 0 10px">Download everything in your account: homes, bookings, guests, messages and campaigns. Your guest list is yours to take with you.</p><div class="links" style="margin:0"><a href="/app/account/export">Download all data (JSON)</a><a href="/app/account/guests.csv">Download guest list (CSV)</a></div></div>' +
    '<form class="card" method="post" action="/app/account/delete"><b>Delete account</b><p style="margin:6px 0 10px">This deletes your booking sites, bookings, guest list, messages, photos and ID uploads straight away, and ends your Bookingbooster subscription. It cannot be undone. Download your data first.</p>' +
    inp('Type DELETE to confirm', 'confirm', '', 'text', ' required autocomplete="off"') + inp('Your password', 'password', '', 'password', ' required autocomplete="current-password"') + '<button style="background:#C62828">Delete my account</button></form>' +
    '<div class="card"><b>Refer other hosts</b><p style="margin:6px 0 0">Earn ' + cfg.affiliate.rate + '% of everything hosts you refer pay us, for as long as they stay. <a href="/partners">Get your partner link</a></p></div>' +
    '<div class="links"><a href="/app">Back to your console</a><a href="/app/billing">Plan and billing</a></div>');
}
async function accountPost(req, res, p, w, sess) {
  const f = await formBody(req); const page = async (err, status) => send(res, status || 400, await accountPage(w, sess, null, err));
  if (p === '/app/account/profile') {
    const owner = String(f.owner || '').trim().slice(0, 80), business = String(f.business || '').trim().slice(0, 80), email = String(f.email || '').trim().toLowerCase().slice(0, 160);
    if (owner.length < 2 || business.length < 2) return await page('Enter your name and business name.');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return await page('Enter a valid email.');
    const other = await auth.userByEmail(email); if (other && other.id !== sess.user_id) return await page('That email is already used by another account.');
    await auth.setEmail(sess.user_id, email, owner); await ws.act(w.id, 'updateAccount', [{ owner, business, email }]);
    return redirect(res, '/app/account?msg=saved');
  }
  if (p === '/app/account/emails') { await hostMail.setPrefs(w.id, { report: !!f.report, setup: !!f.setup, news: !!f.news }); return redirect(res, '/app/account?msg=emails#emails'); }
  if (p === '/app/account/password') {
    if (String(f.next || '').length < 10) return await page('Use a new password of at least 10 characters.');
    if (!await auth.changePassword(sess.user_id, f.current, f.next)) return await page('Your current password is not right.');
    return redirect(res, '/app/account?msg=password', { 'set-cookie': cookie('bb_s', await auth.startSession(sess.user_id), 30 * 86400) });
  }
  if (p === '/app/account/delete') {
    if (String(f.confirm || '').trim().toUpperCase() !== 'DELETE') return await page('Type DELETE to confirm.');
    if (!await auth.checkUserPass(sess.user_id, f.password)) return await page('Your password is not right.');
    const r = await ws.row(w.id);
    if (r && r.stripe_customer && stripe.enabled) { try { await stripe.cancelSubscriptions(r.stripe_customer); } catch (e) { log('delete', e.message); return await page('We could not end your subscription in Stripe, so nothing was deleted. Try again, or contact ' + cfg.company.support + '.', 502); } }
    await deleteWorkspace(w.id);
    log('account deleted', w.id);
    return send(res, 200, authPage('Account deleted', CLEAR_OFFLINE + '<h1>Your account is deleted.</h1><p>Your sites, bookings, guests and uploads have been removed. Thank you for trying Bookingbooster.</p><p><a href="/">Back to the home page</a></p>'), 'text/html; charset=utf-8', { 'set-cookie': cookie('bb_s', '', 0) });
  }
  return notFound(res);
}
async function deleteWorkspace(wid) {
  for (const u of await db.prepare('SELECT id FROM users WHERE workspace_id = ?').all(wid)) await auth.deleteUser(u.id);
  for (const t of ['secrets', 'payments', 'outbox', 'domains', 'ai_credit', 'ai_ledger']) await db.prepare('DELETE FROM ' + t + ' WHERE workspace_id = ?').run(wid);
  await db.prepare('DELETE FROM kv WHERE k IN (?, ?)').run('hostmail:' + wid, 'hostprefs:' + wid);
  await ws.remove(wid);
  for (const dir of ['uploads', 'media']) await files.delPrefix(dir + '/' + wid);
}
async function billingPage(w, sp) {
  const r = await ws.row(w.id); const s = w.state; const price = 200;
  const status = { trial: 'Not paid yet. Your booking site goes live to guests once your plan is paid', active: 'Active', past_due: 'Payment failed. Update your card so Stripe can take it again', cancelled: 'Cancelled' }[r.billing_status] || 'Not paid yet';
  return authPage('Plan and billing', '<h1>Plan and billing</h1><p>' + E(s.account.business) + '</p><div class="card"><b>' + E(r.plan || s.account.plan) + ' plan · ' + (s.account.annual ? '£' + price * 10 + ' a year' : '£' + price + ' a month') + ' inc. VAT</b><p style="margin:6px 0 0">No setup fee. Paid upfront each ' + (s.account.annual ? 'year' : 'month') + '. Cancel anytime.</p>' + (s.account.addon ? '<p style="margin:6px 0 0">Plus the calendar sync add-on, ' + (s.account.annual ? '£180 a year' : '£15 a month') + '.</p>' : '') + '<p style="margin:6px 0 0">Status: ' + E(status) + '. No commission on any booking.</p></div>' +
    (stripe.enabled ? (r.stripe_customer && !offPlan(r.billing_status) ? '<form method="post" action="/app/billing/portal"><button>Manage billing in Stripe</button></form>' : '<form method="post" action="/app/billing/start"><button>' + (r.billing_status === 'cancelled' ? 'Restart your plan' : 'Start your plan') + '</button></form>') : '<p class="card">Card billing is not switched on for this server yet. Add the Stripe keys described in the README.</p>') +
    (credits.enabled ? await creditCard(w, sp) : '') +
    '<div class="links"><a href="/app">Back to your console</a><a href="mailto:' + E(cfg.company.support) + '">Contact us</a></div>');
}
// AI credit: the monthly allowance, top-ups, what was used, and the top-up form.
async function creditCard(w, sp) {
  const c = await credits.summary(w.id), rows = await credits.recent(w.id, 12), M = credits.money;
  const day = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' });
  const msg = sp && sp.get('msg') === 'topup' ? '<p class="err">Choose an amount in whole pounds from £' + credits.TOPUP_MIN + ' to £' + credits.TOPUP_MAX.toLocaleString('en-GB') + '.</p>'
    : sp && sp.get('topup') ? '<p class="ok">Thank you. £' + E(sp.get('topup')) + ' of AI credit is added as soon as Stripe confirms the payment, usually within a minute.</p>' : '';
  const pct = c.included ? Math.max(0, Math.min(100, Math.round(100 * c.includedLeft / c.included))) : 0;
  const status = c.empty ? '<p class="err" style="margin:8px 0 0"><b>Your AI credit has run out.</b> The site builder, funnels and reply drafts are paused until you top up' + (c.included ? ' or your allowance comes back on ' + day(c.resetsAt) : '') + '.</p>'
    : c.low ? '<p class="err" style="margin:8px 0 0">Your AI credit is running low. Top up so the AI tools keep working.</p>' : '';
  const used = c.byFeature.length ? '<p style="margin:6px 0 0"><small>Used since ' + day(c.periodStart) + ': ' + c.byFeature.map(x => E(x.name) + ' ' + M(x.pounds) + ' (' + x.count + ')').join(' · ') + '</small></p>' : '';
  const hist = rows.length ? '<details style="margin-top:10px"><summary>Recent activity</summary><table style="width:100%;font-size:13px;margin-top:6px">' + rows.map(x => '<tr><td>' + new Date(x.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' }) + '</td><td>' + E(x.name) + '</td><td align="right">' + (x.kind === 'use' ? '-' + M(x.pounds) : '+' + M(x.pounds)) + '</td></tr>').join('') + '</table></details>' : '';
  const presets = credits.TOPUP_PRESETS.map((n, i) => '<label style="display:inline-flex;align-items:center;gap:4px;margin:0 10px 6px 0;font-weight:400"><input type="radio" style="padding:0;margin:0" name="amount" value="' + n + '"' + (i === 1 ? ' checked' : '') + '> £' + n.toLocaleString('en-GB') + '</label>').join('');
  const form = stripe.enabled ? '<form method="post" action="/app/billing/topup" style="margin-top:12px"><b>Top up</b><div style="margin:8px 0">' + presets + '</div>' +
    '<label>Or another amount (£' + credits.TOPUP_MIN + ' to £' + credits.TOPUP_MAX.toLocaleString('en-GB') + ')<input name="custom" inputmode="numeric" pattern="[0-9,]*" placeholder="e.g. 75"></label>' +
    '<button>Top up with card</button><p style="margin:6px 0 0"><small>Paid by card through Stripe, inc. VAT. Top-ups never expire and are used after your monthly allowance.</small></p></form>'
    : '<p><small>Card payments are not switched on for this server yet, so top-ups are not available.</small></p>';
  return '<div class="card" id="ai-credit"><b>AI credit · ' + M(c.balance) + ' left</b>' + msg +
    (!c.included ? '<p style="margin:6px 0 0">Your plan includes ' + M(cfg.credits.monthly) + ' of AI use a month for the site builder, funnels and reply drafts while it is active.' + (c.topup > 0 ? ' You have ' + M(c.topup) + ' of top-ups.' : '') + '</p>'
      : '<p style="margin:6px 0 0">Your plan includes ' + M(c.included) + ' of AI use a month for the site builder, funnels and reply drafts. ' + M(c.includedLeft) + ' of it is left this month, and it resets on ' + day(c.resetsAt) + '.' + (c.topup > 0 ? ' Plus ' + M(c.topup) + ' of top-ups.' : '') + '</p>') +
    '<div style="height:8px;background:#E4E7F0;border-radius:4px;margin-top:8px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:#3355FF"></div></div>' +
    status + used + '<p style="margin:6px 0 0"><small>Each AI action is charged by how much AI work it takes' + (c.markup === 1 ? ', at the price the AI provider charges us' : '') + '. A reply draft is usually under 1p; a full site design is usually under £1.</small></p>' + hist + form + '</div>';
}
const LEGAL = require('./legal')(cfg, E);
function staticPage(p) {
  if (p === '/help') return '<h1>Help</h1><p>Answers to the questions hosts ask most.</p><div class="card"><b>Use your own domain</b><p style="margin:6px 0 0">In your console, open Website &amp; SEO and type your domain under Your web address. We show you the DNS records to add where you bought it. Your site switches over by itself once we can see them, often within an hour.</p></div><div class="card"><b>Stop double bookings</b><p style="margin:6px 0 0">In Connections, paste the calendar link (iCal) from your channel manager, Airbnb, Vrbo or Booking.com. Then copy your home’s Bookingbooster calendar link and paste it into the same site, so dates booked direct close there too.</p></div><div class="card"><b>Put it on your phone</b><p style="margin:6px 0 0">Open ' + E(cfg.baseUrl.replace(/^https?:\/\//, '')) + '/app/phone on your phone and sign in. On an iPhone, tap Share then Add to Home Screen. On Android, tap the menu then Install app. It opens like any other app.</p></div><div class="card"><b>Get paid</b><p style="margin:6px 0 0">Switch on Stripe in Connections. Guests pay you directly and payouts reach your bank in about two working days.</p></div><p><a href="mailto:' + E(cfg.company.support) + '">Email us</a></p>';
  if (p === '/privacy') return LEGAL.privacy;
  return LEGAL.terms;
}

/* ---------------- background jobs ---------------- */
// One pass of the background work. Locally a timer runs it every minute; on Supabase pg_cron calls /jobs/tick.
// When each job last ran is kept in the database, so it survives restarts and works across function instances.
// A host's own domain goes live by itself once its DNS records are in place.
async function checkDomains() {
  for (const d of await ws.unverifiedDomains()) {
    if (ws.isOurs(d.host)) { await ws.verifyDomain(d.host); continue; }
    const c = await domains.check(d.workspace_id, d.host); if (!c.live) continue;
    await ws.verifyDomain(d.host); domains.certify(d.host); log('domain live', d.workspace_id, d.host);
    try { await ws.withWs(d.workspace_id, BB => { BB.log('sync', 'Your web address', d.host + ' is connected. Guests can book on it now.', 'web'); BB.store.commit({}); }, { scheduler: true }); } catch (_) {}
  }
}
const kvGet = db.prepare('SELECT v FROM kv WHERE k = ?'), kvSet = db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)');
let ticking = null;
function tick(t) { if (!ticking) ticking = runTick(t || Date.now()).finally(() => { ticking = null; }); return ticking; }
async function runTick(t) {
  const row = await kvGet.get('jobs:last'); const last = Object.assign({ ical: 0, daily: 0, domains: 0, events: 0 }, row ? JSON.parse(row.v) : {});
  const jobs = [], bg = (name, pr) => jobs.push(Promise.resolve(pr).catch(e => log(name, e.message)));
  const ical = t - last.ical > cfg.icalEveryMin * 60e3, daily = t - last.daily > 864e5;
  if (t - last.domains > 10 * 60e3) last.domains = t;
  if (t - last.events > 20 * 60e3) last.events = t; // the event finder reads a few due pages every 20 minutes
  if (ical) last.ical = t;
  if (daily) last.daily = t;
  await kvSet.run('jobs:last', JSON.stringify(last)); // claim this run first, so a second caller does not repeat it
  try { await visits.flush(ws); } catch (e) { log('visits', e.message); }
  bg('leads', leads.run(t));
  bg('host email', hostMail.run(t));
  bg('campaigns', campaigns.run(t));
  bg('flows', flows.run(t));
  bg('stripe', stripeAuto.ensure(t)); // creates the Stripe prices and webhooks once a key is set
  for (const id of await ws.liveIds()) {
    try {
      const w = await ws.open(id); if (!w) continue;
      const rolled = w.catchUp();
      const exp = w.state.bookings.filter(b => b.status === 'pending' && b.holdUntil && b.holdUntil < t).map(b => b.id);
      if (rolled || exp.length) await ws.withWs(id, BB => exp.forEach(bid => BB.act.expirePending(bid)), { scheduler: true });
      if (ical) bg('ical', effects.calendars(w));
      if (daily && w.kind === 'live') bg('index', autoIndex(w).catch(e => log('index', id, e.message)));
      if (daily && ai.available().length) { const c = w.state.ai.checkedAt; if (!c || c < new Date(t - 7 * 864e5).toISOString().slice(0, 10)) bg('ai', effects.aiCheck(w)); }
    } catch (e) { log('job', id, e.message); }
  }
  if (last.domains === t) { bg('domains', checkDomains()); bg('registrar', registrar.due()); }
  if (daily) bg('renewals', registrar.renewals(t));
  if (last.events === t && cfg.events.crawl) bg('events', eventFinder.due(cfg.serverless ? 2 : 4, cfg.serverless ? 100e3 : 240e3));
  if (daily) { bg('demos', ws.cleanupDemos(7)); bg('ids', purgeIds()); bg('indexnow', pingOwnPages()); }
  if (!cfg.serverless) bg('backup', backup.run(t)); // once a day: skips when today's copy exists
  await Promise.all(jobs); await ws.settle();
  return { ok: true, ical, daily };
}
if (require.main === module) setInterval(() => { tick().catch(e => log('tick', e.message)); }, 60e3).unref();

// IndexNow for our own site: when the marketing and answer pages change, tell Bing (and Yandex, Seznam, Naver) to recrawl them.
// Bing results feed ChatGPT search and Copilot. The key file is served at /<key>.txt. Skipped for local and test addresses.
function ownIndexKey() { return crypto.createHmac('sha256', String(cfg.secret)).update('indexnow:own').digest('hex').slice(0, 32); }
async function pingOwnPages() {
  const u = new URL(cfg.baseUrl); if (u.protocol !== 'https:' || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return;
  const urls = [cfg.baseUrl + '/', cfg.baseUrl + '/help', cfg.baseUrl + '/llms.txt', cfg.baseUrl + '/llms-full.txt'].concat(answers.list().map(x => cfg.baseUrl + x.path));
  const sig = crypto.createHash('sha1').update(mkt.llms(cfg.baseUrl, publicCompany()) + answers.fullText(cfg.baseUrl)).digest('hex');
  const row = await kvGet.get('indexnow:own'); if (row && row.v === sig) return;
  const r = await fetch('https://api.indexnow.org/indexnow', { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: u.host, key: ownIndexKey(), keyLocation: cfg.baseUrl + '/' + ownIndexKey() + '.txt', urlList: urls }) });
  log('indexnow', 'own pages', r.status); if (r.status === 200 || r.status === 202) await kvSet.run('indexnow:own', sig);
}

// ID photos are deleted 30 days after checkout (or when the booking is cancelled).
async function purgeIds() {
  const cut = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  for (const wid of await ws.liveIds()) {
    const keys = await files.list('uploads/' + wid); if (!keys.length) continue;
    const w = await ws.open(wid);
    for (const k of keys) {
      const f = k.split('/').pop(), b = w && w.state.bookings.find(x => idFile(x.id) === f);
      if (!b || b.status === 'cancelled' || b.checkOut < cut) await files.del(k);
    }
  }
}

/* Server errors reach the team by email: the first straight away, then at most one summary every 15 minutes. */
const alerts = { last: 0, held: [] };
function alertTeam(where, e) {
  const to = cfg.admins.length ? cfg.admins.join(',') : cfg.company.support; if (!to || !cfg.email.provider) return;
  alerts.held.push(new Date().toISOString().slice(11, 19) + ' ' + where + ': ' + String(e && e.message || e).slice(0, 300));
  const flush = () => { if (!alerts.held.length) return; const list = alerts.held.splice(0); alerts.last = Date.now();
    msg.sendEmail({ to, subject: 'Bookingbooster server error' + (list.length > 1 ? 's (' + list.length + ')' : ''), text: list.join('\n') + '\n\nFull details are in the server log.', meta: { alert: true } }); };
  if (Date.now() - alerts.last > 15 * 60e3) flush(); else if (alerts.held.length === 1) setTimeout(flush, 15 * 60e3 - (Date.now() - alerts.last)).unref();
}
// A crash restarts the server cleanly (Fly brings it back), after a moment to send the alert.
if (!cfg.serverless) process.on('uncaughtException', e => { log('uncaught', e.stack || e.message); alerts.last = 0; alertTeam('crash', e); setTimeout(() => process.exit(1), 3000).unref(); });
if (!cfg.serverless) process.on('unhandledRejection', e => { log('unhandled', (e && e.stack) || e); alertTeam('background job', e); });

/* ---------------- start ---------------- */
function handle(req, res) {
  return route(req, res).catch(e => {
    const status = e.status || 500; if (status >= 500) { log(req.method, req.url, e.stack || e.message); alertTeam(req.method + ' ' + req.url.split('?')[0], e); }
    if (!res.headersSent) { if (/^\/(api|webhooks)\//.test(req.url) || String(req.headers['content-type']).includes('json')) json(res, { error: status >= 500 ? 'Something went wrong on our side. Try again.' : e.message }, status); else send(res, status, pages.plain({ title: 'Error', body: '<h1>' + (status >= 500 ? 'Something went wrong.' : E(e.message)) + '</h1><p><a href="javascript:history.back()">Go back</a></p>' })); }
    else try { res.end(); } catch (_) {}
  });
}
const server = http.createServer(handle);
if (require.main === module) {
  server.listen(cfg.port, () => {
    log('Bookingbooster running at ' + cfg.baseUrl);
    const t = testNotes(); if (t.length) log('Test mode for: ' + t.join(', ') + '. Messages are kept in the outbox table. See README to switch them on.');
    if (!ai.available().length) log('AI visibility checks: no API keys set, so scores stay as they are.');
    if (process.env.NODE_ENV === 'production') { const miss = require('./preflight').check(cfg, process.env).filter(r => r.must && !r.ok); if (miss.length) log('Not ready for launch yet. Missing: ' + miss.map(r => r.area).join(', ') + '. Run npm run preflight.'); }
  });
}
module.exports = { server, handle, route, tick, ws, auth, db, cfg, urls, files };
