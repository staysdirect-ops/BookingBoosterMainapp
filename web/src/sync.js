/* Bookingbooster: browser <-> server sync.
   Every BB.act.* call runs here first (instant feedback), then the same action runs on the server, whose saved
   result replaces local state. Other devices get a nudge over server-sent events and refetch. */
(function () {
  const BB = window.BB, BOOT = BB.BOOT;
  if (!BOOT) return; // plain prototype file: nothing to sync
  const mode = BOOT.mode; // host | demo | site | trip | marketing
  let version = BOOT.version || 0, inflight = 0, stale = false;
  const fnv = str => { let h = 0x811c9dc5; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  // Homes without their own domain yet are shown by their site address (display only; the server keeps domain empty).
  const siteHost = (s, links) => { if (!s || !s.properties || !links) return; s.properties.forEach(p => { if (!p.domain && links[p.id]) { try { const u = new URL(links[p.id]); p.domain = u.host + (u.pathname.length > 1 ? u.pathname.replace(/\/$/, '') : ''); p._autoDomain = true; } catch (_) {} } }); };
  function hydrate(s) {
    if (mode === 'host') siteHost(s, BOOT.siteUrls);
    if (s && s.promosHashed) { const map = s.promosHashed; s.promos = new Proxy({}, { get: (t, k) => typeof k === 'string' ? map[fnv(k.toUpperCase())] : undefined, set: (t, k, v) => { map[fnv(String(k).toUpperCase())] = v; return true; } }); }
    return s;
  }
  hydrate(BB.store.get());

  async function call(url, body, method) {
    const r = await fetch(url, { method: method || 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-bb': '1' }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (_) {}
    if (r.status === 401 && mode === 'host') { location.href = '/login?next=' + encodeURIComponent(location.pathname); throw new Error('Signed out'); }
    if (!r.ok) { const e = new Error((j && j.error) || 'Something went wrong. Try again.'); e.status = r.status; e.body = j; throw e; }
    return j;
  }
  BB.api = { call, BOOT };
  function accept(j) {
    if (!j || !j.state) return;
    if (j.version) version = j.version;
    if (j.siteUrls) BOOT.siteUrls = j.siteUrls;
    if (j.icalFeeds) BOOT.icalFeeds = j.icalFeeds;
    if (j.soon) BOOT.soon = j.soon;
    BB.store.replace(hydrate(j.state), { server: true });
  }
  async function refetch() {
    if (inflight) { stale = true; return; }
    try { accept(await call(BOOT.stateUrl, null, 'GET')); } catch (e) { console.warn(e); }
  }
  BB.api.refetch = refetch;
  BB.api.accept = accept;

  // Actions the guest-facing pages may send (the server checks each one again).
  const PUBLIC = { trip: ['checkin', 'sendMessage', 'rateStay', 'review', 'joinList', 'buyExtra', 'openThread'], site: [] };
  const queue = [];
  function push(name, args) {
    queue.push([name, args]); if (queue.length === 1) drain();
  }
  async function drain() {
    while (queue.length) {
      const [name, args] = queue[0]; inflight++;
      try { const j = await call(BOOT.actUrl, { name, args, version }); accept(j); if (j && j.notice) BB.toast(j.notice); if (j && j.redirect) { location.href = j.redirect; return; } }
      catch (e) { BB.toast(e.message, 'bad'); stale = true; }
      finally { inflight--; queue.shift(); }
    }
    if (stale) { stale = false; refetch(); }
  }

  if (mode === 'host' || mode === 'demo' || mode === 'trip') {
    let depth = 0;
    Object.keys(BB.act).forEach(name => {
      const orig = BB.act[name];
      if (mode === 'trip' && !PUBLIC.trip.includes(name)) return;
      BB.act[name] = function () {
        const args = Array.prototype.slice.call(arguments);
        depth++; let r;
        try { r = orig.apply(this, args); } finally { depth--; }
        if (depth === 0) push(name, JSON.parse(JSON.stringify(args)));
        return r;
      };
    });
    if (mode === 'demo') BB.store.reset = function () { call('/api/demo/reset', {}).then(accept).catch(e => BB.toast(e.message, 'bad')); };
  }

  // Claude-drafted replies for the inbox when the server has a key. The rule-based draft shows until it arrives.
  if (mode === 'host' && BOOT.aiDrafts && BB.suggestReply) {
    const base = BB.suggestReply, cache = {}, asked = {};
    BB.suggestReply = function (tid) {
      const t = BB.q.thread(tid); if (!t) return '';
      const last = t.messages.filter(m => m.from === 'guest').pop(); if (!last) return '';
      const key = tid + ':' + t.messages.length;
      if (cache[key]) return cache[key];
      if (!asked[key]) { asked[key] = 1; call('/api/suggest', { threadId: tid }).then(j => { if (j && j.text) { cache[key] = j.text; BB.store.commit({ quiet: true, type: 'draft' }); } }).catch(() => {}); }
      return base(tid);
    };
  }

  // Live updates from other devices and from guests.
  if (BOOT.streamUrl && BOOT.poll) {
    const url = BOOT.streamUrl + (BOOT.streamUrl.indexOf('?') < 0 ? '?' : '&') + 'poll=1';
    const tick = () => { if (document.visibilityState !== 'visible' || inflight) return; fetch(url, { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).then(d => { if (d && d.v > version) refetch(); }).catch(() => {}); };
    setInterval(tick, 15000); document.addEventListener('visibilitychange', tick);
  } else if (BOOT.streamUrl && window.EventSource) {
    const es = new EventSource(BOOT.streamUrl);
    es.onmessage = ev => { try { const d = JSON.parse(ev.data); if (d.v > version) refetch(); } catch (_) {} };
  }

  // Bookings from guest pages go straight to the server (it decides between card payment, request and test mode).
  BB.api.book = async function (input, kind) {
    const j = await call(BOOT.bookUrl, { input, kind: kind || 'pay' });
    if (j.state) accept(j);
    return j; // { ok, bookingId, tripUrl, checkoutUrl?, request?, error? }
  };
  BB.api.deposit = async function (bookingId) { const j = await call(BOOT.depositUrl, { bookingId }); if (j.state) accept(j); return j; };
})();
