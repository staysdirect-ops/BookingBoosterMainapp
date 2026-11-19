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

test('every palette passes contrast checks, on the page, alternate and deep colours', () => {
  for (const k of Object.keys(D.PALETTES)) {
    const p = D.palette('linen', null, k);
    assert.ok(D.contrast(p.ink, p.bg) >= 7, k + ' body text'); assert.ok(D.contrast(p.ink, p.bg2) >= 7, k + ' body text on tint');
    assert.ok(D.contrast(p.muted, p.bg) >= 4.5, k + ' muted text'); assert.ok(D.contrast(p.muted, p.bg2) >= 4.5, k + ' muted text on tint');
    assert.ok(D.contrast(p.accentInk, p.accent) >= 4.5, k + ' buttons'); assert.ok(D.contrast(p.accentText, p.bg) >= 4.5, k + ' accent text');
    assert.ok(D.contrast(p.deepInk, p.deep) >= 7, k + ' deep bands'); assert.ok(D.contrast(p.accentDeep, p.deep) >= 4.5, k + ' accent on deep');
  }
  for (const [k, d] of Object.entries(D.DIRECTIONS)) { assert.ok(D.FONTS[d.font] && D.PALETTES[d.palette], k); d.alts.fonts.concat(d.alts.palettes).forEach(x => assert.ok(D.FONTS[x] || D.PALETTES[x], k + ' alt ' + x)); }
  for (const t of Object.values(D.TEMPLATES)) for (const [type, v] of Object.entries(t.v)) assert.ok(D.SECTIONS[type].includes(v), t.name + ' ' + type + ' ' + v);
});

test('style choices change the page, and every layout renders', () => {
  const render = require('../server/studio/render');
  const photos = [1, 2, 3, 4, 5, 6, 7].map(i => ({ url: 'https://example.com/' + i + '.jpg', cap: 'Photo ' + i }));
  const s = { account: { business: 'Stays', owner: 'Sam Carter' }, live: false, website: { faqs: {} }, integrations: [], guests: [{ id: 'g', name: 'Ann Lee' }],
    bookings: [1, 2, 3].map(i => ({ propertyId: 'h', guestId: 'g', review: { text: 'Lovely ' + i, stars: 5, at: '2026-0' + i + '-01' } })) };
  const p = { id: 'h', name: 'Test House', area: 'Keswick, Cumbria', nightly: 150, maxGuests: 4, bedrooms: 2, baths: 1, checkinTime: '4pm', checkoutTime: '10am', photos, amenities: ['Hot tub'], guide: ['Pub | 5 min | Good'], hostNote: 'Hello', rating: 4.9, reviews: 20 };
  const ctx = { url: 'https://x.test/', bookUrl: '#', today: '2026-11-17', preview: true };
  for (const [type, vs] of Object.entries(D.SECTIONS)) for (const v of vs) {
    const html = render.site(s, p, { direction: 'nordic', sections: [{ type: 'hero', variant: type === 'hero' ? v : 'split' }].concat(type === 'hero' ? [] : [{ type, variant: v }]), copy: { headline: 'Hi', highlights: [{ title: 'A', text: 'B' }, { title: 'C', text: 'D' }, { title: 'E', text: 'F' }] } }, ctx);
    assert.match(html, new RegExp('data-sec="' + type + '"'), type + ' ' + v);
  }
  const base = { direction: 'linen', sections: [{ type: 'hero', variant: 'split' }, { type: 'book', variant: 'panel' }], copy: { headline: 'Hi' } };
  const plain = render.site(s, p, base, ctx);
  const styled = render.site(s, p, Object.assign({}, base, { style: { font: 'unbounded', palette: 'ember', corners: 'pebble', buttons: 'outline', bands: 'bold', nav: 'centered', images: 'framed', spacing: 'airy', bogus: 'x' } }), ctx);
  assert.match(plain, /Cormorant\+Garamond/); assert.match(styled, /Unbounded/); assert.doesNotMatch(styled, /Cormorant/);
  assert.match(styled, /--bg:#17120F/); assert.match(styled, /color-scheme:dark/); assert.match(styled, /--rb:999px/); assert.match(styled, /n-cen/); assert.match(styled, /--sp:1.3/);
  assert.deepEqual(D.cleanStyle({ font: 'nope', palette: 'sage', nav: 'minimal', x: 1 }), { palette: 'sage', nav: 'minimal' });
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

test('homes in the same account get different looks, and hosts can restyle with templates, style switches and shuffle', async () => {
  const a = await t.home(); await t.act('addProperty', { name: 'Second Home', area: 'Keswick, Cumbria' });
  const b = { p: (await t.call('/api/state')).body.state.properties.find(x => x.name === 'Second Home') }; assert.ok(b.p, 'second home added');
  const g1 = (await t.call('/api/studio/generate', { body: { propertyId: a.p.id, brief: { vibe: 'calm' } } })).body.spec;
  const g2 = (await t.call('/api/studio/generate', { body: { propertyId: b.p.id, brief: { vibe: 'calm' } } })).body.spec;
  assert.equal(g1.direction, g2.direction, 'same brief, same direction');
  const sig = x => JSON.stringify([x.style.font || '', x.style.palette || '', x.template, x.sections.map(q => q.variant)]);
  assert.notEqual(sig(g1), sig(g2), 'but not the same site');
  let e = await t.call('/api/studio/edit', { body: { propertyId: a.p.id, patch: { template: 'minimal' } } });
  assert.equal(e.status, 200); assert.equal(e.body.spec.template, 'minimal'); assert.equal(e.body.spec.sections.find(q => q.type === 'faq').variant, 'centered');
  e = await t.call('/api/studio/edit', { body: { propertyId: a.p.id, patch: { style: { font: 'abril', palette: 'midnight', corners: 'pebble', nav: 'nonsense' } } } });
  assert.deepEqual(e.body.spec.style.font, 'abril'); assert.equal(e.body.spec.style.palette, 'midnight'); assert.equal(e.body.spec.style.nav, undefined, 'unknown values are dropped');
  let pv = await t.call('/app/studio/' + a.p.id); assert.match(pv.body, /Abril\+Fatface/); assert.match(pv.body, /--bg:#0F1724/);
  e = await t.call('/api/studio/edit', { body: { propertyId: a.p.id, patch: { style: { font: '' } } } }); assert.equal(e.body.spec.style.font, undefined);
  e = await t.call('/api/studio/edit', { body: { propertyId: a.p.id, patch: { direction: 'riviera' } } }); assert.equal(e.body.spec.style.palette, undefined, 'a new direction brings its own colours');
  assert.equal(e.body.spec.style.corners, 'pebble', 'other choices stay');
  const before = sig(e.body.spec);
  e = await t.call('/api/studio/edit', { body: { propertyId: a.p.id, patch: { shuffle: true } } }); assert.equal(e.status, 200); assert.notEqual(sig(e.body.spec), before);
  assert.equal(e.body.spec.direction, 'riviera');
  const meta = (await t.call('/api/studio/meta')).body; assert.ok(Object.keys(meta.fonts).length >= 16 && Object.keys(meta.palettes).length >= 18 && Object.keys(meta.pageTemplates).length >= 6);
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
  const mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => { calls.push(JSON.parse(raw)); s.writeHead(200, { 'content-type': 'application/json' }); s.end(JSON.stringify({ stop_reason: 'end_turn', model: 'claude-opus-5-5', usage: { input_tokens: 20000, output_tokens: 8000 }, content: [{ type: 'text', text: JSON.stringify(reply(calls.length)) }] })); }); }).listen(0);
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
    // both calls are charged to the host's AI credit, as Site builder use
    const cr = (await t2.call('/api/credits')).body; const used = cr.recent.filter(x => x.feature === 'studio');
    assert.equal(used.length, 2, JSON.stringify(cr.recent));
  } finally { t2.stop(); mock.close(); }
});

test('a published design offers bank transfer when the host has turned it on', async () => {
  const { p, url } = await t.home();
  await t.act('saveBankTransfer', { on: true, holder: 'Test Stays Ltd', bankName: 'Barclays', sortCode: '200000', account: '12345678', days: 5 });
  await t.call('/api/studio/generate', { body: { propertyId: p.id, brief: { vibe: 'calm' } } });
  await t.call('/api/studio/publish', { body: { propertyId: p.id } });
  const page = await fetch(url).then(r => r.text());
  assert.match(page, /"bank":\{"days":5\}/); assert.match(page, /bw-tr/); assert.doesNotMatch(page, /12345678/, 'bank details stay off the public page');
  await t.call('/api/studio/publish', { body: { propertyId: p.id, off: true } });
});

test('the demo can use the builder too', async () => {
  const r = await fetch(t.base + '/demo'); const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const g = await fetch(t.base + '/api/demo/studio/generate', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: t.base }, body: JSON.stringify({ propertyId: 'laurel', brief: {} }) });
  assert.equal(g.status, 200); assert.equal((await g.json()).spec.direction, 'fell');
  const pv = await fetch(t.base + '/demo/studio/laurel', { headers: { cookie } }); assert.equal(pv.status, 200); assert.match(await pv.text(), /Fraunces/);
});
