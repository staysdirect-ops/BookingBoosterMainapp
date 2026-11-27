// Calendar sync add-on. Reads calendar links (iCal) from the host's channel manager, Airbnb, Vrbo or Booking.com
// and blocks those dates, and publishes one calendar link per home that those sites can read back.
// Dates only: no guest names, prices or messages move in either direction.
'use strict';
const dns = require('dns').promises;
const net = require('net');

// Trailing spaces and a byte-order mark are dropped too: some calendar exports add them, and an "END:VEVENT " line
// would otherwise lose that booking without a word (and leave the dates open to a double booking).
function unfold(text) { return String(text).replace(/^\uFEFF/, '').replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/).map(l => l.trimEnd()); }
function toIso(v) {
  // 20261114 or 20261114T150000Z / 20261114T150000
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
function addDay(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Every event as it appears in the link: [{from, to, uid, summary}] with checkout-style end dates (the night of `to` is free).
function events(text) {
  const out = []; let ev = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT') { if (ev && ev.from) { if (!ev.to || ev.to <= ev.from) ev.to = addDay(ev.from, 1); if (ev.status !== 'CANCELLED' && ev.to <= addDay(ev.from, 400)) out.push(ev); } ev = null; }
    else if (ev) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].toUpperCase(), val = line.slice(i + 1).trim();
      if (key === 'DTSTART') ev.from = toIso(val);
      if (key === 'DTEND') ev.to = toIso(val);
      if (key === 'UID') ev.uid = val.slice(0, 200);
      if (key === 'SUMMARY') ev.summary = val.slice(0, 120);
      if (key === 'STATUS') ev.status = val.toUpperCase();
    }
  }
  return out;
}
// Overlapping or touching ranges become one: [{from, to}] sorted by date.
function merge(list) {
  const out = list.map(r => ({ from: r.from, to: r.to })).sort((a, b) => a.from.localeCompare(b.from));
  const merged = [];
  for (const r of out) { const last = merged[merged.length - 1]; if (last && r.from <= last.to) { if (r.to > last.to) last.to = r.to; } else merged.push({ from: r.from, to: r.to }); }
  return merged;
}
// Returns merged [{from, to}] ranges.
function parse(text) { return merge(events(text)); }
// Nights (YYYY-MM-DD of each night) back into merged ranges.
function fromNights(nights) {
  const days = Array.from(new Set(nights)).sort(); const out = [];
  for (const d of days) { const last = out[out.length - 1]; if (last && last.to === d) last.to = addDay(d, 1); else out.push({ from: d, to: addDay(d, 1) }); }
  return out;
}
function nightsOf(from, to) { const out = []; for (let d = from; d < to && out.length < 800; d = addDay(d, 1)) out.push(d); return out; }

function privateIp(ip) {
  if (net.isIPv4(ip)) { const [a, b] = ip.split('.').map(Number); return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224; }
  const x = ip.toLowerCase(); return x === '::1' || x === '::' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe80') || x.startsWith('::ffff:') && privateIp(x.slice(7));
}
// Fetch a calendar link safely: public http(s) hosts only, 10 second limit, 2 MB limit, a few redirects.
async function fetchCalendar(url, hops = 0) {
  let u; try { u = new URL(String(url).trim().replace(/^webcal:/i, 'https:')); } catch (_) { throw new Error('That is not a valid link.'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('Calendar links start with https:// or webcal://');
  const addrs = await dns.lookup(u.hostname, { all: true }).catch(() => { throw new Error('Could not find ' + u.hostname + '.'); });
  if (!process.env.ICAL_ALLOW_PRIVATE_FOR_TESTS && addrs.some(a => privateIp(a.address))) throw new Error('That address is not allowed.');
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 10000);
  try {
    const r = await fetch(u, { redirect: 'manual', signal: ctl.signal, headers: { 'user-agent': 'Bookingbooster calendar sync (+https://booking-booster.co.uk)', accept: 'text/calendar, text/plain, */*' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location') && hops < 3) return fetchCalendar(new URL(r.headers.get('location'), u).toString(), hops + 1);
    if (!r.ok) throw new Error('The calendar link answered with error ' + r.status + '.');
    const reader = r.body.getReader(); let size = 0; const chunks = [];
    for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > 2e6) throw new Error('That calendar is too large.'); chunks.push(value); }
    const text = Buffer.concat(chunks).toString('utf8');
    if (!/BEGIN:VCALENDAR/.test(text)) throw new Error('That link does not return a calendar. Copy the iCal or "export calendar" link.');
    return text;
  } catch (e) { if (e.name === 'AbortError') throw new Error('The calendar link took too long to answer.'); throw e; }
  finally { clearTimeout(t); }
}

// Calendars a home can be linked to, each with its own feed. Airbnb's copy of the feed carries direct bookings, blocks
// made here and dates read from every other calendar (Vrbo, Booking.com, a channel manager...), but never Airbnb's own
// dates, which would only echo back. With no channel the feed carries direct bookings and blocks made here only.
const CHANNELS = ['cm', 'airbnb', 'vrbo', 'booking', 'other'];
// Named sites from the calendar catalogue (BB.ICAL_SITES) get their own feed once the host adds them.
const isChannel = (s, c) => CHANNELS.includes(c) || (/^[a-z0-9]{2,24}$/.test(c || '') && (s.integrations || []).some(i => i.id === c && i.ical));
const icalIds = s => CHANNELS.concat((s.integrations || []).filter(i => i.ical && !CHANNELS.includes(i.id)).map(i => i.id));
function feed(s, pid, host, channel) {
  const p = s.properties.find(x => x.id === pid); if (!p) return null;
  if (channel && !isChannel(s, channel)) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const d = iso => iso.replace(/-/g, '');
  const ev = [];
  for (const b of s.bookings) if (b.propertyId === pid && b.status !== 'cancelled' && b.checkOut >= s.today) ev.push({ uid: b.id, from: b.checkIn, to: b.checkOut, summary: 'Booked direct' });
  // blocks made here, plus (in a channel's own feed) dates read from the other calendars
  for (const k of s.blocks) {
    if (k.propertyId !== pid || k.to < s.today) continue;
    if (!k.sync) ev.push({ uid: 'blk-' + k.from + '-' + k.to, from: k.from, to: k.to, summary: 'Not available' });
    else if (channel && k.sync !== channel) ev.push({ uid: 'sync-' + k.sync + '-' + k.from + '-' + k.to, from: k.from, to: k.to, summary: 'Not available' });
  }
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookingbooster//Calendar sync//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + p.name + (channel ? ' (Bookingbooster)' : ' (direct bookings)'), 'X-PUBLISHED-TTL:PT15M', 'REFRESH-INTERVAL;VALUE=DURATION:PT15M'];
  for (const e of ev) lines.push('BEGIN:VEVENT', 'UID:' + e.uid + '@' + host, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d(e.from), 'DTEND;VALUE=DATE:' + d(e.to), 'SUMMARY:' + e.summary, 'TRANSP:OPAQUE', 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

// Dates in another calendar that are really ours coming back (a channel manager that copies our feed into its own):
// events carrying our UID, or exactly matching one of this home's direct bookings or blocks made here.
function dropEchoes(list, s, pid, host) {
  const own = new Set();
  for (const b of s.bookings) if (b.propertyId === pid && b.status !== 'cancelled') own.add(b.checkIn + '|' + b.checkOut);
  for (const k of s.blocks) if (k.propertyId === pid && !k.sync) own.add(k.from + '|' + k.to);
  const tail = host ? '@' + String(host).toLowerCase() : null;
  return list.filter(e => !(tail && e.uid && String(e.uid).toLowerCase().endsWith(tail)) && !own.has(e.from + '|' + e.to));
}
module.exports = { parse, events, merge, fromNights, nightsOf, addDay, dropEchoes, fetchCalendar, feed, privateIp, CHANNELS, isChannel, icalIds };
