/* Bookingbooster prototype: host console views for Grow (guests, campaigns, automations), Get found (website, AI visibility)
   and Settings (connections). Registers into BB.appViews; app.js owns the frame, routing and event forwarding. */
(function () {
  const BB = window.BB; BB.appViews = BB.appViews || {};
  const esc = BB.esc, D = BB.D, I = BB.icon, money = BB.money;
  const S = () => BB.store.get();
  const V = BB.appViews;

  /* ---------- helpers ---------- */
  const uid = inst => inst.uid || (inst.uid = Math.random().toString(36).slice(2, 7));
  const ID = (inst, k) => 'ag-' + k + '-' + uid(inst);
  const nav = (inst, view, id) => (inst && inst.nav ? inst.nav(view, id == null ? null : id) : BB.go('app', { view, id: id == null ? null : id }));
  const pct = (x, d) => (isFinite(x) ? (x * 100).toFixed(d || 0) : '0') + '%';
  const first = name => String(name || '').split(' ')[0];
  const stamp = () => S().today + 'T' + S().clock;
  const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
  const ENGINES = [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['perplexity', 'Perplexity'], ['google', 'Google AI Overview']];
  const sw = (on, attrs, label) => '<button type="button" class="switch" role="switch" aria-checked="' + !!on + '" aria-label="' + esc(label) + '" ' + attrs + '></button>';
  const vh = (title, sub, acts, back) => (back ? '<button type="button" class="ag-back" data-ag-nav="' + back[0] + '">' + I('back') + esc(back[1]) + '</button>' : '') +
    '<div class="a-vh"><div><h2 class="disp">' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acts ? '<div class="a-acts">' + acts + '</div>' : '') + '</div>';
  const kpi = (label, val, sub, dir) => '<div class="a-kpi"><span>' + label + '</span><b class="num">' + val + '</b>' + (sub ? '<em class="' + (dir || '') + '">' + sub + '</em>' : '') + '</div>';
  const card = (title, meta, body, cls) => '<section class="a-card ag-card ' + (cls || '') + '"><div class="a-card-h"><h3>' + title + '</h3>' + (meta ? '<span class="ag-meta">' + meta + '</span>' : '') + '</div>' + body + '</section>';
  const homeDot = p => '<span class="ag-home"><i style="background:' + esc(p.color || '#3355FF') + '"></i>' + esc(p.short) + '</span>';
  const wrap = (inst, cls, html) => '<div class="ag ' + cls + (inst.compact || (inst.opts && inst.opts.compact) ? ' ag-compact' : '') + '">' + html + '</div>';
  const range = (a, b) => D.month(a) === D.month(b) ? Number(a.slice(8)) + '–' + D.fmt(b) : D.fmt(a) + '–' + D.fmt(b);
  const srcKey = b => b.channel !== 'direct' ? 'sync' : (b.source || 'website');
  const srcTag = b => '<span class="ag-src s-' + esc(srcKey(b)) + '"><i></i>' + esc(BB.sourceLabel(b)) + '</span>';
  const FOUND = { website: 'your booking site', google: 'Google search', ai: 'an AI answer', email: 'your guest emails', campaign: 'a campaign email', referral: 'a friend’s recommendation', 'guest-app': 'the guest app', console: 'a call or email to you', mobile: 'a call or email to you', sync: 'a platform listing on the sync add-on' };
  const MOSTLY = { website: 'straight to your booking site', google: 'from Google search', ai: 'from AI answers', email: 'from your emails', campaign: 'from your campaigns', referral: 'through friends', 'guest-app': 'from the guest app', console: 'by contacting you', mobile: 'by contacting you', sync: 'through a synced platform' };
  const fromAddr = () => S().live ? 'bookings@' + ((BB.BOOT && BB.BOOT.guestFromDomain) || 'mail.booking-booster.co.uk') + ', replies to ' + S().account.email : 'hello@' + (S().account.email || 'x@booking-booster.co.uk').split('@')[1];
  const COPY = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/></svg>';
  const stars = n => '<span class="ag-stars" aria-label="' + n + ' stars">' + '★★★★★'.slice(0, n) + '<s>' + '★★★★★'.slice(n) + '</s></span>';

  /* guest stats, computed once per render */
  function guestIndex() {
    const s = S(), by = {};
    s.bookings.forEach(b => { if (b.status !== 'cancelled' && b.status !== 'request') (by[b.guestId] = by[b.guestId] || []).push(b); });
    return s.guests.map(g => {
      const st = (by[g.id] || []).slice().sort((a, b) => a.checkIn.localeCompare(b.checkIn));
      const past = st.filter(b => b.checkIn <= s.today);
      const next = st.find(b => b.checkIn > s.today);
      return { g, stays: st, n: st.length, life: sum(st, b => b.total), last: past.length ? past[past.length - 1] : null, next };
    });
  }
  function recipients(segs, key) {
    const seg = segs[key] || segs.past; const real = seg.guests.length;
    const scale = key === 'past' ? 412 / Math.max(real, 1) : key === 'repeat' ? 212 / Math.max(real, 1) : 1; // mirrors BB.act.sendCampaign
    return Math.max(real, Math.round(real * scale));
  }
  // first 1–2 night gap between bookings in the next 30 days
  function findGap() {
    const s = S();
    for (const p of s.properties) {
      const bl = BB.q.blocked(p.id); let run = [];
      for (let i = 1; i < 32; i++) {
        const d = D.add(s.today, i);
        if (!bl.has(d)) run.push(d);
        else { if (run.length >= 1 && run.length <= 2 && bl.has(D.add(run[0], -1))) return { p, a: run[0], b: D.add(run[run.length - 1], 1), n: run.length }; run = []; }
      }
    }
    return null;
  }
  function freeSoon() {
    const s = S(); let best = null;
    s.properties.forEach(p => { const bl = BB.q.blocked(p.id); let n = 0; for (let i = 1; i <= 7; i++) if (!bl.has(D.add(s.today, i))) n++; if (!best || n > best.n) best = { p, n }; });
    return best.p;
  }

  /* ---------- extra actions (kept here, all through the store) ---------- */

  /* ---------- shared event handling ---------- */
  function onClick(ev, inst) {
    const t = ev.target;
    const n = t.closest('[data-ag-nav]');
    if (n) { ev.preventDefault(); const v = n.dataset.agNav, id = n.dataset.agId || null; if (v === 'property') BB.go('property', { propertyId: id }); else nav(inst, v, id); return; }
    const rg = t.closest('[data-dns-reg]'); if (rg) { ev.preventDefault(); inst.set({ dom_reg: inst.st.dom_reg === rg.dataset.dnsReg ? '' : rg.dataset.dnsReg }); return; }
    const a = t.closest('[data-ag]'); if (!a) return;
    const k = a.dataset.ag, v = a.dataset.v, st = inst.st;
    const H = HANDLERS[k]; if (H) { ev.preventDefault(); H(inst, v, a, st); }
  }
  function onInput(ev, inst) {
    const el = ev.target; if (el.dataset && el.dataset.agNotes) { inst.st.gu_nd = { gid: el.dataset.agNotes, v: el.value }; return; }
    if (el.dataset && el.dataset.ctpaste !== undefined) { const had = !!(inst.st.ct_paste || '').trim(); inst.st.ct_paste = el.value; if (had !== !!el.value.trim()) { const b = el.closest('details').querySelector('[data-ag="ct-paste"]'); if (b) b.disabled = !el.value.trim(); } return; }
    const f = el.dataset && el.dataset.agf; if (!f) return;
    const [scope, key] = f.split('.');
    if (scope === 'gu') { inst.st['gu_' + key] = el.value; inst.render(); }
    if (scope === 'cp') { const e = inst.st.cp_edit; if (!e) return; e[key] = el.type === 'number' ? Number(el.value) : el.value; inst.render(); }
    if (scope === 'ws') { const d = wsDraft(inst); d[key] = el.type === 'number' ? Math.max(0, Number(el.value) || 0) : el.value; inst.render(); }
    if (scope === 'ct') { inst.st['ct_' + key] = el.value; if (key === 'q') { inst.st.ct_all = false; inst.render(); } return; }
    if (scope === 'of') { inst.st.gu_offer[key] = el.value; inst.render(); }
    if (scope === 'faq') { inst.st['ws_faq_' + key] = el.value; }
  }
  function onChange(ev, inst) {
    const el = ev.target;
    if (el.dataset.ctfile !== undefined) { const f = el.files && el.files[0]; if (f) ctRead(inst, f); el.value = ''; return; }
    if (el.dataset.ctmap != null) { const m = inst.st.ct_map, i = +el.dataset.ctmap, v = el.value; if (v) m.forEach((x, j) => { if (x === v && j !== i) m[j] = ''; }); m[i] = v; inst.render(); return; }
    if (el.dataset.agphotos) { if (el.files && el.files.length && BB.api) uploadPhotos(inst, el.dataset.agphotos, el.files); el.value = ''; return; }
    if (el.dataset.agcap != null) { const p = BB.q.property(inst.st.ws_pid); const ph = (p.photos || []).map(x => Object.assign({}, x)); const i = +el.dataset.agcap; if (ph[i] && ph[i].cap !== el.value.trim()) { ph[i].cap = el.value.trim().slice(0, 80); BB.act.updateProperty(p.id, { photos: ph }, true); BB.toast('Caption saved'); } return; }
    if (el.dataset.agmap) { HANDLERS['cn-map'](inst, el.dataset.agmap, el); return; }
    if (el.dataset.agNotes) { inst.st.gu_nd = null; const g = BB.q.guest(el.dataset.agNotes); if (g && g.notes !== el.value) { BB.act.updateGuest(g.id, { notes: el.value }); BB.toast('Note saved'); } return; }
    if (el.tagName === 'SELECT') onInput(ev, inst);
  }
  function onSubmit(ev, inst) {
    const f = ev.target.closest('form[data-agform]'); if (!f) return; ev.preventDefault();
    const k = f.dataset.agform;
    if (k === 'tag') {
      const inp = f.querySelector('input'); const tag = inp.value.trim().replace(/\s+/g, ' ').slice(0, 24); const g = BB.q.guest(f.dataset.gid);
      if (tag && g && !g.tags.some(x => x.toLowerCase() === tag.toLowerCase())) { BB.log('campaign', 'Guests', 'Tagged ' + g.name + ' "' + tag + '".', g.id); BB.act.updateGuest(g.id, { tags: g.tags.concat(tag) }); }
      inp.value = '';
    }
    if (k === 'dom') { const v = f.querySelector('input').value.trim(); if (!v) { inst.set({ dom_err: { pid: f.dataset.pid, m: 'Type your domain, like larchcabin.co.uk.' } }); return; } domainCall(inst, f.dataset.pid, '/app/domain', { domain: v }); return; }
    if (k === 'faq') {
      const q = (inst.st.ws_faq_q || '').trim(), a = (inst.st.ws_faq_a || '').trim();
      if (!q || !a) { inst.set({ ws_faq_err: 'Add a question and an answer.' }); return; }
      inst.st.ws_faq_q = ''; inst.st.ws_faq_a = ''; inst.st.ws_faq_err = null; inst.st.ws_faq_open = false;
      BB.act.addFaq(inst.st.ws_pid, q, a); BB.toast('FAQ published');
    }
  }
  // Drag a CSV onto the upload box on Contacts.
  function onDragover(ev, inst) { const d = ev.target.closest && ev.target.closest('[data-ctdrop]'); if (!d) return; ev.preventDefault(); d.classList.add('over'); }
  function onDrop(ev, inst) {
    const d = ev.target.closest && ev.target.closest('[data-ctdrop]'); if (!d) return; ev.preventDefault(); d.classList.remove('over');
    const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0]; if (f) ctRead(inst, f);
  }
  function ctRead(inst, f) {
    if (f.size > 10e6) { inst.set({ ct_err: 'That file is over 10 MB. Split it into smaller files and upload them one at a time.' }); return; }
    const r = new FileReader(); r.onload = () => ctLoad(inst, String(r.result), f.name); r.onerror = () => inst.set({ ct_err: 'We could not read that file.' }); r.readAsText(f);
  }
  function ctReset(st) { ['ct_cells', 'ct_map', 'ct_plan', 'ct_file', 'ct_err', 'ct_paste', 'ct_res', 'ct_tag'].forEach(k => { st[k] = null; }); st.ct_step = ''; st.ct_head = false; st.ct_consent = false; st.ct_sms = false; }
  const hooks = { click: onClick, input: onInput, change: onChange, submit: onSubmit, dragover: onDragover, drop: onDrop };

  const HANDLERS = {
    /* guests */
    'gu-imp': inst => { ctReset(inst.st); inst.st.ct_step = 'pick'; nav(inst, 'contacts'); },
    /* contacts upload */
    'ct-up': inst => { ctReset(inst.st); inst.set({ ct_step: 'pick' }); },
    'ct-x': inst => { ctReset(inst.st); inst.render(); },
    'ct-paste': inst => ctLoad(inst, inst.st.ct_paste || '', ''),
    'ct-head': inst => { const st = inst.st; st.ct_head = !st.ct_head; const width = st.ct_map.length;
      st.ct_map = st.ct_head ? CTX().guess(Array.from({ length: width }, (_, i) => st.ct_cells[0][i] || ''), st.ct_cells.slice(1, 25)) : st.ct_map; inst.render(); },
    'ct-back': (inst, v) => inst.set({ ct_step: v, ct_plan: null }),
    'ct-next': inst => { const st = inst.st; st.ct_plan = CTX().plan(ctRows(st)); inst.set({ ct_step: 'review' }); },
    'ct-consent': inst => inst.set({ ct_consent: !inst.st.ct_consent }),
    'ct-sms': inst => inst.set({ ct_sms: !inst.st.ct_sms }),
    'ct-go': (inst, v, el) => { const st = inst.st; el.disabled = true;
      const r = BB.act.importContacts(ctRows(st), { consent: !!st.ct_consent, sms: !!st.ct_sms, tag: st.ct_tag || '' });
      ctReset(st); st.ct_step = 'done'; st.ct_res = r; inst.render();
      BB.toast('Uploaded ' + r.added + ' new contact' + (r.added === 1 ? '' : 's') + (r.updated ? ', updated ' + r.updated : ''), 'good'); },
    'ct-email': inst => { ctReset(inst.st); inst.st.cp_tpl = 'season'; inst.st.cp_seg = 'list'; inst.st.cp_for = null; nav(inst, 'campaign', 'new'); },
    'ct-f': (inst, v) => inst.set({ ct_f: v, ct_all: false }),
    'ct-all': inst => inst.set({ ct_all: true }),
    'gu-seg': (inst, v) => inst.set({ gu_seg: v }),
    'gu-sort': (inst, v) => inst.set({ gu_sort: v }),
    'gu-all': inst => inst.set({ gu_all: true }),
    'gu-open': (inst, v) => nav(inst, 'guest', v),
    'gu-copy': (inst, v, el) => BB.copy(v, el.parentElement.querySelector('.ag-sel')),
    'gu-untag': (inst, v, el) => { const g = BB.q.guest(el.dataset.gid); if (g) BB.act.updateGuest(g.id, { tags: g.tags.filter(x => x !== v) }); },
    'gu-addtag': (inst, v, el) => { const g = BB.q.guest(el.dataset.gid); if (g && !g.tags.includes(v)) { BB.log('campaign', 'Guests', 'Tagged ' + g.name + ' "' + v + '".', g.id); BB.act.updateGuest(g.id, { tags: g.tags.concat(v) }); } },
    'gu-sub': (inst, v) => { const g = BB.q.guest(v); if (!g) return; BB.log('campaign', 'Guests', g.name + (g.subscribed ? ' was unsubscribed from guest emails.' : ' was subscribed to guest emails.'), g.id); BB.act.updateGuest(g.id, { subscribed: !g.subscribed }); },
    'gu-msg': (inst, v, el) => { const t = BB.act.openThread(v, el.dataset.bid || null); nav(inst, 'inbox', t.id); },
    'gu-offer': (inst, v) => {
      const g = BB.q.guest(v); const st = BB.q.guestBookings(v); const pid = (st[0] || {}).propertyId || S().properties[0].id;
      inst.set({ gu_offer: { gid: v, propertyId: pid, pct: '10', code: first(g.name).toUpperCase().replace(/[^A-Z]/g, '') + 'BACK10' }, gu_sent: null });
    },
    'gu-offer-x': inst => inst.set({ gu_offer: null }),
    'gu-offer-send': inst => { const o = inst.st.gu_offer; const r = BB.act.sendGuestOffer(o.gid, o); if (r) { inst.st.gu_offer = null; inst.set({ gu_sent: { gid: o.gid, thread: r.thread.id, code: r.code } }); BB.toast('Offer sent with code ' + r.code, 'good'); } },
    'gu-offer-pct': (inst, v) => { const o = inst.st.gu_offer; o.code = o.code.replace(/\d+$/, '') + v; o.pct = v; inst.render(); },
    'gu-book': inst => nav(inst, 'calendar'),
    /* campaigns */
    'cp-new': (inst, v) => { inst.st.cp_tpl = v || 'gap'; inst.st.cp_for = null; nav(inst, 'campaign', 'new'); },
    'cp-open': (inst, v) => nav(inst, 'campaign', v),
    'cp-tpl': (inst, v) => { const e = inst.st.cp_edit; Object.assign(e, template(v)); inst.set({ cp_conf: false, cp_err: null }); },
    'cp-sms': inst => { inst.st.cp_edit.sms = !inst.st.cp_edit.sms; inst.render(); },
    'cp-save': inst => { const id = saveEdit(inst); if (id) BB.toast('Draft saved'); },
    'cp-send': inst => { const e = inst.st.cp_edit; const err = !e.subject.trim() ? 'Add a subject line first.' : !e.heading.trim() ? 'Add a heading first.' : null; inst.set({ cp_conf: !err, cp_err: err }); },
    'cp-cancel': inst => inst.set({ cp_conf: false }),
    'cp-confirm': inst => {
      const id = saveEdit(inst, true); if (!id) return; inst.st.cp_conf = false;
      BB.act.sendCampaign(id, { sms: !!inst.st.cp_edit.sms }); BB.toast('Campaign sent', 'good');
    },
    'cp-sim': (inst, v) => {
      const c = S().campaigns.find(x => x.id === v); const before = new Set(S().bookings.map(b => b.id));
      const made = BB.act.simulateCampaign(v);
      const ids = S().bookings.filter(b => !before.has(b.id)).map(b => b.id);
      inst.set({ cp_sim: { id: v, made, ids, stripe: BB.q.connected('stripe') } });
      BB.toast(made ? made + (made === 1 ? ' guest' : ' guests') + ' booked with ' + c.body.promo : 'No bookings this time', made ? 'good' : '');
    },
    /* automations */
    'au-toggle': (inst, v) => BB.act.toggleAutomation(v),
    /* website */
    'ws-pid': (inst, v) => inst.set({ ws_pid: v, ws_pub: null, ws_faq_open: false }),
    'ws-theme': (inst, v) => { wsDraft(inst).theme = v; inst.render(); },
    'ws-pets': inst => { const d = wsDraft(inst), p = BB.q.property(inst.st.ws_pid); d.petsAllowed = !('petsAllowed' in d ? d.petsAllowed : p.petsAllowed); inst.render(); },
    'ws-publish': inst => {
      const pid = inst.st.ws_pid, p = BB.q.property(pid), d = wsDraft(inst), patch = wsPatch(p, d);
      if (!Object.keys(patch).length) return;
      BB.act.updateProperty(pid, patch); inst.st.ws_d[pid] = {}; inst.set({ ws_pub: pid }); BB.toast('Published to ' + p.domain, 'good');
    },
    'ws-ph-del': (inst, v) => { const p = BB.q.property(inst.st.ws_pid); const ph = (p.photos || []).slice(); ph.splice(+v, 1); BB.act.updateProperty(p.id, { photos: ph }); BB.toast('Photo removed'); },
    'ws-ph-cover': (inst, v) => { const p = BB.q.property(inst.st.ws_pid); const ph = (p.photos || []).slice(); const [x] = ph.splice(+v, 1); ph.unshift(x); BB.act.updateProperty(p.id, { photos: ph }); BB.toast('Cover photo changed'); },
    'dom-edit': (inst, v) => inst.set({ dom_edit: v, dom_err: null }),
    'dom-cancel': inst => inst.set({ dom_edit: null, dom_err: null }),
    'dom-check': (inst, v) => domainCall(inst, v, '/app/domain/check', {}),
    'dom-remove': (inst, v) => domainCall(inst, v, '/app/domain', { domain: '' }),
    'dom-copy': (inst, v, a) => BB.copy(v, a.previousElementSibling),
    'ws-discard': inst => { inst.st.ws_d[inst.st.ws_pid] = {}; inst.render(); },
    'ws-page': (inst, v) => inst.set({ ws_page: v }),
    'ws-faq': inst => inst.set({ ws_faq_open: !inst.st.ws_faq_open, ws_faq_err: null }),
    /* ai */
    'ai-do': (inst, v) => { const before = BB.aiScore().score; BB.act.completeAiTask(v); const after = BB.aiScore().score; inst.set({ ai_delta: after - before }); BB.toast('Done. Visibility score is now ' + after, 'good'); },
    'ai-q': (inst, v) => inst.set({ ai_q: +v }),
    'ai-run': inst => { if (S().live && !((BB.BOOT && BB.BOOT.aiEngines) || []).length) { BB.toast('AI checks are not switched on for this server yet', 'bad'); return; } BB.act.runAiCheck(); BB.toast(S().live ? 'Asking AI assistants now. Results show here in a minute or two.' : 'Checked ' + S().ai.questions.length + ' questions on ChatGPT, Gemini, Perplexity and Google'); },
    /* connections */
    'cn-toggle': (inst, v) => {
      const i = BB.q.integration(v);
      if (S().live && v === 'lock' && !i.connected) { inst.set({ cn_open: inst.st.cn_open === 'lock' ? null : 'lock' }); return; }
      if (S().live && i.addon && !i.connected) { inst.set({ cn_open: inst.st.cn_open === v ? null : v }); return; }
      if (i.connected && CN[v] && (CN[v].off || CN[v].stop) && inst.st.cn_conf !== v) { inst.set({ cn_conf: v }); return; }
      inst.st.cn_conf = null; BB.act.toggleIntegration(v); BB.toast(i.addon ? (i.connected ? 'Calendar sync is on for your ' + i.name + '. We check it every few minutes.' : 'Calendar sync stopped for your ' + i.name) : (i.connected ? i.name + ' connected' : i.name + ' disconnected'), i.connected ? 'good' : '');
    },
    'cn-keep': inst => inst.set({ cn_conf: null }),
    'cn-nuki': async (inst, v, el) => {
      const inp = document.getElementById(el.dataset.el); const token = inp ? inp.value.trim() : ''; if (!token) { BB.toast('Paste your Nuki API token first', 'bad'); return; }
      inst.set({ cn_busy: true });
      try { const j = await BB.api.call('/app/nuki', { token }); BB.api.accept(j); inst.st.cn_open = null; BB.toast('Nuki connected. Found ' + j.locks.length + (j.locks.length === 1 ? ' lock' : ' locks'), 'good'); }
      catch (e) { BB.toast(e.message, 'bad'); }
      inst.set({ cn_busy: false });
    },
    'cn-open': (inst, v) => inst.set({ cn_open: inst.st.cn_open === v ? null : v }),
    'cn-cal-save': (inst, v, el) => {
      const inp = document.getElementById(el.dataset.el); const url = inp ? inp.value.trim() : '';
      if (url && !/^(https?|webcal):\/\/\S+$/i.test(url)) { BB.toast('That does not look like a calendar link. It should start with https:// or webcal://', 'bad'); return; }
      BB.act.setCalendarLink(v, el.dataset.pid, url.replace(/^webcal:/i, 'https:')); inst.st.cn_open = null;
      BB.toast(url ? 'Saved. We will check it every few minutes.' : 'Calendar link removed', url ? 'good' : '');
    },
    'cn-api': async (inst, v) => {
      const info = CN[v] || {}; const creds = {}; let missing = null;
      (info.fields || []).forEach(([k, label]) => { const inp = document.getElementById(ID(inst, 'api-' + v + '-' + k)); creds[k] = inp ? inp.value.trim() : ''; if (!creds[k] && !missing) missing = label; });
      if (missing) { BB.toast('Add your ' + missing.toLowerCase() + ' first', 'bad'); return; }
      inst.set({ cn_busy: v });
      try { const j = await BB.api.call('/app/channel/connect', { id: v, creds }); BB.api.accept(j); inst.st.cn_open = null; BB.toast(BB.q.integration(v).name + ' connected. Found ' + j.listings.length + (j.listings.length === 1 ? ' listing' : ' listings'), 'good'); }
      catch (e) { BB.toast(e.message, 'bad'); }
      inst.set({ cn_busy: false });
    },
    'cn-map': (inst, v, el) => { const r = BB.act.mapChannelListing(v, el.dataset.pid, el.value); if (r && r.ok === false && r.error) BB.toast(r.error, 'bad'); else BB.toast(el.value ? 'Linked. Syncing now.' : 'Unlinked', el.value ? 'good' : ''); },
    'cn-copy': (inst, v, el) => BB.copy(v, document.getElementById(el.dataset.el)),
    'cn-sync': (inst, v) => {
      const k = BB.act.syncChannel(v); const i = BB.q.integration(v);
      if (S().live) { BB.toast('Checking your ' + i.name + ' calendar links now'); return; }
      inst.set({ cn_res: { id: v, blk: k ? { pid: k.propertyId, from: k.from, to: k.to, note: k.note } : null } });
      BB.toast(k ? k.note + ': ' + BB.q.property(k.propertyId).short + ', ' + D.fmt(k.from) + ' – ' + D.fmt(k.to) + '. Blocked on your sites.' : 'Your ' + i.name + ' has no new dates.', k ? 'good' : '');
    },
    'cn-syncall': inst => {
      if (S().live) { S().integrations.filter(i => i.addon && i.connected).forEach(i => BB.act.syncChannel(i.id)); BB.toast('Checking your calendar links now'); return; }
      let got = []; S().integrations.filter(i => i.addon && i.connected).forEach(i => { const k = BB.act.syncChannel(i.id); if (k) got.push({ pid: k.propertyId, from: k.from, to: k.to, note: k.note }); });
      inst.set({ cn_res: { id: 'all', blks: got } });
      BB.toast(got.length ? 'Blocked ' + got.length + (got.length === 1 ? ' stay' : ' stays') + ' booked elsewhere' : 'Calendars checked. No new dates.', got.length ? 'good' : '');
    },
  };

  /* =====================================================================
     GUESTS (CRM list)
     ===================================================================== */
  const TAGS = ['Repeat', 'Family', 'Pet owner', 'Couple', 'Remote work', 'VIP', 'Hot tub fan'];
  V.guests = Object.assign({
    label: 'Guests', group: 'Grow', icon: 'users', order: 10,
    render(inst) {
      const s = S(), st = inst.st; const seg = st.gu_seg || 'all', q = (st.gu_q || '').trim().toLowerCase(), sort = st.gu_sort || 'last';
      const idx = guestIndex(); const segs = BB.q.segments();
      const withStays = idx.filter(x => x.n > 0);
      const subPct = s.guests.filter(g => g.subscribed).length / Math.max(1, s.guests.length);
      const repeat = withStays.filter(x => x.n >= 2).length / Math.max(1, withStays.length);
      const avgLife = sum(withStays, x => x.life) / Math.max(1, withStays.length);
      const foundSearch = withStays.filter(x => ['google', 'ai'].includes(srcKey(x.stays[0]))).length;
      let rows = idx;
      if (seg !== 'all') { const ids = new Set(segs[seg].guests.map(g => g.id)); rows = rows.filter(x => ids.has(x.g.id)); }
      if (q) rows = rows.filter(x => (x.g.name + ' ' + x.g.email + ' ' + x.g.city + ' ' + x.g.tags.join(' ')).toLowerCase().includes(q));
      const cmp = { last: (a, b) => ((b.next || b.last || {}).checkIn || '').localeCompare((a.next || a.last || {}).checkIn || ''), life: (a, b) => b.life - a.life, stays: (a, b) => b.n - a.n || b.life - a.life, name: (a, b) => a.g.name.localeCompare(b.g.name) }[sort];
      rows = rows.slice().sort(cmp); const total = rows.length; const more = !st.gu_all && !q && total > 15; if (more) rows = rows.slice(0, 12);
      const chips = [['all', 'Everyone', s.guests.length]].concat(Object.keys(segs).map(k => [k, segs[k].label, segs[k].guests.length]));
      return wrap(inst, 'ag-guests',
        vh('Guests', 'Everyone who has stayed with you, in one list you own. No platform keeps them from you.',
          '<button class="btn" data-ag="gu-imp">' + I('upload') + 'Upload contacts</button>' + '<button class="btn" data-ag="cp-new" data-v="season">' + I('mail') + 'Email a segment</button><button class="btn primary" data-ag="gu-book">' + I('plus') + 'New booking</button>') +
        '<div class="ag-kpis">' + kpi('Total guests', s.guests.length, foundSearch + ' found you on Google or AI') + kpi('Subscribed', pct(subPct), 'Can receive your emails') + kpi('Repeat rate', pct(repeat), 'Stayed 2 or more times', 'up') + kpi('Avg lifetime value', money(Math.round(avgLife)), 'Per guest with a stay') + '</div>' +
        '<section class="a-card ag-card ag-pad0">' +
          '<div class="ag-toolbar"><label class="ag-search">' + I('search') + '<input id="' + ID(inst, 'gq') + '" data-agf="gu.q" type="search" placeholder="Search name, email, city or tag" value="' + esc(st.gu_q || '') + '" aria-label="Search guests"></label>' +
            '<div class="ag-sortsel"><span class="eyebrow">Sort</span><div class="seg" role="group" aria-label="Sort guests">' + [['last', 'Recent'], ['life', 'Value'], ['stays', 'Stays'], ['name', 'Name']].map(([k, t]) => '<button type="button" data-ag="gu-sort" data-v="' + k + '" aria-pressed="' + (sort === k) + '">' + t + '</button>').join('') + '</div></div></div>' +
          '<div class="ag-chips" id="' + ID(inst, 'gchips') + '" role="group" aria-label="Segments">' + chips.map(([k, t, n]) => '<button type="button" class="chip" data-ag="gu-seg" data-v="' + k + '" aria-pressed="' + (seg === k) + '">' + esc(t) + '<span class="num">' + n + '</span></button>').join('') + '</div>' +
          (rows.length ? '<div class="tblwrap" id="' + ID(inst, 'gtbl') + '"><table class="tbl ag-gtbl"><thead><tr><th>Guest</th><th class="ag-c-city">City</th><th class="num ag-r">Stays</th><th class="num ag-r">Lifetime</th><th class="ag-c-last">Last stay</th><th class="ag-c-tags">Tags</th><th class="ag-c-sub">Emails</th></tr></thead><tbody>' +
            rows.map(x => {
              const g = x.g; const lastB = x.stays.length ? x.stays[x.stays.length - 1] : null;
              return '<tr data-open data-ag="gu-open" data-v="' + g.id + '" tabindex="0"><td><div class="ag-who">' + BB.avatar(g.name, 'sm') + '<div><b>' + esc(g.name) + '</b><small>' + esc(g.email) + '</small></div></div></td>' +
                '<td class="ag-c-city">' + esc(g.city || '—') + '</td><td class="num ag-r">' + (x.n + (g.stays || 0)) + '</td><td class="num ag-r"><b>' + money(x.life) + '</b></td>' +
                '<td class="ag-c-last">' + (x.next ? '<span class="ag-next">Next ' + D.fmt(x.next.checkIn) + '</span>' : x.last ? '<span class="num">' + D.fmt(x.last.checkIn, { year: 'numeric' }) + '</span>' : g.lastStay ? '<span class="num">' + D.fmt(g.lastStay, { year: 'numeric' }) + '</span>' : '<span class="muted">No stays yet</span>') + (lastB ? '<div>' + srcTag(lastB) + '</div>' : '') + '</td>' +
                '<td class="ag-c-tags">' + (g.tags.length ? g.tags.slice(0, 3).map(t => '<span class="ag-tag">' + esc(t) + '</span>').join('') : '<span class="muted">—</span>') + '</td>' +
                '<td class="ag-c-sub">' + (g.subscribed ? BB.pill('good', 'Subscribed') : BB.pill('muted', 'Not subscribed')) + '</td></tr>';
            }).join('') + '</tbody></table></div>'
          : '<div class="a-empty ag-empty">' + I('search') + '<b>No guests match</b><p>Try another name or clear the segment filter.</p></div>') +
          (more ? '<button type="button" class="ag-more" data-ag="gu-all">Show all ' + total + ' guests' + I('chev') + '</button>' : '') + '<p class="ag-foot muted">' + (more ? rows.length + ' of ' + total + ' shown. ' : '') + total + ' of ' + s.guests.length + ' guests' + (seg !== 'all' ? ' in "' + esc(segs[seg].label) + '"' : '') + '. Segments only count guests who subscribed to emails.</p>' +
        '</section>');
    },
  }, hooks);

  /* =====================================================================
     CONTACTS (everyone on the host's list, plus "Upload contacts": CSV, column mapping, dedupe by email or phone)
     ===================================================================== */
  const CTX = () => BB.contacts;
  const CT_TEMPLATE = 'data:text/csv;charset=utf-8,' + encodeURIComponent('First name,Last name,Email,Phone,Town,Last stay,Stays,Tags,Agreed to emails\nKim,Lee,kim@example.co.uk,07700 900123,Leeds,14/08/2026,2,Family,yes\n');
  function ctLoad(inst, text, file) {
    const cells = CTX().parse(text); const st = inst.st;
    if (!cells.length) { inst.set({ ct_err: 'That file has no rows we could read. Save it from your spreadsheet as CSV and try again.' }); return; }
    const head = CTX().hasHeader(cells);
    const width = Math.min(30, Math.max.apply(null, cells.slice(0, 50).map(r => r.length)));
    const hrow = head ? cells[0] : [];
    st.ct_cells = cells; st.ct_file = file || ''; st.ct_head = head; st.ct_err = null;
    st.ct_map = CTX().guess(Array.from({ length: width }, (_, i) => hrow[i] || ''), cells.slice(head ? 1 : 0, 25));
    if (!head && !st.ct_map.some(Boolean)) st.ct_map = ['name', 'email', 'phone', 'lastStay'].concat(Array(Math.max(0, width - 4)).fill('')).slice(0, width);
    st.ct_step = 'map'; inst.render();
  }
  const ctRows = st => CTX().apply(st.ct_cells.slice(st.ct_head ? 1 : 0), st.ct_map);
  function ctPick(inst) {
    const st = inst.st;
    return '<div class="ag-form">' +
      '<label class="ag-drop" data-ctdrop><input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" data-ctfile class="ag-sr">' + I('upload') +
        '<b>Choose a CSV file or drop it here</b><span class="muted">From Excel, Google Sheets, Numbers, Airbnb, your booking system or your old mailing list. Up to ' + CTX().MAX.toLocaleString('en-GB') + ' contacts at a time.</span></label>' +
      '<details class="ag-paste"' + (st.ct_paste ? ' open' : '') + '><summary>Or paste rows from a spreadsheet</summary>' +
        '<label class="field"><span>Contacts</span><textarea id="' + ID(inst, 'ctp') + '" data-ctpaste rows="5" placeholder="Name,Email,Phone&#10;Kim Lee,kim@example.co.uk,07700 900123">' + esc(st.ct_paste || '') + '</textarea></label>' +
        '<div class="ag-acts-row"><button class="btn" data-ag="ct-paste"' + ((st.ct_paste || '').trim() ? '' : ' disabled') + '>Use these rows</button></div></details>' +
      (st.ct_err ? '<p class="ag-err" role="alert">' + esc(st.ct_err) + '</p>' : '') +
      '<p class="muted ag-p">Any columns work. You choose what each one is on the next step. <a href="' + CT_TEMPLATE + '" download="contacts-template.csv">Download a template</a></p></div>';
  }
  function ctMapStep(inst) {
    const st = inst.st, cells = st.ct_cells, body = cells.slice(st.ct_head ? 1 : 0);
    const has = f => st.ct_map.includes(f);
    const ok = has('email') || has('phone');
    const opts = cur => '<option value="">Don’t import</option>' + CTX().FIELDS.map(([k, t]) => '<option value="' + k + '"' + (cur === k ? ' selected' : '') + '>' + t + '</option>').join('');
    return '<div class="ag-form">' +
      '<p class="ag-note">' + I('list') + '<span><b>' + body.length.toLocaleString('en-GB') + ' row' + (body.length === 1 ? '' : 's') + (st.ct_file ? ' in ' + esc(st.ct_file) : '') + '.</b> We guessed what each column is. Check them, and set any you don’t need to “Don’t import”.' + (body.length > CTX().MAX ? ' Only the first ' + CTX().MAX.toLocaleString('en-GB') + ' will be uploaded this time.' : '') + '</span></p>' +
      '<button type="button" class="g-check ag-consent" role="checkbox" aria-checked="' + !!st.ct_head + '" data-ag="ct-head"><span class="ag-box">' + (st.ct_head ? I('check') : '') + '</span><span>The first row is column headings</span></button>' +
      '<div class="tblwrap"><table class="tbl ag-ctmap"><thead><tr><th>Column in your file</th><th>Examples</th><th>Upload as</th></tr></thead><tbody>' +
        st.ct_map.map((f, i) => {
          const ex = body.slice(0, 3).map(r => r[i] || '').filter(Boolean);
          return '<tr' + (f ? '' : ' class="ag-off"') + '><td><b>' + esc(st.ct_head ? (cells[0][i] || 'Column ' + (i + 1)) : 'Column ' + (i + 1)) + '</b></td><td class="ag-ctex">' + (ex.length ? ex.map(v => '<span>' + esc(v.slice(0, 40)) + '</span>').join('') : '<span class="muted">Empty</span>') + '</td>' +
            '<td><select id="' + ID(inst, 'ctm' + i) + '" data-ctmap="' + i + '" aria-label="Upload column ' + (i + 1) + ' as">' + opts(f) + '</select></td></tr>';
        }).join('') + '</tbody></table></div>' +
      (ok ? '' : '<p class="ag-err" role="alert">Choose which column holds the email or the phone number. We need one of them to know who is who.</p>') +
      '<div class="ag-acts-row"><button class="btn ghost" data-ag="ct-back" data-v="pick">' + I('back') + 'Choose another file</button><button class="btn primary" data-ag="ct-next"' + (ok ? '' : ' disabled') + '>Check for duplicates' + I('arrow') + '</button></div></div>';
  }
  function ctReview(inst) {
    const st = inst.st, plan = st.ct_plan; const consentCol = st.ct_map.includes('consent');
    const lab = { new: ['good', 'New'], update: ['info', 'Already here'], dupe: ['muted', 'Duplicate row'], skip: ['warn', 'Skipped'] };
    const why = e => e.status === 'update' ? 'Matched by ' + e.by + ' to ' + esc((BB.q.guest(e.guestId) || {}).name || 'a contact') : e.status === 'dupe' ? 'Same person as row ' + (e.of + 1 + (st.ct_head ? 1 : 0)) + ', merged' : e.status === 'skip' ? esc(e.why) : '';
    const show = plan.rows.filter(e => e.status !== 'new').slice(0, 6).concat(plan.rows.filter(e => e.status === 'new').slice(0, 4)).sort((a, b) => a.row - b.row).slice(0, 8);
    return '<div class="ag-form">' +
      '<div class="ag-kpis ag-ctk">' + kpi('New contacts', plan.added.toLocaleString('en-GB'), 'Will be added') + kpi('Already here', plan.updated.toLocaleString('en-GB'), 'Matched by email or phone, blanks filled in') +
        kpi('Duplicate rows', plan.duplicates.toLocaleString('en-GB'), 'Same person twice in the file, merged') + kpi('Skipped', plan.invalid.toLocaleString('en-GB'), 'No valid email or phone') + '</div>' +
      (show.length ? '<div class="tblwrap"><table class="tbl ag-ctrev"><thead><tr><th>Row</th><th>Contact</th><th>What happens</th></tr></thead><tbody>' + show.map(e => '<tr><td class="num">' + (e.row + 1 + (st.ct_head ? 1 : 0)) + '</td><td><b>' + esc(e.c.name || '—') + '</b><small>' + esc([e.c.email, e.c.phone].filter(Boolean).join(' · ') || 'No contact details') + '</small></td><td>' + BB.pill(lab[e.status][0], lab[e.status][1]) + ' <span class="muted">' + why(e) + '</span></td></tr>').join('') + '</tbody></table></div>' : '') +
      (consentCol ? '<p class="ag-note">' + I('check') + '<span>Your <b>Agreed to emails</b> column decides who is subscribed. Rows that say yes are subscribed, the rest are not.</span></p>'
        : '<button type="button" class="g-check ag-consent" role="checkbox" aria-checked="' + !!st.ct_consent + '" data-ag="ct-consent"><span class="ag-box">' + (st.ct_consent ? I('check') : '') + '</span><span>These people agreed to hear from me by email (for example they ticked a box when they booked or signed up). Subscribe them to my emails.</span></button>') +
      '<button type="button" class="g-check ag-consent" role="checkbox" aria-checked="' + !!st.ct_sms + '" data-ag="ct-sms"><span class="ag-box">' + (st.ct_sms ? I('check') : '') + '</span><span>They also agreed to get texts from me.</span></button>' +
      '<p class="muted ag-p">Anyone who unsubscribed before stays unsubscribed, whatever the file says.</p>' +
      '<label class="field ag-cttag"><span>Tag this upload (optional)</span><input id="' + ID(inst, 'ctt') + '" data-agf="ct.tag" maxlength="24" placeholder="For example Newsletter 2025" value="' + esc(st.ct_tag || '') + '"></label>' +
      '<div class="ag-acts-row"><button class="btn ghost" data-ag="ct-back" data-v="map">' + I('back') + 'Back to columns</button><button class="btn primary" data-ag="ct-go"' + (plan.added + plan.updated ? '' : ' disabled') + '>' + I('upload') + 'Upload ' + (plan.added + plan.updated).toLocaleString('en-GB') + ' contact' + (plan.added + plan.updated === 1 ? '' : 's') + '</button></div></div>';
  }
  function ctDone(inst) {
    const r = inst.st.ct_res;
    return '<div class="ag-form"><div class="ag-banner good">' + I('check') + '<div><p><b>' + r.added.toLocaleString('en-GB') + ' new contact' + (r.added === 1 ? '' : 's') + ' added</b>' + (r.updated ? ', ' + r.updated.toLocaleString('en-GB') + ' already here updated' : '') + (r.duplicates ? ', ' + r.duplicates + ' duplicate row' + (r.duplicates === 1 ? '' : 's') + ' merged' : '') + (r.skipped ? ', ' + r.skipped + ' skipped' : '') + '.</p>' +
      '<p class="muted">' + (r.subscribed ? r.subscribed.toLocaleString('en-GB') + ' can now get your emails. Send to “Everyone on your list”, or to past guests if you added their last stay.' : 'Nobody new was subscribed, so campaigns will not go to them.') + '</p></div></div>' +
      '<div class="ag-acts-row">' + (r.subscribed ? '<button class="btn primary" data-ag="ct-email">' + I('mail') + 'Email your list</button>' : '') + '<button class="btn" data-ag="ct-up">' + I('upload') + 'Upload more</button><button class="btn ghost" data-ag="ct-x">Done</button></div></div>';
  }
  function ctPanel(inst) {
    const st = inst.st, step = st.ct_step;
    const steps = [['pick', 'Choose file'], ['map', 'Match columns'], ['review', 'Check and upload']];
    const at = steps.findIndex(x => x[0] === step);
    return '<section class="a-card ag-card ag-imp ag-ctup" aria-label="Upload contacts"><div class="a-card-h"><h3>Upload contacts</h3><button class="btn sm ghost" data-ag="ct-x">' + I('x') + 'Close</button></div>' +
      (step !== 'done' ? '<ol class="ag-steps">' + steps.map(([k, t], i) => '<li class="' + (i < at ? 'done' : i === at ? 'on' : '') + '"' + (i === at ? ' aria-current="step"' : '') + '><span class="num">' + (i < at ? I('check') : i + 1) + '</span>' + t + '</li>').join('') + '</ol>' : '') +
      (step === 'pick' ? ctPick(inst) : step === 'map' ? ctMapStep(inst) : step === 'review' ? ctReview(inst) : ctDone(inst)) + '</section>';
  }
  const CT_FILTERS = [['all', 'Everyone'], ['subscribed', 'Subscribed'], ['stayed', 'Has stayed'], ['nostay', 'No stay yet'], ['imported', 'Imported'], ['nosub', 'Not subscribed']];
  V.contacts = Object.assign({
    label: 'Contacts', group: 'Grow', icon: 'user', order: 12,
    render(inst) {
      const s = S(), st = inst.st; const f = st.ct_f || 'all', q = (st.ct_q || '').trim().toLowerCase();
      const idx = guestIndex();
      const stayed = x => x.n > 0 || !!x.g.lastStay;
      const test = { all: () => true, subscribed: x => x.g.subscribed && x.g.email, stayed, nostay: x => !stayed(x), imported: x => x.g.source === 'import', nosub: x => !x.g.subscribed };
      let rows = idx.filter(test[f] || test.all);
      if (q) rows = rows.filter(x => [x.g.name, x.g.email, x.g.phone, x.g.city].concat(x.g.tags || []).join(' ').toLowerCase().includes(q));
      rows = rows.slice().sort((a, b) => (b.g.firstSeen || b.g.createdAt || '').localeCompare(a.g.firstSeen || a.g.createdAt || '') || a.g.name.localeCompare(b.g.name));
      const total = rows.length; const more = !st.ct_all && total > 50; if (more) rows = rows.slice(0, 50);
      const subs = idx.filter(test.subscribed).length, up = idx.filter(test.imported).length, phoneOnly = idx.filter(x => !x.g.email && x.g.phone).length;
      return wrap(inst, 'ag-guests ag-contacts',
        vh('Contacts', 'Everyone you can reach: guests who booked, people from your funnels and anyone you upload. One list you own.',
          '<button class="btn" data-ag="ct-email">' + I('mail') + 'Email your list</button><button class="btn primary" data-ag="ct-up">' + I('upload') + 'Upload contacts</button>') +
        (st.ct_step ? ctPanel(inst) : '') +
        '<div class="ag-kpis">' + kpi('Contacts', s.guests.length.toLocaleString('en-GB'), idx.filter(stayed).length + ' have stayed with you') + kpi('Subscribed', subs.toLocaleString('en-GB'), 'Can get your emails') +
          kpi('Imported', up.toLocaleString('en-GB'), 'From your own lists') + kpi('Phone only', phoneOnly.toLocaleString('en-GB'), 'No email address yet') + '</div>' +
        '<section class="a-card ag-card ag-pad0">' +
          '<div class="ag-toolbar"><label class="ag-search">' + I('search') + '<input id="' + ID(inst, 'ctq') + '" data-agf="ct.q" type="search" placeholder="Search name, email, phone, town or tag" value="' + esc(st.ct_q || '') + '" aria-label="Search contacts"></label></div>' +
          '<div class="ag-chips" role="group" aria-label="Filter contacts">' + CT_FILTERS.map(([k, t]) => '<button type="button" class="chip" data-ag="ct-f" data-v="' + k + '" aria-pressed="' + (f === k) + '">' + t + '<span class="num">' + idx.filter(test[k]).length + '</span></button>').join('') + '</div>' +
          (rows.length ? '<div class="tblwrap"><table class="tbl ag-gtbl ag-cttbl"><thead><tr><th>Contact</th><th class="ag-c-city">Phone</th><th class="ag-c-last">Source</th><th class="num ag-r">Stays</th><th class="ag-c-tags">Tags</th><th class="ag-c-sub">Emails</th></tr></thead><tbody>' +
            rows.map(x => { const g = x.g; const n = x.n + (g.stays || 0);
              return '<tr data-open data-ag="gu-open" data-v="' + g.id + '" tabindex="0"><td><div class="ag-who">' + BB.avatar(g.name, 'sm') + '<div><b>' + esc(g.name) + '</b><small>' + esc(g.email || 'No email') + '</small></div></div></td>' +
                '<td class="ag-c-city num">' + esc(g.phone || '—') + '</td><td class="ag-c-last">' + (g.source === 'import' ? '<span class="ag-tag">Imported</span>' : g.source === 'funnel' ? 'Funnel sign-up' : esc(BB.SOURCE[g.source] || (x.n ? 'Booking' : 'Sign-up'))) + '</td>' +
                '<td class="num ag-r">' + (n || '<span class="muted">0</span>') + '</td><td class="ag-c-tags">' + ((g.tags || []).length ? g.tags.slice(0, 3).map(t => '<span class="ag-tag">' + esc(t) + '</span>').join('') : '<span class="muted">—</span>') + '</td>' +
                '<td class="ag-c-sub">' + (g.subscribed && g.email ? BB.pill('good', 'Subscribed') : g.unsubscribedAt ? BB.pill('warn', 'Unsubscribed') : BB.pill('muted', 'Not subscribed')) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : '<div class="a-empty ag-empty">' + I(s.guests.length ? 'search' : 'users') + (s.guests.length ? '<b>No contacts match</b><p>Try another search or filter.</p>' : '<b>No contacts yet</b><p>Upload a CSV of past guests or your mailing list to get started.</p><button class="btn primary" data-ag="ct-up">' + I('upload') + 'Upload contacts</button>') + '</div>') +
          (more ? '<button type="button" class="ag-more" data-ag="ct-all">Show all ' + total.toLocaleString('en-GB') + ' contacts' + I('chev') + '</button>' : '') +
          '<p class="ag-foot muted">' + (more ? rows.length + ' of ' + total.toLocaleString('en-GB') + ' shown. ' : '') + 'Uploads match people already here by email, then by phone number, so nobody is added twice.</p>' +
        '</section>');
    },
  }, hooks);

  /* =====================================================================
     GUEST (profile)
     ===================================================================== */
  V.guest = Object.assign({
    label: 'Guest', group: 'Grow', icon: 'user', hidden: true,
    render(inst) {
      const s = S(), st = inst.st; const g = BB.q.guest(st.id);
      if (!g) return wrap(inst, 'ag-guest', vh('Guest not found', 'This guest may have been removed.', '', ['guests', 'Guests']));
      const stays = BB.q.guestBookings(g.id); // newest first
      const live = stays.filter(b => b.status !== 'cancelled' && b.status !== 'request');
      const life = BB.q.lifetime(g.id);
      const reviews = live.filter(b => b.review); const avgR = reviews.length ? sum(reviews, b => b.review.stars) / reviews.length : 0;
      const asc = live.slice().reverse(); const firstStay = asc[0];
      const direct = live.filter(b => b.channel === 'direct');
      const saved = sum(direct, b => Math.round(b.total * BB.PLATFORM_FEE.airbnb));
      const t = s.threads.find(x => x.guestId === g.id);
      let journey = '';
      if (firstStay) {
        const after = asc.slice(1); const cnt = {}; after.forEach(b => { const k = srcKey(b); cnt[k] = (cnt[k] || 0) + 1; });
        const top = Object.keys(cnt).sort((a, b) => cnt[b] - cnt[a])[0];
        const when = D.fmt(firstStay.checkIn, { day: undefined, month: 'short', year: 'numeric' });
        journey = '<div class="ag-journey' + (after.length ? ' good' : '') + '">' + I(after.length ? 'heart' : 'spark') + '<p>Found you through <b>' + FOUND[srcKey(firstStay)] + '</b> in ' + when + '. ' +
          (after.length ? 'Has booked direct ' + after.length + (after.length === 1 ? ' time' : ' times') + ' since, ' + (after.length > 1 ? 'mostly ' : '') + MOSTLY[top] + '. ' : 'One stay so far. A come-back offer is the easiest next booking. ') +
          'You kept <b>' + money(saved) + '</b> you would have paid in Airbnb host fees.</p></div>';
      }
      const suggest = TAGS.filter(x => !g.tags.includes(x)).slice(0, 4);
      const o = st.gu_offer && st.gu_offer.gid === g.id ? st.gu_offer : null;
      const sent = st.gu_sent && st.gu_sent.gid === g.id ? st.gu_sent : null;
      const contact = (lab, val, ic) => '<div class="ag-contact">' + I(ic) + '<div><span class="eyebrow">' + lab + '</span><span class="ag-sel">' + esc(val || 'Not given') + '</span></div>' + (val ? '<button type="button" class="iconbtn" data-ag="gu-copy" data-v="' + esc(val) + '" aria-label="Copy ' + lab.toLowerCase() + '">' + COPY + '</button>' : '') + '</div>';
      const offerP = o && BB.q.property(o.propertyId);
      return wrap(inst, 'ag-guest',
        vh(esc(g.name), esc(g.city || 'City not given') + ' · guest since ' + D.fmt((firstStay || {}).checkIn || g.createdAt, { year: 'numeric' }) + ' · ' + (g.source === 'import' ? 'imported when you joined Bookingbooster' : 'joined via ' + esc(BB.SOURCE[g.source] || g.source)),
          '<button class="btn" data-ag="gu-msg" data-v="' + g.id + '">' + I('inbox') + (t ? 'Open messages' : 'Message ' + esc(first(g.name))) + '</button><button class="btn" data-ag="gu-book">' + I('cal') + 'Create booking</button><button class="btn primary" data-ag="gu-offer" data-v="' + g.id + '">' + I('tag') + 'Send a come-back offer</button>', ['guests', 'All guests']) +
        (o ? '<section class="a-card ag-card ag-offer" aria-label="Come-back offer"><div class="a-card-h"><h3>Come-back offer for ' + esc(first(g.name)) + '</h3><button type="button" class="iconbtn" data-ag="gu-offer-x" aria-label="Close offer">' + I('x') + '</button></div>' +
          '<div class="ag-offer-g"><div class="ag-form">' +
            '<label class="field"><span>Home</span><select id="' + ID(inst, 'ofp') + '" data-agf="of.propertyId">' + s.properties.map(p => '<option value="' + p.id + '"' + (p.id === o.propertyId ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>' +
            '<div class="field"><span>Discount</span><div class="seg" role="group" aria-label="Discount">' + ['10', '15', '20'].map(x => '<button type="button" data-ag="gu-offer-pct" data-v="' + x + '" aria-pressed="' + (o.pct === x) + '">' + x + '% off</button>').join('') + '</div></div>' +
            '<label class="field"><span>Promo code</span><input id="' + ID(inst, 'ofc') + '" data-agf="of.code" class="mono" value="' + esc(o.code) + '" maxlength="16"></label>' +
          '</div><div class="ag-offer-msg"><span class="eyebrow">Sent by email and to the inbox</span><p>Hi ' + esc(first(g.name)) + ', we would love to have you back at ' + esc(offerP.name) + '. Book direct at <u>' + esc(offerP.domain) + '</u> with code <b class="mono">' + esc(String(o.code).toUpperCase()) + '</b> and take ' + o.pct + '% off any dates in the next 6 months.</p>' +
            '<div class="ag-acts-row"><button class="btn primary" data-ag="gu-offer-send">' + I('send') + 'Send offer to ' + esc(first(g.name)) + '</button><button class="btn ghost" data-ag="gu-offer-x">Cancel</button></div></div></div></section>' : '') +
        (sent ? '<div class="ag-banner good">' + I('check') + '<p>Offer sent. Code <b class="mono">' + esc(sent.code) + '</b> now works on every property site.</p><button class="btn sm" data-ag-nav="inbox" data-ag-id="' + sent.thread + '">See it in the inbox</button></div>' : '') +
        '<div class="ag-cols ag-cols-guest">' +
          '<div class="ag-stack">' +
            '<section class="a-card ag-card ag-profile"><div class="ag-prof-h">' + BB.avatar(g.name, 'lg') + '<div><b class="disp">' + esc(g.name) + '</b><span class="muted">' + esc(g.city || '') + '</span></div></div>' +
              contact('Email', g.email, 'mail') + contact('Phone', g.phone, 'phone') +
              '<div class="ag-subrow"><div><b>Guest emails</b><small>' + (g.subscribed ? 'Gets campaigns and offers' : 'Will not get campaigns') + '</small></div>' + sw(g.subscribed, 'data-ag="gu-sub" data-v="' + g.id + '"', 'Subscribed to guest emails') + '</div>' +
              '<div class="ag-tagsbox"><span class="eyebrow">Tags</span><div class="ag-tagrow">' + g.tags.map(x => '<span class="ag-tag ag-tag-x">' + esc(x) + '<button type="button" data-ag="gu-untag" data-v="' + esc(x) + '" data-gid="' + g.id + '" aria-label="Remove tag ' + esc(x) + '">' + I('x') + '</button></span>').join('') +
                '<form data-agform="tag" data-gid="' + g.id + '" class="ag-tagform"><input id="' + ID(inst, 'tag') + '" placeholder="Add tag" aria-label="Add a tag" maxlength="24"><button class="iconbtn" aria-label="Add tag">' + I('plus') + '</button></form></div>' +
                (suggest.length ? '<div class="ag-tagsug">' + suggest.map(x => '<button type="button" data-ag="gu-addtag" data-v="' + esc(x) + '" data-gid="' + g.id + '">+ ' + esc(x) + '</button>').join('') + '</div>' : '') + '</div>' +
              '<label class="field ag-notes"><span>Notes, only you see these</span><textarea id="' + ID(inst, 'notes') + '" data-ag-notes="' + g.id + '" placeholder="Preferences, children, the dog’s name…">' + esc(st.gu_nd && st.gu_nd.gid === g.id ? st.gu_nd.v : g.notes || '') + '</textarea><small class="muted">Saves when you click away.</small></label>' +
            '</section>' +
          '</div>' +
          '<div class="ag-stack">' +
            '<div class="ag-kpis ag-kpis-3">' + kpi('Stays', live.length, live.filter(b => b.status === 'confirmed').length ? live.filter(b => b.status === 'confirmed').length + ' upcoming' : 'All completed') + kpi('Lifetime value', money(life), money(saved) + ' kept vs Airbnb fees') + kpi('Rating given', reviews.length ? avgR.toFixed(1) : '—', reviews.length ? reviews.length + (reviews.length === 1 ? ' review' : ' reviews') : 'No reviews yet') + '</div>' +
            journey +
            card('Stay history', live.length + (live.length === 1 ? ' stay' : ' stays'),
              stays.length ? '<ol class="ag-stays">' + stays.map(b => {
                const p = BB.q.property(b.propertyId);
                return '<li><button type="button" class="ag-stay" data-ag-nav="booking" data-ag-id="' + b.id + '"><span class="ag-stay-d"><b class="num">' + D.fmt(b.checkIn) + '</b><small>' + b.checkIn.slice(0, 4) + '</small></span>' +
                  '<span class="ag-stay-t"><b>' + esc(p.name) + '</b><small>' + D.diff(b.checkIn, b.checkOut) + ' nights · ' + b.adults + (b.adults === 1 ? ' adult' : ' adults') + (b.children ? ', ' + b.children + (b.children === 1 ? ' child' : ' children') : '') + (b.pets ? ', dog' : '') + (b.promo ? ' · code ' + esc(b.promo) : '') + '</small>' + (b.review ? stars(b.review.stars) : '') + '</span>' +
                  '<span class="ag-stay-m">' + srcTag(b) + '<b class="num">' + money(b.total) + '</b>' + BB.statusPill(b) + '</span></button></li>';
              }).join('') + '</ol>' : '<div class="a-empty">No stays yet.</div>') +
            card('Messages', t ? (t.messages.length + (t.messages.length === 1 ? ' message' : ' messages')) : 'No conversation yet',
              t && t.messages.length ? '<div class="ag-lastmsg"><p>“' + esc(t.messages[t.messages.length - 1].text.slice(0, 160)) + '”</p><small class="muted">' + esc(BB.ago(t.messages[t.messages.length - 1].at)) + ' · ' + (t.channel === 'direct' ? 'Guest app and email' : BB.CHANNEL[t.channel] + ' (sync add-on)') + '</small></div><button class="btn sm" data-ag="gu-msg" data-v="' + g.id + '">' + I('inbox') + 'Open in inbox</button>'
                : '<p class="muted ag-p">Start a conversation and it lands in the guest app and their email.</p><button class="btn sm" data-ag="gu-msg" data-v="' + g.id + '">' + I('send') + 'Message ' + esc(first(g.name)) + '</button>') +
          '</div>' +
        '</div>');
    },
  }, hooks);

  /* =====================================================================
     CAMPAIGNS (list)
     ===================================================================== */
  const SEGNAME = k => (BB.q.segments()[k] || {}).label || 'All past guests';
  V.campaigns = Object.assign({
    label: 'Campaigns', group: 'Grow', icon: 'mail', order: 20,
    badge: s => { const n = s.campaigns.filter(c => c.status === 'draft').length; return n || null; },
    render(inst) {
      if (inst.st.id) return V.campaign.render(inst);
      const s = S(); const sent = s.campaigns.filter(c => c.status === 'sent');
      const rec = sum(sent, c => c.recipients), opens = sum(sent, c => c.opens), clicks = sum(sent, c => c.clicks);
      const gap = findGap();
      const statusPill = c => c.status === 'sent' ? BB.pill('good', 'Sent') : c.status === 'scheduled' ? BB.pill('info', 'Scheduled') : BB.pill('muted', 'Draft');
      const order = { draft: 0, scheduled: 1, sent: 2 };
      const list = s.campaigns.slice().sort((a, b) => order[a.status] - order[b.status] || String(b.sentAt).localeCompare(String(a.sentAt)));
      return wrap(inst, 'ag-campaigns',
        vh('Campaigns', 'Emails and texts to guests you already know. Every booking they bring is yours, with no commission.', '<button class="btn primary" data-ag="cp-new" data-v="gap">' + I('plus') + 'New campaign</button>') +
        '<div class="ag-kpis">' + kpi('Campaigns sent', sent.length, rec.toLocaleString() + ' emails delivered') + kpi('Open rate', pct(opens / Math.max(1, rec)), 'Typical UK average is 21%', 'up') + kpi('Click rate', pct(clicks / Math.max(1, rec)), clicks.toLocaleString() + ' clicks') + kpi('Revenue from email', money(sum(sent, c => c.revenue)), sum(sent, c => c.bookings) + ' direct bookings', 'up') + '</div>' +
        '<div class="ag-cols ag-cols-wide">' +
          '<section class="a-card ag-card ag-pad0"><div class="a-card-h ag-pad"><h3>All campaigns</h3><span class="ag-meta">' + s.campaigns.length + ' total</span></div><ul class="ag-clist">' +
            list.map(c => {
              const p = BB.q.property(c.body.propertyId) || s.properties[0];
              return '<li><button type="button" class="ag-crow" data-ag="cp-open" data-v="' + c.id + '"><span class="ag-cico ' + c.status + '">' + I(c.status === 'sent' ? 'check' : c.status === 'scheduled' ? 'clock' : 'edit') + '</span>' +
                '<span class="ag-ct"><span class="ag-ctop">' + statusPill(c) + '<small class="muted">' + (c.status === 'sent' ? 'Sent ' + D.fmt(c.sentAt) : c.status === 'scheduled' ? 'Sends ' + D.fmt(c.sentAt) : 'Not sent') + '</small></span><b>' + esc(c.name) + '</b><small>“' + esc(c.subject) + '” · ' + esc(SEGNAME(c.segment)) + ' · ' + esc(p.short) + (c.body.promo ? ' · <span class="mono">' + esc(c.body.promo) + '</span>' : '') + '</small></span>' +
                (c.status === 'sent' ? '<span class="ag-cstats"><span><small>Sent to</small><b class="num">' + c.recipients + '</b></span><span><small>Opened</small><b class="num">' + pct(c.opens / Math.max(1, c.recipients)) + '</b></span><span><small>Clicked</small><b class="num">' + pct(c.clicks / Math.max(1, c.recipients)) + '</b></span><span><small>Booked</small><b class="num">' + c.bookings + '</b></span><span class="ag-rev"><small>Revenue</small><b class="num">' + money(c.revenue) + '</b></span></span>'
                  : '<span class="ag-cstats ag-cstats-p"><span><small>Will reach</small><b class="num' + (recipients(BB.q.segments(), c.segment) ? '' : ' ag-zero') + '">' + recipients(BB.q.segments(), c.segment) + '</b></span><span class="ag-go">' + (c.status === 'draft' ? 'Finish draft' : 'Review') + I('chev') + '</span></span>') +
                '</button></li>';
            }).join('') + '</ul></section>' +
          '<div class="ag-stack">' +
            card('Start from a template', '', '<div class="ag-tpls">' + TPLS.map(([k, t, d]) => '<button type="button" class="ag-tpl" data-ag="cp-new" data-v="' + k + '"><span class="ag-tpl-i">' + I(TPLI[k]) + '</span><span><b>' + t + '</b><small>' + d + '</small></span>' + I('chev') + '</button>').join('') + '</div>') +
            (gap ? '<section class="ag-idea"><span class="eyebrow">Spotted on your calendar</span><b class="disp">' + gap.n + (gap.n === 1 ? ' empty night' : ' empty nights') + ' at ' + esc(gap.p.short) + ', ' + range(gap.a, gap.b) + '</b><p>Offer them to returning guests at 15% off before you drop the price for everyone.</p><button class="btn accent sm" data-ag="cp-new" data-v="gap">' + I('bolt') + 'Fill the gap</button></section>' : '') +
          '</div>' +
        '</div>');
    },
  }, hooks);

  /* =====================================================================
     CAMPAIGN (editor and results)
     ===================================================================== */
  const TPLS = [['gap', 'Gap nights', 'Fill 1–2 empty nights on your calendar'], ['season', 'Come back next season', 'Past guests get first pick of next year'], ['lastmin', 'Last-minute deal', 'Fill this week at a short-term discount'], ['launch', 'New home launch', 'Introduce a new property to your list']];
  const TPLI = { gap: 'cal', season: 'heart', lastmin: 'bolt', launch: 'home' };
  function template(k) {
    const s = S();
    if (k === 'gap') {
      const g = findGap(); const p = g ? g.p : s.properties[0]; const when = g ? range(g.a, g.b) : 'Two nights';
      return { tpl: k, name: 'Fill the gap nights', subject: when + ' just opened up at ' + p.short, segment: 'repeat', propertyId: p.id, promo: 'GAP15', pct: 15, heading: when + ' just opened up', text: (g && g.n === 1 ? 'One quiet night' : 'Two quiet nights') + ' at ' + p.name + ', and you get first pick. Take 15% off with code GAP15 at checkout.', cta: 'Grab the dates' };
    }
    if (k === 'season') {
      const p = s.properties[0];
      return { tpl: k, name: 'Come back next season', subject: 'Summer at ' + p.short + ' opens to you first', segment: 'past', propertyId: p.id, promo: 'BACK10', pct: 10, heading: 'Your summer week is waiting, {first_name}', text: 'Past guests pick summer 2027 dates before we open them to everyone. Book direct with code BACK10 and keep 10% off.', cta: 'Pick your week' };
    }
    if (k === 'lastmin') {
      const p = freeSoon();
      return { tpl: k, name: 'Last-minute deal', subject: 'This week at ' + p.short + ', 20% off', segment: 'recent', propertyId: p.id, promo: 'LASTMIN20', pct: 20, heading: 'Free this week? ' + p.short + ' is too.', text: p.name + ' has open nights in the next 7 days. You stayed with us this year, so take 20% off with code LASTMIN20, this week only.', cta: 'See open nights' };
    }
    const p = s.properties[s.properties.length - 1];
    return { tpl: k, name: 'Meet ' + p.short, subject: 'Our newest home: ' + p.name, segment: 'past', propertyId: p.id, promo: 'NEWHOME15', pct: 15, heading: 'Meet our newest home, ' + p.name, text: (p.about || p.headline) + ' Be one of the first guests and take 15% off with code NEWHOME15.', cta: 'See the home' };
  }
  const toEdit = c => ({ tpl: null, name: c.name, subject: c.subject, segment: c.segment, propertyId: c.body.propertyId, promo: c.body.promo || '', pct: c.body.pct || S().promos[(c.body.promo || '').toUpperCase()] || 10, heading: c.body.heading, text: c.body.text, cta: c.body.cta, sms: !!c.sms });
  const fromEdit = e => ({ name: e.name.trim() || 'Untitled campaign', subject: e.subject.trim(), segment: e.segment, sms: !!e.sms, body: { heading: e.heading, text: e.text, cta: e.cta || 'Book your stay', propertyId: e.propertyId, promo: (e.promo || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''), pct: Math.max(1, Math.min(50, +e.pct || 10)) } });
  function editFor(inst) {
    const st = inst.st; const id = st.id || 'new';
    if (st.cp_for !== id || !st.cp_edit) {
      const c = S().campaigns.find(x => x.id === id);
      st.cp_edit = c ? toEdit(c) : template(st.cp_tpl || 'gap'); st.cp_for = id;
      if (!c && st.cp_seg) { st.cp_edit.segment = st.cp_seg; st.cp_seg = null; } st.cp_conf = false; st.cp_err = null;
      if (!st.cp_sim || st.cp_sim.id !== id) st.cp_sim = null;
    }
    return st.cp_edit;
  }
  function saveEdit(inst, quiet) {
    const st = inst.st, e = st.cp_edit; const data = fromEdit(e);
    if (st.cp_for && st.cp_for !== 'new') { data.id = st.cp_for; BB.act.saveCampaign(data); if (!quiet) { BB.log('campaign', 'Campaigns', 'Saved the "' + data.name + '" draft.', data.id); BB.store.commit({ type: 'campaign' }); } return data.id; }
    const id = BB.act.saveCampaign(data); st.cp_for = id; st.cp_edit = toEdit(S().campaigns.find(x => x.id === id));
    BB.log('campaign', 'Campaigns', 'Created the "' + data.name + '" draft.', id); BB.store.commit({ type: 'campaign' });
    nav(inst, 'campaign', id); return id;
  }
  function hero(p, cls) {
    const th = p.theme || 'cabin';
    const cover = (p.photos || [])[0];
    if (cover && cover.url) return '<div class="ag-hero ag-hero-ph ' + (cls || '') + '" role="img" aria-label="' + esc(p.name) + '" style="background-image:url(&quot;' + esc(cover.url) + '&quot;)"></div>';
    return '<div class="ag-hero t-' + th + ' ' + (cls || '') + '" style="--hc:' + esc(p.color || '#2F5D46') + '" role="img" aria-label="' + esc(p.name) + '">' +
      (th === 'city' ? '<i class="hill"></i><i class="terr"></i><i class="roof"></i><i class="cornice"></i><i class="wins"></i><i class="doors"></i><i class="street"></i>' : th === 'lake' ? '<i class="sun"></i><i class="land"></i><i class="cots"></i><i class="roofs"></i><i class="water"></i><i class="wall"></i><i class="boat b1"></i><i class="boat b2"></i>' : '<i class="sun"></i><i class="m1"></i><i class="m2"></i><i class="ground"></i><i class="trees"></i><i class="cabin"></i><i class="door"></i>') + '</div>';
  }
  function emailPreview(e, segs) {
    const s = S(); const p = BB.q.property(e.propertyId) || s.properties[0];
    const sample = ((segs[e.segment] || segs.past).guests[0] || { name: 'Maya Rodriguez' }).name;
    const pers = x => esc(String(x || '').replace(/\{first_name\}/g, first(sample)));
    const code = (e.promo || '').trim().toUpperCase();
    return '<div class="ag-mail"><div class="ag-mail-meta"><div class="ag-mail-from"><span class="ag-mail-av">' + BB.MARK + '</span><div><b>' + esc(s.account.business) + '</b><small>' + esc(fromAddr()) + ' · to ' + esc(sample) + '</small></div></div><p class="ag-mail-subj">' + (pers(e.subject) || '<span class="muted">No subject yet</span>') + '</p></div>' +
      '<div class="ag-mail-body"><div class="ag-mail-brand">' + BB.MARK + '<span>' + esc(p.name) + '</span></div>' + hero(p) +
      '<div class="ag-mail-in"><h4>' + (pers(e.heading) || '<span class="muted">Your heading</span>') + '</h4><p>' + (pers(e.text) || '<span class="muted">Your message</span>') + '</p>' +
      (code ? '<div class="ag-mail-code"><span>Your code, ' + (+e.pct || 10) + '% off when you book direct</span><b class="mono">' + esc(code) + '</b></div>' : '') +
      '<span class="ag-mail-btn" style="background:' + esc(p.color || '#3355FF') + '">' + esc(e.cta || 'Book your stay') + '</span>' +
      '<p class="ag-mail-q">“' + esc({ lake: 'Kayaking across the bay at sunrise was the highlight of our year.', city: 'The perfect base for Bath. We walked everywhere.' }[p.theme] || 'Best cabin we have stayed in. The view over the fells at sunrise is unreal.') + '” · ' + p.rating + ' from ' + p.reviews + ' stays</p></div>' +
      '<div class="ag-mail-foot">You are getting this because you stayed at ' + esc(p.name) + '. <u>Unsubscribe</u> · ' + esc(s.account.business) + ', ' + esc(p.address) + '</div></div></div>';
  }
  V.campaign = Object.assign({
    label: 'Campaign', group: 'Grow', icon: 'mail', hidden: true,
    render(inst) {
      const s = S(), st = inst.st; const id = st.id || 'new';
      const c = s.campaigns.find(x => x.id === id);
      if (id !== 'new' && !c) return wrap(inst, 'ag-campaign', vh('Campaign not found', '', '', ['campaigns', 'Campaigns']));
      const e = editFor(inst); const segs = BB.q.segments(); const n = recipients(segs, e.segment);
      const locked = c && c.status === 'sent';
      const dirty = !c || JSON.stringify(fromEdit(e)) !== JSON.stringify(fromEdit(toEdit(c)));
      const p = BB.q.property(e.propertyId) || s.properties[0];
      const dis = locked ? ' disabled' : '';
      const fld = (lab, key, type, extra) => '<label class="field"><span>' + lab + '</span>' + (type === 'textarea' ? '<textarea id="' + ID(inst, 'cp' + key) + '" data-agf="cp.' + key + '" rows="4"' + dis + '>' + esc(e[key]) + '</textarea>' : '<input id="' + ID(inst, 'cp' + key) + '" data-agf="cp.' + key + '" type="' + (type || 'text') + '" value="' + esc(e[key]) + '"' + dis + (extra || '') + '>') + '</label>';
      const status = !c ? BB.pill('muted', 'New draft') : c.status === 'sent' ? BB.pill('good', 'Sent ' + D.fmt(c.sentAt)) : c.status === 'scheduled' ? BB.pill('info', 'Scheduled for ' + D.fmt(c.sentAt)) : BB.pill('muted', 'Draft');
      const emailOff = !BB.q.connected('email'), smsOff = !BB.q.connected('sms');
      let results = '';
      if (locked) {
        const sim = st.cp_sim && st.cp_sim.id === c.id ? st.cp_sim : null;
        const f = [['Sent', c.recipients], ['Opened', c.opens], ['Clicked', c.clicks], ['Booked', c.bookings]];
        results = '<section class="a-card ag-card ag-results"><div class="a-card-h"><h3>Results</h3><span class="ag-meta">Sent ' + D.fmt(c.sentAt) + ' by ' + (c.sms ? 'email and text' : 'email') + '</span></div>' +
          '<div class="ag-funnel">' + f.map(([l, v], i) => '<div class="ag-fun"><span>' + l + '</span><b class="num">' + v.toLocaleString() + '</b><i style="--w:' + Math.max(2, Math.round(100 * v / Math.max(1, c.recipients))) + '%"></i><small class="num">' + (i ? pct(v / Math.max(1, c.recipients), 1) : '100%') + '</small></div>').join('') + '</div>' +
          '<div class="ag-revrow"><div><span class="eyebrow">Revenue attributed</span><b class="disp num">' + money(c.revenue) + '</b><small class="muted">No commission. Through Airbnb these stays would have cost about ' + money(Math.round(c.revenue * BB.PLATFORM_FEE.airbnb)) + ' in host fees.</small></div>' +
          '<button class="btn primary" data-ag="cp-sim" data-v="' + c.id + '">' + I('play') + 'Simulate guest responses</button></div>' +
          (sim ? '<div class="ag-banner ' + (sim.made ? 'good' : 'warn') + '">' + I(sim.made ? 'check' : 'bolt') + '<div><p>' + (sim.made ? '<b>' + sim.made + (sim.made === 1 ? ' guest' : ' guests') + ' booked with code ' + esc(c.body.promo) + '.</b> The stays are on your calendar and dashboard, paid by card through Stripe.' : !sim.stripe ? '<b>Guests clicked, but nobody could pay.</b> Stripe is disconnected, so property sites only take requests.' : '<b>No new bookings this time.</b> Everyone in this segment has already booked, or the home is full for the next 10 weeks.') + '</p>' +
            (sim.ids.length ? '<div class="ag-links">' + sim.ids.map(bid => { const b = BB.q.booking(bid); return b ? '<button class="btn sm" data-ag-nav="booking" data-ag-id="' + bid + '">' + esc(BB.q.guest(b.guestId).name) + ' · ' + BB.dates(b) + ' · ' + money(b.total) + '</button>' : ''; }).join('') + '<button class="btn sm ghost" data-ag-nav="calendar">' + I('cal') + 'Open calendar</button></div>' : (!sim.stripe ? '<div class="ag-links"><button class="btn sm" data-ag-nav="connections">Reconnect Stripe</button></div>' : '')) + '</div></div>' : '') +
          '</section>';
      }
      return wrap(inst, 'ag-campaign',
        vh(esc(e.name || 'Untitled campaign'), status + (locked ? '' : dirty ? ' <span class="ag-dirty">Unsaved changes</span>' : ' <span class="muted">All changes saved</span>'),
          locked ? '<button class="btn" data-ag="cp-new" data-v="gap">' + I('plus') + 'New campaign</button>' : '<button class="btn" data-ag="cp-save"' + (dirty ? '' : ' disabled') + '>Save draft</button><button class="btn primary" data-ag="cp-send">' + I('send') + 'Send now</button>', ['campaigns', 'Campaigns']) +
        (st.cp_err ? '<div class="ag-banner bad">' + I('x') + '<p>' + esc(st.cp_err) + '</p></div>' : '') +
        (st.cp_conf && !locked ? '<div class="ag-confirm" role="alertdialog" aria-label="Confirm send"><div>' + I('send') + '<p>Send <b>“' + esc(e.subject) + '”</b> to <b class="num">' + n + ' guests</b> in ' + esc((segs[e.segment] || segs.past).label.toLowerCase()) + ' by ' + (e.sms ? 'email and text' : 'email') + '?' + (emailOff ? ' Email sending is disconnected, so it will queue until you reconnect.' : ' This cannot be undone.') + '</p></div><div class="ag-acts-row"><button class="btn primary" data-ag="cp-confirm">Send to ' + n + ' guests</button><button class="btn ghost" data-ag="cp-cancel">Cancel</button></div></div>' : '') +
        results +
        '<div class="ag-cols ag-cols-editor">' +
          '<div class="ag-stack">' +
            (locked ? '' : '<section class="a-card ag-card"><div class="a-card-h"><h3>Template</h3><span class="ag-meta">Fills every field</span></div><div class="ag-tplrow" role="group" aria-label="Templates">' + TPLS.map(([k, t]) => '<button type="button" class="chip" data-ag="cp-tpl" data-v="' + k + '" aria-pressed="' + (e.tpl === k) + '">' + I(TPLI[k]) + t + '</button>').join('') + '</div></section>') +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Audience</h3><span class="ag-meta num">' + n + ' recipients</span></div><div class="ag-form">' +
              '<div class="ag-segs" role="radiogroup" aria-label="Segment">' + Object.keys(segs).map(k => '<label class="ag-segopt' + (e.segment === k ? ' on' : '') + '"><input type="radio" name="seg-' + uid(inst) + '" value="' + k + '" data-agf="cp.segment"' + (e.segment === k ? ' checked' : '') + dis + '><span>' + esc(segs[k].label) + '</span><b class="num">' + recipients(segs, k) + '</b></label>').join('') + '</div>' +
              '<div class="ag-subrow"><div><b>Also send as text</b><small>' + (smsOff ? 'Text messages are disconnected' : 'A short text with the link to guests who opted in') + '</small></div>' + sw(e.sms, 'data-ag="cp-sms"' + (locked ? ' disabled' : ''), 'Also send as text') + '</div>' +
              (emailOff ? '<p class="ag-warnline">' + I('plug') + '<span>Email sending is disconnected. Sends queue until you <button type="button" class="ag-link" data-ag-nav="connections">reconnect it</button>.</span></p>' : '') +
            '</div></section>' +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Message</h3><span class="ag-meta">Use {first_name} to personalise</span></div><div class="ag-form">' +
              fld('Campaign name, only you see this', 'name') + fld('Subject line', 'subject', 'text', ' maxlength="90"') +
              '<div class="ag-2"><label class="field"><span>Home</span><select id="' + ID(inst, 'cpp') + '" data-agf="cp.propertyId"' + dis + '>' + s.properties.map(x => '<option value="' + x.id + '"' + (x.id === e.propertyId ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
              '<div class="ag-2 ag-promo">' + fld('Promo code', 'promo', 'text', ' maxlength="16" class="mono"') + fld('% off', 'pct', 'number', ' min="1" max="50"') + '</div></div>' +
              fld('Heading', 'heading') + fld('Body text', 'text', 'textarea') + fld('Button label', 'cta', 'text', ' maxlength="30"') +
            '</div></section>' +
          '</div>' +
          '<div class="ag-stack ag-sticky"><div class="ag-prevh"><span class="eyebrow">Live preview</span><span class="muted">How ' + esc(first(((segs[e.segment] || segs.past).guests[0] || { name: 'Maya' }).name)) + ' sees it</span></div>' + emailPreview(e, segs) + '</div>' +
        '</div>');
    },
  }, hooks);

  /* =====================================================================
     AUTOMATIONS
     ===================================================================== */
  const TRIG = {
    'booking.created': ['A booking is made', 'Any home, from any source', 'cal'],
    'arrival.minus3': ['3 days before arrival', 'Only if check-in is not finished', 'clock'],
    'checkin.completed': ['Guest finishes check-in', 'ID, agreement and deposit done', 'key'],
    'stay.checkout': ['Morning after checkout', 'Every completed stay', 'door'],
    'calendar.gap': ['A 1–2 night gap opens', 'Checked every morning, next 14 days', 'cal'],
  };
  function stepNeeds(text) {
    const t = text.toLowerCase();
    if (/^add guest|^tag|^find/.test(t)) return [null, /^tag/.test(t) ? 'tag' : /^find/.test(t) ? 'cal' : 'users'];
    if (/smart lock|unique code/.test(t)) return ['lock', 'lock'];
    if (/^text|send code/.test(t)) return ['sms', 'sms'];
    if (/email|send the checkout|rating|come-back|offer to|list/.test(t)) return ['email', 'mail'];
    return [null, 'spark'];
  }
  V.automations = Object.assign({
    label: 'Automations', group: 'Grow', icon: 'flow', order: 30,
    badge: s => { const n = s.automations.filter(a => a.on && a.steps.some(x => { const k = stepNeeds(x)[0]; return k && !(s.integrations.find(i => i.id === k) || {}).connected; })).length; return n || null; },
    render(inst) {
      const s = S(); const on = s.automations.filter(a => a.on);
      const runs = sum(s.automations, a => a.runs);
      const broken = [];
      const body = s.automations.map(a => {
        const tr = TRIG[a.trigger] || [a.trigger, '', 'bolt'];
        const last = s.events.find(e => e.source === 'Automation: ' + a.name || (a.id === 'a3' && e.source === 'Nuki lock' && e.flow && e.flow.includes('Automation')));
        const steps = a.steps.map(x => { const [need, ic] = stepNeeds(x); const off = need && !BB.q.connected(need); if (off && a.on) broken.push([a, need]); return { x, need, ic, off }; });
        const offNeeds = [...new Set(steps.filter(x => x.off).map(x => x.need))];
        return '<section class="a-card ag-card ag-auto' + (a.on ? '' : ' is-off') + '"><div class="ag-auto-h"><div><b>' + esc(a.name) + '</b><small>' + (a.on ? 'On' : 'Off') + ' · ran ' + a.runs.toLocaleString() + ' times' + (last ? ' · last ' + esc(BB.ago(last.at)) : '') + '</small></div>' + sw(a.on, 'data-ag="au-toggle" data-v="' + a.id + '"', (a.on ? 'Turn off ' : 'Turn on ') + a.name) + '</div>' +
          '<ol class="ag-flow"><li class="ag-node trig"><span class="ag-ni">' + I(tr[2]) + '</span><span><small class="eyebrow">When</small><b>' + tr[0] + '</b><em>' + tr[1] + '</em></span></li>' +
          steps.map((x, i) => '<li class="ag-node' + (x.off ? ' off' : '') + '"><span class="ag-ni">' + I(x.ic) + '</span><span><small class="eyebrow">' + (i ? 'Then' : 'Do') + '</small><b>' + esc(x.x) + '</b>' + (x.off ? '<em class="ag-offnote">' + I('plug') + esc(BB.q.integration(x.need).name) + (S().live && !BB.q.integration(x.need).lastSync ? ' is not connected, step skipped' : ' is disconnected, step paused') + '</em>' : '') + '</span></li>').join('') + '</ol>' +
          (offNeeds.length && a.on ? '<p class="ag-warnline">' + I('plug') + '<span>Guests miss part of this flow until you ' + (S().live && offNeeds.every(k => !BB.q.integration(k).lastSync) ? 'connect ' : 'reconnect ') + offNeeds.map(k => esc(BB.q.integration(k).name)).join(' and ') + '. <button type="button" class="ag-link" data-ag-nav="connections">Open connections</button></span></p>' : '') +
          (last ? '<p class="ag-lastrun">' + I('clock') + '<span>' + esc(last.text) + '</span></p>' : '') +
          '</section>';
      }).join('');
      return wrap(inst, 'ag-autos',
        vh('Automations', 'Messages and tasks that run themselves at the right moment of every stay.', '') +
        '<div class="ag-kpis">' + kpi('Running', on.length + ' of ' + s.automations.length, broken.length ? broken.length + ' paused steps' : 'All steps healthy', broken.length ? 'down' : 'up') + kpi('Runs so far', runs.toLocaleString(), 'Across all stays') + kpi('Time saved', Math.round(runs * 6 / 60) + ' hrs', 'At about 6 minutes per message') + kpi('Channels used', ['email', 'sms', 'lock'].filter(k => BB.q.connected(k)).length + ' of 3', 'Email, text and smart lock') + '</div>' +
        '<div class="ag-autos-g">' + body + '</div>');
    },
  }, hooks);

  /* =====================================================================
     WEBSITE & SEO
     ===================================================================== */
  // Nested and list fields edited as plain text, then turned back into the property record on publish.
  const wsFlat = p => ({ wifiSsid: (p.wifi || {}).ssid || '', wifiPw: (p.wifi || {}).pw || '', amenitiesText: (p.amenities || []).join('\n'), rulesText: (p.rules || []).join('\n'), guideText: (p.guide || []).join('\n'), hostNote: p.hostNote || '', address: p.address || '', entry: p.entry || '', parking: p.parking || '' });
  const lines = t => String(t || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 30);
  function wsPatch(p, d) {
    const flat = wsFlat(p), patch = {};
    Object.keys(d).forEach(k => { if (d[k] !== (k in flat ? flat[k] : p[k])) patch[k] = d[k]; });
    if ('wifiSsid' in patch || 'wifiPw' in patch) { patch.wifi = { ssid: String('wifiSsid' in patch ? patch.wifiSsid : flat.wifiSsid).trim(), pw: String('wifiPw' in patch ? patch.wifiPw : flat.wifiPw).trim() }; delete patch.wifiSsid; delete patch.wifiPw; }
    if ('amenitiesText' in patch) { patch.amenities = lines(patch.amenitiesText); delete patch.amenitiesText; }
    if ('rulesText' in patch) { patch.rules = lines(patch.rulesText); delete patch.rulesText; }
    if ('guideText' in patch) { patch.guide = lines(patch.guideText).slice(0, 8); delete patch.guideText; }
    if ('minNights' in patch) patch.minNights = Math.max(1, Math.min(30, patch.minNights || 1));
    return patch;
  }
  function photoCard(inst, p) {
    const ph = (p.photos || []), up = inst.st.ws_up;
    return '<section class="a-card ag-card"><div class="a-card-h"><h3>Photos</h3><span class="ag-meta">' + (ph.length ? ph.length + ' of 24 · the first one is the cover' : 'Add your own photos') + '</span></div>' +
      (ph.length ? '<div class="ag-photos">' + ph.map((x, i) => '<figure class="ag-ph"><img src="' + esc(x.url) + '" alt="' + esc(x.cap || p.name) + '" loading="lazy"><input aria-label="Caption for photo ' + (i + 1) + '" data-agcap="' + i + '" placeholder="Caption, e.g. Living room" value="' + esc(x.cap || '') + '"><div>' +
        (i ? '<button type="button" class="btn sm ghost" data-ag="ws-ph-cover" data-v="' + i + '">Make cover</button>' : '<span class="ag-ph-c">Cover</span>') + '<button type="button" class="btn sm ghost" data-ag="ws-ph-del" data-v="' + i + '" aria-label="Remove photo ' + (i + 1) + '">' + I('x') + '</button></div></figure>').join('') + '</div>'
        : '<p class="muted ag-p">Until you add photos, your site shows a drawing of your home. Photos make the biggest difference to bookings.</p>') +
      '<label class="btn ag-upl' + (up ? ' busy' : '') + '">' + I('image') + (up ? 'Uploading ' + up + '…' : 'Add photos') + '<input type="file" accept="image/jpeg,image/png,image/webp" multiple data-agphotos="' + esc(p.id) + '" hidden></label></section>';
  }
  // A host's own domain: they type it, we show the DNS records to add (with steps for their registrar), it goes live
  // once those are in place, and then the padlock (HTTPS certificate) is set up for them.
  function domainCard(inst, p) {
    const st = inst.st, custom = p._autoDomain ? '' : (p.domain || ''), c = (st.dom || {})[p.id], busy = st.dom_busy === p.id;
    const live = !!custom && ((BB.BOOT.siteUrls || {})[p.id] === 'https://' + custom + '/' || !!(c && c.live));
    if (custom && !c && !busy && !(st.dom_tried || {})[p.id]) { st.dom_tried = Object.assign({}, st.dom_tried, { [p.id]: 1 }); setTimeout(() => domainCall(inst, p.id, '/app/domain/check', {}), 0); }
    const err = st.dom_err && st.dom_err.pid === p.id ? '<p class="ag-err" role="alert">' + esc(st.dom_err.m) + '</p>' : '';
    const secure = live && c && c.https === true;
    const head = '<section class="a-card ag-card ag-dom"><div class="a-card-h"><h3>Your web address</h3><span class="ag-meta">' + (secure ? 'Connected and secure' : live ? 'Connected' : custom ? 'Waiting for your DNS records' : 'Optional') + '</span></div>';
    if (!custom || st.dom_edit === p.id) return head + '<form data-agform="dom" data-pid="' + esc(p.id) + '" class="ag-form">' +
      '<p class="muted ag-p">' + (custom ? 'Type the new address.' : 'Your site is live at <b class="mono">' + esc(p.domain) + '</b>. Already own a domain, at GoDaddy, 123-reg, IONOS, Namecheap, Cloudflare or anywhere else? Type it here. It stays registered where you bought it, and any email on it keeps working.') + '</p>' +
      '<label class="field"><span>Domain you own</span><input name="domain" placeholder="larchcabin.co.uk" value="' + esc(custom) + '" autocomplete="off" spellcheck="false" inputmode="url"></label>' + err +
      '<div class="ag-row"><button class="btn primary"' + (busy ? ' disabled' : '') + '>' + I('globe') + (busy ? 'Saving…' : 'Connect my domain') + '</button>' + (custom ? '<button type="button" class="btn ghost" data-ag="dom-cancel">Cancel</button>' : '') + '</div></form></section>';
    const tools = '<div class="ag-row">' + (live && !secure ? '<button type="button" class="btn sm primary" data-ag="dom-check" data-v="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>' + I('sync') + (busy ? 'Checking…' : 'Check again') + '</button>' : '') + '<button type="button" class="btn sm" data-ag="dom-edit" data-v="' + esc(p.id) + '">Change</button><button type="button" class="btn sm ghost" data-ag="dom-remove" data-v="' + esc(p.id) + '">Stop using it</button></div>';
    // Three steps the host can see: pointing, proved, padlock.
    const pointed = !!c && c.records.some(r => r.type !== 'TXT' && r.ok), proved = !!c && c.proved;
    const step = (ok, wait, t, d) => '<li class="' + (ok ? 'ok' : wait ? 'wait' : '') + '"><span class="ag-dst-i">' + (ok ? I('check') : wait ? '<i class="ag-spin"></i>' : '') + '</span><span><b>' + t + '</b><small>' + d + '</small></span></li>';
    const steps = c || live ? '<ol class="ag-dsteps" aria-label="Progress">' +
      step(live || pointed, false, 'Points at your booking site', live || pointed ? 'Found your www or main address record' : 'Waiting for the CNAME' + (c && c.records.some(r => r.type === 'A') ? ' or A record' : '') + ' below') +
      step(live || proved, false, 'Proved it is yours', live || proved ? 'Found your TXT record' : 'Waiting for the TXT record below') +
      step(secure, live && !secure, 'Secure padlock (HTTPS)', secure ? 'Guests see https://' + esc(custom) : live ? 'Setting up your free certificate. This usually takes a few minutes.' : 'Added for you, free, once the first two are done') +
      '</ol>' : '';
    if (live) return head + (secure ? '<div class="ag-banner good">' + I('check') + '<p>Guests book at <b class="mono">https://' + esc(custom) + '</b>. The www address goes to the same site.</p></div>' : '') + steps + err + tools + '</section>';
    const recs = c ? '<div class="ag-dns" role="table" aria-label="DNS records">' + c.records.map(r => '<div class="ag-dns-r" role="row"><span class="mono ag-dns-t">' + r.type + '</span><span><small>Name</small><b class="mono">' + esc(r.name) + '</b></span><span class="ag-dns-v"><small>Value</small><b class="mono" data-dnsv>' + esc(r.value) + '</b><button type="button" class="btn sm ghost" data-ag="dom-copy" data-v="' + esc(r.value) + '">Copy</button></span><span class="ag-dns-s ' + (r.ok ? 'ok' : '') + '">' + (r.ok ? I('check') + 'Found' : 'Not seen yet') + '</span><small class="ag-dns-w">' + esc(r.why) + (!r.ok && r.seen ? '. Right now we see ' + esc(r.seen) + ', so change that one rather than adding a second.' : '') + '</small></div>').join('') + '</div>' : '<p class="muted ag-p">' + (busy ? 'Looking up your DNS records…' : '') + '</p>';
    const noApex = c && !c.records.some(r => r.type === 'A');
    return head + '<p class="muted ag-p">Add these records where you bought <b class="mono">' + esc(custom) + '</b>. Your site switches over by itself once we can see them, and we add the padlock for you. That is often within an hour, and can take up to a day.</p>' +
      steps +
      (c && c.proxied ? '<p class="ag-note warn">' + I('bolt') + '<span>Your domain is behind Cloudflare’s proxy (the orange cloud). In Cloudflare, set <b>Proxy status</b> to <b>DNS only</b> on the <b>@</b> and <b>www</b> records so we can see them and set up your padlock.</span></p>' : '') +
      (c && c.elsewhere ? '<p class="ag-note">' + I('bolt') + '<span>Another Bookingbooster account has this address. The TXT record proves it is yours and moves it to you.</span></p>' : '') + recs +
      (noApex ? '<p class="ag-note">' + I('globe') + '<span>For the main address (<b class="mono">' + esc(custom) + '</b> without www), turn on <b>domain forwarding</b> to <b class="mono">https://www.' + esc(custom) + '</b> where you bought it.</span></p>' : '') +
      '<div class="ag-dg">' + BB.dnsGuide(st.dom_reg || '', custom) + '</div>' + err +
      '<div class="ag-row"><button type="button" class="btn sm primary" data-ag="dom-check" data-v="' + esc(p.id) + '"' + (busy ? ' disabled' : '') + '>' + I('sync') + (busy ? 'Checking…' : 'Check now') + '</button><button type="button" class="btn sm" data-ag="dom-edit" data-v="' + esc(p.id) + '">Change</button><button type="button" class="btn sm ghost" data-ag="dom-remove" data-v="' + esc(p.id) + '">Stop using it</button></div>' +
      '<p class="muted ag-p ag-fine">Stuck? <a href="mailto:' + esc(BB.BOOT.support || 'help@booking-booster.co.uk') + '?subject=' + encodeURIComponent('Help connecting ' + custom) + '">Email us</a> and we will add the records with you.</p></section>';
  }
  async function domainCall(inst, pid, url, body) {
    inst.set({ dom_busy: pid, dom_err: null });
    try {
      const j = await BB.api.call(url, Object.assign({ propertyId: pid }, body)); BB.api.accept(j);
      inst.st.dom = Object.assign({}, inst.st.dom, { [pid]: j.domain || null }); inst.st.dom_edit = null;
      if (j.domain && j.domain.live) BB.toast(j.domain.domain + ' is connected', 'good');
    } catch (e) { inst.st.dom_err = { pid, m: e.message }; }
    inst.set({ dom_busy: null });
  }
  function shrinkFile(f, max) {
    return new Promise(res => { const r = new FileReader(); r.onload = () => { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', 0.84)); }; im.onerror = () => res(null); im.src = r.result; }; r.onerror = () => res(null); r.readAsDataURL(f); });
  }
  async function uploadPhotos(inst, pid, files) {
    const list = Array.from(files).slice(0, 24);
    for (let i = 0; i < list.length; i++) {
      inst.set({ ws_up: (i + 1) + ' of ' + list.length });
      const data = await shrinkFile(list[i], 2000);
      if (!data) { BB.toast(list[i].name + ' is not a photo we can read', 'bad'); continue; }
      try { const j = await BB.api.call('/app/photos/' + encodeURIComponent(pid), { image: data, cap: '' }); BB.api.accept(j); }
      catch (e) { BB.toast(e.message, 'bad'); break; }
    }
    inst.set({ ws_up: null }); BB.toast('Photos added to your site', 'good');
  }
  function wsDraft(inst) { const st = inst.st; st.ws_d = st.ws_d || {}; const pid = st.ws_pid || S().properties[0].id; st.ws_pid = pid; return (st.ws_d[pid] = st.ws_d[pid] || {}); }
  const THEMES = [['cabin', 'Fell cabin', 'Larch, slate and moss, serif headings'], ['lake', 'Harbour cottage', 'Sea blues and whitewash, clean type'], ['city', 'Georgian townhouse', 'Bath stone, editorial type']];
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  V.website = Object.assign({
    label: 'Website & SEO', group: 'Get found', icon: 'web', order: 10,
    render(inst) {
      const s = S(), st = inst.st; const d = wsDraft(inst); const p0 = BB.q.property(st.ws_pid) || s.properties[0]; const flat = wsFlat(p0); const p = Object.assign({}, p0, flat, d);
      const changed = Object.keys(d).filter(k => d[k] !== (k in flat ? flat[k] : p0[k]));
      const faqs = (s.website.faqs[p0.id] || []).map(x => x.split('|'));
      const vis = s.website.visitors[p0.id] || 0; const gsc = BB.q.connected('gsc'); const stripe = BB.q.connected('stripe');
      const areaShort = (p0.area || '').split(',')[0] || 'the area';
      const pages = [
        ['home', 'Home and booking', '/', p.name + ' | Book direct, ' + areaShort, [p.headline, p.sub].filter(Boolean).map(x => String(x).trim().replace(/([^.!?])$/, '$1.')).concat('Book direct with the owner and skip the booking fee.').join(' ')],
        ['area', 'Area guide', '/things-to-do-' + slug(areaShort), 'Things to do near ' + p.short + ' | ' + areaShort + ' guide', 'Walks, pubs and days out within 30 minutes of ' + p.name + ', picked by your host.'],
        ['faq', 'FAQs', '/faq', p.short + ' FAQ: dogs, parking, check-in', faqs.length ? faqs.map(f => f[0]).join(' ') : 'Answers about check-in, parking and house rules at ' + p.name + '.'],
        ['reviews', 'Reviews', '/reviews', p.name + ' reviews · ' + p.rating + ' stars from ' + p.reviews + ' stays', 'Read what guests say about ' + p.name + ' in ' + areaShort + '. Verified stays only.'],
      ];
      if (S().live) { // real sites are one crawlable page per home: FAQs and the area guide are sections on it
        for (let i = pages.length - 1; i >= 0; i--) { const k = pages[i][0]; if (k === 'reviews' || (k === 'area' && !(p.guideText || '').trim())) pages.splice(i, 1); else if (k !== 'home') pages[i][2] = '/#' + k; }
      }
      const pg = pages.find(x => x[0] === (st.ws_page || 'home')) || pages[0];
      const nf = (lab, key, pre, suf) => '<label class="field ag-nf"><span>' + lab + '</span><div class="ag-affix">' + (pre ? '<i>' + pre + '</i>' : '') + '<input id="' + ID(inst, 'ws' + key) + '" data-agf="ws.' + key + '" type="number" min="0" value="' + esc(p[key]) + '">' + (suf ? '<i>' + suf + '</i>' : '') + '</div></label>';
      const tf = (lab, key, area) => '<label class="field"><span>' + lab + '</span>' + (area ? '<textarea id="' + ID(inst, 'ws' + key) + '" data-agf="ws.' + key + '" rows="4">' + esc(p[key]) + '</textarea>' : '<input id="' + ID(inst, 'ws' + key) + '" data-agf="ws.' + key + '" value="' + esc(p[key]) + '">') + '</label>';
      const th = THEMES.find(t => t[0] === p.theme) || THEMES[0];
      return wrap(inst, 'ag-web',
        vh('Website & SEO', S().live ? 'Each home has its own booking site. Edit it here and publish. Search engines and AI assistants can read every page.' : 'Each home has its own booking site on its own .co.uk domain. Edit it here, publish, and Google picks it up.',
          '<button class="btn" data-ag-nav="property" data-ag-id="' + p0.id + '">' + I('out') + 'View live site</button><button class="btn primary" data-ag="ws-publish"' + (changed.length ? '' : ' disabled') + '>' + I('send') + (changed.length ? 'Publish ' + changed.length + (changed.length === 1 ? ' change' : ' changes') : 'Publish changes') + '</button>') +
        '<div class="ag-ptabs" role="tablist" aria-label="Homes" id="' + ID(inst, 'ptabs') + '">' + s.properties.map(x => '<button type="button" role="tab" aria-selected="' + (x.id === p0.id) + '" data-ag="ws-pid" data-v="' + x.id + '">' + hero(x, 'ag-thumb') + '<span><b>' + esc(x.name) + '</b><small class="mono">' + esc(x.domain) + '</small></span>' + ((st.ws_d[x.id] && Object.keys(st.ws_d[x.id]).some(k => st.ws_d[x.id][k] !== x[k])) ? '<i class="ag-dot" title="Unpublished changes"></i>' : '') + '</button>').join('') + '</div>' +
        (st.ws_pub === p0.id && !changed.length ? '<div class="ag-banner good">' + I('check') + '<p>Published to <b class="mono">' + esc(p0.domain) + '</b>. Guests see the new version now, and Google gets the updated pages on its next crawl.</p><button class="btn sm" data-ag-nav="property" data-ag-id="' + p0.id + '">' + I('out') + 'View live site</button></div>' : '') +
        (changed.length ? '<div class="ag-banner info">' + I('edit') + '<p><b>' + changed.length + ' unpublished ' + (changed.length === 1 ? 'change' : 'changes') + '</b>: ' + changed.map(k => ({ theme: 'theme', headline: 'headline', sub: 'subheading', about: 'about', nightly: 'nightly rate', weekend: 'weekend uplift', cleaning: 'cleaning fee', petsAllowed: 'dog policy', petFee: 'dog fee', address: 'address', wifiSsid: 'Wi-Fi name', wifiPw: 'Wi-Fi password', parking: 'parking', checkinTime: 'check-in time', checkoutTime: 'checkout time', minNights: 'minimum nights', entry: 'how guests get in', amenitiesText: 'amenities', rulesText: 'house rules', guideText: 'area guide', hostNote: 'host note', nukiId: 'smart lock' }[k] || k)).join(', ') + '.</p><div class="ag-acts-row"><button class="btn sm primary" data-ag="ws-publish">Publish</button><button class="btn sm ghost" data-ag="ws-discard">Discard</button></div></div>' : '') +
        (!stripe ? '<div class="ag-banner warn">' + I('plug') + (S().live ? '<p>Connect Stripe to take instant card bookings. Until then your site takes booking requests and you send a payment link.</p><button class="btn sm" data-ag-nav="connections">Connect Stripe</button></div>' : '<p>Stripe is disconnected, so ' + esc(p0.domain) + ' takes booking requests instead of instant bookings.</p><button class="btn sm" data-ag-nav="connections">Reconnect</button></div>') : '') +
        '<div class="ag-cols ag-cols-web">' +
          '<div class="ag-stack">' +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Theme</h3><span class="ag-meta">' + th[1] + '</span></div><div class="ag-themes" role="radiogroup" aria-label="Theme">' +
              THEMES.map(([k, t, dsc]) => '<button type="button" role="radio" aria-checked="' + (p.theme === k) + '" class="ag-theme" data-ag="ws-theme" data-v="' + k + '"><span class="ag-mini t-' + k + '"><i class="nav"></i>' + hero(Object.assign({}, p, { theme: k }), 'ag-mini-h') + '<i class="h"></i><i class="l"></i><i class="l s"></i><i class="b"></i></span><b>' + t + '</b><small>' + dsc + '</small></button>').join('') + '</div></section>' +
            (S().live && BB.api ? domainCard(inst, p0) : '') + (S().live ? photoCard(inst, p0) : '') +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Words</h3><span class="ag-meta">Also used in search results</span></div><div class="ag-form">' + tf('Headline', 'headline') + tf('Subheading', 'sub') + tf('About this home', 'about', true) + (S().live ? tf('A line from you, shown next to your name', 'hostNote') : '') + '</div></section>' +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Prices and dogs</h3><span class="ag-meta">Direct prices, no service fee</span></div><div class="ag-form"><div class="ag-3">' + nf('Nightly rate', 'nightly', '£') + nf('Weekend uplift', 'weekend', '+£') + nf('Cleaning fee', 'cleaning', '£') + '</div>' +
              '<div class="ag-subrow"><div><b>Dogs welcome</b><small>' + (p.petsAllowed ? 'Guests can add a dog at checkout' : 'The site says no pets and blocks bookings with dogs') + '</small></div>' + sw(p.petsAllowed, 'data-ag="ws-pets"', 'Dogs welcome') + '</div>' +
              (p.petsAllowed ? '<div class="ag-3">' + nf('Dog fee per stay', 'petFee', '£') + '</div>' : '') +
              '<p class="ag-note">' + I('bolt') + '<span>A 3-night weekend stay shows as <b class="num">' + money(p.nightly * 3 + p.weekend * 2 + p.cleaning) + '</b> on your site and about <b class="num">' + money(Math.round((p.nightly * 3 + p.weekend * 2 + p.cleaning) * 1.142)) + '</b> on Airbnb.</span></p></div></section>' +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Guest details</h3><span class="ag-meta">Shown to guests after they check in</span></div><div class="ag-form">' + tf('Full address', 'address') +
              '<div class="ag-3">' + tf('Wi-Fi name', 'wifiSsid') + tf('Wi-Fi password', 'wifiPw') + tf('Parking', 'parking') + '</div><div class="ag-3">' + tf('Check-in from', 'checkinTime') + tf('Checkout by', 'checkoutTime') + nf('Minimum nights', 'minNights') + '</div>' +
              (S().live && BB.q.connected('lock') && (BB.q.integration('lock').locks || []).length ? '<label class="field"><span>Nuki lock for this home</span><select data-agf="ws.nukiId"><option value="">No smart lock</option>' + BB.q.integration('lock').locks.map(l => '<option value="' + esc(l.id) + '"' + (String(p.nukiId || '') === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label>' : '') +
              tf(S().live && BB.q.connected('lock') ? 'Arrival notes (shown with the door code)' : 'How guests get in (key safe, lockbox, meet and greet)', 'entry', true) + tf('What this home offers (one per line)', 'amenitiesText', true) + tf('House rules (one per line)', 'rulesText', true) + tf('Area guide, one place per line: place | how far | your tip', 'guideText', true) + '</div></section>' +
          '</div>' +
          '<div class="ag-stack">' +
            '<div class="ag-site t-' + p.theme + '" style="--hc:' + esc(p.color) + '"><div class="ag-site-bar"><i></i><i></i><i></i><span class="mono">' + esc(p.domain) + '</span></div>' + hero(p) +
              '<div class="ag-site-in"><b class="ag-site-h">' + esc(p.headline) + '</b><small>' + esc(p.sub) + '</small><div class="ag-site-book"><span><b class="num">' + money(p.nightly) + '</b> night · book direct</span><span class="ag-site-btn">Check dates</span></div></div></div>' +
            '<section class="a-card ag-card"><div class="a-card-h"><h3>Traffic</h3><span class="ag-meta">Last 30 days</span></div><div class="ag-stats3"><div><small>Visitors</small><b class="num">' + vis.toLocaleString() + '</b></div><div><small>From search</small><b class="num">' + pct(s.website.fromSearch) + '</b></div><div><small>Visit to booking</small><b class="num">' + pct(s.website.conversion, 1) + '</b></div></div>' +
              '<div class="ag-gsc ' + (gsc ? 'ok' : 'off') + '">' + I(gsc ? 'check' : 'plug') + '<div><b>Google Search Console</b><small>' + (gsc ? 'Verified · ' + pages.length + ' pages indexed · sitemap sent ' + esc(BB.ago(BB.q.integration('gsc').lastSync)) : S().live ? (((p0.indexing || {}).google || {}).state === 'submitted' ? 'Submitted for you, no Google login needed. See Search health for clicks and searches.' : 'Submitted for you automatically. See Search health.') : 'Disconnected. We cannot see rankings or ask Google to recrawl.') + '</small></div>' + (gsc ? BB.pill('good', 'Healthy') : S().live ? (((p0.indexing || {}).google || {}).state === 'submitted' ? BB.pill('good', 'Submitted') : '<button class="btn sm" data-ag-nav="seo">Open</button>') : '<button class="btn sm" data-ag-nav="connections">Connect</button>') + '</div></section>' +
            '<section class="a-card ag-card ag-pad0"><div class="a-card-h ag-pad"><h3>Pages we generate</h3><span class="ag-meta">' + pages.length + ' pages</span></div>' +
              '<div class="ag-pages" role="tablist" aria-label="Pages">' + pages.map(x => '<button type="button" role="tab" aria-selected="' + (x[0] === pg[0]) + '" data-ag="ws-page" data-v="' + x[0] + '"><b>' + x[1] + '</b><small class="mono">' + x[2] + '</small>' + (gsc ? '<span class="ag-ix">Indexed</span>' : '') + '</button>').join('') + '</div>' +
              '<div class="ag-serp"><span class="eyebrow">Google result preview</span><div class="ag-serp-r"><div class="ag-serp-u"><span class="ag-fav" style="background:' + esc(p.color) + '"></span><div><b>' + esc(p.name) + '</b><small>https://' + esc(p0.domain) + (pg[2] === '/' ? '' : ' › ' + esc(pg[2].slice(1))) + '</small></div></div><p class="ag-serp-t">' + esc(pg[3].slice(0, 62)) + (pg[3].length > 62 ? '…' : '') + '</p><p class="ag-serp-d">' + (pg[0] === 'reviews' ? '<span class="ag-serp-s">★★★★★ Rating: ' + p.rating + ' · ' + p.reviews + ' reviews · </span>' : '') + esc(pg[4].trim().slice(0, 156)) + (pg[4].length > 156 ? '…' : '') + '</p></div>' +
              (pg[0] === 'faq' ? '<div class="ag-faqs">' + (faqs.length ? faqs.map(f => '<details><summary>' + esc(f[0]) + '</summary><p>' + esc(f[1]) + '</p></details>').join('') : '<p class="muted ag-p">No FAQs yet. Add the questions guests ask you most; AI assistants quote them.</p>') +
                (st.ws_faq_open ? '<form data-agform="faq" class="ag-form ag-faqform"><label class="field"><span>Question</span><input id="' + ID(inst, 'fq') + '" data-agf="faq.q" placeholder="Is there a travel cot?" value="' + esc(st.ws_faq_q || '') + '"></label><label class="field"><span>Answer</span><textarea id="' + ID(inst, 'fa') + '" data-agf="faq.a" rows="2" placeholder="Yes, a travel cot and high chair are in the hall cupboard.">' + esc(st.ws_faq_a || '') + '</textarea></label>' + (st.ws_faq_err ? '<p class="ag-err">' + esc(st.ws_faq_err) + '</p>' : '') + '<div class="ag-acts-row"><button class="btn sm primary">Publish FAQ</button><button type="button" class="btn sm ghost" data-ag="ws-faq">Cancel</button></div></form>' : '<button class="btn sm" data-ag="ws-faq">' + I('plus') + 'Add an FAQ</button>') + '</div>' : '') +
              '</div></section>' +
          '</div>' +
        '</div>');
    },
  }, hooks);

  /* =====================================================================
     AI VISIBILITY
     ===================================================================== */
  function gauge(n) {
    const r = 46, c = 2 * Math.PI * r, off = c * (1 - n / 100);
    return '<svg class="ag-gauge" viewBox="0 0 120 120" role="img" aria-label="Visibility score ' + n + ' of 100"><circle cx="60" cy="60" r="' + r + '" class="tr"/><circle cx="60" cy="60" r="' + r + '" class="fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 60 60)"/><text x="60" y="68" text-anchor="middle">' + n + '</text></svg>';
  }
  V.ai = Object.assign({
    label: 'AI visibility', group: 'Get found', icon: 'spark', order: 20,
    badge: s => { const n = s.ai.tasks.filter(t => !t.done).length; return n || null; },
    render(inst) {
      const s = S(), st = inst.st; const sc = BB.aiScore(); const qs = s.ai.questions;
      const sel = Math.min(qs.length - 1, st.ai_q == null ? 0 : st.ai_q); const q = qs[sel]; const p = BB.q.property(q.propertyId) || s.properties[0];
      const perEngine = ENGINES.map(([k, l]) => [k, l.replace('Google AI Overview', 'Google AI'), qs.filter(x => x.engines[k]).length]);
      const open = s.ai.tasks.filter(t => !t.done);
      const fixFor = s.ai.tasks.find(t => !t.done && t.fixes.includes(sel));
      const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
      const realK = S().live ? ['chatgpt', 'gemini', 'perplexity', 'google'].find(k => q.answers && q.answers[k]) : null;
      const ans = S().live ? (realK ? '<p>' + esc(q.answers[realK]).replace(/\n+/g, '</p><p>') + '</p>' + (q.engines[realK] ? '' : '<div class="ag-miss">' + I('x') + '<span>' + esc(p.name) + ' is not mentioned yet.' + (fixFor ? ' Fix: ' + esc(fixFor.text.charAt(0).toLowerCase() + fixFor.text.slice(1)) + '.' : '') + '</span></div>')
          : '<p class="muted">' + (((BB.BOOT && BB.BOOT.aiEngines) || []).length ? 'Not checked yet. Run a check to see what AI assistants answer.' : 'AI checks are not switched on for this server yet. Your score stays at 0 until they are.') + '</p>')
        : q.engines.chatgpt
        ? '<p>For a ' + esc(q.q) + ', a strong pick is <b>' + esc(p.name) + '</b>. ' + esc(p.about.split('. ')[0]) + '. Guests rate it ' + p.rating + ' from ' + p.reviews + ' stays' + (/dog|pet/.test(q.q) && p.petsAllowed ? ', and one well-behaved dog is welcome for a ' + money(p.petFee) + ' fee' : '') + '.</p><p>Booking on its own website skips the platform booking fee.</p><a class="ag-cite" data-ag-nav="property" data-ag-id="' + p.id + '" href="#">' + I('globe') + '<span><b>' + esc(p.name) + '</b><small>' + esc(p.domain) + '</small></span></a>'
        : '<p>Popular options for a ' + esc(q.q) + ' include several holiday lets on the big booking platforms around ' + esc((p.area || '').split(',')[0]) + '. Compare reviews and fees before you book.</p><div class="ag-miss">' + I('x') + '<span>' + esc(p.name) + ' is not mentioned yet.' + (fixFor ? ' Fix: ' + esc(fixFor.text.charAt(0).toLowerCase() + fixFor.text.slice(1)) + '.' : '') + '</span></div>';
      return wrap(inst, 'ag-ai',
        vh('AI visibility', 'How often your homes show up in ChatGPT, Gemini, Perplexity and Google when travellers ask where to stay.', '<button class="btn primary" data-ag="ai-run">' + I('sync') + 'Run check now</button>') +
        '<div class="ag-cols ag-cols-ai">' +
          '<section class="a-card ag-card ag-score"><div class="a-card-h"><h3>Visibility score</h3><span class="ag-meta">' + (s.ai.checkedAt ? 'Checked ' + D.fmt(s.ai.checkedAt) : 'Not checked yet') + '</span></div><div class="ag-score-in">' + gauge(sc.score) +
            '<div><b class="disp">Mentioned in ' + sc.mentioned + ' of ' + sc.total + '</b><p class="muted">questions on ChatGPT or Gemini.' + (st.ai_delta ? ' <span class="ag-up">▲ ' + st.ai_delta + ' points just now</span>' : S().live ? '' : ' Was 41 in August.') + '</p></div></div>' +
            '<div class="ag-engbars">' + perEngine.map(([k, l, v]) => '<div><span>' + BB.aiName(k, l) + '</span><i><b style="width:' + Math.round(100 * v / qs.length) + '%"></b></i><em class="num">' + v + '/' + qs.length + '</em></div>').join('') + '</div></section>' +
          '<section class="a-card ag-card"><div class="a-card-h"><h3>Recommended fixes</h3><span class="ag-meta">' + (open.length ? open.length + ' to do' : s.ai.tasks.length ? 'All done' : 'From Search health') + '</span></div><ul class="ag-tasks">' +
            (!s.ai.tasks.length && BB.seo ? s.properties.flatMap(h => BB.seo.audit(h).fixes.filter(c => ['aeo', 'geo', 'aio', 'llmo'].includes(c.cat)).slice(0, 2).map(c => '<li><span class="ag-tk">' + I('spark') + '</span><div><b>' + esc(c.label) + (s.properties.length > 1 ? ' · ' + esc(h.short) : '') + '</b><small>' + esc(c.fix) + '</small></div><button class="btn sm primary" data-ag-nav="seo">Fix it</button></li>')).slice(0, 4).join('') : '') +
            s.ai.tasks.map(t => '<li class="' + (t.done ? 'done' : '') + '"><span class="ag-tk">' + I(t.done ? 'check' : 'spark') + '</span><div><b>' + esc(t.text) + '</b><small>' + (t.done ? 'Live on your site. Answers updated.' : 'Wins ' + t.fixes.length + (t.fixes.length === 1 ? ' question' : ' questions') + ': ' + t.fixes.map(i => '“' + esc(qs[i].q) + '”').join(', ')) + '</small></div>' + (t.done ? BB.pill('good', 'Done') : '<button class="btn sm primary" data-ag="ai-do" data-v="' + t.id + '">Do it for me</button>') + '</li>').join('') + '</ul></section>' +
        '</div>' +
        '<div class="ag-cols ag-cols-ai2">' +
          '<section class="a-card ag-card ag-pad0"><div class="a-card-h ag-pad"><h3>Tracked questions</h3><span class="ag-meta ag-hint">Tap a question to see the answer</span></div><div class="tblwrap" id="' + ID(inst, 'aim') + '"><table class="tbl ag-matrix"><thead><tr><th>Traveller asks</th>' + ENGINES.map(([k, l]) => '<th class="ag-eng"><span class="ag-engh">' + BB.aiLogo(k) + '<span>' + l.replace('Google AI Overview', 'Google AI') + '</span></span></th>').join('') + '</tr></thead><tbody>' +
            qs.map((x, i) => { const hp = BB.q.property(x.propertyId); return '<tr data-open data-ag="ai-q" data-v="' + i + '" class="' + (i === sel ? 'sel' : '') + '" tabindex="0"><td><b>' + esc(cap(x.q)) + '</b>' + (hp ? homeDot(hp) : '') + '</td>' + ENGINES.map(([k, l]) => '<td class="ag-eng"><span class="ag-tick ' + (x.engines[k] ? 'y' : 'n') + '" title="' + l + (x.engines[k] ? ': recommends you' : ': does not mention you') + '">' + I(x.engines[k] ? 'check' : 'x') + '<span class="ag-sr">' + (x.engines[k] ? 'Recommended' : 'Not yet') + '</span></span></td>').join('') + '</tr>'; }).join('') +
            '</tbody></table></div></section>' +
          '<section class="a-card ag-card ag-answer"><div class="a-card-h"><h3>Example answer</h3><span class="ag-meta">' + BB.aiName('chatgpt') + (s.ai.checkedAt ? ' · ' + D.fmt(s.ai.checkedAt) : '') + '</span></div><div class="ag-chat"><div class="ag-chat-u">' + esc(cap(q.q)) + '?</div><div class="ag-chat-a"><span class="ag-chat-av ai">' + BB.aiLogo('chatgpt', true) + '</span><div>' + ans + '</div></div></div></section>' +
        '</div>' + BB.aiTm('ag-tm'));
    },
  }, hooks);

  /* =====================================================================
     CONNECTIONS
     ===================================================================== */
  const CN = {
    stripe: { does: 'Guests pay in full on your sites with card, Apple Pay or Google Pay, and the £200 deposit hold happens at check-in.', off: 'Property sites switch to request-to-book, and check-in cannot hold deposits.' },
    lock: { does: 'Each stay gets its own door code, active from check-in time to checkout.', off: 'Door codes are not created. You will set and send every code by hand.' },
    cleaner: { does: 'Book a clean in Turno after every checkout.', on: 'Cleans are booked in Turno automatically after every checkout.' },
    email: { does: 'Confirmations, reminders and campaigns go out for you, and guest replies reach your own inbox.', off: 'Confirmations, reminders and campaigns queue until you reconnect.' },
    sms: { does: 'Check-in links and door codes also go by text.', off: 'Guests stop getting texts. Door codes and reminders go by email only.' },
    google: { does: 'Your homes show on Google Maps with reviews and a Book direct button.', off: 'Google Maps listings stop updating and lose the Book direct button.' },
    gsc: { does: 'We submit sitemaps and track your Google rankings for every page.', off: 'We cannot track rankings or ask Google to crawl new pages.' },
    analytics: { does: 'Track visitors and bookings by source in Google Analytics.' },
    pricelabs: { does: 'Nightly rates adjust daily for demand and update on your booking sites.' },
    cm: { on: 'Dates booked through your channel manager show on your calendar as blocked and close on your own sites. We read dates only.', stop: 'Dates booked through your channel manager will no longer block your own sites.', ical: 'your-channel-manager.com/ical/fell-harbour.ics' },
    airbnb: { on: 'Dates booked on Airbnb show on your calendar as "Booked on Airbnb" and close on your own sites. We read dates only, never guests, prices or messages.', stop: 'Dates booked on Airbnb will no longer block your own sites.', ical: 'airbnb.co.uk/calendar/ical/48213907.ics' },
    vrbo: { on: 'Dates booked on Vrbo show on your calendar as "Booked on Vrbo" and close on your own sites. We read dates only.', stop: 'Dates booked on Vrbo will no longer block your own sites.', ical: 'vrbo.com/icalendar/3812240.ics' },
    booking: { on: 'Dates booked on Booking.com show on your calendar as "Booked on Booking.com" and close on your own sites. We read dates only.', stop: 'Dates booked on Booking.com will no longer block your own sites.', ical: 'admin.booking.com/hotel/ical/9021774.ics' },
    other: { on: 'Dates booked on that site show on your calendar as blocked and close on your own sites. We read dates only.', stop: 'Dates booked on that site will no longer block your own sites.', ical: 'plumguide.com/ical/88213.ics' },
    beds24: { on: 'Two-way: dates taken in Beds24 close on your sites, and your direct bookings close the same nights in Beds24.', stop: 'We reopen the nights we closed in Beds24 and stop syncing.', how: 'In Beds24 open Settings, Apps & Integrations, API. Make an invite code with read and write access to bookings and read access to properties, then paste it here.', fields: [['inviteCode', 'Invite code', 1]] },
    smoobu: { on: 'Two-way: dates taken in Smoobu close on your sites, and your direct bookings close the same nights in Smoobu.', stop: 'We remove the blocks we made in Smoobu and stop syncing.', how: 'In Smoobu open Settings, Advanced, API Keys. Click Create API Key, then Generate Secret, and paste both here (Smoobu only shows the secret once).', fields: [['apiKey', 'API key'], ['apiSecret', 'API secret', 1]] },
    hostaway: { on: 'Two-way: dates taken in Hostaway close on your sites, and your direct bookings close the same nights in Hostaway.', stop: 'We reopen the nights we closed in Hostaway and stop syncing.', how: 'In Hostaway open Settings, Hostaway API, and create an API key. Paste your account ID and the key here.', fields: [['accountId', 'Account ID'], ['apiKey', 'API key', 1]] },
    guesty: { on: 'Two-way: dates taken in Guesty close on your sites, and your direct bookings close the same nights in Guesty.', stop: 'We reopen the nights we closed in Guesty and stop syncing.', how: 'In Guesty open Integrations, API (Open API), and create a new application. Paste its client ID and client secret here.', fields: [['clientId', 'Client ID'], ['clientSecret', 'Client secret', 1]] },
    lodgify: { on: 'Dates booked in Lodgify close on your sites. Lodgify reads your direct bookings from your Bookingbooster calendar link.', stop: 'Dates booked in Lodgify will no longer block your own sites.', how: 'In Lodgify open Settings, Public API, and copy your API key. Then add your Bookingbooster calendar link to each Lodgify property (Calendar, Sync) so direct bookings close there too.', fields: [['apiKey', 'API key', 1]] },
  };
  const GICON = { Payments: 'card', Operations: 'key', Messaging: 'sms', 'Get found': 'globe', Pricing: 'chart', 'Add-ons': 'cal' };
  V.connections = Object.assign({
    label: 'Connections', group: 'Settings', icon: 'plug', order: 10,
    badge: s => { const soon = (s.live && BB.BOOT && BB.BOOT.soon) || []; const n = s.integrations.filter(i => !i.connected && !i.addon && CN[i.id] && CN[i.id].off && !soon.includes(i.id) && (!s.live || i.lastSync)).length; return n || null; },
    render(inst) {
      const s = S(), st = inst.st; const ints = s.integrations; const c = id => BB.q.connected(id);
      const core = ints.filter(i => !i.addon), addons = ints.filter(i => i.addon);
      const groups = []; core.forEach(i => { let g = groups.find(x => x[0] === i.group); if (!g) groups.push(g = [i.group, []]); g[1].push(i); });
      const soon = id => S().live && ((BB.BOOT && BB.BOOT.soon) || []).includes(id);
      const issues = core.filter(i => !i.connected && CN[i.id] && CN[i.id].off && !soon(i.id) && (!S().live || i.lastSync));
      const syncing = addons.filter(i => i.connected);
      const node = (label, sub, ok, ic, cls) => '<div class="ag-dn ' + (ok ? '' : 'off ') + (cls || '') + '"><span class="ag-dn-i">' + I(ic) + '</span><span><b>' + label + '</b><small>' + sub + '</small></span><i class="ag-dn-s" aria-label="' + (ok ? 'Working' : 'Paused') + '"></i></div>';
      const res = st.cn_res;
      const domains = s.properties.map(p => p.domain);
      const diagram = '<section class="a-card ag-card ag-diag"><div class="a-card-h"><h3>How your direct bookings flow</h3><span class="ag-meta">' + (issues.length ? issues.length + (issues.length === 1 ? ' link paused' : ' links paused') : S().live && !c('stripe') ? 'Running, with booking requests' : 'Everything is running') + '</span></div>' +
        '<div class="ag-dflow"><div class="ag-dcol"><span class="eyebrow">Guests find you</span>' +
          node('Google search', c('gsc') ? 'Pages indexed, rankings tracked' : 'Rankings not tracked', c('google') || c('gsc'), 'search') +
          '<div class="ag-dn ag-dn-ai"><span class="ag-dn-i">' + I('search') + '</span><span><b>AI answers</b><small>' + BB.aiLogos(['chatgpt', 'gemini', 'perplexity', 'google'], 'ag-dn-logos') + '</small></span><i class="ag-dn-s" aria-label="Working"></i></div>' +
          node('Your guest list', c('email') ? ((n => n + (n === 1 ? ' subscribed guest' : ' subscribed guests'))(s.guests.filter(g => g.subscribed).length)) : 'Emails paused', c('email'), 'mail') +
          '<div class="ag-dn opt' + (syncing.length ? ' on' : '') + '"><span class="ag-dn-i">' + I('sync') + '</span><span><b>Calendar sync</b><small>' + (syncing.length ? 'Blocking dates booked on ' + syncing.map(i => i.id === 'cm' ? 'your channel manager' : BB.CHANNEL[i.id]).join(', ') : 'Optional add-on, off') + '</small></span><em class="ag-opt">Optional</em></div>' +
        '</div>' +
        '<div class="ag-darr" aria-hidden="true"><span>' + I('arrow') + '</span><small>Book direct</small></div>' +
        '<div class="ag-dcol ag-dmid"><div class="ag-dhub">' + BB.MARK + '<b>Your booking sites</b><small class="mono">' + esc(domains[0]) + (domains.length > 1 ? ' and ' + (domains.length - 1) + ' more' : '') + '</small><small>One calendar for ' + (s.properties.length === 1 ? 'your home' : s.properties.length + ' homes') + '. Every booking, guest and payment is yours.</small></div></div>' +
        '<div class="ag-darr" aria-hidden="true"><span>' + I('arrow') + '</span><small>Runs the stay</small></div>' +
        '<div class="ag-dcol"><span class="eyebrow">Then for every guest</span>' + node('Payment', c('stripe') ? 'Instant booking with Stripe' : 'Request-to-book only', c('stripe'), 'card') + node('Guest app', c('stripe') ? 'Check-in, deposit, guidebook' : 'Check-in without deposit hold', c('stripe'), 'phone') + node('Smart locks', c('lock') ? 'A code for every stay' : 'Codes set by hand', c('lock'), 'lock') + node('Messages', c('email') && c('sms') ? 'Email and text' : c('email') ? 'Email only' : c('sms') ? 'Text only' : 'Paused', c('email') || c('sms'), 'inbox') + '</div></div>' +
        (issues.length ? '<div class="ag-issues">' + issues.map(i => '<p>' + I('plug') + '<span><b>' + esc(i.name) + ' is off.</b> ' + esc(CN[i.id].off) + '</span><button class="btn sm" data-ag="cn-toggle" data-v="' + i.id + '">Reconnect</button></p>').join('') + '</div>' : '') + '</section>';
      // One row per home: the link we read, how the last check went, and the link to paste back into that site.
      const linkStatus = (i, pid) => { const st2 = (i.status || {})[pid]; if (!st2) return ''; return '<small class="ag-calf-s ' + (st2.error ? 'bad' : 'good') + '">' + (st2.error ? I('x') + esc(st2.error) : I('check') + 'Checked ' + esc(BB.ago(new Date(st2.ok || st2.checked).toLocaleString('sv-SE', { timeZone: 'Europe/London' }).replace(' ', 'T').slice(0, 16))) + ' · ' + (st2.count || 0) + (st2.count === 1 ? ' stay or block' : ' stays and blocks') + (st2.empty ? ' (link came back empty, confirming on the next check)' : '')) + '</small>'; };
      const calForm = (inst, i) => '<div class="ag-calf">' + S().properties.map(p => { const fid = ID(inst, 'cal-' + i.id + '-' + p.id); const base = (BB.BOOT && BB.BOOT.icalFeeds || {})[p.id]; const feed = base && base.replace(/\.ics$/, '.' + i.id + '.ics');
          return '<div class="ag-calf-r"><label class="field"><span>' + esc(p.short) + ': calendar link from ' + (i.id === 'other' ? 'the other site' : 'your ' + esc(i.name)) + '</span><input id="' + fid + '" type="url" inputmode="url" placeholder="https://… .ics" value="' + esc((i.links || {})[p.id] || '') + '"></label>' +
            '<button class="btn sm" data-ag="cn-cal-save" data-v="' + i.id + '" data-pid="' + p.id + '" data-el="' + fid + '">Save</button>' + linkStatus(i, p.id) +
            (feed ? '<p class="ag-calf-x"><small>Paste this into ' + (i.id === 'other' ? 'that site' : 'your ' + esc(i.name)) + ' (import calendar) so it closes dates booked on your site' + (i.id === 'cm' ? '' : ' and on your other synced calendars') + ':</small><code class="mono" id="' + fid + '-x">' + esc(feed) + '</code><button type="button" class="btn sm ghost" data-ag="cn-copy" data-v="' + esc(feed) + '" data-el="' + fid + '-x">Copy</button></p>' : '') + '</div>'; }).join('') +
          (i.id === 'cm' ? '<p class="ag-note">' + I('bolt') + '<span>If your channel manager already connects to Airbnb, Vrbo or Booking.com, add only its link here, not theirs as well. If it is Beds24, Smoobu, Hostaway, Guesty or Lodgify, connect it directly below instead: it is faster.</span></p>' : '') +
          (S().account.addon ? '' : '<p class="ag-note">' + I('bolt') + '<span>Saving a link adds the calendar sync add-on, £15 a month, to your plan.</span></p>') + '</div>';
      // Channel manager API: the key form, then which listing is which home.
      const apiForm = (inst, i) => {
        const info = CN[i.id] || {};
        if (!i.connected) return st.cn_open === i.id ? '<div class="ag-calf">' + (info.fields || []).map(([k, label, secret]) => '<div class="ag-calf-r"><label class="field"><span>' + esc(i.name) + ' ' + esc(label.toLowerCase()) + '</span><input id="' + ID(inst, 'api-' + i.id + '-' + k) + '" type="' + (secret ? 'password' : 'text') + '" autocomplete="off" placeholder="Paste your ' + esc(label.toLowerCase()) + '"></label></div>').join('') +
          '<div class="ag-acts-row"><button class="btn sm primary" data-ag="cn-api" data-v="' + i.id + '">' + (st.cn_busy === i.id ? 'Checking…' : 'Connect ' + esc(i.name)) + '</button></div>' +
          '<p class="ag-note">' + I('key') + '<span>' + esc(info.how || '') + ' The key is checked with ' + esc(i.name) + ', kept encrypted, and never shown again. We only read and close dates: no guest details, prices or messages.</span></p>' +
          (S().account.addon ? '' : '<p class="ag-note">' + I('bolt') + '<span>Connecting adds the calendar sync add-on, £15 a month, to your plan.</span></p>') + '</div>' : '';
        const ls = i.listings || [];
        const base = (BB.BOOT && BB.BOOT.icalFeeds) || {};
        return '<div class="ag-calf">' + S().properties.map(p => { const cur = (i.map || {})[p.id] || '';
          return '<div class="ag-calf-r"><label class="field"><span>' + esc(p.short) + ' in ' + esc(i.name) + '</span><select class="input" data-agmap="' + i.id + '" data-pid="' + p.id + '"><option value="">Not linked</option>' + ls.map(l => '<option value="' + esc(l.id) + '"' + (String(cur) === String(l.id) ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('') + '</select></label>' + (cur ? linkStatus(i, p.id) : '') +
            (i.readOnly && base[p.id] ? '<p class="ag-calf-x"><small>Add this link to the property in ' + esc(i.name) + ' (Calendar, Sync) so your direct bookings close dates there too:</small><code class="mono" id="' + ID(inst, 'apix-' + p.id) + '">' + esc(base[p.id].replace(/\.ics$/, '.cm.ics')) + '</code><button type="button" class="btn sm ghost" data-ag="cn-copy" data-v="' + esc(base[p.id].replace(/\.ics$/, '.cm.ics')) + '" data-el="' + ID(inst, 'apix-' + p.id) + '">Copy</button></p>' : '') + '</div>'; }).join('') +
          (ls.length ? '' : '<p class="ag-note">' + I('x') + '<span>We found no listings in your ' + esc(i.name) + ' account.</span></p>') + '</div>';
      };
      const lockForm = (inst, i) => i.connected
        ? '<div class="ag-calf">' + ((i.locks || []).length ? '<p class="ag-note">' + I('key') + '<span>' + esc(i.locks.map(l => l.name).join(', ')) + '. Pick the lock for each home in Website & SEO, under Guest details.</span></p>' : '<p class="ag-note">' + I('key') + '<span>No locks found in your Nuki account yet.</span></p>') + '</div>'
        : (st.cn_open === 'lock' ? '<div class="ag-calf"><div class="ag-calf-r"><label class="field"><span>Nuki API token</span><input id="' + ID(inst, 'nuki') + '" type="password" autocomplete="off" placeholder="Paste your token"></label><button class="btn sm primary" data-ag="cn-nuki" data-el="' + ID(inst, 'nuki') + '">' + (st.cn_busy ? 'Checking…' : 'Connect') + '</button></div>' +
          '<p class="ag-note">' + I('bolt') + '<span>In Nuki Web, open API, create a token with permission to manage smart locks, and paste it here. We create a code for each stay and remove it after checkout.</span></p></div>' : '');
      const icard = i => {
        const info = CN[i.id] || {}; const conf = st.cn_conf === i.id; const r = res && res.id === i.id ? res : null; const ad = i.addon;
        if (soon(i.id)) return '<article class="ag-icard off"><div class="ag-ic-h"><span class="ag-logo l-' + i.id + '">' + esc(i.name.replace(/[^A-Za-z]/g, '').slice(0, 2)) + '</span><div><b>' + esc(i.name) + '</b><small>' + esc(i.detail || '') + '</small></div>' + BB.pill('muted', 'Coming soon') + '</div><p class="ag-ic-d">' + esc(info.does || info.on || '') + '</p></article>';
        const pillH = i.connected && ad && i.error ? BB.pill('warn', 'Needs a look') : i.connected ? BB.pill('good', ad ? 'Syncing' : 'Connected') : ad ? BB.pill('muted', 'Not added') : BB.pill(info.off && (!S().live || i.lastSync) ? 'warn' : 'muted', 'Off');
        const desc = ad ? (i.connected ? info.on : i.detail) : (i.connected ? (info.on || info.does || '') : (info.off || info.does || ''));
        return '<article class="ag-icard' + (i.connected ? '' : ' off') + (ad ? ' addon' : '') + '"><div class="ag-ic-h"><span class="ag-logo l-' + i.id + '">' + esc(i.name.replace(/[^A-Za-z]/g, '').slice(0, 2)) + '</span><div><b>' + esc(i.name) + '</b><small>' + esc(ad ? (i.api ? (i.readOnly ? 'Channel manager API · reads bookings' : 'Channel manager API · two-way') : i.connected ? 'Calendar link (iCal)' : 'Included in the Calendar sync add-on') : i.detail) + '</small></div>' + pillH + '</div>' +
          '<p class="ag-ic-d">' + esc(desc || '') + '</p>' +
          (conf ? '<div class="ag-ic-conf"><p><b>' + (ad ? 'Stop calendar sync for your ' + esc(i.name) + '?' : 'Disconnect ' + esc(i.name) + '?') + '</b> ' + esc(info.off || info.stop) + '</p><div class="ag-acts-row"><button class="btn sm danger" data-ag="cn-toggle" data-v="' + i.id + '">' + (ad ? 'Stop sync' : 'Disconnect') + '</button><button class="btn sm ghost" data-ag="cn-keep">' + (ad ? 'Keep sync on' : 'Keep connected') + '</button></div></div>' : '') +
          (ad && !i.api && S().live && (i.connected || st.cn_open === i.id) ? calForm(inst, i) : '') +
          (i.api && S().live ? apiForm(inst, i) : '') +
          (i.id === 'lock' && S().live ? lockForm(inst, i) : '') +
          (ad && !S().live && i.connected && info.ical ? '<p class="ag-ic-link mono">' + I('cal') + '<span>' + esc(info.ical) + '</span></p>' : '') +
          (r ? '<div class="ag-ic-res">' + (r.blk ? I('check') + '<span>' + esc(r.blk.note) + ': <button type="button" class="ag-link" data-ag-nav="calendar">' + esc(BB.q.property(r.blk.pid).short) + ', ' + D.fmt(r.blk.from) + ' – ' + D.fmt(r.blk.to) + '</button>. Blocked on your sites.</span>' : I('check') + '<span>Checked. No new dates.</span>') + '</div>' : '') +
          '<div class="ag-ic-f"><small class="muted mono">' + (i.lastSync ? (ad ? 'Checked ' : 'Last sync ') + esc(BB.ago(i.lastSync)) : ad ? 'Not added' : 'Never synced') + '</small><div class="ag-acts-row">' +
            (ad && i.connected ? '<button class="btn sm" data-ag="cn-sync" data-v="' + i.id + '">' + I('sync') + 'Check now</button>' : '') +
            (conf ? '' : '<button class="btn sm ' + (i.connected ? 'ghost' : ad ? '' : 'primary') + '" data-ag="cn-toggle" data-v="' + i.id + '">' + (i.connected ? (ad ? 'Stop sync' : 'Disconnect') : (i.api ? 'Connect ' + esc(i.name) : ad ? 'Add calendar link' : 'Connect')) + '</button>') + '</div></div></article>';
      };
      return wrap(inst, 'ag-conn',
        vh('Connections', 'What runs your direct bookings, from payments and email to door codes, plus optional calendar sync. Turn one off and see exactly what changes.', syncing.length ? '<button class="btn" data-ag="cn-syncall">' + I('sync') + 'Check synced calendars</button>' : '') +
        (res && res.id === 'all' ? '<div class="ag-banner ' + (res.blks.length ? 'good' : 'info') + '">' + I(res.blks.length ? 'check' : 'sync') + '<div><p>' + (res.blks.length ? '<b>' + res.blks.length + (res.blks.length === 1 ? ' stay' : ' stays') + ' booked elsewhere.</b> Those dates are now blocked on your own sites, so you never double book.' : 'Calendars checked. No new dates.') + '</p>' + (res.blks.length ? '<div class="ag-links">' + res.blks.map(k => '<button class="btn sm" data-ag-nav="calendar">' + esc(k.note) + ' · ' + esc(BB.q.property(k.pid).short) + ' · ' + D.fmt(k.from) + ' – ' + D.fmt(k.to) + '</button>').join('') + '</div>' : '') + '</div></div>' : '') +
        diagram +
        groups.map(([gname, list]) => '<section class="ag-group"><h3 class="ag-gh">' + I(GICON[gname] || 'plug') + esc(gname) + '<span class="muted">' + list.filter(i => i.connected).length + ' of ' + list.length + ' connected</span></h3><div class="ag-icards">' + list.map(icard).join('') + '</div></section>').join('') +
        (addons.length ? '<section class="ag-group ag-addons"><div class="ag-addon-h"><div><span class="eyebrow">Optional add-on</span><h3 class="disp">Calendar sync add-on, £15/month</h3><p>Calendar sync with your channel manager, Airbnb, Vrbo, Booking.com or any site with a calendar link. Paste each calendar link (iCal) and dates booked there are blocked on your sites, then paste your Bookingbooster link back into each site so they block each other and your direct bookings. We check every few minutes, and again the moment a guest starts booking. Dates only: never guests, prices or messages. You do not need it to take direct bookings.</p></div>' + (syncing.length ? BB.pill('good', 'On for ' + syncing.length + (syncing.length === 1 ? ' calendar' : ' calendars')) : BB.pill('muted', 'Not added')) + '</div><div class="ag-icards">' + addons.filter(i => !i.api).map(icard).join('') + '</div>' +
          (addons.some(i => i.api) ? '<div class="ag-addon-h ag-addon-sub"><div><h3 class="disp">Or connect your channel manager directly</h3><p>Use Beds24, Smoobu, Hostaway, Guesty or Lodgify? Connect it with your own API key instead of calendar links. Dates booked anywhere close on your sites within minutes, and your direct bookings close the same nights in your channel manager, which passes them on to Airbnb, Booking.com and Vrbo. Calendar links can take a few hours to reach Airbnb; this does not.</p></div></div><div class="ag-icards">' + addons.filter(i => i.api).map(icard).join('') + '</div>' : '') + '</section>' : '') + BB.aiTm('ag-tm'));
    },
  }, hooks);
})();
