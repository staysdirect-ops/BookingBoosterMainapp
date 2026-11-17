// Our own event finder. No event APIs: we read public web pages ourselves (council and tourism "what's on" pages,
// venue and showground event pages, training course listings, calendar feeds), pull the events out of them, keep
// them in our own index and remove the duplicates.
//
// How it reads a page, in this order:
//   1. schema.org data in the page (JSON-LD or microdata): Event and its kinds (BusinessEvent, SportsEvent, Festival,
//      ExhibitionEvent, EducationEvent...) and Course / CourseInstance. Most venue, ticketing and course sites publish
//      this so search engines can show their dates, so it is the most reliable.
//   2. calendar feeds (.ics) the page links to.
//   3. on an event's own page with no data, its title and the date range written on the page.
//
// Manners: we ask robots.txt first and do what it says for our name (BookingboosterEvents) or for everyone, we
// keep to Crawl-delay (and wait at least 1.5 seconds between pages on a site anyway), we skip pages marked noindex
// and do not follow links on pages marked nofollow, we only follow links on the same site, we read at most 25 pages
// of a site a day, and we say who we are in the user agent with a page that explains what we do.
// We keep only facts (name, dates, venue, link back), never anyone's text or pictures.
//
// Storage (the kv table, shared by every host, since public events are the same for everyone):
//   events:sources       [{ id, url, name, near: { lat, lng, place, postcode }, by: [workspace ids], added }]
//   events:src:<id>      { at, ok, error, pages, events: [event] }   what we last read from one source
// Starter sources for some areas are in event-sources.json and need no storage.
'use strict';
const crypto = require('crypto');
const dns = require('dns').promises;
const { privateIp } = require('../ical');
const G = require('./geo');

const TOKEN = 'BookingboosterEvents';
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const add = (s, n) => { const x = new Date(s + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sid = url => 'src' + crypto.createHash('sha1').update(normUrl(url)).digest('hex').slice(0, 10);
function normUrl(u) { try { const x = new URL(u); x.hash = ''; return x.toString().replace(/\/$/, ''); } catch (_) { return String(u); } }
const site = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };

/* ---------- fetching, safely ---------- */
// Public http(s) hosts only, 12 second limit, 3 MB limit, a few redirects on the same site.
async function get(url, o, hops = 0) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http and https pages can be read.');
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new Error('Could not find ' + u.hostname + '.'); });
  if (!o.allowPrivate && addrs.some(a => privateIp(a.address))) throw new Error('That address is not allowed.');
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(u, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': o.ua, accept: o.accept || 'text/html,application/xhtml+xml,text/calendar;q=0.9,*/*;q=0.5', 'accept-language': 'en-GB,en;q=0.8' } });
    const loc = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && loc && hops < 3) {
      const next = new URL(loc, u); if (site(next) !== site(u)) throw new Error('The page moved to another site (' + next.hostname + ').');
      return get(next.toString(), o, hops + 1);
    }
    const reader = r.body ? r.body.getReader() : null, chunks = []; let size = 0;
    if (reader) for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 3e6) { ctl.abort(); throw new Error('That page is too large.'); } chunks.push(value); }
    return { url: u.toString(), status: r.status, type: r.headers.get('content-type') || '', robotsTag: r.headers.get('x-robots-tag') || '', text: Buffer.concat(chunks).toString('utf8') };
  } catch (e) { if (e.name === 'AbortError') throw new Error(u.hostname + ' took too long to answer.'); throw e; }
  finally { clearTimeout(t); }
}

/* ---------- robots.txt (RFC 9309) ---------- */
function robots(text, token) {
  const groups = []; let g = null, lastUA = false;
  for (let line of String(text).split(/\r?\n/)) {
    line = line.replace(/#.*/, '').trim(); const i = line.indexOf(':'); if (!line || i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === 'user-agent') { if (!g || !lastUA) groups.push(g = { agents: [], rules: [], delay: null }); g.agents.push(v.toLowerCase()); lastUA = true; continue; }
    lastUA = false; if (!g) continue;
    if (k === 'allow' || k === 'disallow') g.rules.push({ allow: k === 'allow', path: v });
    else if (k === 'crawl-delay' && parseFloat(v) >= 0) g.delay = parseFloat(v);
  }
  const t = String(token).toLowerCase();
  let pick = groups.filter(x => x.agents.some(a => a !== '*' && a && t.startsWith(a)));
  if (!pick.length) pick = groups.filter(x => x.agents.includes('*'));
  return { rules: [].concat(...pick.map(x => x.rules)), delay: pick.map(x => x.delay).find(x => x != null) ?? null };
}
const esc = s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
// The longest matching rule wins; Allow wins a tie. No rule means allowed.
function allowed(r, url) {
  let path; try { const u = new URL(url); path = u.pathname + u.search; } catch (_) { return false; }
  if (r.all === false) return false;
  let best = null;
  for (const x of r.rules) {
    if (!x.path) continue;
    const end = x.path.endsWith('$'), p = end ? x.path.slice(0, -1) : x.path;
    if (!new RegExp('^' + p.split('*').map(esc).join('.*') + (end ? '$' : '')).test(path)) continue;
    if (!best || x.path.length > best.path.length || (x.path.length === best.path.length && x.allow)) best = x;
  }
  return !best || best.allow;
}
// 404 means no rules. Anything else that is not a 200 (403, 5xx, no answer) means we stay away for now.
async function robotsFor(url, o) {
  const root = new URL('/robots.txt', url).toString();
  try {
    const r = await get(root, Object.assign({}, o, { accept: 'text/plain' }));
    if (r.status === 200) return robots(r.text, TOKEN);
    if (r.status === 404 || r.status === 410) return { rules: [], delay: null };
    return { rules: [], delay: null, all: false, why: 'robots.txt answered ' + r.status };
  } catch (e) { return { rules: [], delay: null, all: false, why: 'could not read robots.txt (' + e.message + ')' }; }
}

/* ---------- reading events out of a page ---------- */
const decode = s => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&rsquo;/g, '’').replace(/&ndash;/g, '–').replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/\s+/g, ' ').trim();
const types = n => [].concat(n && n['@type'] || []).map(String);
const isEvent = t => t.some(x => /(^|:)(\w*Event|Festival|CourseInstance|EventSeries)$/.test(x) && !/^(Virtual)/.test(x));

const KIND_RULES = [
  ['course', /\b(course|training|certificate|certification|cpd|smsts|sssts|nebosh|iosh|cscs|citb|first aid|workshop|bootcamp|qualification|diploma|apprentice)/i],
  ['exam', /\b(exam|examination|assessment centre|test centre)\b/i],
  ['conference', /\b(conference|summit|congress|symposium|convention|forum)\b/i],
  ['expo', /\b(expo|trade show|exhibition|trade fair|b2b)\b/i],
  ['festival', /\b(festival|fest|music weekend)\b/i],
  ['sport', /\b(championship|tournament|cup|race|rally|regatta|marathon|open|league|grand prix|games)\b/i],
  ['show', /\b(show|fair|county show|agricultural|steam|game fair|motor)\b/i],
];
function classify(t, text) {
  const ty = t.join(' ');
  if (/CourseInstance|EducationEvent|Course\b/.test(ty)) return 'course';
  if (/SportsEvent/.test(ty)) return 'sport';
  if (/Festival|MusicEvent/.test(ty) && !/\b(course|conference)\b/i.test(text)) return 'festival';
  if (/ExhibitionEvent/.test(ty)) return /\b(art|gallery|museum)\b/i.test(text) ? 'other' : 'expo';
  for (const [k, re] of KIND_RULES) if (re.test(text)) return k;
  if (/BusinessEvent/.test(ty)) return 'conference';
  return 'other';
}
function dateOf(v) {
  const s = String(v == null ? '' : v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); // UK order
  return '';
}
function place(loc) {
  const L = [].concat(loc || []).find(x => x && (typeof x === 'string' || !/VirtualLocation/.test(types(x).join(' ')))); if (!L) return {};
  if (typeof L === 'string') return { venue: decode(L).replace(G.PC, '').replace(/[,\s]+$/, ''), postcode: G.outcode(L) };
  const a = L.address || {}, adr = typeof a === 'string' ? a : [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ');
  const geo = L.geo || {}, lat = parseFloat(geo.latitude), lng = parseFloat(geo.longitude);
  return { venue: decode(L.name || (typeof a === 'string' ? a : '')), town: decode(typeof a === 'object' ? a.addressLocality : ''), postcode: G.outcode(adr), lat: isFinite(lat) && lat ? lat : null, lng: isFinite(lng) && lng ? lng : null };
}
function fromLd(n, pageUrl, parent) {
  parent = parent || {};
  const t = types(n).concat(parent.types || []), status = String(n.eventStatus || ''), mode = String(n.eventAttendanceMode || n.courseMode || '');
  if (/Cancelled|Postponed/i.test(status) || /online|virtual/i.test(mode) && !/mixed|blended/i.test(mode)) return null;
  const sch = [].concat(n.courseSchedule || [])[0] || {};
  const name = decode(n.name || parent.name), start = dateOf(n.startDate || sch.startDate), end = dateOf(n.endDate || sch.endDate) || start;
  if (!name || !start) return null;
  let url = ''; try { url = new URL(String(n.url || parent.url || pageUrl), pageUrl).toString(); } catch (_) { url = pageUrl; }
  const cap = parseInt(n.maximumAttendeeCapacity, 10);
  return Object.assign({ name, start, end, url, kind: classify(t, name + ' ' + decode(n.description || parent.description || '').slice(0, 300)), attendance: cap > 0 ? cap : null, how: 'data' }, place(n.location || parent.location));
}
function walk(node, pageUrl, out, depth) {
  if (!node || typeof node !== 'object' || depth > 8 || out.length > 500) return;
  if (Array.isArray(node)) { node.forEach(x => walk(x, pageUrl, out, depth + 1)); return; }
  const t = types(node);
  if (t.some(x => /(^|:)Course$/.test(x)) && node.hasCourseInstance) {
    [].concat(node.hasCourseInstance).forEach(ci => { const e = fromLd(ci, pageUrl, { name: node.name, url: node.url, description: node.description, types: t, location: node.location }); if (e) out.push(e); });
    return;
  }
  if (isEvent(t)) { const e = fromLd(node, pageUrl); if (e) out.push(e); if (node.subEvent) walk(node.subEvent, pageUrl, out, depth + 1); return; }
  for (const v of Object.values(node)) if (v && typeof v === 'object') walk(v, pageUrl, out, depth + 1);
}
function jsonLd(html, pageUrl) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    let j; try { j = JSON.parse(m[1].trim().replace(/^<!--|-->$/g, '')); } catch (_) { continue; }
    walk(j, pageUrl, out, 0);
  }
  return out;
}
// Microdata: itemscope itemtype="https://schema.org/Event" with itemprop="name" / "startDate" / "endDate" / "location".
function microdata(html, pageUrl) {
  const out = [], re = /itemtype=["']https?:\/\/schema\.org\/(\w*Event|Festival|CourseInstance)["']/gi, hits = [...html.matchAll(re)];
  hits.forEach((h, i) => {
    const chunk = html.slice(h.index, i + 1 < hits.length ? hits[i + 1].index : h.index + 10000);
    const prop = (name, from) => { const c = from ? chunk.slice(from) : chunk, m = c.match(new RegExp('<[^>]*itemprop=["\'][^"\']*\\b' + name + '\\b[^"\']*["\'][^>]*>', 'i')); if (!m) return '';
      const a = m[0].match(/\b(?:content|datetime)=["']([^"']*)["']/i); if (a) return a[1]; const h2 = m[0].match(/\bhref=["']([^"']*)["']/i); if (h2 && name === 'url') return h2[1];
      return decode(c.slice(m.index + m[0].length).split('<')[0]); };
    const li = chunk.search(/itemprop=["'][^"']*\blocation\b/i);
    const n = { '@type': h[1], name: prop('name'), startDate: prop('startDate'), endDate: prop('endDate'), url: prop('url'), eventStatus: prop('eventStatus'), description: prop('description'),
      location: li >= 0 ? { name: prop('name', li), address: { postalCode: prop('postalCode', li), addressLocality: prop('addressLocality', li) } } : undefined };
    const e = fromLd(n, pageUrl); if (e) out.push(e);
  });
  return out;
}
// iCalendar feeds. Repeating events are taken at their first date.
function ics(text, pageUrl) {
  const out = [], lines = String(text).replace(/\r?\n[ \t]/g, '').split(/\r?\n/); let ev = null;
  const un = v => v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { ev = {}; continue; }
    if (line === 'END:VEVENT') {
      if (ev && ev.name && ev.start && ev.status !== 'CANCELLED') {
        let end = ev.end || ev.start; if (ev.end && ev.allDay && ev.end > ev.start) end = add(ev.end, -1); // DTEND of an all-day event is the day after
        const geo = (ev.geo || '').split(';').map(parseFloat);
        let url = pageUrl; try { if (ev.url) url = new URL(ev.url, pageUrl).toString(); } catch (_) {}
        out.push(Object.assign({ name: ev.name, start: ev.start, end: end < ev.start ? ev.start : end, url, kind: classify([], ev.name + ' ' + (ev.desc || '')), attendance: null, how: 'feed', venue: ev.loc ? ev.loc.split(',')[0].trim() : '', postcode: G.outcode(ev.loc || ''), lat: geo[0] || null, lng: geo[1] || null }));
      }
      ev = null; continue;
    }
    if (!ev) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const head = line.slice(0, i).toUpperCase(), key = head.split(';')[0], v = line.slice(i + 1);
    if (key === 'SUMMARY') ev.name = un(v).slice(0, 160);
    else if (key === 'DTSTART') { ev.start = dateOf(v); ev.allDay = /VALUE=DATE(?!-)/.test(head) || /^\d{8}$/.test(v.trim()); }
    else if (key === 'DTEND') ev.end = dateOf(v);
    else if (key === 'LOCATION') ev.loc = un(v);
    else if (key === 'URL') ev.url = v.trim();
    else if (key === 'GEO') ev.geo = v;
    else if (key === 'STATUS') ev.status = v.trim().toUpperCase();
    else if (key === 'DESCRIPTION') ev.desc = un(v).slice(0, 300);
  }
  return out;
}
// An event's own page with no data: its title and the first date range written on it ("9–11 July 2027").
const MONTHS = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const MI = m => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m.slice(0, 3).toLowerCase()) + 1;
const RANGE = new RegExp('(\\d{1,2})(?:st|nd|rd|th)?(?:\\s+(' + MONTHS + '))?(?:\\s+(\\d{4}))?\\s*(?:-|–|—|to|until|and)\\s*(?:(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*,?\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(' + MONTHS + ')\\s+(\\d{4})', 'i');
function textEvent(html, pageUrl) {
  const body = decode(html.replace(/<(script|style|nav|header|footer)[\s\S]*?<\/\1>/gi, ' ')), m = body.match(RANGE); if (!m) return [];
  const p2 = n => String(n).padStart(2, '0');
  const end = m[6] + '-' + p2(MI(m[5])) + '-' + p2(m[4]);
  let sm = m[2] ? MI(m[2]) : MI(m[5]), sy = +(m[3] || m[6]); if (!m[3] && sm > MI(m[5])) sy--;
  const start = sy + '-' + p2(sm) + '-' + p2(m[1]);
  if (!ISO.test(start) || !ISO.test(end) || end < start || (new Date(end) - new Date(start)) / 864e5 > 31) return []; // a season or opening times, not an event
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)["']/i) || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || html.match(/<title>([\s\S]*?)<\/title>/i);
  const name = og ? decode(og[1]).split(/\s+[|–-]\s+/)[0] : ''; if (!name) return [];
  return [{ name, start, end, url: pageUrl, kind: classify([], name + ' ' + body.slice(0, 2000)), attendance: null, how: 'text', venue: '', postcode: G.outcode(body), lat: null, lng: null }];
}
// Everything a page holds: events, plus links worth reading next.
function extract(page, base) {
  const html = page.text, url = page.url, tag = (page.robotsTag || '') + ' ' + ((html.match(/<meta[^>]+name=["']robots["'][^>]*>/i) || [''])[0]);
  const noindex = /noindex|none/i.test(tag), nofollow = /nofollow|none/i.test(tag);
  if (/text\/calendar/i.test(page.type) || /^\s*BEGIN:VCALENDAR/.test(html)) return { events: ics(html, url), links: [], feeds: [] };
  let events = noindex ? [] : jsonLd(html, url).concat(microdata(html, url));
  const links = [], feeds = [];
  if (!nofollow) {
    for (const m of html.matchAll(/<(a|link)\b[^>]*href=["']([^"'#]+)["'][^>]*>/gi)) {
      let u; try { u = new URL(decode(m[2]), url); } catch (_) { continue; }
      if (!/^https?:$/.test(u.protocol) || site(u) !== site(base)) continue; u.hash = '';
      const s = u.toString(), tagTxt = m[0];
      if (/rel=["'][^"']*nofollow/i.test(tagTxt)) continue;
      if (/\.ics(\?|$)/i.test(u.pathname) || /text\/calendar/i.test(tagTxt)) { feeds.push(s); continue; }
      if (/\.(pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|css|js|mp4|mp3)$/i.test(u.pathname) || m[1].toLowerCase() === 'link' && !/rel=["']next/i.test(tagTxt)) continue;
      const next = /rel=["']next/i.test(tagTxt) || (u.pathname === new URL(url).pathname && /[?&](page|p|pg)=\d+/i.test(u.search)) || /\/page\/\d+\/?$/.test(u.pathname);
      links.push({ url: s, next });
    }
  }
  return { events, links, feeds, noindex };
}
// Which links on a listing page look like one event's own page.
const EVENTY = /(event|whats-on|what-s-on|whatson|course|training|show|festival|conference|exhibition|programme|fixture|calendar|diary|agenda|workshop)/i;

/* ---------- reading one source ---------- */
// Reads the source page, its next pages, calendar feeds and the events' own pages, within the limits above.
async function crawl(src, o) {
  const opt = { ua: o.ua, allowPrivate: !!o.allowPrivate }, maxPages = o.maxPages || 25, until = Date.now() + (o.budgetMs || 120000);
  const rb = await robotsFor(src.url, opt);
  if (rb.all === false) return { ok: false, error: 'We are staying away: ' + rb.why + '.', pages: 0, events: [] };
  if (!allowed(rb, src.url)) return { ok: false, error: 'This site’s robots.txt asks crawlers not to read that page, so we don’t.', pages: 0, events: [], blocked: true };
  const gap = Math.max(1500, Math.min(rb.delay != null ? rb.delay * 1000 : 0, 60000)), seen = new Set(), found = [];
  const queue = [{ url: src.url, depth: 0 }]; let pages = 0, last = 0, err = '';
  const baseDir = (() => { const u = new URL(src.url); return u.pathname.replace(/[^/]*$/, ''); })();
  while (queue.length && pages < maxPages && Date.now() < until) {
    const q = queue.shift(), key = normUrl(q.url); if (seen.has(key)) continue; seen.add(key);
    if (!allowed(rb, q.url)) continue;
    const wait = last + gap - Date.now(); if (wait > 0) { if (Date.now() + wait > until) break; await sleep(wait); }
    last = Date.now(); pages++;
    let page; try { page = await get(q.url, opt); } catch (e) { if (!q.depth) err = e.message; continue; }
    if (page.status !== 200) { if (!q.depth && q.feed !== true) err = 'The page answered ' + page.status + '.'; continue; }
    const x = extract(page, src.url), evs = x.events;
    if (q.depth === 1 && !evs.length && !x.noindex) evs.push(...textEvent(page.text, page.url));
    found.push(...evs);
    if (q.depth === 0) {
      x.feeds.slice(0, 3).forEach(f => queue.unshift({ url: f, depth: 2, feed: true }));
      x.links.filter(l => l.next).slice(0, 5).forEach(l => queue.push({ url: l.url, depth: 0 }));
      // an event's own page often has the end date and venue the listing leaves out
      const known = new Set(found.map(e => normUrl(e.url)));
      x.links.filter(l => !l.next && normUrl(l.url) !== key && (EVENTY.test(l.url) || new URL(l.url).pathname.startsWith(baseDir)) && new URL(l.url).pathname.length > baseDir.length && !known.has(normUrl(l.url)))
        .slice(0, 40).forEach(l => queue.push({ url: l.url, depth: 1 }));
    }
  }
  if (!pages) return { ok: false, error: err || 'Nothing could be read.', pages, events: [] };
  return { ok: !err || found.length > 0, error: found.length ? '' : err, pages, events: tidy(found, o.today) };
}
// One copy of each event, nothing over, nothing silly.
function tidy(list, today) {
  const by = new Map();
  list.forEach(e => {
    if (!e || !ISO.test(e.start) || !ISO.test(e.end) || (today && e.end < today) || e.end > add(e.start, 120)) return;
    const k = e.name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + e.start, old = by.get(k);
    if (!old) return by.set(k, e);
    // keep the richest copy: the event's own page beats a listing line
    ['end', 'venue', 'town', 'postcode', 'lat', 'lng', 'attendance'].forEach(f => { if (!old[f] && e[f]) old[f] = e[f]; }); if (e.end > old.end) old.end = e.end;
    if (old.how === 'data' && e.how === 'data' && e.url && normUrl(e.url) !== normUrl(old.url) && e.url.length > old.url.length) old.url = e.url;
  });
  return [...by.values()].sort((a, b) => a.start.localeCompare(b.start)).slice(0, 400);
}

/* ---------- the shared index ---------- */
module.exports = function Finder({ kv, cfg, log }) {
  const ua = TOKEN + '/1.0 (+' + (cfg.baseUrl || 'https://booking-booster.co.uk') + '/bot)';
  const allowPrivate = !!process.env.EVENTS_ALLOW_PRIVATE_FOR_TESTS;
  const read = async k => { try { const r = await kv.get(k); return r ? JSON.parse(r.v) : null; } catch (_) { return null; } };
  const write = (k, o) => kv.set(k, JSON.stringify(o));
  const seedFile = (cfg.events || {}).seeds; let seeds = [];
  if (seedFile !== 'off') try { seeds = (seedFile ? JSON.parse(require('fs').readFileSync(seedFile, 'utf8')) : require('./event-sources.json')).sources.map(s => Object.assign({ id: sid(s.url), seed: true, by: [], near: G.point(s.postcode) ? Object.assign(G.point(s.postcode), { place: s.place || '' }) : null }, s)); } catch (_) {}
  seeds = seeds.filter((x, i) => seeds.findIndex(y => y.id === x.id) === i);
  let lock = Promise.resolve(); // one change to the source list at a time in this process
  const locked = fn => (lock = lock.then(fn, fn));

  async function all() { const mine = (await read('events:sources')) || []; const ids = new Set(mine.map(s => s.id)); return mine.concat(seeds.filter(s => !ids.has(s.id))); }
  const today = () => new Date().toISOString().slice(0, 10);

  async function run(src, quick) {
    const r = await crawl(src, { ua, allowPrivate, today: today(), maxPages: quick ? 6 : 25, budgetMs: quick ? 25000 : 120000 });
    const old = (await read('events:src:' + src.id)) || {};
    // a failed read keeps what we found last time, so one bad day does not empty the list
    const keep = r.ok ? r.events : (r.blocked ? [] : (old.events || []).filter(e => e.end >= today()));
    await write('events:src:' + src.id, { at: new Date().toISOString(), ok: r.ok, error: r.error || '', pages: r.pages, events: keep });
    log && log('events', 'read', src.url, r.pages + ' pages', keep.length + ' events', r.error || '');
    return Object.assign({}, r, { events: keep });
  }

  // Sources a host sees: the ones they added, and starter or other hosts' sources near their home.
  async function forHost(wid, loc, radius) {
    const list = (await all()).filter(s => s.by.includes(wid) || (loc && s.near && G.miles(loc, s.near) <= (radius || 25) + 15));
    return Promise.all(list.map(async s => { const x = (await read('events:src:' + s.id)) || {};
      return { id: s.id, url: s.url, name: s.name, site: site(s.url), mine: s.by.includes(wid), seed: !!s.seed, place: (s.near || {}).place || '', at: x.at || null, ok: x.ok !== false, error: x.error || '', n: (x.events || []).filter(e => e.end >= today()).length }; }));
  }

  // Events near a home, from every source in reach, before duplicates are merged (events.js does that).
  async function near(wid, loc, o) {
    const list = (await all()).filter(s => s.by.includes(wid) || (loc && s.near && G.miles(loc, s.near) <= o.radius + 15));
    const out = [], stats = [];
    for (const s of list) {
      const x = (await read('events:src:' + s.id)) || {}; let n = 0;
      (x.events || []).forEach(e => {
        const at = e.lat && e.lng ? { lat: e.lat, lng: e.lng } : G.point(e.postcode) || s.near;
        if (loc && at && G.miles(loc, at) > o.radius) return;
        if (!at && !s.by.includes(wid)) return;
        out.push(Object.assign({}, e, { site: site(e.url || s.url) || site(s.url), sourceId: s.id })); n++;
      });
      stats.push({ id: s.id, name: s.name, n, error: x.at ? (x.ok === false ? x.error : '') : 'not read yet' });
    }
    return { events: out, sources: stats };
  }

  async function watch(wid, url, near0, name) {
    let u; try { u = new URL(String(url).trim()); } catch (_) { throw new Error('That is not a valid link.'); }
    if (!/^https?:$/.test(u.protocol)) throw new Error('Links start with https://');
    u.hash = ''; const id = sid(u.toString());
    const rb = await robotsFor(u.toString(), { ua, allowPrivate });
    if (rb.all === false) throw new Error('We could not check that site’s rules for crawlers (' + rb.why + '), so we won’t read it. Try again later, or add its events yourself.');
    if (!allowed(rb, u.toString())) throw new Error('That site’s robots.txt asks crawlers not to read this page, so we won’t. Add its events yourself instead.');
    const src = await locked(async () => {
      const list = (await read('events:sources')) || [], s0 = seeds.find(x => x.id === id);
      let s = list.find(x => x.id === id);
      if (!s) { s = Object.assign({ id, url: u.toString(), name: String(name || '').replace(/[<>]/g, '').trim().slice(0, 80) || site(u.toString()), near: near0 || (s0 && s0.near) || null, by: [], added: today() }); if (list.length >= 5000) throw new Error('We are watching too many pages right now.'); list.push(s); }
      if (!s.by.includes(wid)) s.by.push(wid);
      if (!s.near && near0) s.near = near0;
      await write('events:sources', list); return s;
    });
    const x = await read('events:src:' + id);
    const r = x && x.at && Date.now() - new Date(x.at) < 6 * 36e5 ? x : await run(src, true);
    return { id, n: (r.events || []).length, error: r.ok === false ? r.error : '' };
  }
  async function unwatch(wid, id) {
    await locked(async () => { const list = (await read('events:sources')) || []; const s = list.find(x => x.id === id); if (!s) return;
      s.by = s.by.filter(x => x !== wid); await write('events:sources', s.by.length ? list : list.filter(x => x.id !== id)); });
  }

  // Background: read the sources that are due, a few at a time. Each source about once a day; failures retry after 6 hours.
  async function due(limit, budgetMs) {
    const stop = Date.now() + (budgetMs || 240000), list = await all(), pick = [];
    for (const s of list) {
      if (!s.seed && !s.by.length) continue;
      const x = (await read('events:src:' + s.id)) || {}, age = x.at ? Date.now() - new Date(x.at) : Infinity;
      if (age > (x.ok === false ? 6 : 22) * 36e5) pick.push([age, s]);
    }
    pick.sort((a, b) => b[0] - a[0]); let n = 0;
    for (const [, s] of pick.slice(0, limit || 3)) { if (Date.now() > stop) break; try { await run(s); n++; } catch (e) { log && log('events', s.url, e.message); } }
    return n;
  }
  // Starter sources near a home that have never been read: read them now, quickly, so a new host sees events today.
  async function warm(loc, radius, max) {
    if (!loc) return 0; let n = 0;
    for (const s of seeds.filter(s => s.near && G.miles(loc, s.near) <= radius + 15)) { if (n >= (max || 2)) break; if (!(await read('events:src:' + s.id))) { await run(s, true); n++; } }
    return n;
  }
  return { forHost, near, watch, unwatch, due, warm, run, all, ua };
};
Object.assign(module.exports, { robots, allowed, extract, jsonLd, microdata, ics, textEvent, crawl, tidy, classify, TOKEN, sid });
