/* Bookingbooster: shell for the real app (replaces the prototype bar outside /demo).
   Host console and host phone app at /app, a home's booking site at /s/…, a guest's trip app at /trip/…,
   and the marketing site at /. */
(function () {
  const BB = window.BB, BOOT = BB.BOOT, D = BB.D, esc = BB.esc;
  if (!BOOT || BOOT.mode === 'demo') return; // the demo keeps the prototype shell
  const app = document.getElementById('bbApp'), barEl = document.getElementById('bbBar'), drawer = document.getElementById('bbDrawer');
  document.body.classList.add('prod', 'prod-' + BOOT.mode);
  let mounts = [], current = null;
  const unmount = () => { mounts.forEach(m => m && m.destroy()); mounts = []; };
  const openTab = url => { const w = window.open(url, '_blank', 'noopener'); if (!w) location.href = url; };

  async function tripLink(bookingId) {
    if (BOOT.trips && BOOT.trips[bookingId]) return BOOT.trips[bookingId];
    if (BOOT.mode !== 'host') return null;
    const j = await BB.api.call('/api/trip-link', { bookingId }); return j.url;
  }

  /* ---------- host ---------- */
  let drawerInst = null, drawerOpen = false, seen = BB.store.get().events.length, menu = false;
  function hostBar() {
    const s = BB.store.get(); const unread = s.events.length - seen;
    const tab = (k, t, i, href) => '<a href="' + href + '" data-surface="' + k + '" aria-current="' + (current === k ? 'page' : 'false') + '">' + BB.icon(i) + '<span>' + t + '</span></a>';
    return '<div class="pbar-in hbar">' +
      '<a class="pbar-brand" href="/app">' + BB.MARK + '<span><b>bookingbooster</b><em>' + esc(s.account.business) + '</em></span></a>' +
      '<nav class="pbar-tabs" aria-label="Your workspace">' + tab('app', 'Console', 'dash', '/app') + tab('mobile', 'Phone view', 'phone', '/app/phone') +
        (s.properties.length ? '<button data-act="sites" aria-expanded="' + (menu === 'sites') + '">' + BB.icon('home') + '<span>My sites</span></button>' : '') + '</nav>' +
      '<div class="pbar-tools">' +
        '<button class="pbtn" data-act="activity" aria-expanded="' + drawerOpen + '">' + BB.icon('bolt') + '<span>Activity</span>' + (unread > 0 && !drawerOpen ? '<i class="badge num">' + Math.min(unread, 99) + '</i>' : '') + '</button>' +
        '<button class="pbtn" data-act="me" aria-expanded="' + (menu === 'me') + '">' + BB.avatar(s.account.owner || 'You', 'sm') + '<span>' + esc(String(s.account.owner || '').split(' ')[0] || 'Account') + '</span></button>' +
      '</div>' +
      (menu === 'sites' ? '<div class="hmenu hm-sites" role="menu">' + s.properties.map(p => '<a role="menuitem" href="' + esc((BOOT.siteUrls || {})[p.id] || '#') + '" target="_blank" rel="noopener">' + BB.icon('web') + '<span><b>' + esc(p.name) + '</b><em>' + esc(p.domain) + '</em></span></a>').join('') + '</div>' : '') +
      (menu === 'me' ? '<div class="hmenu hm-me" role="menu"><p><b>' + esc(s.account.owner) + '</b><em>' + esc(s.account.email) + '</em><em>' + esc(s.account.plan) + ' plan</em></p>' +
        '<a role="menuitem" href="/app/billing">' + BB.icon('card') + '<span>Plan and billing</span></a>' +
        '<a role="menuitem" href="/app/account">' + BB.icon('user') + '<span>Account and data</span></a>' +
        '<a role="menuitem" href="/help" target="_blank">' + BB.icon('list') + '<span>Help</span></a>' +
        '<form method="post" action="/logout"><button role="menuitem" type="submit">' + BB.icon('out') + '<span>Sign out</span></button></form></div>' : '') +
      '</div>';
  }
  function paintBar() { if (BOOT.mode === 'host') BB.paint(barEl, hostBar()); }
  function toggleDrawer(force) {
    drawerOpen = force != null ? force : !drawerOpen;
    drawer.hidden = !drawerOpen; document.body.classList.toggle('drawer-open', drawerOpen);
    if (drawerOpen && !drawerInst) drawerInst = BB.mount('activity', drawer.querySelector('.drawer-body'), { key: 'drawer' });
    if (!drawerOpen && drawerInst) { drawerInst.destroy(); drawerInst = null; }
    seen = BB.store.get().events.length; paintBar();
  }

  /* activity feed (same as the prototype's, minus demo wording) */
  const KIND = { booking: 'Booking', payment: 'Payment', sync: 'Calendar', message: 'Message', email: 'Email', sms: 'Text', lock: 'Smart lock', checkin: 'Check-in', campaign: 'Guests', site: 'Website', system: 'System', ai: 'AI' };
  if (!BB.surfaces.activity) BB.define('activity', {
    create(root, opts, inst) {
      BB.on(root, 'click', '[data-ref]', el => {
        const r = el.dataset.ref, s = BB.store.get();
        if (s.bookings.some(b => b.id === r)) BB.go('app', { view: 'booking', id: r });
        else if (s.threads.some(t => t.id === r)) BB.go('app', { view: 'inbox', id: r });
        else if (s.campaigns.some(c => c.id === r)) BB.go('app', { view: 'campaigns', id: r });
        else if (s.integrations.some(i => i.id === r)) BB.go('app', { view: 'connections' });
        else if (s.properties.some(p => p.id === r)) BB.go('app', { view: 'website', id: r });
      });
    },
    render() {
      const s = BB.store.get(); const list = s.events.slice(0, 100);
      return '<div class="act"><div class="act-h"><div><p class="eyebrow">Activity</p><h3 class="disp">What just happened</h3></div></div><ol class="act-list" id="actList-d">' +
        (list.length ? list.map(e => '<li class="ev k-' + e.kind + '"><span class="ev-dot"></span><div class="ev-b"><div class="ev-top"><b>' + esc(e.source) + '</b><span class="ev-t num">' + esc(BB.ago(e.at)) + '</span></div><p>' + (e.kind === 'ai' ? BB.aiText(e.text) : esc(e.text)) + '</p>' + (e.ref ? '<button class="ev-open" data-ref="' + esc(e.ref) + '">Open ' + BB.icon('chev') + '</button>' : '') + '</div></li>').join('') : '<li class="empty">Nothing yet. Bookings, messages and check-ins show here as they happen.</li>') + '</ol>' +
        (list.some(e => e.kind === 'ai') ? BB.aiTm('act-tm') : '') + '</div>';
    },
  });

  BB._go = function (surface, opts) {
    opts = opts || {};
    if (BOOT.mode === 'host') {
      if (surface === 'property') { const u = (BOOT.siteUrls || {})[opts.propertyId] || Object.values(BOOT.siteUrls || {})[0]; if (u) openTab(u); return; }
      if (surface === 'guest') { if (opts.bookingId) { const w = window.open('about:blank', '_blank'); tripLink(opts.bookingId).then(u => { if (w) w.location = u; else location.href = u; }); } return; }
      if (surface === 'site') { openTab('/'); return; }
      if (surface === 'live') { openTab('/demo#live'); return; }
      if (surface !== 'app' && surface !== 'mobile') surface = 'app';
    }
    if (BOOT.mode === 'site') {
      if (surface === 'guest' && opts.bookingId) { tripLink(opts.bookingId).then(u => { if (u) location.href = u; }); return; }
      if (surface === 'app') { location.href = '/app'; return; }
      surface = 'property';
    }
    if (BOOT.mode === 'trip') {
      if (surface === 'property') { location.href = BOOT.siteUrl || '/'; return; }
      if (surface === 'live' || surface === 'app') return;
      surface = 'guest';
    }
    if (BOOT.mode === 'marketing') {
      if (surface === 'app' || surface === 'mobile') { location.href = '/app'; return; }
      if (surface !== 'site') { location.href = '/demo#' + surface; return; }
    }
    const path = { app: '/app', mobile: '/app/phone' }[surface];
    if (path && BOOT.mode === 'host' && location.pathname !== path) try { history.pushState(null, '', path); } catch (_) {}
    if (surface === current && mounts.length === 1 && mounts[0].def.route) { mounts[0].def.route(mounts[0], opts); window.scrollTo({ top: 0 }); paintBar(); return; }
    current = surface; unmount();
    app.className = 'surface s-' + surface;
    app.innerHTML = '<div class="surface-root" id="surfaceRoot"></div>';
    const o = Object.assign({}, opts);
    if (surface === 'guest') { o.embedded = true; o.bookingId = o.bookingId || BOOT.trip; o.step = o.step || BOOT.step; }
    if (surface === 'property') o.propertyId = o.propertyId || BOOT.focus;
    mounts.push(BB.mount(surface, document.getElementById('surfaceRoot'), o));
    paintBar(); window.scrollTo({ top: 0 });
  };

  if (BOOT.mode === 'host') {
    BB.store.subscribe(paintBar);
    barEl.addEventListener('click', e => {
      const s = e.target.closest('[data-surface]'); if (s) { e.preventDefault(); menu = false; BB.go(s.dataset.surface); return; }
      const a = e.target.closest('[data-act]'); if (!a) return;
      if (a.dataset.act === 'activity') { menu = false; toggleDrawer(); }
      if (a.dataset.act === 'sites' || a.dataset.act === 'me') { menu = menu === a.dataset.act ? false : a.dataset.act; paintBar(); }
    });
    document.addEventListener('click', e => { if (menu && !e.target.closest('#bbBar')) { menu = false; paintBar(); } });
    drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) toggleDrawer(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (drawerOpen) toggleDrawer(false); if (menu) { menu = false; paintBar(); } } });
    window.addEventListener('popstate', () => BB.go(location.pathname === '/app/phone' ? 'mobile' : 'app'));
  } else barEl.remove();

  const first = BOOT.mode === 'host' ? (BOOT.surface || 'app') : { site: 'property', trip: 'guest', marketing: 'site' }[BOOT.mode];
  BB.go(first, BOOT.opts || {});
  paintBar();
})();
