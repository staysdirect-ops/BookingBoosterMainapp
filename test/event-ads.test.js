// Event ads: finding events near a home with our own event finder (it reads public pages, no event APIs) or added by
// hand, checking them against the calendar, and writing the Facebook, Instagram and Google ads and the landing page.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const start = require('./harness');
const EV = require('../server/studio/events');
const C = require('../server/studio/crawler');
const G = require('../server/studio/geo');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('a show listed once per day becomes one event, and single-day events are left out', () => {
  const n = (name, d) => EV.norm({ name, start: d, venue: 'Kent Showground' }, 'crawl', 'h');
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

test('robots.txt is followed: our own group first, longest rule wins, Allow wins a tie', () => {
  const r = C.robots('User-agent: *\nDisallow: /private/\nDisallow: /*?sr=\nAllow: /private/open$\nCrawl-delay: 4\n\nUser-agent: BadBot\nDisallow: /', 'BookingboosterEvents/1.0');
  assert.equal(r.delay, 4);
  assert.deepEqual(['/whats-on', '/private/x', '/private/open', '/private/open/more', '/search?sr=1'].map(p => C.allowed(r, 'https://v.example' + p)), [true, false, true, false, false]);
  const us = C.robots('User-agent: BookingboosterEvents\nDisallow: /\n\nUser-agent: *\nAllow: /', 'BookingboosterEvents/1.0');
  assert.equal(C.allowed(us, 'https://v.example/whats-on'), false);
  assert.equal(C.allowed({ rules: [], all: false }, 'https://v.example/'), false, 'a robots.txt we could not read means stay away');
});

test('events are read from JSON-LD, microdata, course instances, calendar feeds and an event page’s own text', () => {
  const html = '<script type="application/ld+json">' + JSON.stringify({ '@context': 'https://schema.org', '@graph': [
    { '@type': 'Event', name: 'Kent County Show', startDate: '2027-07-09T09:00:00+01:00', endDate: '2027-07-11', location: { '@type': 'Place', name: 'Kent Showground', address: { addressLocality: 'Detling', postalCode: 'ME14 3JF' } } },
    { '@type': 'Event', name: 'Cancelled gala', startDate: '2027-05-01', endDate: '2027-05-03', eventStatus: 'https://schema.org/EventCancelled' },
    { '@type': 'Course', name: 'SMSTS site manager course', hasCourseInstance: [{ '@type': 'CourseInstance', courseMode: 'onsite', startDate: '2027-02-08', endDate: '2027-02-12', location: 'Maidstone ME15 6AA' }, { '@type': 'CourseInstance', courseMode: 'online', startDate: '2027-03-08', endDate: '2027-03-12' }] }] }) + '</script>' +
    '<div itemscope itemtype="https://schema.org/SportsEvent"><h2 itemprop="name">Kent Junior Cup</h2><meta itemprop="startDate" content="2027-05-01"><time itemprop="endDate" datetime="2027-05-03">3 May</time></div>' +
    '<a href="/events/kent-junior-cup">More</a><a href="https://other.example/x">Away</a><a href="/feed.ics">Calendar</a>';
  const x = C.extract({ text: html, url: 'https://v.example/whats-on', type: 'text/html' }, 'https://v.example/whats-on');
  assert.deepEqual(x.events.map(e => [e.name, e.start, e.end, e.kind]), [['Kent County Show', '2027-07-09', '2027-07-11', 'show'], ['SMSTS site manager course', '2027-02-08', '2027-02-12', 'course'], ['Kent Junior Cup', '2027-05-01', '2027-05-03', 'sport']]);
  assert.equal(x.events[0].postcode, 'ME14'); assert.equal(x.events[1].venue, 'Maidstone');
  assert.deepEqual(x.links.map(l => l.url), ['https://v.example/events/kent-junior-cup'], 'links to other sites are not followed');
  assert.deepEqual(x.feeds, ['https://v.example/feed.ics']);
  assert.equal(C.extract({ text: '<meta name="robots" content="noindex, nofollow">' + html, url: 'https://v.example/a', type: 'text/html' }, 'https://v.example/').events.length, 0, 'noindex pages are skipped');
  const f = C.ics('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:First Aid at Work course\r\nDTSTART;VALUE=DATE:20270301\r\nDTEND;VALUE=DATE:20270304\r\nLOCATION:Hilton\\, Maidstone ME14 5AA\r\nEND:VEVENT\r\nEND:VCALENDAR', 'https://v.example/feed.ics');
  assert.deepEqual([f[0].start, f[0].end, f[0].kind, f[0].postcode], ['2027-03-01', '2027-03-03', 'course', 'ME14'], 'an all-day DTEND is the day after');
  const t1 = C.textEvent('<title>Farm Expo | Kent Event Centre</title><h1>Farm Expo</h1><p>Friday 30th June - Sunday 2nd July 2027, Detling ME14 3JF</p>', 'https://v.example/events/farm-expo');
  assert.deepEqual([t1[0].name, t1[0].start, t1[0].end, t1[0].kind], ['Farm Expo', '2027-06-30', '2027-07-02', 'expo']);
  assert.equal(C.textEvent('<h1>Leeds Castle</h1><p>Open 1 January - 31 December 2027</p>', 'https://v.example/a').length, 0, 'opening seasons are not events');
});

test('postcodes are placed with our own table, and the same event on two sites is kept once', () => {
  assert.deepEqual(G.point('1 High Street, Maidstone ME15 6AA'), { lat: 51.2545, lng: 0.5339, postcode: 'ME15' });
  assert.equal(G.point('Junction 7 of the M20'), null, 'a bare road number is not a postcode');
  assert.ok(G.miles(G.point('ME15'), G.point('ME14')) < 3 && G.miles(G.point('ME15'), G.point('EH1')) > 300);
  const n = (name, venue, d1, d2) => EV.norm({ name, start: d1, end: d2, venue }, 'crawl', 'h');
  const m = EV.merge([n('Kent County Show', 'Kent Showground', '2027-07-09', '2027-07-11'), n('Kent County Show 2027', 'Kent Showground, Detling', '2027-07-09', '2027-07-11'),
    n('First Aid at Work', 'Maidstone College', '2027-03-01', '2027-03-03'), n('First Aid at Work', 'Ashford Hub', '2027-03-01', '2027-03-03')]);
  assert.deepEqual(m.map(e => e.name + ' @ ' + e.venue), ['First Aid at Work @ Maidstone College', 'First Aid at Work @ Ashford Hub', 'Kent County Show @ Kent Showground']);
});

// A small public website on this machine: a what's-on page, an event page with no data, a course page, a calendar
// feed, a page robots.txt keeps us out of, and a second site that keeps our crawler out altogether.
function venueSite(opts) {
  const hits = [];
  const ld = o => '<script type="application/ld+json">' + JSON.stringify(o) + '</script>';
  const pages = {
    '/robots.txt': ['text/plain', 'User-agent: *\nDisallow: /private/\nDisallow: /*?sr=\n'],
    '/whats-on': ['text/html', '<title>What’s on</title>' + ld([
      { '@context': 'https://schema.org', '@type': 'Event', name: 'Kent County Show', startDate: '2027-07-09', endDate: '2027-07-11', url: '/events/kent-county-show', location: { '@type': 'Place', name: 'Kent Showground', address: { addressLocality: 'Detling', postalCode: 'ME14 3JF' } }, maximumAttendeeCapacity: 80000 },
      { '@context': 'https://schema.org', '@type': 'Festival', name: 'Edinburgh Fringe', startDate: '2027-08-06', endDate: '2027-08-30', location: { '@type': 'Place', name: 'Edinburgh', address: { postalCode: 'EH1 1YJ' } } },
      { '@context': 'https://schema.org', '@type': 'Event', name: 'Craft fair', startDate: '2027-04-01', location: { '@type': 'Place', name: 'Hazlitt', address: { postalCode: 'ME14 1PL' } } }]) +
      ['Detling Steam Rally - Day 1|2027-05-14', 'Detling Steam Rally - Day 2|2027-05-15'].map(x => '<div itemscope itemtype="https://schema.org/Event"><span itemprop="name">' + x.split('|')[0] + '</span><meta itemprop="startDate" content="' + x.split('|')[1] + '"><div itemprop="location" itemscope itemtype="https://schema.org/Place"><span itemprop="name">Kent Showground</span><span itemprop="postalCode">ME14 3JF</span></div></div>').join('') +
      '<a href="/events/kent-county-show">Kent County Show</a><a href="/events/farm-expo">Farm Expo</a><a href="/courses/smsts">SMSTS</a><a href="/private/staff-party">Staff</a><a href="/whats-on?sr=1">Search</a><link rel="alternate" type="text/calendar" href="/feed.ics">'],
    '/events/kent-county-show': ['text/html', '<h1>Kent County Show</h1>'],
    '/events/farm-expo': ['text/html', '<title>Farm Expo | Kent Event Centre</title><h1>Farm Expo</h1><p>Wednesday 10 - Thursday 11 March 2027 at the Kent Event Centre, Detling, ME14 3JF.</p>'],
    '/courses/smsts': ['text/html', ld({ '@context': 'https://schema.org', '@type': 'Course', name: 'SMSTS site manager course', hasCourseInstance: [{ '@type': 'CourseInstance', courseMode: 'onsite', startDate: '2027-02-08', endDate: '2027-02-12', location: { '@type': 'Place', name: 'Maidstone Training Centre', address: 'Maidstone ME15 6AA' } }] })],
    '/feed.ics': ['text/calendar', 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:Kent Business Expo\r\nDTSTART;VALUE=DATE:20270310\r\nDTEND;VALUE=DATE:20270312\r\nLOCATION:Kent Event Centre\\, Detling ME14 3JF\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n'],
    '/private/staff-party': ['text/html', 'secret'],
    '/venue': ['text/html', ld({ '@context': 'https://schema.org', '@type': 'Event', name: 'Kent County Show 2027', startDate: '2027-07-09', endDate: '2027-07-11', location: { '@type': 'Place', name: 'Kent Showground, Detling', address: { postalCode: 'ME14 3JF' } } })],
  };
  const srv = http.createServer((q, s) => { hits.push({ path: q.url, ua: q.headers['user-agent'] });
    if (opts && opts.closed) { if (q.url === '/robots.txt') { s.writeHead(200, { 'content-type': 'text/plain' }); return s.end('User-agent: BookingboosterEvents\nDisallow: /\n'); } s.writeHead(200); return s.end('should not be read'); }
    const pg = pages[q.url]; if (!pg) { s.writeHead(404); return s.end('not found'); } s.writeHead(200, { 'content-type': pg[0] }); s.end(pg[1]); });
  return new Promise(ok => srv.listen(0, () => ok({ srv, hits, base: 'http://localhost:' + srv.address().port })));
}

test('a real account finds events with our own finder, no event APIs, then gets ads written by Claude', { timeout: 120000 }, async () => {
  const calls = [];
  const mock = http.createServer((q, s) => { let raw = ''; q.on('data', c => raw += c); q.on('end', () => {
    const J = (o, c) => { s.writeHead(c || 200, { 'content-type': 'application/json' }); s.end(JSON.stringify(o)); };
    const b = JSON.parse(raw); calls.push(b);
    // ad copy: one headline is too long and is dropped
    return J({ model: 'claude-opus-5-5', stop_reason: 'end_turn', usage: { input_tokens: 3000, output_tokens: 800 }, content: [{ type: 'text', text: JSON.stringify({
      meta: { primary: 'Showing at the Kent County Show? The whole house is yours 8–11 July.', headline: 'Your Kent County Show base', description: '10% off direct' },
      google: { headlines: ['Kent County Show Stays', 'This headline is far too long for Google search ads', 'Whole House, Sleeps 7'], descriptions: ['Four bedrooms near the showground. Book direct and save 10%.'], keywords: ['kent county show accommodation'] },
      audience: { interests: ['Agricultural shows', 'Farming'], jobs: [], notes: 'Exclude people within 20 miles.' },
      landing: { eyebrow: 'Kent County Show · 9–11 July', headline: 'Your *base* for the show', subhead: 'Free 8–11 July.', points: ['Sleeps 7', 'Parking', 'Fast Wi-Fi'], button: 'Book these dates', urgency: 'Three nights free' } }) }] });
  }); });
  await new Promise(ok => mock.listen(0, ok)); const base = 'http://localhost:' + mock.address().port;
  const v = await venueSite(), shut = await venueSite({ closed: true });
  const seeds = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bb-seeds-')), 'seeds.json');
  fs.writeFileSync(seeds, JSON.stringify({ sources: [{ url: v.base + '/whats-on', name: 'Kent what’s on', place: 'Maidstone', postcode: 'ME14' }, { url: v.base + '/whats-on', name: 'Same page twice', place: 'Edinburgh', postcode: 'EH1' }] }));
  const t2 = await start({ ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_API_BASE: base, EVENTS_ALLOW_PRIVATE_FOR_TESTS: '1', EVENT_SEEDS: seeds });
  try {
    await t2.signup(); const { p } = await t2.home();
    await t2.act('updateProperty', p.id, { address: '1 High Street, Maidstone ME15 6AA', area: 'Maidstone, Kent', maxGuests: 7, bedrooms: 4 });
    const meta = (await t2.call('/api/studio/meta')).body.events; assert.deepEqual(meta.sources.map(x => x.id), ['crawl', 'manual']);
    const f = await t2.call('/api/eventads/find', { body: { propertyId: p.id, months: 12, radius: 25, minDays: 2 } });
    assert.equal(f.status, 200, JSON.stringify(f.body));
    const names = f.body.events.map(e => e.name).sort();
    assert.deepEqual(names, ['Detling Steam Rally', 'Farm Expo', 'Kent Business Expo', 'Kent County Show', 'SMSTS site manager course'], 'one-day and far-away events left out, the rally merged, feed and course pages read');
    const kcs = f.body.events.find(e => e.name === 'Kent County Show');
    assert.equal(kcs.url, v.base + '/events/kent-county-show'); assert.equal(kcs.fit.status, 'free'); assert.equal(kcs.attendance, 80000); assert.equal(kcs.source, 'crawl'); assert.equal(kcs.site, 'localhost');
    assert.equal(f.body.events.find(e => e.name === 'SMSTS site manager course').kind, 'course');
    // good manners: robots.txt read first, disallowed pages never fetched, and we say who we are
    assert.equal(v.hits[0].path, '/robots.txt'); assert.ok(v.hits.every(h => /^BookingboosterEvents\/1\.0 \(\+http/.test(h.ua)));
    assert.ok(!v.hits.some(h => h.path.startsWith('/private/') || h.path.includes('sr=')), JSON.stringify(v.hits));
    // nothing went to an event API or a search engine; Claude was not asked yet
    assert.equal(calls.length, 0);
    const cr = (await t2.call('/api/credits')).body; assert.equal(cr.recent.filter(x => x.feature === 'eventads').length, 0, 'finding events costs no AI credit');
    const l = (await t2.call('/api/eventads/list')).body; assert.equal(l.pages.length, 1, 'the starter page near the home, once'); assert.equal(l.pages[0].n, 8, 'everything on the page, before the filters'); assert.equal(l.located[p.id], true);

    // the host adds a page; the same show listed there is merged with the one we have
    const w1 = await t2.call('/api/eventads/watch', { body: { propertyId: p.id, url: v.base + '/venue', name: 'Showground events' } });
    assert.equal(w1.status, 200, JSON.stringify(w1.body)); assert.equal(w1.body.page.n, 1); assert.ok(w1.body.pages.some(x => x.mine && x.name === 'Showground events'));
    const f2 = await t2.call('/api/eventads/find', { body: { propertyId: p.id, months: 12 } });
    assert.equal(f2.body.added, 0); assert.equal(f2.body.events.filter(e => /Kent County Show/.test(e.name)).length, 1);
    // a site that keeps crawlers out is not read at all
    const w2 = await t2.call('/api/eventads/watch', { body: { propertyId: p.id, url: shut.base + '/whats-on' } });
    assert.equal(w2.status, 400); assert.match(w2.body.error, /robots\.txt/); assert.deepEqual(shut.hits.map(h => h.path), ['/robots.txt']);
    await t2.call('/api/eventads/unwatch', { body: { id: w1.body.page.id } });
    assert.ok(!(await t2.call('/api/eventads/list')).body.pages.some(x => x.mine));

    const c = await t2.call('/api/eventads/create', { body: { eventId: kcs.id, pct: 10, code: 'show 10!' } });
    assert.equal(c.status, 200, JSON.stringify(c.body)); const ad = c.body.ad;
    assert.equal(ad.by, 'ai'); assert.equal(ad.code, 'SHOW10'); assert.deepEqual(ad.stay, { from: '2027-07-08', to: '2027-07-11', n: 3 });
    assert.ok(!calls[0].tools, 'Claude only writes the copy, it does not search');
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
    assert.equal((await fetch(t2.base + '/bot').then(x => x.text())).includes('User-agent: BookingboosterEvents'), true);
  } finally { t2.stop(); mock.close(); v.srv.close(); shut.srv.close(); }
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
