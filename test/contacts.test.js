// Contacts: CSV parsing, column guessing, dedupe by email and phone, and the upload action on a real server.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Workspace, seedBlank, londonNow } = require('../server/engine');
const start = require('./harness');

const ws = () => new Workspace('w-test', seedBlank(Object.assign({ business: 'Test Stays', owner: 'Test Host', email: 'host@example.co.uk' }, londonNow())));

test('CSV parsing handles quotes, semicolons, tabs and a byte order mark', () => {
  const C = ws().BB.contacts;
  assert.deepEqual(C.parse('﻿Name,Email\n"Lee, Kim","kim@example.co.uk"\r\n\n"Say ""hi""",x@y.co\n'), [['Name', 'Email'], ['Lee, Kim', 'kim@example.co.uk'], ['Say "hi"', 'x@y.co']]);
  assert.deepEqual(C.parse('a;b;c\n1;2;3'), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(C.parse('a\tb\n1\t2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(C.parse('"line\nbreak",z'), [['line\nbreak', 'z']]);
});

test('columns are guessed from headings and contents', () => {
  const C = ws().BB.contacts;
  assert.deepEqual(C.guess(['First Name', 'Surname', 'E-mail address', 'Mobile', 'Checked out', 'Marketing opt-in', 'Notes'], []), ['firstName', 'lastName', 'email', 'phone', 'lastStay', 'consent', 'notes']);
  assert.deepEqual(C.guess(['', ''], [['kim@example.co.uk', '07700 900123'], ['lee@example.co.uk', '+44 7700 900456']]), ['email', 'phone']);
  assert.equal(C.hasHeader([['Name', 'Email']]), true);
  assert.equal(C.hasHeader([['Kim', 'kim@example.co.uk']]), false);
});

test('phones match however they are written, and dates are read day first', () => {
  const C = ws().BB.contacts;
  const k = C.phoneKey('07700 900123');
  assert.equal(C.phoneKey('+44 (0)7700 900123'), k); assert.equal(C.phoneKey('0044 7700-900123'), k); assert.equal(C.phoneKey('447700900123'), k); assert.equal(C.phoneKey('7700900123'), k);
  assert.equal(C.phoneKey('123'), '');
  assert.equal(C.date('14/08/2026'), '2026-08-14'); assert.equal(C.date('2026-8-4'), '2026-08-04'); assert.equal(C.date('8/14/2026'), null);
});

test('an upload adds new contacts, merges duplicate rows and matches people already here', () => {
  const w = ws(); const BB = w.BB; const s = BB.store.get();
  s.guests.push({ id: 'gx', name: 'Pat Old', email: 'pat@example.co.uk', phone: '', city: '', tags: [], subscribed: false, unsubscribedAt: '2026-01-01', source: 'website', notes: '' });
  s.guests.push({ id: 'gy', name: 'Sam Phone', email: '', phone: '07700 900999', city: '', tags: [], subscribed: false, source: 'console', notes: '' });
  const rows = [
    { firstName: 'Kim', lastName: 'Lee', email: 'KIM@example.co.uk', phone: '07700 900123', lastStay: '14/08/2025', tags: 'Family; VIP' },
    { name: 'Kim L', phone: '+44 7700 900123', city: 'Leeds', dog: 'yes' }, // same person by phone
    { name: 'Pat Old', email: 'pat@example.co.uk', phone: '07700 900111' }, // already here, unsubscribed
    { name: 'Sam Phone', email: 'sam@example.co.uk', phone: '+447700900999' }, // already here, matched by phone
    { name: 'Nobody', email: 'not-an-email' },
    { name: 'Jo Text', phone: '07700 900222', consent: 'no' },
  ];
  const plan = BB.contacts.plan(rows);
  assert.deepEqual([plan.added, plan.updated, plan.duplicates, plan.invalid], [2, 2, 1, 1]);
  const r = BB.act.importContacts(rows, { consent: true, tag: 'Old list' });
  assert.deepEqual(r, { added: 2, updated: 2, duplicates: 1, skipped: 1, subscribed: 2 });
  const kim = s.guests.find(g => g.email === 'kim@example.co.uk');
  assert.equal(kim.name, 'Kim Lee'); assert.equal(kim.city, 'Leeds'); assert.equal(kim.lastStay, '2025-08-14'); assert.equal(kim.subscribed, true);
  for (const t of ['Imported', 'Family', 'VIP', 'Pet owner', 'Old list']) assert.ok(kim.tags.includes(t), t);
  const pat = s.guests.find(g => g.id === 'gx'); assert.equal(pat.subscribed, false, 'never resubscribes someone who opted out'); assert.equal(pat.phone, '07700 900111');
  const sam = s.guests.find(g => g.id === 'gy'); assert.equal(sam.email, 'sam@example.co.uk', 'blank email filled in'); assert.equal(sam.subscribed, true);
  const jo = s.guests.find(g => g.name === 'Jo Text'); assert.equal(jo.email, ''); assert.equal(jo.subscribed, false, 'a "no" in the consent column wins');
  assert.equal(s.guests.length, 4);
  // Running the same file again adds nobody.
  const again = BB.act.importContacts(rows, { consent: true });
  assert.equal(again.added, 0); assert.equal(s.guests.length, 4);
  // Everyone subscribed with an email is in "Everyone on your list"; only past stays are in "All past guests".
  const seg = BB.q.segments();
  assert.deepEqual(seg.list.guests.map(g => g.email).sort(), ['kim@example.co.uk', 'sam@example.co.uk']);
  assert.deepEqual(seg.past.guests.map(g => g.email), ['kim@example.co.uk']);
});

test('uploading through the API saves contacts and a campaign to the list reaches them', async () => {
  const t = await start({});
  try {
    await t.signup(); await t.home();
    const r = await t.act('importContacts', [{ name: 'Ana List', email: 'ana@example.co.uk' }, { name: 'Ana Again', email: 'ANA@example.co.uk', phone: '07700 900333' }, { name: 'Ben', phone: '07700 900444' }], { consent: true });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.result, { added: 2, updated: 0, duplicates: 1, skipped: 0, subscribed: 1 });
    const st = r.body.state; const ana = st.guests.find(g => g.email === 'ana@example.co.uk');
    assert.equal(ana.phone, '07700 900333', 'duplicate row merged into one contact');
    const saved = await t.act('saveCampaign', { name: 'Hello', subject: 'Hello list', segment: 'list', body: { heading: 'Hi', text: 'News', cta: 'See dates', propertyId: st.properties[0].id } });
    await t.act('sendCampaign', saved.body.result, {});
    const c = (await t.call('/api/state')).body.state.campaigns.find(x => x.id === saved.body.result);
    assert.equal(c.recipients, 1);
  } finally { t.stop(); }
});

test('a shared phone number never merges two people with different emails', () => {
  const w = ws(); const BB = w.BB; const s = BB.store.get();
  s.guests.push({ id: 'ga', name: 'Ann Home', email: 'ann@example.co.uk', phone: '01234 567890', city: '', tags: [], subscribed: false, source: 'website', notes: '' });
  const plan = BB.contacts.plan([{ name: 'Bob Home', email: 'bob@example.co.uk', phone: '01234 567890' }, { name: 'Cat Home', email: 'cat@example.co.uk', phone: '01234 567890' }, { name: 'Ann', phone: '01234567890' }]);
  assert.deepEqual([plan.added, plan.updated, plan.duplicates], [2, 1, 0]);
  assert.equal(plan.rows[2].guestId, 'ga');
});
