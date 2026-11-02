/* Bookingbooster prototype: host console frame (sidebar, top bar, search, notifications, routing, modal host)
   and the "Run" views: dashboard, calendar, reservations, booking, inbox, check-in, payments, notifications. */
(function () {
  const BB = window.BB, D = BB.D, esc = BB.esc, ic = BB.icon;
  BB.appViews = BB.appViews || {};
  const V = BB.appViews;
  const GROUPS = ['Run', 'Grow', 'Get found', 'Settings'];
  const PARENT = { booking: 'reservations', guest: 'guests', campaign: 'campaigns' };

  /* ---------- small helpers ---------- */
  const S = () => BB.store.get();
  const P = id => BB.q.property(id) || { id, short: 'Home', name: 'Home', checkinTime: '4 pm', checkoutTime: '11 am', nightly: 0, weekend: 0 };
  const gOf = b => BB.q.guest(b.guestId) || { id: '', name: 'Guest', email: '', phone: '', tags: [] };
  const fst = n => String(n || '').split(' ')[0];
  const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
  const pct = x => Math.round((x || 0) * 100) + '%';
  const cap = s => (s ? s[0].toUpperCase() + s.slice(1) : s);
  const nightsOf = b => D.diff(b.checkIn, b.checkOut);
  const byIn = (a, b) => a.checkIn.localeCompare(b.checkIn);
  function relDay(d, lower) {
    const n = D.diff(S().today, d);
    const r = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : n === -1 ? 'Yesterday' : D.fmt(d, { weekday: 'short' });
    return lower && Math.abs(n) <= 1 ? r.toLowerCase() : r;
  }
  function delta(cur, prev, unit) {
    if (!prev && unit !== 'pts') return '';
    const d = unit === 'pts' ? Math.round((cur - prev) * 100) : Math.round(((cur - prev) / prev) * 100);
    if (!isFinite(d)) return '';
    const up = d >= 0;
    return '<em class="' + (up ? 'up' : 'down') + '">' + (up ? '▲ ' : '▼ ') + Math.abs(d) + (unit === 'pts' ? ' pts' : '%') + '</em>';
  }
  const vh = (title, sub, acts) => '<div class="a-vh"><div><h2 class="disp">' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acts ? '<div class="a-acts">' + acts + '</div>' : '') + '</div>';
  const card = (title, meta, body, cls) => '<section class="a-card ' + (cls || '') + '">' + (title ? '<div class="a-card-h"><h3>' + title + '</h3>' + (meta ? '<div class="a-card-m">' + meta + '</div>' : '') + '</div>' : '') + body + '</section>';
  const DEP = 200;
  const ADDONS = ['cm', 'airbnb', 'vrbo', 'booking']; // optional calendar sync (iCal): dates booked elsewhere arrive as blocks, never as bookings
  const addonOn = () => ADDONS.some(c => BB.q.connected(c));
  const srcKey = b => b.channel !== 'direct' ? b.channel : (b.source || 'website');
  const srcChip = b => b.channel !== 'direct' ? '<span class="a-src s-' + b.channel + '"><i></i>' + esc(BB.CHANNEL[b.channel]) + '<em>add-on</em></span>' : '<span class="a-src s-' + esc(b.source || 'website') + '"><i></i>' + esc(BB.sourceLabel(b)) + '</span>';
  BB.appUI = { vh, card, delta, relDay, srcChip };

  /* check-in helpers */
  function ciMissing(b) { const c = b.checkin, m = []; if (!c.id) m.push('ID'); if (!c.selfie) m.push('selfie'); if (!c.agreement) m.push('agreement'); if (!c.deposit) m.push('deposit'); return m; }
  function ciState(b) { const c = b.checkin; if (c.done) return 'done'; if (c.id || c.selfie || c.agreement || c.deposit || c.guests) return 'started'; return 'none'; }
  function ciSummary(b) {
    const c = b.checkin; if (c.done) return 'Check-in done' + (c.arrival ? ', arriving ' + c.arrival : '');
    const m = ciMissing(b); if (ciState(b) === 'none') return 'Check-in not started';
    return cap(m.join(', ')) + ' pending';
  }
  function remindedAt(id) { const t = S().today; const e = S().events.find(e => e.ref === id && e.source === 'Check-in reminder' && e.at.slice(0, 10) === t); return e ? e.at.slice(11) : null; }
  function ctxBooking(th) {
    const t0 = S().today, own = th.bookingId && BB.q.booking(th.bookingId);
    if (own && own.status === 'confirmed' && own.checkOut >= t0) return own;
    return S().bookings.filter(b => b.guestId === th.guestId && b.status === 'confirmed' && b.checkOut >= t0).sort(byIn)[0] || own || null;
  }
  function threadLast(t) { return t.messages[t.messages.length - 1] || null; }
  const unreadThreads = () => S().threads.filter(t => t.unread > 0);
  const needsCheckin = () => { const t = S().today; return S().bookings.filter(b => b.status === 'confirmed' && b.checkIn >= t && b.checkIn <= D.add(t, 3) && !b.checkin.done); };

  /* gap nights: 1–2 free nights boxed in by stays, within the next N days */
  function gapNights(days) {
    const s = S(), end = D.add(s.today, days || 14), out = [];
    s.properties.forEach(p => {
      const bl = BB.q.blocked(p.id); let d = s.today;
      while (d < end) {
        if (bl.has(d)) { d = D.add(d, 1); continue; }
        let e = d; while (e < end && !bl.has(e)) e = D.add(e, 1);
        const n = D.diff(d, e);
        if (e < end && bl.has(D.add(d, -1)) && n <= 2) {
          const q = BB.quote(p.id, d, e, { adults: 2 });
          out.push({ p, from: d, to: e, n, value: q ? q.total - q.cleaning : 0 });
        }
        d = e;
      }
    });
    return out;
  }

  /* ---------- actions this module adds ---------- */

  /* ---------- frame ---------- */
  function navItems() {
    const gi = g => { const i = GROUPS.indexOf(g); return i < 0 ? 99 : i; };
    return Object.keys(V).filter(k => !V[k].hidden).map(k => Object.assign({ k }, V[k]))
      .sort((a, b) => gi(a.group) - gi(b.group) || (a.order || 0) - (b.order || 0));
  }
  function badgeOf(v) { try { const n = v.badge ? v.badge(S()) : null; return n ? '<i class="a-badge num">' + (n > 99 ? '99+' : n) + '</i>' : ''; } catch (_) { return ''; } }
  function activeKey(view) { return V[view] && V[view].hidden ? (V[view].parent || PARENT[view] || view) : view; }

  function sidebar(inst) {
    const s = S(), items = navItems(), act = activeKey(inst.st.view);
    let html = '', grp = null;
    items.forEach(it => {
      if (it.group !== grp) { if (grp !== null) html += '</div>'; grp = it.group; html += '<div class="a-grp"><p>' + esc(grp || 'More') + '</p>'; }
      html += '<button class="a-nav" data-a="nav" data-view="' + it.k + '" aria-current="' + (act === it.k ? 'page' : 'false') + '">' + ic(it.icon) + '<span>' + esc(it.label) + '</span>' + badgeOf(it) + '</button>';
    });
    if (grp !== null) html += '</div>';
    const soonIds = (s.live && BB.BOOT && BB.BOOT.soon) || [], core = s.integrations.filter(i => !i.addon && !soonIds.includes(i.id)), on = core.filter(i => i.connected).length, dropped = s.live ? core.some(i => !i.connected && i.lastSync) : on < core.length - 3;
    return '<aside class="a-side" aria-label="Console navigation">' +
      '<div class="a-side-top">' + BB.lockup() + '</div>' +
      '<button class="a-biz" data-a="nav" data-view="dashboard"><i></i><span><b>' + esc(s.account.business) + ' · ' + plural(s.properties.length, 'home') + '</b><em>' + esc(s.account.plan) + ' plan</em></span></button>' +
      '<nav class="a-navs">' + html + '</nav>' +
      '<button class="a-side-foot" data-a="nav" data-view="connections"><span class="a-pulse' + (dropped ? ' warn' : '') + '"></span><span><b>' + on + ' of ' + core.length + ' connections on</b><em>Checked ' + esc(s.clock) + '</em></span></button>' +
      '</aside>';
  }
  function strip(inst) {
    const items = navItems(), act = activeKey(inst.st.view); let grp = null;
    return '<nav class="a-strip" id="astrip-' + inst.uid + '" aria-label="Console navigation">' + items.map(it => {
      const sep = grp !== null && it.group !== grp ? '<span class="a-strip-sep" aria-hidden="true"></span>' : ''; grp = it.group;
      return sep + '<button class="a-tab" data-a="nav" data-view="' + it.k + '" aria-current="' + (act === it.k ? 'page' : 'false') + '">' + ic(it.icon) + '<span>' + esc(it.label) + '</span>' + badgeOf(it) + '</button>';
    }).join('') + '</nav>';
  }

  function searchResults(q) {
    q = (q || '').trim().toLowerCase(); if (!q) return [];
    const s = S(), out = [];
    s.properties.filter(p => (p.name + ' ' + p.area + ' ' + p.domain).toLowerCase().includes(q)).slice(0, 3)
      .forEach(p => out.push({ grp: 'Homes', icon: 'home', title: p.name, sub: p.area + ' · calendar', view: 'calendar', id: 'home:' + p.id }));
    s.guests.filter(g => (g.name + ' ' + g.email + ' ' + g.phone).toLowerCase().includes(q)).slice(0, 4)
      .forEach(g => { const n = BB.q.stays(g.id).length; out.push({ grp: 'Guests', avatar: g.name, title: g.name, sub: g.email + ' · ' + plural(n, 'stay'), view: 'guest', id: g.id }); });
    const t = s.today;
    s.bookings.filter(b => (b.id + ' ' + gOf(b).name).toLowerCase().includes(q))
      .sort((a, b) => { const ua = a.checkOut >= t, ub = b.checkOut >= t; if (ua !== ub) return ua ? -1 : 1; return ua ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn); })
      .slice(0, 5).forEach(b => out.push({ grp: 'Bookings', icon: 'cal', title: gOf(b).name + ' · ' + b.id, sub: P(b.propertyId).short + ' · ' + BB.dates(b) + ' · ' + BB.sourceLabel(b) + (b.status === 'cancelled' ? ' · cancelled' : ''), view: 'booking', id: b.id }));
    return out;
  }
  function searchBox(inst) {
    const st = inst.st, res = st.qOpen ? searchResults(st.q) : [];
    let list = '';
    if (st.qOpen && (st.q || '').trim()) {
      let g = null;
      list = '<div class="a-pop a-sres" role="listbox">' + (res.length ? res.map((r, i) => {
        const h = r.grp !== g ? '<p class="a-pop-h">' + r.grp + '</p>' : ''; g = r.grp;
        return h + '<button class="a-sr' + (i === 0 ? ' first' : '') + '" role="option" data-a="qres" data-view="' + r.view + '" data-id="' + esc(r.id) + '">' + (r.avatar ? BB.avatar(r.avatar, 'sm') : '<span class="a-ico sm">' + ic(r.icon) + '</span>') + '<span class="a-row-t"><b>' + esc(r.title) + '</b><span>' + esc(r.sub) + '</span></span>' + ic('chev', 'a-sr-go') + '</button>';
      }).join('') : '<p class="a-pop-empty">No guests, bookings or homes match “' + esc(st.q.trim()) + '”.</p>') + '</div>';
    }
    return '<div class="a-search">' + ic('search') + '<input id="aq-' + inst.uid + '" data-a="q" type="search" autocomplete="off" placeholder="Search guests, bookings, homes" aria-label="Search guests, bookings and homes" value="' + esc(st.q || '') + '">' + list + '</div>';
  }
  function bell(inst) {
    const s = S(), un = s.notifications.filter(n => !n.read).length;
    const pop = inst.st.bell ? '<div class="a-pop a-bellpop"><div class="a-pop-top"><b>Notifications</b>' + (un ? '<button class="a-link" data-a="readall">Mark all read</button>' : '<span class="muted">All read</span>') + '</div>' +
      (s.notifications.length ? s.notifications.slice(0, 7).map(n => notifRow(n)).join('') : '<p class="a-pop-empty">Nothing new. New bookings, check-ins and messages show up here.</p>') +
      '<button class="a-pop-all" data-a="nav" data-view="notifications">See all notifications' + ic('arrow') + '</button></div>' : '';
    return '<div class="a-bellwrap"><button class="iconbtn a-bell" data-a="bell" aria-expanded="' + !!inst.st.bell + '" aria-label="Notifications, ' + un + ' unread">' + ic('bell') + (un ? '<i class="a-dot num">' + un + '</i>' : '') + '</button>' + pop + '</div>';
  }
  function notifRow(n) {
    return '<button class="a-notif' + (n.read ? '' : ' unread') + '" data-a="ref" data-ref="' + esc(n.ref || '') + '"><i></i><span class="a-row-t"><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span></span><time class="num">' + esc(BB.ago(n.at)) + '</time></button>';
  }
  function topbar(inst) {
    const s = S();
    return '<header class="a-top">' +
      '<button class="a-mbrand" data-a="nav" data-view="dashboard" aria-label="Dashboard">' + BB.MARK + '<span>' + esc(s.account.business) + '</span></button>' +
      searchBox(inst) +
      '<div class="a-tools">' + bell(inst) +
      '<button class="btn primary sm a-newbtn" data-a="new">' + ic('plus') + '<span>New booking</span></button>' +
      '<span class="a-me" title="' + esc(s.account.owner) + '">' + BB.avatar(s.account.owner, 'sm') + '<span>' + esc(s.account.owner) + '</span></span></div></header>';
  }
  function placeholder(view) {
    return vh(esc(cap(view.replace(/-/g, ' '))), 'This part of the console is still being set up.') +
      '<div class="a-card a-empty">' + ic('spark') + '<b>Nothing here yet</b><p>This view loads once its module is ready. Everything you do elsewhere in the console still flows through to it.</p><button class="btn sm" data-a="nav" data-view="dashboard">Back to dashboard</button></div>';
  }

  function openRef(inst, r) {
    const s = S(); inst.st.bell = false;
    if (!r) return inst.render();
    if (s.bookings.some(b => b.id === r)) return inst.nav('booking', r);
    if (s.threads.some(t => t.id === r)) return inst.nav('inbox', r);
    if (s.campaigns.some(c => c.id === r)) return inst.nav(V.campaign ? 'campaign' : 'campaigns', r);
    if (s.guests.some(g => g.id === r)) return inst.nav('guest', r);
    if (s.integrations.some(i => i.id === r)) return inst.nav('connections');
    if (s.properties.some(p => p.id === r)) return BB.go('property', { propertyId: r });
    inst.render();
  }

  BB.define('app', {
    create(root, opts, inst) {
      inst.uid = Math.random().toString(36).slice(2, 7);
      inst.compact = !!opts.compact;
      Object.assign(inst.st, { view: opts.view || 'dashboard', id: opts.id || null, q: '', qOpen: false, bell: false, modal: null });
      inst.nav = (view, id) => {
        const st = inst.st;
        st.view = view || 'dashboard'; st.id = id == null || id === '' ? null : id;
        st.bell = false; st.qOpen = false; st.modal = null; st.bk_cancel = null; inst._enter = true;
        if (st.view === 'inbox') { st.ib_open = !!st.id; st.ib_draft = ''; inst._scrollMsgs = true; }
        if (st.view === 'calendar' && st.id && String(st.id).startsWith('home:')) { st.cal_pid = st.id.slice(5); st.id = null; }
        if (st.view === 'inbox' && st.id) BB.act.markRead(st.id);
        inst.render();
        if (inst.compact) { const r = root.getBoundingClientRect(); if (r.top < 0) root.scrollIntoView({ block: 'start' }); }
        else window.scrollTo({ top: 0 });
      };
      inst.modal = html => { inst.st.modal = html; inst._menter = true; inst.render(); };
      inst.closeModal = () => { inst.st.modal = null; inst.st.nb = null; inst.render(); };
      const fwd = (type, ev) => { const v = V[inst.st.view]; if (v && v[type]) v[type](ev, inst); };

      root.addEventListener('click', ev => {
        const t = ev.target, st = inst.st; let changed = false;
        if (st.bell && !t.closest('.a-bellwrap')) { st.bell = false; changed = true; }
        if (st.qOpen && !t.closest('.a-search')) { st.qOpen = false; changed = true; }
        if (t.classList && t.classList.contains('a-modal-back')) { inst.closeModal(); return; }
        const near = t.closest('button,a,input,select,textarea,label,[data-a]');
        if (near && near.dataset.a && root.contains(near)) { frameCmd(near, ev, inst); return; }
        if (t.closest('[data-nb]')) { nbClick(t, ev, inst); return; }
        if (changed) inst.render();
        fwd('click', ev);
      });
      root.addEventListener('input', ev => {
        const t = ev.target;
        if (t.dataset && t.dataset.a === 'q') { inst.st.q = t.value; inst.st.qOpen = true; inst.render(); return; }
        if (t.closest('[data-nb]')) { nbInput(t, inst); return; }
        fwd('input', ev);
      });
      root.addEventListener('change', ev => { if (ev.target.closest('[data-nb]')) { nbChange(ev.target, inst); return; } fwd('change', ev); });
      root.addEventListener('submit', ev => { ev.preventDefault(); if (ev.target.closest('[data-nb]')) { nbSubmit(inst); return; } fwd('submit', ev); });
      root.addEventListener('focusin', ev => { if (ev.target.dataset && ev.target.dataset.a === 'q' && !inst.st.qOpen && inst.st.q) inst.set({ qOpen: true }); });
      root.addEventListener('keydown', ev => {
        const st = inst.st;
        if (ev.key === 'Escape') {
          if (st.modal) { inst.closeModal(); return; }
          if (st.bell || st.qOpen) { st.bell = false; st.qOpen = false; inst.render(); return; }
        }
        if (ev.key === 'Enter' && ev.target.dataset && ev.target.dataset.a === 'q') {
          const r = searchResults(st.q)[0]; if (r) { ev.preventDefault(); st.q = ''; inst.nav(r.view, r.id); } return;
        }
        fwd('keydown', ev);
      });
      // calendar drag-select
      root.addEventListener('mousedown', ev => {
        const c = ev.target.closest('[data-cell]'); if (!c || inst.st.view !== 'calendar' || ev.button !== 0) return;
        const [pid, d] = c.dataset.cell.split('|'); if (d < S().today || BB.q.blocked(pid).has(d)) return;
        inst._drag = { pid, a: d, moved: false }; ev.preventDefault();
      });
      root.addEventListener('mouseover', ev => {
        const g = inst._drag; if (!g) return; const c = ev.target.closest('[data-cell]'); if (!c) return;
        const [pid, d] = c.dataset.cell.split('|'); if (pid !== g.pid || d < S().today) return;
        const a = d < g.a ? d : g.a, b = D.add(d < g.a ? g.a : d, 1);
        const cur = inst.st.cal_sel; if (cur && cur.pid === pid && cur.a === a && cur.b === b) return;
        g.moved = g.moved || d !== g.a; inst.set({ cal_sel: { pid, a, b }, cal_blk: null });
      });
      inst._up = () => { if (inst._drag) { if (inst._drag.moved) inst._noClick = true; inst._drag = null; } };
      document.addEventListener('mouseup', inst._up);
    },
    destroy(inst) { document.removeEventListener('mouseup', inst._up); },
    route(inst, opts) { inst.nav(opts.view || 'dashboard', opts.id); },
    render(inst) {
      const st = inst.st; const v = V[st.view];
      let body;
      try { body = v ? v.render(inst) : placeholder(st.view); } catch (e) { console.error(e); body = '<pre class="err">' + esc(e.stack || e) + '</pre>'; }
      const m = st.modal ? (typeof st.modal === 'function' ? st.modal(inst) : st.modal) : '';
      return '<div class="x-app' + (inst.compact ? ' is-compact' : '') + '"><div class="a-frame">' + sidebar(inst) +
        '<div class="a-main">' + topbar(inst) + strip(inst) +
        '<main class="a-body"><div class="a-view a-v-' + esc(st.view) + (inst._enter ? ' a-enter' : '') + '">' + body + '</div></main></div></div>' +
        (m ? '<div class="a-modal-back' + (inst._menter ? ' a-enter' : '') + '"><div class="a-modal" role="dialog" aria-modal="true">' + m + '</div></div>' : '') + '</div>';
    },
    after(inst) {
      inst._enter = false; inst._menter = false;
      if (!inst.compact) { const bar = document.getElementById('bbBar'); const h = bar ? bar.offsetHeight : 0; if (inst._barH !== h) { inst._barH = h; inst.root.style.setProperty('--a-top', h + 'px'); } }
      if (inst._scrollMsgs) { const el = inst.root.querySelector('#amsgs-' + inst.uid); if (el) { el.scrollTop = el.scrollHeight; inst._scrollMsgs = false; } }
      const tab = inst.root.querySelector('.a-strip [aria-current="page"]'), sw = inst.root.querySelector('.a-strip');
      if (tab && sw && inst._stripView !== inst.st.view) { inst._stripView = inst.st.view; const l = tab.offsetLeft - 16; if (l < sw.scrollLeft || tab.offsetLeft + tab.offsetWidth > sw.scrollLeft + sw.clientWidth) sw.scrollLeft = Math.max(0, l); }
      if (inst._focus) { const el = inst.root.querySelector(inst._focus); inst._focus = null; if (el) { el.focus({ preventScroll: true }); try { const n = (el.value || '').length; el.setSelectionRange(n, n); } catch (_) {} } }
    },
  });

  function frameCmd(el, ev, inst) {
    const a = el.dataset.a, st = inst.st;
    if (a === 'nav') { ev.preventDefault(); inst.nav(el.dataset.view, el.dataset.id || null); }
    else if (a === 'qres') { st.q = ''; inst.nav(el.dataset.view, el.dataset.id || null); }
    else if (a === 'bell') { st.bell = !st.bell; st.qOpen = false; inst.render(); }
    else if (a === 'readall') { BB.act.readNotifications(); }
    else if (a === 'ref') { openRef(inst, el.dataset.ref); }
    else if (a === 'new') { openNewBooking(inst, {}); }
    else if (a === 'close') { inst.closeModal(); }
    else if (a === 'go') { BB.go(el.dataset.surface, JSON.parse(el.dataset.opts || '{}')); }
    else if (a === 'q') { if (!st.qOpen && st.q) inst.set({ qOpen: true }); }
  }

  /* ---------- New booking modal ---------- */
  function openNewBooking(inst, pre) {
    const s = S();
    inst.st.nb = { pid: pre.propertyId || inst.st.cal_pid || s.properties[0].id, a: pre.a || null, b: pre.b || null, month: (pre.a || s.today).slice(0, 7), name: '', email: '', phone: '', adults: 2, children: 0, pets: false, promo: '', pay: 'online', err: null };
    inst._focus = '#nbn-' + inst.uid;
    inst.modal(nbRender);
  }
  function nbQuote(nb) { return nb.a && nb.b ? BB.quote(nb.pid, nb.a, nb.b, { adults: nb.adults, children: nb.children, pets: nb.pets, promo: nb.promo }) : null; }
  function nbRender(inst) {
    const s = S(), nb = inst.st.nb, u = inst.uid; if (!nb) return '';
    const p = P(nb.pid), bl = BB.q.blocked(nb.pid), q = nbQuote(nb);
    const sel = nb.a ? (nb.b ? '<b>' + D.fmt(nb.a, { weekday: 'short' }) + '</b> to <b>' + D.fmt(nb.b, { weekday: 'short' }) + '</b> · ' + plural(D.diff(nb.a, nb.b), 'night') : 'Check-in <b>' + D.fmt(nb.a, { weekday: 'short' }) + '</b>. Now pick check-out.') : 'Pick a check-in date, then check-out.';
    const opt = (n, from, to) => { let o = ''; for (let i = from; i <= to; i++) o += '<option value="' + i + '"' + (i === n ? ' selected' : '') + '>' + i + '</option>'; return o; };
    const stripeOff = nb.pay === 'online' && !BB.q.connected('stripe');
    const lines = q ? '<div class="a-q">' +
      '<div><span>' + BB.money(q.avg) + ' × ' + plural(q.nights, 'night') + '</span><b class="num">' + BB.money(q.nightly) + '</b></div>' +
      '<div><span>Cleaning</span><b class="num">' + BB.money(q.cleaning) + '</b></div>' +
      (q.pet ? '<div><span>Pet fee</span><b class="num">' + BB.money(q.pet) + '</b></div>' : '') +
      (q.discount ? '<div class="good"><span>Code ' + esc(q.promo) + ' (' + q.promoPct + '% off nights)</span><b class="num">' + BB.money(-q.discount) + '</b></div>' : '') +
      '<div class="tot"><span>Total</span><b class="num">' + BB.money(q.total) + '</b></div>' +
      '<p class="a-q-save">' + ic('spark') + 'No platform fee. You keep the ' + BB.money(q.hostSaves) + ' Airbnb would take as its host fee.</p>' +
      (q.problems.length ? '<ul class="a-q-prob">' + q.problems.map(x => '<li>' + ic('x') + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>'
      : '<div class="a-q a-q-empty">' + ic('cal') + '<span>Pick dates to see the price.</span></div>';
    const promoBad = nb.promo.trim() && !s.promos[nb.promo.trim().toUpperCase()];
    return '<form class="a-nb" data-nb="form" novalidate>' +
      '<div class="a-mh"><div><p class="eyebrow">New booking</p><h3 class="disp">Add a stay</h3></div><button type="button" class="iconbtn" data-a="close" aria-label="Close">' + ic('x') + '</button></div>' +
      '<div class="a-nb-grid"><div class="a-nb-cal">' +
        '<label class="field"><span>Home</span><select id="nbp-' + u + '" data-nb="pid">' + s.properties.map(x => '<option value="' + x.id + '"' + (x.id === nb.pid ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
        '<div class="a-nb-mh"><button type="button" class="iconbtn" data-nbm="-1" aria-label="Previous month"' + (nb.month <= s.today.slice(0, 7) ? ' disabled' : '') + '>' + ic('back') + '</button><b>' + BB.monthName(nb.month) + '</b><button type="button" class="iconbtn" data-nbm="1" aria-label="Next month">' + ic('chev') + '</button></div>' +
        BB.monthGrid(nb.month, { a: nb.a, b: nb.b }, bl) +
        '<p class="a-nb-sel">' + sel + '</p>' +
        '<p class="a-nb-rules">' + ic('home') + esc(p.short + ' · sleeps ' + p.maxGuests + ' · ' + p.minNights + '-night minimum · ' + (p.petsAllowed ? 'pets welcome' : 'no pets')) + '</p>' +
      '</div><div class="a-nb-form">' +
        '<div class="a-f2"><label class="field"><span>Guest name</span><input id="nbn-' + u + '" data-nb="name" autocomplete="off" value="' + esc(nb.name) + '" placeholder="Emma Clarke"></label>' +
        '<label class="field"><span>Email</span><input id="nbe-' + u + '" data-nb="email" type="email" autocomplete="off" value="' + esc(nb.email) + '" placeholder="emma@example.co.uk"></label></div>' +
        '<div class="a-f4"><label class="field"><span>Phone</span><input id="nbph-' + u + '" data-nb="phone" autocomplete="off" value="' + esc(nb.phone) + '" placeholder="07700 900123"></label>' +
        '<label class="field"><span>Adults</span><select id="nba-' + u + '" data-nb="adults">' + opt(nb.adults, 1, 10) + '</select></label>' +
        '<label class="field"><span>Children</span><select id="nbc-' + u + '" data-nb="children">' + opt(nb.children, 0, 8) + '</select></label>' +
        '<label class="field a-pets"><span>Pets</span><span class="a-check"><input type="checkbox" id="nbpt-' + u + '" data-nb="pets"' + (nb.pets ? ' checked' : '') + '><span>A dog</span></span></label></div>' +
        '<div class="a-f2"><label class="field"><span>Promo code</span><input id="nbpr-' + u + '" data-nb="promo" autocomplete="off" value="' + esc(nb.promo) + '" placeholder="Optional">' + (promoBad ? '<small class="a-warnt">That code does not exist.</small>' : '') + '</label>' +
        '<div class="field"><span>Booked through</span><div class="seg a-seg-full" role="group"><button type="button" data-nbpay="online" aria-pressed="' + (nb.pay === 'online') + '">Card online</button><button type="button" data-nbpay="manual" aria-pressed="' + (nb.pay === 'manual') + '">Phone or manual</button></div></div></div>' +
        '<p class="a-hint">' + (nb.pay === 'online' ? (stripeOff ? '<span class="a-warnt">Stripe is disconnected, so card payments are paused. Choose phone or manual.</span>' : 'We email the guest a secure Stripe payment link and confirmation.') : 'The stay is confirmed now and marked unpaid until you record the payment.') + '</p>' +
        lines +
        (nb.err ? '<p class="a-err" role="alert">' + ic('x') + esc(nb.err) + '</p>' : '') +
        '<div class="a-nb-acts"><button type="button" class="btn ghost" data-a="close">Cancel</button><button type="submit" class="btn primary"' + (q && !q.ok ? ' disabled' : '') + '>' + ic('check') + 'Create booking' + (q && q.ok ? ' · ' + BB.money(q.total) : '') + '</button></div>' +
      '</div></div></form>';
  }
  function nbClick(t, ev, inst) {
    const nb = inst.st.nb; if (!nb) return;
    const day = t.closest('[data-day]');
    if (day && !day.disabled) { const r = BB.pickRange({ a: nb.a, b: nb.b }, day.dataset.day, BB.q.blocked(nb.pid)); nb.a = r.a; nb.b = r.b; nb.err = null; inst.render(); return; }
    const m = t.closest('[data-nbm]'); if (m) { nb.month = BB.addMonth(nb.month, +m.dataset.nbm); inst.render(); return; }
    const pay = t.closest('[data-nbpay]'); if (pay) { nb.pay = pay.dataset.nbpay; nb.err = null; inst.render(); }
  }
  function nbInput(t, inst) {
    const nb = inst.st.nb; if (!nb) return; const k = t.dataset.nb;
    if (k === 'name' || k === 'email' || k === 'phone') { nb[k] = t.value; if (nb.err) { nb.err = null; inst.render(); } }
    if (k === 'promo') { nb.promo = t.value; inst.render(); }
  }
  function nbChange(t, inst) {
    const nb = inst.st.nb; if (!nb) return; const k = t.dataset.nb;
    if (k === 'pid') { nb.pid = t.value; if (nb.a && nb.b && !BB.q.isAvailable(nb.pid, nb.a, nb.b)) { nb.a = null; nb.b = null; } }
    else if (k === 'adults' || k === 'children') nb[k] = +t.value;
    else if (k === 'pets') nb.pets = t.checked;
    else return;
    nb.err = null; inst.render();
  }
  function nbSubmit(inst) {
    const nb = inst.st.nb; if (!nb) return;
    if (!nb.a || !nb.b) { nb.err = 'Pick check-in and check-out dates.'; return inst.render(); }
    if (!nb.name.trim()) { nb.err = 'Add the guest’s name.'; inst._focus = '#nbn-' + inst.uid; return inst.render(); }
    if (nb.email.trim() && !/^\S+@\S+\.\S+$/.test(nb.email.trim())) { nb.err = 'That email address looks incomplete.'; return inst.render(); }
    const r = BB.act.createBooking({ propertyId: nb.pid, checkIn: nb.a, checkOut: nb.b, name: nb.name.trim(), email: nb.email.trim(), phone: nb.phone.trim(), adults: nb.adults, children: nb.children, pets: nb.pets, promo: nb.promo.trim(), channel: 'direct', pay: nb.pay === 'manual' ? 'manual' : undefined, source: 'console' });
    if (!r.ok) { nb.err = r.error; return inst.render(); }
    inst.st.nb = null; inst.st.modal = null; inst.st.cal_sel = null;
    BB.toast('Booked ' + r.booking.id + ' for ' + fst(r.guest.name) + ' at ' + P(r.booking.propertyId).short, 'good');
    inst.nav('booking', r.booking.id);
  }
  BB.appNewBooking = openNewBooking;

  /* =====================================================================================
     DASHBOARD
     ===================================================================================== */
  function revWindow(from, to) { return S().bookings.filter(b => b.status !== 'cancelled' && b.status !== 'request' && ((b.createdAt > from && b.createdAt <= to) || (b.checkIn > from && b.checkIn <= to))).reduce((x, b) => x + b.total, 0); }
  function occWindow(from, days) {
    const s = S(), nights = D.nights(from, D.add(from, days)); let n = 0;
    s.properties.forEach(p => { const bl = BB.q.blocked(p.id); nights.forEach(d => { if (bl.has(d)) n++; }); });
    return n / (nights.length * s.properties.length);
  }
  function shareWindow(from, to) {
    const l = S().bookings.filter(b => b.status !== 'cancelled' && b.checkIn > from && b.checkIn <= to);
    const all = l.reduce((x, b) => x + b.total, 0); return all ? l.filter(b => b.channel === 'direct').reduce((x, b) => x + b.total, 0) / all : 0;
  }
  function niceStep(max) { const steps = [500, 1000, 2000, 2500, 5000, 10000, 20000, 25000, 50000, 100000]; return steps.find(s => max / s <= 4) || 100000; }
  function revChart(m) {
    const t = S().today, cur = D.month(t), months = m.months;
    if (!months.length) return '<div class="a-empty">No stays yet.</div>';
    const rows = months.map(k => { const v = m.byMonth[k] || { returning: 0, newGuests: 0 }; return { k, d: Math.round(v.returning || 0), p: Math.round(v.newGuests || 0) }; });
    const max = Math.max(1, ...rows.map(r => r.d + r.p)), step = niceStep(max), top = Math.ceil(max / step) * step;
    const H = 286, T = 10, y = v => T + (H - T) * (1 - v / top);
    const ticks = []; for (let v = 0; v <= top; v += step) ticks.push(v);
    const n = rows.length, slot = 100 / n, bw = Math.min(slot * 0.56, 14);
    let svg = '<svg class="a-chart-svg" width="100%" height="' + (H + 1) + '" role="img" aria-label="Direct revenue by month, returning guests versus new guests">';
    ticks.forEach(v => { svg += '<line class="' + (v ? 'gl' : 'gl base') + '" x1="0" x2="100%" y1="' + (y(v) + .5) + '" y2="' + (y(v) + .5) + '"/>'; });
    rows.forEach((r, i) => {
      const x = (i + 0.5) * slot - bw / 2, yd = y(r.d), yp = y(r.d + r.p), fut = r.k > cur;
      const lab = BB.monthName(r.k) + (r.k >= cur ? ' (includes stays on the books)' : '') + ': returning guests ' + BB.money(r.d) + ', new guests ' + BB.money(r.p) + ', total ' + BB.money(r.d + r.p) + ', ' + pct(r.d / Math.max(1, r.d + r.p)) + ' from returning guests';
      svg += '<g class="a-bar' + (fut ? ' fut' : '') + (r.k === cur ? ' cur' : '') + '"><title>' + esc(lab) + '</title>' +
        '<rect class="hit" x="' + (i * slot) + '%" y="0" width="' + slot + '%" height="' + H + '"/>' +
        (r.d ? '<rect class="d" x="' + x + '%" y="' + yd + '" width="' + bw + '%" height="' + Math.max(0, y(0) - yd) + '" rx="3"/>' : '') +
        (r.p ? '<rect class="p" x="' + x + '%" y="' + yp + '" width="' + bw + '%" height="' + Math.max(0, yd - yp - (r.d ? 2 : 0)) + '" rx="3"/>' : '') + '</g>';
    });
    svg += '</svg>';
    const yl = ticks.map(v => '<span style="top:' + (y(v) - 7) + 'px">' + (v ? '£' + (v >= 1000 ? (v / 1000) + 'k' : v) : '0') + '</span>').join('');
    const xl = rows.map(r => '<span class="' + (r.k === cur ? 'cur' : r.k > cur ? 'fut' : '') + '">' + D.parse(r.k + '-01').toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'short' }) + '</span>').join('');
    const best = rows.reduce((a, r) => (r.d > a.d ? r : a), rows[0]);
    return '<div class="a-legend"><span><i class="d"></i>Returning guests</span><span><i class="p"></i>New guests</span><span class="muted">Hover a month for exact figures</span></div>' +
      '<div class="a-chart"><div class="a-chart-y" style="height:' + (H + 1) + 'px">' + yl + '</div><div class="a-chart-plot">' + svg + '<div class="a-chart-x" style="--n:' + n + '">' + xl + '</div></div></div>' +
      '<p class="a-chart-note">' + (best && best.d ? 'Best month for returning guests: <b>' + BB.monthName(best.k) + '</b>, ' + BB.money(best.d) + '. ' : '') + (rows.some(r => r.k > cur) ? 'Lighter bars are future stays already booked.' : '') + '</p>';
  }
  function gauge(n, size) {
    const r = 42, c = 2 * Math.PI * r, off = c * (1 - n / 100);
    return '<svg class="a-gauge" viewBox="0 0 100 100" width="' + (size || 96) + '" height="' + (size || 96) + '" role="img" aria-label="Score ' + n + ' out of 100"><circle cx="50" cy="50" r="' + r + '" class="tr"/><circle cx="50" cy="50" r="' + r + '" class="fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 50 50)"/><text x="50" y="58" text-anchor="middle">' + n + '</text></svg>';
  }
  function bookingRow(b, kind) {
    const g = gOf(b), p = P(b.propertyId);
    if (kind === 'arr') return '<button class="a-row" data-a="nav" data-view="booking" data-id="' + b.id + '">' + BB.avatar(g.name) + '<span class="a-row-t"><b>' + esc(g.name) + ' arrives</b><span>' + esc(p.short + ' · ' + ciSummary(b)) + '</span></span><span class="a-row-m">' + BB.stepDots(b) + (b.checkin.done ? BB.pill('good', 'Ready') : BB.pill('warn', 'Waiting')) + '</span></button>';
    const dep = b.deposit === 'held' ? 'deposit held' : b.deposit === 'released' ? 'deposit released' : 'no deposit';
    return '<button class="a-row" data-a="nav" data-view="booking" data-id="' + b.id + '">' + BB.avatar(g.name) + '<span class="a-row-t"><b>' + esc(g.name) + ' departs</b><span>' + esc(p.short + ' · checkout ' + p.checkoutTime + ' · ' + dep) + '</span></span><span class="a-row-m">' + (b.status === 'completed' ? BB.pill('muted', 'Checked out') : BB.pill('info', 'Leaves ' + p.checkoutTime)) + '</span></button>';
  }
  function threadRowMini(t) {
    const g = BB.q.guest(t.guestId) || { name: 'Guest' }, last = threadLast(t);
    return '<button class="a-row" data-a="nav" data-view="inbox" data-id="' + t.id + '">' + BB.avatar(g.name) + '<span class="a-row-t"><b>' + esc(g.name) + ' sent a message</b><span>“' + esc(last ? last.text : '') + '”</span></span><span class="a-row-m">' + BB.pill('warn', 'Reply') + '</span></button>';
  }
  function needItems() {
    const s = S(), t = s.today, out = [];
    needsCheckin().sort(byIn).forEach(b => {
      const g = gOf(b), c = b.checkin, onlyDep = c.id && c.selfie && c.agreement && !c.deposit, r = remindedAt(b.id);
      out.push({ tone: b.checkIn === t ? 'bad' : 'warn', icon: onlyDep ? 'card' : 'key', title: g.name + (onlyDep ? ': deposit pending' : ': check-in unfinished'),
        sub: P(b.propertyId).short + ' · arrives ' + relDay(b.checkIn, true) + ' · ' + ciSummary(b).toLowerCase(), open: 'data-a="nav" data-view="booking" data-id="' + b.id + '"',
        btn: r ? '<span class="a-done">' + ic('check') + 'Reminded ' + r + '</span>' : '<button class="btn sm" data-remind="' + b.id + '">' + ic('sms') + 'Send reminder</button>' });
    });
    s.bookings.filter(b => b.status === 'request').sort(byIn).forEach(b => out.push({ tone: 'info', icon: 'inbox', title: gOf(b).name + ': booking request', sub: P(b.propertyId).short + ' · ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + ' · ' + BB.money(b.total) + ' · accept or decline', open: 'data-a="nav" data-view="booking" data-id="' + b.id + '"' }));
    s.bookings.filter(b => b.status === 'confirmed' && !b.paid).sort(byIn).forEach(b => out.push({ tone: 'warn', icon: 'card', title: gOf(b).name + ': payment not recorded', sub: b.id + ' · ' + BB.money(b.total) + ' · arrives ' + relDay(b.checkIn, true), open: 'data-a="nav" data-view="booking" data-id="' + b.id + '"', btn: '<button class="btn sm" data-paid="' + b.id + '">Mark paid</button>' }));
    unreadThreads().forEach(th => { const g = BB.q.guest(th.guestId) || { name: 'Guest' }, last = threadLast(th); out.push({ tone: 'info', icon: 'inbox', title: g.name + ' is waiting for a reply', sub: '“' + (last ? last.text : '') + '”', open: 'data-a="nav" data-view="inbox" data-id="' + th.id + '"', btn: '<button class="btn sm" data-a="nav" data-view="inbox" data-id="' + th.id + '">Reply</button>' }); });
    gapNights(14).forEach(gp => out.push({ tone: 'muted', icon: 'cal', title: gp.p.short + ': ' + plural(gp.n, 'open night') + ' between stays', sub: D.fmt(gp.from) + ' – ' + D.fmt(gp.to) + ' · worth about ' + BB.money(gp.value) + ' at your rates', open: 'data-a="nav" data-view="calendar"', btn: '<button class="btn sm" data-a="nav" data-view="campaigns">Offer to past guests</button>' }));
    return out;
  }
  function needRow(n) { return '<div class="a-row a-need t-' + n.tone + '" ' + n.open + ' role="link" tabindex="0"><span class="a-ico">' + ic(n.icon) + '</span><span class="a-row-t"><b>' + esc(n.title) + '</b><span>' + esc(n.sub) + '</span></span><span class="a-row-m">' + (n.btn || '') + '</span></div>'; }

  V.dashboard = {
    label: 'Dashboard', group: 'Run', icon: 'dash', order: 10,
    render(inst) {
      const s = S(), t = s.today, m = BB.metrics();
      const arr = BB.q.arrivals(), dep = BB.q.departures(), un = unreadThreads();
      const hr = +s.clock.slice(0, 2), hello = hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening';
      const sum = [plural(arr.length, 'arrival'), plural(dep.length, 'departure'), un.length ? plural(un.length, 'message') + ' waiting' : 'inbox clear'].join(' · ');
      const prevRev = revWindow(D.add(t, -60), D.add(t, -30));
      const retWin = (from, to) => { const l = s.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'request' && b.checkIn > from && b.checkIn <= to); return l.length >= 5 ? l.filter(m.isReturning).length / l.length : null; };
      const prevRet = retWin(D.add(t, -360), D.add(t, -180));
      const prevOcc = occWindow(D.add(t, -30), 30);
      const live = s.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'request');
      const kpis =
        '<div class="a-s3"><div class="a-kpi"><span>Revenue, last 30 days</span><b class="num">' + BB.money(m.rev30) + '</b>' + (delta(m.rev30, prevRev) || '<em></em>') + '<small>vs the 30 days before</small></div></div>' +
        '<div class="a-s3"><div class="a-kpi"><span>Returning guests</span><b class="num">' + pct(m.returningShare) + '</b>' + (prevRet == null ? '<em class="up">Guests who stayed before</em>' : delta(m.returningShare, prevRet, 'pts')) + '<small>' + (prevRet == null ? 'of stays in the last 6 months' : 'of stays, last 6 months vs the 6 before') + '</small></div></div>' +
        '<div class="a-s3"><div class="a-kpi hi"><span>Fees saved this year</span><b class="num">' + BB.money(m.saved) + '</b><em class="up">' + plural(m.directYearCount, 'direct stay') + '</em><small>vs paying Airbnb’s 15.5% host fee</small></div></div>' +
        '<div class="a-s3"><div class="a-kpi"><span>Occupancy, next 30 days</span><b class="num">' + pct(m.occ) + '</b>' + delta(m.occ, prevOcc, 'pts') + '<small>vs the last 30 days</small></div></div>';
      const today = [...arr.map(b => bookingRow(b, 'arr')), ...dep.map(b => bookingRow(b, 'dep')), ...un.map(threadRowMini)];
      const needs = needItems();
      const ai = BB.aiScore(), task = s.ai.tasks.find(x => !x.done);
      const sent = s.campaigns.filter(c => c.status === 'sent').sort((a, b) => (b.sentAt || '').localeCompare(a.sentAt || ''))[0];
      const vis = m.visitors;
      const from12 = D.add(t, -365), srcCount = {};
      live.filter(b => b.createdAt > from12).forEach(b => { const k = srcKey(b); srcCount[k] = (srcCount[k] || 0) + 1; });
      const srcRows = Object.keys(srcCount).sort((a, b) => srcCount[b] - srcCount[a]), srcTot = srcRows.reduce((a, k) => a + srcCount[k], 0) || 1, srcMax = Math.max(1, ...srcRows.map(k => srcCount[k]));
      const sources = srcRows.length ? '<div class="a-srcs">' + srcRows.map(k => '<div class="a-srcr"><span class="a-src s-' + esc(k) + '"><i></i>' + esc(BB.SOURCE[k] || (BB.CHANNEL[k] ? BB.CHANNEL[k] + ' (add-on)' : k)) + '</span><b class="num">' + srcCount[k] + '<em>' + pct(srcCount[k] / srcTot) + '</em></b><div class="a-srcbar"><i class="s-' + esc(k) + '" style="width:' + Math.round(srcCount[k] / srcMax * 100) + '%"></i></div></div>').join('') + '</div>' +
        '<p class="a-note">' + pct(((srcCount.google || 0) + (srcCount.ai || 0)) / srcTot) + ' found you on Google or in an AI answer. ' + pct(((srcCount.email || 0) + (srcCount.campaign || 0)) / srcTot) + ' came back from your guest emails.</p>' : '<div class="a-empty"><p>No bookings in the last 12 months.</p></div>';
      const camp = sent ? '<button class="a-tile" data-a="nav" data-view="' + (V.campaign ? 'campaign' : 'campaigns') + '" data-id="' + sent.id + '"><b class="a-tile-t">' + esc(sent.subject) + '</b><span class="muted">' + esc(((BB.q.segments()[sent.segment] || {}).label || 'Guests')) + ' · ' + sent.recipients.toLocaleString('en-GB') + ' recipients</span>' +
        '<div class="a-minis"><div><span>Opened</span><b class="num">' + pct(sent.opens / Math.max(1, sent.recipients)) + '</b></div><div><span>Clicked</span><b class="num">' + pct(sent.clicks / Math.max(1, sent.recipients)) + '</b></div><div><span>Booked</span><b class="num">' + sent.bookings + '</b></div></div>' +
        '<span class="a-tile-f">' + BB.money(sent.revenue) + ' in direct bookings' + ic('arrow') + '</span></button>' : '<div class="a-empty"><p>No campaigns sent yet.</p><button class="btn sm" data-a="nav" data-view="campaigns">Write your first campaign</button></div>';
      return vh(hello + ', ' + esc(fst(s.account.owner)), esc(D.fmt(t, { weekday: 'long', month: 'long' })) + ' · ' + sum,
          '<button class="btn sm" data-a="nav" data-view="calendar">' + ic('cal') + 'Calendar</button><button class="btn sm" data-a="nav" data-view="checkin">' + ic('key') + 'Check-in board</button>') +
        '<div class="a-grid">' + kpis +
          '<div class="a-s8">' + card('Direct revenue: new vs returning guests', 'Earned per night, GBP', revChart(m)) + '</div>' +
          '<div class="a-s4 a-last">' + card('Today', D.fmt(t, { weekday: 'short' }), today.length ? '<div class="a-list a-today">' + today.join('') + '</div>' : '<div class="a-empty"><p>No arrivals, departures or messages today.</p></div>') + '</div>' +
          '<div class="a-s8">' + card('Needs you', needs.length ? plural(needs.length, 'item') : 'All clear', needs.length ? '<div class="a-list a-needs">' + needs.map(needRow).join('') + '</div>' : '<div class="a-empty">' + ic('check') + '<p>You are all caught up. Deposits, check-ins and messages are handled.</p></div>') + '</div>' +
          '<div class="a-s4 a-last">' + card('Where bookings came from', 'Last 12 months', sources) + '</div>' +
          '<div class="a-s4">' + card('AI visibility', ai.total + ' tracked questions', '<button class="a-tile a-ai" data-a="nav" data-view="ai">' + gauge(ai.score) + '<span><b>Mentioned in ' + ai.mentioned + ' of ' + ai.total + '</b><span class="muted">' + (task ? 'Next: ' + esc(task.text) + '.' : s.ai.checkedAt ? 'Every suggested fix is done.' : 'Not checked yet.') + '</span></span></button>') + '</div>' +
          '<div class="a-s4">' + card('Last campaign', sent ? 'Sent ' + D.fmt(sent.sentAt) : '', camp) + '</div>' +
          '<div class="a-s4 a-last">' + card('Websites', plural(s.properties.filter(p => p.published).length, 'site') + ' live',
            '<button class="a-tile" data-a="nav" data-view="website"><div class="a-trow"><span>Visitors, 30 days<em>' + pct(s.website.fromSearch) + ' from Google and AI answers</em></span><b class="num">' + vis.toLocaleString('en-GB') + '</b></div>' +
            '<div class="a-trow"><span>Booking conversion<em>Visit to paid stay</em></span><b class="num">' + ((m.conversion || 0) * 100).toFixed(1) + '%</b></div>' +
            '<div class="a-trow"><span>Direct stays this year<em>Booked on your sites</em></span><b class="num">' + m.directYearCount + '</b></div></button>') + '</div>' +
        '</div>';
    },
    click(ev, inst) {
      const r = ev.target.closest('[data-remind]'); if (r) { if (BB.act.remindCheckin(r.dataset.remind)) BB.toast('Reminder sent to ' + fst(gOf(BB.q.booking(r.dataset.remind)).name), 'good'); return; }
      const p = ev.target.closest('[data-paid]'); if (p) { BB.act.markPaid(p.dataset.paid); BB.toast('Marked as paid'); }
    },
    keydown(ev, inst) { if (ev.key === 'Enter' && ev.target.matches('.a-need[data-a]')) ev.target.click(); },
  };

  /* =====================================================================================
     CALENDAR
     ===================================================================================== */
  V.calendar = {
    label: 'Calendar', group: 'Run', icon: 'cal', order: 20,
    render(inst) {
      const s = S(), st = inst.st, t = s.today, u = inst.uid;
      const span = st.cal_span || 14, start = st.cal_start || D.add(t, -2), end = D.add(start, span);
      const days = []; for (let i = 0; i < span; i++) days.push(D.add(start, i));
      const props = st.cal_pid ? s.properties.filter(p => p.id === st.cal_pid) : s.properties;
      const sel = st.cal_sel, N = span, pctX = i => (i / N * 100).toFixed(4) + '%';
      const idx = d => D.diff(start, d);
      const wd = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
      const head = days.map((d, i) => { const w = D.dow(d); return '<div class="a-cal-d' + (w === 0 || w === 6 ? ' wk' : '') + (d === t ? ' tod' : '') + '">' + (i === 0 || d.slice(8) === '01' ? '<em>' + D.fmt(d, { day: undefined }) + '</em>' : '') + '<span>' + wd[w] + '</span><b class="num">' + Number(d.slice(8)) + '</b></div>'; }).join('');
      const [hh, mm] = s.clock.split(':').map(Number), nowI = idx(t);
      const now = nowI >= 0 && nowI < N ? '<i class="a-cal-now" style="left:' + (((nowI + (hh * 60 + mm) / 1440) / N) * 100).toFixed(3) + '%"></i>' : '';
      let occN = 0, occT = 0;
      const rows = props.map(p => {
        const bl = BB.q.blocked(p.id);
        days.forEach(d => { if (d >= t) { occT++; if (bl.has(d)) occN++; } });
        const cells = days.map(d => {
          const w = D.dow(d), taken = bl.has(d), past = d < t, on = sel && sel.pid === p.id && d >= sel.a && d < sel.b;
          const price = p.nightly + ([5, 6].includes(w) ? p.weekend : 0);
          return '<button type="button" class="a-cal-c' + (w === 0 || w === 6 ? ' wk' : '') + (past ? ' past' : '') + (taken ? ' taken' : '') + (on ? ' sel' : '') + (d === t ? ' tod' : '') + '" data-cell="' + p.id + '|' + d + '"' + (past || taken ? ' tabindex="-1"' : '') + ' aria-label="' + esc(p.short + ', night of ' + D.fmt(d, { weekday: 'long', month: 'long' }) + (taken ? ', booked' : past ? '' : ', open at ' + BB.money(price))) + '">' + (!taken && !past && span <= 14 ? '<small class="num">' + BB.money(price) + '</small>' : '') + '</button>';
        }).join('');
        const bars = [];
        s.bookings.filter(b => b.propertyId === p.id && b.status !== 'cancelled' && b.checkOut > start && b.checkIn < end).forEach(b => {
          const L = b.checkIn < start ? 0 : idx(b.checkIn) + 0.5, R = b.checkOut >= end ? N : idx(b.checkOut) + 0.5, g = gOf(b);
          const wide = (R - L) >= 1.4;
          bars.push('<button class="a-bar-b c-' + b.channel + (b.checkIn < start ? ' cl' : '') + (b.checkOut >= end ? ' cr' : '') + (b.status === 'completed' ? ' done' : '') + (st.view === 'calendar' && st.cal_hl === b.id ? ' hl' : '') + '" style="left:calc(' + pctX(L) + ' + 2px);width:calc(' + pctX(R - L) + ' - 4px)" data-bar="' + b.id + '" title="' + esc(g.name + ' · ' + BB.sourceLabel(b) + ' · ' + BB.dates(b) + ' · ' + plural(nightsOf(b), 'night') + ' · ' + BB.money(b.total)) + '">' + (wide ? '<b>' + esc(g.name) + '</b><span>' + (R - L >= 3 ? (b.channel !== 'direct' ? esc(BB.CHANNEL[b.channel]) + ' add-on' : plural(nightsOf(b), 'night')) + ' · ' + BB.money(b.total) : plural(nightsOf(b), 'night')) + '</span>' : '<span class="sr">' + esc(g.name) + '</span>') + '</button>');
        });
        s.blocks.filter(k => k.propertyId === p.id && k.to > start && k.from < end).forEach(k => {
          const L = k.from < start ? 0 : idx(k.from), R = k.to >= end ? N : idx(k.to);
          const on = st.cal_blk && st.cal_blk.pid === p.id && st.cal_blk.from === k.from;
          bars.push('<button class="a-bar-b blk' + (k.sync ? ' syn' : '') + (on ? ' on' : '') + '" style="left:calc(' + pctX(L) + ' + 2px);width:calc(' + pctX(R - L) + ' - 4px)" data-blk="' + p.id + '|' + k.from + '" title="' + esc((k.sync ? k.note + ' · ' : 'Blocked · ') + D.fmt(k.from) + ' – ' + D.fmt(k.to) + (k.sync ? ' · from your calendar sync' : ': ' + k.note)) + '">' + ((R - L) >= 1.4 ? '<b>' + esc(k.note || 'Blocked') + '</b><span>' + (k.sync ? 'Calendar sync' : 'Blocked') + '</span>' : '<span class="sr">' + esc(k.sync ? k.note : 'Blocked') + '</span>') + '</button>');
        });
        return '<div class="a-cal-row"><button class="a-cal-p" data-calpid="' + p.id + '" title="Show only ' + esc(p.name) + '"><i style="background:' + esc(p.color || 'var(--primary)') + '"></i><span><b>' + esc(p.short) + '</b><em>' + BB.money(p.nightly) + ' · min ' + p.minNights + '</em></span></button><div class="a-cal-track" style="--n:' + N + '">' + cells + bars.join('') + now + '</div></div>';
      }).join('');
      // panel
      let panel = '';
      if (sel) {
        const p = P(sel.pid), n = D.diff(sel.a, sel.b), free = BB.q.isAvailable(sel.pid, sel.a, sel.b), q = BB.quote(sel.pid, sel.a, sel.b, { adults: 2 });
        panel = '<div class="a-cal-panel" role="region" aria-label="Selected nights"><div class="a-cal-pi"><span class="a-ico">' + ic('cal') + '</span><span class="a-row-t"><b>' + esc(p.name) + ' · ' + D.fmt(sel.a, { weekday: 'short' }) + ' to ' + D.fmt(sel.b, { weekday: 'short' }) + '</b><span>' + plural(n, 'night') + (free ? ' open · ' + (q ? BB.money(q.total) + ' with cleaning at your rates' : '') : ' · some of these nights are taken') + '. Drag across the row or click another night to change the range.</span></span></div>' +
          '<div class="a-cal-pa"><input class="input" id="calnote-' + u + '" data-calnote placeholder="Reason, e.g. Owner stay" value="' + esc(st.cal_note || '') + '" aria-label="Reason for blocking">' +
          '<button class="btn sm" data-calblock' + (free ? '' : ' disabled') + '>' + ic('lock') + 'Block these nights</button><button class="btn primary sm" data-calnew' + (free ? '' : ' disabled') + '>' + ic('plus') + 'New booking</button><button class="iconbtn" data-calclear aria-label="Clear selection">' + ic('x') + '</button></div></div>';
      } else if (st.cal_blk) {
        const k = s.blocks.find(x => x.propertyId === st.cal_blk.pid && x.from === st.cal_blk.from);
        if (k && k.sync) panel = '<div class="a-cal-panel"><div class="a-cal-pi"><span class="a-ico">' + ic('cal') + '</span><span class="a-row-t"><b>' + esc(P(k.propertyId).name + ' · ' + k.note + ' · ' + D.fmt(k.from) + ' – ' + D.fmt(k.to)) + '</b><span>From your ' + esc(BB.q.integration(k.sync).name) + ' link. Closed on your booking sites so you never double book. We only see the dates, so change them where they were booked.</span></span></div><div class="a-cal-pa"><button class="iconbtn" data-calclear aria-label="Close">' + ic('x') + '</button></div></div>';
        else if (k) panel = '<div class="a-cal-panel"><div class="a-cal-pi"><span class="a-ico">' + ic('lock') + '</span><span class="a-row-t"><b>' + esc(P(k.propertyId).name + ' · blocked ' + D.fmt(k.from) + ' – ' + D.fmt(k.to)) + '</b><span>' + esc(k.note || 'Blocked') + '. Closed on your booking sites.</span></span></div><div class="a-cal-pa"><button class="btn sm" data-calunblock>Reopen these nights</button><button class="iconbtn" data-calclear aria-label="Close">' + ic('x') + '</button></div></div>';
      }
      const gaps = gapNights(30);
      const chans = ['direct'];
      const title = D.fmt(start) + ' – ' + D.fmt(D.add(end, -1), { year: 'numeric' });
      return vh('Calendar', esc(title) + ' · all your homes in one place · ' + pct(occT ? occN / occT : 0) + ' of open nights booked',
          (addonOn() ? '<button class="btn sm" data-calsync>' + ic('sync') + 'Check synced calendars</button>' : '') + '<button class="btn primary sm" data-a="new">' + ic('plus') + 'New booking</button>') +
        '<div class="a-cal-tools"><div class="a-cal-nav"><button class="iconbtn" data-calmove="-1" aria-label="Earlier">' + ic('back') + '</button><button class="btn sm" data-caltoday>Today</button><button class="iconbtn" data-calmove="1" aria-label="Later">' + ic('chev') + '</button><b class="num">' + esc(title) + '</b></div>' +
          '<div class="a-cal-f"><div class="seg" role="group" aria-label="Range"><button data-calspan="14" aria-pressed="' + (span === 14) + '">2 weeks</button><button data-calspan="31" aria-pressed="' + (span === 31) + '">Month</button></div>' +
          '<select class="input a-sel" id="calpid-' + u + '" data-calpidsel aria-label="Homes"><option value="">All homes</option>' + s.properties.map(p => '<option value="' + p.id + '"' + (st.cal_pid === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></div></div>' +
        '<div class="a-card a-cal-card"><div class="a-cal-scroll" id="acal-' + u + '"><div class="a-cal' + (span > 14 ? ' month' : '') + '" style="--n:' + N + '">' +
          '<div class="a-cal-row a-cal-hrow"><div class="a-cal-p a-cal-corner">' + plural(props.length, 'home') + '</div><div class="a-cal-track a-cal-head" style="--n:' + N + '">' + head + '</div></div>' + rows +
        '</div></div>' +
        '<div class="a-cal-foot"><div class="a-legend">' + chans.map(c => '<span><i class="c-' + c + '"></i>' + (c === 'direct' ? 'Direct booking' : BB.CHANNEL[c]) + '</span>').join('') + (addonOn() || s.blocks.some(k => k.sync) ? '<span><i class="blk syn"></i>Booked elsewhere (calendar sync)</span>' : '') + '<span><i class="blk"></i>Blocked</span><span><i class="sel"></i>Your selection</span></div><span class="muted">Click a night, or drag across nights, to block them or add a booking.</span></div>' + panel + '</div>' +
        '<div class="a-grid a-mt">' +
          '<div class="a-s8">' + card('Gap nights', 'Next 30 days', gaps.length ? '<div class="a-list">' + gaps.map(gp => '<div class="a-row"><span class="a-ico">' + ic('cal') + '</span><span class="a-row-t"><b>' + esc(gp.p.short + ' · ' + D.fmt(gp.from, { weekday: 'short' }) + ' – ' + D.fmt(gp.to)) + '</b><span>' + plural(gp.n, 'night') + ' between two stays' + (gp.n < gp.p.minNights ? ', shorter than your ' + gp.p.minNights + '-night minimum' : '') + ' · ' + BB.money(gp.value) + ' at your rates</span></span><span class="a-row-m"><button class="btn sm" data-calgap="' + gp.p.id + '|' + gp.from + '|' + gp.to + '">Select</button><button class="btn sm" data-a="nav" data-view="campaigns">Offer to past guests</button></span></div>').join('') + '</div>' : '<div class="a-empty"><p>No short gaps in the next 30 days.</p></div>') + '</div>' +
          '<div class="a-s4">' + (addonOn() ? card('Calendar sync add-on', '', '<div class="a-list">' + ADDONS.filter(c => BB.q.connected(c)).map(c => { const i = BB.q.integration(c); return '<div class="a-row"><span class="a-ico">' + ic('sync') + '</span><span class="a-row-t"><b>' + esc(i.name) + '</b><span>Checked ' + esc(BB.ago(i.lastSync || s.today + 'T' + s.clock)) + '</span></span><span class="a-row-m">' + BB.pill('good', 'On') + '</span></div>'; }).join('') + '</div><p class="a-note">Dates booked there show here as blocked, so you never double book. We read dates only, never guests, prices or messages.</p>')
            : card('Your calendar', '', '<div class="a-own"><span class="a-ico">' + ic('lock') + '</span><p><b>Your sites are the only place to book.</b> Every stay here was booked direct, so nothing can double book.</p></div><p class="a-note">Still taking bookings elsewhere while you grow direct? The calendar sync add-on (£15/month) reads the calendar from your channel manager, Airbnb, Vrbo or Booking.com and blocks those dates here.</p><button class="btn sm" data-a="nav" data-view="connections">See the add-on' + ic('arrow') + '</button>')) + '</div>' +
        '</div>';
    },
    click(ev, inst) {
      const st = inst.st, t = ev.target, today = S().today;
      if (inst._noClick) { inst._noClick = false; if (t.closest('[data-cell]')) return; }
      const bar = t.closest('[data-bar]'); if (bar) return inst.nav('booking', bar.dataset.bar);
      const blk = t.closest('[data-blk]'); if (blk) { const [pid, from] = blk.dataset.blk.split('|'); return inst.set({ cal_blk: { pid, from }, cal_sel: null }); }
      const c = t.closest('[data-cell]');
      if (c) {
        const [pid, d] = c.dataset.cell.split('|'); if (d < today || BB.q.blocked(pid).has(d)) return;
        const sel = st.cal_sel;
        if (sel && sel.pid === pid && D.diff(sel.a, sel.b) === 1 && sel.a === d) return inst.set({ cal_sel: null });
        if (sel && sel.pid === pid && d >= sel.a && D.diff(sel.a, sel.b) === 1) {
          if (!BB.q.isAvailable(pid, sel.a, D.add(d, 1))) { BB.toast('Those nights cross an existing stay. Pick a shorter range.'); return inst.set({ cal_sel: { pid, a: d, b: D.add(d, 1) } }); }
          return inst.set({ cal_sel: { pid, a: sel.a, b: D.add(d, 1) }, cal_blk: null });
        }
        return inst.set({ cal_sel: { pid, a: d, b: D.add(d, 1) }, cal_blk: null });
      }
      const span = st.cal_span || 14, start = st.cal_start || D.add(today, -2);
      const mv = t.closest('[data-calmove]'); if (mv) return inst.set({ cal_start: D.add(start, +mv.dataset.calmove * (span === 14 ? 7 : 28)) });
      if (t.closest('[data-caltoday]')) return inst.set({ cal_start: D.add(today, -2) });
      const sp = t.closest('[data-calspan]'); if (sp) return inst.set({ cal_span: +sp.dataset.calspan });
      const pp = t.closest('[data-calpid]'); if (pp) return inst.set({ cal_pid: st.cal_pid === pp.dataset.calpid ? null : pp.dataset.calpid });
      if (t.closest('[data-calclear]')) return inst.set({ cal_sel: null, cal_blk: null });
      if (t.closest('[data-calblock]') && st.cal_sel) {
        const sel = st.cal_sel; BB.act.block(sel.pid, sel.a, sel.b, (st.cal_note || '').trim() || 'Blocked by host');
        BB.toast('Blocked ' + D.fmt(sel.a) + ' – ' + D.fmt(sel.b) + ' at ' + P(sel.pid).short + ' on your booking sites', 'good');
        return inst.set({ cal_sel: null, cal_note: '' });
      }
      if (t.closest('[data-calnew]') && st.cal_sel) { const sel = st.cal_sel; return openNewBooking(inst, { propertyId: sel.pid, a: sel.a, b: sel.b }); }
      if (t.closest('[data-calunblock]') && st.cal_blk && !(s => s && s.sync)(S().blocks.find(x => x.propertyId === st.cal_blk.pid && x.from === st.cal_blk.from))) { const k = st.cal_blk; BB.act.unblock(k.pid, k.from); BB.toast('Reopened those nights on your booking sites', 'good'); return inst.set({ cal_blk: null }); }
      const gp = t.closest('[data-calgap]'); if (gp) { const [pid, a, b] = gp.dataset.calgap.split('|'); return inst.set({ cal_sel: { pid, a, b }, cal_blk: null, cal_pid: st.cal_pid && st.cal_pid !== pid ? null : st.cal_pid, cal_start: a >= start && b <= D.add(start, span) ? start : D.add(a, -2) }); }
      if (t.closest('[data-calsync]')) {
        const made = ADDONS.filter(c => BB.q.connected(c)).map(c => BB.act.syncChannel(c)).filter(Boolean);
        BB.toast(made.length ? made.map(k => k.note + ': ' + P(k.propertyId).short + ', ' + D.fmt(k.from) + ' – ' + D.fmt(k.to)).join('. ') + '. Blocked on your sites.' : 'Checked. No new dates on your synced calendars.', made.length ? 'good' : '');
      }
    },
    input(ev, inst) { if (ev.target.matches('[data-calnote]')) inst.st.cal_note = ev.target.value; },
    change(ev, inst) { if (ev.target.matches('[data-calpidsel]')) inst.set({ cal_pid: ev.target.value || null }); },
    keydown(ev, inst) { if (ev.key === 'Enter' && ev.target.matches('[data-calnote]') && inst.st.cal_sel) { ev.preventDefault(); inst.root.querySelector('[data-calblock]').click(); } },
  };

  /* =====================================================================================
     RESERVATIONS
     ===================================================================================== */
  function resBucket(b, t) {
    if (b.status === 'cancelled') return 'cancelled';
    if (b.status === 'completed' || b.checkOut < t) return 'past';
    if (b.checkIn <= t && b.checkOut > t) return 'staying';
    if (b.checkOut === t) return 'staying';
    return 'upcoming';
  }
  V.reservations = {
    label: 'Reservations', group: 'Run', icon: 'list', order: 30,
    render(inst) {
      const s = S(), st = inst.st, t = s.today, u = inst.uid;
      const f = st.res_f || 'upcoming', ch = st.res_ch || '', q = (st.res_q || '').trim().toLowerCase();
      const counts = { upcoming: 0, staying: 0, past: 0, cancelled: 0, all: s.bookings.length };
      s.bookings.forEach(b => counts[resBucket(b, t)]++);
      let list = s.bookings.filter(b => (f === 'all' || resBucket(b, t) === f) && (!ch || srcKey(b) === ch) && (!q || (b.id + ' ' + gOf(b).name + ' ' + P(b.propertyId).name + ' ' + gOf(b).email).toLowerCase().includes(q)));
      list.sort(f === 'upcoming' || f === 'staying' ? byIn : (a, b) => b.checkIn.localeCompare(a.checkIn));
      const lim = st.res_lim || 25, shown = list.slice(0, lim);
      const total = list.filter(b => b.status !== 'cancelled' && b.status !== 'request').reduce((x, b) => x + b.total, 0);
      const chips = [['upcoming', 'Upcoming'], ['staying', 'Staying now'], ['past', 'Past'], ['cancelled', 'Cancelled'], ['all', 'All']].map(([k, l]) => '<button class="chip" data-resf="' + k + '" aria-pressed="' + (f === k) + '">' + l + '<span class="a-cnt num">' + counts[k] + '</span></button>').join('');
      const rows = shown.map(b => {
        const g = gOf(b), p = P(b.propertyId), live = b.status === 'confirmed';
        return '<tr data-open data-a="nav" data-view="booking" data-id="' + b.id + '"' + (b.status === 'cancelled' ? ' class="x"' : '') + '><td><div class="a-who">' + BB.avatar(g.name, 'sm') + '<span><b>' + esc(g.name) + '</b><em class="num">' + b.id + '</em></span></div></td><td>' + esc(p.short) + '</td><td class="num nw">' + BB.dates(b) + '</td><td class="num">' + nightsOf(b) + '</td><td>' + srcChip(b) + '</td><td class="num r">' + BB.money(b.total) + (b.paid ? '' : '<em class="a-unpaid">Unpaid</em>') + '</td><td>' + (live ? '<span class="a-ci">' + BB.stepDots(b) + '<em>' + (b.checkin.done ? 'Done' : ciState(b) === 'started' ? 'Started' : 'Not started') + '</em></span>' : '<span class="muted">—</span>') + '</td><td>' + BB.statusPill(b) + '</td></tr>';
      }).join('');
      return vh('Reservations', plural(list.length, 'stay') + ' · ' + BB.money(total) + (f === 'cancelled' ? ' refunded' : ' booked') + ' · all direct', '<button class="btn primary sm" data-a="new">' + ic('plus') + 'New booking</button>') +
        '<div class="a-filters"><div class="a-chips" role="group" aria-label="Status">' + chips + '</div><div class="a-fr"><select class="input a-sel" id="resch-' + u + '" data-resch aria-label="Source"><option value="">All sources</option>' + [...new Set(s.bookings.map(srcKey))].sort().map(c => '<option value="' + esc(c) + '"' + (ch === c ? ' selected' : '') + '>' + esc(BB.SOURCE[c] || (BB.CHANNEL[c] ? BB.CHANNEL[c] + ' (add-on)' : c)) + '</option>').join('') + '</select>' +
        '<label class="a-fsearch">' + ic('search') + '<input id="resq-' + u + '" data-resq type="search" placeholder="Guest, home or booking ID" value="' + esc(st.res_q || '') + '" aria-label="Search reservations"></label></div></div>' +
        '<div class="a-card a-flush"><div class="tblwrap" id="restbl-' + u + '"><table class="tbl a-tbl"><thead><tr><th>Guest</th><th>Home</th><th>Dates</th><th>Nights</th><th>Source</th><th class="r">Total</th><th>Check-in</th><th>Status</th></tr></thead><tbody>' +
        (rows || '<tr><td colspan="8"><div class="a-empty"><p>No reservations match these filters.</p><button class="btn sm" data-resreset>Clear filters</button></div></td></tr>') + '</tbody></table></div>' +
        (list.length > lim ? '<div class="a-more"><button class="btn sm" data-resmore>Show ' + Math.min(25, list.length - lim) + ' more</button><span class="muted">Showing ' + lim + ' of ' + list.length + '</span></div>' : '') + '</div>';
    },
    click(ev, inst) {
      const t = ev.target;
      const f = t.closest('[data-resf]'); if (f) return inst.set({ res_f: f.dataset.resf, res_lim: 25 });
      if (t.closest('[data-resmore]')) return inst.set({ res_lim: (inst.st.res_lim || 25) + 25 });
      if (t.closest('[data-resreset]')) return inst.set({ res_f: 'all', res_ch: '', res_q: '' });
    },
    input(ev, inst) { if (ev.target.matches('[data-resq]')) inst.set({ res_q: ev.target.value, res_lim: 25 }); },
    change(ev, inst) { if (ev.target.matches('[data-resch]')) inst.set({ res_ch: ev.target.value, res_lim: 25 }); },
  };

  /* =====================================================================================
     BOOKING DETAIL
     ===================================================================================== */
  const KIND_ICON = { booking: 'cal', payment: 'card', sync: 'sync', message: 'inbox', email: 'mail', sms: 'sms', lock: 'lock', checkin: 'key', campaign: 'users', site: 'web', system: 'gear', ai: 'spark' };
  V.booking = {
    label: 'Booking', group: 'Run', icon: 'cal', hidden: true, parent: 'reservations',
    render(inst) {
      const s = S(), st = inst.st, b = BB.q.booking(st.id);
      if (!b) return vh('Booking not found', 'It may have been removed when the demo was reset.') + '<div class="a-card a-empty"><button class="btn sm" data-a="nav" data-view="reservations">Back to reservations</button></div>';
      const g = gOf(b), p = P(b.propertyId), t = s.today, c = b.checkin, th = BB.q.threadFor(b.id);
      const n = nightsOf(b), stays = BB.q.stays(g.id), life = BB.q.lifetime(g.id);
      const canCancel = b.status === 'confirmed' && b.checkOut > t;
      // price
      const pr = b.price || {};
      const fee = b.platformFee || 0, payout = b.total - fee;
      const price = '<div class="a-q">' +
        '<div><span>' + plural(n, 'night') + (n ? ', avg ' + BB.money(Math.round((pr.nightly || 0) / n)) : '') + '</span><b class="num">' + BB.money(pr.nightly || 0) + '</b></div>' +
        '<div><span>Cleaning</span><b class="num">' + BB.money(pr.cleaning || 0) + '</b></div>' +
        (pr.pet ? '<div><span>Pet fee</span><b class="num">' + BB.money(pr.pet) + '</b></div>' : '') +
        (pr.discount ? '<div class="good"><span>Code ' + esc(b.promo || '') + '</span><b class="num">' + BB.money(-pr.discount) + '</b></div>' : '') +
        '<div class="tot"><span>' + (b.paid || b.channel !== 'direct' ? 'Guest paid' : 'Guest pays') + '</span><b class="num">' + BB.money(b.total) + '</b></div>' +
        (b.channel === 'direct' ? '<div><span>Platform fee</span><b class="num">' + BB.money(0) + '</b></div><div class="tot"><span>You receive</span><b class="num">' + BB.money(b.total) + '</b></div><p class="a-q-save">' + ic('spark') + (b.status === 'request' ? 'Direct request. If it goes ahead you keep the ' + BB.money(Math.round(b.total * BB.PLATFORM_FEE.airbnb)) + ' Airbnb would take as its host fee.' : 'Booked direct. You kept the ' + BB.money(Math.round(b.total * BB.PLATFORM_FEE.airbnb)) + ' Airbnb would have taken as its host fee.') + '</p>'
          : '<div class="bad"><span>' + BB.CHANNEL[b.channel] + ' fee (' + Math.round(BB.PLATFORM_FEE[b.channel] * 1000) / 10 + '%)</span><b class="num">' + BB.money(-fee) + '</b></div><div class="tot"><span>You receive</span><b class="num">' + BB.money(payout) + '</b></div>') + '</div>';
      // payment
      const payLine = b.status === 'cancelled' ? ['bad', 'Refunded', BB.money(b.total) + ' returned to the guest.'] :
        b.channel !== 'direct' ? ['good', 'Paid through ' + BB.CHANNEL[b.channel], BB.CHANNEL[b.channel] + ' pays out ' + BB.money(payout) + ' after check-in.'] :
        b.paid ? ['good', 'Paid by card', 'Charged ' + D.fmt(b.createdAt) + ' through Stripe. Payout ' + (D.add(b.createdAt, 2) <= t ? 'landed ' : 'lands ') + D.fmt(D.add(b.createdAt, 2)) + '.'] :
        b.status === 'request' ? ['warn', 'Not paid yet', BB.q.connected('stripe') ? 'Accept the request and the guest gets a Stripe payment link.' : 'Accept the request, then take payment your usual way. Connect Stripe to send a card payment link instead.'] :
        ['warn', 'Not paid yet', S().live ? 'Record the payment when it arrives.' : 'Booked by phone or by hand. Record the payment when it arrives.'];
      const depTxt = { none: c.deposit ? 'Hold placed' : 'No hold yet. The guest adds it during check-in.', held: BB.money(DEP) + ' held on the guest’s card. Released 3 days after checkout, ' + D.fmt(D.add(b.checkOut, 3)) + '.', releasing: 'Releasing now. Back on the card within 3 days.', released: BB.money(DEP) + ' hold released.' }[b.deposit] || '';
      const depPill = { none: BB.pill('muted', 'None'), held: BB.pill('good', 'Held'), releasing: BB.pill('info', 'Releasing'), released: BB.pill('muted', 'Released') }[b.deposit] || '';
      // check-in steps
      const steps = (S().live ? [['id', 'ID photo', c.id ? 'Uploaded. Open it below.' : 'Photo ID for the lead guest', c.id]] : [['id', 'ID verified', 'Photo ID for the lead guest', c.id], ['selfie', 'Selfie match', 'Matches the photo ID', c.selfie]]).concat([['guests', 'Guest names', (b.adults + b.children) + ' guests' + (b.pets ? ' and a dog' : ''), c.guests], ['agreement', 'Rental agreement', c.signature ? 'Signed by ' + g.name : 'House rules e-signature', c.agreement], ['deposit', 'Security deposit', BB.money(DEP) + ' card hold', c.deposit], ['arrival', 'Arrival time', c.arrival ? 'Arriving ' + c.arrival : 'Not shared yet', !!c.arrival]]);
      const done = steps.filter(x => x[3]).length;
      const lock = BB.q.connected('lock'), noLock = S().live && !lock && !(BB.q.integration('lock') || {}).lastSync;
      const code = noLock ? '<div class="a-code off"><span class="a-ico">' + ic('lock') + '</span><div><span class="eyebrow">Getting in</span><b>' + (c.done ? 'Arrival notes shared' : 'Shared when check-in is done') + '</b><em>' + (p.entry ? 'The guest sees your arrival notes from Website & SEO.' : 'Add arrival notes in Website & SEO, or connect a Nuki lock for a code per stay.') + '</em></div></div>'
        : c.done ? '<div class="a-code"><span class="a-ico">' + ic('lock') + '</span><div><span class="eyebrow">Door code</span><b class="num">' + esc(b.code) + '</b><em>' + (lock ? 'Active ' + D.fmt(b.checkIn) + ' ' + esc(p.checkinTime) + ' to ' + D.fmt(b.checkOut) + ' ' + esc(p.checkoutTime) + ' on the Nuki lock' : 'The smart lock is disconnected. Set this code on the lock by hand.') + '</em></div>' + (lock ? '' : BB.pill('warn', 'Set by hand')) + '</div>'
        : '<div class="a-code off"><span class="a-ico">' + ic('lock') + '</span><div><span class="eyebrow">Door code</span><b>Sent when check-in is done</b><em>' + (lock ? 'The lock creates a unique code for this stay automatically.' : 'The smart lock is disconnected, so you will need to set the code by hand.') + '</em></div></div>';
      // timeline
      const evs = s.events.filter(e => e.ref === b.id || (th && e.ref === th.id));
      const tl = evs.map(e => '<li class="tk-' + e.kind + '"><span class="a-tl-i">' + ic(KIND_ICON[e.kind] || 'spark') + '</span><div><p>' + (e.kind === 'ai' ? BB.aiText(e.text) : esc(e.text)) + '</p><span class="num">' + esc(BB.ago(e.at)) + ' · ' + esc(e.source) + '</span></div></li>').join('') +
        '<li class="tk-booking"><span class="a-tl-i">' + ic('cal') + '</span><div><p>' + (b.channel === 'direct' ? (b.status === 'request' || b.declined ? 'Requested direct' : 'Booked direct') + (b.source === 'console' ? ' in the host console' : b.source === 'mobile' ? ' in the host app' : ' on ' + p.domain + ', found via ' + BB.sourceLabel(b).toLowerCase()) : 'Synced from ' + BB.CHANNEL[b.channel] + ' by the calendar sync add-on') + ', for ' + BB.money(b.total) + '.</p><span class="num">' + D.fmt(b.createdAt, { year: 'numeric' }) + '</span></div></li>';
      const confirm = st.bk_cancel === b.id ? '<div class="a-confirm" role="alert"><div><b>Cancel ' + b.id + ' and refund ' + BB.money(b.total) + '?</b><p>' + esc(fst(g.name)) + ' gets an email, and ' + D.fmt(b.checkIn) + ' – ' + D.fmt(b.checkOut) + ' reopens on your booking sites. This cannot be undone.</p></div><div class="a-acts"><button class="btn sm" data-bkkeep>Keep booking</button><button class="btn sm a-danger" data-bkcancel="' + b.id + '">Yes, cancel and refund</button></div></div>' : '';
      const sub = '<span class="num">' + b.id + '</span> · ' + esc(p.name) + ' · ' + BB.dates(b) + ' · ' + plural(n, 'night');
      return '<button class="a-back" data-a="nav" data-view="reservations">' + ic('back') + 'Reservations</button>' +
        vh(esc(g.name) + ' <span class="a-vh-pills">' + BB.statusPill(b) + srcChip(b) + '</span>', sub,
          '<button class="btn sm" data-bkmsg="' + b.id + '">' + ic('inbox') + 'Message guest</button><button class="btn sm" data-a="go" data-surface="guest" data-opts=\'' + esc(JSON.stringify({ bookingId: b.id })) + '\'>' + ic('phone') + 'Open in guest app</button><button class="btn sm" data-a="go" data-surface="property" data-opts=\'' + esc(JSON.stringify({ propertyId: p.id })) + '\'>' + ic('out') + 'View on site</button>' +
          (canCancel && st.bk_cancel !== b.id ? '<button class="btn sm a-danger-ghost" data-bkask>Cancel booking</button>' : '')) +
        confirm +
        '<div class="a-grid">' +
          '<div class="a-s8"><div class="a-stack">' +
            card('Stay', esc(p.short), '<div class="a-facts">' +
              '<div><span>Check-in</span><b>' + D.fmt(b.checkIn, { weekday: 'short' }) + '</b><em>from ' + esc(p.checkinTime) + '</em></div>' +
              '<div><span>Check-out</span><b>' + D.fmt(b.checkOut, { weekday: 'short' }) + '</b><em>by ' + esc(p.checkoutTime) + '</em></div>' +
              '<div><span>Guests</span><b>' + plural(b.adults, 'adult') + (b.children ? ', ' + plural(b.children, 'child', 'children') : '') + '</b><em>' + (b.pets ? 'Bringing a dog' : 'No pets') + '</em></div>' +
              '<div><span>Booked</span><b>' + D.fmt(b.createdAt) + '</b><em>' + esc(BB.sourceLabel(b)) + '</em></div>' +
              '<div><span>Home</span><b>' + esc(p.short) + '</b><em>' + esc(p.address || p.area || '') + '</em></div>' +
              '<div><span>Booking</span><b class="num">' + b.id + '</b><em>' + (b.promo ? 'Code ' + esc(b.promo) : 'No promo code') + '</em></div></div>') +
            card('Check-in', done + ' of ' + steps.length + ' done', '<ul class="a-steps">' + steps.map(x => '<li class="' + (x[3] ? 'on' : '') + '"><span class="a-stp">' + ic(x[3] ? 'check' : 'clock') + '</span><span class="a-row-t"><b>' + x[1] + '</b><span>' + esc(x[2]) + '</span></span><span class="a-row-m">' + (x[3] ? BB.pill('good', 'Done') : BB.pill('muted', 'Waiting')) + '</span></li>').join('') + '</ul>' + (S().live && c.id ? '<a class="btn sm" href="/app/id/' + encodeURIComponent(b.id) + '" target="_blank" rel="noopener">' + ic('id') + 'View ID photo</a>' : '') + code +
              (b.status === 'confirmed' && !c.done ? '<div class="a-inline">' + (remindedAt(b.id) ? '<span class="a-done">' + ic('check') + 'Reminder sent at ' + remindedAt(b.id) + '</span>' : '<button class="btn sm" data-remind="' + b.id + '">' + ic('sms') + 'Send check-in reminder</button>') + '</div>' : '')) +
            card('Timeline', plural(evs.length + 1, 'event'), '<ol class="a-tl">' + tl + '</ol>') +
          '</div></div>' +
          '<div class="a-s4"><div class="a-stack">' +
            card('Guest', '', '<div class="a-guest">' + BB.avatar(g.name, 'lg') + '<div><b>' + esc(g.name) + '</b><span>' + esc(g.city || 'Location not shared') + '</span></div></div>' +
              '<div class="a-kv"><div><span>Email</span><b>' + esc(g.email) + '</b></div><div><span>Phone</span><b>' + esc(g.phone || 'Not shared') + '</b></div><div><span>Stays</span><b>' + plural(stays.length, 'stay') + ' · ' + BB.money(life) + '</b></div><div><span>Emails</span><b>' + (g.subscribed ? 'Subscribed' : 'Not subscribed') + '</b></div></div>' +
              (g.tags && g.tags.length ? '<div class="a-tags">' + g.tags.map(x => '<span>' + esc(x) + '</span>').join('') + '</div>' : '') +
              (g.notes ? '<p class="a-note">' + esc(g.notes) + '</p>' : '') +
              '<button class="btn sm block" data-a="nav" data-view="guest" data-id="' + g.id + '">Open guest profile' + ic('arrow') + '</button>') +
            card('Price', b.channel === 'direct' ? 'Direct' : BB.CHANNEL[b.channel], price) +
            card('Payment', '', '<div class="a-pay"><div class="a-trow"><span>' + payLine[1] + '<em>' + esc(payLine[2]) + '</em></span>' + BB.pill(payLine[0], payLine[0] === 'good' ? 'Paid' : payLine[0] === 'bad' ? 'Refunded' : 'Unpaid') + '</div>' +
              '<div class="a-trow"><span>Security deposit<em>' + esc(depTxt) + '</em></span>' + depPill + '</div></div>' +
              (b.status === 'request' ? '<button class="btn sm block primary" data-accept="' + b.id + '">' + ic('check') + 'Accept request</button><button class="btn sm block" data-decline="' + b.id + '">Decline</button>' : '') +
              (!b.paid && b.status === 'confirmed' ? (S().live ? '<button class="btn sm block primary" data-paylink="' + b.id + '">' + ic('send') + 'Email a payment link</button>' : '') + '<button class="btn sm block" data-paid="' + b.id + '">' + ic('check') + 'Mark as paid</button>' : '')) +
          '</div></div>' +
        '</div>';
    },
    click(ev, inst) {
      const t = ev.target, st = inst.st;
      if (t.closest('[data-bkask]')) return inst.set({ bk_cancel: st.id });
      if (t.closest('[data-bkkeep]')) return inst.set({ bk_cancel: null });
      const cx = t.closest('[data-bkcancel]'); if (cx) { st.bk_cancel = null; BB.act.cancelBooking(cx.dataset.bkcancel, 'Host console'); BB.toast('Cancelled and refunded. Nights reopened everywhere.', 'good'); return; }
      const m = t.closest('[data-bkmsg]'); if (m) { const b = BB.q.booking(m.dataset.bkmsg); const th = BB.act.openThread(b.guestId, b.id); return inst.nav('inbox', th.id); }
      const r = t.closest('[data-remind]'); if (r) { if (BB.act.remindCheckin(r.dataset.remind)) BB.toast('Reminder sent', 'good'); return; }
      const p = t.closest('[data-paid]'); if (p) { BB.act.markPaid(p.dataset.paid); BB.toast('Payment recorded', 'good'); }
      const ac = t.closest('[data-accept]'); if (ac) { BB.act.acceptRequest(ac.dataset.accept); BB.toast(BB.q.connected('stripe') ? 'Accepted. The guest gets a payment link.' : 'Accepted. Arrange payment with the guest, then mark it paid.', 'good'); return; }
      const dc = t.closest('[data-decline]'); if (dc) { if (dc.nextElementSibling && dc.nextElementSibling.classList.contains('a-decl')) return; const f = document.createElement('div'); f.className = 'a-decl'; f.innerHTML = '<label for="a-decl-why">Note for the guest (optional)</label><textarea id="a-decl-why" rows="3" placeholder="Sorry, those dates no longer work for us."></textarea><div class="a-decl-row"><button class="btn sm" data-decline-cancel>Keep request</button><button class="btn sm primary" data-decline-go="' + esc(dc.dataset.decline) + '">Decline and tell the guest</button></div>'; dc.after(f); f.querySelector('textarea').focus(); return; }
      const dcx = t.closest('[data-decline-cancel]'); if (dcx) { dcx.closest('.a-decl').remove(); return; }
      const dg = t.closest('[data-decline-go]'); if (dg) { const why = dg.closest('.a-decl').querySelector('textarea').value.trim(); BB.act.declineRequest(dg.dataset.declineGo, why); BB.toast('Declined. The guest has been told.'); return; }
      const pl = t.closest('[data-paylink]'); if (pl) { if (BB.BOOT && !BB.BOOT.stripe) { BB.toast('Connect Stripe in Connections first, so guests can pay you by card.'); return; } BB.act.sendPaymentLink(pl.dataset.paylink); BB.toast('Payment link sent', 'good'); }
    },
  };

  /* =====================================================================================
     INBOX
     ===================================================================================== */
  function sortedThreads() {
    return S().threads.slice().sort((a, b) => ((b.unread > 0) - (a.unread > 0)) || ((threadLast(b) || { at: '' }).at.localeCompare((threadLast(a) || { at: '' }).at)));
  }
  V.inbox = {
    label: 'Inbox', group: 'Run', icon: 'inbox', order: 40,
    badge: s => s.threads.filter(t => t.unread > 0).length || null,
    render(inst) {
      const s = S(), st = inst.st, u = inst.uid;
      const f = st.ib_f || 'all';
      let threads = sortedThreads(); const unread = threads.filter(t => t.unread > 0).length;
      if (f === 'unread') threads = threads.filter(t => t.unread > 0 || t.id === st.id);
      const cur = BB.q.thread(st.id) || threads[0] || null;
      const list = threads.map(t => {
        const g = BB.q.guest(t.guestId) || { name: 'Guest' }, last = threadLast(t), b = ctxBooking(t);
        return '<button class="a-th' + (cur && cur.id === t.id ? ' on' : '') + (t.unread ? ' unread' : '') + '" data-ibt="' + t.id + '">' + BB.avatar(g.name) + '<span class="a-th-b"><span class="a-th-top"><b>' + esc(g.name) + '</b><time class="num">' + (last ? esc(BB.ago(last.at)) : '') + '</time></span>' +
          '<span class="a-th-p">' + (last ? (last.from === 'host' ? 'You: ' : last.from === 'auto' ? 'Auto: ' : '') + esc(last.text) : 'No messages yet') + '</span>' +
          '<span class="a-th-m">' + (t.channel !== 'direct' ? BB.chan(t.channel) : '') + (b ? '<span>' + esc(P(b.propertyId).short) + ' · ' + D.fmt(b.checkIn) + '</span>' : '') + (t.unread ? '<i class="a-udot" aria-label="Unread"></i>' : '') + '</span></span></button>';
      }).join('');
      let conv = '<div class="a-empty">' + ic('inbox') + '<p>Pick a conversation.</p></div>';
      if (cur) {
        const g = BB.q.guest(cur.guestId) || { name: 'Guest' }, b = ctxBooking(cur), sug = BB.suggestReply(cur.id);
        let lastDay = '';
        const msgs = cur.messages.map(m => {
          const day = m.at.slice(0, 10); const sep = day !== lastDay ? '<p class="a-day">' + (day === s.today ? 'Today' : relDay(day)) + '</p>' : ''; lastDay = day;
          if (m.from === 'auto') return sep + '<div class="a-msg auto"><span class="a-auto-l">' + ic('bolt') + 'Automated message</span>' + esc(m.text) + '<time class="num">' + m.at.slice(11) + '</time></div>';
          return sep + '<div class="a-msg ' + m.from + '">' + esc(m.text) + '<time class="num">' + (m.from === 'host' ? 'You · ' : esc(fst(g.name)) + ' · ') + m.at.slice(11) + '</time></div>';
        }).join('');
        const via = cur.channel === 'direct' ? 'Sends by email and to the guest app' : 'Sends through ' + BB.CHANNEL[cur.channel] + ' messaging';
        conv = '<div class="a-conv-h"><button class="iconbtn a-ib-back" data-ibback aria-label="Back to conversations">' + ic('back') + '</button>' + BB.avatar(g.name) + '<div class="a-row-t"><b>' + esc(g.name) + '</b><span>' + (b ? '<span class="num">' + b.id + '</span> · ' + esc(P(b.propertyId).short) + ' · ' + BB.dates(b) + ' · ' + plural(b.adults + b.children, 'guest') : 'No booking yet') + '</span></div>' +
          '<div class="a-conv-hm">' + (b ? BB.statusPill(b) + '<button class="btn sm" data-a="nav" data-view="booking" data-id="' + b.id + '">Booking</button>' : '') + '</div></div>' +
          '<div class="a-msgs" id="amsgs-' + u + '">' + (msgs || '<div class="a-empty"><p>No messages yet. Say hello.</p></div>') + '</div>' +
          (sug ? '<div class="a-sug"><div class="a-sug-h">' + ic('spark') + '<b>Suggested reply</b><span class="muted">From your house rules and listing</span></div><p>' + esc(sug) + '</p><div class="a-acts"><button class="btn sm" data-ibins>Insert and edit</button><button class="btn primary sm" data-ibsug>' + ic('send') + 'Send as is</button></div></div>' : '') +
          '<form class="a-compose" data-ibform><textarea id="ibc-' + u + '" data-ibdraft rows="2" placeholder="Reply to ' + esc(fst(g.name)) + '…" aria-label="Reply">' + esc(st.ib_draft || '') + '</textarea><div class="a-compose-f"><span class="muted">' + ic(cur.channel === 'direct' ? 'mail' : 'sync') + via + '</span><button class="btn primary sm" type="submit"' + ((st.ib_draft || '').trim() ? '' : ' disabled') + '>' + ic('send') + 'Send</button></div></form>';
      }
      return vh('Inbox', unread ? plural(unread, 'conversation') + ' waiting for you · guest emails, texts and app messages in one list' : 'You are all caught up · guest emails, texts and app messages in one list', '') +
        '<div class="a-inbox' + (st.ib_open ? ' has-sel' : '') + '"><div class="a-ib-list"><div class="a-ib-lh"><div class="seg" role="group" aria-label="Filter"><button data-ibf="all" aria-pressed="' + (f === 'all') + '">All</button><button data-ibf="unread" aria-pressed="' + (f === 'unread') + '">Unread' + (unread ? ' · ' + unread : '') + '</button></div></div><div class="a-ib-scroll" id="ibl-' + u + '">' + (list || '<div class="a-empty"><p>No unread messages.</p></div>') + '</div></div>' +
        '<div class="a-conv">' + conv + '</div></div>';
    },
    click(ev, inst) {
      const t = ev.target, st = inst.st;
      const th = t.closest('[data-ibt]'); if (th) { st.ib_open = true; st.ib_draft = ''; inst._scrollMsgs = true; st.id = th.dataset.ibt; BB.act.markRead(th.dataset.ibt); inst.render(); return; }
      if (t.closest('[data-ibback]')) return inst.set({ ib_open: false });
      const fl = t.closest('[data-ibf]'); if (fl) return inst.set({ ib_f: fl.dataset.ibf });
      const cur = BB.q.thread(st.id) || sortedThreads()[0]; if (!cur) return;
      if (t.closest('[data-ibins]')) { st.ib_draft = BB.suggestReply(cur.id); inst._focus = '#ibc-' + inst.uid; return inst.render(); }
      if (t.closest('[data-ibsug]')) { send(inst, cur, BB.suggestReply(cur.id)); }
    },
    input(ev, inst) { if (ev.target.matches('[data-ibdraft]')) { const had = !!(inst.st.ib_draft || '').trim(); inst.st.ib_draft = ev.target.value; if (had !== !!ev.target.value.trim()) inst.render(); } },
    submit(ev, inst) { if (ev.target.matches('[data-ibform]')) { const cur = BB.q.thread(inst.st.id) || sortedThreads()[0]; if (cur) send(inst, cur, inst.st.ib_draft || ''); } },
    keydown(ev, inst) { if (ev.key === 'Enter' && (ev.metaKey || ev.ctrlKey) && ev.target.matches('[data-ibdraft]')) { ev.preventDefault(); const cur = BB.q.thread(inst.st.id) || sortedThreads()[0]; if (cur) send(inst, cur, inst.st.ib_draft || ''); } },
  };
  function send(inst, th, text) {
    if (!text.trim()) return;
    inst.st.id = th.id; inst.st.ib_draft = ''; inst._scrollMsgs = true;
    BB.act.sendMessage(th.id, 'host', text, 'Host console');
    const g = BB.q.guest(th.guestId) || { name: 'Guest' };
    BB.toast('Sent to ' + fst(g.name) + (th.channel !== 'direct' ? ' through ' + BB.CHANNEL[th.channel] : ''), 'good');
  }

  /* =====================================================================================
     CHECK-IN BOARD
     ===================================================================================== */
  V.checkin = {
    label: 'Guest check-in', group: 'Run', icon: 'key', order: 50,
    badge: () => needsCheckin().length || null,
    render(inst) {
      const s = S(), st = inst.st, t = s.today, end = D.add(t, 14);
      const list = s.bookings.filter(b => b.status === 'confirmed' && b.checkIn >= t && b.checkIn < end).sort(byIn);
      const f = st.ci_f || 'all';
      const shown = list.filter(b => f === 'all' || ciState(b) === f || (f === 'todo' && ciState(b) !== 'done'));
      const cnt = k => list.filter(b => ciState(b) === k).length;
      const cell = (ok, label, wait) => '<td><span class="a-st ' + (ok ? 'ok' : 'no') + '">' + ic(ok ? 'check' : 'clock') + '<span>' + (ok ? label : wait) + '</span></span></td>';
      const rows = shown.map(b => {
        const g = gOf(b), c = b.checkin, p = P(b.propertyId), stt = ciState(b), r = remindedAt(b.id), soon = D.diff(t, b.checkIn) <= 3;
        return '<tr><td><button class="a-who a-whob" data-a="nav" data-view="booking" data-id="' + b.id + '">' + BB.avatar(g.name, 'sm') + '<span><b>' + esc(g.name) + '</b><em>' + esc(p.short) + ' · ' + relDay(b.checkIn) + '</em></span></button></td>' +
          cell(c.id && c.selfie, 'Verified', c.id ? 'Selfie pending' : 'Waiting') + cell(c.agreement, 'Signed', 'Waiting') + cell(c.deposit, 'Held', 'Waiting') +
          '<td><span class="a-st ' + (c.arrival ? 'ok' : 'no') + '">' + ic('clock') + '<span>' + esc(c.arrival || 'Not set') + '</span></span></td>' +
          '<td>' + (stt === 'done' ? BB.pill('good', 'Ready') : stt === 'started' ? BB.pill(soon ? 'warn' : 'info', 'In progress') : BB.pill(soon ? 'bad' : 'muted', 'Not started')) + '</td>' +
          '<td class="r">' + (stt === 'done' ? '<span class="a-done">' + ic('lock') + 'Code ' + esc(b.code) + '</span>' : r ? '<span class="a-done">' + ic('check') + 'Reminded ' + r + '</span>' : '<button class="btn sm" data-remind="' + b.id + '">' + ic('sms') + 'Send reminder</button>') + '</td></tr>';
      }).join('');
      const auto = s.automations.find(a => a.id === 'a2');
      const ready = cnt('done');
      return vh('Guest check-in', 'Arrivals in the next 14 days · ID, agreement and deposit done before anyone reaches the door', '<button class="btn sm" data-a="go" data-surface="guest" data-opts="{}">' + ic('phone') + 'Preview as guest</button>') +
        '<div class="a-grid">' +
          '<div class="a-s3"><div class="a-kpi"><span>Arriving, next 14 days</span><b class="num">' + list.length + '</b><small>' + plural(list.filter(b => b.checkIn === t).length, 'arrival') + ' today</small></div></div>' +
          '<div class="a-s3"><div class="a-kpi"><span>Ready to arrive</span><b class="num">' + ready + '</b>' + (list.length ? '<div class="a-meter"><i style="width:' + Math.round(ready / list.length * 100) + '%"></i></div>' : '') + '<small>' + pct(list.length ? ready / list.length : 0) + ' fully checked in</small></div></div>' +
          '<div class="a-s3"><div class="a-kpi"><span>In progress</span><b class="num">' + cnt('started') + '</b><small>Started, steps still open</small></div></div>' +
          '<div class="a-s3"><div class="a-kpi"><span>Not started</span><b class="num">' + cnt('none') + '</b><small>' + plural(list.filter(b => ciState(b) === 'none' && D.diff(t, b.checkIn) <= 3).length, 'arrives', 'arrive') + ' within 3 days</small></div></div>' +
          '<div class="a-s12"><div class="a-filters"><div class="a-chips" role="group" aria-label="Filter">' + [['all', 'All arrivals'], ['todo', 'Needs action'], ['done', 'Ready']].map(([k, l]) => '<button class="chip" data-cif="' + k + '" aria-pressed="' + (f === k) + '">' + l + '</button>').join('') + '</div>' +
            '<button class="a-autonote" data-a="nav" data-view="automations">' + ic('flow') + (auto ? (auto.on ? 'Automatic reminder 3 days before arrival is on' : 'Automatic reminders are off. Turn them on') : 'Set up automatic reminders') + ic('chev') + '</button></div>' +
          '<div class="a-card a-flush"><div class="tblwrap" id="citbl-' + inst.uid + '"><table class="tbl a-tbl a-citbl"><thead><tr><th>Guest</th><th>' + (S().live ? 'ID photo' : 'ID and selfie') + '</th><th>Agreement</th><th>Deposit</th><th>Arrival</th><th>Overall</th><th class="r">Action</th></tr></thead><tbody>' +
          (rows || '<tr><td colspan="7"><div class="a-empty"><p>No arrivals match.</p></div></td></tr>') + '</tbody></table></div></div></div>' +
        '</div>';
    },
    click(ev, inst) {
      const t = ev.target;
      const f = t.closest('[data-cif]'); if (f) return inst.set({ ci_f: f.dataset.cif });
      const r = t.closest('[data-remind]'); if (r) { const b = BB.q.booking(r.dataset.remind); if (BB.act.remindCheckin(b.id)) BB.toast('Reminder sent to ' + fst(gOf(b).name) + (BB.q.connected('sms') ? ' by text' : ' by email'), 'good'); else BB.toast('Could not send. Text and email are disconnected.'); }
    },
  };

  /* =====================================================================================
     PAYMENTS
     ===================================================================================== */
  V.payments = {
    label: 'Payments', group: 'Run', icon: 'card', order: 60,
    render(inst) {
      const s = S(), st = inst.st, t = s.today, mon = t.slice(0, 7), yr = t.slice(0, 4);
      const stripe = BB.q.integration('stripe') || {}, on = BB.q.connected('stripe');
      const direct = s.bookings.filter(b => b.channel === 'direct').map(b => ({ b, date: D.add(b.createdAt, 2) })).sort((a, b) => b.date.localeCompare(a.date) || b.b.id.localeCompare(a.b.id));
      const live = direct.filter(x => x.b.status !== 'cancelled' && x.b.paid);
      const from30 = D.add(t, -30), paid30 = live.filter(x => x.date <= t && x.date > from30), paidMonth = paid30.reduce((a, x) => a + x.b.total, 0);
      const upcoming = live.filter(x => x.date > t);
      const upSum = upcoming.reduce((a, x) => a + x.b.total, 0), nextDate = upcoming.length ? upcoming.map(x => x.date).sort()[0] : null;
      const yearDirect = live.filter(x => x.b.checkIn >= yr + '-01-01');
      const saved = yearDirect.reduce((a, x) => a + Math.round(x.b.total * BB.PLATFORM_FEE.airbnb), 0);
      const platFees = s.bookings.filter(b => b.status !== 'cancelled' && b.channel !== 'direct' && b.checkIn >= yr + '-01-01').reduce((a, b) => a + b.platformFee, 0);
      const unpaid = s.bookings.filter(b => b.status === 'confirmed' && !b.paid);
      const lim = st.pay_lim || 12;
      const rows = direct.slice(0, lim).map(({ b, date }) => {
        const g = gOf(b), state = b.status === 'cancelled' ? BB.pill('bad', 'Refunded') : !b.paid ? BB.pill('warn', 'Unpaid') : date > t ? BB.pill('info', 'Scheduled') : date === t ? BB.pill('info', 'In transit') : BB.pill('good', 'Paid out');
        return '<tr data-open data-a="nav" data-view="booking" data-id="' + b.id + '"' + (b.status === 'cancelled' ? ' class="x"' : '') + '><td class="num nw">' + (b.paid || b.status === 'cancelled' ? D.fmt(date, { year: 'numeric' }) : '—') + '</td><td><div class="a-who">' + BB.avatar(g.name, 'sm') + '<span><b>' + esc(g.name) + '</b><em class="num">' + b.id + ' · ' + esc(P(b.propertyId).short) + '</em></span></div></td><td class="num nw">' + BB.dates(b) + '</td><td class="num r">' + BB.money(b.total) + '</td><td class="num r a-saved">+' + BB.money(Math.round(b.total * BB.PLATFORM_FEE.airbnb)) + '</td><td>' + state + '</td></tr>';
      }).join('');
      const deps = s.bookings.filter(b => b.status !== 'cancelled' && ['held', 'releasing', 'released'].includes(b.deposit)).sort((a, b) => ({ held: 0, releasing: 1, released: 2 }[a.deposit] - { held: 0, releasing: 1, released: 2 }[b.deposit]) || b.checkIn.localeCompare(a.checkIn)).slice(0, 8);
      const held = s.bookings.filter(b => b.status !== 'cancelled' && b.deposit === 'held').length;
      return vh('Payments', (S().live ? 'Guests pay you directly through Stripe, and Stripe pays out to your bank. No commission on any booking.' : 'Guests pay you directly. Payouts reach your bank 2 days after booking, with no platform fees'), '<button class="btn sm" data-a="nav" data-view="connections">' + ic('plug') + 'Payment settings</button>') +
        '<div class="a-stripe' + (on ? '' : ' off') + '"><span class="a-ico">' + ic('card') + '</span><div class="a-row-t"><b>Stripe ' + (on ? 'is connected' : 'is disconnected') + '</b><span>' + (on ? esc(stripe.detail || '') + ' · last sync ' + esc(BB.ago(stripe.lastSync || t + 'T00:00')) : (S().live && !stripe.lastSync ? 'Connect Stripe to take card payments. Until then your sites take booking requests.' : 'Guests cannot pay online and new direct bookings are paused. Reconnect to take payments again.')) + '</span></div>' + (on ? BB.pill('good', 'Live') : '<button class="btn sm primary" data-a="nav" data-view="connections">' + (S().live && !stripe.lastSync ? 'Connect Stripe' : 'Reconnect Stripe') + '</button>') + '</div>' +
        '<div class="a-grid">' +
          '<div class="a-s3"><div class="a-kpi"><span>Paid out, last 30 days</span><b class="num">' + BB.money(paidMonth) + '</b><small>' + plural(paid30.length, 'payout') + (S().live ? '' : ' to Barclays ••4410') + '</small></div></div>' +
          '<div class="a-s3"><div class="a-kpi"><span>On the way</span><b class="num">' + BB.money(upSum) + '</b><small>' + (nextDate ? 'Next payout ' + D.fmt(nextDate, { weekday: 'short' }) : 'Nothing scheduled') + '</small></div></div>' +
          '<div class="a-s3"><div class="a-kpi hi"><span>Fees you didn’t pay this year</span><b class="num">' + BB.money(saved) + '</b><small>vs Airbnb’s 15.5% host fee on the same stays</small></div></div>' +
          '<div class="a-s3"><div class="a-kpi"><span>Deposits held</span><b class="num">' + BB.money(held * DEP) + '</b><small>' + plural(held, 'hold') + ' of ' + BB.money(DEP) + ' on guest cards</small></div></div>' +
          (unpaid.length ? '<div class="a-s12">' + card('Waiting for payment', plural(unpaid.length, 'booking'), '<div class="a-list">' + unpaid.map(b => '<div class="a-row">' + BB.avatar(gOf(b).name) + '<span class="a-row-t"><b>' + esc(gOf(b).name) + ' · ' + BB.money(b.total) + '</b><span>' + b.id + ' · ' + esc(P(b.propertyId).short) + ' · arrives ' + relDay(b.checkIn, true) + '</span></span><span class="a-row-m"><button class="btn sm" data-a="nav" data-view="booking" data-id="' + b.id + '">Open</button><button class="btn sm primary" data-paid="' + b.id + '">Mark paid</button></span></div>').join('') + '</div>') + '</div>' : '') +
          '<div class="a-s8">' + card('Direct payouts', plural(direct.length, 'booking'), '<div class="tblwrap a-flushx" id="paytbl-' + inst.uid + '"><table class="tbl a-tbl"><thead><tr><th>Payout</th><th>Guest</th><th>Stay</th><th class="r">Amount</th><th class="r">Fee avoided</th><th>Status</th></tr></thead><tbody>' + (rows || '<tr><td colspan="6"><div class="a-empty"><p>No direct bookings yet.</p></div></td></tr>') + '</tbody></table></div>' +
            (direct.length > lim ? '<div class="a-more"><button class="btn sm" data-paymore>Show more</button><span class="muted">Showing ' + lim + ' of ' + direct.length + '</span></div>' : ''), 'a-flushb') + '</div>' +
          '<div class="a-s4"><div class="a-stack">' + card('Security deposits', BB.money(DEP) + ' per stay', deps.length ? '<div class="a-list">' + deps.map(b => '<button class="a-row" data-a="nav" data-view="booking" data-id="' + b.id + '">' + BB.avatar(gOf(b).name, 'sm') + '<span class="a-row-t"><b>' + esc(gOf(b).name) + '</b><span>' + esc(P(b.propertyId).short) + ' · ' + (b.deposit === 'held' ? 'releases ' + D.fmt(D.add(b.checkOut, 3)) : b.deposit === 'releasing' ? 'releasing now' : 'released' + (D.add(b.checkOut, 3) <= t ? ' ' + D.fmt(D.add(b.checkOut, 3)) : ' after checkout')) + '</span></span><span class="a-row-m">' + (b.deposit === 'held' ? BB.pill('good', 'Held') : b.deposit === 'releasing' ? BB.pill('info', 'Releasing') : BB.pill('muted', 'Released')) + '</span></button>').join('') + '</div>' : '<div class="a-empty"><p>No deposits yet.</p></div>') +
            card('Fees you didn’t pay', yr, (() => { const rev = yearDirect.reduce((a, x) => a + x.b.total, 0); return '<p class="a-note a-nt0">What the platforms would have taken from your ' + BB.money(rev) + ' of direct bookings this year.</p>' + [['airbnb', 'Airbnb', 'host fee 15.5%'], ['booking', 'Booking.com', 'commission 15%'], ['vrbo', 'Vrbo', 'fees about 8%']].map(([k, n, e]) => '<div class="a-trow"><span>' + n + '<em>' + e + '</em></span><b class="num a-saved">' + BB.money(Math.round(rev * BB.PLATFORM_FEE[k])) + '</b></div>').join('') + (platFees ? '<div class="a-trow"><span>Fees on add-on bookings<em>Stays synced from platforms</em></span><b class="num">' + BB.money(platFees) + '</b></div>' : ''); })()) +
          '</div></div>' +
        '</div>';
    },
    click(ev, inst) {
      if (ev.target.closest('[data-paymore]')) return inst.set({ pay_lim: (inst.st.pay_lim || 12) + 20 });
      const p = ev.target.closest('[data-paid]'); if (p) { BB.act.markPaid(p.dataset.paid); BB.toast('Payment recorded', 'good'); }
    },
  };

  /* =====================================================================================
     NOTIFICATIONS
     ===================================================================================== */
  V.notifications = {
    label: 'Notifications', group: 'Run', icon: 'bell', hidden: true,
    render(inst) {
      const s = S(), un = s.notifications.filter(n => !n.read).length;
      return vh('Notifications', un ? plural(un, 'unread notification') : 'Everything is read', un ? '<button class="btn sm" data-a="readall">' + ic('check') + 'Mark all read</button>' : '') +
        '<div class="a-card a-flush a-notifs">' + (s.notifications.length ? s.notifications.map(notifRow).join('') : '<div class="a-empty">' + ic('bell') + '<p>No notifications yet. New bookings, check-ins and guest messages show up here.</p></div>') + '</div>';
    },
  };
})();
