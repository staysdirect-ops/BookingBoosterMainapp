// Follow-up emails for marketing leads, through a stand-in Resend API.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const mails = [];
let mock, t;
const DAY = 864e5;
const to = e => mails.filter(m => [].concat(m.to).includes(e));
const lead = body => fetch(t.base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://booking-booster.co.uk' }, body: JSON.stringify(body) });
const runAt = at => t.call('/admin/leads/run', { body: { at } });
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m_' + mails.length + '"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('the fee leak opt-in gets the result and playbook at once, then the series, then nothing after unsubscribing', async () => {
  const now = Date.now();
  assert.equal((await lead({ email: 'fee@example.co.uk', name: 'Alex Host', rate: '160', nights: '16', homes: '2', fee: '15.5', page: 'funnel-1-fee-leak/02-optin' })).status, 200);
  const e1 = await t.until(async () => to('fee@example.co.uk')[0]);
  assert.ok(e1, 'first email sent straight away');
  assert.match(e1.subject, /fee leak result/i);
  assert.match(e1.html, /£9,523 a year/, 'shows their own number');
  assert.match(e1.html, /\/guides\/direct-booking-playbook\.pdf/, 'links the playbook');
  assert.match(e1.html, /Hi Alex,/);
  assert.ok(e1.headers['List-Unsubscribe'], 'one-click unsubscribe header');
  assert.doesNotMatch(e1.html + e1.text, /\{[a-z_]+\}|undefined|NaN|\bSam\b/, 'no unfilled fields or made-up sender');
  for (const d of [2, 4, 6, 8, 10]) await runAt(now + d * DAY);
  assert.deepEqual(to('fee@example.co.uk').map(m => m.subject), ['Your fee leak result (and the playbook)', 'Where direct bookings actually come from', 'What your guest sees when they book direct', 'Do I have to leave Airbnb?', 'Your direct booking site, live in 7 days', 'Last note on fees this year']);
  const pdf = await fetch(t.base + '/guides/direct-booking-playbook.pdf');
  assert.equal(pdf.status, 200); assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  const unsub = e1.text.match(/Unsubscribe: (\S+)/)[1].replace(/^https?:\/\/[^/]+/, '');
  assert.equal((await t.call(unsub)).status, 200);
  assert.equal((await t.call(unsub, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' })).status, 200);
  await runAt(now + 45 * DAY);
  assert.equal(to('fee@example.co.uk').length, 6, 'no monthly tip after unsubscribing');
});

test('the AI audit waits for the team, and people who book a call get the call emails instead', async () => {
  const now = Date.now();
  await lead({ email: 'audit@example.co.uk', name: 'Bea', url: 'https://airbnb.co.uk/rooms/1', town: 'Whitby', page: 'funnel-2-ai-audit/02-request' });
  const e1 = await t.until(async () => to('audit@example.co.uk')[0]);
  assert.match(e1.subject, /Your audit for Whitby is underway/);
  await runAt(now + 3 * DAY);
  assert.equal(to('audit@example.co.uk').length, 1, 'nothing more until the audit is entered');
  const admin = await t.call('/admin'); assert.match(admin.body, /Waiting for you/);
  const id = admin.body.match(/\/admin\/leads\/(\d+)\/audit/)[1];
  await form('/admin/leads/' + id + '/audit', { audit_url: 'https://example.co.uk/audit/1', score: '42', mentions: '3', top_fix: 'Add a dog policy page' });
  const e2 = await t.until(async () => to('audit@example.co.uk')[1]);
  assert.match(e2.subject, /42\/100 in Whitby/); assert.match(e2.html, /Add a dog policy page/); assert.match(e2.html, /https:\/\/example\.co\.uk\/audit\/1/);
  const day = new Date(now + 5 * DAY).toISOString().slice(0, 10);
  await lead({ email: 'audit@example.co.uk', name: 'Bea', phone: '07700900123', d: day, t: '10:30', page: 'funnel-2-ai-audit/04-book-call' });
  const c1 = await t.until(async () => to('audit@example.co.uk').find(m => /Booked/.test(m.subject)));
  assert.ok(c1, 'call confirmation sent');
  assert.equal(c1.attachments[0].filename, 'invite.ics');
  assert.match(Buffer.from(c1.attachments[0].content, 'base64').toString(), /BEGIN:VEVENT[\s\S]*DTSTART:/);
  await runAt(now + 5 * DAY - 2 * 36e5);
  assert.ok(to('audit@example.co.uk').some(m => /Tomorrow at 10:30/.test(m.subject)), 'reminder the day before');
  await runAt(now + 12 * DAY);
  assert.ok(!to('audit@example.co.uk').some(m => /one fix that matters/.test(m.subject)), 'no audit nudges once a call is booked');
});

test('live demo emails follow the session the team sets', async () => {
  const now = Date.now();
  await lead({ email: 'web@example.co.uk', name: 'Cal', homes: '1', page: 'funnel-3-direct-in-7-days/02-register' });
  const e1 = await t.until(async () => to('web@example.co.uk')[0]);
  assert.match(e1.html, /We will email you the date/);
  const day = new Date(now + 6 * DAY).toISOString().slice(0, 10);
  await form('/admin/settings', { webinar_day: day, webinar_time: '12:30', join_url: 'https://meet.example.co.uk/demo' });
  await runAt(now + 5 * DAY + 12 * 36e5);
  assert.ok(to('web@example.co.uk').some(m => /^Tomorrow/.test(m.subject) && /meet\.example\.co\.uk/.test(m.html)), 'day-before email with the joining link');
  await form('/admin/settings', { webinar_day: day, webinar_time: '12:30', join_url: 'https://meet.example.co.uk/demo', replay_url: 'https://video.example.co.uk/replay' });
  await runAt(now + 6 * DAY + 20 * 36e5);
  assert.ok(to('web@example.co.uk').some(m => /replay/i.test(m.subject) && /video\.example\.co\.uk/.test(m.html)), 'replay email');
});

test('signing up stops the sales emails', async () => {
  const now = Date.now();
  await lead({ email: 'host@example.co.uk', name: 'Test', rate: '100', nights: '10', page: 'funnel-1-fee-leak/02-optin' });
  await runAt(now + 2 * DAY);
  assert.ok(!to('host@example.co.uk').some(m => /Where direct bookings/.test(m.subject)), 'already a customer');
});
