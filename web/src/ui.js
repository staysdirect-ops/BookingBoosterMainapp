/* Bookingbooster prototype: shared UI kit. Rendering, mounting, icons and small components used by every surface. */
(function () {
  const BB = window.BB;

  BB.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Paint html into root, keeping focus, caret and scroll positions of elements that have an id. */
  BB.paint = function (root, html) {
    const a = document.activeElement;
    const focus = a && root.contains(a) && a.id ? { id: a.id, s: a.selectionStart, e: a.selectionEnd } : null;
    const scrolls = [];
    root.querySelectorAll('[id]').forEach(el => { if (el.scrollTop || el.scrollLeft) scrolls.push([el.id, el.scrollTop, el.scrollLeft]); });
    const rootScroll = root.scrollTop;
    root.innerHTML = html;
    root.scrollTop = rootScroll;
    scrolls.forEach(([id, t, l]) => { const el = root.querySelector('#' + CSS.escape(id)); if (el) { el.scrollTop = t; el.scrollLeft = l; } });
    if (focus) { const el = root.querySelector('#' + CSS.escape(focus.id)); if (el) { el.focus({ preventScroll: true }); try { if (focus.s != null) el.setSelectionRange(focus.s, focus.e); } catch (_) {} } }
  };

  /* Surfaces. A surface is defined once and can be mounted into several roots (for example the live demo).
     def.create(root, opts, inst) is called once per mount; def.render(inst) returns html; the kit repaints every mounted
     instance whenever the store changes. inst.st is the instance's local UI state. */
  BB.surfaces = {};
  const mounted = [];
  BB.define = (name, def) => { BB.surfaces[name] = def; };
  BB.mount = function (name, root, opts) {
    const def = BB.surfaces[name]; if (!def) { root.innerHTML = '<p class="empty">Missing surface: ' + name + '</p>'; return null; }
    const inst = { name, root, opts: opts || {}, st: {}, def, alive: true };
    inst.render = () => { if (!inst.alive) return; try { BB.paint(root, def.render(inst)); if (def.after) def.after(inst); } catch (e) { console.error(e); root.innerHTML = '<pre class="err">' + BB.esc(e.stack || e) + '</pre>'; } };
    inst.set = patch => { Object.assign(inst.st, patch); inst.render(); };
    inst.destroy = () => { inst.alive = false; const i = mounted.indexOf(inst); if (i >= 0) mounted.splice(i, 1); if (def.destroy) def.destroy(inst); };
    if (def.create) def.create(root, inst.opts, inst);
    mounted.push(inst); inst.render(); return inst;
  };
  BB.store.subscribe(() => mounted.slice().forEach(i => i.render()));
  BB.instances = () => mounted.slice();

  /* Delegated events helper: on(root, 'click', '[data-x]', (el, ev) => ...) */
  BB.on = function (root, type, sel, fn) { root.addEventListener(type, ev => { const el = ev.target.closest(sel); if (el && root.contains(el)) fn(el, ev); }); };

  /* Navigation between surfaces. The shell installs the real handler. */
  BB.go = function (surface, opts) { if (BB._go) BB._go(surface, opts || {}); };

  /* Toast */
  BB.toast = function (text, kind) {
    let wrap = document.getElementById('bbToasts');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'bbToasts'; wrap.className = 'toasts'; wrap.setAttribute('role', 'status'); document.body.appendChild(wrap); }
    const t = document.createElement('div'); t.className = 'toast ' + (kind || ''); t.textContent = text; wrap.appendChild(t);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 300); }, 3200);
  };

  /* Copy with fallback to selecting the text */
  BB.copy = async function (text, el) { try { await navigator.clipboard.writeText(text); BB.toast('Copied'); } catch (_) { if (el) { const r = document.createRange(); r.selectNodeContents(el); getSelection().removeAllRanges(); getSelection().addRange(r); } } };

  /* Icons: 24px stroke icons */
  const I = {
    dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    inbox: '<path d="M4 4h16v12H8l-4 4z"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3"/>',
    card: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-4 4-6 7-6s6 2 7 6M16 4.5a3.5 3.5 0 010 7M18 14c2 .8 3.5 3 4 6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4.5 4.5-6.5 8-6.5s6.5 2 8 6.5"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
    flow: '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="12" r="2.5"/><path d="M6 8.5v7M8.5 6h3a4 4 0 014 4M8.5 18h3a4 4 0 004-4"/>',
    web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    sms: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 10h8"/>',
    star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z"/>',
    home: '<path d="M3 11l9-7 9 7v9H3z"/>',
    plug: '<path d="M9 3v5M15 3v5M6 8h12v3a6 6 0 01-12 0zM12 17v4"/>',
    bell: '<path d="M6 16V11a6 6 0 0112 0v5l2 2H4z"/><path d="M10 21h4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
    id: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2.2"/><path d="M5.5 16c.8-1.6 2-2.3 3.5-2.3s2.7.7 3.5 2.3M14 10h4M14 13h3"/>',
    camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
    pen: '<path d="M4 20l4-1 11-11-3-3L5 16z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    car: '<path d="M4 16v-4l2-5h12l2 5v4zM4 16v3M20 16v3"/><circle cx="7.5" cy="13.5" r="1"/><circle cx="16.5" cy="13.5" r="1"/>',
    wifi: '<path d="M2 9a15 15 0 0120 0M5 12.5a10 10 0 0114 0M8.5 16a5 5 0 017 0"/><circle cx="12" cy="19" r="1"/>',
    send: '<path d="M4 12l16-8-6 16-3-6z"/>',
    sync: '<path d="M20 11a8 8 0 00-14.3-4.9L4 8M4 13a8 8 0 0014.3 4.9L20 16M4 4v4h4M20 20v-4h-4"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18h2"/>',
    door: '<path d="M6 21V4a1 1 0 011-1h10a1 1 0 011 1v17M3 21h18"/><circle cx="14.5" cy="12" r="1"/>',
    tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="8" cy="8" r="1.5"/>',
    heart: '<path d="M12 20s-8-4.6-8-10.2A4.4 4.4 0 0112 7a4.4 4.4 0 018 2.8C20 15.4 12 20 12 20z"/>',
    dog: '<path d="M5 10l1-5 4 3h4l4-3 1 5-1 4-3 5H9l-3-5z"/><circle cx="10" cy="12" r=".6"/><circle cx="14" cy="12" r=".6"/>',
    image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
    out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    play: '<path d="M7 4l13 8-13 8z"/>',
    reset: '<path d="M4 12a8 8 0 108-8H8M4 4v4h4"/>',
  };
  BB.ICONS = I;
  BB.icon = (k, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (I[k] || I.spark) + '</svg>';

  /* Brand mark (cobalt square) and inverse */
  BB.MARK = '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="26" fill="#3355FF"/><path d="M31 79 V34" stroke="#fff" stroke-width="11" stroke-linecap="round"/><path d="M20 35 L31 22 L42 35" fill="none" stroke="#FFC233" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="M31 56 L54 39 L77 56 V79 H31" fill="none" stroke="#fff" stroke-width="11" stroke-linejoin="round" stroke-linecap="round"/><rect x="49" y="62" width="10" height="17" rx="2" fill="#FFC233"/></svg>';
  BB.lockup = (cls) => '<span class="lockup ' + (cls || '') + '">' + BB.MARK + 'bookingbooster</span>';

  /* Small components */
  BB.pill = (kind, text) => '<span class="pill ' + kind + '">' + text + '</span>';
  BB.chan = c => '<span class="chan c-' + c + '"><i></i>' + BB.CHANNEL[c] + '</span>';
  BB.avatar = (name, cls) => { const n = String(name || '?').split(' '); const ini = (n[0][0] || '') + ((n[1] || '')[0] || ''); let h = 0; for (const ch of name || '') h = (h * 31 + ch.charCodeAt(0)) % 360; return '<span class="avatar ' + (cls || '') + '" style="--h:' + h + '">' + BB.esc(ini) + '</span>'; };
  BB.statusPill = b => {
    if (b.status === 'cancelled') return BB.pill('bad', 'Cancelled');
    if (b.status === 'completed') return BB.pill('muted', 'Completed');
    if (b.status === 'pending') return BB.pill('warn', 'Awaiting payment');
    if (b.status === 'request') return BB.pill('info', 'Request');
    const t = BB.store.get().today;
    if (b.checkIn <= t && b.checkOut > t) return BB.pill('good', 'Staying');
    if (b.checkOut === t) return BB.pill('info', 'Departs today');
    if (b.checkin.done) return BB.pill('good', 'Checked in');
    if (b.checkin.id || b.checkin.agreement) return BB.pill('warn', 'Check-in started');
    return BB.pill('muted', 'Upcoming');
  };
  BB.checkinSteps = b => { const c = b.checkin; return [c.id && c.selfie, c.agreement, c.deposit].filter(Boolean).length; };
  BB.stepDots = b => { const n = BB.checkinSteps(b); return '<span class="dots" title="' + n + ' of 3 check-in steps done">' + [0, 1, 2].map(i => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span>'; };
  BB.ago = at => { const s = BB.store.get(); const [d, t] = at.split('T'); if (d === s.today) return t; if (d === BB.D.add(s.today, -1)) return 'Yesterday ' + t; return BB.D.fmt(d) + ' ' + t; };
  BB.dates = b => BB.D.fmt(b.checkIn) + ' – ' + BB.D.fmt(b.checkOut);

  /* Phone frame wrapper used by the host mobile app and the guest app */
  BB.phone = (inner, cls) => '<div class="phone ' + (cls || '') + '"><div class="screen">' + inner + '</div></div>';
  BB.sbar = (time, dark) => '<div class="sbar' + (dark ? ' dark' : '') + '"><span>' + (time || BB.store.get().clock) + '</span><span class="isl"></span><span>●●● 5G</span></div>';

  /* Month calendar grid for date pickers. sel = {a, b}; blocked = Set of iso nights; returns html with data-day buttons */
  BB.monthGrid = function (month, sel, blocked, opts) {
    opts = opts || {};
    const D = BB.D; const first = month + '-01'; const startDow = (D.dow(first) + 6) % 7; // Monday first
    let days = []; for (let d = first; D.month(d) === month; d = D.add(d, 1)) days.push(d);
    const today = BB.store.get().today;
    let html = '<div class="mgrid" role="grid">' + ['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(x => '<span class="h">' + x + '</span>').join('');
    for (let i = 0; i < startDow; i++) html += '<span></span>';
    days.forEach(d => {
      const past = d < today; const taken = blocked && blocked.has(d);
      const inRange = sel && sel.a && sel.b && d > sel.a && d < sel.b; const edge = sel && (d === sel.a || d === sel.b);
      const cls = [past ? 'past' : '', taken ? 'taken' : '', inRange ? 'in' : '', edge ? 'edge' : '', d === today ? 'today' : ''].join(' ');
      html += '<button type="button" class="' + cls + '" data-day="' + d + '"' + (past || (taken && !(sel && sel.a && !sel.b && d > sel.a && !blocked.has(BB.D.add(d, -1)))) ? ' disabled' : '') + ' aria-label="' + D.fmt(d, { weekday: 'long', month: 'long' }) + (taken ? ', booked' : '') + '">' + Number(d.slice(8)) + '</button>';
    });
    return html + '</div>';
  };
  BB.monthName = m => BB.D.parse(m + '-01').toLocaleDateString('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' });
  BB.addMonth = (m, n) => { const d = BB.D.parse(m + '-01'); d.setUTCMonth(d.getUTCMonth() + n); return BB.D.iso(d).slice(0, 7); };
  /* Date range picking: returns new {a,b} after a click on day d */
  BB.pickRange = function (sel, d, blocked) {
    if (!sel.a || sel.b || d <= sel.a) return { a: d, b: null };
    const nights = BB.D.nights(sel.a, d); if (blocked && nights.some(x => blocked.has(x))) return { a: d, b: null };
    return { a: sel.a, b: d };
  };
})();

/* AI and search platform logos (official marks from brand/ai-platforms, viewBox 24). One hidden sprite per page keeps gradient ids unique.
   Use them only beside the platform name, all at the same size, nominative wording only ("shows up in", "checked on"). */
(function () {
  const BB = window.BB;
  const SPRITE = "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"0\" height=\"0\" style=\"position:absolute;width:0;height:0;overflow:hidden\" aria-hidden=\"true\" focusable=\"false\" id=\"bbAiSprite\"><symbol id=\"bb-ai-chatgpt\" viewBox=\"0 0 24 24\"><path style=\"fill:var(--ai-chatgpt,#000)\" fill-rule=\"evenodd\" d=\"M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z\"></path></symbol><symbol id=\"bb-ai-gemini\" viewBox=\"0 0 24 24\"><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"#3186FF\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#bb-ai-gemini-0)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#bb-ai-gemini-1)\"></path><path d=\"M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z\" fill=\"url(#bb-ai-gemini-2)\"></path><defs><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"bb-ai-gemini-0\" x1=\"7\" x2=\"11\" y1=\"15.5\" y2=\"12\"><stop stop-color=\"#08B962\"></stop><stop offset=\"1\" stop-color=\"#08B962\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"bb-ai-gemini-1\" x1=\"8\" x2=\"11.5\" y1=\"5.5\" y2=\"11\"><stop stop-color=\"#F94543\"></stop><stop offset=\"1\" stop-color=\"#F94543\" stop-opacity=\"0\"></stop></linearGradient><linearGradient gradientUnits=\"userSpaceOnUse\" id=\"bb-ai-gemini-2\" x1=\"3.5\" x2=\"17.5\" y1=\"13.5\" y2=\"12\"><stop stop-color=\"#FABC12\"></stop><stop offset=\".46\" stop-color=\"#FABC12\" stop-opacity=\"0\"></stop></linearGradient></defs></symbol><symbol id=\"bb-ai-perplexity\" viewBox=\"0 0 24 24\"><path d=\"M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z\" fill=\"#22B8CD\" fill-rule=\"nonzero\"></path></symbol><symbol id=\"bb-ai-google\" viewBox=\"0 0 24 24\"><path d=\"M23 12.245c0-.905-.075-1.565-.236-2.25h-10.54v4.083h6.186c-.124 1.014-.797 2.542-2.294 3.569l-.021.136 3.332 2.53.23.022C21.779 18.417 23 15.593 23 12.245z\" fill=\"#4285F4\"></path><path d=\"M12.225 23c3.03 0 5.574-.978 7.433-2.665l-3.542-2.688c-.948.648-2.22 1.1-3.891 1.1a6.745 6.745 0 01-6.386-4.572l-.132.011-3.465 2.628-.045.124C4.043 20.531 7.835 23 12.225 23z\" fill=\"#34A853\"></path><path d=\"M5.84 14.175A6.65 6.65 0 015.463 12c0-.758.138-1.491.361-2.175l-.006-.147-3.508-2.67-.115.054A10.831 10.831 0 001 12c0 1.772.436 3.447 1.197 4.938l3.642-2.763z\" fill=\"#FBBC05\"></path><path d=\"M12.225 5.253c2.108 0 3.529.892 4.34 1.638l3.167-3.031C17.787 2.088 15.255 1 12.225 1 7.834 1 4.043 3.469 2.197 7.062l3.63 2.763a6.77 6.77 0 016.398-4.572z\" fill=\"#EB4335\"></path></symbol></svg>";
  if (!document.getElementById('bbAiSprite')) document.body.insertAdjacentHTML('afterbegin', SPRITE);
  BB.AI_ENGINES = [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['perplexity', 'Perplexity'], ['google', 'Google AI Overviews']];
  const NAME = { chatgpt: 'ChatGPT', gemini: 'Gemini', perplexity: 'Perplexity', google: 'Google' };
  // label: pass a name for a logo shown without visible text; omit when the name sits beside it
  BB.aiLogo = (k, label) => NAME[k] ? '<svg class="ai-logo ai-' + k + '" viewBox="0 0 24 24"' + (label ? ' role="img" aria-label="' + BB.esc(label === true ? NAME[k] : label) + '"' : ' aria-hidden="true"') + ' focusable="false"><use href="#bb-ai-' + k + '"/></svg>' : '';
  BB.aiLogos = (keys, cls) => '<span class="ai-logos' + (cls ? ' ' + cls : '') + '">' + (keys || ['chatgpt', 'gemini', 'perplexity', 'google']).map(k => BB.aiLogo(k, true)).join('') + '</span>';
  // logo + name chip
  BB.aiName = (k, text) => '<span class="ai-name">' + BB.aiLogo(k) + '<span>' + BB.esc(text || NAME[k]) + '</span></span>';
  // escape text and put the logo before every AI platform it names (for activity lines about AI visibility)
  BB.aiText = function (text) {
    return BB.esc(text).replace(/\b(ChatGPT|Gemini|Perplexity|Google(?: AI Overviews?)?)\b/g, m => '<span class="ai-name">' + BB.aiLogo(m === 'ChatGPT' ? 'chatgpt' : m === 'Gemini' ? 'gemini' : m === 'Perplexity' ? 'perplexity' : 'google') + '<span>' + m + '</span></span>');
  };
  BB.AI_TM = 'ChatGPT, Gemini, Perplexity, Google, Claude and Copilot are trademarks of their owners. bookingbooster is not affiliated with or endorsed by them.';
  BB.aiTm = cls => '<p class="ai-tm' + (cls ? ' ' + cls : '') + '">' + BB.esc(BB.AI_TM) + '</p>';
})();
