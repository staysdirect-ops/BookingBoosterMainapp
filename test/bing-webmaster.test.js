// Bing Webmaster Tools with no host login: our API key adds each site, we serve Bing's code as a meta tag,
// verify it and submit the sitemap. Bing's index feeds ChatGPT search and Copilot. Run against a stand-in Bing.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');

let mock, t; const calls = []; const sites = []; let verifyOk = false;
test.before(async () => {
  mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const u = new URL(q.url, 'http://x'), name = u.pathname.replace(/^\//, ''), body = raw ? JSON.parse(raw) : {};
    calls.push({ name, body, key: u.searchParams.get('apikey') }); const send = (j, st) => { s.writeHead(st || 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(j)); };
    if (u.searchParams.get('apikey') !== 'bing-key') return send({ ErrorCode: 14, Message: 'NotAuthorized' }, 400);
    if (name === 'GetUserSites') return send({ d: sites });
    if (name === 'AddSite') { sites.push({ Url: body.siteUrl, AuthenticationCode: 'BING0123ABC', IsVerified: false }); return send({ d: null }); }
    if (name === 'VerifySite') { if (verifyOk) sites.forEach(x => { x.IsVerified = true; }); return send({ d: verifyOk }); }
    if (name === 'SubmitFeed' || name === 'SubmitUrlBatch') return send({ d: null });
    send({ ErrorCode: 0, Message: 'unknown ' + name }, 404);
  }); }).listen(0);
  t = await start({ BING_WEBMASTER_API_KEY: 'bing-key', BING_API_BASE: 'http://localhost:' + mock.address().port });
  await t.signup();
});
test.after(() => { t.stop(); mock.close(); });

test('a host site is added to Bing, verified with a meta tag we serve and its sitemap submitted', async () => {
  const { p, url } = await t.home();
  // Bing has not seen the tag yet: the site waits, and the tag is now on the home page
  let r = await t.call('/api/seo/submit', { body: { propertyId: p.id } });
  assert.equal(r.status, 200, JSON.stringify(r.body).slice(0, 300));
  assert.equal(r.body.state.properties[0].indexing.bing.state, 'verifying');
  assert.match(await (await fetch(t.base + '/')).text(), /<meta name="msvalidate\.01" content="BING0123ABC">/);
  assert.ok(!calls.some(c => c.name === 'SubmitFeed'), 'no sitemap before the site is verified');
  // next run Bing finds the tag: verified, sitemap and home page submitted
  verifyOk = true;
  r = await t.call('/api/seo/submit', { body: { propertyId: p.id } });
  const ix = r.body.state.properties[0].indexing;
  assert.equal(ix.bing.state, 'submitted', JSON.stringify(ix));
  const feed = calls.find(c => c.name === 'SubmitFeed');
  assert.equal(feed.body.siteUrl, new URL(url).origin + '/');
  assert.equal(feed.body.feedUrl, ix.bing.sitemap);
  assert.deepEqual(calls.find(c => c.name === 'SubmitUrlBatch').body.urlList, [url]);
  assert.equal(calls.filter(c => c.name === 'AddSite').length, 1, 'the site is added once');
});
