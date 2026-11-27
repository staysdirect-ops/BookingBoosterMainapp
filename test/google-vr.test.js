// Google Vacation Rentals (server/google-vr.js): the listing feed Google fetches, the Point of Sale file, and the
// landing link that opens the host's own site with the guest's dates set.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const zlib = require('zlib');
const { Workspace, seedDemo } = require('../server/engine');
const G = require('../server/google-vr');

function unzip(buf) {
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
  const n = buf.readUInt16LE(26), size = buf.readUInt32LE(18), crc = buf.readUInt32LE(14);
  const out = zlib.inflateRawSync(buf.subarray(30 + n, 30 + n + size));
  assert.equal(G.crc32(out), crc, 'CRC matches');
  assert.equal(buf.subarray(30, 30 + n).toString(), 'listings.xml');
  const end = buf.subarray(buf.length - 22); assert.equal(end.readUInt32LE(0), 0x06054b50);
  return out.toString('utf8');
}
function rig() {
  const w = new Workspace('w1', seedDemo()); w.kind = 'live'; w.slug = 'fell-harbour';
  const p = w.state.properties[0];
  Object.assign(p, { lat: 54.43251, lng: -2.96412, area: 'Windermere, Cumbria', photos: [1, 2, 3, 4, 5, 6].map(n => ({ url: 'https://img.example/' + n + '.jpg', cap: n === 1 ? 'Hot tub & view' : '' })) });
  const ws = { liveIds: async () => ['w1'], open: async () => w, bySlug: async s => s === 'fell-harbour' ? { id: 'w1' } : null };
  const urls = { site: (w2, p2) => 'https://' + p2.id + '.example.co.uk/' };
  return { w, p, g: G({ cfg: { secret: 's', baseUrl: 'https://booking-booster.co.uk' }, ws, urls }) };
}

test('only homes whose host switched it on and that Google will accept go in the feed', async () => {
  const { w, p, g } = rig();
  assert.equal(unzip(await g.feedZip()).includes('<listing>'), false, 'off until the host switches it on');
  w.state.integrations.find(i => i.id === 'gvr').connected = true;
  const xml = unzip(await g.feedZip());
  assert.equal((xml.match(/<listing>/g) || []).length, 1, 'the other homes have no map pin or photos yet');
  assert.match(xml, /^<\?xml/); assert.match(xml, /<language>en<\/language>/);
  assert.match(xml, new RegExp('<id>fell-harbour--' + p.id + '</id>'));
  assert.match(xml, /<latitude>54\.432510<\/latitude><longitude>-2\.964120<\/longitude>/);
  assert.match(xml, /<component name="city">Windermere<\/component><component name="province">Cumbria<\/component>/);
  assert.match(xml, new RegExp('<website>https://' + p.id + '\\.example\\.co\\.uk/</website>'));
  assert.match(xml, new RegExp('<client_attr name="capacity">' + p.maxGuests + '</client_attr>'));
  assert.match(xml, /<client_attr name="room_type">ENTIRE_PLACE<\/client_attr>/);
  assert.match(xml, /<title>Hot tub &amp; view<\/title>/, 'text is escaped');
  assert.doesNotMatch(xml, /addr1|postal_code/, 'the exact address stays private');
  assert.deepEqual(G.missing(w.state.properties[1], 'https://x/'), ['add the map pin', 'add 5 more photos'].filter(m => G.missing(w.state.properties[1], 'https://x/').includes(m)));
  assert.ok(G.missing({ name: 'x', photos: [], area: '', maxGuests: 0 }, null).length >= 4);
});

test('the Point of Sale file and landing link send guests to the host’s own site with their dates', async () => {
  const { p, g } = rig();
  const pos = g.pos();
  assert.match(pos, /<PointsOfSale partner="bookingbooster">/);
  assert.match(pos, /https:\/\/booking-booster\.co\.uk\/go\/vr\/\(PARTNER-HOTEL-ID\)\?checkin=\(CHECKINYEAR\)-\(CHECKINMONTH\)-\(CHECKINDAY\)&amp;checkout=/);
  const to = new URL(await g.landing('fell-harbour--' + p.id, new URLSearchParams('checkin=2027-03-01&checkout=2027-03-04&guests=2')));
  assert.equal(to.host, p.id + '.example.co.uk');
  assert.equal(to.searchParams.get('checkin'), '2027-03-01'); assert.equal(to.searchParams.get('checkout'), '2027-03-04'); assert.equal(to.searchParams.get('guests'), '2');
  assert.equal(to.searchParams.get('utm_source'), 'google');
  const bad = new URL(await g.landing('fell-harbour--' + p.id, new URLSearchParams('checkin=<script>&checkout=x')));
  assert.equal(bad.searchParams.get('checkin'), null);
  assert.equal(await g.landing('nobody--x', new URLSearchParams()), null);
  assert.equal(await g.landing('../etc', new URLSearchParams()), null);
  assert.equal(g.key().length, 24);
});
