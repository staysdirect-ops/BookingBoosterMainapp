// Guest reviews on a real account: private unless the guest ticks the box, and published whatever the stars.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t;
test.before(async () => { t = await start(); await t.signup(); });
test.after(() => t.stop());

async function stay(name, email, from) {
  const { p } = await t.home();
  const r = await t.act('createBooking', { propertyId: p.id, checkIn: t.dateIn(from), checkOut: t.dateIn(from + 2), adults: 2, name, email, pay: 'manual', channel: 'direct' });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 200));
  const b = r.body.state.bookings.find(x => x.checkIn === t.dateIn(from));
  const link = (await t.call('/api/trip-link', { body: { bookingId: b.id } })).body.url; const k = new URL(link).searchParams.get('k');
  const u = new URL((await t.home()).url);
  return (n, args) => fetch(t.base + '/api/public/' + u.pathname.split('/')[2] + '/trip/' + encodeURIComponent(b.id) + '/act?k=' + k, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: n, args }) });
}

test('only reviews the guest chose to share go on the site, with an honest rating', async () => {
  const a = await stay('Amy Private', 'amy@example.co.uk', -10);
  assert.equal((await a('rateStay', [null, 5, 'Lovely, but keep this between us', false])).status, 200);
  let { p, url } = await t.home(); assert.equal(p.reviews, 0); assert.equal(p.rating, 0);
  let html = await (await fetch(url)).text(); assert.doesNotMatch(html, /keep this between us/);

  const b = await stay('Ben Public', 'ben@example.co.uk', -6);
  assert.equal((await b('rateStay', [null, 2, 'The boiler was broken.', true])).status, 200);
  ({ p, url } = await t.home()); assert.equal(p.reviews, 1); assert.equal(p.rating, 2);
  html = await (await fetch(url)).text();
  assert.match(html, /The boiler was broken/); assert.match(html, /Ben P\./); assert.doesNotMatch(html, /Ben Public/);
  assert.match(html, /"reviewCount":1/); assert.match(html, /whatever their rating/);
  // one review per stay
  await b('rateStay', [null, 5, 'Actually it was perfect', true]);
  assert.equal((await t.home()).p.rating, 2);
});
