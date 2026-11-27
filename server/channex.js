// All channels: one Channex account, run by Bookingbooster, that lists every host's homes on Airbnb, Booking.com, Vrbo,
// Expedia and 70+ more booking sites. The host never signs up to anything else.
//
//   provision  each home becomes a Channex property with one room type (one unit) and one nightly rate plan in GBP
//   push       open nights (availability 1 or 0) for the next 500 days, and on the All channels plan the nightly price
//              and minimum stay as well, sent as date ranges so a home costs two requests however long the window
//   pull       new, changed and cancelled bookings from every site, read from the Channex booking feed (a webhook nudges
//              it straight away, and the scheduled tick reads it every minute anyway), saved here and then acknowledged
//   connect    the host links their Airbnb, Booking.com or Vrbo account in the Channex screen shown inside Connections
//
// Money: Channex charges a monthly platform fee plus a little per home with a live channel. It only switches on once
// enough hosts pay for the add-on to cover that (cfg.channex.minHosts, 9 by default), so it never runs at a loss.
// Until then hosts can still join: their homes are set up the moment it switches on.
'use strict';
const crypto = require('crypto');
const ical = require('./ical');

class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }
const DAYS = 500;

module.exports = function ({ cfg, ws, db, log }) {
  const C = cfg.channex || {};
  const base = () => String(C.base || 'https://staging.channex.io').replace(/\/+$/, '');
  const ready = () => !!C.key;
  const kvGet = db.prepare('SELECT v FROM kv WHERE k = ?'), kvSet = db.prepare('INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)');
  const payingRows = db.prepare("SELECT state FROM workspaces WHERE kind = 'live' AND billing_status = 'active'");
  const hookSecret = () => C.hookSecret || crypto.createHmac('sha256', String(cfg.secret || 'bb')).update('channex-hook').digest('hex').slice(0, 40);

  async function api(method, path, { body, query } = {}) {
    if (!ready()) throw new ApiError('is not set up on this server yet.');
    const qs = query ? '?' + new URLSearchParams(query).toString() : '';
    let r;
    try {
      r = await fetch(base() + '/api/v1' + path + qs, { method, headers: { 'user-api-key': C.key, accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'Bookingbooster (+https://booking-booster.co.uk)' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    } catch (e) { throw new ApiError(e.name === 'TimeoutError' ? 'took too long to answer.' : 'could not be reached.'); }
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (_) {}
    if (r.status === 429) throw new ApiError('asked us to slow down. We will send it again shortly.', 429);
    if (!r.ok) {
      const e = j && j.errors; const det = e && e.details ? Object.entries(e.details).map(([k, v]) => k + ' ' + [].concat(v).join(', ')).join('; ') : '';
      throw new ApiError('answered with error ' + r.status + (e ? ' (' + String(e.title || e.code || '') + (det ? ': ' + det : '') + ')' : ''), r.status);
    }
    return j;
  }
  const idOf = j => j && j.data && (j.data.id || (j.data.attributes && j.data.attributes.id));

  /* ---------- the gate: on only once it pays for itself ---------- */
  let gateCache = null;
  async function gate(fresh) {
    if (gateCache && !fresh && Date.now() - gateCache.at < 10 * 60e3) return gateCache;
    let paying = 0;
    try { for (const r of await payingRows.all()) { try { if (JSON.parse(r.state).account.addon) paying++; } catch (_) {} } } catch (e) { log('channex gate', e.message); }
    const need = Math.max(0, +C.minHosts || 0);
    gateCache = { at: Date.now(), ready: ready(), paying, need, live: ready() && (C.always || paying >= need) };
    return gateCache;
  }
  const pub = () => { const g = gateCache || { ready: ready(), paying: 0, need: +C.minHosts || 0, live: false }; return { ready: g.ready, live: g.live, paying: g.paying, need: g.need, provider: 'Channex.io' }; }; // provider: the name Booking.com and Expedia list us under

  /* ---------- property index: Channex property id -> workspace and home ---------- */
  const idx = async pid => { const r = await kvGet.get('channex:prop:' + pid); return r ? JSON.parse(r.v) : null; };
  const setIdx = (cid, wid, pid) => kvSet.run('channex:prop:' + cid, JSON.stringify({ wid, pid }));

  /* ---------- provision ---------- */
  const save = (wid, fn) => ws.withWs(wid, BB => { const i = BB.q.integration('hub'); if (!i) return; fn(i, BB.store.get()); BB.store.commit({ quiet: true }); }, { quiet: true });
  async function provision(w) {
    const s = w.state; const i0 = s.integrations.find(x => x.id === 'hub'); if (!i0) return;
    let group = i0.cxGroup;
    if (!group) {
      group = idOf(await api('POST', '/groups', { body: { group: { title: String(s.account.business || 'Bookingbooster host').slice(0, 200) + ' (' + w.id + ')' } } }));
      await save(w.id, i => { i.cxGroup = group; });
    }
    const map = Object.assign({}, i0.map || {});
    for (const p of s.properties) {
      const m = Object.assign({}, map[p.id] || {});
      if (m.property && m.room && m.rate) continue;
      if (!m.property) {
        const area = String(p.area || '').split(',').map(x => x.trim()).filter(Boolean);
        m.property = idOf(await api('POST', '/properties', { body: { property: { title: String(p.name).slice(0, 250), currency: 'GBP', timezone: 'Europe/London', property_type: 'apartment', country: 'GB', city: area[0] || undefined, group_id: group, settings: { min_stay_type: 'arrival' } } } }));
        await setIdx(m.property, w.id, p.id);
      }
      if (!m.room) m.room = idOf(await api('POST', '/room_types', { body: { room_type: { property_id: m.property, title: String(p.short || p.name).slice(0, 200), count_of_rooms: 1, occ_adults: Math.max(1, +p.maxGuests || 2), occ_children: 0, occ_infants: 0, room_kind: 'room' } } }));
      if (!m.rate) m.rate = idOf(await api('POST', '/rate_plans', { body: { rate_plan: { property_id: m.property, room_type_id: m.room, title: 'Standard', sell_mode: 'per_room', rate_mode: 'manual', currency: 'GBP', meal_type: 'none', options: [{ occupancy: Math.max(1, +p.maxGuests || 2), is_primary: true, rate: String((+p.nightly || 100).toFixed(2)) }] } } }));
      map[p.id] = m;
      await save(w.id, i => { i.map = i.map || {}; i.map[p.id] = m; });
      log('hub', w.id, 'set up', p.id, m.property);
    }
  }

  /* ---------- push: open nights, prices, minimum stays ---------- */
  // What each home should look like everywhere, as ranges of equal values.
  function plan(w) {
    const out = {}; const s = w.state; const BB = w.BB; const prices = s.account.tier === 'all';
    const i = s.integrations.find(x => x.id === 'hub'); const today = s.today;
    for (const p of s.properties) {
      const m = (i.map || {})[p.id]; if (!m || !m.rate) continue;
      const bl = BB.q.blocked(p.id); const avail = [], rates = [];
      for (let k = 0; k < DAYS; k++) {
        const d = ical.addDay(today, k);
        avail.push([d, bl.has(d) ? 0 : 1]);
        if (prices) { const dow = new Date(d + 'T12:00:00Z').getUTCDay(); rates.push([d, ((+p.nightly || 0) + ([5, 6].includes(dow) ? +p.weekend || 0 : 0)).toFixed(2) + '/' + Math.max(1, +p.minNights || 1)]); }
      }
      const runs = list => { const r = []; for (const [d, v] of list) { const last = r[r.length - 1]; if (last && last.v === v && ical.addDay(last.to, 1) === d) last.to = d; else r.push({ from: d, to: d, v }); } return r; };
      out[p.id] = { m, avail: runs(avail), rates: prices ? runs(rates) : null };
    }
    return out;
  }
  const hash = x => crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex').slice(0, 16);
  async function push(w, { force } = {}) {
    const i = w.state.integrations.find(x => x.id === 'hub'); const sent = Object.assign({}, i.sent || {}); const status = {};
    for (const [pid, P] of Object.entries(plan(w))) {
      const st = { checked: new Date().toISOString() };
      try {
        const ha = hash(P.avail), hr = P.rates ? hash(P.rates) : null; const was = sent[pid] || {};
        const stale = !was.at || Date.now() - was.at > 20 * 3600e3; // a fresh full send once a day keeps the 500 day window rolling
        if (force || stale || was.a !== ha) await api('POST', '/availability', { body: { values: P.avail.map(r => ({ property_id: P.m.property, room_type_id: P.m.room, date_from: r.from, date_to: r.to, availability: r.v })) } });
        if (hr && (force || stale || was.r !== hr)) await api('POST', '/restrictions', { body: { values: P.rates.filter(r => +r.v.split('/')[0] > 0).map(r => { const [rate, min] = r.v.split('/'); return { property_id: P.m.property, rate_plan_id: P.m.rate, date_from: r.from, date_to: r.to, rate, min_stay_arrival: +min }; }) } });
        sent[pid] = { a: ha, r: hr, at: (force || stale || was.a !== ha || (hr && was.r !== hr)) ? Date.now() : was.at };
        st.ok = st.checked;
      } catch (e) { st.error = 'The channel connection ' + e.message; log('channex push', w.id, pid, e.message); }
      status[pid] = st;
    }
    await save(w.id, x => {
      x.sent = sent; x.status = Object.assign({}, x.status || {}, status);
      const err = Object.values(x.status).map(v => v.error).find(Boolean) || null;
      x.error = err; const s = w.state; if (!err) x.lastSync = s.today + 'T' + s.clock;
    });
  }

  /* ---------- pull: bookings from every site ---------- */
  const short = c => { if (!c) return ''; const n = String(c.name || '').trim(), sn = String(c.surname || '').trim(); const real = x => x && x !== '***'; return [real(n) ? n : '', real(sn) ? sn[0] + '.' : ''].filter(Boolean).join(' '); };
  let pulling = null;
  function pull() { if (!pulling) pulling = pullNow().finally(() => { pulling = null; }); return pulling; }
  async function pullNow() {
    if (!ready() || !(await gate()).live) return { read: 0 };
    let read = 0;
    for (let page = 0; page < 10; page++) {
      const j = await api('GET', '/booking_revisions/feed', { query: { 'order[inserted_at]': 'asc', 'pagination[limit]': '100' } });
      const list = (j && j.data) || []; if (!list.length) break;
      let done = 0;
      for (const it of list) {
        const a = Object.assign({ id: it.id }, it.attributes || {});
        const at = await idx(a.property_id);
        if (!at) { log('hub', 'booking for a property we do not know', a.property_id); continue; } // left in the feed; someone must look
        const room = (a.rooms || [])[0] || {};
        const r = { ref: String(a.booking_id || a.id), status: a.status, from: a.arrival_date || room.checkin_date, to: a.departure_date || room.checkout_date, ota: a.ota_name, guest: short(a.customer), code: a.ota_reservation_code || a.unique_id || '', amount: a.amount ? String(a.amount) : null, currency: a.currency || '' };
        try {
          await ws.withWs(at.wid, BB => BB.act.applyHubBooking(at.pid, r), { action: 'channexBooking' });
          await api('POST', '/booking_revisions/' + encodeURIComponent(a.id) + '/ack');
          read++; done++;
        } catch (e) { log('channex pull', at.wid, a.id, e.message); }
      }
      if (!done) break; // nothing could be saved; try again on the next tick rather than spin
    }
    return { read };
  }

  /* ---------- webhook: a nudge, then we read the feed ---------- */
  async function ensureHook() {
    if (!ready() || !cfg.baseUrl || /localhost|127\.0\.0\.1/.test(cfg.baseUrl)) return;
    const r = await kvGet.get('channex:hook'); if (r && JSON.parse(r.v).base === base()) return;
    try {
      const j = await api('POST', '/webhooks', { body: { webhook: { callback_url: cfg.baseUrl + '/webhooks/channex', event_mask: 'booking_new;booking_modification;booking_cancellation', is_global: true, is_active: true, send_data: false, headers: { 'x-bb-hook': hookSecret() } } } });
      await kvSet.run('channex:hook', JSON.stringify({ base: base(), id: idOf(j) }));
    } catch (e) { log('channex hook', e.message); if (e.status === 422) await kvSet.run('channex:hook', JSON.stringify({ base: base(), id: null, note: e.message })); }
  }
  const hookOk = h => { const a = Buffer.from(String(h || '')), b = Buffer.from(hookSecret()); return a.length === b.length && crypto.timingSafeEqual(a, b); };

  /* ---------- the Channex screen where the host links Airbnb, Booking.com, Vrbo ---------- */
  async function connectUrl(w, pid) {
    const i = w.state.integrations.find(x => x.id === 'hub'); const m = i && i.map && i.map[pid];
    if (!m || !m.property) throw new ApiError('is still setting up this home. Try again in a minute.', 409);
    const j = await api('POST', '/auth/one_time_token', { body: { one_time_token: { property_id: m.property, group_id: i.cxGroup || undefined, username: 'bb-' + w.id } } });
    const t = j && j.data && j.data.token; if (!t) throw new ApiError('did not give us a sign-in link.');
    const q = new URLSearchParams({ oauth_session_key: t, app_mode: 'headless', redirect_to: '/channels', property_id: m.property, lng: 'en' }); if (i.cxGroup) q.set('group_id', i.cxGroup);
    // CHANNEX_FRAME_BASE: our own white-label domain for the screen (set up with Channex support), so hosts see our address.
    return String(C.frameBase || base()).replace(/\/+$/, '') + '/auth/exchange?' + q.toString();
  }

  /* ---------- one workspace, from a change or the scheduled tick ---------- */
  const running = new Map();
  function run(w, opts = {}) {
    const prev = running.get(w.id) || Promise.resolve();
    const next = prev.then(() => runNow(w.id, opts)).catch(e => log('hub', w.id, e.message));
    running.set(w.id, next); next.finally(() => { if (running.get(w.id) === next) running.delete(w.id); });
    return next;
  }
  async function runNow(wid, opts) {
    let w = await ws.open(wid); if (!w || w.kind !== 'live') return;
    const i = w.state.integrations.find(x => x.id === 'hub'); if (!i || !i.connected) return;
    const g = await gate();
    if (!g.live) { if (!i.waiting) await save(wid, x => { x.waiting = true; }); return; }
    try { await provision(w); } catch (e) { log('channex provision', wid, e.message); await save(wid, x => { x.error = 'The channel connection ' + e.message; }); return; }
    if (i.waiting) await save(wid, x => { x.waiting = false; });
    w = await ws.open(wid);
    await push(w, opts);
  }

  return { ready, gate, pub, api, provision, push, pull, run, connectUrl, ensureHook, hookOk, hookSecret, plan };
};
module.exports.ApiError = ApiError;
