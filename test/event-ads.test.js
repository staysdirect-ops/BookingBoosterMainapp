// Event ads: finding events near a home (web search by Claude, Ticketmaster, PredictHQ, or added by hand), checking
// them against the calendar, and writing the Facebook, Instagram and Google ads and the landing page for the free nights.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');
const EV = require('../server/studio/events');

test('a show listed once per day becomes one event, and single-day events are left out', () => {
  const n = (name, d) => EV.norm({ name, start: d, venue: 'Kent Showground' }, 'ticketmaster', 'h');
  const m = EV.merge([n('Kent County Show - Friday', '2027-07-09'), n('Kent County Show - Saturday', '2027-07-10'), n('Kent County Show - Sunday', '2027-07-11'), n('Antiques Fair', '2027-08-01')]);
  assert.deepEqual(m.map(e => [e.name, e.start, e.end, e.days]), [['Kent County Show', '2027-07-09', '2027-07-11', 3], ['Antiques Fair', '2027-08-01', '2027-08-01', 1]]);
  assert.equal(EV.norm({ name: 'x', start: 'soon' }, 'web', 'h'), null);
  assert.equal(EV.norm({ name: 'x', start: '2027-01-01', url: 'javascript:alert(1)' }, 'web', 'h').url, '');
});

test('the stay is the night before the first day to the last day, and only free nights are sold', () => {
  const ev = EV.norm({ name: 'Show', start: '2027-07-09', end: '2027-07-11' }, 'web', 'h'), p = { nightly: 100, cleaning: 50, minNights: 2 };
  const all = EV.fit(ev, new Set(), p, '2026-11-17');
  assert.deepEqual([all.from, all.to, all.nights, all.free, all.status, all.value], ['2027-07-08', '2027-07-11', 3, 3, 'free', 350]);
  const part = EV.fit(ev, new Set(['2027-07-09']), p, '2026-11-17');
  assert.equal(part.status, 'booked', 'one night either side of a booking is shorter than the minimum stay');
  const part2 = EV.fit(ev, new Set(['2027-07-10']), Object.assign({}, p, { minNights: 1 }), '2026-11-17');
  assert.equal(part2.status, 'part'); assert.deepEqual(part2.stay, { from: '2027-07-08', to: '2027-07-10' });
});

test('rules copy keeps to every platform limit', () => {
  const f = { name: 'Maidstone Town House', short: 'Maidstone Town House', town: 'Maidstone', area: 'Maidstone, Kent', maxGuests: 7, bedrooms: 4, nightly: 120, cleaning: 60, amenities: ['Fast Wi-Fi', 'Free parking'], checkin: '3pm', rating: 5, rules: [] };
  for (const name of ['Kent County Show 2027', 'The Very Long Annual South East Regional Construction and Infrastructure Conference']) {
    const ev = EV.norm({ name, kind: 'conference', start: '2027-07-09', end: '2027-07-11', venue: 'Kent Showground', town: 'Detling' }, 'web', 'h');
    const ft = EV.fit(ev, new Set(), { nightly: 120, cleaning: 60 }, '2026-11-17'), a = EV.rulesAds(f, ev, ft, { code: 'SHOW10', pct: 10 });
    assert.ok(a.meta.headline.length <= 40 && a.meta.description.length <= 30, name);
    assert.ok(a.google.headlines.length >= 8 && a.google.headlines.every(h => h.length <= 30), JSON.stringify(a.google.headlines));
    assert.ok(a.google.descriptions.length >= 3 && a.google.descriptions.every(h => h.length <= 90));
    assert.ok(!/Conferenc\b|Regional Construction and$/.test(a.google.headlines.join('|')), 'no names cut mid-word');
    assert.match(a.meta.primary, /8–11 Jul \(3 nights\)/); assert.match(a.meta.primary, /SHOW10/);
    const pl = EV.plan(f, ev, ft, '2026-11-17');
    assert.ok(pl.runTo < ft.stay.from && pl.runFrom >= '2026-11-17' && pl.total >= 30 && pl.meta.budget + pl.google.budget === pl.total);
  }
});

let t;
test.before(async () => { t = await start(); await t.signup(); });
test.after(() => t.stop());

test('the demo finds sample events and makes an ad pack with a landing page', async () => {
  const r = await fetch(t.base + '/demo'); const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const go = (p, body) => fetch(t.base + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', cookie, origin: t.base }, body: body ? JSON.stringify(body) : undefined }).then(async x => [x.status, await x.json()]);
  const [s1, f] = await go('/api/demo/eventads/find', { propertyId: 'loft', months: 12 });
  assert.equal(s1, 200, JSON.stringify(f)); assert.ok(f.events.length >= 2); assert.equal(f.sources[0].id, 'sample');
  const ev = f.events.find(e => e.fit.stay); assert.ok(ev);
  const [s2, c] = await go('/api/demo/eventads/create', { eventId: ev.id, pct: 15 });
  assert.equal(s2, 200, JSON.stringify(c)); assert.equal(c.ad.pct, 15); assert.ok(c.ad.funnelId);
  const fn = c.state.studio.funnels.find(x => x.id === c.ad.funnelId); assert.equal(fn.template, 'event'); assert.equal(c.state.promos[c.ad.code], 15);
  const pv = await fetch(t.base + '/demo/funnel/' + fn.id + '/offer', { headers: { cookie } }).then(x => x.text());
  assert.match(pv, /Arrive /); assert.match(pv, new RegExp('checkin=' + c.ad.stay.from + '&amp;checkout=' + c.ad.stay.to));
});

test('a real account searches the web with Claude, Ticketmaster and PredictHQ, then gets ads written by Claude', async () => {
  const calls = [];
  const mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const J = (o, c) => { s.writeHead(c || 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(o)); };
    calls.push(q.url.split('?')[0]);
    if (q.url.startsWith('/postcodes/')) return J({ result: { latitude: 51.27, longitude: 0.52, admin_district: 'Maidstone' } });
    if (q.url.startsWith('/discovery/v2/events.json')) { assert.match(q.url, /latlong=51.27%2C0.52/); assert.match(q.url, /apikey=tm-key/);
      return J({ _embedded: { events: ['2027-05-14', '2027-05-15'].map((d, i) => ({ name: 'Detling Steam Rally - Day ' + (i + 1), url: 'https://tm.example/rally', dates: { start: { localDate: d } }, classifications: [{ segment: { name: 'Miscellaneous' } }], _embedded: { venues: [{ name: 'Kent Showground', city: { name: 'Detling' } }] } })) } }); }
    if (q.url.startsWith('/v1/events/')) { assert.equal(q.headers.authorization, 'Bearer phq-key');
      return J({ results: [{ title: 'Kent Business Expo', category: 'expos', start_local: '2027-03-10T09:00:00', predicted_end_local: '2027-03-11T17:00:00', phq_attendance: 4000, entities: [{ type: 'venue', name: 'Kent Event Centre' }] }] }); }
    const b = JSON.parse(raw);
    if (b.tools) { assert.equal(b.tools[0].type, 'web_search_20260209'); assert.match(b.messages[0].content, /Maidstone/);
      return J({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 5000, output_tokens: 500, server_tool_use: { web_search_requests: 3 } }, content: [
        { type: 'web_search_tool_result', tool_use_id: 'a', content: [{ type: 'web_search_result', url: 'https://shows.example/kent-county-show', title: 'Kent County Show' }] },
        { type: 'text', text: 'Here you go: ' + JSON.stringify({ events: [
          { name: 'Kent County Show', kind: 'show', start: '2027-07-09', end: '2027-07-11', venue: 'Kent Showground', town: 'Detling', url: 'https://shows.example/kent-county-show', audience: 'Exhibitors and visitors', attendance: 80000 },
          { name: 'SMSTS course', kind: 'course', start: '2027-02-08', end: '2027-02-12', venue: 'Maidstone', url: 'https://made-up.example/smsts' },
          { name: 'Craft fair', kind: 'show', start: '2027-04-01', end: '2027-04-01' }] }) }] }); }
    // ad copy: one headline is too long and is dropped
    return J({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 800 }, content: [{ type: 'text', text: JSON.stringify({
      meta: { primary: 'Showing at the Kent County Show? The whole house is yours 8–11 July.', headline: 'Your Kent County Show base', description: '10% off direct' },
      google: { headlines: ['Kent County Show Stays', 'This headline is far too long for Google search ads', 'Whole House, Sleeps 7'], descriptions: ['Four bedrooms near the showground. Book direct and save 10%.'], keywords: ['kent county show accommodation'] },
      audience: { interests: ['Agricultural shows', 'Farming'], jobs: [], notes: 'Exclude people within 20 miles.' },
      landing: { eyebrow: 'Kent County Show · 9–11 July', headline: 'Your *base* for the show', subhead: 'Free 8–11 July.', points: ['Sleeps 7', 'Parking', 'Fast Wi-Fi'], button: 'Book these dates', urgency: 'Three nights free' } }) }] });
  }); });
  await new Promise(ok => mock.listen(0, ok)); const base = 'http://localhost:' + mock.address().port;
  const t2 = await start({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_API_BASE: base, POSTCODES_API_BASE: base, TICKETMASTER_API_KEY: 'tm-key', TICKETMASTER_API_BASE: base, PREDICTHQ_TOKEN: 'phq-key', PREDICTHQ_API_BASE: base });
  try {
    await t2.signup(); const { p } = await t2.home();
    await t2.act('updateProperty', p.id, { address: '1 High Street, Maidstone ME15 6AA', area: 'Maidstone, Kent', maxGuests: 7, bedrooms: 4 });
    const meta = (await t2.call('/api/studio/meta')).body.events; assert.deepEqual(meta.sources.filter(x => x.on).map(x => x.id), ['web', 'predicthq', 'ticketmaster', 'manual']);
    const f = await t2.call('/api/eventads/find', { body: { propertyId: p.id, months: 12, radius: 25, minDays: 2 } });
    assert.equal(f.status, 200, JSON.stringify(f.body));
    const names = f.body.events.map(e => e.name).sort();
    assert.deepEqual(names, ['Detling Steam Rally', 'Kent Business Expo', 'Kent County Show', 'SMSTS course'], 'one-day events left out, the rally merged');
    const kcs = f.body.events.find(e => e.name === 'Kent County Show'); assert.equal(kcs.url, 'https://shows.example/kent-county-show'); assert.equal(kcs.fit.status, 'free');
    assert.equal(f.body.events.find(e => e.name === 'SMSTS course').url, '', 'links Claude did not actually find are dropped');
    assert.equal(f.body.events.find(e => e.name === 'Kent Business Expo').attendance, 4000);
    // web search is charged to the host's AI credit, searches included
    const cr = (await t2.call('/api/credits')).body; const used = cr.recent.filter(x => x.feature === 'eventads'); assert.equal(used.length, 1); assert.ok(used[0].pounds > 0.03);
    // a second search adds nothing new
    assert.equal((await t2.call('/api/eventads/find', { body: { propertyId: p.id, months: 12 } })).body.added, 0);

    const c = await t2.call('/api/eventads/create', { body: { eventId: kcs.id, pct: 10, code: 'show 10!' } });
    assert.equal(c.status, 200, JSON.stringify(c.body)); const ad = c.body.ad;
    assert.equal(ad.by, 'ai'); assert.equal(ad.code, 'SHOW10'); assert.deepEqual(ad.stay, { from: '2027-07-08', to: '2027-07-11', n: 3 });
    assert.equal(ad.meta.headline, 'Your Kent County Show base'); assert.deepEqual(ad.google.headlines, ['Kent County Show Stays', 'Whole House, Sleeps 7']);
    assert.ok(ad.plan.total >= 30 && ad.plan.runTo === '2027-07-06');
    const fn = c.body.state.studio.funnels.find(x => x.id === ad.funnelId); assert.equal(fn.status, 'draft'); assert.equal(fn.copy.offer.headline, 'Your *base* for the show');

    // edits keep to the limits; the host marks the ads as running
    await t2.call('/api/eventads/edit', { body: { id: ad.id, patch: { meta: { headline: 'x'.repeat(80) }, google: { headlines: 'One\nTwo\n' + 'y'.repeat(50) }, status: 'running' } } });
    let st = (await t2.call('/api/state')).body.state; const a2 = st.studio.events.ads[0];
    assert.equal(a2.meta.headline.length, 40); assert.deepEqual(a2.google.headlines, ['One', 'Two', 'y'.repeat(30)]); assert.equal(a2.status, 'running');

    // the landing page goes live and links to the booking site with the dates and the code
    await t2.call('/api/funnels/edit', { body: { id: fn.id, patch: { status: 'live' } } });
    const { slug } = await t2.home(); const page = await fetch(t2.base + '/f/' + slug + '/' + fn.id).then(x => x.text());
    assert.match(page, /promo=SHOW10&amp;checkin=2027-07-08&amp;checkout=2027-07-11/);

    // adding by hand, hiding, deleting
    const add = await t2.call('/api/eventads/add', { body: { propertyId: p.id, name: 'Hospital training week', kind: 'course', start: '2027-03-01', end: '2027-03-05' } });
    assert.equal(add.status, 200); assert.equal(add.body.event.source, 'manual');
    assert.equal((await t2.call('/api/eventads/add', { body: { propertyId: p.id, name: 'Old', start: '2020-01-01' } })).status, 400);
    await t2.call('/api/eventads/hide', { body: { id: add.body.event.id } });
    assert.ok(!(await t2.call('/api/eventads/list')).body.events.some(e => e.id === add.body.event.id));
    await t2.call('/api/eventads/delete', { body: { id: ad.id, landing: true } });
    st = (await t2.call('/api/state')).body.state; assert.equal(st.studio.events.ads.length, 0); assert.ok(!st.studio.funnels.some(x => x.id === fn.id));
    assert.ok(calls.includes('/discovery/v2/events.json') && calls.includes('/v1/events/'));
  } finally { t2.stop(); mock.close(); }
});

test('without any event source, a real account can still add events by hand', async () => {
  const { p } = await t.home();
  const f = await t.call('/api/eventads/find', { body: { propertyId: p.id } }); assert.equal(f.status, 400); assert.match(f.body.error, /add an event yourself/i);
  const add = await t.call('/api/eventads/add', { body: { propertyId: p.id, name: 'Regatta week', kind: 'sport', start: t.dateIn(40), end: t.dateIn(46) } });
  assert.equal(add.status, 200);
  const l = (await t.call('/api/eventads/list')).body; assert.equal(l.events.length, 1); assert.equal(l.events[0].fit.status, 'free');
  const c = await t.call('/api/eventads/create', { body: { eventId: l.events[0].id, pct: 0 } });
  assert.equal(c.status, 200); assert.equal(c.body.ad.by, 'rules'); assert.equal(c.body.ad.code, '');
});

test('the booking widget picks dates passed in the link', () => {
  const render = require('../server/studio/render');
  const html = render.site({ account: { business: 'S', owner: 'A B' }, website: { faqs: {} }, integrations: [], guests: [], bookings: [] }, { id: 'h', name: 'H', area: 'X', nightly: 100, maxGuests: 2 }, { direction: 'linen', sections: [{ type: 'hero', variant: 'type' }, { type: 'book', variant: 'panel' }], copy: { headline: 'Hi' } }, { url: 'https://x.test/', bookUrl: '#', today: '2026-11-17' });
  assert.match(html, /qs\.get\('checkin'\)/);
});
