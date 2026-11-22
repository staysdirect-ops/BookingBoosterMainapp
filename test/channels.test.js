// Channel manager APIs (server/channels.js), run in-process against fake Smoobu and Hostaway servers.
// Checks the real request shapes, two-way sync, echo handling and clean-up on cancel and disconnect.
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { Workspace, seedDemo } = require('../server/engine');
const makeChannels = require('../server/channels');
const ical = require('../server/ical');

function rig() {
  const w = new Workspace('w1', seedDemo()); w.kind = 'live';
  const ws = { open: async () => w, withWs: async (id, fn) => { const r = fn(w.BB, w); w.drainEffects(); return r; } };
  const store = new Map();
  const secrets = { get: async (wid, k) => store.get(k) || null, set: async (wid, k, v) => { store.set(k, v); }, del: async (wid, k) => { store.delete(k); } };
  const ch = makeChannels({ ws, secrets, log: () => {}, host: 'booking-booster.co.uk' });
  return { w, ch, store };
}
const day = (s, n) => ical.addDay(s.today, n);

// Checks a request the way Smoobu does: signature over method, path, sorted query, timestamp, nonce, body hash, key.
const crypto = require('node:crypto');
function smoobuOk(c) {
  if (c.host !== 'login.smoobu.com') return true;
  const h = c.headers; if (h['X-API-Key'] !== 'key-123' || !h['X-Nonce'] || !h['X-Timestamp']) return false;
  if (Math.abs(Date.parse(h['X-Timestamp']) - Date.now()) > 300e3) return false;
  const qs = [...c.q.keys()].sort().map(k => encodeURIComponent(k) + '=' + encodeURIComponent(c.q.get(k))).join('&');
  const bodyHash = crypto.createHash('sha256').update(c.rawBody || '').digest('hex');
  const want = crypto.createHmac('sha256', 'shh').update([c.method, c.path, qs, h['X-Timestamp'], h['X-Nonce'], bodyHash, 'key-123'].join('\n')).digest('base64');
  return want === h['X-Signature'];
}
// A tiny fake of the parts of each API we use. Records every call.
function fakeFetch(handlers) {
  const calls = [];
  const real = global.fetch;
  global.fetch = async (url, opts = {}) => {
    const u = new URL(url); const body = opts.body ? (String(opts.headers['content-type']).includes('json') ? JSON.parse(opts.body) : Object.fromEntries(new URLSearchParams(opts.body))) : null;
    const call = { rawBody: opts.body || '', method: opts.method || 'GET', host: u.host, path: u.pathname, q: u.searchParams, headers: opts.headers || {}, body }; calls.push(call);
    for (const h of handlers) { const r = h(call); if (r !== undefined) return new Response(JSON.stringify(r[1]), { status: r[0], headers: { 'content-type': 'application/json' } }); }
    return new Response('{}', { status: 404 });
  };
  return { calls, restore: () => { global.fetch = real; } };
}

test('Smoobu: connect, close direct bookings there, read its bookings back without echoes', async () => {
  const { w, ch, store } = rig(); const s = w.state; const p = s.properties[0];
  const remote = [{ id: 501, arrival: day(s, 30), departure: day(s, 33), type: 'reservation' }];
  let nextId = 900;
  const f = fakeFetch([
    c => !smoobuOk(c) ? [401, { error: 'bad signature' }] : undefined,
    c => c.path === '/api/apartments' ? [200, { apartments: [{ id: 77, name: p.name }, { id: 78, name: 'Somewhere else' }] }] : undefined,
    c => c.path === '/api/reservations' && c.method === 'GET' ? [200, { page_count: 1, bookings: remote }] : undefined,
    c => c.path === '/api/reservations' && c.method === 'POST' ? (remote.push({ id: ++nextId, arrival: c.body.arrivalDate, departure: c.body.departureDate, type: 'reservation' }), [201, { id: nextId }]) : undefined,
    c => c.method === 'DELETE' ? (remote.splice(remote.findIndex(x => '/api/reservations/' + x.id === c.path), 1), [200, {}]) : undefined,
  ]);
  try {
    await assert.rejects(ch.connect(w, 'smoobu', { apiKey: 'key-123', apiSecret: 'wrong' }), /did not accept the key/);
    const listings = await ch.connect(w, 'smoobu', { apiKey: 'key-123', apiSecret: 'shh' });
    assert.equal(listings.length, 2);
    const i = w.BB.q.integration('smoobu');
    assert.equal(i.connected, true); assert.equal(i.map[p.id], '77', 'the home with the same name is linked by itself');
    assert.ok(!JSON.stringify(s).includes('key-123'), 'the key never goes into the account state the browser sees');
    assert.match(store.get('cm:smoobu'), /key-123/);
    assert.ok(!JSON.stringify(s).includes('shh'), 'nor the secret');

    await ch.sync(w, { id: 'smoobu' });
    const mine = s.bookings.filter(b => b.propertyId === p.id && b.status !== 'cancelled' && b.checkOut > s.today);
    const posts = f.calls.filter(c => c.method === 'POST');
    assert.equal(posts.length, mine.length + s.blocks.filter(k => k.propertyId === p.id && !k.sync && k.to > s.today).length, 'every direct booking and own block is closed in Smoobu');
    assert.ok(posts.every(c => c.body.apartmentId === 77 && /^\d{4}-\d{2}-\d{2}$/.test(c.body.arrivalDate)));
    assert.ok(posts.every(c => !c.body.email && !String(c.body.lastName).includes('@')), 'no guest details are sent');
    const got = s.blocks.filter(k => k.sync === 'smoobu');
    assert.deepEqual(got.map(k => [k.from, k.to]), [[day(s, 30), day(s, 33)]], 'only the stay booked in Smoobu is blocked, not our own bookings coming back');
    assert.ok(i.status[p.id].ok && !i.status[p.id].error);

    // running again changes nothing
    const before = f.calls.length; await ch.sync(w, { id: 'smoobu' });
    assert.equal(f.calls.slice(before).filter(c => c.method !== 'GET').length, 0, 'a second run sends nothing new');

    // a cancelled direct booking reopens its nights there
    const b = mine.find(x => x.status === 'confirmed' && x.checkIn > s.today) || mine[0];
    w.BB.act.cancelBooking(b.id, 'host'); w.drainEffects();
    await ch.sync(w, { id: 'smoobu', pull: false });
    assert.equal(f.calls.filter(c => c.method === 'DELETE').length, 1);
    assert.ok(!Object.keys(i.pushed).includes('b:' + b.id));

    // disconnecting reopens everything we closed and forgets the key
    await ch.disconnect(w, 'smoobu');
    assert.equal(f.calls.filter(c => c.method === 'DELETE').length, posts.length);
    assert.equal(store.has('cm:smoobu'), false);
  } finally { f.restore(); }
});

test('Hostaway: token is kept, calendar days become blocks, our own nights are left out', async () => {
  const { w, ch, store } = rig(); const s = w.state; const p = s.properties[1];
  const closed = new Set([day(s, 40), day(s, 41)]); let tokens = 0;
  const f = fakeFetch([
    c => c.path === '/v1/accessTokens' ? (tokens++, c.body.client_id === '1234' && c.body.client_secret === 'sec' ? [200, { access_token: 'tok', expires_in: 3600 * 24 * 365 }] : [403, { message: 'no' }]) : undefined,
    c => c.headers.authorization !== 'Bearer tok' ? [403, { message: 'no' }] : undefined,
    c => c.path === '/v1/listings' ? [200, { result: [{ id: 9, name: 'Unrelated' }] }] : undefined,
    c => c.path === '/v1/listings/9/calendar' && c.method === 'PUT' ? (ical.nightsOf(c.body.startDate, ical.addDay(c.body.endDate, 1)).forEach(n => c.body.isAvailable ? closed.delete(n) : closed.add(n)), [200, { status: 'success' }]) : undefined,
    c => c.path === '/v1/listings/9/calendar' ? [200, { result: ical.nightsOf(c.q.get('startDate'), c.q.get('endDate')).map(d => ({ date: d, isAvailable: closed.has(d) ? 0 : 1 })) }] : undefined,
  ]);
  try {
    await ch.connect(w, 'hostaway', { accountId: '1234', apiKey: 'sec' });
    const i = w.BB.q.integration('hostaway');
    assert.equal(Object.keys(i.map).length, 0, 'names do not match, so nothing is linked until the host picks');
    w.BB.act.mapChannelListing('hostaway', p.id, '9'); const fx = w.drainEffects();
    assert.ok(fx.some(x => x.type === 'channels.sync'), 'linking starts a sync');
    assert.equal(w.BB.act.mapChannelListing('hostaway', p.id, 'nope').ok, false, 'only listings from the account can be picked');
    await ch.sync(w, { id: 'hostaway' });
    const puts = f.calls.filter(c => c.method === 'PUT');
    assert.ok(puts.length > 0 && puts.every(c => c.body.isAvailable === 0));
    assert.ok(puts.every(c => c.body.endDate < ical.addDay(c.body.endDate, 1)), 'end date is the last night');
    const got = s.blocks.filter(k => k.sync === 'hostaway');
    assert.deepEqual(got.map(k => [k.from, k.to]), [[day(s, 40), day(s, 42)]], 'only the nights closed in Hostaway itself are blocked here');
    await ch.sync(w, { id: 'hostaway' });
    assert.equal(tokens, 1, 'the access token is reused');
    assert.match(store.get('cm:hostaway'), /"token":"tok"/);
  } finally { f.restore(); }
});

test('a failing channel manager keeps the dates it already gave us and says why', async () => {
  const { w, ch } = rig(); const s = w.state; const p = s.properties[0];
  let up = true;
  const f = fakeFetch([
    c => !up ? [500, { message: 'down' }] : undefined,
    c => c.path === '/api/apartments' ? [200, { apartments: [{ id: 5, name: p.name }] }] : undefined,
    c => c.path === '/api/reservations' && c.method === 'GET' ? [200, { page_count: 1, bookings: [{ id: 1, arrival: day(s, 50), departure: day(s, 52) }] }] : undefined,
    c => c.path === '/api/reservations' && c.method === 'POST' ? [201, { id: Math.floor(Math.random() * 1e6) }] : undefined,
  ]);
  try {
    await ch.connect(w, 'smoobu', { apiKey: 'key-123', apiSecret: 'shh' }); await ch.sync(w, { id: 'smoobu' });
    assert.equal(s.blocks.filter(k => k.sync === 'smoobu').length, 1);
    up = false; await ch.sync(w, { id: 'smoobu' });
    const i = w.BB.q.integration('smoobu');
    assert.equal(s.blocks.filter(k => k.sync === 'smoobu').length, 1, 'blocks stay while Smoobu is down');
    assert.match(i.status[p.id].error, /Smoobu answered with error 500/); assert.ok(i.error);
  } finally { f.restore(); }
});

test('Smoobu signature matches the worked example in its docs', () => {
  const { smoobuSign } = require('../server/channels');
  const a = smoobuSign({ apiKey: 'K', apiSecret: 'S' }, 'GET', '/api/reservations', { to: '2026-04-10', from: '2026-04-01' }, '', new Date('2026-04-01T12:00:00Z'), 'n-1');
  assert.equal(a.qs, 'from=2026-04-01&to=2026-04-10', 'query sorted by key');
  assert.equal(a.headers['X-Timestamp'], '2026-04-01T12:00:00Z');
  const canonical = 'GET\n/api/reservations\nfrom=2026-04-01&to=2026-04-10\n2026-04-01T12:00:00Z\nn-1\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\nK';
  assert.equal(a.headers['X-Signature'], crypto.createHmac('sha256', 'S').update(canonical).digest('base64'));
});

test('every account gets the new calendars, and the demo still works', () => {
  const { w } = rig();
  for (const id of ['other', 'beds24', 'smoobu', 'hostaway', 'guesty', 'lodgify']) assert.ok(w.BB.q.integration(id), id);
  const old = seedDemo(); old.integrations = old.integrations.filter(i => !['other', 'beds24'].includes(i.id));
  const w2 = new Workspace('w2', old); assert.ok(w2.BB.q.integration('beds24'), 'added to an older account on load');
  assert.equal(w2.state.integrations.filter(i => i.id === 'beds24').length, 1);
});
