// Account page: details, password, data export and deletion (with the Stripe subscription ended).
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const calls = [];
let mock, t;
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });

test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    calls.push(q.method + ' ' + q.url.split('?')[0]); s.writeHead(200, { 'content-type': 'application/json' });
    if (q.url.startsWith('/v1/subscriptions?')) return s.end(JSON.stringify({ data: [{ id: 'sub_1', status: 'active' }, { id: 'sub_old', status: 'canceled' }] }));
    s.end('{"id":"x","status":"canceled"}');
  }); }).listen(0);
  t = await start({ STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('the host can change their details and password', async () => {
  assert.match((await t.call('/app/account')).body, /Your account/);
  const r = await form('/app/account/profile', { owner: 'Tess Host', business: 'Sea Stays', email: 'tess@example.co.uk' });
  assert.equal(r.status, 302);
  const st = (await t.call('/api/state')).body.state;
  assert.equal(st.account.business, 'Sea Stays'); assert.equal(st.account.owner, 'Tess Host');
  assert.equal((await form('/app/account/password', { current: 'wrong-password', next: 'a-new-password-1' })).status, 400);
  assert.equal((await form('/app/account/password', { current: 'correcthorse1', next: 'a-new-password-1' })).status, 302);
  assert.equal((await t.call('/api/state')).status, 200, 'still signed in on this device');
  const login = await fetch(t.base + '/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=tess%40example.co.uk&password=a-new-password-1' });
  assert.equal(login.status, 302, 'new email and password work');
});

test('the host can download all their data and their guest list', async () => {
  const j = await t.call('/app/account/export');
  assert.equal(j.status, 200); assert.ok(Array.isArray(j.body.homes) && j.body.homes.length === 1);
  assert.match(j.headers.get('content-disposition'), /attachment/);
  const c = await t.call('/app/account/guests.csv');
  assert.equal(c.status, 200); assert.match(c.body, /^﻿?"Name","Email"/);
});

test('deleting the account ends the subscription and removes everything', async () => {
  const { slug } = await t.home();
  await t.sql("UPDATE workspaces SET stripe_customer = 'cus_1' WHERE slug = ?", slug);
  assert.equal((await form('/app/account/delete', { confirm: 'nope', password: 'a-new-password-1' })).status, 400);
  assert.equal((await form('/app/account/delete', { confirm: 'DELETE', password: 'wrong' })).status, 400);
  const r = await form('/app/account/delete', { confirm: 'delete', password: 'a-new-password-1' });
  assert.equal(r.status, 200); assert.match(r.body, /Your account is deleted/);
  assert.ok(calls.includes('DELETE /v1/subscriptions/sub_1'), 'live subscription ended'); assert.ok(!calls.includes('DELETE /v1/subscriptions/sub_old'));
  assert.equal((await t.call('/api/state')).status, 401, 'signed out');
  assert.equal((await fetch(t.base + '/s/' + slug)).status, 404, 'booking site gone');
  const login = await fetch(t.base + '/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'email=tess%40example.co.uk&password=a-new-password-1' });
  assert.notEqual(login.status, 302, 'cannot sign in');
});
