// Claude-drafted guest replies against a stand-in Messages API: facts in, no private details before check-in.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

let mock, t, lastBody;
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { lastBody = JSON.parse(raw); s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ content: [{ type: 'text', text: 'Hi Jo, yes, parking is on the drive.' }] })); }); }).listen(0);
  t = await start({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('drafts a reply from the home facts and keeps private details back before check-in', async () => {
  const { p, slug } = await t.home();
  await t.act('updateProperty', p.id, { parking: 'On the drive', wifi: { ssid: 'Gull', pw: 'secretpw123' }, address: '3 Church Street' });
  const r = await fetch(t.base + '/api/public/' + slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: { propertyId: p.id, checkIn: t.dateIn(20), checkOut: t.dateIn(23), adults: 2, name: 'Jo Guest', email: 'jo@example.co.uk' } }) });
  const bid = (await r.json()).bookingId;
  const th = await t.act('openThread', (await t.call('/api/state')).body.state.bookings.find(b => b.id === bid).guestId, bid);
  const tid = th.body.result.id;
  // the guest writes from their trip link
  const link = (await t.call('/api/trip-link', { body: { bookingId: bid } })).body.url; const k = new URL(link).searchParams.get('k');
  const sent = await fetch(t.base + '/api/public/' + slug + '/trip/' + encodeURIComponent(bid) + '/act?k=' + k, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'sendMessage', args: [tid, 'guest', 'Is there parking?'] }) });
  assert.equal(sent.status, 200);
  const d = await t.call('/api/suggest', { body: { threadId: tid } });
  assert.equal(d.status, 200); assert.match(d.body.text, /parking/);
  const prompt = JSON.stringify(lastBody);
  assert.match(prompt, /On the drive/); assert.match(prompt, /Is there parking/);
  assert.doesNotMatch(prompt, /secretpw123/, 'Wi-Fi is not shared before check-in'); assert.doesNotMatch(prompt, /3 Church Street/);
});
