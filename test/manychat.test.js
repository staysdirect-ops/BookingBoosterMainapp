// ManyChat DMs: the webhook saves the lead, answers with the guide link and sends the guide by email.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const mails = [];
let mock, t;
const DAY = 864e5, KEY = 'mc-test-secret-0123456789abcdef';
const to = e => mails.filter(m => [].concat(m.to).includes(e));
const hook = (body, key) => fetch(t.base + '/webhooks/manychat', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, key === null ? {} : { 'x-bb-key': key || KEY }), body: JSON.stringify(body) });
const runAt = at => t.call('/admin/leads/run', { body: { at } });

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m_' + mails.length + '"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1', MANYCHAT_SECRET: KEY });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('the webhook refuses requests without the shared secret', async () => {
  assert.equal((await hook({ email: 'x@example.co.uk', guide: 'leak' }, null)).status, 401);
  assert.equal((await hook({ email: 'x@example.co.uk', guide: 'leak' }, 'wrong-secret-0123456789abcdefgh')).status, 401);
  assert.equal((await hook({ email: 'not-an-email', guide: 'leak' })).status, 400);
});

test('a DM guide request with consent gets the guide now and three tips, then stops', async () => {
  const now = Date.now();
  const r = await hook({ email: 'dm@example.co.uk', name: 'Robin Host', guide: 'LEAK', channel: 'instagram', consent: 'yes', subscriber_id: '123' });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.guide_title, 'Fee Leak Worksheet');
  assert.match(j.guide_url, /\/guides\/fee-leak-worksheet\.pdf$/);
  assert.match(j.signup_url, /utm_source=instagram/);
  const g1 = await t.until(async () => to('dm@example.co.uk')[0]);
  assert.match(g1.subject, /Your copy: Fee Leak Worksheet/);
  assert.match(g1.html, /\/guides\/fee-leak-worksheet\.pdf/);
  assert.match(g1.html, /Hi Robin,/);
  assert.doesNotMatch(g1.html + g1.text, /\{[a-z_]+\}|undefined|NaN/);
  for (const d of [3, 6, 9, 40]) await runAt(now + d * DAY);
  assert.deepEqual(to('dm@example.co.uk').map(m => m.subject), ['Your copy: Fee Leak Worksheet', 'Where direct bookings actually come from', 'Do I have to leave Airbnb?', 'Your direct booking site, set up for you']);
  const rows = await t.sql("SELECT source, consent_at, kind FROM leads WHERE email = 'dm@example.co.uk'");
  assert.equal(rows[0].source, 'manychat'); assert.ok(rows[0].consent_at); assert.equal(rows[0].kind, 'manychat-guide');
});

test('without consent only the guide itself is emailed', async () => {
  const now = Date.now();
  await hook({ email: 'quiet@example.co.uk', guide: 'templates', channel: 'whatsapp', consent: 'no' });
  const g1 = await t.until(async () => to('quiet@example.co.uk')[0]);
  assert.match(g1.subject, /Guest Message Template Pack/);
  assert.match(g1.html, /only email you will get/);
  for (const d of [3, 6, 9]) await runAt(now + d * DAY);
  assert.equal(to('quiet@example.co.uk').length, 1);
});

test('a sales DM without a guide is saved for the team with no email series', async () => {
  const r = await hook({ email: 'call@example.co.uk', name: 'Sam', topic: 'book-call', homes: '2', channel: 'facebook' });
  assert.equal(r.status, 200); assert.equal((await r.json()).guide_url, '');
  await t.until(async () => mails.find(m => /New ManyChat lead \(book-call\): call@example\.co\.uk/.test(m.subject)));
  assert.equal(to('call@example.co.uk').length, 0);
});
