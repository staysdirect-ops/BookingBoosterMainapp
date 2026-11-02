// Team email campaigns to leads: drafts in /admin/campaigns, previews, tests to yourself and a confirmed send.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const mails = [];
let mock, t;
const to = e => mails.filter(m => [].concat(m.to).includes(e));
const lead = body => fetch(t.base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://booking-booster.co.uk' }, body: JSON.stringify(body) });
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m_' + mails.length + '"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('the designed campaigns load as drafts, with current pricing and domain, and nothing is sent', async () => {
  await lead({ email: 'fee2@example.co.uk', name: 'Alex Host', rate: '160', nights: '16', homes: '2', fee: '15.5', page: 'funnel-1-fee-leak/02-optin' });
  await t.until(async () => to('fee2@example.co.uk')[0]);
  const before = mails.length;
  const list = await t.call('/admin/campaigns');
  assert.equal(list.status, 200);
  for (const n of ['Fee check', 'AI search check', 'Demo invite', 'Direct Booking Digest', 'Yearly offer']) assert.match(list.body, new RegExp(n));
  assert.doesNotMatch(list.body, /Sent<\/b>/);
  for (const key of ['fee-check', 'ai-search', 'demo-invite', 'digest', 'yearly-offer']) {
    const p = await t.call('/admin/campaigns/' + key + '/preview');
    assert.equal(p.status, 200, key);
    assert.doesNotMatch(p.body.replace(/&pound;/g, '£'), /£119|£790|£1,190|No setup fee|Starter|Portfolio|bookingbooster\.co\.uk|app\.bookingbooster/, key + ': no old pricing or domain');
    assert.doesNotMatch(p.body.replace(/<!--[\s\S]*?-->/g, ''), /\{\{[a-z0-9_]+\}\}|undefined|NaN/, key + ': no unfilled fields');
    assert.match(p.body, /\/email-img\/brand\/logo\.png/, key + ': images point at the app');
  }
  const fee = await t.call('/admin/campaigns/fee-check/preview'); fee.body = fee.body.replace(/&pound;/g, '£');
  assert.match(fee.body, /£9,523/, 'uses the lead’s own calculator numbers');
  assert.match(fee.body, /£200 a month/); assert.match(fee.body, /£997/);
  const offer = await t.call('/admin/campaigns/yearly-offer/preview'); offer.body = offer.body.replace(/&pound;/g, '£');
  assert.match(offer.body, /£2,000 a year/); assert.match(offer.body, /£997 setup fee/);
  assert.equal(mails.length, before, 'loading and previewing sends nothing');
});

test('a campaign only goes out after a test and a typed confirmation, and never twice', async () => {
  await lead({ email: 'gone@example.co.uk', name: 'Gone', rate: '200', nights: '20', page: 'funnel-1-fee-leak/02-optin' });
  const e = await t.until(async () => to('gone@example.co.uk')[0]);
  const unsub = e.text.match(/Unsubscribe: (\S+)/)[1].replace(/^https?:\/\/[^/]+/, '');
  await t.call(unsub, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
  let r = await form('/admin/campaigns/fee-check/send', { confirm: '1' });
  assert.match(r.body, /Send yourself a test first/);
  r = await form('/admin/campaigns/fee-check/test', { subject: 'Your fee check: about {{fees_paid_last_year}} a year in Airbnb fees' });
  assert.match(r.body, /Test sent to host@example\.co\.uk/);
  const testMail = to('host@example.co.uk').find(m => /^\[Test\]/.test(m.subject));
  assert.ok(testMail, 'test goes to the team member only');
  assert.equal(to('gone@example.co.uk').filter(m => /fee check/i.test(m.subject)).length, 0);
  const page = await t.call('/admin/campaigns/fee-check');
  const n = +page.body.match(/Type (\d+) to confirm/)[1];
  assert.ok(n >= 1);
  assert.match(page.body, /unsubscribed/, 'shows who is left out');
  r = await form('/admin/campaigns/fee-check/send', { confirm: String(n + 5) });
  assert.match(r.body, /Type \d+ \(the number of people\) to confirm/);
  r = await form('/admin/campaigns/fee-check/send', { confirm: String(n) });
  assert.match(r.body, /Sent to \d+/);
  const got = to('fee2@example.co.uk').filter(m => /Your fee check/.test(m.subject));
  assert.equal(got.length, 1); assert.match(got[0].subject, /£9,523/);
  assert.ok(got[0].headers['List-Unsubscribe'], 'one-click unsubscribe');
  assert.equal(to('gone@example.co.uk').filter(m => /Your fee check/.test(m.subject)).length, 0, 'unsubscribed people are left out');
  r = await form('/admin/campaigns/fee-check/send', { confirm: String(n) });
  assert.match(r.body, /already gone out/);
});

test('campaigns are team only', async () => {
  const r = await fetch(t.base + '/admin/campaigns');
  assert.equal(r.status, 404);
});
