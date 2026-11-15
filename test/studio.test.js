// The Site builder and funnel creator: design (by rules without a key, by a stand-in Claude with one), design checks,
// preview, publish, the public site, and a funnel that adds a guest to the list.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');
const D = require('../server/studio/design');

test('every art direction passes its own contrast checks', () => {
  for (const k of Object.keys(D.DIRECTIONS)) {
    const p = D.palette(k);
    assert.ok(D.contrast(p.ink, p.bg) >= 7, k + ' body text');
    assert.ok(D.contrast(p.muted, p.bg) >= 4.5, k + ' muted text');
    assert.ok(D.contrast(p.accentInk, p.accent) >= 4.5, k + ' buttons');
    assert.ok(D.contrast(p.accentText, p.bg) >= 4.5, k + ' accent text');
  }
  // an accent that would fail is refused
  assert.equal(D.palette('linen', '#F5F0E0').accent, D.DIRECTIONS.linen.pal.accent);
});

let t;
test.before(async () => { t = await start(); await t.signup(); });
test.after(() => t.stop());

test('designs, previews and publishes a site without an AI key, then serves it to guests', async () => {
  const { p, url } = await t.home();
  await t.act('updateProperty', p.id, { about: 'A whitewashed cottage two streets from the harbour. Gulls at breakfast, fish and chips on the pier.', amenities: ['Sea view', 'Wood burner', 'Fast Wi-Fi'], guide: ['Whitby Abbey | 10 min walk | Go at dusk'] });
  const g = await t.call('/api/studio/generate', { body: { propertyId: p.id, brief: { vibe: 'coastal' } } });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  const spec = g.body.spec;
  assert.equal(spec.direction, 'harbour'); assert.equal(spec.by, 'rules');
  assert.equal(spec.sections[0].type, 'hero'); assert.equal(spec.sections[0].variant, 'type', 'no photos, so a type-led hero');
  assert.ok(spec.sections.some(s => s.type === 'book') && spec.sections.some(s => s.type === 'area'));
  assert.ok(spec.qa.length >= 10);
  // preview is the real page, not indexed
  const pv = await t.call('/app/studio/' + p.id);
  assert.equal(pv.status, 200); assert.match(pv.body, /DM\+Serif\+Display/); assert.match(pv.body, /noindex/); assert.match(pv.body, /Whitby Abbey/);
  // edits: switch direction, change the headline
  const e = await t.call('/api/studio/edit', { body: { propertyId: p.id, patch: { direction: 'nocturne', copy: { headline: 'Gulls at *breakfast*' } } } });
  assert.equal(e.status, 200); assert.equal(e.body.spec.direction, 'nocturne'); assert.equal(e.body.spec.copy.headline, 'Gulls at *breakfast*');
  // before publishing the guest still gets the standard site
  let pubPage = await fetch(url).then(r => r.text()); assert.doesNotMatch(pubPage, /Italiana/);
  const pb = await t.call('/api/studio/publish', { body: { propertyId: p.id } }); assert.equal(pb.status, 200);
  pubPage = await fetch(url).then(r => r.text());
  assert.match(pubPage, /Italiana/); assert.match(pubPage, /Gulls at <em>breakfast<\/em>/); assert.match(pubPage, /application\/ld\+json/, 'keeps structured data');
  assert.doesNotMatch(pubPage, /noindex/); assert.match(pubPage, /"book":\{"url":"\/api\/public\//);
  // undo goes back to the previous draft
  const u = await t.call('/api/studio/undo', { body: { propertyId: p.id } }); assert.equal(u.status, 200);
  assert.equal(u.body.state.studio.sites[p.id].draft.direction, 'harbour');
  // switching it off brings the standard site back
  await t.call('/api/studio/publish', { body: { propertyId: p.id, off: true } });
  assert.doesNotMatch(await fetch(url).then(r => r.text()), /Italiana/);
});

test('a live funnel takes a sign-up into the guest list and its code works', async () => {
  const { slug } = await t.home();
  const c = await t.call('/api/funnels/create', { body: { template: 'comeback', pct: 15 } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const fn = c.body.funnel; assert.equal(fn.code, 'WELCOMEBACK15'); assert.deepEqual(fn.steps, ['optin', 'thanks']);
  assert.equal(c.body.state.promos.WELCOMEBACK15, 15);
  const link = t.base + '/f/' + slug + '/' + fn.id;
  assert.equal((await fetch(link)).status, 404, 'drafts are not public');
  await t.call('/api/funnels/edit', { body: { id: fn.id, patch: { status: 'live' } } });
  const page = await fetch(link, { headers: { 'user-agent': 'Mozilla/5.0' } }); assert.equal(page.status, 200); assert.match(await page.text(), /<form class="fn-form"/);
  const post = await fetch(link + '/optin', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: t.base }, body: 'name=Ada&email=ada%40example.co.uk&consent=1' });
  assert.equal(post.status, 303); assert.match(post.headers.get('location'), /\/thanks$/);
  const thanks = await fetch(link + '/thanks').then(r => r.text()); assert.match(thanks, /WELCOMEBACK15/); assert.match(thanks, /promo=WELCOMEBACK15/);
  const st = (await t.call('/api/state')).body.state;
  const g = st.guests.find(x => x.email === 'ada@example.co.uk'); assert.ok(g && g.subscribed); assert.ok(g.tags.some(x => /^Funnel:/.test(x)));
  const f2 = st.studio.funnels.find(x => x.id === fn.id); assert.equal(f2.stats.leads, 1); assert.equal(f2.stats.views.optin, 1);
  // without consent the guest is kept but not subscribed
  await fetch(link + '/optin', { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: t.base }, body: 'name=Bo&email=bo%40example.co.uk' });
  assert.equal((await t.call('/api/state')).body.state.guests.find(x => x.email === 'bo@example.co.uk').subscribed, false);
});

test('with a key, Claude art-directs the site and is sent back once when a design check fails', async () => {
  const calls = [];
  const reply = n => ({ rationale: 'Harbour light suits it.', direction: 'harbour', accent: '#0B5D78', heroVariant: 'type',
    sections: [{ type: 'hero', variant: 'type' }, { type: 'facts', variant: 'ruled' }, { type: 'story', variant: 'pull' }, { type: 'highlights', variant: 'numbered' }, { type: 'faq', variant: 'accordion' }, { type: 'book', variant: 'panel' }, { type: 'closing', variant: 'banner' }],
    copy: { wordmark: 'Gull', tagline: 'Whitby · harbour', headline: n === 1 ? 'A stunning cottage that is nestled right by the harbour wall in Whitby' : 'Gulls at *breakfast*', subhead: 'Two streets from the harbour.', cta: 'Check dates',
      storyEyebrow: '', storyTitle: '', story: ['Para one.', 'Para two.'], pull: 'Fish and chips on the pier.', highlightsEyebrow: '', highlightsTitle: '', highlights: [{ eyebrow: 'a', title: 'Sea view', text: 'From the bedroom.' }, { eyebrow: 'b', title: 'Wood burner', text: 'For cold nights.' }, { eyebrow: 'c', title: 'Fast Wi-Fi', text: 'Good enough to work.' }],
      galleryEyebrow: '', galleryTitle: '', amenitiesEyebrow: '', amenitiesTitle: '', reviewsEyebrow: '', reviewsTitle: '', areaEyebrow: '', areaTitle: '', areaIntro: '', hostEyebrow: '', hostNote: 'Invented note', bookEyebrow: '', bookTitle: '', bookText: '', faqEyebrow: '', faqTitle: '', closing: '', footerLine: '', seoTitle: 'Gull Cottage · Whitby harbour cottage', seoDescription: 'Sleeps 4 two streets from Whitby harbour. Book direct from £140 a night with no platform fees, and talk to your host directly.' } });
  const mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { calls.push(JSON.parse(raw)); s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(reply(calls.length)) }] })); }); }).listen(0);
  const t2 = await start({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_API_BASE: 'http://localhost:' + mock.address().port });
  try {
    await t2.signup(); const { p } = await t2.home();
    const g = await t2.call('/api/studio/generate', { body: { propertyId: p.id, brief: { vibe: 'coastal', notes: 'Families with dogs' } } });
    assert.equal(g.status, 200, JSON.stringify(g.body));
    assert.equal(calls.length, 2, 'failed headline and cliché checks are sent back once');
    assert.match(calls[1].messages[0].content.slice(-1)[0].text, /failed these design checks/);
    assert.equal(calls[0].model, 'claude-opus-5-5'); assert.equal(calls[0].output_config.format.type, 'json_schema');
    assert.match(calls[0].system, /Fell & Slate/); assert.match(calls[0].messages[0].content.slice(-1)[0].text, /Families with dogs/);
    const spec = g.body.spec; assert.equal(spec.by, 'ai'); assert.equal(spec.copy.headline, 'Gulls at *breakfast*'); assert.equal(spec.accent, '#0B5D78');
    assert.equal(spec.copy.hostNote, '', 'the AI never invents a host note');
    const types = spec.sections.map(s => s.type); assert.ok(types.indexOf('book') < types.indexOf('faq'), 'booking before FAQ'); assert.equal(types[types.length - 1], 'closing');
    assert.ok(spec.qa.every(x => x.ok || /photo/i.test(x.label)), JSON.stringify(spec.qa.filter(x => !x.ok)));
  } finally { t2.stop(); mock.close(); }
});

test('the demo can use the builder too', async () => {
  const r = await fetch(t.base + '/demo'); const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const g = await fetch(t.base + '/api/demo/studio/generate', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: t.base }, body: JSON.stringify({ propertyId: 'laurel', brief: {} }) });
  assert.equal(g.status, 200); assert.equal((await g.json()).spec.direction, 'fell');
  const pv = await fetch(t.base + '/demo/studio/laurel', { headers: { cookie } }); assert.equal(pv.status, 200); assert.match(await pv.text(), /Fraunces/);
});
