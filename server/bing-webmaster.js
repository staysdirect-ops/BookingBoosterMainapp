// Bing Webmaster Tools for every host site and our own, run with Bookingbooster's own Bing API key, so hosts never sign in.
// Bing's index feeds ChatGPT search, Microsoft Copilot, DuckDuckGo and several other AI assistants.
//  1. AddSite puts the site's address in our Bing account. Bing gives it a verification code.
//  2. We serve that code as a msvalidate.01 meta tag on the site's home page (we host it), then call VerifySite.
//  3. Once verified, SubmitFeed submits the sitemap and SubmitUrlBatch asks for the home page to be recrawled.
// Needs BING_WEBMASTER_API_KEY (Bing Webmaster Tools, Settings, API access). Without it, nothing here runs.
'use strict';

module.exports = function (cfg, kv, log) {
  const B = cfg.bing || {};
  const apiKey = String(B.apiKey || '').trim(), enabled = !!apiKey;
  const API = (B.apiBase || 'https://ssl.bing.com/webmaster/api.svc/json').replace(/\/$/, '');
  async function call(method, name, body) {
    const r = await fetch(API + '/' + name + '?apikey=' + encodeURIComponent(apiKey), { method, signal: AbortSignal.timeout(20000),
      headers: { 'content-type': 'application/json; charset=utf-8' }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = {}; try { j = t ? JSON.parse(t) : {}; } catch (_) {}
    if (!r.ok) { const e = new Error(j.Message || j.message || 'Bing answered ' + r.status); e.status = r.status; e.code = j.ErrorCode; throw e; }
    return j.d !== undefined ? j.d : j;
  }
  const norm = u => String(u || '').toLowerCase().replace(/\/+$/, '');
  // The verification code for a site address, kept in kv so every server instance serves the same one.
  const key = origin => 'bsv:' + origin;
  const memo = new Map();
  async function codeFor(origin) {
    if (!enabled) return '';
    if (memo.has(origin)) return memo.get(origin);
    const row = await kv.get(key(origin)); const v = row ? row.v : ''; if (v) memo.set(origin, v); return v;
  }
  async function metaTag(origin) { const v = await codeFor(origin); return v ? '<meta name="msvalidate.01" content="' + v.replace(/[^\w-]/g, '') + '">' : ''; }
  async function find(origin) { return ((await call('GET', 'GetUserSites')) || []).find(x => norm(x.Url) === norm(origin)); }
  // Adds (once), verifies, then submits the sitemap and the given pages. Returns { state: 'submitted' | 'verifying' }.
  async function submit(origin, sitemapUrl, pages) {
    const siteUrl = origin + '/';
    let site = await find(origin);
    if (!site) { try { await call('POST', 'AddSite', { siteUrl }); } catch (e) { if (!/exist/i.test(e.message)) throw e; } site = await find(origin); }
    if (!site) throw new Error('Bing did not add the site');
    if (site.AuthenticationCode && site.AuthenticationCode !== await codeFor(origin)) { await kv.set(key(origin), site.AuthenticationCode); memo.set(origin, site.AuthenticationCode); }
    if (!site.IsVerified && !await call('POST', 'VerifySite', { siteUrl })) return { state: 'verifying' };
    await call('POST', 'SubmitFeed', { siteUrl, feedUrl: sitemapUrl });
    if (pages && pages.length) {
      try { await call('POST', 'SubmitUrlBatch', { siteUrl, urlList: pages.slice(0, 10) }); }
      catch (e) { log && log('bing urls', origin, e.message); } // a used-up daily quota does not undo the sitemap
    }
    return { state: 'submitted' };
  }
  return { enabled, metaTag, submit };
};
