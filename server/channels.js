// Channel manager connections for the calendar sync add-on, using the host's own API key (no partner deal needed).
// Two-way: dates booked or blocked in the channel manager are blocked on the host's sites, and every direct booking
// (and every block the host makes here) closes the same nights in the channel manager, which passes that on to
// Airbnb, Booking.com, Vrbo and the rest. Dates only: no guest names, prices or messages are sent either way.
//
// Each adapter:
//   connect(creds)              -> { creds, listings: [{ id, name }] }   checks the key and lists the homes there
//   busy(ctx, listingId, a, b)  -> { ranges: [{ from, to, ref }] } or { nights: ['YYYY-MM-DD', ...] }   dates taken there
//   block(ctx, listingId, from, to, note) -> ref                          closes nights from..to (checkout style)
//   unblock(ctx, listingId, rec)                                          opens them again
// ctx = { creds, save(creds) } so an adapter can keep a fresh access token.
'use strict';
const crypto = require('crypto');
const ical = require('./ical');

const UA = 'Bookingbooster calendar sync (+https://booking-booster.co.uk)';
class ApiError extends Error { constructor(msg, status) { super(msg); this.status = status; } }

async function http(method, url, { headers = {}, body, form, timeout = 15000 } = {}) {
  const h = Object.assign({ 'user-agent': UA, accept: 'application/json' }, headers);
  let payload;
  if (form) { h['content-type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
  else if (body !== undefined) { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
  let r;
  try { r = await fetch(url, { method, headers: h, body: payload, signal: AbortSignal.timeout(timeout) }); }
  catch (e) { throw new ApiError(e.name === 'TimeoutError' ? 'took too long to answer' : 'could not be reached'); }
  const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch (_) {}
  if (r.status === 401 || r.status === 403) throw new ApiError('did not accept the key. Check it and connect again.', r.status);
  if (r.status === 429) throw new ApiError('asked us to slow down. We will try again shortly.', 429);
  if (!r.ok) throw new ApiError('answered with error ' + r.status + (j && (j.message || j.error) ? ' (' + String(j.message || j.error).slice(0, 120) + ')' : ''), r.status);
  return j;
}
const need = (creds, keys) => { for (const k of keys) if (!String(creds[k] || '').trim()) throw new ApiError('needs your ' + k.replace(/([A-Z])/g, ' $1').toLowerCase() + '.'); };
const lastNight = to => ical.addDay(to, -1);

/* ---------------- Beds24 (API v2) ---------------- */
// The host makes an invite code in Beds24 (Settings > Apps & Integrations > API) with read and write bookings and
// read properties; we swap it once for a refresh token, then fetch a 24 hour access token when needed.
const BEDS24 = 'https://api.beds24.com/v2';
const beds24 = {
  name: 'Beds24',
  fields: [{ key: 'inviteCode', label: 'Invite code', secret: true }],
  async token(ctx) {
    if (ctx.creds.token && ctx.creds.tokenExp > Date.now() + 60e3) return ctx.creds.token;
    const j = await http('GET', BEDS24 + '/authentication/token', { headers: { refreshToken: ctx.creds.refreshToken } });
    ctx.creds.token = j.token; ctx.creds.tokenExp = Date.now() + (Number(j.expiresIn) || 86400) * 1000; await ctx.save(ctx.creds);
    return j.token;
  },
  async connect(c) {
    let creds;
    if (c.refreshToken) creds = { refreshToken: String(c.refreshToken).trim() };
    else { need(c, ['inviteCode']); const j = await http('GET', BEDS24 + '/authentication/setup', { headers: { code: String(c.inviteCode).trim(), deviceName: 'Bookingbooster' } }); creds = { refreshToken: j.refreshToken, token: j.token, tokenExp: Date.now() + (Number(j.expiresIn) || 86400) * 1000 }; }
    const ctx = { creds, save: async () => {} };
    const j = await http('GET', BEDS24 + '/properties?includeAllRooms=true', { headers: { token: await beds24.token(ctx) } });
    const listings = [];
    for (const p of (j && j.data) || []) for (const r of p.roomTypes || []) listings.push({ id: String(r.id), name: (p.name || 'Property') + ((p.roomTypes || []).length > 1 ? ' · ' + (r.name || r.id) : '') });
    return { creds: ctx.creds, listings };
  },
  async busy(ctx, lid, a, b) {
    const qs = new URLSearchParams({ roomId: lid, departureFrom: a, arrivalTo: b });
    ['new', 'confirmed', 'request', 'black'].forEach(x => qs.append('status', x));
    const j = await http('GET', BEDS24 + '/bookings?' + qs, { headers: { token: await beds24.token(ctx) } });
    return { ranges: ((j && j.data) || []).filter(x => x.arrival && x.departure).map(x => ({ from: x.arrival, to: x.departure, ref: String(x.id) })) };
  },
  async block(ctx, lid, from, to, note) {
    const j = await http('POST', BEDS24 + '/bookings', { headers: { token: await beds24.token(ctx) }, body: [{ roomId: Number(lid), status: 'black', arrival: from, departure: to, lastName: note, notes: note }] });
    const r = Array.isArray(j) ? j[0] : j; const id = r && (r.new && r.new.id || r.id);
    if (!id) throw new ApiError('did not confirm the block' + (r && r.errors ? ': ' + JSON.stringify(r.errors).slice(0, 120) : '.'));
    return String(id);
  },
  async unblock(ctx, lid, rec) { await http('DELETE', BEDS24 + '/bookings?id=' + encodeURIComponent(rec.ref), { headers: { token: await beds24.token(ctx) } }); },
};

/* ---------------- Smoobu ---------------- */
// The host makes an API key in Smoobu (Settings > Advanced > API Keys > Create API Key, then Generate Secret).
// Since 31 October 2026 Smoobu only accepts signed requests: X-API-Key, X-Timestamp, X-Nonce and an HMAC-SHA256
// X-Signature over method, path, sorted query, timestamp, nonce, body hash and key, joined by newlines.
const SMOOBU = 'https://login.smoobu.com';
const rfc3986 = x => encodeURIComponent(x).replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
function smoobuSign(creds, method, path, query, body, now = new Date(), nonce = crypto.randomUUID()) {
  const qs = Object.keys(query || {}).sort().map(k => rfc3986(k) + '=' + rfc3986(query[k])).join('&');
  const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const bodyHash = crypto.createHash('sha256').update(body || '').digest('hex');
  const canonical = [method, path, qs, timestamp, nonce, bodyHash, creds.apiKey].join('\n');
  const signature = crypto.createHmac('sha256', creds.apiSecret).update(canonical).digest('base64');
  return { qs, headers: { 'X-API-Key': creds.apiKey, 'X-Timestamp': timestamp, 'X-Nonce': nonce, 'X-Signature': signature, 'cache-control': 'no-cache' } };
}
async function smoobuCall(creds, method, path, query, body) {
  const raw = body === undefined ? '' : JSON.stringify(body);
  const sig = smoobuSign(creds, method, path, query, raw);
  return http(method, SMOOBU + path + (sig.qs ? '?' + sig.qs : ''), { headers: sig.headers, body });
}
const smoobu = {
  name: 'Smoobu',
  fields: [{ key: 'apiKey', label: 'API key' }, { key: 'apiSecret', label: 'API secret', secret: true }],
  async connect(c) {
    need(c, ['apiKey', 'apiSecret']); const creds = { apiKey: String(c.apiKey).trim(), apiSecret: String(c.apiSecret).trim() };
    const j = await smoobuCall(creds, 'GET', '/api/apartments');
    return { creds, listings: ((j && j.apartments) || []).map(x => ({ id: String(x.id), name: x.name || String(x.id) })) };
  },
  async busy(ctx, lid, a, b) {
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const j = await smoobuCall(ctx.creds, 'GET', '/api/reservations', { apartmentId: lid, departureFrom: a, arrivalTo: b, pageSize: '100', page: String(page), showCancellation: 'false' });
      for (const x of (j && j.bookings) || []) if (x.arrival && x.departure && !/cancel/i.test(String(x.type || ''))) out.push({ from: x.arrival, to: x.departure, ref: String(x.id) });
      if (!j || !j.page_count || page >= j.page_count) break;
    }
    return { ranges: out };
  },
  async block(ctx, lid, from, to, note) {
    const j = await smoobuCall(ctx.creds, 'POST', '/api/reservations', undefined, { arrivalDate: from, departureDate: to, apartmentId: Number(lid), firstName: 'Bookingbooster', lastName: note, notice: note + '. Dates only, made by Bookingbooster calendar sync.' });
    if (!j || !j.id) throw new ApiError('did not confirm the block.');
    return String(j.id);
  },
  async unblock(ctx, lid, rec) { await smoobuCall(ctx.creds, 'DELETE', '/api/reservations/' + encodeURIComponent(rec.ref)); },
};

/* ---------------- Hostaway ---------------- */
// The host makes an API key in Hostaway (Settings > Hostaway API) and gives us the account ID and the key.
const HOSTAWAY = 'https://api.hostaway.com/v1';
const hostaway = {
  name: 'Hostaway',
  fields: [{ key: 'accountId', label: 'Account ID' }, { key: 'apiKey', label: 'API key', secret: true }],
  async token(ctx) {
    if (ctx.creds.token && ctx.creds.tokenExp > Date.now() + 3600e3) return ctx.creds.token;
    const j = await http('POST', HOSTAWAY + '/accessTokens', { form: { grant_type: 'client_credentials', client_id: ctx.creds.accountId, client_secret: ctx.creds.apiKey, scope: 'general' } });
    ctx.creds.token = j.access_token; ctx.creds.tokenExp = Date.now() + (Number(j.expires_in) || 86400) * 1000; await ctx.save(ctx.creds);
    return j.access_token;
  },
  h: async ctx => ({ authorization: 'Bearer ' + await hostaway.token(ctx), 'cache-control': 'no-cache' }),
  async connect(c) {
    need(c, ['accountId', 'apiKey']); const ctx = { creds: { accountId: String(c.accountId).trim(), apiKey: String(c.apiKey).trim() }, save: async () => {} };
    const j = await http('GET', HOSTAWAY + '/listings?limit=500', { headers: await hostaway.h(ctx) });
    return { creds: ctx.creds, listings: ((j && j.result) || []).map(x => ({ id: String(x.id), name: x.internalListingName || x.name || String(x.id) })) };
  },
  // The calendar covers reservations and the host's own blocks alike.
  async busy(ctx, lid, a, b) {
    const j = await http('GET', HOSTAWAY + '/listings/' + encodeURIComponent(lid) + '/calendar?' + new URLSearchParams({ startDate: a, endDate: b }), { headers: await hostaway.h(ctx) });
    return { nights: ((j && j.result) || []).filter(d => d.date && (d.isAvailable === 0 || d.isAvailable === false)).map(d => String(d.date).slice(0, 10)) };
  },
  async block(ctx, lid, from, to, note) {
    await http('PUT', HOSTAWAY + '/listings/' + encodeURIComponent(lid) + '/calendar', { headers: await hostaway.h(ctx), body: { startDate: from, endDate: lastNight(to), isAvailable: 0, note } });
    return from + '/' + to;
  },
  async unblock(ctx, lid, rec) { await http('PUT', HOSTAWAY + '/listings/' + encodeURIComponent(lid) + '/calendar', { headers: await hostaway.h(ctx), body: { startDate: rec.from, endDate: lastNight(rec.to), isAvailable: 1 } }); },
};

/* ---------------- Guesty (Open API) ---------------- */
// The host makes an Open API application in Guesty (Integrations > API) and gives us its client ID and secret.
// Guesty allows only a few tokens a day, so the token is kept until it expires.
const GUESTY = 'https://open-api.guesty.com';
const guesty = {
  name: 'Guesty',
  fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client secret', secret: true }],
  async token(ctx) {
    if (ctx.creds.token && ctx.creds.tokenExp > Date.now() + 600e3) return ctx.creds.token;
    const j = await http('POST', GUESTY + '/oauth2/token', { form: { grant_type: 'client_credentials', scope: 'open-api', client_id: ctx.creds.clientId, client_secret: ctx.creds.clientSecret } });
    ctx.creds.token = j.access_token; ctx.creds.tokenExp = Date.now() + (Number(j.expires_in) || 86400) * 1000; await ctx.save(ctx.creds);
    return j.access_token;
  },
  h: async ctx => ({ authorization: 'Bearer ' + await guesty.token(ctx) }),
  async connect(c) {
    need(c, ['clientId', 'clientSecret']); const ctx = { creds: { clientId: String(c.clientId).trim(), clientSecret: String(c.clientSecret).trim() }, save: async () => {} };
    const j = await http('GET', GUESTY + '/v1/listings?' + new URLSearchParams({ limit: '100', fields: '_id title nickname' }), { headers: await guesty.h(ctx) });
    return { creds: ctx.creds, listings: ((j && j.results) || []).map(x => ({ id: String(x._id), name: x.nickname || x.title || String(x._id) })) };
  },
  async busy(ctx, lid, a, b) {
    const j = await http('GET', GUESTY + '/v1/availability-pricing/api/calendar/listings/' + encodeURIComponent(lid) + '?' + new URLSearchParams({ startDate: a, endDate: b }), { headers: await guesty.h(ctx) });
    const days = (j && j.data && j.data.days) || (j && j.days) || [];
    return { nights: days.filter(d => d.date && d.status && d.status !== 'available').map(d => String(d.date).slice(0, 10)) };
  },
  async block(ctx, lid, from, to, note) {
    await http('PUT', GUESTY + '/v1/availability-pricing/api/calendar/listings/' + encodeURIComponent(lid), { headers: await guesty.h(ctx), body: { startDate: from, endDate: lastNight(to), status: 'unavailable', note } });
    return from + '/' + to;
  },
  async unblock(ctx, lid, rec) { await http('PUT', GUESTY + '/v1/availability-pricing/api/calendar/listings/' + encodeURIComponent(lid), { headers: await guesty.h(ctx), body: { startDate: rec.from, endDate: lastNight(rec.to), status: 'available' } }); },
};

/* ---------------- Lodgify (read only) ---------------- */
// The host copies the API key from Lodgify (Settings > Public API). Lodgify's public API has no simple way to close
// dates, so direct bookings reach Lodgify through the home's Bookingbooster calendar link instead.
const LODGIFY = 'https://api.lodgify.com';
const lodgify = {
  name: 'Lodgify',
  readOnly: true,
  fields: [{ key: 'apiKey', label: 'API key', secret: true }],
  h: ctx => ({ 'X-ApiKey': ctx.creds.apiKey }),
  async connect(c) {
    need(c, ['apiKey']); const creds = { apiKey: String(c.apiKey).trim() };
    const j = await http('GET', LODGIFY + '/v2/properties?' + new URLSearchParams({ size: '100' }), { headers: lodgify.h({ creds }) });
    const items = Array.isArray(j) ? j : (j && j.items) || [];
    return { creds, listings: items.map(x => ({ id: String(x.id), name: x.name || String(x.id) })) };
  },
  async busy(ctx, lid, a, b) {
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const j = await http('GET', LODGIFY + '/v2/reservations/bookings?' + new URLSearchParams({ page: String(page), size: '50', stayFilter: 'Upcoming', includeCount: 'true' }), { headers: lodgify.h(ctx) });
      const items = (j && j.items) || [];
      for (const x of items) if (String(x.property_id) === String(lid) && x.arrival && x.departure && ['Booked', 'Tentative', 'Open'].includes(x.status)) out.push({ from: String(x.arrival).slice(0, 10), to: String(x.departure).slice(0, 10), ref: String(x.id) });
      if (items.length < 50) break;
    }
    return { ranges: out.filter(r => r.to > a && r.from < b) };
  },
};

const ADAPTERS = { beds24, smoobu, hostaway, guesty, lodgify };

module.exports = function ({ ws, secrets, log, host }) {
  const key = id => 'cm:' + id;
  async function creds(wid, id) { const raw = await secrets.get(wid, key(id)); if (!raw) return null; try { return JSON.parse(raw); } catch (_) { return null; } }

  // Check the key, keep it encrypted, and show the host which listings we found.
  async function connect(w, id, input) {
    const A = ADAPTERS[id]; if (!A) throw new ApiError('Unknown channel manager.');
    let r; try { r = await A.connect(input || {}); } catch (e) { throw new ApiError(A.name + ' ' + e.message, 400); }
    await secrets.set(w.id, key(id), JSON.stringify(r.creds));
    await ws.withWs(w.id, BB => {
      const i = BB.q.integration(id); const s = BB.store.get();
      i.connected = true; i.listings = r.listings.slice(0, 300); i.error = null; i.lastSync = s.today + 'T' + s.clock; i.map = i.map || {}; i.pushed = i.pushed || {};
      // link homes whose name matches a listing, so most hosts have nothing more to do
      const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const p of s.properties) if (!i.map[p.id]) { const l = i.listings.find(x => norm(x.name) && (norm(x.name) === norm(p.name) || norm(x.name) === norm(p.short))) || (s.properties.length === 1 && i.listings.length === 1 ? i.listings[0] : null); if (l) i.map[p.id] = l.id; }
      s.account.addon = true;
      BB.log('sync', i.name, 'Connected your ' + i.name + ' account. Found ' + i.listings.length + (i.listings.length === 1 ? ' listing' : ' listings') + '.', id);
      BB.store.commit({ type: 'integration', id });
    });
    return r.listings;
  }

  // Take back the dates we closed there, forget the key, and stop.
  async function disconnect(w, id) {
    const A = ADAPTERS[id]; const c = await creds(w.id, id); const i = w.state.integrations.find(x => x.id === id);
    if (A && c && i && A.unblock) {
      const ctx = { creds: c, save: n => secrets.set(w.id, key(id), JSON.stringify(n)) };
      for (const [, rec] of Object.entries(i.pushed || {})) { if (rec.to < w.state.today) continue; try { await A.unblock(ctx, rec.lid, rec); } catch (e) { log('channels', id, 'unblock on disconnect', e.message); } }
    }
    await secrets.del(w.id, key(id));
    await ws.withWs(w.id, BB => { const x = BB.q.integration(id); if (x) { x.pushed = {}; x.listings = []; x.map = {}; x.error = null; x.status = {}; } BB.store.commit({}); });
  }

  // Bring one channel manager in line, both ways. Safe to run as often as needed: it only changes what differs.
  async function syncOne(w, id, { pull = true, push = true, only } = {}) {
    const A = ADAPTERS[id]; const i = w.state.integrations.find(x => x.id === id);
    if (!A || !i || !i.connected || !i.map) return;
    const c = await creds(w.id, id); if (!c) return;
    const ctx = { creds: c, save: n => secrets.set(w.id, key(id), JSON.stringify(n)) };
    const s = w.state; const today = s.today; const until = ical.addDay(today, 540);
    for (const [pid, lid] of Object.entries(i.map)) {
      if (only && pid !== only) continue;
      const status = { checked: new Date().toISOString() };
      try {
        // 1. direct bookings and blocks made here -> close those nights there
        const pushed = Object.assign({}, i.pushed || {});
        if (push && A.block) {
          const want = {};
          for (const b of s.bookings) if (b.propertyId === pid && b.status !== 'cancelled' && b.checkOut > today) want['b:' + b.id] = { from: b.checkIn < today ? today : b.checkIn, to: b.checkOut, note: 'Booked direct ' + b.id };
          for (const k of s.blocks) if (k.propertyId === pid && !k.sync && k.to > today) want['k:' + k.from + ':' + k.to] = { from: k.from < today ? today : k.from, to: k.to, note: 'Not available (Bookingbooster)' };
          const adds = {}, gone = [];
          for (const [kk, rec] of Object.entries(pushed)) {
            if (rec.pid !== pid) continue;
            const wnt = want[kk];
            if (wnt && wnt.from === rec.from && wnt.to === rec.to && rec.lid === lid) continue;
            if (rec.to > today) await A.unblock(ctx, rec.lid, rec);
            gone.push(kk); delete pushed[kk];
          }
          for (const [kk, wnt] of Object.entries(want)) {
            if (pushed[kk]) continue;
            const ref = await A.block(ctx, lid, wnt.from, wnt.to, wnt.note);
            adds[kk] = pushed[kk] = { pid, lid, from: wnt.from, to: wnt.to, ref };
          }
          if (gone.length || Object.keys(adds).length) {
            status.pushed = Object.keys(adds).length; status.removed = gone.length;
            await ws.withWs(w.id, BB => { const x = BB.q.integration(id); x.pushed = x.pushed || {}; gone.forEach(k => delete x.pushed[k]); Object.assign(x.pushed, adds); BB.store.commit({ quiet: true }); }, { quiet: true });
          }
        }
        // 2. dates taken there -> blocked here (leaving out the nights we closed there ourselves)
        if (pull) {
          const got = await A.busy(ctx, lid, today, until);
          const mine = Object.values(pushed).filter(r => r.pid === pid);
          const ownRefs = new Set(mine.map(r => String(r.ref)));
          let ranges;
          if (got.nights) { const ownN = new Set(); mine.forEach(r => ical.nightsOf(r.from, r.to).forEach(n => ownN.add(n))); ranges = ical.fromNights(got.nights.filter(n => !ownN.has(n))); }
          else ranges = ical.merge(ical.dropEchoes(got.ranges.filter(r => !ownRefs.has(String(r.ref))), s, pid, host));
          ranges = ranges.filter(r => r.to > today);
          status.count = ranges.length;
          await ws.withWs(w.id, BB => BB.act.applyCalendar(id, pid, ranges), { quiet: true });
        }
        status.ok = status.checked;
      } catch (e) {
        status.error = A.name + ' ' + e.message;
        log('channels', w.id, id, pid, e.message);
      }
      await ws.withWs(w.id, BB => {
        const x = BB.q.integration(id); x.status = x.status || {}; const prev = x.status[pid] || {};
        x.status[pid] = Object.assign({}, prev, status, status.error ? {} : { error: null });
        x.error = Object.values(x.status).map(v => v.error).find(Boolean) || null;
        if (status.error && !prev.error) BB.log('sync', x.name, 'Could not sync ' + (BB.q.property(pid) || {}).short + ': ' + status.error, id);
        if (status.ok) { const st = BB.store.get(); x.lastSync = st.today + 'T' + st.clock; }
        BB.store.commit({ quiet: true });
      }, { quiet: true });
    }
  }

  // One run at a time per account, so a scheduled check and a new booking never close the same nights twice.
  const running = new Map();
  function sync(w, opts = {}) {
    const prev = running.get(w.id) || Promise.resolve();
    const next = prev.then(() => syncAll(w, opts)).catch(e => log('channels', w.id, e.message));
    running.set(w.id, next); next.finally(() => { if (running.get(w.id) === next) running.delete(w.id); });
    return next;
  }
  async function syncAll(w, opts) {
    const ids = opts.id ? [opts.id] : Object.keys(ADAPTERS);
    for (const id of ids) {
      try { const cur = await ws.open(w.id); await syncOne(cur || w, id, opts); }
      catch (e) { log('channels', w.id, id, e.message); }
    }
  }

  return { connect, disconnect, sync, ADAPTERS };
};
module.exports.ADAPTERS = ADAPTERS;
module.exports.ApiError = ApiError;
module.exports.smoobuSign = smoobuSign;
