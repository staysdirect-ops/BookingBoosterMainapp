// A host's own website hosted elsewhere: we give a snippet and DNS records, then verify the site with Google and Bing
// through our own accounts and submit its sitemap. Run against a stand-in Google and Bing.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const crypto = require('node:crypto');
const start = require('./harness');
const own = require('../server/own-site');

const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { client_email: 'bb@test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) };
let mock, t; const calls = []; const sites = [];
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const u = new URL(q.url, 'http://x'), body = raw && raw[0] === '{' ? JSON.parse(raw) : {}; calls.push({ m: q.method, u: q.url, body });
    const send = (j, st) => { s.writeHead(st || 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(j)); };
    if (u.pathname === '/token') return send({ access_token: 'tok', expires_in: 3600 });
    if (u.pathname === '/siteVerification/v1/token') return send(body.verificationMethod === 'DNS_TXT' ? { token: 'google-site-verification=dnsTXT123' } : { token: '<meta name="google-site-verification" content="metaG123" />' });
    if (u.pathname === '/siteVerification/v1/webResource') return u.searchParams.get('verificationMethod') === 'META' ? send({ error: { message: 'not found on page' } }, 400) : send({ id: 'x' });
    if (u.pathname.startsWith('/webmasters/v3/sites/')) return send({});
    if (u.pathname === '/bing/GetUserSites') return send({ d: sites });
    if (u.pathname === '/bing/AddSite') { sites.push({ Url: body.siteUrl, AuthenticationCode: 'B1NGC0DE', IsVerified: false }); return send({ d: null }); }
    if (u.pathname === '/bing/VerifySite') return send({ d: false });
    send({ d: null });
  }); }).listen(0);
  const base = 'http://localhost:' + mock.address().port;
  t = await start({ GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify(SA), GOOGLE_OAUTH_URL: base + '/token', GOOGLE_API_BASE: base, BING_WEBMASTER_API_KEY: 'k', BING_API_BASE: base + '/bing' });
  await t.signup(); await t.launch(); // indexing waits for the site to go live
});
test.after(() => { t.stop(); mock.close(); });

test('only public https addresses are accepted', () => {
  assert.equal(own.originOf('https://www.MyCottage.co.uk/about?x=1'), 'https://www.mycottage.co.uk');
  for (const bad of ['http://mycottage.co.uk', 'https://localhost', 'https://10.0.0.1', 'https://mycottage.co.uk:8443', 'javascript:alert(1)', 'https://intranet']) assert.equal(own.originOf(bad), '', bad);
});

test('a site hosted elsewhere gets a snippet and DNS records, then is verified and submitted', async () => {
  const { p, url } = await t.home();
  assert.equal((await t.act('updateSeo', p.id, { ownSite: 'https://www.gullcottage.co.uk/' })).status, 200);
  const k = await t.call('/api/seo/own-site?propertyId=' + p.id);
  assert.equal(k.status, 200, JSON.stringify(k.body));
  assert.equal(k.body.origin, 'https://www.gullcottage.co.uk');
  assert.match(k.body.snippet, /<meta name="google-site-verification" content="metaG123">/);
  assert.match(k.body.snippet, /<meta name="msvalidate\.01" content="B1NGC0DE">/);
  assert.match(k.body.snippet, /llms\.txt/);
  const ld = JSON.parse(k.body.snippet.match(/<script type="application\/ld\+json">(.+)<\/script>/)[1]);
  const rental = ld['@graph'].find(n => n['@type'] === 'VacationRental');
  assert.equal(rental.url, 'https://www.gullcottage.co.uk/'); assert.equal(rental.potentialAction.target.urlTemplate, url); assert.ok(rental.sameAs.includes(url));
  assert.ok(!ld['@graph'].some(n => n['@type'] === 'FAQPage'), 'no FAQ markup for questions the page may not show');
  assert.deepEqual(k.body.dns, [{ engine: 'Google', type: 'TXT', name: '@ (gullcottage.co.uk)', value: 'google-site-verification=dnsTXT123' }, { engine: 'Bing', type: 'CNAME', name: 'B1NGC0DE', value: 'verify.bing.com' }]);
  // The host added the Google DNS record; Bing has not seen anything yet.
  const r = await t.call('/api/seo/submit', { body: { propertyId: p.id } });
  const ix = r.body.state.properties[0].indexing.own;
  assert.equal(ix.origin, 'https://www.gullcottage.co.uk');
  assert.equal(ix.google, 'submitted'); assert.equal(ix.bing, 'verifying');
  assert.ok(calls.some(c => c.m === 'PUT' && c.u === '/webmasters/v3/sites/' + encodeURIComponent('sc-domain:gullcottage.co.uk')), 'domain property after DNS verification');
  assert.ok(calls.some(c => c.m === 'PUT' && c.u.startsWith('/webmasters/v3/sites/' + encodeURIComponent('sc-domain:gullcottage.co.uk') + '/sitemaps/' + encodeURIComponent('https://www.gullcottage.co.uk/sitemap.xml'))));
  // Removing the address stops it.
  await t.act('updateSeo', p.id, { ownSite: '' });
  assert.equal((await t.call('/api/seo/own-site?propertyId=' + p.id)).status, 400);
});
