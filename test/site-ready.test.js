// The site checklist: a new home stays "opening soon" to guests until every step is done, the host can go live
// themselves or hand it to the team, and the team finishes and publishes it from /admin/sites.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const start = require('./harness');

let t;
const form = (p, o) => t.call(p, { body: new URLSearchParams(o).toString(), headers: { 'content-type': 'application/x-www-form-urlencoded' } });
const anon = async url => { const r = await fetch(url, { redirect: 'manual' }); return { status: r.status, body: await r.text() }; };
const launchOf = async () => ((await t.call('/api/state')).body.state.properties[0].launch || {});

test.before(async () => { t = await start({ ADMIN_EMAILS: 'host@example.co.uk' }); await t.signup(); });
test.after(() => t.stop());

test('a new site is building: guests see opening soon, the host sees a preview', async () => {
  const { url } = await t.home();
  assert.equal((await launchOf()).state, 'building');
  const g = await anon(url);
  assert.equal(g.status, 503); assert.match(g.body, /opening soon/i);
  const h = await t.call(new URL(url).pathname);
  assert.equal(h.status, 200); assert.match(h.body, /Preview/);
  const sm = await anon(t.base + '/sitemap.xml');
  assert.doesNotMatch(sm.body, new RegExp(new URL(url).pathname.replace(/\//g, '\\/')), 'not in the sitemap yet');
});

test('the host cannot skip the checklist', async () => {
  const { p } = await t.home();
  const r = await t.act('goLive', p.id);
  assert.equal(r.body.result.ok, false); assert.match(r.body.result.error, /Finish \d+ more steps/);
  await t.act('updateProperty', p.id, { launch: { state: 'live' } });
  assert.equal((await launchOf()).state, 'building', 'the editor cannot set the launch record');
  assert.equal((await t.act('teamLaunch', p.id)).status, 403, 'team actions are not open to hosts');
  const ask = await t.act('requestSiteReview', p.id, '');
  assert.equal(ask.body.result.ok, false); assert.match(ask.body.result.error, /Only you can do these/);
});

test('once the host-only steps are done they can hand it to the team, who finish and publish it', async () => {
  const { p, url } = await t.home();
  const photos = Array.from({ length: 10 }, (_, i) => ({ url: 'https://img.example/' + i + '.jpg', cap: 'Room ' + i }));
  await t.act('updateProperty', p.id, { photos, amenities: ['Hot tub', 'Log burner', 'Dogs welcome', 'Parking', 'Fast Wi-Fi', 'Sea view'], address: '4 Henrietta Street, Whitby YO22 4DW', entry: 'Key safe by the door, code in your trip app' });
  if (!(await t.call('/api/state')).body.state.integrations.find(i => i.id === 'stripe').connected) await t.act('toggleIntegration', 'stripe');
  const ask = await t.act('requestSiteReview', p.id, 'Please keep it warm.');
  assert.equal(ask.body.result.ok, true, JSON.stringify(ask.body.result));
  assert.equal((await launchOf()).state, 'review');
  const team = await t.until(async () => (await t.sql("SELECT subject FROM outbox WHERE subject LIKE 'Site to finish%'")).length);
  assert.ok(team, 'the team is told');

  const q = await t.call('/admin/sites');
  assert.equal(q.status, 200); assert.match(q.body, /Gull Cottage/); assert.match(q.body, /Please keep it warm/);
  const wid = (await t.sql("SELECT id FROM workspaces WHERE kind = 'live'"))[0].id;
  const about = 'Gull Cottage is a bright fisherman’s cottage on Henrietta Street, a short walk down the 199 steps to the harbour and the beach. ' +
    'It sleeps four in two bedrooms, with a log burner in the snug, a hot tub in the walled yard and views over the red roofs to the abbey. Dogs are welcome, and there is parking nearby for one car.';
  const pub = await form('/admin/sites/' + wid + '/' + encodeURIComponent(p.id) + '/save', { headline: 'A harbour cottage with a hot tub below Whitby Abbey', sub: 'Sleeps 4 · dogs welcome · 2 minutes to the beach', about,
    summary: 'Gull Cottage is a dog friendly two bedroom cottage with a hot tub on Henrietta Street in Whitby, two minutes from the harbour and beach.',
    faqs: 'Are dogs allowed? | Yes, up to two dogs.\nIs there parking? | One permit for the Abbey car park.\nIs there a hot tub? | Yes, in the walled yard.', then: 'publish' });
  assert.equal(pub.status, 302, pub.body.slice ? pub.body.slice(0, 400) : '');
  assert.equal((await launchOf()).state, 'live');
  assert.equal((await anon(url)).status, 200, 'guests see it now');
  assert.ok(await t.until(async () => (await t.sql("SELECT subject FROM outbox WHERE subject LIKE '%is live'")).length), 'the host gets the site is live email');
});

test('the team can send a site back with a note', async () => {
  const r = await t.act('addProperty', { name: 'Kipper Loft', domain: '' });
  const pid = r.body.state.properties.slice(-1)[0].id;
  const wid = (await t.sql("SELECT id FROM workspaces WHERE kind = 'live'"))[0].id;
  const back = await form('/admin/sites/' + wid + '/' + encodeURIComponent(pid) + '/return', { note: 'Add 10 photos of the loft, please.' });
  assert.equal(back.status, 302);
  const p = (await t.call('/api/state')).body.state.properties.find(x => x.id === pid);
  assert.equal(p.launch.state, 'building'); assert.match(p.launch.teamNote, /10 photos/);
});
