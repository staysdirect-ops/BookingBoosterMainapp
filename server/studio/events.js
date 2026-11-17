// Event ads: find events near a home that bring people who need a bed for two or more nights (training courses,
// conferences, trade shows, county shows, festivals, tournaments), check them against the home's calendar, and write
// ready-to-run ads for Facebook, Instagram and Google that sell the free nights for that event.
//
// Where events come from (each one is optional, and the host can always add an event by hand):
//   web           Claude with web search (ANTHROPIC_API_KEY). Best for courses, conferences and anything local.
//   predicthq     PredictHQ (PREDICTHQ_TOKEN, paid). Conferences, expos, sport and festivals, with expected attendance.
//   ticketmaster  Ticketmaster Discovery API (TICKETMASTER_API_KEY, free). Shows, festivals, sport and concerts.
// Eventbrite is not here: its public event search API was switched off in 2020, so it cannot search by area.
'use strict';
const crypto = require('crypto');

const KINDS = { course: 'Training course', conference: 'Conference', expo: 'Trade show', show: 'Show or fair', festival: 'Festival', sport: 'Sports event', exam: 'Exam or assessment', other: 'Event' };
// who travels for each kind of event, and the words that sell a stay to them
const WHO = {
  course: { who: 'people on the course', need: 'a quiet room, a desk and fast Wi-Fi after a long day', meta: ['Professional development', 'Vocational education', 'Business travellers'] },
  conference: { who: 'delegates and speakers', need: 'a calm base close to the venue', meta: ['Business travellers', 'Conferences', 'Professional networking'] },
  expo: { who: 'exhibitors and visitors', need: 'room for the team and parking for the van', meta: ['Trade shows', 'Business travellers', 'Small business owners'] },
  show: { who: 'visitors, exhibitors and traders', need: 'a whole house for the family or the team', meta: ['Agricultural shows', 'Country life', 'Family days out'] },
  festival: { who: 'festival-goers', need: 'a proper bed and a shower after the day', meta: ['Music festivals', 'Live events', 'Weekend breaks'] },
  sport: { who: 'competitors, teams and supporters', need: 'space for the whole team and kit', meta: ['Sports fans', 'Amateur sport', 'Travel'] },
  exam: { who: 'candidates', need: 'a good night’s sleep close by', meta: ['Further education', 'Professional certification'] },
  other: { who: 'people travelling in for it', need: 'somewhere comfortable close by', meta: ['Travel', 'Weekend breaks'] },
};

const SOURCES = {
  web: { name: 'Web search by Claude', key: 'ANTHROPIC_API_KEY', price: 'About 1p a search from your AI credit', finds: 'Training courses, conferences, trade shows, county shows, festivals and anything else on the open web.' },
  predicthq: { name: 'PredictHQ', key: 'PREDICTHQ_TOKEN', price: 'Paid, with a free trial', finds: 'Conferences, expos, sport and festivals, with expected attendance.' },
  ticketmaster: { name: 'Ticketmaster', key: 'TICKETMASTER_API_KEY', price: 'Free key', finds: 'Shows, festivals, sport and concerts sold through Ticketmaster.' },
  manual: { name: 'Added by you', key: '', price: 'Free', finds: 'Any event, course or contract you know about.' },
};

/* ---------- dates ---------- */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const P = s => new Date(s + 'T00:00:00Z');
const add = (s, n) => { const x = P(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((P(b) - P(a)) / 864e5);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dm = s => P(s).getUTCDate() + ' ' + MON[P(s).getUTCMonth()];
function range(a, b) { // "9–11 Jul", "30 Jun – 2 Jul"
  if (a === b) return dm(a);
  const A = P(a), B = P(b);
  return A.getUTCMonth() === B.getUTCMonth() ? A.getUTCDate() + '–' + dm(b) : dm(a) + ' – ' + dm(b);
}

/* ---------- one event, cleaned ---------- */
const clean = (x, n) => String(x == null ? '' : x).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
function norm(e, source, propertyId) {
  e = e || {};
  const start = String(e.start || '').slice(0, 10), end0 = String(e.end || e.start || '').slice(0, 10);
  if (!ISO.test(start) || isNaN(P(start))) return null;
  const end = ISO.test(end0) && end0 >= start ? end0 : start;
  const name = clean(e.name, 120); if (!name) return null;
  const url = /^https?:\/\/[^\s]+$/i.test(String(e.url || '')) ? String(e.url).slice(0, 400) : '';
  const att = parseInt(e.attendance, 10);
  return { id: 'ev' + crypto.createHash('sha1').update(propertyId + '|' + name.toLowerCase() + '|' + start).digest('hex').slice(0, 10), propertyId, name, kind: KINDS[e.kind] ? e.kind : 'other', start, end, days: diff(start, end) + 1,
    venue: clean(e.venue, 100), town: clean(e.town, 60), url, audience: clean(e.audience, 160), why: clean(e.why, 200), attendance: att > 0 ? att : null, source: SOURCES[source] || source === 'sample' ? source : 'manual' };
}

// The same show listed once per day ("Kent County Show - Friday", "... - Saturday") becomes one event.
const unday = n => n.replace(/\s*[-–:|(]\s*(day \d+|(mon|tues|wednes|thurs|fri|satur|sun)day.*|weekend.*|\d+ day.*)\)?$/i, '').trim();
const base = n => unday(n).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function merge(list) {
  const out = [];
  list.slice().sort((a, b) => a.start.localeCompare(b.start)).forEach(e => {
    const same = out.find(x => base(x.name) === base(e.name) && (x.venue || '') === (e.venue || '') && e.start <= add(x.end, 1));
    if (same) { if (e.end > same.end) { same.end = e.end; same.days = diff(same.start, same.end) + 1; } same.name = unday(same.name) || same.name; same.url = same.url || e.url; same.attendance = same.attendance || e.attendance; return; }
    out.push(Object.assign({}, e));
  });
  return out;
}

/* ---------- the stay an event needs, against the home's calendar ---------- */
// Guests arrive the evening before the first day and leave after the last day, so a 3-day show (Fri–Sun)
// needs Thursday, Friday and Saturday nights.
function fit(ev, blocked, p, today) {
  const from = ev.start > today ? add(ev.start, -1) : add(today, 1), to = ev.end > from ? ev.end : add(from, 1);
  const nights = []; for (let x = from; x < to; x = add(x, 1)) nights.push(x);
  const free = nights.filter(x => !blocked.has(x));
  // the longest run of free nights inside the stay, which is what the ads sell
  let best = null, run = null;
  nights.forEach(x => { if (!blocked.has(x)) { run = run && add(run.to, 0) === x ? { from: run.from, to: add(x, 1) } : { from: x, to: add(x, 1) }; if (!best || diff(run.from, run.to) > diff(best.from, best.to)) best = Object.assign({}, run); } else run = null; });
  const n = best ? diff(best.from, best.to) : 0, min = Math.max(1, +p.minNights || 1);
  const status = !free.length ? 'booked' : free.length === nights.length ? 'free' : 'part';
  return { from, to, nights: nights.length, free: free.length, status: n && n < min ? 'booked' : status, stay: best && n >= min ? best : null, value: best && n >= min ? n * (+p.nightly || 0) + (+p.cleaning || 0) : 0 };
}

/* ---------- finding events ---------- */
const PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
async function locate(cfg, p) {
  if (+p.lat && +p.lng) return { lat: +p.lat, lng: +p.lng, place: p.area || '' };
  const m = String(p.address || '').match(PC) || String(p.area || '').match(PC);
  const api = (cfg.events.postcodesBase || 'https://api.postcodes.io');
  try {
    if (m) {
      const r = await fetch(api + '/postcodes/' + encodeURIComponent(m[1] + m[2]), { signal: AbortSignal.timeout(6000) });
      if (r.ok) { const j = (await r.json()).result; if (j) return { lat: j.latitude, lng: j.longitude, place: j.admin_district || j.parish || '', postcode: m[1].toUpperCase() + ' ' + m[2].toUpperCase() }; }
    }
    const town = String(p.area || '').split(',')[0].trim();
    if (town) {
      const r = await fetch(api + '/places?limit=1&q=' + encodeURIComponent(town), { signal: AbortSignal.timeout(6000) });
      if (r.ok) { const j = ((await r.json()).result || [])[0]; if (j) return { lat: j.latitude, lng: j.longitude, place: j.name_1 || town }; }
    }
  } catch (_) { /* fall through: web search still works from the town name */ }
  return null;
}

async function ticketmaster(cfg, loc, o) {
  const q = new URLSearchParams({ apikey: cfg.events.ticketmaster, latlong: loc.lat + ',' + loc.lng, radius: String(o.radius), unit: 'miles', countryCode: 'GB', startDateTime: o.from + 'T00:00:00Z', endDateTime: o.to + 'T23:59:59Z', size: '200', sort: 'date,asc' });
  const r = await fetch((cfg.events.ticketmasterBase || 'https://app.ticketmaster.com') + '/discovery/v2/events.json?' + q, { signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('Ticketmaster answered ' + r.status);
  const seg = { Sports: 'sport', Music: 'festival', 'Arts & Theatre': 'show', Miscellaneous: 'show' };
  return ((((await r.json())._embedded) || {}).events || []).map(e => { const v = ((e._embedded || {}).venues || [])[0] || {}, c = ((e.classifications || [])[0] || {}).segment || {};
    return { name: e.name, start: ((e.dates || {}).start || {}).localDate, end: ((e.dates || {}).end || {}).localDate, venue: v.name, town: (v.city || {}).name, url: e.url, kind: seg[c.name] || 'other' }; });
}

async function predicthq(cfg, loc, o) {
  const q = new URLSearchParams({ within: o.radius + 'mi@' + loc.lat + ',' + loc.lng, 'active.gte': o.from, 'active.lte': o.to, category: 'conferences,expos,festivals,sports,community,performing-arts', limit: '200', sort: 'start' });
  const r = await fetch((cfg.events.predicthqBase || 'https://api.predicthq.com') + '/v1/events/?' + q, { headers: { authorization: 'Bearer ' + cfg.events.predicthq, accept: 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error('PredictHQ answered ' + r.status);
  const cat = { conferences: 'conference', expos: 'expo', festivals: 'festival', sports: 'sport', community: 'show', 'performing-arts': 'show' };
  return ((await r.json()).results || []).map(e => { const v = (e.entities || []).find(x => x.type === 'venue') || {};
    return { name: e.title, start: String(e.start_local || e.start || '').slice(0, 10), end: String(e.predicted_end_local || e.end_local || e.end || '').slice(0, 10), venue: v.name, town: '', kind: cat[e.category] || 'other', attendance: e.phq_attendance, url: '' }; });
}

// Claude searches the web for events and courses, then answers with JSON. Only links it actually found are kept.
function webPrompt(f, loc, o) {
  return 'Find events near this UK holiday let that will bring people who need somewhere to stay for ' + o.minDays + ' or more nights in a row.\n\n' +
    'The home: ' + JSON.stringify({ name: f.name, area: f.area, town: f.town, postcode: (loc && loc.postcode) || '', sleeps: f.maxGuests, bedrooms: f.bedrooms, about: String(f.about || '').slice(0, 500) }) + '\n' +
    'Search area: within about ' + o.radius + ' miles of ' + (f.town || f.area) + '. Dates: ' + o.from + ' to ' + o.to + '.\n\n' +
    'Look for, in this order: multi-day professional training courses held at local venues (construction and site safety such as SMSTS, SSSTS and NEBOSH, first aid at work, NHS and nursing, teaching, HGV and plant, trades), ' +
    'conferences and trade shows at local event centres, county and agricultural shows, festivals, sports tournaments and championships, exams and assessment centres, university events such as graduations, and anything else that runs for ' + o.minDays + '+ consecutive days. ' +
    'Check each one on its own page. Skip single-day events, online-only courses and anything you could not find a date for.\n\n' +
    'Answer with JSON only, no other text: {"events":[{"name":"","kind":"course|conference|expo|show|festival|sport|exam|other","start":"YYYY-MM-DD","end":"YYYY-MM-DD","venue":"","town":"","url":"the page that confirms the dates","audience":"who travels for it, in a few words","attendance":0,"why":"one line on why its visitors need a place to stay"}]}. ' +
    'At most 15 events, soonest first. For a course that runs every month, give the next three dates as separate events. attendance is your best estimate or 0.';
}
async function web(cfg, f, loc, o, onUsage) {
  const key = cfg.ai.anthropic, root = cfg.ai.anthropicBase || 'https://api.anthropic.com', model = cfg.ai.studioModel || 'claude-opus-5-5';
  const messages = [{ role: 'user', content: webPrompt(f, loc, o) }], seen = new Set(); let text = '';
  for (let turn = 0; turn < 3; turn++) {
    const body = { model, max_tokens: 16000, system: 'You are a careful local events researcher for UK holiday let hosts. You only report events you found on real pages, with their real dates.', messages,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8, user_location: { type: 'approximate', country: 'GB', city: f.town || undefined } }], output_config: { effort: 'medium' }, fallbacks: 'default' };
    const r = await fetch(root + '/v1/messages', { method: 'POST', signal: AbortSignal.timeout(170000), headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Claude answered ' + r.status + ' ' + t.slice(0, 160)); }
    const j = await r.json(); if (onUsage) await onUsage(j.model || model, j.usage);
    if (j.stop_reason === 'refusal') throw new Error('Claude declined this search');
    (j.content || []).forEach(c => { if (c.type === 'web_search_tool_result' && Array.isArray(c.content)) c.content.forEach(x => x.url && seen.add(x.url)); if (c.type === 'text') text += c.text; });
    if (j.stop_reason !== 'pause_turn') break;
    messages.push({ role: 'assistant', content: j.content }); text = '';
  }
  const a = text.indexOf('{'), b = text.lastIndexOf('}');
  let out; try { out = JSON.parse(text.slice(a, b + 1)); } catch (_) { throw new Error('Claude did not return a usable list of events'); }
  const hosts = new Set([...seen].map(u => { try { return new URL(u).host; } catch (_) { return ''; } }));
  return (out.events || []).map(e => { let ok = false; try { ok = seen.has(e.url) || hosts.has(new URL(e.url).host); } catch (_) {} return Object.assign({}, e, { url: ok ? e.url : '' }); });
}

// Sample events for the demo homes, so the demo shows the whole flow without any keys. Dates follow the demo's today.
function samples(p, today) {
  const at = (n, d) => ({ start: add(today, n), end: add(today, n + d - 1) });
  const S = {
    laurel: [['Mountain Leader training course', 'course', 'Ambleside', 'Ambleside', 'Trainee Mountain Leaders on a six-day course', 38, 6], ['Lakeland Fell Running Championships', 'sport', 'Keswick', 'Keswick', 'Runners and their support crews', 52, 3], ['Cumbria Outdoor Trade Show', 'expo', 'Kendal Leisure Centre', 'Kendal', 'Outdoor brands and buyers', 96, 2]],
    lakeside: [['RYA Day Skipper practical course', 'course', 'Falmouth Marina', 'Falmouth', 'Sailors on a five-day practical', 24, 5], ['St Ives Arts Week', 'festival', 'Around the harbour', 'St Ives', 'Artists, makers and visitors', 61, 7], ['Cornwall Surf Championships', 'sport', 'Fistral Beach', 'Newquay', 'Surfers, judges and families', 120, 3]],
    loft: [['NHS clinical skills course', 'course', 'Royal United Hospital', 'Bath', 'Nurses and doctors on a three-day course', 20, 3], ['University of Bath graduation week', 'other', 'University of Bath', 'Bath', 'Graduates and their families', 228, 4], ['Bath Digital Conference', 'conference', 'The Assembly Rooms', 'Bath', 'Delegates from tech and media', 140, 2]],
  };
  return (S[p.id] || []).map(x => Object.assign({ name: x[0], kind: x[1], venue: x[2], town: x[3], audience: x[4], url: '', why: 'Sample event for the demo' }, at(x[5], x[6])));
}

// Runs every source the platform has a key for, at once. Returns { events, sources: [{ id, n, error }], loc }.
async function find(cfg, f, p, o, opts) {
  opts = opts || {};
  const loc = opts.demo ? null : await locate(cfg, p);
  const jobs = [];
  if (opts.demo) jobs.push(['sample', async () => samples(p, o.today)]);
  else {
    if (cfg.ai.anthropic && cfg.events.webSearch) jobs.push(['web', () => web(cfg, f, loc, o, opts.onUsage)]);
    if (cfg.events.predicthq && loc) jobs.push(['predicthq', () => predicthq(cfg, loc, o)]);
    if (cfg.events.ticketmaster && loc) jobs.push(['ticketmaster', () => ticketmaster(cfg, loc, o)]);
  }
  const res = await Promise.all(jobs.map(([id, fn]) => fn().then(list => ({ id, list }), e => ({ id, list: [], error: e.message }))));
  let all = []; res.forEach(r => { all = all.concat(r.list.map(e => norm(e, r.id, p.id)).filter(Boolean)); });
  const keep = e => e.days >= o.minDays && e.end > o.today && e.start <= o.to;
  const events = merge(all).filter(keep);
  return { events, loc, sources: res.map(r => ({ id: r.id, n: merge(r.list.map(e => norm(e, r.id, p.id)).filter(Boolean)).filter(keep).length, error: r.error || '' })) };
}

/* ---------- the ads ---------- */
const fits = (n, list) => [...new Set(list.map(x => clean(x, 200)).filter(x => x && x.length <= n))];
const title = s => s.replace(/\b([a-z])/g, (m, c) => c.toUpperCase());
function shortName(ev) { // a name that fits a 30-character headline, cut at a word
  const n = ev.name.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+\d{4}$/, '').replace(/\s+/g, ' ').trim();
  if (n.length <= 24) return n;
  let out = ''; for (const w of n.split(' ')) { if ((out + ' ' + w).trim().length > 24) break; out = (out + ' ' + w).trim(); }
  return out || n.slice(0, 24);
}
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');

// Copy written by rules, used without a key and as the fallback for anything Claude leaves out.
function rulesAds(f, ev, ft, o) {
  const W = WHO[ev.kind] || WHO.other, st = ft.stay || { from: ft.from, to: ft.to }, n = diff(st.from, st.to), dates = range(st.from, st.to); // arrival to departure, as hotels show it
  // sn is the event's name when it fits a headline; a name cut short reads badly, so long names are left out of headlines
  const near = ev.venue ? ev.venue : ev.town || f.town, sn0 = shortName(ev), sn = sn0 === ev.name.replace(/\s+\d{4}$/, '').trim() ? sn0 : '', code = o.code, pct = o.pct;
  const perks = [plural(f.bedrooms, 'bedroom') + ', sleeps ' + f.maxGuests].concat(f.amenities.filter(a => /wi-?fi|parking|kitchen|desk|ev charg|washer|garden/i.test(a)).slice(0, 2));
  const primary = (ev.kind === 'course' ? 'On the ' + ev.name + '? ' : 'Coming for ' + ev.name + '? ') + 'Stay at ' + f.short + ', near ' + near + '. ' +
    'The whole home is free ' + dates + ' (' + plural(n, 'night') + '): ' + perks.join(' · ') + '. Book direct with code ' + code + ' and save ' + pct + '%.';
  const headline = fits(40, ['Stay near ' + near + ', ' + dates, 'Free ' + dates + ' near ' + near, sn ? 'Free for ' + sn + ', ' + dates : '', 'Your base for ' + ev.name, 'Free ' + dates + ' · ' + f.short])[0] || ('Free ' + dates + ' · ' + f.short).slice(0, 40);
  const description = fits(30, ['Book direct · ' + pct + '% off', 'Sleeps ' + f.maxGuests + ' · ' + pct + '% off', pct + '% off with ' + code])[0];
  const heads = fits(30, [sn ? 'Stay Near ' + sn : '', sn ? sn + ' Accommodation' : '', sn ? 'Rooms for ' + sn : '', 'Near ' + near, 'Stay Near ' + near, title(f.short), 'Whole Home, Sleeps ' + f.maxGuests, plural(f.bedrooms, 'Bedroom') + ', Book Direct', 'Free ' + dates, n + ' Nights Free ' + dates, 'Book Direct & Save ' + pct + '%', 'Code ' + code + ' for ' + pct + '% Off',
    'Places to Stay in ' + f.town, f.town + ' Short Stay', 'No Booking Fees', 'Self Check-In', /wi-?fi/i.test(f.amenities.join(' ')) ? 'Fast Wi-Fi Included' : '', /parking/i.test(f.amenities.join(' ')) ? 'Parking Included' : '', f.rating >= 4.5 ? 'Rated ' + Number(f.rating).toFixed(2).replace(/0$/, '') + ' by Guests' : '']).slice(0, 15);
  const descs = fits(90, [
    'The whole home near ' + near + ', free ' + dates + '. Book direct and save ' + pct + '%.',
    plural(f.bedrooms, 'bedroom') + ', sleeps ' + f.maxGuests + '. ' + W.need[0].toUpperCase() + W.need.slice(1) + '.',
    'Use code ' + code + ' for ' + pct + '% off. No platform fees, and you deal with the host direct.',
    'Ideal for ' + W.who + ' at ' + ev.name + '. Check dates and book in two minutes.',
    'Free ' + dates + ' for ' + ev.name + '. Book direct, save ' + pct + '%.',
    'Free ' + dates + ' near ' + near + '. Book direct, save ' + pct + '%.']).slice(0, 4);
  const where = ev.town || f.town, home = f.town && f.town !== where ? f.town.toLowerCase() : '', kw = fits(80, [home ? home + ' accommodation' : '', home ? 'places to stay ' + home : '', ev.name.toLowerCase() + ' accommodation', 'where to stay ' + ev.name.toLowerCase(), 'accommodation near ' + near.toLowerCase(), 'hotels near ' + near.toLowerCase(), where.toLowerCase() + ' accommodation',
    'places to stay ' + where.toLowerCase(), where.toLowerCase() + ' short let', ev.kind === 'course' || ev.kind === 'expo' ? 'contractor accommodation ' + where.toLowerCase() : 'holiday let ' + where.toLowerCase(), ev.kind === 'course' ? 'business accommodation ' + where.toLowerCase() : 'group accommodation ' + where.toLowerCase()]);
  const landing = { eyebrow: (KINDS[ev.kind] + ' · ' + range(ev.start, ev.end)).slice(0, 60), headline: sn ? 'Your base for *' + sn + '*' : 'Your base for the *' + KINDS[ev.kind].toLowerCase() + '*', subhead: 'The whole of ' + f.short + ' is free ' + dates + ', close to ' + near + '. Book direct with the code below and save ' + pct + '%.',
    points: [perks[0][0].toUpperCase() + perks[0].slice(1), W.need[0].toUpperCase() + W.need.slice(1), 'Check-in from ' + f.checkin + ', no platform fees'].map(x => clean(x, 110)), button: 'Book these dates', urgency: 'Only these dates are open for ' + (sn || 'it') };
  return { meta: { primary: clean(primary, 600), headline, description, cta: 'Book now' }, google: { headlines: heads, descriptions: descs, keywords: kw, negatives: ['jobs', 'careers', 'salary', 'parking only', 'camping', 'hostel'] }, audience: { interests: W.meta.slice(), jobs: [], notes: '' }, landing };
}

const adSchema = () => { const s = { type: 'string' }, arr = { type: 'array', items: s };
  return { type: 'object', additionalProperties: false, required: ['meta', 'google', 'audience', 'landing'], properties: {
    meta: { type: 'object', additionalProperties: false, required: ['primary', 'headline', 'description'], properties: { primary: s, headline: s, description: s } },
    google: { type: 'object', additionalProperties: false, required: ['headlines', 'descriptions', 'keywords'], properties: { headlines: arr, descriptions: arr, keywords: arr } },
    audience: { type: 'object', additionalProperties: false, required: ['interests', 'jobs', 'notes'], properties: { interests: arr, jobs: arr, notes: s } },
    landing: { type: 'object', additionalProperties: false, required: ['eyebrow', 'headline', 'subhead', 'points', 'button', 'urgency'], properties: { eyebrow: s, headline: s, subhead: s, points: arr, button: s, urgency: s } } } }; };
function adPrompt(f, ev, ft, o) {
  const st = ft.stay;
  return 'Write paid ads that sell a stay at this UK holiday let to people travelling for an event nearby.\n\n' +
    'The home: ' + JSON.stringify({ name: f.name, short: f.short, town: f.town, area: f.area, sleeps: f.maxGuests, bedrooms: f.bedrooms, baths: f.baths, fromPerNight: '£' + f.nightly, amenities: f.amenities, about: String(f.about || '').slice(0, 600), rating: f.rating || null, rules: f.rules.slice(0, 4) }) + '\n' +
    'The event: ' + JSON.stringify({ name: ev.name, kind: KINDS[ev.kind], dates: ev.start + ' to ' + ev.end, venue: ev.venue, town: ev.town, audience: ev.audience, attendance: ev.attendance }) + '\n' +
    'Free nights to sell: check in ' + st.from + ', check out ' + st.to + ' (' + diff(st.from, st.to) + ' nights). Promo code ' + o.code + ' gives ' + o.pct + '% off when booked direct.\n\n' +
    'Rules: UK English, sentence case, specific, facts only, never claim distances or travel times you were not given. Never use the event organiser’s logo, or say or imply the home is official or endorsed by the event. ' +
    'meta (Facebook and Instagram): primary up to 300 characters, lead with the event and the dates; headline up to 40 characters; description up to 30 characters. ' +
    'google (responsive search ad): 12 to 15 headlines of at most 30 characters each, Title Case, varied (event, dates, the home, the offer, trust); 4 descriptions of at most 90 characters; 8 to 15 keywords people would search when looking for somewhere to stay for this event. ' +
    'audience: 3 to 6 Facebook detailed-targeting interests these travellers are likely to have; up to 6 job titles if the event is professional (empty for leisure events); notes: one sentence of targeting advice. ' +
    'landing: a short landing page: eyebrow under 60 characters, headline under nine words with one word wrapped in *asterisks*, subhead one or two sentences, three short benefit points, a button under five words, urgency an honest reason to book now (no fake scarcity).';
}
// Merges Claude's answer over the rules copy, keeping every limit.
function mergeAds(r, base) {
  const a = r || {}, m = a.meta || {}, g = a.google || {}, au = a.audience || {}, l = a.landing || {};
  const list = (x, n, max, fb) => { const v = fits(n, Array.isArray(x) ? x : []).slice(0, max); return v.length ? v : fb; };
  return {
    meta: { primary: clean(m.primary, 600) || base.meta.primary, headline: fits(40, [m.headline])[0] || base.meta.headline, description: fits(30, [m.description])[0] || base.meta.description, cta: 'Book now' },
    google: { headlines: list(g.headlines, 30, 15, base.google.headlines), descriptions: list(g.descriptions, 90, 4, base.google.descriptions), keywords: list(g.keywords, 80, 20, base.google.keywords), negatives: base.google.negatives },
    audience: { interests: list(au.interests, 60, 8, base.audience.interests), jobs: list(au.jobs, 60, 8, []), notes: clean(au.notes, 300) },
    landing: { eyebrow: clean(l.eyebrow, 60) || base.landing.eyebrow, headline: clean(l.headline, 90) || base.landing.headline, subhead: clean(l.subhead, 260) || base.landing.subhead, points: list(l.points, 110, 4, base.landing.points), button: clean(l.button, 32) || base.landing.button, urgency: clean(l.urgency, 80) || base.landing.urgency },
  };
}

// When to run the ads, where, and how much to spend. Plain advice the host can copy into Ads Manager and Google Ads.
function plan(f, ev, ft, today, loc) {
  const st = ft.stay, lead = ev.kind === 'course' || ev.kind === 'exam' ? 35 : ev.kind === 'festival' || ev.kind === 'show' ? 56 : 42;
  // spend about 12% of what the stay is worth, at no less than about £3 a day across both, over at most `lead` days
  const total = Math.max(30, Math.min(400, Math.round(ft.value * 0.12 / 5) * 5)), want = Math.max(7, Math.min(lead, Math.floor(total / 3)));
  const runTo = add(st.from, -2) > today ? add(st.from, -2) : add(today, 1), runFrom = add(runTo, -(want - 1)) > today ? add(runTo, -(want - 1)) : today;
  const days = Math.max(1, diff(runFrom, runTo) + 1);
  const per = x => Math.max(1, Math.round(x / days));
  return { runFrom, runTo, days, total, value: ft.value,
    meta: { budget: Math.round(total * 0.6), daily: per(total * 0.6), objective: 'Sales (or Traffic if the Meta pixel is not on your site yet)', placements: 'Advantage+ placements: Facebook and Instagram feeds, Stories and Reels',
      location: 'People living in the United Kingdom, excluding ' + (ev.town || f.town) + ' and 20 miles around it (locals do not need a bed)', age: ev.kind === 'course' || ev.kind === 'conference' || ev.kind === 'expo' ? '23 to 60' : '25 to 65' },
    google: { budget: total - Math.round(total * 0.6), daily: per(total - Math.round(total * 0.6)), bidding: 'Maximise clicks with a £1.50 maximum CPC, then Maximise conversions once you have 15 bookings', network: 'Search only. Turn off the Display network',
      location: 'United Kingdom, set to "Presence or interest", so people searching for ' + (ev.town || f.town) + ' from anywhere see it', radius: loc ? { lat: loc.lat, lng: loc.lng } : null } };
}

module.exports = { KINDS, WHO, SOURCES, find, fit, merge, norm, rulesAds, adPrompt, adSchema, mergeAds, plan, range, add, diff, samples, locate, base };
