// Our own site's search and AI visibility: the explainer and checklist pages, llms-full.txt and the IndexNow key file.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t;
test.before(async () => { t = await start(); });
test.after(() => t.stop());

test('the SEO explainer defines every type, with structured data', async () => {
  const r = await t.call('/seo-for-holiday-lets'); assert.equal(r.status, 200);
  for (const n of ['On-page SEO', 'Off-page SEO', 'Technical SEO', 'Local SEO', 'Content SEO', 'Image and video SEO', 'SXO', 'AEO', 'GEO', 'LLMO', 'AIO', 'AI SEO', 'Ecommerce SEO', 'International SEO', 'ASO']) assert.match(r.body, new RegExp(n.replace(/[()]/g, '\\$&')), n);
  const ld = JSON.parse(r.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  const types = ld['@graph'].map(n => n['@type']);
  assert.ok(types.includes('DefinedTermSet') && types.includes('FAQPage') && types.includes('BreadcrumbList'));
  assert.equal(ld['@graph'].find(n => n['@type'] === 'DefinedTermSet').hasDefinedTerm.length, 15);
  assert.ok(ld['@graph'][0].speakable);
});

test('the checklist page, sitemap, llms.txt and llms-full.txt', async () => {
  const c = await t.call('/holiday-let-seo-checklist'); assert.equal(c.status, 200); assert.match(c.body, /Google Business Profile/);
  const sm = await t.call('/sitemap.xml'); assert.match(sm.body, /\/seo-for-holiday-lets</); assert.match(sm.body, /\/holiday-let-seo-checklist</);
  const l = await t.call('/llms.txt'); assert.match(l.body, /## Search and AI visibility for hosts/); assert.match(l.body, /llms-full\.txt/);
  const full = await t.call('/llms-full.txt'); assert.equal(full.status, 200);
  assert.match(full.body, /# SEO, AEO, GEO and AI search for holiday lets/); assert.match(full.body, /# The holiday let SEO and AI search checklist/); assert.doesNotMatch(full.body, /<[a-z]+[ >]/);
  const home = await t.call('/'); const ld = JSON.parse(home.body.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  assert.ok(ld['@graph'].some(n => n['@type'] === 'SoftwareApplication'));
  assert.ok(ld['@graph'].find(n => n['@type'] === 'Organization').knowsAbout.includes('Generative engine optimisation'));
});

test('a made-up IndexNow key file is not served', async () => {
  const bad = await t.call('/0123456789abcdef0123456789abcdef.txt'); assert.notEqual(bad.status, 200);
});
