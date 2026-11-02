/* Bookingbooster prototype: host mobile app (iPhone and Android) for Dana Whitfield of Fell & Harbour Stays.
   A live phone with Today, Calendar, Inbox, Guests and Grow tabs, a booking sheet and notifications,
   a "Try this" panel that drives the demo, and a lock-screen phone that shows live notifications. */
(function () {
  const BB = window.BB, D = BB.D, esc = BB.esc;
  const S = () => BB.store.get();
  const first = n => String(n || '').split(' ')[0];
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const TABS = [['today', 'Today', 'home'], ['calendar', 'Calendar', 'cal'], ['inbox', 'Inbox', 'inbox'], ['guests', 'Guests', 'users'], ['grow', 'Grow', 'chart']];
  const TAB_LABEL = Object.fromEntries(TABS.map(t => [t[0], t[1]]));
  const CHANNELS = ['cm', 'airbnb', 'vrbo', 'booking']; // optional calendar sync links: dates booked there arrive as blocks

  /* ---------- small data helpers ---------- */
  const lastMsg = t => t.messages[t.messages.length - 1] || null;
  const threadsSorted = () => S().threads.slice().sort((a, b) => ((lastMsg(b) || {}).at || '').localeCompare((lastMsg(a) || {}).at || ''));
  const unreadThreads = () => S().threads.filter(t => t.unread > 0).length;
  const unreadNotifs = () => S().notifications.filter(n => !n.read).length;
  const clock12 = c => { const [h, m] = c.split(':').map(Number); return ((h + 11) % 12 + 1) + ':' + String(m).padStart(2, '0'); };
  const span = (a, z) => D.month(a) === D.month(z) ? Number(a.slice(8)) + '–' + D.fmt(z) : D.fmt(a) + '–' + D.fmt(z); // "18–19 Nov", "30 Nov–2 Dec"
  const nightRange = (a, n) => n <= 1 ? D.fmt(a) : span(a, D.add(a, n - 1));
  const stayRange = b => span(b.checkIn, b.checkOut);
  const dayLabel = d => { const t = S().today; if (d === t) return 'Today'; if (d === D.add(t, 1)) return 'Tomorrow'; return D.fmt(d, { weekday: 'short' }); };
  const plural = (n, w, p) => n + ' ' + (n === 1 ? w : (p || w + 's'));
  const partyText = b => { const parts = [plural(b.adults, 'adult')]; if (b.children) parts.push(plural(b.children, 'child', 'children')); if (b.pets) parts.push(plural(b.pets, 'dog')); return parts.join(', '); };

  // How the guest found you, grouped for colours: search and AI, your own site, returning guests, add-on calendars
  const SRC_GROUP = { google: 'search', ai: 'search', website: 'site', referral: 'site', console: 'site', mobile: 'site', email: 'back', campaign: 'back', 'guest-app': 'back', sync: 'addon' };
  const GROUP_LABEL = { search: 'Google and AI', site: 'Your site', back: 'Email and offers', addon: 'Add-on calendar' };
  const srcGroup = b => b.channel !== 'direct' ? 'addon' : (SRC_GROUP[b.source] || 'site');
  const srcChip = b => '<span class="m-src g-' + srcGroup(b) + '"><i></i>' + esc(BB.sourceLabel(b)) + '</span>';
  const addonsOn = () => CHANNELS.some(id => BB.q.connected(id));
  // The stay a conversation is about: its own booking, or the guest's next stay when the thread has none.
  function threadBooking(t) {
    const b = t.bookingId && BB.q.booking(t.bookingId);
    if (b && b.status === 'confirmed') return b;
    const up = BB.q.guestBookings(t.guestId).filter(x => x.status === 'confirmed').sort((x, y) => x.checkIn.localeCompare(y.checkIn))[0];
    return up || b || null;
  }
  const suggest = tid => BB.suggestReply(tid);

  // Free runs of 1 to 3 nights with booked or blocked nights on both sides, starting today or later.
  function gaps(pid, days) {
    const bl = BB.q.blocked(pid), t = S().today, out = []; let run = null;
    for (let i = 0; i < (days || 45); i++) {
      const d = D.add(t, i);
      if (!bl.has(d)) { if (!run) run = { pid, a: d, n: 0, before: bl.has(D.add(d, -1)) }; run.n++; }
      else if (run) { if (run.before && run.n <= 3) out.push(run); run = null; }
    }
    return out;
  }
  const allGaps = days => S().properties.flatMap(p => gaps(p.id, days)).sort((x, y) => x.a.localeCompare(y.a));
  const gapPick = () => { const g = allGaps(30); return g.find(x => x.pid === 'laurel') || g[0] || null; };

  // How many guests a campaign to this segment reaches (same rule the store uses when sending).
  function recips(seg, segs) {
    const real = ((segs || BB.q.segments())[seg] || { guests: [] }).guests.length;
    if (!real) return 0;
    return seg === 'past' ? Math.max(real, 412) : seg === 'repeat' ? Math.max(real, 212) : real;
  }
  const SEG_ORDER = ['repeat', 'recent', 'past', 'pets', 'lapsed'];
  const SEG_SHORT = { past: 'All past guests', repeat: 'Repeat guests', pets: 'Pet owners', recent: 'Last 12 months', lapsed: 'Lapsed 6+ months' };
  const TPL = [['gap', 'Gap nights'], ['comeback', 'Come-back offer'], ['holiday', 'Holiday dates'], ['pets', 'Bring the dog']];

  /* AI-written campaign copy from the calendar and listing facts. v picks a rewrite. */
  function writeCopy(tpl, v, pidHint) {
    v = (v || 0) % 2;
    if (tpl === 'gap') {
      const g = gapPick(); const p = BB.q.property(g ? g.pid : 'laurel'); const n = g ? g.n : 2;
      const when = g ? nightRange(g.a, g.n) : 'Two nights';
      const word = ['One quiet night', 'Two quiet nights', 'Three quiet nights'][Math.min(n, 3) - 1];
      const heads = [when + ' just opened up', 'A short break at ' + p.short + ', ' + when];
      const texts = [word + ' at ' + p.short + ', 15% off for past guests. Use code GAP15 at checkout.', 'Plans changed, so ' + when + ' is free at ' + p.name + '. Past guests save 15% with code GAP15.'];
      return { tpl, name: 'Fill the gap nights', subject: heads[v], heading: heads[v], text: texts[v], cta: 'Grab the dates', propertyId: p.id, promo: 'GAP15', pct: 15, sms: 'Fell & Harbour Stays: ' + when + ' just opened at ' + p.short + '. 15% off with code GAP15. ' + p.domain };
    }
    if (tpl === 'holiday') {
      const p = BB.q.property('lakeside') || S().properties[0];
      const heads = ['Christmas by the harbour', 'December at ' + p.short + ' is filling up'];
      const texts = ['Watch the boats come in from the window seat, then walk down to the harbour for mince pies. Past guests save 10% on December stays with code HARBOUR10.', 'A few December nights are still free at ' + p.name + '. Past guests get first pick and save 10% with code HARBOUR10.'];
      return { tpl, name: 'Christmas by the harbour', subject: heads[v], heading: heads[v], text: texts[v], cta: 'See December dates', propertyId: p.id, promo: 'HARBOUR10', pct: 10, sms: 'Fell & Harbour Stays: December nights at ' + p.short + ' are open to past guests first. 10% off with HARBOUR10. ' + p.domain };
    }
    if (tpl === 'pets') {
      const p = BB.q.property('laurel') || S().properties[0];
      const heads = ['Bring the dog to ' + p.short, 'Your dog is welcome back'];
      const texts = ['A fully fenced garden, fell walks from the front door and a towel and bowl by the wood burner. Save 10% on your next stay with code DOGS10.', 'Dogs stay at ' + p.short + ' for a flat ' + BB.money(p.petFee) + '. Book direct this winter and save 10% with code DOGS10.'];
      return { tpl, name: 'Bring the dog', subject: heads[v], heading: heads[v], text: texts[v], cta: 'Book a dog-friendly stay', propertyId: p.id, promo: 'DOGS10', pct: 10, sms: 'Fell & Harbour Stays: dogs are welcome at ' + p.short + '. 10% off your next stay with DOGS10. ' + p.domain };
    }
    const p = BB.q.property(pidHint) || BB.q.property('laurel') || S().properties[0];
    const heads = ['We saved you a spot at ' + p.short, 'Come back to ' + p.short + ' this winter'];
    const texts = ['Thanks for staying with us. Book your next stay on our own site and keep 10% with code BACK10. Same hosts, no booking fees.', 'Winter is the quiet season at ' + p.short + '. Past guests save 10% on any stay with code BACK10 when they book with us.'];
    return { tpl: 'comeback', name: 'Come back to ' + p.short, subject: heads[v], heading: heads[v], text: texts[v], cta: 'Pick your dates', propertyId: p.id, promo: 'BACK10', pct: 10, sms: 'Fell & Harbour Stays: come back to ' + p.short + ' and save 10% with code BACK10. ' + p.domain };
  }

  /* ---------- shared fragments ---------- */
  const ic = BB.icon;
  function bell(inst, onInk) {
    const n = unreadNotifs();
    return '<div class="m-top-r"><button class="m-bell' + (onInk ? ' ink' : '') + '" data-m="notifs" aria-label="Notifications' + (n ? ', ' + n + ' unread' : '') + '">' + ic('bell') + (n ? '<i class="num">' + Math.min(n, 99) + '</i>' : '') + '</button>' + (S().live ? '<span class="m-me" aria-label="' + esc(S().account.owner || '') + '">' + esc(String(S().account.owner || '').split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase()) + '</span>' : '<span class="m-me" aria-label="Dana Whitfield">DW</span>') + '</div>';
  }
  function topBar(inst, title, sub) {
    return '<header class="m-top"><div><h2 class="disp">' + esc(title) + '</h2>' + (sub ? '<p>' + esc(sub) + '</p>' : '') + '</div>' + bell(inst) + '</header>';
  }
  function navBar(inst, title, sub, right) {
    const st = inst.st; const prev = st.stack.length > 1 ? screenTitle(st.stack[st.stack.length - 2]) : TAB_LABEL[st.tab];
    return '<header class="m-nav"><button class="m-back" data-m="back" aria-label="Back to ' + esc(prev) + '">' + ic('chev', 'flip') + '<span>' + esc(prev) + '</span></button>' +
      '<div class="m-nav-t"><b>' + esc(title) + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</div><div class="m-nav-r">' + (right || '') + '</div></header>';
  }
  function screenTitle(scr) {
    if (scr.k === 'thread') { const t = BB.q.thread(scr.id); return t ? first(BB.q.guest(t.guestId).name) : 'Message'; }
    if (scr.k === 'guest') { const g = BB.q.guest(scr.id); return g ? first(g.name) : 'Guest'; }
    if (scr.k === 'campaign') return 'Campaign';
    if (scr.k === 'compose') return 'Campaign';
    if (scr.k === 'notifs') return 'Alerts';
    return 'Back';
  }
  const sec = (title, right) => '<div class="m-sec"><span>' + title + '</span>' + (right || '') + '</div>';

  function arrPill(b) {
    const c = b.checkin;
    if (c.done) return BB.pill('good', 'Checked in');
    if (c.id && c.selfie && c.agreement && !c.deposit) return BB.pill('warn', 'Deposit due');
    return BB.pill('warn', BB.checkinSteps(b) + ' of 3 done');
  }
  function bookingRow(b, meta, pill) {
    const g = BB.q.guest(b.guestId), p = BB.q.property(b.propertyId);
    return '<button class="m-row" data-m="sheet" data-id="' + esc(b.id) + '">' + BB.avatar(g.name) +
      '<span class="m-row-t"><b>' + esc(g.name) + '</b><span>' + esc(p.short) + ' · ' + esc(meta) + '</span></span>' +
      '<span class="m-row-r">' + (pill || BB.statusPill(b)) + BB.stepDots(b) + '</span></button>';
  }

  /* ---------- Today ---------- */
  function needs() {
    const s = S(), t = s.today, out = [];
    s.threads.filter(x => x.unread > 0).forEach(x => {
      const g = BB.q.guest(x.guestId); const m = [...x.messages].reverse().find(y => y.from === 'guest');
      const pets = m && /dog|pet|cat/i.test(m.text);
      out.push({ tone: 'warn', icon: 'inbox', title: pets ? first(g.name) + ' asked about pets' : first(g.name) + ' sent a message', sub: suggest(x.id) ? 'Suggested reply ready' : (m ? m.text : ''), m: 'thread', id: x.id });
    });
    s.bookings.filter(b => b.status === 'request').sort((a, b) => a.checkIn.localeCompare(b.checkIn)).forEach(b => out.push({ tone: 'warn', icon: 'cal', title: first(BB.q.guest(b.guestId).name) + ' asked to book', sub: BB.q.property(b.propertyId).short + ' · ' + stayRange(b) + ' · ' + BB.money(b.total) + ' · accept or decline', m: 'sheet', id: b.id }));
    const soon = s.bookings.filter(b => b.status === 'confirmed' && b.checkIn >= t && b.checkIn <= D.add(t, 7) && !b.checkin.done).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    soon.forEach(b => {
      const g = BB.q.guest(b.guestId), p = BB.q.property(b.propertyId), c = b.checkin;
      if (c.id && c.selfie && c.agreement && !c.deposit) out.push({ tone: 'bad', icon: 'card', title: g.name + ': deposit pending', sub: 'The ' + BB.money(200) + ' hold is the last step · ' + p.short + ' · ' + dayLabel(b.checkIn), m: 'sheet', id: b.id });
      else out.push({ tone: 'info', icon: 'key', title: first(g.name) + ' has not finished check-in', sub: BB.checkinSteps(b) + ' of 3 steps · ' + p.short + ' · ' + dayLabel(b.checkIn), m: 'sheet', id: b.id });
    });
    const gp = gapPick();
    if (gp) out.push({ tone: 'good', icon: 'spark', title: plural(gp.n, 'gap night') + ' at ' + BB.q.property(gp.pid).short + ', ' + nightRange(gp.a, gp.n), sub: 'Offer them to ' + recips('repeat') + ' repeat guests', m: 'gapoffer', id: '' });
    return out;
  }
  function today(inst) {
    const s = S(), m = BB.metrics(), mon = D.month(s.today), bm = m.byMonth[mon] || { direct: 0, platforms: 0, returning: 0 };
    const rev = Math.round(bm.direct + bm.platforms), ret = Math.round((m.returningShare || 0) * 100);
    const arr = BB.q.arrivals(), dep = BB.q.departures(), stay = BB.q.inHouse().filter(b => b.checkIn < s.today);
    const next = BB.q.upcoming().filter(b => b.checkIn > s.today && b.checkIn <= D.add(s.today, 7));
    const nd = needs();
    const chans = CHANNELS.map(id => BB.q.integration(id)).filter(i => i && i.connected);
    const last = chans.map(i => i.lastSync || '').sort().pop();
    const head = '<header class="m-hero"><div class="m-hero-r"><div><h2 class="disp">Today</h2><p>' + esc(D.fmt(s.today, { weekday: 'long', month: 'long' })) + '</p></div>' + bell(inst, true) + '</div>' +
      '<div class="m-kpis"><div><small>' + esc(BB.monthName(mon).split(' ')[0]) + ' revenue</small><b class="disp num">' + BB.money(rev) + '</b></div>' +
      '<div><small>Returning guests</small><b class="disp num">' + ret + '%</b><span class="m-bar" aria-hidden="true"><i style="width:' + ret + '%"></i></span></div></div></header>';
    // your own booking sites: visitors and booking starts today, and where bookings come from
    const madeToday = s.bookings.filter(b => b.createdAt === s.today && b.channel === 'direct' && b.status !== 'cancelled' && b.status !== 'request').length;
    const counts = {}; s.bookings.filter(b => b.channel === 'direct' && b.createdAt > D.add(s.today, -30)).forEach(b => { counts[b.source] = (counts[b.source] || 0) + 1; });
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const sites = '<div class="m-sites"><div class="m-sites-h"><b>Your sites today</b><button class="m-link" data-m="console" data-id="website">Details' + ic('chev') + '</button></div>' +
      (s.live ? '<div class="m-sites-g"><div><b class="disp num">' + Object.values(s.website.visitors || {}).reduce((a, b) => a + b, 0) + '</b><span>visitors, 30 days</span></div><div><b class="disp num">' + s.bookings.filter(b => b.channel === 'direct' && b.status !== 'cancelled' && b.status !== 'request' && (b.createdAt || '') > D.add(s.today, -30)).length + '</b><span>direct, 30 days</span></div><div><b class="disp num">' + madeToday + '</b><span>booked today</span></div></div>' :
      '<div class="m-sites-g"><div><b class="disp num">' + (214 + 23 * madeToday) + '</b><span>visitors</span></div><div><b class="disp num">' + (9 + 2 * madeToday) + '</b><span>booking starts</span></div><div><b class="disp num">' + madeToday + '</b><span>booked today</span></div></div>') +
      '<p>' + ic('spark') + '<span>' + Math.round((s.live ? s.website.fromSearch || 0 : s.website.fromSearch || 0.6) * 100) + '% found you on Google or in AI answers' + (top ? ' · top source this month: ' + esc((BB.SOURCE[top] || top).toLowerCase()) : '') + '</span></p></div>';
    const syncing = inst.st.syncing;
    const body = (chans.length ? '<div class="m-pull" aria-hidden="true"><span class="m-spin' + (syncing ? ' on' : '') + '">' + ic('sync') + '</span><em>' + (syncing ? 'Checking calendars' : 'Pull to check synced calendars') + '</em></div>' : '') + sites +
      (chans.length ? '<div class="m-sync"><span class="m-ico">' + ic('sync') + '</span><span class="m-row-t"><b>Calendar sync</b><span>' + (syncing ? 'Checking ' + chans.map(i => BB.CHANNEL[i.id]).join(', ') + '…' : chans.map(i => BB.CHANNEL[i.id]).join(', ') + (last ? ' · checked ' + esc(BB.ago(last)) : '')) + '</span></span>' +
      '<button class="btn sm" data-m="sync"' + (syncing ? ' disabled' : '') + '>' + (syncing ? 'Checking' : 'Check') + '</button></div>' : '') +
      sec('Needs you', nd.length ? '<em class="m-count">' + nd.length + '</em>' : '') +
      (nd.length ? '<div class="m-list">' + nd.slice(0, 6).map(x => '<button class="m-row" data-m="' + x.m + '" data-id="' + esc(x.id) + '"><span class="m-ico t-' + x.tone + '">' + ic(x.icon) + '</span><span class="m-row-t"><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></span>' + ic('chev', 'm-chev') + '</button>').join('') + '</div>'
        : '<p class="m-empty">You are all caught up.</p>') +
      '<div id="mArr-' + inst.uid + '" class="m-anchor' + (inst.st.flash === 'arrivals' ? ' flash' : '') + '">' + sec('Arriving today', '<em class="m-count">' + arr.length + '</em>') +
      (arr.length ? '<div class="m-list">' + arr.map(b => bookingRow(b, b.checkin.arrival || BB.q.property(b.propertyId).checkinTime, arrPill(b))).join('') + '</div>' : '<p class="m-empty">No arrivals today.</p>') + '</div>' +
      sec('Leaving today', '<em class="m-count">' + dep.length + '</em>') +
      (dep.length ? '<div class="m-list">' + dep.map(b => bookingRow(b, 'out by ' + BB.q.property(b.propertyId).checkoutTime)).join('') + '</div>' : '<p class="m-empty">No checkouts today.</p>') +
      (stay.length ? sec('Staying now', '<em class="m-count">' + stay.length + '</em>') + '<div class="m-list">' + stay.map(b => bookingRow(b, 'until ' + D.fmt(b.checkOut))).join('') + '</div>' : '') +
      (next.length ? sec('Next 7 days') + '<div class="m-list">' + next.map(b => bookingRow(b, dayLabel(b.checkIn) === 'Tomorrow' ? 'Tomorrow, ' + D.fmt(b.checkIn) : dayLabel(b.checkIn), b.checkin.done ? null : arrPill(b))).join('') + '</div>' : '');
    return { key: 'today', head, body, pull: chans.length > 0, ink: true };
  }

  /* ---------- Calendar ---------- */
  function calendar(inst) {
    const s = S(), st = inst.st, pid = st.pid, month = st.month, p = BB.q.property(pid) || s.properties[0];
    const firstDay = month + '-01', startDow = (D.dow(firstDay) + 6) % 7;
    const days = []; for (let d = firstDay; D.month(d) === month; d = D.add(d, 1)) days.push(d);
    const gapSet = new Set(); gaps(p.id, 75).forEach(g => { for (let i = 0; i < g.n; i++) gapSet.add(D.add(g.a, i)); });
    const sel = st.sel && st.sel.pid === p.id ? st.sel : null;
    let booked = 0, direct = 0, rev = 0; const m = BB.metrics(); const used = new Set();
    let grid = '<div class="m-cal" role="grid" aria-label="' + esc(BB.monthName(month)) + '">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => '<span class="h">' + x + '</span>').join('');
    for (let i = 0; i < startDow; i++) grid += '<span></span>';
    days.forEach(d => {
      const own = BB.q.nightOwner(p.id, d); const blk = !own && s.blocks.find(k => k.propertyId === p.id && k.from <= d && k.to > d);
      const past = d < s.today, inSel = sel && d >= sel.a && d <= sel.b;
      if (own) { booked++; used.add(srcGroup(own)); if (m.isReturning(own)) direct++; rev += own.total / D.diff(own.checkIn, own.checkOut); }
      const start = own && own.checkIn === d, end = own && D.add(d, 1) === own.checkOut;
      const cls = [own ? 'bk g-' + srcGroup(own) : '', blk ? 'blk' + (blk.sync ? ' syn' : '') : '', gapSet.has(d) && !past ? 'gap' : '', past ? 'past' : '', d === s.today ? 'today' : '', inSel ? 'sel' : '', start ? 's' : '', end ? 'e' : ''].join(' ');
      const label = D.fmt(d, { weekday: 'long', month: 'long' }) + (own ? ', ' + BB.q.guest(own.guestId).name + ', ' + BB.sourceLabel(own) : blk ? (blk.sync ? ', ' + blk.note : ', blocked: ' + blk.note) : gapSet.has(d) ? ', gap night' : ', free');
      grid += '<button type="button" class="' + cls + '" data-m="cday" data-id="' + d + '"' + (past && !own ? ' disabled' : '') + ' aria-label="' + esc(label) + '"' + (inSel ? ' aria-pressed="true"' : '') + '>' + Number(d.slice(8)) + '</button>';
    });
    grid += '</div>';
    const occ = Math.round(100 * booked / days.length);
    const list = s.bookings.filter(b => b.propertyId === p.id && b.status !== 'cancelled' && b.checkOut > firstDay && b.checkIn <= days[days.length - 1]).sort((a, b) => a.checkIn.localeCompare(b.checkIn));
    const blocks = s.blocks.filter(k => k.propertyId === p.id && k.to > firstDay && k.from <= days[days.length - 1]);
    const head = topBar(inst, 'Calendar', 'Every home, one calendar');
    const body = '<div class="m-chips m-scrollx" id="mPids-' + inst.uid + '">' + s.properties.map(x => '<button class="chip" data-m="cpid" data-id="' + esc(x.id) + '" aria-pressed="' + (x.id === p.id) + '">' + esc(x.short) + '</button>').join('') + '</div>' +
      '<div class="m-calh"><h3 class="disp">' + esc(BB.monthName(month)) + '</h3><div><button class="m-icb" data-m="cmon" data-id="-1" aria-label="Previous month"' + (month <= D.month(s.today) ? ' disabled' : '') + '>' + ic('chev', 'flip') + '</button><button class="m-icb" data-m="cmon" data-id="1" aria-label="Next month">' + ic('chev') + '</button></div></div>' +
      grid +
      '<div class="m-legend">' + ['search', 'site', 'back', 'addon'].filter(k => k !== 'addon' || used.has('addon')).map(k => '<span><i class="g-' + k + '"></i>' + GROUP_LABEL[k] + '</span>').join('') + (addonsOn() || blocks.some(k => k.sync) ? '<span><i class="blk syn"></i>Booked elsewhere</span>' : '') + '<span><i class="blk"></i>Blocked</span><span><i class="gap"></i>Gap</span></div>' +
      '<div class="m-stat3"><div><b class="disp num">' + occ + '%</b><span>occupied</span></div><div><b class="disp num">' + (booked ? Math.round(100 * direct / booked) : 0) + '%</b><span>returning nights</span></div><div><b class="disp num">' + BB.money(Math.round(rev)) + '</b><span>booked</span></div></div>' +
      (sel ? '' : '<p class="m-hint">' + ic('lock') + 'Tap free nights to block them for yourself or for maintenance.</p>') +
      sec('Stays in ' + esc(BB.monthName(month).split(' ')[0])) +
      (list.length ? '<div class="m-list">' + list.map(b => bookingRow(b, stayRange(b))).join('') + '</div>' : '<p class="m-empty">No stays this month yet.</p>') +
      (blocks.length ? sec('Blocked') + '<div class="m-list">' + blocks.map(k => '<div class="m-row static"><span class="m-ico">' + ic(k.sync ? 'cal' : 'lock') + '</span><span class="m-row-t"><b>' + esc(k.note) + '</b><span>' + esc(nightRange(k.from, D.diff(k.from, k.to))) + ' · ' + plural(D.diff(k.from, k.to), 'night') + (k.sync ? ' · calendar sync' : '') + '</span></span>' + (k.sync ? '' : '<button class="btn sm" data-m="unblock" data-id="' + esc(k.from) + '">Unblock</button>') + '</div>').join('') + '</div>' : '');
    let foot = '';
    if (sel) {
      const n = D.diff(sel.a, sel.b) + 1;
      foot = '<div class="m-foot m-selbar"><div class="m-selh"><b>' + esc(nightRange(sel.a, n)) + '</b><span>' + plural(n, 'night') + ' at ' + esc(p.short) + (sel.open ? ' · tap another night to extend' : '') + '</span></div>' +
        '<div class="m-chips m-scrollx" id="mNotes-' + inst.uid + '">' + ['Owner stay', 'Maintenance', 'Cleaning', 'Personal'].map(x => '<button class="chip" data-m="cnote" data-id="' + x + '" aria-pressed="' + (st.note === x) + '">' + x + '</button>').join('') + '</div>' +
        '<div class="m-btns"><button class="btn" data-m="cclear">Clear</button><button class="btn primary" data-m="cblock">' + ic('lock') + 'Block ' + plural(n, 'night') + '</button></div></div>';
    }
    return { key: 'cal-' + p.id + '-' + month, head, body, foot };
  }

  /* ---------- Inbox ---------- */
  function inbox(inst) {
    const f = inst.st.ifilter || 'all';
    const list = threadsSorted().filter(t => t.messages.length && (f === 'all' || t.unread > 0));
    const head = topBar(inst, 'Inbox', 'Guest app, email and text in one place');
    const body = '<div class="seg m-seg" role="group" aria-label="Filter messages"><button data-m="ifilter" data-id="all" aria-pressed="' + (f === 'all') + '">All</button><button data-m="ifilter" data-id="unread" aria-pressed="' + (f === 'unread') + '">Unread' + (unreadThreads() ? ' · ' + unreadThreads() : '') + '</button></div>' +
      (list.length ? '<div class="m-list">' + list.map(t => {
        const g = BB.q.guest(t.guestId), m = lastMsg(t), b = threadBooking(t);
        const who = m.from === 'host' ? 'You: ' : m.from === 'auto' ? 'Automated: ' : '';
        return '<button class="m-row m-thr' + (t.unread ? ' unread' : '') + '" data-m="thread" data-id="' + esc(t.id) + '">' + BB.avatar(g.name) +
          '<span class="m-row-t"><span class="m-thr-top"><b>' + esc(g.name) + '</b><time class="num">' + esc(BB.ago(m.at)) + '</time></span>' +
          '<span class="m-thr-mid">' + (t.channel !== 'direct' ? BB.chan(t.channel) : '') + (b ? '<span>' + esc(BB.q.property(b.propertyId).short) + ' · ' + esc(stayRange(b)) + '</span>' : '') + '</span>' +
          '<span class="m-snip">' + esc(who + m.text) + '</span></span>' + (t.unread ? '<i class="m-dot" aria-label="Unread"></i>' : '') + '</button>';
      }).join('') + '</div>' : '<p class="m-empty">' + (f === 'unread' ? 'No unread messages.' : 'No conversations yet.') + '</p>');
    return { key: 'inbox', head, body };
  }
  function thread(inst, scr) {
    const t = BB.q.thread(scr.id); if (!t) return null;
    const g = BB.q.guest(t.guestId), b = threadBooking(t), p = b ? BB.q.property(b.propertyId) : null;
    const sub = (t.channel !== 'direct' ? BB.chan(t.channel) + ' · ' : '') + (b ? esc(p.short) + ' · ' + esc(stayRange(b)) : 'No stay booked yet');
    const right = b ? '<button class="m-icb" data-m="sheet" data-id="' + esc(b.id) + '" aria-label="Open booking ' + esc(b.id) + '">' + ic('cal') + '</button>' : '';
    let lastDay = '';
    const msgs = t.messages.map(m => {
      const day = m.at.slice(0, 10); const sep = day !== lastDay ? '<div class="m-day">' + esc(day === S().today ? 'Today' : D.fmt(day, { weekday: 'short' })) + '</div>' : ''; lastDay = day;
      if (m.from === 'auto') return sep + '<div class="m-auto">' + ic('bolt') + '<span><b>Automated</b> ' + esc(m.text) + '</span></div>';
      return sep + '<div class="m-bub ' + (m.from === 'host' ? 'me' : '') + '"><p>' + esc(m.text) + '</p><time class="num">' + esc(m.at.slice(11)) + '</time></div>';
    }).join('');
    const lastIsGuest = (lastMsg(t) || {}).from === 'guest';
    const sug = lastIsGuest ? suggest(t.id) : '';
    const draft = inst.st.drafts[t.id] || '';
    const chips = p ? [p.wifi && p.wifi.ssid ? ['Wi-Fi details', 'The Wi-Fi is ' + p.wifi.ssid + ' and the password is ' + p.wifi.pw + '.'] : null, p.parking ? ['Parking', 'Parking: ' + p.parking + '.'] : null, ['Check-in time', 'Check-in is from ' + p.checkinTime + ' and checkout is by ' + p.checkoutTime + '.'], p.rules && p.rules[0] ? ['House rules', p.rules[0]] : null].filter(Boolean) : [];
    const body = '<div class="m-msgs">' + (msgs || '<p class="m-empty">Say hello to ' + esc(first(g.name)) + '.</p>') + '</div>' +
      (sug ? '<div class="m-sug"><span class="m-sug-h">' + ic('spark') + 'Suggested reply</span><p>' + esc(sug) + '</p><div class="m-btns"><button class="btn sm primary" data-m="use" data-id="' + esc(t.id) + '">Use</button><button class="btn sm ghost" data-m="usesend" data-id="' + esc(t.id) + '">' + ic('send') + 'Send as is</button></div></div>' : '');
    const foot = '<div class="m-foot m-compose">' + (chips.length ? '<div class="m-chips m-scrollx" id="mQr-' + inst.uid + '">' + chips.map((c, i) => '<button class="chip" data-m="qr" data-id="' + esc(t.id) + '" data-i="' + i + '">' + esc(c[0]) + '</button>').join('') + '</div>' : '') +
      '<form class="m-composer" data-mf="send" data-id="' + esc(t.id) + '"><label class="sr" for="mDraft-' + inst.uid + '">Message ' + esc(first(g.name)) + '</label><input id="mDraft-' + inst.uid + '" data-mi="draft" data-id="' + esc(t.id) + '" autocomplete="off" placeholder="Message ' + esc(first(g.name)) + '" value="' + esc(draft) + '"><button class="m-send" aria-label="Send"' + (draft.trim() ? '' : ' disabled') + '>' + ic('send') + '</button></form>' +
      '<p class="m-via">' + (t.channel === 'direct' ? 'Sends to the guest app and by email' : 'Sends through ' + BB.CHANNEL[t.channel]) + '</p></div>';
    inst._chips = chips;
    return { key: 'thread-' + t.id, head: navBar(inst, g.name, sub, right), body, foot, tabbar: false };
  }

  /* ---------- Guests ---------- */
  function guests(inst) {
    const s = S(), q = (inst.st.q || '').trim().toLowerCase(), f = inst.st.gfilter || 'all';
    const rows = s.guests.map(g => ({ g, stays: BB.q.stays(g.id), ltv: BB.q.lifetime(g.id) })).filter(x => x.stays.length)
      .filter(x => !q || (x.g.name + ' ' + x.g.city + ' ' + x.g.email + ' ' + x.g.tags.join(' ')).toLowerCase().includes(q))
      .filter(x => f === 'all' || (f === 'repeat' ? x.stays.length >= 2 : f === 'pets' ? (x.g.tags.includes('Pet owner') || x.stays.some(b => b.pets)) : x.g.subscribed))
      .sort((a, b) => b.ltv - a.ltv);
    const head = topBar(inst, 'Guests', 'Your guests, your list');
    const body = '<label class="m-search">' + ic('search') + '<span class="sr">Search guests</span><input id="mQ-' + inst.uid + '" data-mi="q" type="search" placeholder="Search name, city or tag" value="' + esc(inst.st.q || '') + '" autocomplete="off"></label>' +
      '<div class="m-chips m-scrollx" id="mGf-' + inst.uid + '">' + [['all', 'All'], ['repeat', 'Repeat'], ['pets', 'Pet owners'], ['subs', 'On the list']].map(([k, t]) => '<button class="chip" data-m="gfilter" data-id="' + k + '" aria-pressed="' + (f === k) + '">' + t + '</button>').join('') + '</div>' +
      sec(plural(rows.length, 'guest')) +
      (rows.length ? '<div class="m-list">' + rows.map(({ g, stays, ltv }) => '<button class="m-row" data-m="guest" data-id="' + esc(g.id) + '">' + BB.avatar(g.name) +
        '<span class="m-row-t"><b>' + esc(g.name) + '</b><span>' + plural(stays.length, 'stay') + (g.city ? ' · ' + esc(g.city) : '') + '</span></span>' +
        '<span class="m-row-r col"><b class="num">' + BB.money(ltv) + '</b>' + (g.tags[0] ? '<em>' + esc(g.tags[0]) + '</em>' : '') + '</span></button>').join('') + '</div>' : '<p class="m-empty">No guests match “' + esc(inst.st.q) + '”.</p>');
    return { key: 'guests', head, body };
  }
  function segFor(g) {
    const stays = BB.q.stays(g.id);
    if (g.tags.includes('Pet owner') || stays.some(b => b.pets)) return 'pets';
    if (stays.length >= 2) return 'repeat';
    return 'past';
  }
  function guest(inst, scr) {
    const g = BB.q.guest(scr.id); if (!g) return null;
    const stays = BB.q.guestBookings(g.id).filter(b => b.status !== 'cancelled' && b.status !== 'request'), ltv = BB.q.lifetime(g.id);
    const rated = stays.filter(b => b.review); const rating = rated.length ? (rated.reduce((x, b) => x + b.review.stars, 0) / rated.length).toFixed(1) : '–';
    const nd = inst.st.noteDraft && inst.st.noteDraft.id === g.id ? inst.st.noteDraft.text : g.notes;
    const body = '<div class="m-prof">' + BB.avatar(g.name, 'lg') + '<h3 class="disp">' + esc(g.name) + '</h3><p>' + esc([g.city, g.subscribed ? 'on your guest list' : 'not subscribed'].filter(Boolean).join(' · ')) + '</p>' +
      (g.tags.length ? '<div class="m-tags">' + g.tags.map(t => '<span>' + esc(t) + '</span>').join('') + '</div>' : '') + '</div>' +
      '<div class="m-stat3"><div><b class="disp num">' + stays.length + '</b><span>' + (stays.length === 1 ? 'stay' : 'stays') + '</span></div><div><b class="disp num">' + BB.money(ltv) + '</b><span>lifetime</span></div><div><b class="disp num">' + rating + '</b><span>rating</span></div></div>' +
      sec('History') + '<div class="m-list m-hist">' + stays.map(b => {
        const p = BB.q.property(b.propertyId), now = b.checkIn <= S().today && b.checkOut > S().today, up = b.checkIn > S().today;
        return '<button class="m-row" data-m="sheet" data-id="' + esc(b.id) + '"><i class="m-hdot g-' + srcGroup(b) + '"></i><span class="m-row-t"><b>' + esc(D.fmt(b.checkIn, { month: 'short', day: undefined, year: 'numeric' })) + ' · ' + esc(p.short) + '</b><span>' + esc(stayRange(b)) + ' · ' + esc(BB.sourceLabel(b)) + (now ? ' · staying now' : up ? ' · upcoming' : '') + '</span></span><span class="m-row-r"><b class="num">' + BB.money(b.total) + '</b></span></button>';
      }).join('') + '</div>' +
      sec('Contact') + '<div class="m-kv"><span>Email</span><b>' + esc(g.email) + '</b><span>Phone</span><b class="num">' + esc(g.phone || 'Not shared') + '</b><span>Guest list</span><b><button class="switch" role="switch" aria-checked="' + !!g.subscribed + '" data-m="subtoggle" data-id="' + esc(g.id) + '" aria-label="Subscribed to emails"></button></b></div>' +
      sec('Notes') + '<div class="m-note"><label class="sr" for="mNote-' + inst.uid + '">Notes about ' + esc(first(g.name)) + '</label><textarea id="mNote-' + inst.uid + '" data-mi="note" data-id="' + esc(g.id) + '" rows="3" placeholder="Add a private note, like room preferences or the dog’s name">' + esc(nd) + '</textarea>' +
      (nd !== g.notes ? '<button class="btn sm primary" data-m="notesave" data-id="' + esc(g.id) + '">Save note</button>' : '') + '</div>';
    const foot = '<div class="m-foot"><button class="btn primary block lg" data-m="comeback" data-id="' + esc(g.id) + '">' + ic('mail') + 'Send a come-back offer</button></div>';
    const right = '<button class="m-link" data-m="gmsg" data-id="' + esc(g.id) + '" aria-label="Message ' + esc(first(g.name)) + '">' + ic('inbox') + 'Message</button>';
    return { key: 'guest-' + g.id, head: navBar(inst, g.name, plural(stays.length, 'stay') + ' · ' + BB.money(ltv), right), body, foot };
  }

  /* ---------- Grow ---------- */
  function cmpPill(c) { return c.status === 'sent' ? BB.pill('good', 'Sent') : c.status === 'scheduled' ? BB.pill('info', 'Scheduled') : BB.pill('muted', 'Draft'); }
  function grow(inst) {
    const s = S(), m = BB.metrics(), ai = BB.aiScore(), task = s.ai.tasks.find(t => !t.done);
    const aiB = s.bookings.filter(b => b.source === 'ai' && b.status !== 'cancelled').sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    const named = s.ai.questions.find(q => q.engines.chatgpt && q.engines.gemini);
    const head = topBar(inst, 'Grow', 'More guests who book with you direct');
    const body = '<div class="m-tiles"><div class="m-tile ink"><small>Fees saved in ' + s.today.slice(0, 4) + '</small><b class="disp num">' + BB.money(m.saved) + '</b><span>' + plural(m.directYearCount, 'direct booking') + ' with no platform fee</span></div>' +
      '<div class="m-tile"><small>AI visibility</small><b class="disp num">' + ai.score + '<em>/100</em></b><span>Named in ' + ai.mentioned + ' of ' + ai.total + ' AI answers</span><span class="m-bar"><i style="width:' + ai.score + '%"></i></span></div></div>' +
      '<div id="mAi-' + inst.uid + '" class="m-anchor' + (inst.st.flash === 'ai' ? ' flash' : '') + '">' + sec('Found you through AI', '<em class="m-count">' + aiB.length + '</em>') +
      (named ? '<p class="m-aiq">' + BB.aiLogos(['chatgpt', 'gemini']) + '<span>ChatGPT and Gemini name ' + esc(BB.q.property(named.propertyId).short) + ' for “' + esc(named.q) + '”</span></p>' : '') +
      (aiB.length ? '<div class="m-list">' + aiB.slice(0, 3).map(b => bookingRow(b, stayRange(b) + ' · ' + BB.money(b.total), BB.pill('info', 'AI answer'))).join('') + '</div>' : '') + (named ? BB.aiTm('m-tm') : '') +
      (task ? '<div class="m-card m-aitask"><span class="m-ico t-warn">' + ic('spark') + '</span><span class="m-row-t"><b>' + esc(task.text) + '</b><span>Gets you into ' + plural(task.fixes.length, 'more AI answer') + '</span></span><button class="btn sm" data-m="aitask" data-id="' + esc(task.id) + '">Do it</button></div>'
        : '<div class="m-card m-aitask"><span class="m-ico t-good">' + ic('check') + '</span><span class="m-row-t"><b>All AI visibility tasks done</b><span>We re-check answers every morning</span></span></div>') + '</div>' +
      '<button class="btn primary block lg m-newc" data-m="newcmp">' + ic('plus') + 'New campaign</button>' +
      sec('Campaigns', '<em class="m-count">' + s.campaigns.length + '</em>') +
      '<div class="m-list">' + s.campaigns.map(c => '<button class="m-row m-cmp" data-m="cmp" data-id="' + esc(c.id) + '"><span class="m-ico">' + ic('mail') + '</span><span class="m-row-t"><b>' + esc(c.name) + '</b><span>' +
        (c.status === 'sent' ? c.recipients + ' guests · ' + Math.round(100 * c.opens / Math.max(c.recipients, 1)) + '% opened · ' + plural(c.bookings, 'booking') : c.status === 'scheduled' ? 'Sends ' + esc(D.fmt(c.sentAt)) + ' · ' + esc(SEG_SHORT[c.segment] || c.segment) : esc(SEG_SHORT[c.segment] || c.segment) + ' · not sent') +
        '</span></span><span class="m-row-r col">' + cmpPill(c) + (c.status === 'sent' ? '<b class="num">' + BB.money(c.revenue) + '</b>' : '') + '</span></button>').join('') + '</div>' +
      '<button class="btn ghost block m-console" data-m="console" data-id="campaigns">' + ic('out') + 'Open campaigns in the console</button>';
    return { key: 'grow', head, body };
  }
  function emailPreview(c, p) {
    return '<div class="m-email"><div class="m-scene t-' + esc(p.theme || 'cabin') + '" style="--pc:' + esc(p.color || '#2F5D46') + '"><i></i><b></b></div><div class="m-email-b"><small>' + esc(p.name) + '</small><h4 class="disp">' + esc(c.heading) + '</h4><p>' + esc(c.text) + '</p><span class="m-cta">' + esc(c.cta) + '</span><span class="m-code">' + esc(c.promo) + '</span></div></div>';
  }
  function compose(inst) {
    const st = inst.st, c = st.cmp || { seg: 'repeat', tpl: 'gap', v: 0, sms: true };
    const segs = BB.q.segments(), copy = writeCopy(c.tpl, c.v, c.pid), p = BB.q.property(copy.propertyId), n = recips(c.seg, segs);
    const draft = c.cid && S().campaigns.find(x => x.id === c.cid);
    const body = '<p class="eyebrow">' + (draft ? 'Draft campaign' : 'New campaign') + '</p><h3 class="disp m-ctitle">' + esc(copy.name) + '</h3>' +
      sec('Send to') + '<div class="m-chips wrap">' + SEG_ORDER.map(k => { const r = recips(k, segs); return '<button class="chip" data-m="cseg" data-id="' + k + '" aria-pressed="' + (c.seg === k) + '"' + (r ? '' : ' disabled') + '>' + SEG_SHORT[k] + ' <span class="num">' + r + '</span></button>'; }).join('') + '</div>' +
      sec('Offer') + '<div class="m-chips wrap">' + TPL.map(([k, t]) => '<button class="chip" data-m="ctpl" data-id="' + k + '" aria-pressed="' + (c.tpl === k) + '">' + t + '</button>').join('') + '</div>' +
      sec('Preview', '<button class="m-link" data-m="crew">' + ic('spark') + 'Rewrite</button>') +
      '<p class="m-subj"><span>Subject</span>' + esc(copy.subject) + '</p>' + emailPreview(copy, p) +
      '<div class="m-switchrow"><span><b>Also send as text</b><small>To guests who opted in to texts</small></span><button class="switch" role="switch" aria-checked="' + !!c.sms + '" data-m="csms" aria-label="Also send as text"></button></div>' +
      (c.sms ? '<div class="m-smsprev"><span>' + ic('sms') + 'Text preview</span><p>' + esc(copy.sms) + '</p></div>' : '');
    const foot = '<div class="m-foot"><button class="btn primary block lg" data-m="csend"' + (n ? '' : ' disabled') + '>' + ic('send') + 'Send to ' + n + ' guests</button><p class="m-via">' + ic('spark') + 'Written with AI from your calendar and listing</p></div>';
    return { key: 'compose', head: navBar(inst, draft ? 'Edit draft' : 'New campaign'), body, foot, tabbar: false };
  }
  function campaign(inst, scr) {
    const c = S().campaigns.find(x => x.id === scr.id); if (!c) return null;
    const p = BB.q.property(c.body.propertyId) || S().properties[0];
    const made = S().bookings.filter(b => b.promo && c.body.promo && b.promo === c.body.promo.toUpperCase() && c.sentAt && b.createdAt >= c.sentAt && b.status !== 'cancelled');
    const rate = (a, b) => b ? Math.round(100 * a / b) + '%' : '0%';
    const body = '<div class="m-cmph">' + cmpPill(c) + '<span>' + esc(SEG_SHORT[c.segment] || c.segment) + (c.sentAt ? ' · ' + (c.status === 'sent' ? 'sent ' : 'sends ') + esc(D.fmt(c.sentAt)) : '') + '</span></div><h3 class="disp m-ctitle">' + esc(c.name) + '</h3>' +
      (c.status === 'sent' ?
        '<div class="m-results"><div class="m-res-big"><small>Revenue from this campaign</small><b class="disp num">' + BB.money(c.revenue) + '</b><span>' + plural(c.bookings, 'booking') + ' with code ' + esc(c.body.promo) + '</span></div>' +
        '<div class="m-res-grid"><div><b class="num">' + c.recipients + '</b><span>sent</span></div><div><b class="num">' + rate(c.opens, c.recipients) + '</b><span>opened</span></div><div><b class="num">' + rate(c.clicks, c.recipients) + '</b><span>clicked</span></div></div>' +
        '<button class="btn accent block" data-m="sim" data-id="' + esc(c.id) + '">' + ic('play') + 'Simulate responses</button><p class="m-via">Guests open the email and book with the code. Bookings land on every surface.</p></div>'
        : '<div class="m-card"><p class="m-cardp">' + (c.status === 'scheduled' ? 'This campaign is scheduled for ' + esc(D.fmt(c.sentAt, { weekday: 'long', month: 'long' })) + '.' : 'This campaign is a draft.') + '</p><button class="btn primary block" data-m="sendnow" data-id="' + esc(c.id) + '">' + ic('send') + 'Send now to ' + recips(c.segment) + ' guests</button></div>') +
      (made.length ? sec('Bookings from this campaign', '<em class="m-count">' + made.length + '</em>') + '<div class="m-list">' + made.map(b => bookingRow(b, stayRange(b) + ' · ' + BB.money(b.total))).join('') + '</div>' : '') +
      sec('Email') + '<p class="m-subj"><span>Subject</span>' + esc(c.subject) + '</p>' + emailPreview(c.body, p);
    return { key: 'cmp-' + c.id, head: navBar(inst, c.name), body };
  }

  /* ---------- Notifications ---------- */
  function notifIcon(n) { const t = n.title.toLowerCase(); return /booking/.test(t) ? 'cal' : /message/.test(t) ? 'inbox' : /check/.test(t) ? 'key' : /deposit/.test(t) ? 'card' : /campaign/.test(t) ? 'mail' : /arrive/.test(t) ? 'home' : 'bell'; }
  function notifs(inst) {
    const list = S().notifications, fresh = inst.st.fresh || [];
    const right = unreadNotifs() ? '<button class="m-link" data-m="readall">Mark read</button>' : '';
    const body = list.length ? '<div class="m-list">' + list.map(n => '<button class="m-row m-notif' + (fresh.includes(n.id) || !n.read ? ' new' : '') + '" data-m="notif" data-id="' + esc(n.id) + '"><span class="m-ico">' + ic(notifIcon(n)) + '</span><span class="m-row-t"><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span><time class="num">' + esc(BB.ago(n.at)) + '</time></span>' + ((fresh.includes(n.id) || !n.read) ? '<i class="m-dot" aria-label="New"></i>' : '') + '</button>').join('') + '</div>' : '<p class="m-empty">No notifications yet.</p>';
    return { key: 'notifs', head: navBar(inst, 'Notifications', '', right), body };
  }

  /* ---------- booking sheet ---------- */
  function bookingSheet(inst, id) {
    const b = BB.q.booking(id); if (!b) return '';
    const g = BB.q.guest(b.guestId), p = BB.q.property(b.propertyId), c = b.checkin, n = D.diff(b.checkIn, b.checkOut);
    const steps = [[S().live ? 'ID photo' : 'ID and selfie', S().live ? c.id : c.id && c.selfie], ['Guests and rental agreement', c.guests && c.agreement], [BB.money(200) + ' deposit hold', c.deposit]];
    const fee = b.channel === 'direct' ? '<span class="good">Booked direct · no platform fee</span>' : '<span>' + BB.CHANNEL[b.channel] + ' fee ' + BB.money(b.platformFee) + '</span>';
    return '<div class="m-sh-h">' + BB.avatar(g.name, 'lg') + '<div><h3 class="disp">' + esc(g.name) + '</h3><p>' + esc(p.name) + ' · <span class="num">' + esc(b.id) + '</span></p><div class="m-sh-pills">' + BB.statusPill(b) + srcChip(b) + '</div></div></div>' +
      '<div class="m-facts"><div><span>Dates</span><b>' + esc(stayRange(b)) + '</b><em>' + plural(n, 'night') + ' · in ' + esc(p.checkinTime) + ', out ' + esc(p.checkoutTime) + '</em></div>' +
      '<div><span>Total</span><b class="num">' + BB.money(b.total) + '</b><em>' + fee + '</em></div>' +
      '<div><span>Guests</span><b>' + esc(partyText(b)) + '</b><em>' + (b.promo ? 'Code ' + esc(b.promo) : BB.q.stays(b.guestId).length > 1 ? 'Returning guest' : 'First stay with you') + '</em></div>' +
      '<div><span>Arrival</span><b>' + esc(c.arrival || 'Not set yet') + '</b><em>' + esc(D.fmt(b.checkIn, { weekday: 'long' })) + '</em></div></div>' +
      sec('Check-in', BB.stepDots(b)) + '<ul class="m-steps">' + steps.map(([t, ok]) => '<li class="' + (ok ? 'ok' : '') + '"><i>' + (ok ? ic('check') : '') + '</i>' + t + '</li>').join('') + '</ul>' +
      '<div class="m-door' + (c.done ? ' on' : '') + '"><span>' + ic('door') + '</span><div><small>Door code · ' + esc(p.short) + '</small><b class="num">' + (c.done ? esc(b.code) : '••••') + '</b><em>' + (c.done ? 'Active ' + esc(D.fmt(b.checkIn)) + ' ' + esc(p.checkinTime) + ' to ' + esc(D.fmt(b.checkOut)) + ' ' + esc(p.checkoutTime) : 'Sent to the guest once check-in is done') + '</em></div></div>' +
      (b.status === 'request' ? '<div class="m-sh-acts"><button class="btn primary" data-m="accept" data-id="' + esc(b.id) + '">' + ic('check') + 'Accept request</button><button class="btn" data-m="console" data-id="booking" data-ref="' + esc(b.id) + '">Decline</button></div>' : '') +
      '<div class="m-sh-acts"><button class="btn' + (b.status === 'request' ? '' : ' primary') + '" data-m="bmsg" data-id="' + esc(b.id) + '">' + ic('inbox') + 'Message</button>' +
      '<button class="btn" data-m="call" data-id="' + esc(g.phone || '') + '"' + (g.phone ? '' : ' disabled') + '>' + ic('phone') + (inst.st.showCall === b.id && g.phone ? '<span class="num">' + esc(g.phone) + '</span>' : 'Call') + '</button>' +
      '<button class="btn ghost m-wide" data-m="console" data-id="booking" data-ref="' + esc(b.id) + '">' + ic('out') + 'Open in console</button></div>';
  }
  function blockSheet(inst, sh) {
    const k = S().blocks.find(x => x.propertyId === sh.pid && x.from <= sh.day && x.to > sh.day); if (!k) return '';
    const p = BB.q.property(k.propertyId), n = D.diff(k.from, k.to);
    return '<div class="m-sh-h"><span class="m-ico lg">' + ic('lock') + '</span><div><h3 class="disp">' + esc(k.note) + '</h3><p>' + esc(p.name) + '</p></div></div>' +
      '<div class="m-facts"><div><span>Nights</span><b>' + esc(nightRange(k.from, n)) + '</b><em>' + plural(n, 'night') + '</em></div><div><span>Where</span><b>Closed for booking</b><em>Your booking site and guest app</em></div></div>' +
      (k.sync ? '<p class="m-via">From your ' + esc(BB.q.integration(k.sync).name) + ' link. We only see the dates, so change them where they were booked.</p>' : '<div class="m-sh-acts"><button class="btn primary m-wide" data-m="unblock" data-id="' + esc(k.from) + '">Unblock and reopen these nights</button></div>');
  }

  /* ---------- lock screen phone ---------- */
  function lockScreen(inst) {
    const s = S(), list = s.notifications.slice(0, 4);
    return '<div class="m-lock">' + BB.sbar(' ', true) + '<div class="m-lock-t"><p>' + esc(D.fmt(s.today, { weekday: 'long', month: 'long', day: 'numeric' })) + '</p><b class="disp num">' + esc(clock12(s.clock)) + '</b></div>' +
      '<div class="m-pushes" aria-live="polite">' + (list.length ? list.map(n => '<button class="m-push' + (inst.lockNew === n.id ? ' new' : '') + '" data-m="notif" data-id="' + esc(n.id) + '">' + BB.MARK + '<span><span class="m-push-h"><em>BOOKINGBOOSTER</em><time class="num">' + esc(BB.ago(n.at).replace(s.today, '')) + '</time></span><b>' + esc(n.title) + '</b><span>' + esc(n.body) + '</span></span></button>').join('') : '<p class="m-lock-empty">No notifications</p>') +
      (s.notifications.length > 4 ? '<p class="m-lock-more">' + (s.notifications.length - 4) + ' more in the app</p>' : '') + '</div>' +
      '<div class="m-lock-f"><span>' + ic('bolt') + '</span><i></i><span>' + ic('camera') + '</span></div></div>';
  }

  /* ---------- Try this ---------- */
  function tries() {
    const s = S();
    const priya = s.threads.find(t => /^Priya/.test((BB.q.guest(t.guestId) || {}).name || ''));
    const priyaDone = !!(priya && priya.messages.some(m => m.from === 'host'));
    const aiDone = s.ai.tasks.some(t => t.done);
    const aiCount = s.bookings.filter(b => b.source === 'ai' && b.status !== 'cancelled').length;
    const gapSent = s.campaigns.some(c => c.status === 'sent' && c.body && c.body.promo === 'GAP15');
    const blocked = s.blocks.some(k => k.note !== 'Deck repairs' && !k.sync);
    const arr = BB.q.arrivals();
    return [
      ['arrivals', 'home', 'Check who is arriving today', arr.length ? arr.map(b => first(BB.q.guest(b.guestId).name)).join(' and ') + ' arrive' + (arr.length === 1 ? 's' : '') + ' today' : 'Nobody arrives today', false],
      ['priya', 'dog', 'Reply to Priya about her dog', priyaDone ? 'Replied. She sees it in the guest app' : 'Use the suggested reply, then send', priyaDone],
      ['ai', 'spark', 'See who found you through AI', aiDone ? 'Fixed a gap. AI visibility is now ' + BB.aiScore().score + '/100' : aiCount + ' bookings came from AI answers this year', aiDone],
      ['gap', 'mail', 'Send the gap-night offer', gapSent ? 'Sent. Tap Simulate responses to see bookings' : 'AI writes it from your calendar', gapSent],
      ['block', 'lock', 'Block a weekend for yourself', blocked ? 'Blocked on your booking site' : 'Closes the dates on your site and guest app', blocked],
    ];
  }

  /* ---------- navigation ---------- */
  function nav(inst, patch) { inst.set(Object.assign({ anim: patch.anim || 'tab', sheet: null, showCall: null }, patch)); }
  function setTab(inst, tab) { nav(inst, { tab, stack: [], anim: 'tab', flash: null }); }
  function push(inst, scr) { nav(inst, { stack: inst.st.stack.concat([scr]), anim: 'push' }); }
  function openThread(inst, tid, fresh) {
    BB.act.markRead(tid); inst.st.scrollBottom = true;
    if (fresh) nav(inst, { tab: 'inbox', stack: [{ k: 'thread', id: tid }], anim: 'push' });
    else push(inst, { k: 'thread', id: tid });
  }
  function openSheet(inst, id) { inst.set({ sheet: { k: 'booking', id }, sheetAnim: true, showCall: null }); }
  function closeSheet(inst) {
    const w = inst.root.querySelector('.m-sheetwrap');
    if (!w || reduced()) { inst.set({ sheet: null }); return; }
    w.classList.add('out'); clearTimeout(inst.sheetT); inst.sheetT = setTimeout(() => inst.set({ sheet: null }), 200);
  }
  function openCompose(inst, cmp, fresh) {
    inst.st.cmp = Object.assign({ seg: 'repeat', tpl: 'gap', v: 0, sms: true }, cmp);
    if (fresh) nav(inst, { tab: 'grow', stack: [{ k: 'compose' }], anim: 'push' }); else push(inst, { k: 'compose' });
  }
  function openRef(inst, ref) {
    const s = S(); if (!ref) return;
    if (BB.q.booking(ref)) { if (inst.st.stack.length && inst.st.stack[inst.st.stack.length - 1].k === 'notifs') { nav(inst, { tab: 'today', stack: [], anim: 'pop' }); } openSheet(inst, ref); }
    else if (BB.q.thread(ref)) openThread(inst, ref, true);
    else if (s.campaigns.some(c => c.id === ref)) nav(inst, { tab: 'grow', stack: [{ k: 'campaign', id: ref }], anim: 'push' });
  }
  function quiet(inst) { inst.quietUntil = Date.now() + 900; }
  function syncAll(inst, only) {
    if (inst.st.syncing) return;
    const ids = (only ? [only] : CHANNELS).filter(id => BB.q.connected(id));
    if (!ids.length) { BB.toast('Calendar sync is an optional add-on. Switch it on in the console.'); return; }
    inst.set({ syncing: true });
    setTimeout(() => {
      if (!inst.alive) return;
      quiet(inst);
      const made = ids.map(id => BB.act.syncChannel(id)).filter(Boolean);
      inst.set({ syncing: false });
      if (made.length) BB.toast(made.map(k => k.note + ': ' + BB.q.property(k.propertyId).short + ', ' + nightRange(k.from, D.diff(k.from, k.to))).join('. ') + '. Blocked on your site.', 'good');
      else BB.toast(ids.map(id => BB.CHANNEL[id]).join(', ') + (ids.length === 1 ? ' has' : ' have') + ' no new dates.');
    }, reduced() ? 0 : 750);
  }
  function scrollPhoneIntoView(inst) {
    const ph = inst.root.querySelector('.m-phone'); if (!ph) return;
    const r = ph.getBoundingClientRect(); if (r.top < 40 || r.top > innerHeight * 0.5) window.scrollBy({ top: r.top - 64, behavior: reduced() ? 'auto' : 'smooth' });
  }
  function nextFreeWeekend(pid) {
    const t = S().today;
    for (let i = 1; i < 120; i++) { const d = D.add(t, i); if (D.dow(d) === 5 && BB.q.isAvailable(pid, d, D.add(d, 2))) return d; }
    return null;
  }

  function applyRoute(inst, opts) {
    opts = opts || {}; const st = inst.st; const id = opts.id;
    const tab = TAB_LABEL[opts.tab] ? opts.tab : opts.tab === 'notifications' ? st.tab : null;
    if (tab) { st.tab = tab; st.stack = []; st.sheet = null; st.anim = 'tab'; }
    if (opts.tab === 'notifications') { st.fresh = S().notifications.filter(n => !n.read).map(n => n.id); st.stack = [{ k: 'notifs' }]; if (st.fresh.length) setTimeout(() => BB.act.readNotifications(), 0); }
    if (!id) return;
    const s = S();
    if (BB.q.booking(id)) { const b = BB.q.booking(id); if (st.tab === 'calendar') { st.pid = b.propertyId; st.month = D.month(b.checkIn < s.today ? s.today : b.checkIn); } st.sheet = { k: 'booking', id }; st.sheetAnim = true; }
    else if (BB.q.thread(id)) { if (!tab) st.tab = 'inbox'; st.stack = [{ k: 'thread', id }]; st.scrollBottom = true; setTimeout(() => BB.act.markRead(id), 0); }
    else if (BB.q.guest(id)) { if (!tab) st.tab = 'guests'; st.stack = [{ k: 'guest', id }]; }
    else if (s.campaigns.some(c => c.id === id)) { if (!tab) st.tab = 'grow'; st.stack = [{ k: 'campaign', id }]; }
    else if (s.properties.some(p => p.id === id)) { st.tab = 'calendar'; st.pid = id; }
  }

  const SCREENS = { thread, guest, campaign, compose, notifs };
  const ROOTS = { today, calendar, inbox, guests, grow };

  function app(inst) {
    const st = inst.st;
    let top = st.stack[st.stack.length - 1], v = null;
    while (top && !(v = SCREENS[top.k](inst, top))) { st.stack.pop(); top = st.stack[st.stack.length - 1]; }
    if (!v) v = ROOTS[st.tab](inst);
    const showTabs = v.tabbar !== false;
    const unread = unreadThreads(), needN = needs().length;
    const banner = inst.banner ? '<button class="m-banner" data-m="notif" data-id="' + esc(inst.banner.id) + '">' + BB.MARK + '<span><b>' + esc(inst.banner.title) + '</b><span>' + esc(inst.banner.body) + '</span></span></button>' : '';
    let sheet = '';
    if (st.sheet) { const inner = st.sheet.k === 'booking' ? bookingSheet(inst, st.sheet.id) : blockSheet(inst, st.sheet); if (inner) sheet = '<div class="m-sheetwrap' + (st.sheetAnim ? ' in' : '') + '"><button class="m-scrim" data-m="closesheet" aria-label="Close"></button><div class="m-sheet" role="dialog" aria-modal="true" aria-label="Details"><div class="m-grab"><button data-m="closesheet" aria-label="Close details"><i></i></button></div><div class="m-sheet-b" id="mSh-' + inst.uid + '-' + esc(st.sheet.id || st.sheet.day) + '">' + inner + '</div></div></div>'; }
    return '<div class="m-sb' + (v.ink ? ' ink' : '') + '">' + BB.sbar(st.clockShown || S().clock, !!v.ink) + '</div>' +
      '<div class="m-app">' + banner +
      '<section class="m-view' + (st.anim ? ' a-' + st.anim : '') + (v.ink ? ' inkv' : '') + '" aria-label="' + esc(top ? screenTitle(top) : TAB_LABEL[st.tab]) + '">' + v.head +
      '<div class="m-scroll" id="mS-' + inst.uid + '-' + esc(v.key) + '"' + (v.pull ? ' data-pull' : '') + '>' + v.body + '</div>' + (v.foot || '') + '</section>' +
      (showTabs ? '<nav class="m-tabbar" aria-label="App tabs">' + TABS.map(([k, t, i]) => {
        const badge = k === 'inbox' && unread ? unread : k === 'today' && needN ? needN : 0;
        return '<button data-m="tab" data-id="' + k + '"' + (st.tab === k ? ' aria-current="page"' : '') + '>' + ic(i) + '<span>' + t + '</span>' + (badge ? '<i class="num' + (k === 'today' ? ' soft' : '') + '">' + badge + '</i>' : '') + '</button>';
      }).join('') + '</nav>' : '') + sheet + '</div>';
  }

  /* ---------- handlers ---------- */
  const H = {
    tab: (inst, id) => { if (id === inst.st.tab && inst.st.stack.length) nav(inst, { stack: [], anim: 'pop' }); else if (id !== inst.st.tab) setTab(inst, id); else { const sc = inst.root.querySelector('.m-scroll'); if (sc) sc.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); } },
    back: inst => nav(inst, { stack: inst.st.stack.slice(0, -1), anim: 'pop' }),
    sheet: (inst, id) => openSheet(inst, id),
    closesheet: inst => closeSheet(inst),
    thread: (inst, id) => openThread(inst, id),
    guest: (inst, id) => push(inst, { k: 'guest', id }),
    notifs: inst => { const fresh = S().notifications.filter(n => !n.read).map(n => n.id); inst.st.fresh = fresh; push(inst, { k: 'notifs' }); if (fresh.length) BB.act.readNotifications(); },
    readall: inst => { BB.act.readNotifications(); inst.set({ fresh: [] }); },
    notif: (inst, id) => { const n = S().notifications.find(x => x.id === id); inst.banner = null; if (!n) return; if (!n.read) { n.read = true; BB.store.commit({ quiet: true }); } scrollPhoneIntoView(inst); if (n.ref) openRef(inst, n.ref); else inst.render(); },
    sync: inst => syncAll(inst),
    gapoffer: inst => { const c2 = S().campaigns.find(c => c.status === 'draft' && c.body && c.body.promo === 'GAP15'); openCompose(inst, { cid: c2 ? c2.id : null, seg: 'repeat', tpl: 'gap' }, true); },
    cpid: (inst, id) => inst.set({ pid: id, sel: null }),
    cmon: (inst, id) => inst.set({ month: BB.addMonth(inst.st.month, Number(id)), anim: null }),
    cday: (inst, d) => {
      const st = inst.st, pid = st.pid, own = BB.q.nightOwner(pid, d);
      if (own) { openSheet(inst, own.id); return; }
      if (S().blocks.some(k => k.propertyId === pid && k.from <= d && k.to > d)) { inst.set({ sheet: { k: 'block', pid, day: d }, sheetAnim: true }); return; }
      if (d < S().today) return;
      const sel = st.sel && st.sel.pid === pid ? st.sel : null;
      if (sel && sel.open && d > sel.a && BB.q.isAvailable(pid, sel.a, D.add(d, 1))) inst.set({ sel: { pid, a: sel.a, b: d, open: false } });
      else if (sel && sel.a === d && sel.b === d) inst.set({ sel: null });
      else inst.set({ sel: { pid, a: d, b: d, open: true } });
    },
    cnote: (inst, id) => inst.set({ note: id }),
    cclear: inst => inst.set({ sel: null }),
    cblock: inst => {
      const sel = inst.st.sel; if (!sel) return; const p = BB.q.property(sel.pid); const n = D.diff(sel.a, sel.b) + 1;
      if (!BB.q.isAvailable(sel.pid, sel.a, D.add(sel.b, 1))) { BB.toast('Some of those nights were just booked. Pick again.'); inst.set({ sel: null }); return; }
      quiet(inst); inst.st.sel = null;
      BB.act.block(sel.pid, sel.a, D.add(sel.b, 1), inst.st.note || 'Owner stay');
      BB.toast('Blocked ' + nightRange(sel.a, n) + ' at ' + p.short + ' on your booking site', 'good');
    },
    unblock: (inst, from) => {
      const pid = inst.st.sheet && inst.st.sheet.pid || inst.st.pid; const k = S().blocks.find(x => x.propertyId === pid && x.from === from); if (!k) return;
      inst.st.sheet = null; quiet(inst); BB.act.unblock(pid, from);
      BB.log('sync', 'Host app', 'Reopened ' + nightRange(k.from, D.diff(k.from, k.to)) + ' at ' + BB.q.property(pid).short + ' for booking.', pid); BB.store.commit({ type: 'calendar' });
      BB.toast('Reopened ' + nightRange(k.from, D.diff(k.from, k.to)) + ' for booking');
    },
    ifilter: (inst, id) => inst.set({ ifilter: id }),
    use: (inst, tid) => { inst.st.drafts[tid] = suggest(tid); inst.st.focus = 'mDraft-' + inst.uid; inst.render(); },
    usesend: (inst, tid) => { quiet(inst); inst.st.drafts[tid] = ''; inst.st.scrollBottom = true; BB.act.sendMessage(tid, 'host', suggest(tid), 'Host app'); },
    qr: (inst, tid, el) => { const c = (inst._chips || [])[Number(el.dataset.i)]; if (!c) return; const cur = (inst.st.drafts[tid] || '').trim(); inst.st.drafts[tid] = (cur ? cur + ' ' : '') + c[1]; inst.st.focus = 'mDraft-' + inst.uid; inst.render(); },
    gfilter: (inst, id) => inst.set({ gfilter: id }),
    subtoggle: (inst, gid) => { const g = BB.q.guest(gid); quiet(inst); BB.act.updateGuest(gid, { subscribed: !g.subscribed }); BB.toast(g.subscribed ? first(g.name) + ' is back on your guest list' : first(g.name) + ' will not get campaigns'); },
    notesave: (inst, gid) => { const d = inst.st.noteDraft; if (!d || d.id !== gid) return; inst.st.noteDraft = null; BB.act.updateGuest(gid, { notes: d.text.trim() }); BB.toast('Note saved', 'good'); },
    gmsg: (inst, gid) => { const g = BB.q.guest(gid); const up = BB.q.guestBookings(gid).find(b => b.status === 'confirmed'); const t = S().threads.find(x => x.guestId === gid) || BB.act.openThread(gid, up ? up.id : null); if (t) openThread(inst, t.id); else BB.toast('Could not open a conversation with ' + first(g.name)); },
    accept: (inst, bid) => { BB.act.acceptRequest(bid); BB.toast('Accepted. The guest has been told.'); },
    bmsg: (inst, bid) => { const b = BB.q.booking(bid); const t = BB.q.threadFor(bid) || S().threads.find(x => x.guestId === b.guestId) || BB.act.openThread(b.guestId, bid); inst.st.sheet = null; openThread(inst, t.id); },
    call: (inst, phone) => { const b = inst.st.sheet && inst.st.sheet.id; if (inst.st.showCall === b) { BB.copy(phone); return; } inst.set({ showCall: b }); },
    comeback: (inst, gid) => {
      const g = BB.q.guest(gid), seg = segFor(g), last = BB.q.guestBookings(gid)[0];
      const copy = writeCopy('comeback', 0, last && last.propertyId);
      quiet(inst);
      const id = BB.act.saveCampaign({ name: copy.name, subject: copy.subject, segment: seg, body: { heading: copy.heading, text: copy.text, cta: copy.cta, propertyId: copy.propertyId, promo: copy.promo, pct: copy.pct, tpl: 'comeback' } });
      BB.toast('Draft ready for ' + SEG_SHORT[seg].toLowerCase() + ', ' + first(g.name) + ' included', 'good');
      openCompose(inst, { cid: id, seg, tpl: 'comeback', pid: copy.propertyId }, true);
    },
    newcmp: inst => openCompose(inst, { cid: null, seg: 'repeat', tpl: allGaps(30).length ? 'gap' : 'comeback' }),
    cmp: (inst, id) => { const c = S().campaigns.find(x => x.id === id); if (!c) return; if (c.status === 'draft') openCompose(inst, { cid: c.id, seg: c.segment, tpl: (c.body && c.body.tpl) || (c.body && c.body.promo === 'GAP15' ? 'gap' : 'comeback'), pid: c.body && c.body.propertyId }); else push(inst, { k: 'campaign', id }); },
    cseg: (inst, id) => { inst.st.cmp.seg = id; inst.render(); },
    ctpl: (inst, id) => { Object.assign(inst.st.cmp, { tpl: id, v: 0 }); inst.render(); },
    crew: inst => { inst.st.cmp.v = (inst.st.cmp.v || 0) + 1; inst.render(); },
    csms: inst => { inst.st.cmp.sms = !inst.st.cmp.sms; inst.render(); },
    csend: inst => {
      const c = inst.st.cmp, copy = writeCopy(c.tpl, c.v, c.pid);
      if (!recips(c.seg)) return;
      quiet(inst);
      const id = BB.act.saveCampaign({ id: c.cid || undefined, name: copy.name, subject: copy.subject, segment: c.seg, body: { heading: copy.heading, text: copy.text, cta: copy.cta, propertyId: copy.propertyId, promo: copy.promo, pct: copy.pct, tpl: copy.tpl } });
      BB.act.sendCampaign(id, { sms: !!c.sms });
      const sent = S().campaigns.find(x => x.id === id);
      BB.toast('Sent to ' + sent.recipients + ' guests by ' + (c.sms ? 'email and text' : 'email'), 'good');
      nav(inst, { stack: inst.st.stack.slice(0, -1).concat([{ k: 'campaign', id }]), anim: 'push' });
    },
    sim: (inst, id) => {
      quiet(inst); const made = BB.act.simulateCampaign(id); const c = S().campaigns.find(x => x.id === id);
      BB.toast(made ? plural(made, 'guest') + ' booked with code ' + c.body.promo + '. Total from this campaign ' + BB.money(c.revenue) : 'More guests opened the email. No open dates left to book.', made ? 'good' : '');
    },
    sendnow: (inst, id) => { quiet(inst); BB.act.sendCampaign(id, { sms: true }); BB.toast('Campaign sent', 'good'); },
    aitask: (inst, id) => { const before = BB.aiScore().score; quiet(inst); BB.act.completeAiTask(id); BB.toast('Done. AI visibility ' + before + ' → ' + BB.aiScore().score, 'good'); },
    golive: () => BB.go('live'),
    console: (inst, view, el) => BB.go('app', el.dataset.ref ? { view, id: el.dataset.ref } : { view }),
    try: (inst, k) => {
      const s = S(); scrollPhoneIntoView(inst);
      if (k === 'arrivals') { nav(inst, { tab: 'today', stack: [], anim: 'tab', flash: 'arrivals' }); inst.st.scrollTo = 'mArr-' + inst.uid; inst.render(); }
      if (k === 'priya') { const t = s.threads.find(x => /^Priya/.test((BB.q.guest(x.guestId) || {}).name || '')); if (t) openThread(inst, t.id, true); }
      if (k === 'ai') { nav(inst, { tab: 'grow', stack: [], anim: 'tab', flash: 'ai' }); inst.st.scrollTo = 'mAi-' + inst.uid; inst.render(); }
      if (k === 'gap') H.gapoffer(inst);
      if (k === 'block') { const pid = 'laurel', d = nextFreeWeekend(pid); nav(inst, { tab: 'calendar', stack: [], pid, month: d ? D.month(d) : D.month(s.today), sel: d ? { pid, a: d, b: D.add(d, 1), open: false } : null, note: 'Owner stay', anim: 'tab' }); if (d) BB.toast('Friday and Saturday selected. Tap Block to close them everywhere.'); }
    },
  };

  BB.define('mobile', {
    create(root, opts, inst) {
      inst.uid = Math.random().toString(36).slice(2, 7);
      const s = S();
      Object.assign(inst.st, { tab: 'today', stack: [], sheet: null, anim: null, pid: 'laurel', month: D.month(s.today), sel: null, note: 'Owner stay', q: '', drafts: {}, cmp: null, syncing: false, ifilter: 'all', gfilter: 'all' });
      inst.lastN = (s.notifications[0] || {}).id; inst.quietUntil = 0;
      applyRoute(inst, opts);
      BB.on(root, 'click', '[data-m]', (el, ev) => { if (el.disabled) return; const f = H[el.dataset.m]; if (f) { ev.preventDefault(); f(inst, el.dataset.id, el, ev); } });
      BB.on(root, 'click', '[data-try]', el => H.try(inst, el.dataset.try));
      BB.on(root, 'submit', 'form[data-mf]', (el, ev) => {
        ev.preventDefault(); const tid = el.dataset.id, text = (inst.st.drafts[tid] || '').trim(); if (!text) return;
        inst.st.drafts[tid] = ''; inst.st.scrollBottom = true; inst.st.focus = 'mDraft-' + inst.uid; quiet(inst);
        BB.act.sendMessage(tid, 'host', text, 'Host app');
      });
      BB.on(root, 'input', '[data-mi]', el => {
        const k = el.dataset.mi;
        if (k === 'draft') { inst.st.drafts[el.dataset.id] = el.value; const b = el.form && el.form.querySelector('.m-send'); if (b) b.disabled = !el.value.trim(); }
        if (k === 'q') inst.set({ q: el.value });
        if (k === 'note') { const g = BB.q.guest(el.dataset.id); inst.st.noteDraft = { id: el.dataset.id, text: el.value }; if ((el.value !== g.notes) !== !!root.querySelector('[data-m="notesave"]')) inst.render(); }
      });
      root.addEventListener('keydown', ev => { if (ev.key === 'Escape' && inst.st.sheet) { ev.stopPropagation(); closeSheet(inst); } });
      // pull to sync: drag down on the Today list when it is scrolled to the top
      const start = (y, target) => { const sc = target.closest && target.closest('[data-pull]'); if (!sc || sc.scrollTop > 0 || inst.st.syncing) return; inst.pull = { y, sc, dy: 0 }; };
      const move = y => { const p = inst.pull; if (!p) return; p.dy = Math.max(0, y - p.y); if (p.dy > 8) inst.dragged = true; const h = Math.min(72, p.dy * 0.5); const el = p.sc.querySelector('.m-pull'); if (el) { el.style.height = h + 'px'; el.classList.toggle('ready', h >= 56); el.querySelector('em').textContent = h >= 56 ? 'Release to sync calendars' : 'Pull to sync calendars'; el.querySelector('.m-spin').style.transform = 'rotate(' + (h * 4) + 'deg)'; } };
      const end = () => { const p = inst.pull; inst.pull = null; if (!p) return; const el = p.sc.querySelector('.m-pull'); if (el) { el.style.height = ''; el.classList.remove('ready'); } if (p.dy * 0.5 >= 56) syncAll(inst); };
      root.addEventListener('pointerdown', ev => { inst.dragged = false; if (ev.pointerType === 'mouse' && ev.button === 0 && !ev.target.closest('input, textarea')) start(ev.clientY, ev.target); });
      // a drag that pulled the list should not also count as a tap on the row under the pointer
      root.addEventListener('click', ev => { if (inst.dragged) { inst.dragged = false; ev.stopPropagation(); ev.preventDefault(); } }, true);
      root.addEventListener('pointermove', ev => { if (ev.pointerType === 'mouse') move(ev.clientY); });
      inst.onUp = () => end(); window.addEventListener('pointerup', inst.onUp);
      root.addEventListener('touchstart', ev => start(ev.touches[0].clientY, ev.target), { passive: true });
      root.addEventListener('touchmove', ev => move(ev.touches[0].clientY), { passive: true });
      root.addEventListener('touchend', end, { passive: true });
    },
    route(inst, opts) { applyRoute(inst, opts); inst.render(); },
    destroy(inst) { window.removeEventListener('pointerup', inst.onUp); clearTimeout(inst.bannerT); clearTimeout(inst.lockT); clearTimeout(inst.sheetT); },
    render(inst) {
      const t = tries();
      return '<div class="x-mobile">' +
        '<header class="m-head"><div><p class="eyebrow">Host app</p><h1 class="disp">Bookingbooster for iPhone and Android</h1></div><p class="muted">' + (S().live ? 'Today’s arrivals, booking requests, guest messages and your calendar, made for your phone. Add this page to your home screen to use it like an app. It shares data with the console and guest app, so every change shows up everywhere.' : 'Dana runs Fell &amp; Harbour Stays, three holiday lets in Cumbria, Cornwall and Bath, from her phone: today’s arrivals, guest messages with suggested replies, the calendar for her own booking sites and one-tap offers to past guests. It shares data with the console and guest app, so every change shows up everywhere.') + '</p></header>' +
        '<div class="m-stage">' +
          '<div class="m-main"><p class="m-lab">' + ic('phone') + (S().live ? 'Your phone view' : 'Dana’s phone · tap anything') + '</p>' + BB.phone(app(inst), 'fluid m-phone') + '</div>' +
          (S().live ? '' : '<aside class="m-try" aria-label="Try this"><div class="m-try-h"><p class="eyebrow">Try this</p><h2 class="disp">Run Dana’s morning</h2><p class="muted">Each step drives the phone and changes the shared data.</p></div>' +
            '<ol>' + t.map(([k, i, title, sub, done], n) => '<li><button data-try="' + k + '" class="' + (done ? 'done' : '') + '"><span class="m-try-i">' + (done ? ic('check') : ic(i)) + '</span><span class="m-try-t"><b>' + (n + 1) + '. ' + esc(title) + '</b><span>' + esc(sub) + '</span></span>' + ic('chev', 'm-chev') + '</button></li>').join('') + '</ol>' +
            '<div class="m-try-f"><button class="btn sm" data-m="golive">' + ic('bolt') + 'Book as a guest in the live demo</button></div></aside>') +
          '<div class="m-lockcol" aria-label="Lock screen"><p class="m-lab">' + ic('bell') + 'Lock screen · live notifications</p>' + BB.phone(lockScreen(inst), 'm-lockphone') + '</div>' +
        '</div></div>';
    },
    after(inst) {
      const st = inst.st, root = inst.root;
      if (st.anim) st.anim = null;
      if (st.sheetAnim) st.sheetAnim = false;
      // new notification: banner on the phone and a highlight on the lock screen
      const n0 = S().notifications[0];
      if (n0 && n0.id !== inst.lastN) {
        inst.lastN = n0.id; inst.lockNew = n0.id; clearTimeout(inst.lockT); inst.lockT = setTimeout(() => { inst.lockNew = null; }, 1500);
        if (Date.now() > inst.quietUntil) { inst.banner = n0; clearTimeout(inst.bannerT); inst.bannerT = setTimeout(() => { inst.banner = null; inst.render(); }, 4500); setTimeout(() => inst.render(), 0); }
      }
      const top = st.stack[st.stack.length - 1];
      if (top && top.k === 'thread') {
        const t = BB.q.thread(top.id);
        if (t) {
          if (inst.seenCount !== t.messages.length) { if (inst.seenCount != null && inst.seenThread === t.id) st.scrollBottom = true; inst.seenCount = t.messages.length; inst.seenThread = t.id; }
          if (t.unread) setTimeout(() => BB.act.markRead(t.id), 0);
        }
      } else { inst.seenCount = null; inst.seenThread = null; }
      if (st.scrollBottom) { const sc = root.querySelector('.m-scroll'); if (sc) sc.scrollTop = sc.scrollHeight; st.scrollBottom = false; }
      if (st.scrollTo) { const el = root.querySelector('#' + st.scrollTo), sc = root.querySelector('.m-scroll'); if (el && sc) sc.scrollTop = el.offsetTop - 8; st.scrollTo = null; setTimeout(() => { if (inst.st.flash) { inst.st.flash = null; } }, 1600); }
      if (st.focus) { const el = root.querySelector('#' + st.focus); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) {} } st.focus = null; }
    },
  });
})();
