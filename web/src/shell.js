/* Bookingbooster prototype: shell. Prototype bar, surface switching, live demo split view, activity feed and demo clock. */
(function () {
  const BB = window.BB, D = BB.D, esc = BB.esc;
  const SURFACES = [
    ['site', 'Our website', 'globe'],
    ['app', 'Host console', 'dash'],
    ['mobile', 'Host app', 'phone'],
    ['property', 'Property site', 'home'],
    ['guest', 'Guest app', 'key'],
    ['live', 'Live demo', 'bolt'],
  ];
  const KIND = { booking: ['Booking', 'info'], payment: ['Payment', 'good'], sync: ['Connections', 'muted'], message: ['Message', 'info'], email: ['Email', 'muted'], sms: ['Text', 'muted'], lock: ['Smart lock', 'warn'], checkin: ['Check-in', 'good'], campaign: ['Guests', 'info'], site: ['Website', 'info'], system: ['System', 'muted'], ai: ['AI', 'warn'] };

  /* ---------- activity feed surface (drawer and live demo) ---------- */
  BB.define('activity', {
    create(root, opts, inst) {
      inst.st.filter = 'all';
      BB.on(root, 'click', '[data-filter]', el => inst.set({ filter: el.dataset.filter }));
      BB.on(root, 'click', '[data-ref]', el => {
        const r = el.dataset.ref; const s = BB.store.get();
        if (s.bookings.some(b => b.id === r)) BB.go('app', { view: 'booking', id: r });
        else if (s.threads.some(t => t.id === r)) BB.go('app', { view: 'inbox', id: r });
        else if (s.campaigns.some(c => c.id === r)) BB.go('app', { view: 'campaigns', id: r });
        else if (s.integrations.some(i => i.id === r)) BB.go('app', { view: 'connections' });
        else if (s.properties.some(p => p.id === r)) BB.go('property', { propertyId: r });
      });
    },
    render(inst) {
      const s = BB.store.get(); const f = inst.st.filter;
      const groups = { all: null, money: ['booking', 'payment'], guests: ['message', 'checkin', 'campaign', 'email', 'sms'], systems: ['sync', 'lock', 'site', 'system', 'ai'] };
      const list = s.events.filter(e => !groups[f] || groups[f].includes(e.kind)).slice(0, 80);
      return '<div class="act">' +
        '<div class="act-h"><div><p class="eyebrow">Live activity</p><h3 class="disp">What just happened</h3></div>' +
        '<div class="seg" role="group" aria-label="Filter activity">' + [['all', 'All'], ['money', 'Bookings'], ['guests', 'Guests'], ['systems', 'Systems']].map(([k, t]) => '<button data-filter="' + k + '" aria-pressed="' + (f === k) + '">' + t + '</button>').join('') + '</div></div>' +
        '<ol class="act-list" id="actList-' + (inst.opts.key || 'x') + '">' + (list.length ? list.map(e => {
          const k = KIND[e.kind] || KIND.system;
          return '<li class="ev k-' + e.kind + '"><span class="ev-dot"></span><div class="ev-b">' +
            '<div class="ev-top"><b>' + esc(e.source) + '</b><span class="ev-t num">' + esc(BB.ago(e.at)) + '</span></div>' +
            '<p>' + (e.kind === 'ai' ? BB.aiText(e.text) : esc(e.text)) + '</p>' +
            (e.flow ? '<div class="ev-flow">' + e.flow.map(x => '<span>' + esc(x) + '</span>').join(BB.icon('arrow')) + '</div>' : '') +
            (e.ref ? '<button class="ev-open" data-ref="' + esc(e.ref) + '">Open ' + BB.icon('chev') + '</button>' : '') +
            '</div></li>';
        }).join('') : '<li class="empty">Nothing yet. Make a booking on a property site and watch it flow through.</li>') + '</ol>' + (list.some(e => e.kind === 'ai') ? BB.aiTm('act-tm') : '') + '</div>';
    },
  });

  /* ---------- shell ---------- */
  const app = document.getElementById('bbApp');
  let current = null, mounts = [];
  function unmountAll() { mounts.forEach(m => m && m.destroy()); mounts = []; }

  function bar() {
    const s = BB.store.get(); const unread = s.events.length - (seen || 0);
    return '<div class="pbar-in">' +
      '<a class="pbar-brand" href="#site" data-surface="site">' + BB.MARK + '<span><b>bookingbooster</b><em>Prototype</em></span></a>' +
      '<nav class="pbar-tabs" aria-label="Product surfaces">' + SURFACES.map(([k, t, i]) => '<button data-surface="' + k + '" aria-current="' + (current === k ? 'page' : 'false') + '" class="' + (k === 'live' ? 'live' : '') + '">' + BB.icon(i) + '<span>' + t + '</span></button>').join('') + '</nav>' +
      '<div class="pbar-tools">' +
        '<span class="clock" title="The prototype runs on a demo calendar">' + BB.icon('clock') + '<span class="num">' + D.fmt(s.today, { weekday: 'short' }) + ' · ' + s.clock + '</span></span>' +
        '<button class="pbtn" data-act="nextday" title="Move the demo to tomorrow morning: arrivals, checkouts and scheduled messages run">' + BB.icon('play') + '<span>Next day</span></button>' +
        '<button class="pbtn" data-act="activity" aria-expanded="' + drawerOpen + '">' + BB.icon('bolt') + '<span>Activity</span>' + (unread > 0 && !drawerOpen ? '<i class="badge num">' + Math.min(unread, 99) + '</i>' : '') + '</button>' +
        '<button class="pbtn icon" data-act="reset" title="Reset demo data">' + BB.icon('reset') + '</button>' +
      '</div></div>';
  }
  let seen = BB.store.get().events.length, drawerOpen = false, confirmReset = false;
  const barEl = document.getElementById('bbBar'), drawer = document.getElementById('bbDrawer');
  function paintBar() { BB.paint(barEl, bar()); }
  BB.store.subscribe(paintBar);

  barEl.addEventListener('click', e => {
    const s = e.target.closest('[data-surface]'); if (s) { e.preventDefault(); BB.go(s.dataset.surface); return; }
    const a = e.target.closest('[data-act]'); if (!a) return;
    if (a.dataset.act === 'nextday') { BB.act.nextDay(); BB.toast('Moved to ' + D.fmt(BB.store.get().today, { weekday: 'long', month: 'long' })); }
    if (a.dataset.act === 'activity') toggleDrawer();
    if (a.dataset.act === 'reset') {
      if (!confirmReset) { confirmReset = true; BB.toast('Press reset again to restore the demo data'); setTimeout(() => confirmReset = false, 4000); return; }
      confirmReset = false; BB.store.reset(); seen = BB.store.get().events.length; BB.go(current); BB.toast('Demo data restored');
    }
  });
  let drawerInst = null;
  function toggleDrawer(force) {
    drawerOpen = force != null ? force : !drawerOpen;
    drawer.hidden = !drawerOpen; document.body.classList.toggle('drawer-open', drawerOpen);
    if (drawerOpen && !drawerInst) drawerInst = BB.mount('activity', drawer.querySelector('.drawer-body'), { key: 'drawer' });
    if (!drawerOpen && drawerInst) { drawerInst.destroy(); drawerInst = null; }
    seen = BB.store.get().events.length; paintBar();
  }
  drawer.addEventListener('click', e => { if (e.target.closest('[data-close]')) toggleDrawer(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawerOpen) toggleDrawer(false); });

  BB._go = function (surface, opts) {
    if (!SURFACES.some(x => x[0] === surface)) surface = 'site';
    opts = opts || {};
    // reuse a live instance when only the inner route changes
    if (surface === current && mounts.length === 1 && mounts[0].def.route) { mounts[0].def.route(mounts[0], opts); window.scrollTo({ top: 0 }); return; }
    if (current === 'live' && surface !== 'live') document.body.classList.remove('is-live');
    current = surface; unmountAll();
    try { history.replaceState(null, '', '#' + surface); } catch (_) {}
    app.className = 'surface s-' + surface;
    if (surface === 'live') {
      document.body.classList.add('is-live');
      app.innerHTML = '<div class="live">' +
        '<div class="live-h"><div><p class="eyebrow">Live demo</p><h1 class="disp">Book as a guest. Watch the host side update.</h1></div>' +
        '<p class="muted">Everything here shares one set of data. Book a stay on the phone, finish check-in, or message the host, and the console and activity feed change at the same moment. Use <b>Next day</b> to run checkouts and scheduled messages.</p></div>' +
        '<div class="live-grid"><section class="live-col phonecol" aria-label="Guest phone"><p class="live-lab">' + BB.icon('phone') + 'Guest’s phone</p><div id="liveGuest"></div></section>' +
        '<section class="live-col consolecol" aria-label="Host console"><p class="live-lab">' + BB.icon('dash') + 'Host console</p><div id="liveApp" class="live-app"></div></section>' +
        '<section class="live-col actcol" aria-label="Activity"><div id="liveAct"></div></section></div></div>';
      mounts.push(BB.mount('guest', document.getElementById('liveGuest'), Object.assign({ embedded: true }, opts)));
      mounts.push(BB.mount('app', document.getElementById('liveApp'), { compact: true, view: 'dashboard' }));
      mounts.push(BB.mount('activity', document.getElementById('liveAct'), { key: 'live' }));
    } else {
      app.innerHTML = '<div class="surface-root" id="surfaceRoot"></div>';
      mounts.push(BB.mount(surface, document.getElementById('surfaceRoot'), opts));
    }
    paintBar(); window.scrollTo({ top: 0 });
  };

  const start = (location.hash || '').slice(1);
  BB.go(SURFACES.some(x => x[0] === start) ? start : 'site');
  paintBar();
})();
