// Bulk CSV lead import: source tag, consent dates, has_email flag, dedupe by email then phone, and no emails to imported leads.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');
const L = require('../server/lead-import');

const mails = [];
let mock, t;
const DAY = 864e5;
const imp = (csv, source, extra) => t.call('/admin/leads/import', { body: Object.assign({ csv, source }, extra || {}) });

test('CSV parsing handles quotes, commas and line breaks inside fields, CRLF and a BOM', () => {
  const rows = L.parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\r\n\r\n1,2,3');
  assert.deepEqual(rows, [['a', 'b', 'c'], ['x, y', 'say "hi"', 'two\nlines'], ['1', '2', '3']]);
});

test('columns are found from loose header names', () => {
  const c = L.columns(['#', 'Business / property name', 'Public phone', 'Business email (to find)', 'Contact name (to find)', 'Consent date']);
  assert.deepEqual(c, { email: 3, phone: 2, name: 4, business: 1, consent: 5 });
});

test('emails, UK phones and consent dates are cleaned or refused', () => {
  assert.equal(L.cleanEmail(' Jo@Example.CO.UK '), 'jo@example.co.uk');
  assert.equal(L.cleanEmail('mailto:a@b.com'), 'a@b.com');
  assert.equal(L.cleanEmail('not an email'), false);
  assert.equal(L.cleanEmail(''), '');
  assert.equal(L.cleanPhone('01963 210731'), '+441963210731');
  assert.equal(L.cleanPhone('+44 (0)7700 900123'), '+447700900123');
  assert.equal(L.cleanPhone('0044 20 8744 8150'), '+442087448150');
  assert.equal(L.cleanPhone('12345'), false);
  assert.equal(L.cleanPhone(''), '');
  const now = Date.UTC(2026, 10, 19);
  assert.equal(L.cleanConsent('14/03/2026', now), '2026-03-14');
  assert.equal(L.cleanConsent('2026-03-14', now), '2026-03-14');
  assert.equal(L.cleanConsent('31/02/2026', now), false, 'no such day');
  assert.equal(L.cleanConsent('01/01/2027', now), false, 'in the future');
  assert.equal(L.cleanConsent('soon', now), false);
  assert.equal(L.cleanConsent('', now), '');
});

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m_' + mails.length + '"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('a source tag from the list is required, and only the team can import', async () => {
  const csv = 'email\na@example.co.uk\n';
  for (const s of [undefined, '', 'facebook']) { const r = await imp(csv, s); assert.equal(r.status, 400); assert.match(r.body.error, /Choose a source/); }
  assert.match((await imp('email\n', 'scraped')).body.error, /no rows/);
  assert.match((await imp('town\nWhitby\n', 'scraped')).body.error, /email or phone column/);
  const anon = await fetch(t.base + '/admin/leads/import', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ csv, source: 'scraped' }) });
  assert.equal(anon.status, 404);
  assert.equal((await t.sql("SELECT count(*)::int AS n FROM leads WHERE kind = 'import'"))[0].n, 0);
});

test('a dry run reports the same result and saves nothing', async () => {
  const r = await imp('email,phone\ndry@example.co.uk,\n', 'scraped', { dry_run: true });
  assert.equal(r.status, 200); assert.equal(r.body.dryRun, true); assert.equal(r.body.loaded, 1);
  assert.equal((await t.sql("SELECT count(*)::int AS n FROM leads WHERE email = 'dry@example.co.uk'"))[0].n, 0);
});

test('rows load with source, consent date and has_email; bad rows and duplicates are rejected with reasons', async () => {
  // an existing website lead and an unsubscribed address, to dedupe against
  await fetch(t.base + '/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'web@example.co.uk', name: 'Web Lead', page: 'contact' }) });
  await t.sql('INSERT INTO lead_optout (email, at) VALUES (?, ?)', 'gone@example.co.uk', Date.now());
  const csv = [
    'Business / property name,Town,Public phone,Business email (to find),Contact name (to find),Consent date',
    'Gull Cottage,Whitby,01947 600100,ann@example.co.uk,Ann Lee,14/03/2026',   // 2 loads, email + phone + consent
    'Pods Farm,Ashbourne,07700 900111,,,',                                     // 3 loads, phone only
    'Same Ann,Whitby,01947 600999,ANN@example.co.uk,,',                         // 4 duplicate_email (in file, any case)
    'Phone Twin,Ashbourne,+44 7700 900111,,,',                                  // 5 duplicate_phone (in file, other format)
    'Web Twin,York,,web@example.co.uk,,',                                       // 6 duplicate_email (already a website lead)
    'Nothing,Bath,,,,',                                                         // 7 no_contact
    'Junk,Bath,,not-an-email,,',                                                // 8 invalid_email
    'Short,Bath,12345,,,',                                                      // 9 invalid_phone
    'Bad Date,Bath,,date@example.co.uk,,32/01/2026',                            // 10 invalid_consent_date
    'Gone,Bath,,gone@example.co.uk,,',                                          // 11 opted_out
    'Shared Phone,Whitby,01947 600100,other@example.co.uk,Bo,',                 // 12 loads: has an email, so phone is not the key
  ].join('\r\n');
  const r = await imp(csv, 'stays-direct');
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 11); assert.equal(r.body.loaded, 3); assert.equal(r.body.rejected, 8);
  assert.deepEqual(r.body.reasons, { duplicate_email: 2, duplicate_phone: 1, no_contact: 1, invalid_email: 1, invalid_phone: 1, invalid_consent_date: 1, opted_out: 1 });
  assert.deepEqual(r.body.rejects.map(x => [x.row, x.reason]), [[4, 'duplicate_email'], [5, 'duplicate_phone'], [6, 'duplicate_email'], [7, 'no_contact'], [8, 'invalid_email'], [9, 'invalid_phone'], [10, 'invalid_consent_date'], [11, 'opted_out']]);
  assert.equal(r.body.has_email, 2); assert.equal(r.body.no_email, 1); assert.equal(r.body.with_consent, 1);
  const rows = await t.sql("SELECT email, phone, name, source, consent_at, has_email, import_batch, data FROM leads WHERE kind = 'import' ORDER BY id");
  assert.deepEqual(rows.map(x => [x.email, x.phone, x.name, x.source, x.consent_at, x.has_email]), [
    ['ann@example.co.uk', '+441947600100', 'Ann Lee', 'stays-direct', '2026-03-14', 1],
    [null, '+447700900111', 'Pods Farm', 'stays-direct', null, 0],
    ['other@example.co.uk', '+441947600100', 'Bo', 'stays-direct', null, 1],
  ]);
  assert.ok(rows.every(x => x.import_batch === r.body.batch));
  assert.equal(JSON.parse(rows[0].data).Town, 'Whitby', 'other columns are kept');
  const web = await t.sql("SELECT source, has_email FROM leads WHERE email = 'web@example.co.uk'");
  assert.deepEqual(web.map(x => [x.source, x.has_email]), [['website', 1]], 'website leads are flagged too');

  // importing the same file again loads nothing: the stored leads catch it, by email then by phone
  const again = await imp(csv, 'scraped');
  assert.equal(again.body.loaded, 0);
  assert.equal(again.body.reasons.duplicate_email, 4); assert.equal(again.body.reasons.duplicate_phone, 2);
});

test('imported leads are never enrolled in a series, and no email reaches them', async () => {
  mails.length = 0;
  const csv = 'email,phone,name\nquiet@example.co.uk,01632 960001,Quiet Host\n';
  assert.equal((await imp(csv, 'contractor-stop')).body.loaded, 1);
  const seq = await t.sql("SELECT count(*)::int AS n FROM lead_seq s JOIN leads l ON l.id = s.lead_id WHERE l.kind = 'import'");
  assert.equal(seq[0].n, 0, 'no lead_seq rows for imported leads');
  for (const d of [1, 3, 10, 40]) await t.call('/admin/leads/run', { body: { at: Date.now() + d * DAY } });
  await t.call('/admin/campaigns/run', { body: { at: Date.now() + DAY } });
  await new Promise(r => setTimeout(r, 300));
  const toImported = mails.filter(m => [].concat(m.to).some(x => /quiet@|ann@|other@/.test(x)));
  assert.equal(toImported.length, 0, 'nothing sent to imported leads');
  assert.ok(!mails.some(m => /New .* lead/.test(m.subject || '')), 'no new-lead alert per imported row');
});

test('the team can upload the CSV from /admin/leads as a plain form', async () => {
  const page = await t.call('/admin/leads');
  assert.match(page.body, /Import leads from a CSV/); assert.match(page.body, /enctype="multipart\/form-data"/);
  const fd = new FormData();
  fd.append('source', 'scraped'); fd.append('file', new Blob(['Name,Phone\nForm Upload,01632 960555\nDup,01632 960555\n'], { type: 'text/csv' }), 'list.csv');
  const r = await fetch(t.base + '/admin/leads/import', { method: 'POST', headers: { cookie: t.cookie }, body: fd });
  assert.equal(r.status, 200);
  const html = await r.text();
  assert.match(html, /Imported 1 of 2 rows as scraped \(0 with email, 1 phone only\)\. Rejected 1: 1 phone already imported or already a lead\. None of them get emails\./);
  const row = await t.sql("SELECT name, phone, has_email FROM leads WHERE phone = '+441632960555'");
  assert.deepEqual(row.map(x => [x.name, x.has_email]), [['Form Upload', 0]]);
  assert.match(html, /\+441632960555/, 'phone-only leads show their phone in the list');
});
