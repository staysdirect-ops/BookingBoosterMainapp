// Google Search Console for every host site, run by Bookingbooster's own Google service account, so hosts never sign in:
//  1. Site Verification API gives a meta tag for the site's address. We serve it on the site's home page (we host it),
//     then ask Google to verify. The service account becomes a verified owner.
//  2. Search Console API adds the site and submits its sitemap.
//  3. Search Console API reads the last 28 days of clicks, impressions, position and top searches for each home.
// Needs GOOGLE_SERVICE_ACCOUNT_JSON (the key file's JSON, or the same base64-encoded) with the Site Verification and
// Search Console APIs enabled on its Google Cloud project. Without it, nothing here runs.
'use strict';
const crypto = require('crypto');

module.exports = function (cfg, kv, log) {
  const G = cfg.google || {};
  let sa = null;
  try { const raw = String(G.serviceAccount || '').trim(); if (raw) sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')); } catch (e) { log && log('google', 'GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON'); }
  const enabled = !!(sa && sa.client_email && sa.private_key);
  const OAUTH = G.oauthUrl || 'https://oauth2.googleapis.com/token', API = (G.apiBase || 'https://www.googleapis.com').replace(/\/$/, '');
  const SCOPES = 'https://www.googleapis.com/auth/siteverification https://www.googleapis.com/auth/webmasters';
  const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  let tok = null;
  async function token() {
    if (tok && tok.exp > Date.now() + 60e3) return tok.v;
    const now = Math.floor(Date.now() / 1000);
    const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' })), claim = b64u(JSON.stringify({ iss: sa.client_email, scope: SCOPES, aud: OAUTH, iat: now, exp: now + 3600 }));
    const sig = b64u(crypto.sign('RSA-SHA256', Buffer.from(head + '.' + claim), sa.private_key));
    const r = await fetch(OAUTH, { method: 'POST', signal: AbortSignal.timeout(15000), headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + sig }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !j.access_token) throw new Error('Google sign-in failed: ' + (j.error_description || j.error || r.status));
    tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return tok.v;
  }
  async function call(method, path, body) {
    const r = await fetch(API + path, { method, signal: AbortSignal.timeout(20000), headers: { authorization: 'Bearer ' + await token(), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (_) {}
    if (!r.ok) { const e = new Error((j.error && (j.error.message || j.error.status)) || 'Google answered ' + r.status); e.status = r.status; throw e; }
    return j;
  }
  // The verification meta tag's content for a site address, kept in kv so every server instance serves the same one.
  const key = origin => 'gsv:' + origin;
  const memo = new Map();
  async function metaFor(origin) {
    if (!enabled) return '';
    if (memo.has(origin)) return memo.get(origin);
    const row = await kv.get(key(origin)); const v = row ? row.v : ''; memo.set(origin, v); return v;
  }
  async function metaTag(origin) { const v = await metaFor(origin); return v ? '<meta name="google-site-verification" content="' + v.replace(/[^\w-]/g, '') + '">' : ''; }
  async function verify(origin) {
    const site = { type: 'SITE', identifier: origin + '/' };
    if (!await metaFor(origin)) {
      const j = await call('POST', '/siteVerification/v1/token', { verificationMethod: 'META', site });
      const m = String(j.token || '').match(/content="([^"]+)"/); const v = m ? m[1] : String(j.token || '');
      if (!v) throw new Error('Google gave no verification token');
      await kv.set(key(origin), v); memo.set(origin, v);
    }
    await call('POST', '/siteVerification/v1/webResource?verificationMethod=META', { site });
  }
  const enc = encodeURIComponent;
  // Verifies (once), adds the property and submits the sitemap. property is the site's origin + '/'.
  async function submit(origin, sitemapUrl) {
    const property = origin + '/';
    const done = await kv.get('gsc:' + origin);
    if (!done) { await verify(origin); await call('PUT', '/webmasters/v3/sites/' + enc(property)); await kv.set('gsc:' + origin, new Date().toISOString()); }
    await call('PUT', '/webmasters/v3/sites/' + enc(property) + '/sitemaps/' + enc(sitemapUrl));
    return { property };
  }
  // Last 28 days for pages under pagePrefix: totals and the top searches.
  async function performance(origin, pagePrefix) {
    const end = new Date(Date.now() - 2 * 864e5), start = new Date(end.getTime() - 27 * 864e5), d = x => x.toISOString().slice(0, 10);
    const base = { startDate: d(start), endDate: d(end), dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: pagePrefix }] }] };
    const path = '/webmasters/v3/sites/' + enc(origin + '/') + '/searchAnalytics/query';
    const tot = ((await call('POST', path, base)).rows || [])[0] || {};
    const q = (await call('POST', path, Object.assign({ dimensions: ['query'], rowLimit: 10 }, base))).rows || [];
    const r1 = n => Math.round((n || 0) * 10) / 10;
    return { from: d(start), to: d(end), clicks: tot.clicks || 0, impressions: tot.impressions || 0, ctr: r1(100 * (tot.ctr || 0)), position: r1(tot.position), queries: q.map(x => ({ q: String(x.keys[0]).slice(0, 100), clicks: x.clicks || 0, impressions: x.impressions || 0, position: r1(x.position) })) };
  }
  return { enabled, metaTag, submit, performance, account: enabled ? sa.client_email : null };
};
