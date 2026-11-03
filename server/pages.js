// HTML pages. Every page is the same app bundle plus a boot object; guest-facing pages also carry
// server-rendered content and structured data so search engines and AI crawlers can read them without JavaScript.
'use strict';
const buildWeb = require('../web/build');
let bundle = buildWeb();
const rebuild = () => { bundle = buildWeb(); };

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script>: no "</script>" breakouts, no HTML comment tricks.
const safeJson = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=DM+Sans:opsz,wght@9..40,400..700&family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Outfit:wght@400;500;600;700&family=Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500;600&display=swap">';

// The host app installs to a phone's home screen and opens to the phone view.
const APP_HEAD = '<link rel="manifest" href="/app/manifest.webmanifest"><meta name="theme-color" content="#3355FF"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">' +
  '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Bookings"><meta name="apple-mobile-web-app-status-bar-style" content="default">' +
  '<script>if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("/app/sw.js",{scope:"/app"}).catch(function(){})})</script>';
function page(o) {
  const js = o.bundle === 'demo' ? 'demo' : 'prod';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(o.title || 'Bookingbooster') + '</title>' +
    (o.description ? '<meta name="description" content="' + esc(o.description) + '">' : '') +
    (o.robots ? '<meta name="robots" content="' + esc(o.robots) + '">' : '') +
    (o.head || '') +
    '<link rel="icon" href="/assets/mark.svg" type="image/svg+xml"><link rel="icon" href="/assets/icons/icon-192.png" type="image/png" sizes="192x192">' + (o.app ? APP_HEAD : '') + FONTS +
    '<link rel="stylesheet" href="/assets/app.' + bundle.hash.css + '.css">' +
    '<style>[hidden]{display:none!important}body{margin:0}.seo{max-width:760px;margin:0 auto;padding:32px 20px;font:16px/1.6 system-ui,sans-serif;color:#1b1f2a}.seo h1{font-size:32px;line-height:1.15}</style>' +
    '</head><body>' +
    '<header class="pbar" id="bbBar"></header>' +
    '<main id="bbApp" class="surface">' + (o.content || '') + '</main>' +
    '<aside class="drawer" id="bbDrawer" hidden aria-label="Activity"><button class="iconbtn drawer-x" data-close aria-label="Close activity"><svg class="ic" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button><div class="drawer-body"></div></aside>' +
    (o.banner ? '<div class="test-banner" role="note">' + o.banner + '</div>' : '') +
    '<script>window.__BB_BOOT__=' + safeJson(o.boot) + ';</script>' +
    '<script src="/assets/' + js + '.' + bundle.hash[js] + '.js"></script>' +
    '</body></html>';
}
function plain(o) {
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(o.title) + '</title>' + (o.index ? '' : '<meta name="robots" content="noindex">') +
    '<link rel="icon" href="/assets/mark.svg" type="image/svg+xml">' + FONTS +
    '<style>' + AUTH_CSS + '</style></head><body><main class="au' + (o.wide === 'read' ? ' read' : o.wide ? ' wide' : '') + '"><a class="au-logo" href="/">' + MARK + '<b>bookingbooster</b></a>' + o.body + '</main></body></html>';
}
const MARK = '<svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true"><rect width="100" height="100" rx="26" fill="#3355FF"/><path d="M31 79 V34" stroke="#fff" stroke-width="11" stroke-linecap="round"/><path d="M20 35 L31 22 L42 35" fill="none" stroke="#FFC233" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 56 L54 39 L77 56 V79 H31" fill="none" stroke="#fff" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/><rect x="49" y="62" width="10" height="17" rx="2" fill="#FFC233"/></svg>';
const AUTH_CSS = `:root{--p:#2747F5;--ink:#0F1630;--fg:#0F1630;--mut:#5A6386;--line:#E6E5E0;--bg:#F7F6F2;--bad:#B4362B;color-scheme:light}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.55 'DM Sans',Geist,system-ui,sans-serif}
.au{max-width:440px;margin:0 auto;padding:48px 16px 64px}.au-logo{display:inline-flex;align-items:center;gap:10px;color:inherit;text-decoration:none;font:700 21px 'Bricolage Grotesque',sans-serif;letter-spacing:-.03em;margin-bottom:28px}
h1{font:600 32px/1.12 'Bricolage Grotesque',sans-serif;letter-spacing:-.03em;margin:0 0 8px}p{margin:0 0 18px;color:var(--mut)}
form{display:grid;gap:14px;margin-top:22px}label{display:grid;gap:6px;font-weight:600;font-size:14px}
input{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid #D6D5CF;background:#fff;color:inherit}input:focus{outline:2px solid var(--p);outline-offset:1px}
button{font:inherit;font-weight:600;padding:13px 18px;border-radius:10px;border:0;background:var(--ink);color:#fff;cursor:pointer}
.err{color:var(--bad);font-weight:600;margin:0}.ok{color:#178a4c;font-weight:600}.links{display:flex;justify-content:space-between;gap:12px;margin-top:18px;font-size:14px}a{color:var(--p)}
.card{background:#fff;border:1px solid var(--line);border-radius:14px;padding:18px;margin-top:18px}
.au.wide{max-width:1180px}.au.read{max-width:720px}.au.read li{margin-bottom:6px}.wide table td,.wide table th{padding:8px 10px 8px 0}.wide td form{margin-top:6px;gap:4px}.wide td input{padding:7px 10px;font-size:13px;border-radius:8px}.wide td button{padding:7px 14px;font-size:13px}.wide td summary{cursor:pointer;color:var(--p);font-weight:600}.wide td.act{min-width:260px}.wide button.sec{background:transparent;color:var(--p);border:1px solid var(--line)}@media(min-width:760px){.wide details.card>form{grid-template-columns:1fr 1fr}.wide details.card>form>p,.wide details.card>form>button{grid-column:1/-1}}`;

module.exports = { page, plain, esc, safeJson, rebuild, assets: () => bundle };
