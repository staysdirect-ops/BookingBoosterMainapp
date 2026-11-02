// End-to-end checks against a real server on a spare port with a throwaway data folder.
// Run with: npm test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PORT = 18000 + Math.floor(Math.random() * 1000), ICS_PORT = PORT + 1;
const BASE = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-test-'));
let srv, icsSrv, cookie = '';
const IN = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10).replace(/-/g, ''); };
const ICS = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:a1\r\nDTSTART;VALUE=DATE:' + IN(20) + '\r\nDTEND;VALUE=DATE:' + IN(23) + '\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';

async function call(p, opts = {}) {
  const r = await fetch(BASE + p, Object.assign({ redirect: 'manual', headers: Object.assign({ 'content-type': 'application/json', cookie }, opts.headers || {}) }, opts.body ? { method: 'POST', body: JSON.stringify(opts.body) } : {}, opts.method ? { method: opts.method } : {}));
  const set = r.headers.get('set-cookie'); if (set && /bb_s=/.test(set)) cookie = set.split(';')[0];
  const type = r.headers.get('content-type') || ''; const body = type.includes('json') ? await r.json() : await r.text();
  return { status: r.status, body, headers: r.headers };
}
const act = (name, ...args) => call('/api/act', { body: { name, args } });
const until = async (fn, ms = 5000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => setTimeout(r, 150)); } };

test.before(async () => {
  icsSrv = http.createServer((q, s) => { s.writeHead(200, { 'content-type': 'text/calendar' }); s.end(ICS); }).listen(ICS_PORT);
  srv = require('./harness').spawnServer({ port: PORT, base: BASE, data: DATA, env: { ICAL_ALLOW_PRIVATE_FOR_TESTS: '1' } }); await srv.ready;
  await until(async () => { try { return (await fetch(BASE + '/healthz')).ok; } catch (_) { return false; } }, 30000);
});
test.after(() => { srv.stop(); icsSrv.close(); fs.rmSync(DATA, { recursive: true, force: true }); });

test('marketing pages, robots and llms.txt', async () => {
  const home = await call('/'); assert.equal(home.status, 200); assert.match(home.body, /bookingbooster/i);
  const robots = await call('/robots.txt'); assert.match(robots.body, /GPTBot/); assert.match(robots.body, /Sitemap:/);
  const llms = await call('/llms.txt'); assert.equal(llms.status, 200);
});

test('sign up creates a live account with an honest, empty home', async () => {
  const r = await call('/api/signup', { body: { plan: 'Growth', account: { name: 'Test Host', business: 'Test Stays', email: 'host@example.co.uk', password: 'correcthorse1' },
    property: { name: 'Gull Cottage', theme: 'lake', nightly: 140, maxGuests: 4, bedrooms: 2, area: 'Whitby, North Yorkshire', address: '1 Made Up Lane', amenities: ['Hot tub'] } } });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.ok(cookie, 'session cookie set');
  const s = (await call('/api/state')).body.state;
  assert.equal(s.live, true);
  const p = s.properties[0];
  assert.equal(p.name, 'Gull Cottage');
  assert.equal(p.address, '', 'no invented address');
  assert.deepEqual(p.amenities, [], 'no invented amenities');
  assert.equal(p.wifi.ssid, '', 'no invented Wi-Fi');
  assert.equal(p.reviews, 0);
  const again = await call('/api/signup', { body: { account: { name: 'Test Host', email: 'host@example.co.uk', password: 'correcthorse1' } } });
  assert.equal(again.status, 409);
});

test('demo-only actions are refused in a live account', async () => {
  const r = await act('nextDay'); assert.equal(r.status, 403);
});

test('live accounts only connect what really works', async () => {
  assert.equal((await act('toggleIntegration', 'pricelabs')).status, 400, 'coming-soon connections cannot be switched on');
  assert.equal((await act('toggleIntegration', 'lock')).status, 400, 'locks need a real Nuki token');
  assert.equal((await act('toggleIntegration', 'airbnb')).status, 400, 'calendar sync needs a real calendar link');
  assert.equal((await call('/app/nuki', { body: { token: 'short' } })).status, 400);
});

test('host can fill in guest details', async () => {
  const s = (await call('/api/state')).body.state; const pid = s.properties[0].id;
  const r = await act('updateProperty', pid, { address: '3 Church Street, Whitby YO22 4AE', wifi: { ssid: 'Gull', pw: 'seagulls99' }, entry: 'Key safe by the door, code 1234.' });
  assert.equal(r.status, 200);
  const p = r.body.state.properties[0]; assert.equal(p.wifi.ssid, 'Gull'); assert.match(p.entry, /Key safe/);
});

test('property site is crawlable and hides private details', async () => {
  const { p, url } = await home();
  const site = await call(new URL(url).pathname);
  assert.equal(site.status, 200);
  assert.match(site.body, /application\/ld\+json/);
  assert.match(site.body, /Gull Cottage/);
  assert.doesNotMatch(site.body, /seagulls99/, 'Wi-Fi password never on the public site');
  assert.doesNotMatch(site.body, /Key safe by the door/, 'entry instructions never on the public site');
  assert.doesNotMatch(site.body, /3 Church Street/, 'full address never on the public site');
});

test('calendar sync reads a calendar link and blocks the dates', async () => {
  const s = (await call('/api/state')).body.state; const pid = s.properties[0].id;
  const r = await act('setCalendarLink', 'airbnb', pid, 'http://localhost:' + ICS_PORT + '/airbnb.ics');
  assert.equal(r.status, 200);
  const blocks = await until(async () => { const st = (await call('/api/state')).body.state; const b = st.blocks.filter(k => k.sync === 'airbnb'); return b.length ? b : null; });
  assert.ok(blocks, 'dates from the calendar link are blocked');
  assert.equal(blocks[0].from.replace(/-/g, ''), IN(20));
  const st = (await call('/api/state')).body.state; assert.equal(st.account.addon, true);
});

test('each home publishes a calendar feed others can read', async () => {
  const feeds = (await call('/api/calendar-feeds')).body.feeds; assert.equal(feeds.length, 1);
  const f = await call(new URL(feeds[0].url).pathname); assert.equal(f.status, 200); assert.match(f.body, /BEGIN:VCALENDAR/);
  const bad = await call(new URL(feeds[0].url).pathname.replace(/[^/]+\.ics$/, 'nope.ics')); assert.notEqual(bad.status, 200);
});

test('a guest booking request reaches the host, with a trip link', async () => {
  const { p, slug } = await home();
  const book = input => fetch(BASE + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: Object.assign({ propertyId: p.id, adults: 2 }, input) }) });
  const r = await book({ checkIn: dateIn(40), checkOut: dateIn(43), name: 'Jo Guest', email: 'jo@example.co.uk', phone: '07700900123' });
  const j = await r.json(); assert.equal(r.status, 200, JSON.stringify(j));
  const st = (await call('/api/state')).body.state; const b = st.bookings.find(x => x.checkIn === dateIn(40)); assert.ok(b, 'booking saved');
  assert.equal(b.status, 'request', 'without card payments it is a request the host approves');
  const acc = await act('acceptRequest', b.id); assert.equal(acc.body.state.bookings.find(x => x.id === b.id).status, 'confirmed');
  const r2 = await (await book({ checkIn: dateIn(60), checkOut: dateIn(62), name: 'Max Guest', email: 'max@example.co.uk' })).json(); assert.equal(r2.ok, true);
  const dec = await act('declineRequest', r2.bookingId, 'We are closed for repairs.'); const d2 = dec.body.state.bookings.find(x => x.id === r2.bookingId);
  assert.equal(d2.status, 'cancelled'); assert.equal(d2.declined, true);
  const r3 = await (await book({ checkIn: dateIn(60), checkOut: dateIn(62), name: 'Max Guest', email: 'max@example.co.uk' })).json(); assert.equal(r3.ok, true, 'declined dates are free again');
  const clash = await (await book({ checkIn: dateIn(21), checkOut: dateIn(22), name: 'Al Guest', email: 'al@example.co.uk' })).json();
  assert.equal(clash.ok, false, 'dates blocked by calendar sync cannot be booked');
  const link = await call('/api/trip-link', { body: { bookingId: b.id } }); assert.match(link.body.url, /\/trip\//);
  const trip = await fetch(link.body.url.replace(/^https?:\/\/[^/]+/, BASE)); assert.equal(trip.status, 200);
});

test('outbox records messages in test mode', async () => {
  const o = await until(async () => { const r = await call('/api/outbox'); return r.body.items && r.body.items.length ? r.body : null; });
  assert.ok(o && o.items.length, 'emails were recorded');
});

test('lead capture accepts a form post and rejects bots', async () => {
  const ok = await call('/api/leads', { body: { email: 'lead@example.co.uk', source: 'test' } }); assert.equal(ok.status, 200);
  const bot = await call('/api/leads', { body: { email: 'bot@example.co.uk', website: 'spam' } }); assert.ok(bot.status === 200 || bot.status === 400);
});

test('signed links cannot be guessed', async () => {
  const { slug } = await home();
  const r = await fetch(BASE + '/trip/' + slug + '/HV-0000?k=abc'); assert.notEqual(r.status, 200);
});

async function home() { const boot = (await call('/api/state')).body; const p = boot.state.properties[0]; const url = boot.siteUrls[p.id]; return { p, url, slug: new URL(url).pathname.split('/')[2], state: boot.state }; }
function dateIn(n) { return IN(n).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'); }

test('marketing sites can post leads from another domain, and the connector script is served', async () => {
  const r = await fetch(BASE + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://booking-booster.co.uk' }, body: JSON.stringify({ email: 'x@example.co.uk', form: 'applyForm', homes: '2-3' }) });
  assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*');
  const js = await call('/embed/forms.js'); assert.equal(js.status, 200); assert.match(js.body, /api\/leads/);
  const admin = await call('/admin'); assert.equal(admin.status, 404, 'team page is hidden from hosts');
});
