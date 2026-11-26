// Team members (ADMIN_EMAILS or config:admins) land on the team page after signing in, see a link to it in the console,
// and the team page leads to the email campaigns and templates. Hosts never see any of it.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t;
test.before(async () => { t = await start(); await t.signup(); });
test.after(() => t.stop());
const login = (email, next) => fetch(t.base + '/login', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: t.base }, body: new URLSearchParams(Object.assign({ email, password: 'correcthorse1' }, next ? { next } : {})).toString() });

test('a host signs in to their console and cannot open the team pages', async () => {
  assert.equal((await login('host@example.co.uk')).headers.get('location'), '/app');
  assert.doesNotMatch((await t.call('/app')).body, /Open the team admin/);
  assert.equal((await t.call('/admin')).status, 404); assert.equal((await t.call('/admin/campaigns')).status, 404);
});

test('a team member lands on the team page, with campaigns, and has a link back to it from the console', async () => {
  await t.sql("INSERT INTO kv (k, v) VALUES ('config:admins', 'host@example.co.uk') ON CONFLICT (k) DO UPDATE SET v = excluded.v");
  const r = await login('host@example.co.uk'); assert.equal(r.headers.get('location'), '/admin');
  assert.equal((await login('host@example.co.uk', '/app/billing')).headers.get('location'), '/app/billing', 'a page they were going to still wins');
  const admin = await t.call('/admin'); assert.equal(admin.status, 200); assert.match(admin.body, /href="\/admin\/campaigns"/); assert.match(admin.body, /Leads and accounts/);
  assert.equal((await t.call('/admin/campaigns')).status, 200);
  assert.match((await t.call('/app')).body, /Open the team admin/);
});

test('the team overview says what is missing before launch, and that emails are being held, not sent', async () => {
  await t.sql("INSERT INTO kv (k, v) VALUES ('config:admins', 'host@example.co.uk') ON CONFLICT (k) DO UPDATE SET v = excluded.v");
  await login('host@example.co.uk');
  const held = (await t.sql("SELECT count(*) AS n FROM outbox WHERE status = 'test'"))[0].n;
  const admin = (await t.call('/admin')).body;
  assert.match(admin, /Not ready for paying hosts yet/);
  assert.match(admin, /Email is not switched on/);
  if (+held) assert.match(admin, new RegExp(held + ' emails? held so far'));
  assert.match(admin, /<b>Stripe<\/b>/);
});
