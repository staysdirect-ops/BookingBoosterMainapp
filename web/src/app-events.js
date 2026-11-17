/* Bookingbooster: Event ads in the host console (Grow → Event ads).
   Finds events, training courses and conferences near each home that run for two or more days, shows which nights
   are still free for each one, and writes a ready-to-run ad pack: Facebook and Instagram ads with images drawn from the
   home's photo, a Google search ad with keywords, who to target and when, and a landing page with the dates and a code. */
(function () {
  const BB = window.BB; BB.appViews = BB.appViews || {};
  const V = BB.appViews, esc = BB.esc, I = BB.icon;
  const S = () => BB.store.get();
  const demo = () => !!(BB.BOOT && BB.BOOT.mode === 'demo');
  const API = () => (demo() ? '/api/demo/' : '/api/');
  const live = () => !!(BB.api && BB.BOOT && (BB.BOOT.mode === 'host' || BB.BOOT.mode === 'demo'));
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const P = s => new Date(s + 'T00:00:00Z'), add = (s, n) => { const x = P(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dm = s => P(s).getUTCDate() + ' ' + MON[P(s).getUTCMonth()];
  const range = (a, b) => a === b ? dm(a) : P(a).getUTCMonth() === P(b).getUTCMonth() ? P(a).getUTCDate() + '–' + dm(b) : dm(a) + ' – ' + dm(b);
  const KIND_ICON = { course: 'pen', conference: 'users', expo: 'tag', show: 'star', festival: 'play', sport: 'bolt', exam: 'check', other: 'cal' };
  const vh = (title, sub, acts) => '<div class="a-vh"><div><h2 class="disp">' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acts ? '<div class="a-acts">' + acts + '</div>' : '') + '</div>';

  /* ---------- data from the server (events come back with how they sit against the calendar today) ---------- */
  const D = { list: null, busy: false, loading: null, open: null };
  async function load(inst, force) {
    if (D.loading || (D.list && !force)) return;
    D.loading = BB.api.call(API() + 'eventads/list', null, 'GET').then(j => { D.list = j; }).catch(e => BB.toast(e.message, 'bad')).finally(() => { D.loading = null; inst.render(); });
  }
  async function call(inst, path, body, okMsg) {
    try { const j = await BB.api.call(API() + 'eventads/' + path, body); if (j.state) BB.api.accept(j); if (okMsg) BB.toast(okMsg, 'good'); await load(inst, true); return j; }
    catch (e) { BB.toast(e.message, 'bad'); return null; }
    finally { inst.render(); }
  }
  const ads = () => (((S().studio || {}).events || {}).ads) || [];
  const fnOf = a => (((S().studio || {}).funnels) || []).find(f => f.id === a.funnelId);

  /* ---------- the ad images, drawn on a canvas so the host can download them as PNGs ---------- */
  const IMG = {};
  function photo(p, inst) {
    const u = ((p.photos || [])[0] || {}).url; if (!u) return null;
    if (IMG[u]) return IMG[u].ok ? IMG[u].img : null;
    const img = new Image(); IMG[u] = { img, ok: false }; img.crossOrigin = 'anonymous';
    img.onload = () => { IMG[u].ok = true; inst.render(); }; img.src = u; return null;
  }
  function wrap(c, text, x, y, max, lh, lines) {
    const words = String(text).split(' '); let line = '', n = 0;
    for (let i = 0; i < words.length; i++) {
      const t = line ? line + ' ' + words[i] : words[i];
      if (c.measureText(t).width > max && line) { if (n === lines - 1) { c.fillText(line + '…', x, y); return y + lh; } c.fillText(line, x, y); y += lh; n++; line = words[i]; } else line = t;
    }
    if (line) { c.fillText(line, x, y); y += lh; } return y;
  }
  function draw(cv, a, p, img) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height, tall = H > W, pad = 84, col = p.color || '#2F5D46';
    c.clearRect(0, 0, W, H);
    if (img) { const r = Math.max(W / img.width, H / img.height), w = img.width * r, h = img.height * r; c.drawImage(img, (W - w) / 2, (H - h) / 2, w, h); }
    else { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, col); g.addColorStop(1, '#14130F'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.globalAlpha = 0.08; c.fillStyle = '#fff'; for (let i = 0; i < 9; i++) { c.beginPath(); c.arc(W * 0.85, H * 0.18, 120 + i * 90, 0, 7); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke(); } c.globalAlpha = 1; }
    const sh = c.createLinearGradient(0, H * (tall ? 0.35 : 0.25), 0, H); sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,.82)'); c.fillStyle = sh; c.fillRect(0, 0, W, H);
    // the event, as a label at the top
    c.font = '700 30px system-ui, -apple-system, Segoe UI, sans-serif'; const tag = ('For ' + a.event.name).toUpperCase().slice(0, 44); const tw = c.measureText(tag).width;
    c.fillStyle = 'rgba(255,255,255,.94)'; roundRect(c, pad, pad, tw + 44, 62, 31); c.fill(); c.fillStyle = '#111'; c.fillText(tag, pad + 22, pad + 42);
    // headline, dates and the home
    let y = H - (tall ? 760 : 470);
    c.fillStyle = '#fff'; c.font = '500 ' + (tall ? 92 : 80) + 'px Georgia, "Times New Roman", serif';
    y = wrap(c, 'Stay near ' + (a.event.venue || a.event.town || p.area) , pad, y, W - pad * 2, tall ? 102 : 88, 2);
    c.font = '700 44px system-ui, -apple-system, Segoe UI, sans-serif'; c.fillStyle = '#FFE8A8';
    y = wrap(c, 'Free ' + range(a.stay.from, a.stay.to) + ' · ' + a.stay.n + ' night' + (a.stay.n === 1 ? '' : 's'), pad, y + 18, W - pad * 2, 54, 1);
    c.font = '400 36px system-ui, -apple-system, Segoe UI, sans-serif'; c.fillStyle = 'rgba(255,255,255,.9)';
    y = wrap(c, p.name + ' · ' + p.bedrooms + ' bedrooms · sleeps ' + p.maxGuests, pad, y + 8, W - pad * 2, 46, 2);
    // the offer, as a button
    const btn = a.code ? 'Book direct · ' + a.pct + '% off with ' + a.code : 'Book direct, no booking fees';
    c.font = '700 38px system-ui, -apple-system, Segoe UI, sans-serif'; const bw = Math.min(W - pad * 2, c.measureText(btn).width + 70);
    c.fillStyle = '#fff'; roundRect(c, pad, y + 26, bw, 88, 44); c.fill(); c.fillStyle = '#111'; c.fillText(btn, pad + 35, y + 84);
    c.font = '500 28px system-ui, -apple-system, Segoe UI, sans-serif'; c.fillStyle = 'rgba(255,255,255,.75)'; if (tall) c.fillText(String(S().account.business || '').slice(0, 50), pad, H - 200);
  }
  function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function paint(inst) {
    inst.root.querySelectorAll('canvas[data-ea]').forEach(cv => { const a = ads().find(x => x.id === cv.dataset.ea), p = a && S().properties.find(x => x.id === a.propertyId); if (a && p) draw(cv, a, p, photo(p, inst)); });
  }

  /* ---------- actions ---------- */
  const H = {};
  const pid = inst => inst.st.ea_home || (S().properties[0] || {}).id;
  H['ea-find'] = async inst => { if (D.busy) return; D.busy = true; inst.render(); const pr = Object.assign({ radius: 25, minDays: 2, months: 6 }, (D.list || {}).prefs, inst.st.ea_prefs || {});
    const j = await call(inst, 'find', Object.assign({ propertyId: pid(inst) }, pr)); D.busy = false;
    if (j) BB.toast(j.events.filter(e => e.propertyId === pid(inst)).length ? (j.added ? j.added + ' new event' + (j.added === 1 ? '' : 's') + ' found' : 'No new events this time') : 'Nothing found yet. Try a wider area or add one yourself.', 'good');
    inst.render(); };
  H['ea-home'] = (inst, v) => inst.set({ ea_home: v });
  H['ea-make'] = async (inst, v) => { if (inst.st.ea_making) return; inst.st.ea_making = v; inst.render(); const f = inst.st.ea_offer || {};
    const j = await call(inst, 'create', { eventId: v, pct: f.pct != null ? +f.pct : 10, code: f.code || '', landing: true }); inst.st.ea_making = null;
    if (j && j.ad) { inst.st.ea_open = j.ad.id; inst.st.ea_tab = 'meta'; BB.toast('Your ads are ready', 'good'); } inst.render(); };
  H['ea-open'] = (inst, v) => inst.set({ ea_open: v, ea_tab: 'meta', ea_wd: null });
  H['ea-close'] = inst => inst.set({ ea_open: null });
  H['ea-tab'] = (inst, v) => inst.set({ ea_tab: v, ea_wd: null });
  H['ea-hide'] = (inst, v) => call(inst, 'hide', { id: v }, 'Hidden');
  H['ea-addform'] = inst => inst.set({ ea_add: !inst.st.ea_add, ea_new: inst.st.ea_new || { kind: 'course' } });
  H['ea-add'] = async inst => { const n = inst.st.ea_new || {}; const j = await call(inst, 'add', Object.assign({ propertyId: pid(inst) }, n), 'Event added'); if (j) inst.set({ ea_add: false, ea_new: { kind: 'course' } }); };
  H['ea-dl'] = (inst, v) => { const cv = inst.root.querySelector('canvas[data-ea][data-f="' + v + '"]'); if (!cv) return;
    try { cv.toBlob(b => { const u = URL.createObjectURL(b), l = document.createElement('a'); l.href = u; l.download = 'event-ad-' + v + '.png'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }, 'image/png'); }
    catch (_) { BB.toast('This photo cannot be downloaded from here. Right-click the image and save it instead.', 'bad'); } };
  H['ea-copy'] = (inst, v, el) => { const a = ads().find(x => x.id === inst.st.ea_open); if (!a) return; const t = { primary: a.meta.primary, headline: a.meta.headline, description: a.meta.description, heads: a.google.headlines.join('\n'), descs: a.google.descriptions.join('\n'), kw: a.google.keywords.map(k => '"' + k + '"').join('\n'), neg: a.google.negatives.join('\n'), url: linkOf(a) }[v]; BB.copy(t || '', el); };
  H['ea-save'] = inst => { const d = inst.st.ea_wd || {}, pt = {}; ['primary', 'headline', 'description'].forEach(k => { if (d[k] != null) (pt.meta = pt.meta || {})[k] = d[k]; }); ['headlines', 'descriptions', 'keywords'].forEach(k => { if (d[k] != null) (pt.google = pt.google || {})[k] = d[k]; });
    inst.st.ea_wd = null; call(inst, 'edit', { id: inst.st.ea_open, patch: pt }, 'Saved'); };
  H['ea-status'] = (inst, v, el) => call(inst, 'edit', { id: v, patch: { status: el.dataset.s } }, el.dataset.s === 'running' ? 'Marked as running' : 'Saved');
  H['ea-live'] = async (inst, v) => { try { const j = await BB.api.call(API() + 'funnels/edit', { id: v, patch: { status: 'live' } }); BB.api.accept(j); BB.toast('Landing page is live', 'good'); } catch (e) { BB.toast(e.message, 'bad'); } inst.render(); };
  H['ea-del'] = (inst, v) => { if (inst.st.ea_del !== v) { inst.set({ ea_del: v }); return; } inst.st.ea_del = null; inst.st.ea_open = null; call(inst, 'delete', { id: v, landing: true }, 'Ads deleted'); };

  function linkOf(a) {
    const f = fnOf(a), slug = (BB.BOOT && BB.BOOT.slug) || ((Object.values((BB.BOOT && BB.BOOT.siteUrls) || {})[0] || '').match(/\/s\/([^/]+)/) || [])[1] || 'host';
    const base = f ? location.origin + (demo() ? '/demo/funnel/' + f.id + '/offer' : '/f/' + slug + '/' + f.id) : (((BB.BOOT && BB.BOOT.siteUrls) || {})[a.propertyId] || location.origin);
    return base + (base.includes('?') ? '&' : '?') + 'utm_medium=paid&utm_campaign=' + encodeURIComponent((a.code || a.id).toLowerCase());
  }

  /* ---------- views ---------- */
  function fitPill(ft) {
    return ft.status === 'free' ? BB.pill('good', ft.free + ' night' + (ft.free === 1 ? '' : 's') + ' free') : ft.status === 'part' ? BB.pill('warn', ft.free + ' of ' + ft.nights + ' nights free') : BB.pill('muted', 'Booked');
  }
  function eventRow(e, st) {
    const a = ads().find(x => x.eventId === e.id), ft = e.fit, making = st.ea_making === e.id;
    return '<div class="a-card ea-row"><div class="ea-date"><b>' + P(e.start).getUTCDate() + '</b><small>' + MON[P(e.start).getUTCMonth()] + '</small></div>' +
      '<div class="ea-main"><b>' + esc(e.name) + '</b><small>' + I(KIND_ICON[e.kind] || 'cal') + esc((D.list.meta.kinds || {})[e.kind] || 'Event') + ' · ' + range(e.start, e.end) + ' · ' + e.days + ' days' + (e.venue || e.town ? ' · ' + esc([e.venue, e.town].filter((x, i, l) => x && l.indexOf(x) === i && !(i && l[0].includes(x))).join(', ')) : '') + (e.attendance ? ' · about ' + Number(e.attendance).toLocaleString('en-GB') + ' people' : '') + '</small>' +
      (e.audience || e.why ? '<small class="muted">' + esc(e.audience || e.why) + '</small>' : '') +
      '<small class="ea-src">' + esc(e.source === 'web' ? 'Found by web search' : e.source === 'sample' ? 'Sample event for the demo' : e.source === 'manual' ? 'Added by you' : 'From ' + ((D.list.meta.sources || []).find(x => x.id === e.source) || {}).name) + (e.url ? ' · <a href="' + esc(e.url) + '" target="_blank" rel="noopener">Check the dates</a>' : '') + '</small></div>' +
      '<div class="ea-act">' + fitPill(ft) + (ft.stay ? '<small class="muted">' + range(ft.stay.from, ft.stay.to) + ' · ' + BB.money(ft.value) + '</small>' : '') +
      (a ? '<button class="btn sm" data-ea="ea-open" data-v="' + a.id + '">' + I('chart') + 'Open ads</button>' : ft.stay ? '<button class="btn sm primary" data-ea="ea-make" data-v="' + e.id + '"' + (making ? ' disabled' : '') + '>' + I('spark') + (making ? 'Writing your ads…' : 'Create ads') + '</button>' : '') +
      '<button class="btn sm ghost" data-ea="ea-hide" data-v="' + e.id + '" aria-label="Hide ' + esc(e.name) + '">' + I('x') + '</button></div></div>';
  }
  function listView(inst) {
    const st = inst.st, s = S(), L = D.list, home = pid(inst), pr = Object.assign({ radius: 25, minDays: 2, months: 6 }, L.prefs, st.ea_prefs || {});
    const scan = (L.scans || {})[home], evs = (L.events || []).filter(e => e.propertyId === home), open = evs.filter(e => e.fit.status !== 'booked'), full = evs.filter(e => e.fit.status === 'booked');
    const sel = (k, opts, lab) => '<label class="field"><span>' + lab + '</span><select data-eaf="pr.' + k + '">' + opts.map(([v, t]) => '<option value="' + v + '"' + (+pr[k] === v ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>';
    const srcs = (L.meta.sources || []).map(x => '<span class="ea-chip' + (x.on ? ' on' : '') + '" title="' + esc(x.finds + ' ' + x.price + '.') + '">' + (x.on ? I('check') : '') + esc(x.name) + '</span>').join('');
    const n = new Set(ads().filter(a => a.propertyId === home).map(a => a.eventId)).size;
    return '<section class="a-card ag-card ea-find"><div class="ea-form">' +
      (s.properties.length > 1 ? '<label class="field"><span>Home</span><select data-eaf="home">' + s.properties.map(p => '<option value="' + p.id + '"' + (p.id === home ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>' : '') +
      sel('radius', [[10, 'Within 10 miles'], [25, 'Within 25 miles'], [50, 'Within 50 miles']], 'Area') + sel('minDays', [[2, '2 days or more'], [3, '3 days or more'], [5, '5 days or more']], 'How long') + sel('months', [[3, 'Next 3 months'], [6, 'Next 6 months'], [12, 'Next 12 months']], 'When') +
      '<button class="btn primary" data-ea="ea-find"' + (D.busy ? ' disabled' : '') + '>' + I('search') + (D.busy ? 'Searching… this can take a minute' : 'Find events') + '</button></div>' +
      '<div class="ea-srcs"><small class="muted">Sources</small>' + srcs + '</div>' +
      (scan ? '<p class="muted ea-last">Last search ' + new Date(scan.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + (scan.place ? ' around ' + esc(scan.place) : '') + ': ' + scan.sources.map(x => esc(((L.meta.sources || []).find(q => q.id === x.id) || { name: 'Samples' }).name) + ' ' + (x.error ? 'did not answer' : x.n)).join(', ') + '.</p>' : '') + '</section>' +
      '<div class="sb-kpis ea-kpis"><div><small>Events found</small><b class="num">' + evs.length + '</b></div><div><small>With free nights</small><b class="num">' + open.length + '</b></div><div><small>Free nights to sell</small><b class="num">' + open.reduce((t, e) => t + (e.fit.stay ? (P(e.fit.stay.to) - P(e.fit.stay.from)) / 864e5 : 0), 0) + '</b></div><div><small>Worth</small><b class="num">' + BB.money(open.reduce((t, e) => t + e.fit.value, 0)) + '</b></div><div><small>Ad packs</small><b class="num">' + n + '</b></div></div>' +
      (open.length ? '<div class="ea-list">' + open.map(e => eventRow(e, st)).join('') + '</div>'
        : '<div class="a-card ag-card sb-fempty"><span class="disp">Fill the nights other people’s <em>events</em> create</span><p class="muted">Courses, conferences, county shows and tournaments bring people who need a bed for a few nights. Find the ones near you, see which of your nights are still free, and get ready-made ads that say “we’re free that week”.</p><button class="btn primary" data-ea="ea-find">' + I('search') + 'Find events</button></div>') +
      (full.length ? '<details class="ea-full"><summary>' + full.length + ' event' + (full.length === 1 ? '' : 's') + ' you are already booked for</summary><div class="ea-list">' + full.map(e => eventRow(e, st)).join('') + '</div></details>' : '') +
      '<section class="a-card ag-card"><div class="a-card-h"><h3>Know about one we missed?</h3><button class="btn sm ghost" data-ea="ea-addform">' + I(st.ea_add ? 'x' : 'plus') + (st.ea_add ? 'Cancel' : 'Add an event') + '</button></div>' +
      (st.ea_add ? (() => { const v = st.ea_new || {}; return '<p class="muted" style="margin:0 0 12px">A course at the local college, a contract at the hospital, a wedding fair: anything that brings people for two nights or more.</p><div class="ea-form">' +
        '<label class="field ea-wide"><span>Name</span><input data-eaf="new.name" id="ea-n-name" maxlength="120" placeholder="SMSTS site manager course" value="' + esc(v.name || '') + '"></label>' +
        '<label class="field"><span>Type</span><select data-eaf="new.kind">' + Object.entries(L.meta.kinds).map(([k, t]) => '<option value="' + k + '"' + (v.kind === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
        '<label class="field"><span>First day</span><input type="date" data-eaf="new.start" id="ea-n-start" value="' + esc(v.start || '') + '"></label><label class="field"><span>Last day</span><input type="date" data-eaf="new.end" id="ea-n-end" value="' + esc(v.end || '') + '"></label>' +
        '<label class="field"><span>Venue</span><input data-eaf="new.venue" id="ea-n-venue" maxlength="100" value="' + esc(v.venue || '') + '"></label><label class="field ea-wide"><span>Link <em class="muted">optional</em></span><input data-eaf="new.url" id="ea-n-url" type="url" placeholder="https://" value="' + esc(v.url || '') + '"></label></div>' +
        '<div class="ag-acts-row"><button class="btn primary" data-ea="ea-add">' + I('plus') + 'Add event</button></div>'; })() : '') + '</section>';
  }

  function adView(inst, a) {
    const st = inst.st, p = S().properties.find(x => x.id === a.propertyId) || {}, f = fnOf(a), tab = st.ea_tab || 'meta', d = st.ea_wd = st.ea_wd || {}, pl = a.plan || {};
    const val = (k, v) => d[k] != null ? d[k] : v;
    const cnt = (v, n) => '<em class="ea-cnt' + (String(v).length > n ? ' bad' : '') + '">' + String(v).length + '/' + n + '</em>';
    const fld = (k, lab, v, n, rows) => '<label class="field"><span>' + lab + ' ' + cnt(val(k, v), n) + '</span>' + (rows ? '<textarea rows="' + rows + '" data-eaf="wd.' + k + '" id="ea-w-' + k + '">' + esc(val(k, v)) + '</textarea>' : '<input data-eaf="wd.' + k + '" id="ea-w-' + k + '" value="' + esc(val(k, v)) + '">') + '</label>';
    const copyBtn = (k, t) => '<button type="button" class="btn sm ghost" data-ea="ea-copy" data-v="' + k + '">' + I('out') + (t || 'Copy') + '</button>';
    const dirty = Object.keys(d).length;
    const url = linkOf(a), host = url.replace(/^https?:\/\//, '').split(/[/?]/)[0];
    let body = '';
    if (tab === 'meta') {
      body = '<div class="ea-two"><div>' + fld('primary', 'Primary text', a.meta.primary, 600, 5) + fld('headline', 'Headline', a.meta.headline, 40) + fld('description', 'Description', a.meta.description, 30) +
        '<div class="ag-acts-row">' + copyBtn('primary', 'Copy text') + copyBtn('headline', 'Copy headline') + copyBtn('url', 'Copy link') + '</div>' +
        '<p class="muted ea-note">Button: <b>Book now</b>. Link: <span class="mono">' + esc(url) + '</span></p></div>' +
        '<div class="ea-fb"><div class="ea-fb-h"><span class="ea-av">' + esc(String(S().account.business || 'B')[0]) + '</span><div><b>' + esc(S().account.business || '') + '</b><small>Sponsored</small></div></div><p>' + esc(val('primary', a.meta.primary)) + '</p>' +
        '<canvas data-ea="' + a.id + '" data-f="square" width="1080" height="1080"></canvas><div class="ea-fb-f"><div><small>' + esc(host.toUpperCase()) + '</small><b>' + esc(val('headline', a.meta.headline)) + '</b><small>' + esc(val('description', a.meta.description)) + '</small></div><span class="btn sm">Book now</span></div></div></div>' +
        '<div class="ea-imgs"><figure><canvas data-ea="' + a.id + '" data-f="feed" width="1080" height="1080"></canvas><figcaption>Feed · 1080 × 1080 <button class="btn sm" data-ea="ea-dl" data-v="feed">Download</button></figcaption></figure>' +
        '<figure><canvas data-ea="' + a.id + '" data-f="story" width="1080" height="1920"></canvas><figcaption>Stories and Reels · 1080 × 1920 <button class="btn sm" data-ea="ea-dl" data-v="story">Download</button></figcaption></figure>' +
        '<p class="muted ea-note">' + ((p.photos || []).length ? 'Drawn from your first photo.' : 'Add photos in Website &amp; SEO and your first one goes behind the words.') + ' Never use the event’s own logo or photos unless the organiser says you can.</p></div>';
    } else if (tab === 'google') {
      const hs = val('headlines', a.google.headlines.join('\n')).split('\n').filter(Boolean), ds = val('descriptions', a.google.descriptions.join('\n')).split('\n').filter(Boolean);
      body = '<div class="ea-two"><div>' +
        '<label class="field"><span>Headlines, one per line <em class="ea-cnt">' + hs.length + '/15, 30 characters each</em></span><textarea rows="9" data-eaf="wd.headlines" id="ea-w-headlines">' + esc(hs.join('\n')) + '</textarea></label>' +
        (hs.some(x => x.length > 30) ? '<p class="err">' + hs.filter(x => x.length > 30).length + ' headline(s) are over 30 characters. Google will not accept them.</p>' : '') +
        '<label class="field"><span>Descriptions, one per line <em class="ea-cnt">' + ds.length + '/4, 90 characters each</em></span><textarea rows="4" data-eaf="wd.descriptions" id="ea-w-descriptions">' + esc(ds.join('\n')) + '</textarea></label>' +
        '<label class="field"><span>Keywords, one per line <em class="ea-cnt">phrase match</em></span><textarea rows="6" data-eaf="wd.keywords" id="ea-w-keywords">' + esc(val('keywords', a.google.keywords.join('\n'))) + '</textarea></label>' +
        '<div class="ag-acts-row">' + copyBtn('heads', 'Copy headlines') + copyBtn('descs', 'Copy descriptions') + copyBtn('kw', 'Copy keywords') + copyBtn('neg', 'Copy negatives') + '</div>' +
        '<p class="muted ea-note">Negative keywords: ' + a.google.negatives.map(esc).join(', ') + '.</p></div>' +
        '<div><div class="ea-g"><small>Sponsored</small><div class="ea-g-u"><span class="ea-av sm">' + esc(String(S().account.business || 'B')[0]) + '</span><span>' + esc(host) + '</span></div><b>' + hs.slice(0, 3).map(esc).join(' | ') + '</b><p>' + esc(ds[0] || '') + ' ' + esc(ds[1] || '') + '</p></div>' +
        '<div class="ea-g"><small>Sponsored</small><div class="ea-g-u"><span class="ea-av sm">' + esc(String(S().account.business || 'B')[0]) + '</span><span>' + esc(host) + '</span></div><b>' + [hs[3], hs[0], hs[8]].filter(Boolean).map(esc).join(' | ') + '</b><p>' + esc(ds[2] || ds[0] || '') + '</p></div>' +
        '<p class="muted ea-note">Google mixes your headlines and descriptions to find the best ones. These are two of the ways it might show.</p></div></div>';
    } else if (tab === 'target') {
      const m = pl.meta || {}, g = pl.google || {};
      body = '<div class="ea-plan"><div class="ea-when"><div><small>Run the ads</small><b>' + dm(pl.runFrom) + ' – ' + dm(pl.runTo) + '</b><span class="muted">' + pl.days + ' days, ending 2 days before arrival</span></div><div><small>Suggested spend</small><b>' + BB.money(pl.total) + '</b><span class="muted">about 12% of what the stay is worth (' + BB.money(pl.value) + ')</span></div><div><small>Break even</small><b>1 booking</b><span class="muted">One stay pays for the whole campaign</span></div></div>' +
        '<div class="ea-two"><div class="a-card ea-tc"><h4>' + I('users') + 'Facebook and Instagram</h4><dl>' +
        '<dt>Budget</dt><dd>' + BB.money(m.budget) + ' in total, about ' + BB.money(m.daily) + ' a day</dd><dt>Objective</dt><dd>' + esc(m.objective) + '</dd><dt>Where</dt><dd>' + esc(m.location) + '</dd><dt>Age</dt><dd>' + esc(m.age) + '</dd>' +
        '<dt>Interests</dt><dd>' + (a.audience.interests || []).map(x => '<span class="ea-chip on">' + esc(x) + '</span>').join(' ') + '</dd>' + ((a.audience.jobs || []).length ? '<dt>Job titles</dt><dd>' + a.audience.jobs.map(x => '<span class="ea-chip on">' + esc(x) + '</span>').join(' ') + '</dd>' : '') +
        '<dt>Placements</dt><dd>' + esc(m.placements) + '</dd><dt>Also</dt><dd>Add a second ad set for people who visited your site in the last 60 days, if your Meta pixel is on.</dd></dl>' + (a.audience.notes ? '<p class="muted ea-note">' + esc(a.audience.notes) + '</p>' : '') + '</div>' +
        '<div class="a-card ea-tc"><h4>' + I('search') + 'Google search</h4><dl><dt>Budget</dt><dd>' + BB.money(g.budget) + ' in total, about ' + BB.money(g.daily) + ' a day</dd><dt>Bidding</dt><dd>' + esc(g.bidding) + '</dd><dt>Networks</dt><dd>' + esc(g.network) + '</dd><dt>Where</dt><dd>' + esc(g.location) + '</dd>' +
        '<dt>Keywords</dt><dd>' + a.google.keywords.length + ' phrase-match keywords (see Google search)</dd><dt>Schedule</dt><dd>' + dm(pl.runFrom) + ' to ' + dm(pl.runTo) + ', all day</dd></dl></div></div>' +
        '<p class="muted ea-note">Bookings made with code <b class="mono">' + esc(a.code || '—') + '</b> are counted against this campaign in Funnels. Turn the ads off as soon as the dates are booked.</p></div>';
    } else {
      body = f ? '<div class="ea-two"><div><p>The ads send people to a page made for ' + esc(a.event.name) + ', in your site’s style. It shows the free dates and the code, and the button opens your booking calendar with those dates already picked.</p>' +
        '<p class="ea-status">Status: ' + BB.pill(f.status === 'live' ? 'good' : 'warn', f.status === 'live' ? 'Live' : 'Draft, not live yet') + '</p><div class="ag-acts-row">' + (f.status === 'live' ? copyBtn('url', 'Copy link') : '<button class="btn primary" data-ea="ea-live" data-v="' + f.id + '">' + I('send') + 'Make it live</button>') + '<a class="btn ghost" href="#funnels">Edit the words in Funnels</a></div></div>' +
        '<div class="ea-pv"><iframe title="Landing page preview" loading="lazy" src="' + (demo() ? '/demo/' : '/app/') + 'funnel/' + f.id + '/offer?bare=1"></iframe></div></div>' : '<p class="muted">These ads link straight to your booking site.</p>';
    }
    return '<div class="sb-fdetail"><button type="button" class="ag-back" data-ea="ea-close">' + I('back') + 'All events</button>' +
      '<div class="a-vh sb-fh"><div><h2 class="disp">' + esc(a.event.name) + '</h2><p>' + range(a.event.start, a.event.end) + (a.event.venue ? ' · ' + esc(a.event.venue) : '') + ' · ' + esc(p.name || '') + ' free ' + range(a.stay.from, a.stay.to) + ' (' + a.stay.n + ' nights)' + (a.code ? ' · code <b class="mono">' + esc(a.code) + '</b>, ' + a.pct + '% off' : '') + (a.by === 'ai' ? ' · written by Claude' : '') + '</p></div><div class="a-acts">' +
      (a.status === 'running' ? BB.pill('good', 'Running') + '<button class="btn" data-ea="ea-status" data-v="' + a.id + '" data-s="done">Mark as finished</button>' : '<button class="btn" data-ea="ea-status" data-v="' + a.id + '" data-s="running">' + I('check') + 'I have started these ads</button>') + '</div></div>' +
      (f && f.status !== 'live' && tab !== 'landing' ? '<p class="ea-warn">' + I('bell') + 'The landing page is still a draft. <button class="lnk" data-ea="ea-tab" data-v="landing">Make it live</button> before you start the ads.</p>' : '') +
      '<div class="seg sb-tabs ea-tabs" role="group" aria-label="Ad pack">' + [['meta', 'Facebook & Instagram'], ['google', 'Google search'], ['target', 'Who, when and budget'], ['landing', 'Landing page']].map(([k, t]) => '<button type="button" aria-pressed="' + (k === tab) + '" data-ea="ea-tab" data-v="' + k + '">' + t + '</button>').join('') + '</div>' +
      '<div class="a-card ag-card">' + body + (tab === 'meta' || tab === 'google' ? '<div class="ag-acts-row ea-save"><button class="btn primary" data-ea="ea-save"' + (dirty ? '' : ' disabled') + '>' + I('check') + 'Save changes</button></div>' : '') + '</div>' +
      '<button class="btn ghost danger" data-ea="ea-del" data-v="' + a.id + '">' + (st.ea_del === a.id ? 'Tap again to delete these ads and their landing page' : 'Delete these ads') + '</button></div>';
  }

  V.eventads = {
    label: 'Event ads', group: 'Grow', icon: 'cal', order: 27,
    render(inst) {
      const sub = 'Find courses, conferences, shows and festivals near your home that last two days or more, see which nights are still free, and get ready-to-run ads for them.';
      if (!live()) return '<div class="ag sb ea">' + vh('Event ads', sub) + '</div>';
      if (!D.list) { load(inst); return '<div class="ag sb ea">' + vh('Event ads', 'Loading…') + '</div>'; }
      const a = inst.st.ea_open && ads().find(x => x.id === inst.st.ea_open);
      return '<div class="ag sb ea">' + (a ? adView(inst, a) : vh('Event ads', sub) + listView(inst)) + '</div>';
    },
    after(inst) { paint(inst); },
    click(ev, inst) { const a = ev.target.closest('[data-ea]'); if (a && a.tagName !== 'CANVAS' && H[a.dataset.ea]) { ev.preventDefault(); H[a.dataset.ea](inst, a.dataset.v, a); } },
    input(ev, inst) {
      const el = ev.target, k = el.dataset && el.dataset.eaf; if (!k) return; const st = inst.st;
      if (k === 'home') { st.ea_home = el.value; inst.render(); return; }
      const [sc, f] = k.split('.');
      if (sc === 'pr') { st.ea_prefs = Object.assign({}, st.ea_prefs, { [f]: +el.value }); return; }
      if (sc === 'new') { (st.ea_new = st.ea_new || {})[f] = el.value; if (f === 'start' && !st.ea_new.end) { st.ea_new.end = el.value; inst.render(); } return; }
      if (sc === 'wd') { const was = Object.keys(st.ea_wd || {}).length; (st.ea_wd = st.ea_wd || {})[f] = el.value; if (!was) inst.render(); }
    },
    change(ev, inst) { if (ev.target.tagName === 'SELECT') V.eventads.input(ev, inst); },
  };
})();
