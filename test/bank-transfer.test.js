// Bank transfer and invoices: the host adds bank details, a guest books and gets an invoice, the host marks it paid.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t, home;
test.before(async () => { t = await start(); await t.signup(); home = await t.home(); });
test.after(() => t.stop());

const book = (input, kind) => fetch(t.base + '/api/public/' + home.slug + '/book', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input: Object.assign({ propertyId: home.p.id, adults: 2 }, input), kind }) }).then(r => r.json());
const state = async () => (await t.call('/api/state')).body.state;

test('bank transfer stays off until the details are complete', async () => {
  const half = await t.act('saveBankTransfer', { on: true, holder: 'Test Stays Ltd', sortCode: '20-00' });
  assert.equal(half.body.result.ok, false);
  assert.equal((await state()).account.bank.on, false);
  const no = await book({ checkIn: t.dateIn(20), checkOut: t.dateIn(22), name: 'Early Guest', email: 'early@guest.co.uk' }, 'transfer');
  assert.equal(no.ok, false, 'guests cannot choose bank transfer before it is set up');
});

test('the host turns it on, and the booking site learns only that it is on', async () => {
  const r = await t.act('saveBankTransfer', { on: true, holder: 'Test Stays Ltd', bankName: 'Barclays', sortCode: '200000', account: '12345678', days: 5, note: 'Thank you!' });
  assert.equal(r.body.result.ok, true);
  const k = (await state()).account.bank;
  assert.equal(k.sortCode, '20-00-00'); assert.equal(k.on, true); assert.equal(k.days, 5);
  const page = await (await fetch(home.url.replace(/^https?:\/\/[^/]+/, t.base))).text();
  assert.match(page, /"bank":\{"on":true,"days":5\}/);
  assert.doesNotMatch(page, /12345678/, 'the account number is not on the public site');
});

let bid, invoiceUrl, tripUrl;
test('a guest books by bank transfer and gets an invoice, not a "paid" confirmation', async () => {
  const j = await book({ checkIn: t.dateIn(30), checkOut: t.dateIn(33), name: 'Pat Transfer', email: 'pat@guest.co.uk' }, 'transfer');
  assert.equal(j.ok, true, JSON.stringify(j));
  bid = j.bookingId; invoiceUrl = j.invoiceUrl; tripUrl = j.tripUrl;
  assert.match(invoiceUrl, /\/invoice\?k=/);
  const b = (await state()).bookings.find(x => x.id === bid);
  assert.equal(b.status, 'confirmed'); assert.equal(b.paid, false); assert.equal(b.payBy, 'transfer');
  assert.equal(b.invoice.no, 'INV-' + bid); assert.ok(b.invoice.due < t.dateIn(30));
  // The guest's own booking carries the bank details, but no door code until paid.
  assert.equal(j.state.account.bank.account, '12345678');
  assert.equal(j.state.bookings.find(x => x.id === bid).code, null);
  const mail = await t.until(async () => { const o = (await t.call('/api/outbox')).body.items; return o.find(x => /^Invoice INV-/.test(x.subject || '')) && o; });
  const inv = mail.find(x => /^Invoice INV-/.test(x.subject || ''));
  assert.equal(inv.recipient, 'pat@guest.co.uk');
  assert.match(inv.body, /Sort code: 20-00-00/); assert.match(inv.body, new RegExp('Reference: ' + bid));
  assert.ok(!mail.some(x => /^Booked:/.test(x.subject || '')), 'no "total paid" confirmation while the invoice is open');
});

test('the invoice page opens with the signed link only', async () => {
  const ok = await fetch(invoiceUrl.replace(/^https?:\/\/[^/]+/, t.base)); const html = await ok.text();
  assert.equal(ok.status, 200);
  assert.match(html, new RegExp('INV-' + bid)); assert.match(html, /20-00-00/); assert.match(html, /Total due/);
  const bad = await fetch(t.base + '/trip/' + home.slug + '/' + encodeURIComponent(bid) + '/invoice?k=nope'); assert.equal(bad.status, 403);
  const host = await t.call('/app/invoice/' + encodeURIComponent(bid)); assert.equal(host.status, 200); assert.match(host.body, /Back to console/);
  assert.ok(tripUrl);
});

test('the host marks the transfer received and the guest gets the paid confirmation', async () => {
  await t.act('markPaid', bid);
  const b = (await state()).bookings.find(x => x.id === bid);
  assert.equal(b.paid, true); assert.ok(b.paidAt);
  const mail = await t.until(async () => { const o = (await t.call('/api/outbox')).body.items; return o.some(x => /^Booked:/.test(x.subject || '')) && o; });
  assert.ok(mail, 'the booking confirmation goes out once paid');
  const html = await (await fetch(invoiceUrl.replace(/^https?:\/\/[^/]+/, t.base))).text();
  assert.match(html, /Total paid/);
});

test('the host can invoice a booking taken another way, such as an accepted request', async () => {
  const r = await book({ checkIn: t.dateIn(50), checkOut: t.dateIn(52), name: 'Robin Request', email: 'robin@guest.co.uk' }, 'request');
  assert.equal(r.ok, true); assert.equal(r.request, true);
  await t.act('acceptRequest', r.bookingId);
  const sent = await t.act('sendInvoice', r.bookingId);
  assert.equal(sent.body.result.ok, true);
  const b = (await state()).bookings.find(x => x.id === r.bookingId);
  assert.equal(b.payBy, 'transfer'); assert.equal(b.invoice.no, 'INV-' + r.bookingId);
  const mail = await t.until(async () => (await t.call('/api/outbox')).body.items.find(x => x.subject === 'Invoice INV-' + r.bookingId + ' for your stay at ' + home.p.name));
  assert.ok(mail, 'invoice emailed to the guest');
});
