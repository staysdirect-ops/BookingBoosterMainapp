// Daily database backups, and the team-only download.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const start = require('./harness');

let t;
test.before(async () => { t = await start({ ADMIN_EMAILS: 'host@example.co.uk' }); await t.signup(); });
test.after(() => t.stop());

test('the team can download a full copy of the database', async () => {
  const r = await fetch(t.base + '/admin/backup', { headers: { cookie: t.cookie } });
  assert.equal(r.status, 200); assert.match(r.headers.get('content-disposition'), /bookingbooster-\d{4}-\d{2}-\d{2}\.json/);
  const j = await r.json(); assert.equal(j.tables.users.length, 1); assert.equal(j.tables.workspaces.filter(w => w.kind === 'live').length, 1);
  assert.ok(j.tables.users[0].pass, 'a full copy, for the team only');
  assert.equal((await fetch(t.base + '/admin/backup')).status, 404, 'not for the public');
});
