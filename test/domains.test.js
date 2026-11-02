// A host's own domain: it only goes live once DNS points at us and a TXT record proves it belongs to this account.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const start = require('./harness');

const dnsFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-dns-')), 'dns.json');
const setDns = o => fs.writeFileSync(dnsFile, JSON.stringify(o));
let t;
const get = (host, p) => new Promise((res, rej) => http.get({ host: 'localhost', port: t.port, path: p || '/', headers: { host } }, r => { let b = ''; r.on('data', c => b += c); r.on('end', () => res({ status: r.statusCode, body: b, location: r.headers.location })); }).on('error', rej));

test.before(async () => { setDns({}); t = await start({ ALLOW_TEST_CLOCK: '1', DNS_FAKE_FILE: dnsFile, CUSTOM_DOMAIN_TARGET: 'sites.booking-booster.co.uk', CUSTOM_DOMAIN_IPS: '203.0.113.7' }); await t.signup(); });
test.after(() => t.stop());

test('a domain stays offline until its records are in place, then goes live', async () => {
  const { p } = await t.home();
  assert.equal((await t.call('/app/domain', { body: { propertyId: p.id, domain: 'not a domain' } })).status, 400);
  assert.equal((await t.call('/app/domain', { body: { propertyId: p.id, domain: 'x.booking-booster.co.uk' } })).status, 400);
  const r = await t.call('/app/domain', { body: { propertyId: p.id, domain: 'https://www.Gull-Cottage.co.uk/book' } });
  assert.equal(r.status, 200); const d = r.body.domain;
  assert.equal(d.domain, 'gull-cottage.co.uk'); assert.equal(d.live, false);
  const txt = d.records.find(x => x.type === 'TXT'); assert.match(txt.value, /^bb-verify=\w{20,}$/);
  assert.deepEqual(d.records.map(x => x.type), ['TXT', 'CNAME', 'A']);
  assert.equal((await get('gull-cottage.co.uk')).status, 404, 'not served before it is proved');
  assert.equal((await t.call('/tls/ask?domain=gull-cottage.co.uk')).status, 404);

  // pointing alone is not enough
  setDns({ 'www.gull-cottage.co.uk': { cname: ['sites.booking-booster.co.uk.'] }, 'gull-cottage.co.uk': { a: ['203.0.113.7'] } });
  assert.equal((await t.call('/app/domain/check', { body: { propertyId: p.id } })).body.domain.live, false);

  setDns({ 'www.gull-cottage.co.uk': { cname: ['sites.booking-booster.co.uk.'] }, 'gull-cottage.co.uk': { a: ['203.0.113.7'] }, '_bookingbooster.gull-cottage.co.uk': { txt: [txt.value] } });
  const c = (await t.call('/app/domain/check', { body: { propertyId: p.id } })).body;
  assert.equal(c.domain.live, true); assert.ok(c.domain.records.every(x => x.ok));
  assert.equal(c.siteUrls[p.id], 'https://gull-cottage.co.uk/');
  const site = await get('gull-cottage.co.uk'); assert.equal(site.status, 200); assert.match(site.body, /Gull Cottage/);
  assert.equal((await get('www.gull-cottage.co.uk', '/book')).location, 'https://gull-cottage.co.uk/book');
  assert.equal((await t.call('/tls/ask?domain=www.gull-cottage.co.uk')).status, 200);
  assert.equal((await t.call('/tls/ask?domain=evil.example')).status, 404);

  // stop using it: back to the free address
  const off = (await t.call('/app/domain', { body: { propertyId: p.id, domain: '' } })).body;
  assert.notEqual(off.siteUrls[p.id], 'https://gull-cottage.co.uk/', JSON.stringify([off.error, off.state && off.state.properties[0].domain]));
  assert.doesNotMatch((await get('gull-cottage.co.uk')).body, /Gull Cottage/);
});
