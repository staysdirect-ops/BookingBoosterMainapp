// The team's outreach list at /admin/outreach: imported hosts, a weekly batch to phone, call results, and no emails.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');
const O = require('../server/outreach-admin');

const mails = [];
let mock, t;
const form = (p, o) => fetch(t.base + p, { method: 'POST', redirect: 'manual', headers: { cookie: t.cookie, 'content-type': 'application/x-www-form-urlencoded', origin: t.base }, body: new URLSearchParams(o).toString() });
const page = async p => (await t.call(p)).body;
const CSV = ['#,Business / property name,Accommodation type,Priority,Town,County,Region,Website,Public phone,Business email (to find),Entity type (PECR),Pitch angle,Source URL,Outreach status',
  '1,Gull Barn,Self-catering / holiday let,B,Whitby,North Yorkshire,Yorkshire,https://gullbarn.example,01947 600001,,Assume sole trader: no cold email until checked,Has own site,https://dir.example/1,Not contacted',
  '2,Heron Huts,Glamping,A,Keswick,Cumbria,North West England,,01768 700002,,Assume sole trader: no cold email until checked,No website found,javascript:alert(1),Not contacted',
  '3,Puffin Lodge,Holiday park / lodges,C,Tenby,Pembrokeshire,Wales,,01834 800003,,Company (Ltd/LLP in name),No website found,,Not contacted',
  '4,Otter Cottage,Farm stay,A,Bude,Cornwall,South West England,https://otter.example,01288 900004,,Assume sole trader: no cold email until checked,Has own site,,Not contacted'].join('\n');

test('the outreach week runs Monday to Friday, and the weekend plans the coming week', () => {
  const at = s => Date.parse(s);
  assert.equal(O.weekOf(at('2026-11-23T09:00:00Z')), '2026-11-23', 'Monday');
  assert.equal(O.weekOf(at('2026-11-27T17:00:00Z')), '2026-11-23', 'Friday');
  assert.equal(O.weekOf(at('2026-11-28T10:00:00Z')), '2026-11-30', 'Saturday looks ahead');
  assert.equal(O.weekOf(at('2026-11-22T21:00:00Z')), '2026-11-23', 'Sunday evening looks ahead');
});

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { try { mails.push(JSON.parse(raw)); } catch (_) {} s.writeHead(200, { 'content-type': 'application/json' }); s.end('{"id":"m"}'); }); }).listen(0);
  t = await start({ RESEND_API_KEY: 're_test_fake', EMAIL_API_BASE: 'http://localhost:' + mock.address().port, ADMIN_EMAILS: 'host@example.co.uk', ALLOW_TEST_CLOCK: '1' });
  await t.signup();
  const r = await t.call('/admin/leads/import', { body: { csv: CSV, source: 'scraped' } });
  assert.equal(r.body.loaded, 4);
  mails.length = 0;
});
test.after(() => { t.stop(); mock.close(); });

test('only the team can open the outreach list', async () => {
  assert.equal((await fetch(t.base + '/admin/outreach')).status, 404);
  assert.equal((await fetch(t.base + '/admin/outreach/week', { method: 'POST', headers: { origin: t.base, 'content-type': 'application/x-www-form-urlencoded' }, body: 'count=50' })).status, 404);
});

test('the list shows every imported host with phone, priority and pitch, and links only to real web addresses', async () => {
  const html = await page('/admin/outreach?view=all');
  assert.match(html, /Outreach list/); assert.match(html, /href="\/admin\/outreach" aria-current|aria-current="page"[^>]*>.*Outreach/s);
  for (const n of ['Gull Barn', 'Heron Huts', 'Puffin Lodge', 'Otter Cottage']) assert.match(html, new RegExp(n));
  assert.match(html, /href="tel:\+441947600001"/); assert.match(html, /01947600001/);
  assert.match(html, /href="https:\/\/gullbarn\.example"/);
  assert.ok(!/javascript:alert/.test(html), 'unsafe links are dropped');
  assert.match(html, /Sole trader: phone only, no cold email/);
  assert.ok(html.indexOf('Heron Huts') < html.indexOf('Gull Barn') && html.indexOf('Gull Barn') < html.indexOf('Puffin Lodge'), 'priority A first, then B, then C');
  const f = await page('/admin/outreach?view=all&pri=A');
  assert.match(f, /Heron Huts/); assert.match(f, /Otter Cottage/); assert.ok(!/Gull Barn/.test(f.split('<tbody>')[1]));
  assert.match(await page('/admin/outreach?view=all&q=tenby'), /Puffin Lodge/);
});

test('the team picks this week\'s batch, priority A first, and can take one off', async () => {
  assert.match(await page('/admin/outreach'), /No hosts are picked for this week yet/);
  const r = await form('/admin/outreach/week', { count: '2' });
  assert.equal(r.status, 302);
  let html = await page('/admin/outreach');
  const body = html.split('<tbody>')[1];
  assert.match(body, /Heron Huts/); assert.match(body, /Otter Cottage/); assert.ok(!/Gull Barn/.test(body));
  assert.match(html, /This week \(2\)/);
  const id = (await t.sql("SELECT id FROM leads WHERE name = 'Otter Cottage'"))[0].id;
  await form('/admin/outreach/week/remove', { id, back: '/admin/outreach' });
  await form('/admin/outreach/week', { count: '1' });
  html = (await page('/admin/outreach')).split('<tbody>')[1];
  assert.match(html, /Heron Huts/); assert.match(html, /Gull Barn/); assert.ok(!/Otter Cottage/.test(html), 'a host taken off is not picked again the same week');
});

test('call results and notes are saved on the lead, and nothing is emailed', async () => {
  const id = (await t.sql("SELECT id FROM leads WHERE name = 'Heron Huts'"))[0].id;
  const r = await form('/admin/outreach/status', { id, status: 'Spoke, interested', note: 'Call back Tues 10am', back: 'https://evil.example/' });
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/admin/outreach', 'only redirects inside the outreach page');
  const d = JSON.parse((await t.sql('SELECT data FROM leads WHERE id = ?', id))[0].data);
  assert.equal(d['Outreach status'], 'Spoke, interested'); assert.equal(d.Response, 'Call back Tues 10am'); assert.match(d['Date contacted'], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(d.Town, 'Keswick', 'the imported details are kept');
  const html = await page('/admin/outreach');
  assert.match(html, /Call back Tues 10am/); assert.match(html, /1 called or updated/);
  await form('/admin/outreach/status', { id, status: 'Not a status' });
  assert.equal(JSON.parse((await t.sql('SELECT data FROM leads WHERE id = ?', id))[0].data)['Outreach status'], 'Spoke, interested', 'unknown results are ignored');
  for (const d of [1, 3, 10]) await t.call('/admin/leads/run', { body: { at: Date.now() + d * 864e5 } });
  await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(mails.filter(m => ![].concat(m.to).every(x => x === 'host@example.co.uk')), [], 'no emails to anyone but the team account');
  assert.equal((await t.sql("SELECT count(*)::int AS n FROM lead_seq"))[0].n, 0);
});
