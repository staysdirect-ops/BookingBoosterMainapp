// Outreach sequences A and B for imported leads: inactive drafts that cannot send, and what they do once switched on.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');
const OUT = require('../server/outreach-emails');

const DAY = 864e5;
const mails = [];
let mock, off, on;
const to = e => mails.filter(m => [].concat(m.to).includes(e));
const imp = (t, csv, source) => t.call('/admin/leads/import', { body: { csv, source } });
const enroll = (t, id, at) => t.call('/admin/leads/outreach/enroll', { body: { id, at } });
const runAt = (t, at) => t.call('/admin/leads/run', { body: { at } });
const idOf = async (t, email) => (await t.sql('SELECT id FROM leads WHERE email = ?', email))[0].id;

test('both sequences are inactive drafts in the code', () => {
  assert.deepEqual(Object.keys(OUT.series), ['outreach-a', 'outreach-b']);
  for (const s of Object.values(OUT.series)) assert.strictEqual(s.active, false, s.name + ' must ship switched off');
});

test('sequence A is 4 emails for scraped leads, B is 3 for Stays Direct and Contractor Stop, with the approved copy', () => {
  const A = OUT.series['outreach-a'], B = OUT.series['outreach-b'];
  assert.deepEqual(A.sources, ['scraped']); assert.deepEqual(B.sources, ['stays-direct', 'contractor-stop']);
  assert.deepEqual(A.steps.map(s => [s.key, s.day]), [['A1', 1], ['A2', 4], ['A3', 9], ['A4', 15]]);
  assert.deepEqual(B.steps.map(s => [s.key, s.day]), [['B1', 1], ['B2', 5], ['B3', 10]]);
  assert.deepEqual([...A.steps, ...B.steps].map(s => s.subject), ['{property_name}: bookings without the commission', 'What the £197 a month covers', 'Can a guest find {property_name} without a platform?', 'Shall I close this off?',
    'A booking site of your own, {first_name}', 'Your guests, your list', 'Last note on this']);
  for (const s of [...A.steps, ...B.steps]) { assert.match(s.body, /^Hi \{first_name\},\n\n/); assert.match(s.body, /\{link\}/); assert.match(s.body, /\{sender_name\}/); }
  assert.match(B.steps[0].body, /You know us from \{brand\}, where \{property_name\} is listed\./);
  assert.equal(OUT.forSource('scraped'), 'outreach-a'); assert.equal(OUT.forSource('stays-direct'), 'outreach-b'); assert.equal(OUT.forSource('contractor-stop'), 'outreach-b'); assert.equal(OUT.forSource('website'), null);
  assert.deepEqual(OUT.BRANDS, { 'stays-direct': 'Stays Direct', 'contractor-stop': 'Contractor Stop' });
  assert.equal(OUT.SENDER, 'Faster Software Group trading as Booking Booster');
});

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m_' + mails.length + '"}'); }); }).listen(0);
  const env = { RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' };
  off = await start(env); await off.signup();
  on = await start(Object.assign({ OUTREACH_TEST_ON: 'outreach-a,outreach-b' }, env)); await on.signup();
});
test.after(() => { off.stop(); on.stop(); mock.close(); });

test('while inactive nobody can be enrolled, and a row put there by hand still sends nothing', async () => {
  await imp(off, 'Business name,Town,Email,Contact name\nGull Cottage,Whitby,gull@example.co.uk,Ann Lee\n', 'scraped');
  const id = await idOf(off, 'gull@example.co.uk');
  const r = await enroll(off, id);
  assert.equal(r.body.error, 'This outreach series is an inactive draft'); assert.equal(r.body.seq, 'outreach-a');
  assert.equal((await off.sql('SELECT count(*)::int AS n FROM lead_seq'))[0].n, 0);
  await off.sql("INSERT INTO kv (k, v) VALUES ('outreach-settings', ?)", JSON.stringify({ link: 'https://booking-booster.co.uk/demo', sender_name: 'Jay', company_footer: 'Registered in England' }));
  await off.sql("INSERT INTO lead_seq (lead_id, seq, idx, status, next_at, sent, vars, updated_at) VALUES (?, 'outreach-a', 0, 'active', NULL, '{}', '{}', 1)", id);
  for (const d of [0, 1, 5, 20]) await runAt(off, Date.now() + d * DAY);
  await new Promise(r => setTimeout(r, 200));
  assert.equal(to('gull@example.co.uk').length, 0, 'nothing sent');
  assert.deepEqual((await off.sql('SELECT idx, status, sent FROM lead_seq WHERE lead_id = ?', id))[0], { idx: 0, status: 'active', sent: '{}' }, 'row untouched');
});

test('the template gallery shows every draft as inactive, merge fields in curly brackets, footer and unsubscribe link', async () => {
  const page = await off.call('/admin/emails');
  assert.match(page.body, /To imported leads: outreach sequences \(inactive drafts\)/);
  assert.equal((page.body.match(/Inactive draft, cannot send/g) || []).length, 7);
  for (const k of ['A1', 'A2', 'A3', 'A4', 'B1', 'B2', 'B3']) {
    const seq = k[0] === 'A' ? 'outreach-a' : 'outreach-b';
    const r = await off.call('/admin/emails/out.' + seq + '.' + k + '/preview');
    assert.equal(r.status, 200, k + ' preview');
    const html = r.body;
    assert.match(html, /\{first_name\}/, k + ' keeps merge fields');
    assert.match(html, /\{company_footer\}/, k + ' has the footer placeholder');
    assert.match(html, /Unsubscribe in one click/, k + ' has the unsubscribe link');
    assert.match(html, /Faster Software Group trading as Booking Booster/, k + ' names the sender');
  }
});

test('switched on (test server only): held until every merge field has a value, then sent on schedule with brand, footer and unsubscribe', async () => {
  const now = Date.now();
  await imp(on, 'Property name,Town,Email,Contact name\nFell Barn,Keswick,fell@example.co.uk,Sam Hill\nNo Contact Name,Bath,nocontact@example.co.uk,\n', 'stays-direct');
  const id = await idOf(on, 'fell@example.co.uk');
  assert.deepEqual((await enroll(on, id, now)).body, { ok: true, seq: 'outreach-b' });
  assert.equal((await enroll(on, id, now)).body.error, 'Already on a series');
  await runAt(on, now + 60e3);
  assert.equal(to('fell@example.co.uk').length, 0, 'held: link, sender and footer not set yet');
  assert.equal((await on.sql('SELECT status FROM lead_seq WHERE lead_id = ?', id))[0].status, 'waiting');

  await on.sql("INSERT INTO kv (k, v) VALUES ('outreach-settings', ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v", JSON.stringify({ link: 'https://booking-booster.co.uk/demo', sender_name: 'Jay Smith', company_footer: 'Faster Software Group Ltd, registered in England' }));
  await runAt(on, now + 60e3);
  const b1 = await on.until(async () => to('fell@example.co.uk')[0]);
  assert.equal(b1.subject, 'A booking site of your own, Sam');
  assert.match(b1.text, /^Hi Sam,\n\nYou know us from Stays Direct, where Fell Barn is listed\./);
  assert.match(b1.text, /Nothing changes with your Stays Direct listing\./);
  assert.match(b1.text, /Have a look: https:\/\/booking-booster\.co\.uk\/demo\n\nJay Smith/);
  assert.match(b1.text, /Sent by Faster Software Group trading as Booking Booster\.\nFaster Software Group Ltd, registered in England\n\nUnsubscribe: \S+\/u\/lead\//);
  assert.doesNotMatch(b1.text + b1.html + b1.subject, /\{[a-z_]+\}/, 'no unfilled fields');
  assert.ok(b1.headers['List-Unsubscribe'], 'one-click unsubscribe header');

  await runAt(on, now + 3 * DAY); assert.equal(to('fell@example.co.uk').length, 1, 'B2 is day 5');
  await runAt(on, now + 5 * DAY - 36e5); assert.deepEqual(to('fell@example.co.uk').map(m => m.subject), ['A booking site of your own, Sam', 'Your guests, your list']);
  const unsub = b1.text.match(/Unsubscribe: (\S+)/)[1].replace(/^https?:\/\/[^/]+/, '');
  await on.call(unsub, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: '' });
  await runAt(on, now + 12 * DAY);
  assert.equal(to('fell@example.co.uk').length, 2, 'nothing after unsubscribing');

  // a lead with no contact name is held rather than sent "Hi ,"
  const id2 = await idOf(on, 'nocontact@example.co.uk');
  await enroll(on, id2, now); await runAt(on, now + 60e3);
  assert.equal(to('nocontact@example.co.uk').length, 0);
  assert.deepEqual(JSON.parse((await on.sql('SELECT vars FROM lead_seq WHERE lead_id = ?', id2))[0].vars).missing, ['first_name']);
});

test('phone-only leads and website leads cannot be enrolled', async () => {
  await imp(on, 'Name,Phone\nPhone Only,01632 960777\n', 'scraped');
  const pid = (await on.sql("SELECT id FROM leads WHERE phone = '+441632960777'"))[0].id;
  assert.equal((await enroll(on, pid)).body.error, 'No email address');
  await fetch(on.base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'site@example.co.uk', page: 'contact' }) });
  assert.equal((await enroll(on, await idOf(on, 'site@example.co.uk'))).body.error, 'No outreach series for this source');
});
