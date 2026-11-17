// Search engine submission with no host login: our service account verifies each site with a meta tag we serve,
// adds it to Search Console, submits the sitemap and reads back clicks and searches. Run against a stand-in Google.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');

const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'bb-search@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
let mock, t; const calls = [];
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    calls.push({ m: q.method, u: q.url, body: raw }); const send = (j, st) => { s.writeHead(st || 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(j)); };
    if (q.url === '/token') { const a = new URLSearchParams(raw).get('assertion').split('.'); const ok = crypto.verify('RSA-SHA256', Buffer.from(a[0] + '.' + a[1]), publicKey, Buffer.from(a[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64')); return ok ? send({ access_token: 'tok', expires_in: 3600 }) : send({ error: 'invalid_grant' }, 400); }
    if (q.headers.authorization !== 'Bearer tok') return send({ error: { message: 'unauthorised' } }, 401);
    if (q.url === '/siteVerification/v1/token') return send({ method: 'META', token: '<meta name="google-site-verification" content="abcDEF123_-xyz" />' });
    if (q.url.startsWith('/siteVerification/v1/webResource')) return send({ id: 'x', owners: [SA.client_email] });
    if (q.url.endsWith('/searchAnalytics/query')) return send(JSON.parse(raw).dimensions ? { rows: [{ keys: ['cottage whitby'], clicks: 4, impressions: 120, position: 8.24 }] } : { rows: [{ clicks: 9, impressions: 410, ctr: 0.022, position: 11.3 }] });
    if (q.url.startsWith('/webmasters/v3/sites/')) return send({});
    send({ error: { message: 'unknown ' + q.url } }, 404);
  }); }).listen(0);
  const base = 'http://localhost:' + mock.address().port;
  t = await start({ GOOGLE_SERVICE_ACCOUNT_JSON: Buffer.from(JSON.stringify(SA)).toString('base64'), GOOGLE_OAUTH_URL: base + '/token', GOOGLE_API_BASE: base });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('a host site is verified, submitted to Search Console and reports clicks, with no host login', async () => {
  const { p, url } = await t.home();
  const r = await t.call('/api/seo/submit', { body: { propertyId: p.id } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  const ix = r.body.state.properties[0].indexing;
  assert.equal(ix.google.state, 'submitted', JSON.stringify(ix));
  assert.equal(ix.google.sitemap, new URL(url).origin + '/s/' + new URL(url).pathname.split('/')[2] + '/sitemap.xml');
  assert.equal(ix.perf.clicks, 9); assert.equal(ix.perf.ctr, 2.2); assert.deepEqual(ix.perf.queries[0], { q: 'cottage whitby', clicks: 4, impressions: 120, position: 8.2 });
  // the site's address is verified with a meta tag on its home page (here the main domain, which hosts /s/ sites)
  const home = await (await fetch(t.base + '/')).text();
  assert.match(home, /<meta name="google-site-verification" content="abcDEF123_-xyz">/);
  const prop = encodeURIComponent(new URL(url).origin + '/');
  assert.ok(calls.some(c => c.m === 'PUT' && c.u === '/webmasters/v3/sites/' + prop));
  assert.ok(calls.some(c => c.m === 'PUT' && c.u.startsWith('/webmasters/v3/sites/' + prop + '/sitemaps/')));
  // a second run does not verify again
  const before = calls.filter(c => c.u.startsWith('/siteVerification')).length;
  await t.call('/api/seo/submit', { body: { propertyId: p.id } });
  assert.equal(calls.filter(c => c.u.startsWith('/siteVerification')).length, before);
  // hosts cannot write the results themselves
  assert.equal((await t.act('setIndexing', p.id, { google: { state: 'submitted' } })).status, 403);
});
