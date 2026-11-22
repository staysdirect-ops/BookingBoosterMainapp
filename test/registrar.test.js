// Buying a new domain at sign-up, through a pretend 20i reseller API: availability, registration in the host's name,
// pointing it at the site with the padlock on, and renewing it each year while the plan is paid.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

const KEY = 'test-20i-general-key';
const TAKEN = new Set(['taken-cottage.co.uk']);
const calls = [];
let fake, t;

test.before(async () => {
  fake = http.createServer((req, res) => {
    let b = ''; req.on('data', c => b += c); req.on('end', () => {
      const body = b ? JSON.parse(b) : null; calls.push({ method: req.method, path: decodeURIComponent(req.url), auth: req.headers.authorization, body });
      const send = v => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
      if (req.headers.authorization !== 'Bearer ' + Buffer.from(KEY).toString('base64')) { res.writeHead(401); return res.end('{"error":"auth"}'); }
      if (req.url.startsWith('/domain-search/')) return send(decodeURIComponent(req.url.slice(15)).split(',').map(name => ({ type: 'result', name, can: TAKEN.has(name) ? 'transfer' : 'register' })));
      if (req.url === '/reseller/*/addDomain') { TAKEN.add(body.name); return send(true); }
      if (req.url === '/reseller/*/renewDomain') return send(true);
      if (/^\/package\/pkg-1\/(names|web\/freeSSL)$/.test(req.url)) return send({ result: true });
      res.writeHead(404); res.end('{}');
    });
  }).listen(0);
  t = await start({ TWENTYI_API_KEY: KEY, TWENTYI_API_BASE: 'http://127.0.0.1:' + fake.address().port, TWENTYI_PACKAGE_ID: 'pkg-1', JOBS_KEY: 'jk' });
});
test.after(() => { t.stop(); fake.close(); });

const reg = { address: '1 Harbour Steps', city: 'Whitby', postcode: 'yo21 3pu', phone: '07700 900123' };
const join = (domain, extra) => t.signup(Object.assign({ domainMode: 'new', registrant: reg,
  property: { name: 'Gull Cottage', theme: 'lake', nightly: 140, maxGuests: 4, bedrooms: 2, area: 'Whitby, North Yorkshire', domain } }, extra));

test('the sign-up page checks real availability, and only offers the endings we register', async () => {
  const boot = await t.call('/start'); assert.match(boot.body, /"domainOffer":\{"live":true/);
  const r = (await t.call('/api/domains/search?names=gullcottage.co.uk,taken-cottage.co.uk,gull.io,a.b.co.uk')).body;
  assert.equal(r.live, true);
  assert.deepEqual(r.results, [{ d: 'gullcottage.co.uk', ok: true }, { d: 'taken-cottage.co.uk', ok: false }]);
  assert.equal(calls.at(-1).path, '/domain-search/gullcottage.co.uk,taken-cottage.co.uk');
});

test('a new domain needs the owner’s address, and a taken one is refused before an account is made', async () => {
  let r = await join('gullcottage.co.uk', { registrant: { address: '1 Harbour Steps' } });
  assert.equal(r.status, 400); assert.match(r.body.error, /town/);
  r = await join('taken-cottage.co.uk'); assert.equal(r.status, 409); assert.match(r.body.error, /taken/);
  r = await join('gullcottage.io'); assert.equal(r.status, 400); assert.match(r.body.error, /\.co\.uk/);
  assert.equal((await t.sql('SELECT count(*)::int AS n FROM users'))[0].n, 0);
});

test('after sign-up the domain is registered in the host’s name, pointed at the site and given a padlock', async () => {
  const r = await join('gullcottage.co.uk'); assert.equal(r.status, 200, JSON.stringify(r.body));
  const row = await t.until(async () => { const x = (await t.sql('SELECT * FROM registrations WHERE host = ?', 'gullcottage.co.uk'))[0]; return x && x.status === 'active' && x; });
  assert.ok(row, 'registered');
  const add = calls.find(c => c.path === '/reseller/*/addDomain');
  assert.equal(add.body.name, 'gullcottage.co.uk'); assert.equal(add.body.years, 1);
  assert.deepEqual(add.body.contact, { name: 'Test Host', organisation: 'Test Stays', email: 'host@example.co.uk', address: '1 Harbour Steps', city: 'Whitby', sp: '', pc: 'YO21 3PU', cc: 'GB', telephone: '+44.7700900123', extension: { type: 'IND' } });
  assert.deepEqual(await t.until(() => calls.find(c => c.path === '/package/pkg-1/names')).then(c => c.body), { add: ['gullcottage.co.uk'] });
  assert.deepEqual((await t.until(() => calls.find(c => c.path === '/package/pkg-1/web/freeSSL'))).body, { name: 'gullcottage.co.uk', enabled: true });
  assert.ok(Math.abs(Number(row.expires_at) - Date.now() - 365 * 864e5) < 60e3);
  const d = (await t.sql('SELECT * FROM domains WHERE host = ?', 'gullcottage.co.uk'))[0];
  assert.equal(d.verified, 1, 'no TXT proof needed for a domain we bought');
  const { p } = await t.home(); assert.equal((await t.call('/api/state')).body.siteUrls[p.id], 'https://gullcottage.co.uk/');
  assert.equal((await t.call('/tls/ask?domain=gullcottage.co.uk')).status, 200);
});

test('it is renewed when it is close to running out, and lapses once the plan has ended', async () => {
  await t.sql("UPDATE registrations SET expires_at = ? WHERE host = 'gullcottage.co.uk'", Date.now() + 10 * 864e5);
  await t.sql("UPDATE kv SET v = '{}' WHERE k = 'jobs:last'");
  assert.equal((await t.call('/jobs/tick', { body: {}, headers: { 'x-jobs-key': 'jk' } })).status, 200);
  const renew = calls.find(c => c.path === '/reseller/*/renewDomain'); assert.ok(renew, 'renewed');
  assert.equal(renew.body.name, 'gullcottage.co.uk'); assert.equal(renew.body.years, 1);
  const row = (await t.sql("SELECT * FROM registrations WHERE host = 'gullcottage.co.uk'"))[0];
  assert.ok(Number(row.expires_at) > Date.now() + 370 * 864e5);

  await t.sql("UPDATE workspaces SET billing_status = 'cancelled'");
  await t.sql("UPDATE registrations SET expires_at = ? WHERE host = 'gullcottage.co.uk'", Date.now() - 864e5);
  await t.sql("UPDATE kv SET v = '{}' WHERE k = 'jobs:last'");
  const before = calls.filter(c => c.path === '/reseller/*/renewDomain').length;
  await t.call('/jobs/tick', { body: {}, headers: { 'x-jobs-key': 'jk' } });
  assert.equal(calls.filter(c => c.path === '/reseller/*/renewDomain').length, before, 'not renewed for a cancelled plan');
  assert.equal((await t.sql("SELECT status FROM registrations WHERE host = 'gullcottage.co.uk'"))[0].status, 'lapsed');
});
