// A host's own website that we do not serve (WordPress, Wix, Squarespace and the rest). We cannot write to it, so the
// host does one thing once: paste our snippet into the site's header, or add two DNS records. After that the daily
// indexing run verifies the site with Google and Bing through our own accounts and submits its sitemap, as for the
// sites we host. The snippet also carries the home's structured data and a link to its llms.txt for AI crawlers.
'use strict';
const seo = require('./seo');

// Only public https addresses: no IPs, ports, localhost or single-label names.
function originOf(u) {
  try { const x = new URL(String(u || '').trim()); if (x.protocol !== 'https:' || x.port || x.username || !/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(x.hostname) || /^\d+(\.\d+)+$/.test(x.hostname)) return ''; return x.origin.toLowerCase(); }
  catch (_) { return ''; }
}

// The home's structured data, written for the host's page: the host's site is the url, our booking page is where to book.
function jsonLd(s, p, origin, bookUrl, base) {
  const g = seo.jsonLd(s, p, origin + '/')['@graph'];
  const abs = u => (typeof u === 'string' && u.startsWith('/') ? base + u : u);
  const keep = g.filter(n => ['VacationRental', 'LodgingBusiness', 'Organization', 'ItemList'].includes(n['@type'])).map(n => JSON.parse(JSON.stringify(n)));
  keep.forEach(n => {
    if (Array.isArray(n.image)) n.image = n.image.map(x => (typeof x === 'string' ? abs(x) : Object.assign(x, { url: abs(x.url), contentUrl: abs(x.contentUrl) })));
    else if (n.image) n.image = abs(n.image);
    if (n['@type'] === 'VacationRental' || n['@type'] === 'LodgingBusiness') {
      n.sameAs = [bookUrl].concat(n.sameAs || []);
      n.potentialAction = { '@type': 'ReserveAction', target: { '@type': 'EntryPoint', urlTemplate: bookUrl, actionPlatform: ['https://schema.org/DesktopWebPlatform', 'https://schema.org/MobileWebPlatform'] }, result: { '@type': 'LodgingReservation', name: 'Book ' + p.name + ' direct' } };
    }
    if (n.makesOffer) n.makesOffer.url = bookUrl;
  });
  return { '@context': 'https://schema.org', '@graph': keep };
}

// codes: { google: {meta, txt, domain}, bing: {code} }. Returns the header snippet and the DNS records.
function kit(s, p, origin, bookUrl, llmsUrl, base, codes) {
  const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const g = codes.google || {}, b = codes.bing || {};
  const lines = ['<!-- Bookingbooster: helps Google, Bing and AI assistants find ' + String(p.name).replace(/--/g, '-') + ' -->'];
  if (g.meta) lines.push('<meta name="google-site-verification" content="' + esc(g.meta) + '">');
  if (b.code) lines.push('<meta name="msvalidate.01" content="' + esc(b.code) + '">');
  lines.push('<link rel="alternate" type="text/plain" title="llms.txt" href="' + esc(llmsUrl) + '">');
  lines.push('<script type="application/ld+json">' + JSON.stringify(jsonLd(s, p, origin, bookUrl, base)).replace(/</g, '\\u003c') + '</script>');
  const dns = [];
  if (g.txt) dns.push({ engine: 'Google', type: 'TXT', name: '@ (' + g.domain + ')', value: g.txt });
  if (b.code) dns.push({ engine: 'Bing', type: 'CNAME', name: b.code, value: 'verify.bing.com' });
  return { origin, snippet: lines.join('\n'), dns };
}

// Reads the host's home page and robots.txt: is our snippet there, and where is the sitemap?
async function check(origin, codes) {
  const get = async path => { try { const r = await fetch(origin + path, { redirect: 'follow', signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'Bookingbooster-SiteCheck/1.0 (+https://booking-booster.co.uk)' } }); return r.ok ? (await r.text()).slice(0, 400000) : ''; } catch (_) { return ''; } };
  const [home, robots] = await Promise.all([get('/'), get('/robots.txt')]);
  const has = v => !!v && home.includes(v);
  const sm = (robots.match(/^\s*sitemap:\s*(\S+)/im) || [])[1];
  const sitemap = sm && originOf(sm) === origin ? sm : origin + '/sitemap.xml';
  return { reached: !!home, google: has((codes.google || {}).meta), bing: has((codes.bing || {}).code), structured: home.includes('Bookingbooster: helps Google'), sitemap };
}

module.exports = { originOf, jsonLd, kit, check };
