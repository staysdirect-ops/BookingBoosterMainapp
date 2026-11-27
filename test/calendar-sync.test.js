// Calendar links (iCal) end to end: per-calendar feeds so Airbnb, Vrbo and Booking.com block each other through us,
// our own dates coming back are not treated as clashes, an empty link does not wipe blocks at once, and a guest
// cannot book dates that were taken elsewhere a moment ago.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

let t, ics, icsPort;
const cal = {}; // path -> body
const D = d => d.replace(/-/g, '');
const vcal = evs => 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + evs.map(e => 'BEGIN:VEVENT\r\nUID:' + (e.uid || Math.random()) + '\r\nDTSTART;VALUE=DATE:' + D(e.from) + '\r\nDTEND;VALUE=DATE:' + D(e.to) + '\r\nSUMMARY:Reserved\r\nEND:VEVENT\r\n').join('') + 'END:VCALENDAR\r\n';

test.before(async () => {
  ics = http.createServer((q, s) => { const b = cal[q.url]; s.writeHead(b ? 200 : 404, { 'content-type': 'text/calendar' }); s.end(b || 'nope'); }).listen(0);
  icsPort = ics.address().port;
  t = await start({ ICAL_ALLOW_PRIVATE_FOR_TESTS: '1' });
  await t.signup();
});
test.after(() => { t.stop(); ics.close(); });

const link = p => 'http://localhost:' + icsPort + p;
const state = async () => (await t.call('/api/state')).body.state;
const blocksOf = async id => (await state()).blocks.filter(k => k.sync === id);
async function syncNow(id) {
  const before = JSON.stringify(((await state()).integrations.find(i => i.id === id).status) || {});
  await t.act('syncChannel', id);
  return t.until(async () => { const st = (await state()).integrations.find(i => i.id === id).status || {}; return JSON.stringify(st) !== before ? st : null; });
}

test('Airbnb dates reach Vrbo through its own feed, never back to Airbnb', async () => {
  const { p } = await t.home();
  cal['/airbnb.ics'] = vcal([{ from: t.dateIn(20), to: t.dateIn(23) }]);
  await t.act('setCalendarLink', 'airbnb', p.id, link('/airbnb.ics'));
  assert.ok(await t.until(async () => (await blocksOf('airbnb')).length), 'Airbnb dates blocked here');
  const feeds = (await t.call('/api/calendar-feeds')).body.feeds[0];
  assert.match(feeds.channels.vrbo, /\.vrbo\.ics$/);
  const vrbo = (await t.call(new URL(feeds.channels.vrbo).pathname)).body;
  const airbnb = (await t.call(new URL(feeds.channels.airbnb).pathname)).body;
  const direct = (await t.call(new URL(feeds.url).pathname)).body;
  assert.match(vrbo, new RegExp('DTSTART;VALUE=DATE:' + D(t.dateIn(20))), 'Vrbo sees the Airbnb stay');
  assert.doesNotMatch(airbnb, new RegExp(D(t.dateIn(20))), 'Airbnb never gets its own dates back');
  assert.doesNotMatch(direct, new RegExp(D(t.dateIn(20))), 'the plain feed stays direct bookings only, as before');
  assert.equal((await t.call(new URL(feeds.url).pathname.replace(/\.ics$/, '.nope.ics'))).status, 404);
  const st = (await state()).integrations.find(i => i.id === 'airbnb').status[p.id];
  assert.ok(st.ok && st.count === 1 && !st.error, 'per-home status is kept');
});

test('our own bookings coming back from a channel manager are not clashes', async () => {
  const { p, slug } = await t.home();
  const r = await (await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(40), checkOut: t.dateIn(43), name: 'Jo Guest', email: 'jo@example.co.uk', adults: 2 } }) })).json();
  assert.equal(r.ok, true, JSON.stringify(r));
  const host = new URL(t.base).host;
  cal['/cm.ics'] = vcal([{ from: t.dateIn(40), to: t.dateIn(43) }, { from: t.dateIn(50), to: t.dateIn(51), uid: 'blk-x@' + host }, { from: t.dateIn(60), to: t.dateIn(62) }]);
  const notes0 = (await state()).notifications.length;
  await t.act('setCalendarLink', 'cm', p.id, link('/cm.ics'));
  const got = await t.until(async () => { const b = await blocksOf('cm'); return b.length ? b : null; });
  assert.deepEqual(got.map(k => [k.from, k.to]), [[t.dateIn(60), t.dateIn(62)]], 'only the stay booked elsewhere is blocked');
  const st = await state();
  assert.ok(!st.notifications.slice(0, st.notifications.length - notes0).some(n => /double booking/i.test(n.title || '')), 'no false double-booking alert');
});

test('an empty calendar link waits for a second check before unblocking', async () => {
  cal['/airbnb.ics'] = vcal([]);
  let st = await syncNow('airbnb');
  const { p } = await t.home();
  assert.equal(st[p.id].empty, true);
  assert.equal((await blocksOf('airbnb')).length, 1, 'still blocked after one empty read');
  await syncNow('airbnb');
  assert.ok(await t.until(async () => (await blocksOf('airbnb')).length === 0), 'unblocked once a second read agrees');
});

test('a guest cannot book dates taken elsewhere a moment ago', async () => {
  const { p, slug } = await t.home();
  cal['/airbnb.ics'] = vcal([{ from: t.dateIn(70), to: t.dateIn(73) }]); // booked on Airbnb, not yet seen by us
  assert.equal((await blocksOf('airbnb')).length, 0);
  const r = await (await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(71), checkOut: t.dateIn(72), name: 'Al Guest', email: 'al@example.co.uk', adults: 2 } }) })).json();
  assert.equal(r.ok, false, 'the calendars are re-read before the booking is taken');
});

test('channel manager keys are checked on the server', async () => {
  assert.equal((await t.call('/app/channel/connect', { body: { id: 'nope', creds: {} } })).status, 404);
  const r = await t.call('/app/channel/connect', { body: { id: 'smoobu', creds: {} } });
  assert.equal(r.status, 400); assert.match(r.body.error, /Smoobu needs your api key/);
  assert.equal((await t.act('toggleIntegration', 'beds24')).status, 400, 'an API connection cannot be switched on without a key');
});

test('a calendar export with trailing spaces or a byte-order mark still blocks its dates', () => {
  const ical = require('../server/ical');
  const t = '﻿BEGIN:VCALENDAR\r\nBEGIN:VEVENT \r\nDTSTART;VALUE=DATE:20261210 \r\nDTEND;VALUE=DATE:20261212\r\nSUMMARY:Reserved \r\nEND:VEVENT \r\nEND:VCALENDAR\r\n';
  assert.deepEqual(ical.parse(t), [{ from: '2026-12-10', to: '2026-12-12' }]);
});

test('All channels: switching on is checked on the server, and the Channex webhook needs its secret', async () => {
  const { p } = await t.home();
  assert.equal((await t.act('toggleIntegration', 'channex')).status, 400, 'switched with its own action, not the plain toggle');
  assert.equal((await t.act('applyChannexBooking', p.id, { ref: 'x', from: t.dateIn(5), to: t.dateIn(6) })).status, 403, 'only the server records bookings from other sites');
  assert.equal((await t.call('/app/channex/connect', { body: { pid: p.id } })).status, 400, 'switch it on first');
  await t.act('joinAllChannels', true);
  const st = await state();
  assert.equal(st.integrations.find(i => i.id === 'channex').connected, true);
  assert.equal(st.account.tier, 'all'); assert.equal(st.account.addon, true);
  assert.equal((await t.call('/app/channex/connect', { body: { pid: p.id } })).status, 409, 'not live on a server without a Channex key');
  const hook = await fetch(t.base + '/hooks/channex', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bb-hook': 'wrong' }, body: '{"event":"booking_new"}' });
  assert.equal(hook.status, 404);
  await t.act('leaveAllChannels');
  assert.ok(!(await state()).account.tier);
});
