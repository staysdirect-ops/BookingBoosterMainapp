// Search health on a real account: the audit, the SEO fields a host can set, and what crawlers and AI assistants get.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');
const { Workspace, seedDemo } = require('../server/engine');

let t;
test.before(async () => { t = await start(); await t.signup(); await t.launch(); });
test.after(() => t.stop());

test('the audit scores every kind of search work and orders the fixes', () => {
  const w = new Workspace('demo', seedDemo()); const BB = w.BB; const p = w.state.properties[0];
  const a = BB.seo.audit(p);
  assert.deepEqual(a.cats.map(c => c.id), ['onpage', 'content', 'technical', 'local', 'media', 'sxo', 'aeo', 'geo', 'llmo', 'aio']);
  assert.ok(a.score > 0 && a.score < 100);
  assert.ok(a.fixes.length > 0 && a.fixes.every((f, i) => i === 0 || a.fixes[i - 1].gain >= f.gain), 'fixes are ordered by gain');
  assert.ok(a.checks.some(c => c.status === 'auto'), 'some checks are handled for the host');
  const before = a.score;
  w.run('updateSeo', [p.id, { summary: BB.seo.draft(p, 'summary'), sameAs: ['https://www.airbnb.co.uk/rooms/1', 'https://www.instagram.com/larchfell/', 'https://www.visitlakedistrict.com/x'] }]);
  assert.ok(BB.seo.audit(w.state.properties[0]).score > before, 'fixing things raises the score');
  // ideas built from the home's facts
  assert.ok(BB.seo.keywords(p).some(k => /hot tub/.test(k.q)));
  assert.ok(BB.seo.faqIdeas(p).some(f => /dog/i.test(f.q) && /£35/.test(f.a)));
});

test('SEO fields are cleaned before they are saved', async () => {
  const { p } = await t.home();
  const r = await t.act('updateSeo', p.id, { summary: 'A 2-bedroom cottage in Whitby.', sameAs: ['https://www.airbnb.co.uk/rooms/9', 'javascript:alert(1)', 'http://plain.example'], videoUrl: 'https://evil.example/v', gbp: { claim: true, nope: true }, role: 'admin' });
  assert.equal(r.status, 200);
  const seo = r.body.state.properties[0].seo;
  assert.deepEqual(seo.sameAs, ['https://www.airbnb.co.uk/rooms/9']);
  assert.equal(seo.videoUrl, ''); assert.deepEqual(seo.gbp, { claim: true }); assert.equal(seo.role, undefined);
  assert.equal((await t.act('setMapPin', p.id, 54.486, -0.615)).status, 200);
  assert.equal((await t.act('addFaqs', p.id, [{ q: 'Is there parking?', a: 'Yes, one space.' }, { q: 'Is there parking?', a: 'Twice' }])).body.result, 1);
  assert.equal((await t.act('trackAiQuestions', p.id, ['cottage with sea view whitby'])).body.result, 1);
});

test('the site, llms.txt and sitemap carry the new facts and schema', async () => {
  const { p, url } = await t.home();
  await t.act('updateSeo', p.id, { areaIntro: 'The harbour and the abbey steps are a short walk away.', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' });
  const html = await (await fetch(url)).text();
  assert.match(html, /<p id="summary">A 2-bedroom cottage in Whitby\.<\/p>/);
  assert.match(html, /Things to do near/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
  const types = ld['@graph'].map(n => n['@type']);
  for (const k of ['VacationRental', 'LodgingBusiness', 'WebPage', 'BreadcrumbList', 'FAQPage']) assert.ok(types.includes(k), k);
  const rental = ld['@graph'][0];
  assert.deepEqual(rental.sameAs, ['https://www.airbnb.co.uk/rooms/9']); assert.equal(rental.geo.latitude, 54.486); assert.equal(rental.subjectOf['@type'], 'VideoObject');
  const llms = await (await fetch(url + '/llms.txt')).text();
  assert.match(llms, /## In short/); assert.match(llms, /## Nearby/); assert.match(llms, /airbnb\.co\.uk\/rooms\/9/);
  const slug = new URL(url).pathname.split('/')[2];
  const sm = await (await fetch(t.base + '/s/' + slug + '/sitemap.xml')).text();
  assert.match(sm, /xmlns:image/);
});

test('console tools: crawler files, drafts without a key, IndexNow key file', async () => {
  const { p, url } = await t.home();
  const f = await t.call('/api/seo/files?propertyId=' + p.id);
  assert.equal(f.status, 200); assert.ok(f.body.jsonld['@graph'].length >= 5); assert.match(f.body.llms, /^# Gull Cottage/);
  const key = f.body.keyUrl.split('/').pop().replace('.txt', '');
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(await (await fetch(f.body.keyUrl)).text(), key);
  // No Claude key on the test server: the console falls back to drafts from the home's facts.
  const d = await t.call('/api/seo/write', { body: { propertyId: p.id, what: 'summary' } });
  assert.equal(d.status, 200); assert.equal(d.body.draft, null); assert.equal(d.body.by, 'rules');
  assert.equal((await t.call('/api/seo/write', { body: { propertyId: p.id, what: 'nonsense' } })).status, 400);
  // A local test address cannot be crawled, so the ping says so instead of calling out.
  const ping = await t.call('/api/seo/ping', { body: { propertyId: p.id } });
  assert.equal(ping.status, 200); assert.equal(ping.body.ok, false); assert.match(ping.body.message, /local test address/);
  assert.ok(url);
});
