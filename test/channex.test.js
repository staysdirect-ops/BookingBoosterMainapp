// All channels (server/channex.js), run in-process against a fake Channex API.
// Checks the gate (never on at a loss), home set-up, availability and price ranges, the booking feed with ack,
// cancellations, the connect screen link, and the add-on price on a running Stripe subscription.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Workspace, seedDemo } = require('../server/engine');
const makeChannex = require('../server/channex');
const ical = require('../server/ical');

function fakeDb(paying) {
  const kv = new Map();
  return {
    kv, paying,
    prepare(sql) {
      return {
        get: async k => kv.has(k) ? { v: kv.get(k) } : undefined,
        run: async (k, v) => { kv.set(k, v); },
        all: async () => /billing_status/.test(sql) ? paying.map(a => ({ state: JSON.stringify({ account: a }) })) : [],
      };
    },
  };
}
function rig({ paying = [], minHosts = 2 } = {}) {
  const w = new Workspace('w1', seedDemo()); w.kind = 'live';
  const ws = { open: async () => w, withWs: async (id, fn) => { const r = fn(w.BB, w); w.drainEffects(); return r; } };
  const db = fakeDb(paying);
  const cfg = { secret: 'test', baseUrl: 'https://booking-booster.co.uk', channex: { key: 'cx-key', base: 'https://staging.channex.io', minHosts } };
  return { w, db, cfg, cx: makeChannex({ cfg, ws, db, log: () => {} }) };
}
function fakeFetch(handlers) {
  const calls = []; const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url); const body = opts.body ? (String((opts.headers || {})['content-type']).includes('json') ? JSON.parse(opts.body) : Object.fromEntries(new URLSearchParams(String(opts.body)))) : null;
    const c = { method: opts.method || 'GET', host: u.host, path: u.pathname, q: u.searchParams, headers: opts.headers || {}, body }; calls.push(c);
    for (const h of handlers) { const r = h(c); if (r !== undefined) return new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'content-type': 'application/json' } }); }
    return new Response('{}', { status: 404 });
  };
  return { calls, restore: () => { global.fetch = real; } };
}
function channexApi(feed) {
  let n = 0; const id = t => t + '-' + (++n);
  return [
    c => c.host === 'staging.channex.io' && c.headers['user-api-key'] !== 'cx-key' ? [401, { errors: { code: 'unauthorized' } }] : undefined,
    c => c.path === '/api/v1/groups' ? [201, { data: { type: 'group', id: id('grp') } }] : undefined,
    c => c.path === '/api/v1/properties' ? (c.body.property.currency === 'GBP' ? [201, { data: { type: 'property', id: id('prop') } }] : [422, { errors: { code: 'validation_error', details: { currency: ['bad'] } } }]) : undefined,
    c => c.path === '/api/v1/room_types' ? [201, { data: { type: 'room_type', id: id('room') } }] : undefined,
    c => c.path === '/api/v1/rate_plans' ? [201, { data: { type: 'rate_plan', id: id('rate') } }] : undefined,
    c => c.path === '/api/v1/availability' || c.path === '/api/v1/restrictions' ? [200, { data: [{ id: id('task'), type: 'task' }], meta: { message: 'Success' } }] : undefined,
    c => c.path === '/api/v1/booking_revisions/feed' ? [200, { data: feed.splice(0, feed.length).map(x => ({ type: 'booking_revision', id: x.id, attributes: x })), meta: { total: 0 } }] : undefined,
    c => /\/ack$/.test(c.path) ? [200, { meta: { message: 'Success' } }] : undefined,
    c => c.path === '/api/v1/auth/one_time_token' ? [200, { data: { token: 'ott-1' } }] : undefined,
  ];
}

test('All channels waits until enough hosts pay for it, then lists every home and sends open dates', async () => {
  const paying = [{ addon: true }];
  const { w, cx, db } = rig({ paying });
  const s = w.state; const f = fakeFetch(channexApi([]));
  try {
    w.BB.act.joinAllChannels(false); w.drainEffects();
    const i = w.BB.q.integration('hub');
    assert.equal(i.connected, true); assert.equal(s.account.addon, true); assert.ok(!s.account.tier);
    await cx.run(w);
    assert.equal(f.calls.length, 0, 'nothing is sent to Channex while it would run at a loss');
    assert.equal(i.waiting, true);
    assert.deepEqual(cx.pub(), { ready: true, live: false, paying: 1, need: 2 });

    paying.push({ addon: true }, { addon: false }); await cx.gate(true);
    await cx.run(w);
    assert.equal(cx.pub().live, true);
    assert.equal(i.waiting, false);
    assert.ok(!i.error, i.error);
    assert.equal(f.calls.filter(c => c.path === '/api/v1/groups').length, 1, 'one group per account');
    const props = f.calls.filter(c => c.path === '/api/v1/properties');
    assert.equal(props.length, s.properties.length, 'every home becomes a Channex property');
    assert.ok(props.every(c => c.body.property.currency === 'GBP' && c.body.property.timezone === 'Europe/London' && c.body.property.group_id));
    const rooms = f.calls.filter(c => c.path === '/api/v1/room_types');
    assert.ok(rooms.every(c => c.body.room_type.count_of_rooms === 1 && c.body.room_type.occ_adults >= 1));
    const rates = f.calls.filter(c => c.path === '/api/v1/rate_plans');
    assert.ok(rates.every(c => c.body.rate_plan.options.length === 1 && c.body.rate_plan.options[0].is_primary && c.body.rate_plan.currency === 'GBP'));
    for (const p of s.properties) { const m = i.map[p.id]; assert.ok(m.property && m.room && m.rate); assert.deepEqual(JSON.parse(db.kv.get('channex:prop:' + m.property)), { wid: 'w1', pid: p.id }); }

    const av = f.calls.filter(c => c.path === '/api/v1/availability');
    assert.equal(av.length, s.properties.length, 'one availability request per home');
    assert.equal(f.calls.filter(c => c.path === '/api/v1/restrictions').length, 0, 'no prices on the dates-only plan');
    const p = s.properties[0]; const vals = av.find(c => c.body.values[0].property_id === i.map[p.id].property).body.values;
    const nightAt = d => vals.find(v => v.date_from <= d && v.date_to >= d);
    assert.equal(vals[0].date_from, s.today); assert.equal(vals[vals.length - 1].date_to, ical.addDay(s.today, 499));
    const bl = w.BB.q.blocked(p.id);
    for (let k = 0; k < 120; k++) { const d = ical.addDay(s.today, k); assert.equal(nightAt(d).availability, bl.has(d) ? 0 : 1, d); }
    assert.ok(vals.length < 200, 'sent as ranges, not night by night');

    const before = f.calls.length; await cx.run(w);
    assert.equal(f.calls.length, before, 'nothing changed, nothing sent');
  } finally { f.restore(); }
});

test('All channels with price sync sends nightly prices and minimum stays, and a new booking reopens nothing it should not', async () => {
  const { w, cx } = rig({ paying: [{ addon: true }], minHosts: 1 });
  const s = w.state; const f = fakeFetch(channexApi([]));
  try {
    w.BB.act.joinAllChannels(true); w.drainEffects(); await cx.gate(true); await cx.run(w);
    assert.equal(s.account.tier, 'all');
    const i = w.BB.q.integration('hub'); const p = s.properties[0];
    const rs = f.calls.filter(c => c.path === '/api/v1/restrictions');
    assert.equal(rs.length, s.properties.length);
    const vals = rs.find(c => c.body.values[0].property_id === i.map[p.id].property).body.values;
    const at = d => vals.find(v => v.date_from <= d && v.date_to >= d);
    for (let k = 0; k < 14; k++) { const d = ical.addDay(s.today, k); const dow = new Date(d + 'T12:00:00Z').getUTCDay(); assert.equal(at(d).rate, (p.nightly + ([5, 6].includes(dow) ? p.weekend : 0)).toFixed(2), d); assert.equal(at(d).min_stay_arrival, p.minNights); }
    assert.ok(vals.every(v => v.rate_plan_id === i.map[p.id].rate));

    // a price change goes out; the dates do not need sending again
    const n0 = f.calls.length;
    w.BB.act.updateProperty ? w.BB.act.updateProperty(p.id, { nightly: p.nightly + 10 }) : (p.nightly += 10);
    await cx.run(w);
    const sent = f.calls.slice(n0);
    assert.equal(sent.filter(c => c.path === '/api/v1/restrictions').length, 1, 'only the home whose price changed');
    assert.equal(sent.filter(c => c.path === '/api/v1/availability').length, 0);
  } finally { f.restore(); }
});

test('bookings from every site come in through the feed, are acknowledged, and cancellations reopen the dates', async () => {
  const { w, cx } = rig({ paying: [{ addon: true }], minHosts: 0 });
  const s = w.state; const feed = []; const f = fakeFetch(channexApi(feed));
  try {
    w.BB.act.joinAllChannels(false); w.drainEffects(); await cx.gate(true); await cx.run(w);
    const i = w.BB.q.integration('hub'); const p = s.properties[1]; const prop = i.map[p.id].property;
    const from = ical.addDay(s.today, 200), to = ical.addDay(s.today, 203);
    feed.push({ id: 'rev-1', property_id: prop, booking_id: 'bk-1', status: 'new', ota_name: 'Airbnb', ota_reservation_code: 'HM123', arrival_date: from, departure_date: to, amount: '540.00', currency: 'GBP', customer: { name: 'Sam', surname: 'Taylor', mail: 'sam@example.com' }, rooms: [{ checkin_date: from, checkout_date: to }] });
    feed.push({ id: 'rev-x', property_id: 'not-ours', booking_id: 'bk-x', status: 'new', arrival_date: from, departure_date: to });
    const notes0 = s.notifications.length;
    const r = await cx.pull();
    assert.equal(r.read, 1);
    const k = s.blocks.find(x => x.sync === 'hub' && x.ref === 'bk-1');
    assert.ok(k, 'the stay is on the calendar');
    assert.deepEqual([k.propertyId, k.from, k.to, k.ota, k.guest, k.code], [p.id, from, to, 'Airbnb', 'Sam T.', 'HM123']);
    assert.ok(!JSON.stringify(s).includes('sam@example.com'), 'guest contact details are not kept');
    assert.ok(!w.BB.q.isAvailable(p.id, from, to), 'those nights are closed on the booking site');
    assert.ok(s.notifications.length > notes0 && /New Airbnb booking/.test(s.notifications[0].title));
    const acks = f.calls.filter(c => /\/ack$/.test(c.path)).map(c => c.path);
    assert.deepEqual(acks, ['/api/v1/booking_revisions/rev-1/ack'], 'acknowledged once saved; an unknown property is left in the feed');

    // the same booking read again changes nothing
    feed.push({ id: 'rev-1b', property_id: prop, booking_id: 'bk-1', status: 'modified', ota_name: 'Airbnb', arrival_date: from, departure_date: to, customer: { name: '***', surname: '***' } });
    await cx.pull();
    assert.equal(s.blocks.filter(x => x.ref === 'bk-1').length, 1);

    feed.push({ id: 'rev-2', property_id: prop, booking_id: 'bk-1', status: 'cancelled', ota_name: 'Airbnb', arrival_date: from, departure_date: to });
    await cx.pull();
    assert.equal(s.blocks.filter(x => x.ref === 'bk-1').length, 0, 'cancelled on Airbnb, open again');
    assert.ok(w.BB.q.isAvailable(p.id, from, to));
    assert.ok(/Cancelled on Airbnb/.test(s.notifications[0].title));
  } finally { f.restore(); }
});

test('the connect screen link, the webhook secret, and switching off', async () => {
  const { w, cx } = rig({ paying: [], minHosts: 0 });
  const f = fakeFetch(channexApi([]));
  try {
    w.BB.act.joinAllChannels(false); w.drainEffects(); await cx.gate(true); await cx.run(w);
    const p = w.state.properties[0]; const i = w.BB.q.integration('hub');
    const url = new URL(await cx.connectUrl(w, p.id));
    assert.equal(url.host, 'staging.channex.io'); assert.equal(url.pathname, '/auth/exchange');
    assert.equal(url.searchParams.get('oauth_session_key'), 'ott-1'); assert.equal(url.searchParams.get('app_mode'), 'headless');
    assert.equal(url.searchParams.get('redirect_to'), '/channels'); assert.equal(url.searchParams.get('property_id'), i.map[p.id].property);
    const tok = f.calls.find(c => c.path === '/api/v1/auth/one_time_token').body.one_time_token;
    assert.equal(tok.property_id, i.map[p.id].property); assert.ok(tok.username);
    assert.equal(cx.hookOk(cx.hookSecret()), true); assert.equal(cx.hookOk('nope'), false); assert.equal(cx.hookOk(''), false);

    w.BB.act.leaveAllChannels(); w.drainEffects();
    assert.equal(i.connected, false); assert.ok(!w.state.account.tier);
    const n = f.calls.length; await cx.run(w); assert.equal(f.calls.length, n, 'nothing sent once switched off');
  } finally { f.restore(); }
});

test('the add-on on a running subscription follows the plan the host picks', async () => {
  const cfg = { stripe: { key: 'sk_test_x', prices: { addon: 'p_add', addonAnnual: 'p_add_y', allChannels: 'p_all', allChannelsAnnual: 'p_all_y', Growth: 'p_g' } } };
  const stripe = require('../server/stripe')(cfg);
  assert.equal(stripe.addonPrice({ addon: true }), 'p_add');
  assert.equal(stripe.addonPrice({ addon: true, tier: 'all', annual: true }), 'p_all_y');
  assert.equal(stripe.addonPrice({ addon: false, tier: 'all' }), null);
  let items = [{ id: 'si_g', price: { id: 'p_g' } }, { id: 'si_a', price: { id: 'p_add' } }];
  const f = fakeFetch([
    c => c.path === '/v1/subscriptions' ? [200, { data: [{ id: 'sub_1', items: { data: items } }] }] : undefined,
    c => c.path === '/v1/subscription_items' && c.method === 'POST' ? (items.push({ id: 'si_' + c.body.price, price: { id: c.body.price } }), [200, {}]) : undefined,
    c => c.path.startsWith('/v1/subscription_items/') && c.method === 'DELETE' ? (items = items.filter(x => '/v1/subscription_items/' + x.id !== c.path), [200, {}]) : undefined,
  ]);
  try {
    assert.equal((await stripe.syncAddon('cus_1', 'p_add')).changed, false);
    await stripe.syncAddon('cus_1', 'p_all');
    assert.deepEqual(items.map(x => x.price.id), ['p_g', 'p_all'], '£29 replaces £15, never both');
    assert.equal(f.calls.find(c => c.method === 'POST').body.proration_behavior, 'create_prorations');
    await stripe.syncAddon('cus_1', null);
    assert.deepEqual(items.map(x => x.price.id), ['p_g'], 'switching off removes it; the plan stays');
  } finally { f.restore(); }
});

test('hosts never see the Channex name: not in the app, the styles or the errors', async () => {
  const b = require('../web/build')();
  for (const [k, v] of Object.entries({ css: b.css, prod: b.prodJs, demo: b.demoJs })) assert.doesNotMatch(v, /channex/i, k);
  const src = require('fs').readFileSync(require.resolve('../server/channex'), 'utf8');
  assert.ok(!/error = 'Channex/.test(src), 'errors shown to hosts do not name Channex');
  assert.ok(!/email: s\.account\.email/.test(src), 'the host email is never given to Channex, so it cannot email them');
});
