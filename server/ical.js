// Calendar sync add-on. Reads calendar links (iCal) from the host's channel manager, Airbnb, Vrbo or Booking.com
// and blocks those dates, and publishes one calendar link per home that those sites can read back.
// Dates only: no guest names, prices or messages move in either direction.
'use strict';
const dns = require('dns').promises;
const net = require('net');

function unfold(text) { return String(text).replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/); }
function toIso(v) {
  // 20261114 or 20261114T150000Z / 20261114T150000
  const m = String(v).match(/(\d{4})(\d{2})(\d{2})/); return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
}
function addDay(iso, n) { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Returns [{from, to, summary}] with checkout-style end dates (the night of `to` is free).
function parse(text) {
  const out = []; let ev = null;
  for (const line of unfold(text)) {
    if (line === 'BEGIN:VEVENT') ev = {};
    else if (line === 'END:VEVENT') { if (ev && ev.from) { if (!ev.to || ev.to <= ev.from) ev.to = addDay(ev.from, 1); if (ev.status !== 'CANCELLED') out.push(ev); } ev = null; }
    else if (ev) {
      const i = line.indexOf(':'); if (i < 0) continue;
      const key = line.slice(0, i).split(';')[0].toUpperCase(), val = line.slice(i + 1).trim();
      if (key === 'DTSTART') ev.from = toIso(val);
      if (key === 'DTEND') ev.to = toIso(val);
      if (key === 'SUMMARY') ev.summary = val.slice(0, 120);
      if (key === 'STATUS') ev.status = val.toUpperCase();
    }
  }
  // merge overlaps, drop silly ranges
  out.sort((a, b) => a.from.localeCompare(b.from));
  const merged = [];
  for (const r of out) { if (r.to > addDay(r.from, 400)) continue; const last = merged[merged.length - 1]; if (last && r.from <= last.to) { if (r.to > last.to) last.to = r.to; } else merged.push({ from: r.from, to: r.to }); }
  return merged;
}

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

// Our feed for one home: every booking and block made here, so Airbnb and friends close those dates too.
function feed(s, pid, host) {
  const p = s.properties.find(x => x.id === pid); if (!p) return null;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const d = iso => iso.replace(/-/g, '');
  const ev = [];
  for (const b of s.bookings) if (b.propertyId === pid && b.status !== 'cancelled' && b.checkOut >= s.today) ev.push({ uid: b.id, from: b.checkIn, to: b.checkOut, summary: 'Booked direct' });
  // blocks made here (not ones we read from another calendar, which would echo back)
  for (const k of s.blocks) if (k.propertyId === pid && !k.sync && k.to >= s.today) ev.push({ uid: 'blk-' + k.from + '-' + k.to, from: k.from, to: k.to, summary: 'Not available' });
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Bookingbooster//Calendar sync//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:' + p.name + ' (direct bookings)'];
  for (const e of ev) lines.push('BEGIN:VEVENT', 'UID:' + e.uid + '@' + host, 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d(e.from), 'DTEND;VALUE=DATE:' + d(e.to), 'SUMMARY:' + e.summary, 'TRANSP:OPAQUE', 'END:VEVENT');
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
module.exports = { parse, fetchCalendar, feed, privateIp };
