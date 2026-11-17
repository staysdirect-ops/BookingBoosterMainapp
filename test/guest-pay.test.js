// The host chooses how guests pay on their sites: card through Stripe, bank transfer, or both.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t, home;
test.before(async () => { t = await start(); await t.signup(); home = await t.home(); });
test.after(() => t.stop());

const book = (input, kind) => fetch(t.base + '/api/public/' + home.slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: Object.assign({ propertyId: home.p.id, adults: 2 }, input), kind }) }).then(r => r.json());
const state = async () => (await t.call('/api/state')).body.state;
const site = async () => (await fetch(home.url.replace(/^https?:\/\/[^/]+/, t.base))).text();
const BANK = { on: true, holder: 'Test Stays Ltd', sortCode: '200000', account: '12345678', days: 4 };

test('bank transfer only cannot be picked before the bank details are in', async () => {
  const r = await t.act('setGuestPay', 'transfer');
  assert.equal(r.body.result.ok, false);
  assert.match(await site(), /"guestPay":"card"/, 'with no bank details, guests pay by card');
});

test('the default is both: the site offers card and bank transfer', async () => {
  assert.equal((await t.act('saveBankTransfer', BANK)).body.result.ok, true);
  const page = await site();
  assert.match(page, /"guestPay":"both"/); assert.match(page, /"bank":\{"on":true,"days":4\}/);
});

test('card only: bank transfer disappears from the site and the server turns it away', async () => {
  assert.equal((await t.act('setGuestPay', 'card')).body.result.ok, true);
  assert.equal((await state()).account.guestPay, 'card');
  const page = await site();
  assert.match(page, /"guestPay":"card"/); assert.match(page, /"bank":null/);
  const j = await book({ checkIn: t.dateIn(20), checkOut: t.dateIn(22), name: 'Card Only', email: 'card@guest.co.uk' }, 'transfer');
  assert.equal(j.ok, false); assert.match(j.error, /card payments only/);
});

let bid;
test('bank transfer only: card checkout is turned away, and a transfer booking waits unpaid with its reference', async () => {
  assert.equal((await t.act('setGuestPay', 'transfer')).body.result.ok, true);
  assert.match(await site(), /"guestPay":"transfer"/);
  const no = await book({ checkIn: t.dateIn(30), checkOut: t.dateIn(32), name: 'Card Try', email: 'try@guest.co.uk' }, 'pay');
  assert.equal(no.ok, false); assert.equal(no.transfer, true);
  const j = await book({ checkIn: t.dateIn(30), checkOut: t.dateIn(32), name: 'Pat Transfer', email: 'pat@guest.co.uk' }, 'transfer');
  assert.equal(j.ok, true, JSON.stringify(j)); bid = j.bookingId;
  assert.equal(j.state.account.bank.account, '12345678');
  const b = (await state()).bookings.find(x => x.id === bid);
  assert.equal(b.payBy, 'transfer'); assert.equal(b.paid, false); assert.equal(b.invoice.no, 'INV-' + bid);
  const r = await book({ checkIn: t.dateIn(40), checkOut: t.dateIn(42), name: 'Robin Request', email: 'robin@guest.co.uk' }, 'request');
  assert.equal(r.ok, true, 'booking requests still work');
});

test('the host marks it paid', async () => {
  await t.act('markPaid', bid);
  const b = (await state()).bookings.find(x => x.id === bid);
  assert.equal(b.paid, true);
});

test('turning bank transfer off falls back to card, so guests can always pay', async () => {
  assert.equal((await t.act('saveBankTransfer', { on: false })).body.result.ok, true);
  assert.match(await site(), /"guestPay":"card"/);
});
