/* Bookingbooster: the Site builder and Funnels views in the host console.
   Site builder: Claude designs a premium booking site for each home from the Studio design system; the host
   tweaks direction, words and sections, checks the design, previews on desktop and phone, then publishes.
   Funnels: focused opt-in and offer pages in the same style, with sign-ups going into the guest list. */
(function () {
  const BB = window.BB; BB.appViews = BB.appViews || {};
  const V = BB.appViews, esc = BB.esc, I = BB.icon, D = BB.D;
  const S = () => BB.store.get();
  const demo = () => !!(BB.BOOT && BB.BOOT.mode === 'demo');
  const API = () => (demo() ? '/api/demo/' : '/api/');
  const PRE = () => (demo() ? '/demo/' : '/app/');
  const live = () => !!(BB.api && BB.BOOT && (BB.BOOT.mode === 'host' || BB.BOOT.mode === 'demo'));
  const ago = t => { if (!t) return ''; const m = Math.round((Date.now() - new Date(t).getTime()) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + ' h ago' : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
  const em = t => esc(t || '').replace(/\*([^*]{1,40})\*/, '<em>$1</em>').replace(/\*/g, '');
  const vh = (title, sub, acts) => '<div class="a-vh"><div><h2 class="disp">' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acts ? '<div class="a-acts">' + acts + '</div>' : '') + '</div>';

  /* ---------- design system metadata (fonts, directions, vibes) ---------- */
  let META = null, metaP = null;
  function meta(inst) {
    if (META || !live()) return META;
    if (!metaP) metaP = BB.api.call(API() + 'studio/meta', null, 'GET').then(j => {
      META = j;
      const l = document.createElement('link'); l.rel = 'stylesheet';
      // only the display faces, so the font picker can show each pairing without loading every weight of every family
      const fams = [...new Set(Object.values(j.fonts || {}).map(f => f.display).concat(Object.values(j.directions).map(d => d.fonts.split(' & ')[0])))];
      l.href = 'https://fonts.googleapis.com/css2?' + fams.map(f => 'family=' + f.replace(/ /g, '+')).join('&') + '&display=swap&text=' + encodeURIComponent('AaBbGg Ccdefghiklmnoprstuvwy'); document.head.appendChild(l);
      inst.render();
    }).catch(() => { metaP = null; });
    return null;
  }
  async function call(inst, path, body, okMsg) {
    try { const j = await BB.api.call(API() + path, body); BB.api.accept(j); if (okMsg) BB.toast(okMsg, 'good'); return j; }
    catch (e) { BB.toast(e.message, 'bad'); return null; }
    finally { inst.render(); }
  }

  /* ---------- the live preview: one persistent iframe that floats over its slot, so repaints never reload it ---------- */
  const PV = { el: null, frame: null, src: '', slot: null, raf: 0 };
  function previewAfter(inst) {
    const slot = inst.root.querySelector('[data-sb-slot]');
    if (!slot) { if (PV.el) PV.el.hidden = true; PV.slot = null; return; }
    if (!PV.el) {
      PV.el = document.createElement('div'); PV.el.className = 'sb-float';
      PV.el.innerHTML = '<iframe title="Site preview" loading="eager"></iframe>'; document.body.appendChild(PV.el); PV.frame = PV.el.firstChild;
      const loop = () => { if (PV.slot && PV.slot.isConnected) { const r = PV.slot.getBoundingClientRect(); const s = PV.el.style; s.top = r.top + 'px'; s.left = r.left + 'px'; s.width = r.width + 'px'; s.height = r.height + 'px'; PV.el.hidden = r.height < 2; const w = +PV.slot.dataset.w || r.width; const k = r.width / w; PV.frame.style.width = w + 'px'; PV.frame.style.height = (r.height / k) + 'px'; PV.frame.style.transform = 'scale(' + k + ')'; const box = PV.slot.closest('.a-body') || document.body; const b = box.getBoundingClientRect(); const top = Math.max(0, b.top - r.top), bot = Math.max(0, r.bottom - Math.min(b.bottom, innerHeight)); s.clipPath = top || bot ? 'inset(' + top + 'px 0 ' + bot + 'px 0)' : ''; PV.el.hidden = r.height < 2 || top + bot >= r.height || !!document.querySelector('.a-modal-back'); } else if (PV.el) PV.el.hidden = true; PV.raf = requestAnimationFrame(loop); };
      loop();
    }
    PV.slot = slot; PV.el.hidden = false;
    const src = slot.dataset.src; if (src && src !== PV.src) { PV.src = src; PV.frame.src = src; PV.el.classList.add('loading'); PV.frame.onload = () => PV.el.classList.remove('loading'); }
  }
  BB.studioAfter = previewAfter;

  /* =====================================================================
     SITE BUILDER
     ===================================================================== */
  const STEPS = ['Reading your home’s details', 'Looking at your photos', 'Choosing an art direction', 'Pairing the typefaces', 'Laying out the sections', 'Writing the words', 'Running the design checks'];
  const HERO = [['cinematic', 'Cinematic', 'Full-bleed photo'], ['split', 'Split', 'Words and a framed photo'], ['editorial', 'Editorial', 'Huge type, wide photo'], ['mosaic', 'Mosaic', 'Three photos'], ['centered', 'Centred', 'Centred words, wide photo'], ['framed', 'Framed', 'Inset photo, overlapping words'], ['arch', 'Arch', 'Arched photo and a round inset'], ['type', 'Type-led', 'No photo needed']];
  const STYLE_LABEL = { corners: 'Corners', buttons: 'Buttons', spacing: 'Spacing', scale: 'Headline size', headings: 'Headlines', texture: 'Texture', nav: 'Top bar', images: 'Photos', bands: 'Section colours' };
  const SEC_NAME = { hero: 'Hero', facts: 'At a glance', story: 'The stay', highlights: 'Highlights', gallery: 'Gallery', amenities: 'Details and rules', reviews: 'Reviews', area: 'Area guide', host: 'Your host', book: 'Booking', faq: 'Questions', closing: 'Closing banner' };
  // Words, grouped by the section they belong to. [key, label, hint, textarea, max length]
  const WORD_GROUPS = [
    ['Top of the page', null, [['wordmark', 'Name in the top bar', '', 0, 40], ['tagline', 'Small line above the headline', '', 0, 60], ['headline', 'Headline', 'Under nine words. Wrap one word in *stars* for the italic accent.', 0, 90], ['subhead', 'Subheading', '', 1, 240], ['cta', 'Button text', '', 0, 28]]],
    ['The stay', 'story', [['storyEyebrow', 'Small heading', '', 0, 40], ['storyTitle', 'Story title', '', 0, 90], ['pull', 'Pull quote', '', 1, 220]]],
    ['Highlights', 'highlights', [['highlightsEyebrow', 'Small heading', '', 0, 40], ['highlightsTitle', 'Title', '', 0, 80]]],
    ['Gallery', 'gallery', [['galleryEyebrow', 'Small heading', '', 0, 40], ['galleryTitle', 'Title', '', 0, 80]]],
    ['Details', 'amenities', [['amenitiesEyebrow', 'Small heading', '', 0, 40], ['amenitiesTitle', 'Title', '', 0, 80]]],
    ['Reviews', 'reviews', [['reviewsEyebrow', 'Small heading', '', 0, 40], ['reviewsTitle', 'Title', '', 0, 80]]],
    ['Area guide', 'area', [['areaEyebrow', 'Small heading', '', 0, 50], ['areaTitle', 'Title', '', 0, 80], ['areaIntro', 'Introduction', '', 1, 300]]],
    ['Your host', 'host', [['hostEyebrow', 'Small heading', '', 0, 40], ['hostNote', 'Your note to guests', '', 1, 260]]],
    ['Booking', 'book', [['bookEyebrow', 'Small heading', '', 0, 40], ['bookTitle', 'Title', '', 0, 80], ['bookText', 'Text', '', 1, 300]]],
    ['Questions', 'faq', [['faqEyebrow', 'Small heading', '', 0, 40], ['faqTitle', 'Title', '', 0, 80]]],
    ['Closing and footer', null, [['closing', 'Closing line', '', 0, 90], ['footerLine', 'Footer line', '', 0, 120]]],
    ['Google and AI search', null, [['seoTitle', 'Google title', 'Up to 62 characters', 0, 62], ['seoDescription', 'Google description', 'Up to 160 characters', 1, 160]]],
  ];

  function siteOf(pid) { return (((S().studio || {}).sites) || {})[pid] || null; }
  function busy(inst) {
    const n = inst.st.sb_step || 0;
    return '<div class="sb-busy" role="status"><div class="sb-orb">' + I('spark') + '</div><b>Claude is designing your site</b><p class="muted">This takes about a minute. Every layout and word is checked against the design rules before you see it.</p><ol>' +
      STEPS.map((x, i) => '<li class="' + (i < n ? 'done' : i === n ? 'now' : '') + '">' + (i < n ? I('check') : '<i></i>') + x + '</li>').join('') + '</ol></div>';
  }
  function dirCard(k, d, on, act) {
    const p = d.pal;
    return '<button type="button" class="sb-dir' + (on ? ' on' : '') + '" data-ag="' + act + '" data-v="' + k + '" aria-pressed="' + on + '" style="--b:' + p.bg + ';--i:' + p.ink + ';--a:' + p.accent + ';--d:' + p.deep + '">' +
      '<span class="sb-dir-sw"><span class="sb-aa" style="font-family:\'' + esc(d.fonts.split(' & ')[0]) + '\',serif">Aa</span><span class="sb-dots"><i style="background:' + p.accent + '"></i><i style="background:' + p.deep + '"></i><i style="background:' + p.bg2 + '"></i></span></span>' +
      '<b>' + esc(d.name) + '</b><small>' + esc(d.fonts) + '</small></button>';
  }
  async function generate(inst, pid, mode, extra) {
    const st = inst.st; if (st.sb_busy) return;
    st.sb_busy = true; st.sb_step = 0; inst.render();
    const tick = setInterval(() => { if (st.sb_step < STEPS.length - 1) { st.sb_step++; inst.render(); } }, mode === 'new' ? 6500 : 4000);
    const b = Object.assign({}, st.sb_brief || {}, extra || {});
    const j = await call(inst, 'studio/generate', { propertyId: pid, brief: b, mode });
    clearInterval(tick); st.sb_busy = false; st.sb_ask = '';
    if (j && j.spec) { st.sb_tab = 'design'; BB.toast(j.spec.note ? 'Designed by the rules' : 'New design ready: ' + ((META && META.directions[j.spec.direction]) || {}).name, j.spec.note ? '' : 'good'); }
    inst.render();
  }

  const H = {}; // click handlers
  H['sb-pid'] = (inst, v) => inst.set({ sb_pid: v, sb_dev: inst.st.sb_dev });
  H['sb-vibe'] = (inst, v) => { const b = inst.st.sb_brief = inst.st.sb_brief || {}; b.vibe = b.vibe === v ? '' : v; inst.render(); };
  H['sb-bdir'] = (inst, v) => { const b = inst.st.sb_brief = inst.st.sb_brief || {}; b.direction = b.direction === v ? '' : v; inst.render(); };
  H['sb-go'] = inst => generate(inst, pidOf(inst), 'new');
  H['sb-another'] = inst => generate(inst, pidOf(inst), 'another');
  H['sb-revise'] = inst => { const t = (inst.st.sb_ask || '').trim(); if (!t) { BB.toast('Tell Claude what to change', 'bad'); return; } generate(inst, pidOf(inst), 'revise', { instruction: t }); };
  H['sb-new'] = inst => inst.set({ sb_rebrief: true });
  H['sb-cancel-brief'] = inst => inst.set({ sb_rebrief: false });
  H['sb-tab'] = (inst, v) => inst.set({ sb_tab: v });
  H['sb-dev'] = (inst, v) => inst.set({ sb_dev: v });
  H['sb-dir'] = (inst, v) => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { direction: v, accent: '' } });
  H['sb-hero'] = (inst, v) => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { heroVariant: v } });
  H['sb-tpl'] = (inst, v) => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { template: v } }, 'Page re-laid in the ' + META.pageTemplates[v].name + ' template');
  H['sb-font'] = (inst, v) => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { style: { font: v === META.directions[siteOf(pidOf(inst)).draft.direction].font ? '' : v } } });
  H['sb-pal'] = (inst, v) => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { style: { palette: v === META.directions[siteOf(pidOf(inst)).draft.direction].palette ? '' : v }, accent: '' } });
  H['sb-style'] = (inst, v, a) => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { style: { [a.dataset.k]: v } } });
  H['sb-style-reset'] = inst => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { style: null, accent: '' } }, 'Back to the direction’s own style');
  H['sb-shuffle'] = inst => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { shuffle: true } }, 'New mix of fonts, colours and layouts. Undo if you preferred the last one.');
  H['sb-sec'] = (inst, v) => { const fr = PV.frame && PV.frame.contentDocument; const el = fr && fr.querySelector('[data-sec="' + v + '"]'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  H['sb-accent-reset'] = inst => call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { accent: '' } });
  H['sb-undo'] = inst => call(inst, 'studio/undo', { propertyId: pidOf(inst) }, 'Went back one step');
  H['sb-publish'] = inst => call(inst, 'studio/publish', { propertyId: pidOf(inst) }, 'Published. Guests see the new site now.');
  H['sb-unpublish'] = inst => call(inst, 'studio/publish', { propertyId: pidOf(inst), off: true }, 'Switched back to the standard site');
  H['sb-words'] = inst => { const d = inst.st.sb_wd || {}; const copy = Object.assign({}, d); if (d.story != null) copy.story = String(d.story).split(/\n\s*\n/).map(x => x.trim()).filter(Boolean); ['h0', 'h1', 'h2'].forEach((k, i) => { delete copy[k + 't']; delete copy[k + 'x']; });
    const sp = siteOf(pidOf(inst)).draft; if (['h0', 'h1', 'h2'].some(k => d[k + 't'] != null || d[k + 'x'] != null)) copy.highlights = sp.copy.highlights.map((h, i) => ({ eyebrow: h.eyebrow, title: d['h' + i + 't'] != null ? d['h' + i + 't'] : h.title, text: d['h' + i + 'x'] != null ? d['h' + i + 'x'] : h.text }));
    inst.st.sb_wd = {}; call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { copy } }, 'Words saved to the draft'); };
  const secEdit = (inst, fn) => { const sp = siteOf(pidOf(inst)).draft; const secs = sp.sections.map(x => Object.assign({}, x)); fn(secs); call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { sections: secs } }); };
  H['sb-up'] = (inst, v) => secEdit(inst, a => { const i = +v; if (i > 1) a.splice(i - 1, 0, a.splice(i, 1)[0]); });
  H['sb-down'] = (inst, v) => secEdit(inst, a => { const i = +v; if (i > 0 && i < a.length - 1) a.splice(i + 1, 0, a.splice(i, 1)[0]); });
  H['sb-del'] = (inst, v) => secEdit(inst, a => { a.splice(+v, 1); });
  H['sb-add'] = (inst, v) => secEdit(inst, a => { const c = a.findIndex(x => x.type === 'closing'); a.splice(c < 0 ? a.length : c, 0, { type: v, variant: META.sections[v][0] }); });
  const pidOf = inst => { const s = S(); const p = s.properties.find(x => x.id === inst.st.sb_pid) || s.properties[0]; return p && p.id; };

  function briefCard(inst, p, again) {
    const st = inst.st, b = st.sb_brief = st.sb_brief || {}, M = META;
    const n = (p.photos || []).length;
    return '<section class="a-card ag-card sb-brief"><div class="a-card-h"><h3>' + (again ? 'Start a new design' : 'Brief your designer') + '</h3>' + (again ? '<button class="btn sm ghost" data-ag="sb-cancel-brief">' + I('x') + 'Cancel</button>' : '<span class="ag-meta">' + (M.ai ? 'Claude art-directs it' : 'Design rules') + '</span>') + '</div>' +
      '<div class="sb-q"><span class="eyebrow">How should it feel?</span><div class="sb-chips">' + Object.entries(M.vibes).map(([k, v]) => '<button type="button" class="chip" aria-pressed="' + (b.vibe === k) + '" data-ag="sb-vibe" data-v="' + k + '">' + esc(v.split(',')[0].replace(/^./, c => c.toUpperCase())) + '</button>').join('') + '</div></div>' +
      '<div class="sb-q"><span class="eyebrow">Art direction <em class="muted">optional, or let Claude choose</em></span><div class="sb-dirs sm">' + Object.entries(M.directions).map(([k, d]) => dirCard(k, d, b.direction === k, 'sb-bdir')).join('') + '</div></div>' +
      '<label class="field"><span>Who are your guests?</span><input data-agf="sb.audience" id="sb-aud" placeholder="Couples from London, walkers with dogs, families at half-term" value="' + esc(b.audience || '') + '"></label>' +
      '<label class="field"><span>Anything Claude should know?</span><textarea data-agf="sb.notes" id="sb-notes" rows="3" placeholder="The view from the bath is the thing everyone talks about. Avoid anything too twee.">' + esc(b.notes || '') + '</textarea></label>' +
      '<p class="ag-note sb-ph">' + I('camera') + '<span>' + (n ? n + ' photo' + (n === 1 ? '' : 's') + ' on this home.' + (n < 6 ? ' Add ' + (6 - n) + ' more for a gallery.' : '') : 'No photos yet, so Claude will design a type-led site. Add photos for image-led layouts.') + (S().live ? ' <a href="#" data-ag-nav="website">Add photos</a>' : '') + '</span></p>' +
      '<button class="btn primary sb-gobtn" data-ag="sb-go">' + I('spark') + 'Design my site</button></section>';
  }

  function panel(inst, p, site) {
    const st = inst.st, M = META, sp = site.draft, tab = st.sb_tab || 'design';
    const qaBad = (sp.qa || []).filter(x => !x.ok).length;
    const tabs = [['design', 'Layout'], ['style', 'Style'], ['words', 'Words'], ['sections', 'Sections'], ['checks', 'Checks' + (qaBad ? ' · ' + qaBad : ' ✓')]];
    const sty = sp.style || {}, dirM = M.directions[sp.direction] || {};
    let body = '';
    if (tab === 'design') {
      body = (sp.rationale ? '<blockquote class="sb-why"><span class="eyebrow">Why this design</span>' + esc(sp.rationale) + '</blockquote>' : '') +
        '<div class="sb-q"><span class="eyebrow">Page template <em class="muted">re-lays every section in one click</em></span><div class="sb-tpls">' + Object.entries(M.pageTemplates).map(([k, t]) => '<button type="button" class="sb-tpl' + (sp.template === k ? ' on' : '') + '" data-ag="sb-tpl" data-v="' + k + '"><i class="sb-ti t-' + k + '"></i><b>' + esc(t.name) + '</b><small>' + esc(t.note) + '</small></button>').join('') + '</div></div>' +
        '<div class="sb-q"><span class="eyebrow">Art direction</span><div class="sb-dirs sm">' + Object.entries(M.directions).map(([k, d]) => dirCard(k, d, sp.direction === k, 'sb-dir')).join('') + '</div></div>' +
        '<div class="sb-q"><span class="eyebrow">Hero layout</span><div class="sb-heroes">' + HERO.map(([k, t, d]) => '<button type="button" class="sb-hero' + ((sp.sections[0] || {}).variant === k ? ' on' : '') + '" data-ag="sb-hero" data-v="' + k + '"><i class="sb-hi h-' + k + '"></i><b>' + t + '</b><small>' + d + '</small></button>').join('') + '</div></div>' +
        '<div class="sb-shuf"><button class="btn" data-ag="sb-shuffle">' + I('sync') + 'Shuffle the style</button><small class="muted">A fresh mix of fonts, colours, shapes and layouts in the same direction. Works without AI.</small></div>' +
        (M.ai ? '<button class="btn" data-ag="sb-another">' + I('spark') + 'Ask Claude for a different direction</button>' : '');
    } else if (tab === 'style') {
      const seg = (k, opts) => '<div class="sb-srow"><span>' + STYLE_LABEL[k] + '</span><div class="seg sm" role="group" aria-label="' + STYLE_LABEL[k] + '">' + [['', 'Auto']].concat(Object.entries(opts).map(([v, x]) => [v, typeof x === 'string' ? x : x.name])).map(([v, l]) => '<button type="button" aria-pressed="' + ((sty[k] || '') === v) + '" data-ag="sb-style" data-k="' + k + '" data-v="' + v + '">' + esc(l) + '</button>').join('') + '</div></div>';
      const fontNow = sty.font || dirM.font, palNow = sty.palette || dirM.palette;
      body = '<div class="sb-q"><span class="eyebrow">Fonts <em class="muted">headline face shown</em></span><div class="sb-fonts">' + Object.entries(M.fonts).map(([k, f]) => '<button type="button" class="sb-font' + (fontNow === k ? ' on' : '') + '" data-ag="sb-font" data-v="' + k + '"><span class="sb-aa" style="font-family:\'' + esc(f.display) + '\',serif">Ag</span><b>' + esc(f.name) + '</b><small>' + esc(f.feel) + (k === dirM.font ? ' · direction' : '') + '</small></button>').join('') + '</div></div>' +
        '<div class="sb-q"><span class="eyebrow">Colour palette</span><div class="sb-pals">' + Object.entries(M.palettes).map(([k, x]) => { const q = x.pal; return '<button type="button" class="sb-pal' + (palNow === k ? ' on' : '') + '" data-ag="sb-pal" data-v="' + k + '" title="' + esc(x.name) + '"><span class="sw" style="background:' + q.bg + '"><i style="background:' + q.ink + '"></i><i style="background:' + q.accent + '"></i><i style="background:' + q.deep + ';outline:1px solid ' + q.line + '"></i></span><small>' + esc(x.name) + '</small></button>'; }).join('') + '</div></div>' +
        '<div class="sb-q sb-acc"><span class="eyebrow">Accent colour</span><div class="sb-accrow"><input type="color" data-sbacc value="' + esc(sp.accent || M.directions[sp.direction].pal.accent) + '" aria-label="Accent colour"><span class="mono">' + esc(sp.accent || M.directions[sp.direction].pal.accent) + '</span>' + (sp.accent ? '<button class="btn sm ghost" data-ag="sb-accent-reset">Reset</button>' : '<small class="muted">Direction default</small>') + '</div><small class="muted">Colours that fail contrast checks are refused, so buttons always stay readable.</small></div>' +
        '<div class="sb-q"><span class="eyebrow">Shape and detail</span>' + Object.entries(M.style).map(([k, o]) => seg(k, o)).join('') + '</div>' +
        '<button class="btn sm ghost" data-ag="sb-style-reset">' + I('back') + 'Reset to the direction’s style</button>';
    } else if (tab === 'words') {
      const d = st.sb_wd = st.sb_wd || {}; const val = k => d[k] != null ? d[k] : (sp.copy[k] || '');
      const have = sp.sections.map(x => x.type);
      const fld = ([k, l, hint, area, max]) => { const n = String(val(k)).length; return '<label class="field"><span>' + l + (hint ? ' <em class="muted">' + hint + '</em>' : '') + (max ? ' <em class="sb-cnt' + (n > max ? ' over' : '') + '" data-cnt="' + k + '">' + n + '/' + max + '</em>' : '') + '</span>' + (area ? '<textarea rows="2" maxlength="' + max + '" data-agf="sbw.' + k + '" id="sbw-' + k + '">' + esc(val(k)) + '</textarea>' : '<input maxlength="' + max + '" data-agf="sbw.' + k + '" id="sbw-' + k + '" value="' + esc(val(k)) + '">') + '</label>'; };
      const open = st.sb_wopen || 'Top of the page';
      body = WORD_GROUPS.filter(g => !g[1] || have.includes(g[1])).map(([name, , fields], gi) => '<details class="sb-wg" data-wg="' + esc(name) + '"' + (name === open ? ' open' : '') + '><summary>' + esc(name) + '</summary>' + fields.map(fld).join('') +
        (name === 'The stay' ? '<label class="field"><span>The stay <em class="muted">Paragraphs, separated by a blank line</em></span><textarea rows="6" data-agf="sbw.story" id="sbw-story">' + esc(d.story != null ? d.story : (sp.copy.story || []).join('\n\n')) + '</textarea></label>' : '') +
        (name === 'Highlights' ? (sp.copy.highlights || []).map((h, i) => '<div class="sb-hl"><span class="eyebrow">Highlight ' + (i + 1) + '</span><input data-agf="sbw.h' + i + 't" id="sbw-h' + i + 't" value="' + esc(d['h' + i + 't'] != null ? d['h' + i + 't'] : h.title) + '" aria-label="Highlight ' + (i + 1) + ' title"><textarea rows="2" data-agf="sbw.h' + i + 'x" id="sbw-h' + i + 'x" aria-label="Highlight ' + (i + 1) + ' text">' + esc(d['h' + i + 'x'] != null ? d['h' + i + 'x'] : h.text) + '</textarea></div>').join('') : '') +
        (name === 'Google and AI search' ? '<div class="sb-serp" aria-label="How it looks on Google"><small class="mono">' + esc(p.domain || 'your-site') + '</small><b>' + esc(val('seoTitle')) + '</b><p>' + esc(val('seoDescription')) + '</p></div>' : '') + '</details>').join('') +
        '<div class="sb-sticky"><button class="btn primary" data-ag="sb-words"' + (Object.keys(d).length ? '' : ' disabled') + '>' + I('check') + 'Save words</button><small class="muted">Facts like prices, photos, amenities and reviews come from Website & SEO and stay up to date by themselves.</small></div>';
    } else if (tab === 'sections') {
      const have = sp.sections.map(x => x.type);
      body = '<ol class="sb-secs">' + sp.sections.map((x, i) => '<li><span class="sb-sn">' + String(i + 1).padStart(2, '0') + '</span><div><button type="button" class="sb-sname" data-ag="sb-sec" data-v="' + x.type + '" title="Show in the preview">' + SEC_NAME[x.type] + '</button>' +
        '<select class="sb-var" data-sbvar="' + i + '" aria-label="' + SEC_NAME[x.type] + ' layout">' + (M.sections[x.type] || []).map(v => '<option value="' + v + '"' + (x.variant === v ? ' selected' : '') + '>' + esc((M.variantNames || {})[v] || v) + '</option>').join('') + '</select></div>' +
        (i ? '<span class="sb-sa"><button class="iconbtn" data-ag="sb-up" data-v="' + i + '" aria-label="Move up"' + (i < 2 ? ' disabled' : '') + '>↑</button><button class="iconbtn" data-ag="sb-down" data-v="' + i + '" aria-label="Move down"' + (i === sp.sections.length - 1 ? ' disabled' : '') + '>↓</button>' + (['book', 'faq'].includes(x.type) ? '' : '<button class="iconbtn" data-ag="sb-del" data-v="' + i + '" aria-label="Remove">' + I('x') + '</button>') + '</span>' : '<span class="sb-sa muted"><small>Always first</small></span>') + '</li>').join('') + '</ol>' +
        (Object.keys(SEC_NAME).filter(k => !have.includes(k)).length ? '<div class="sb-q"><span class="eyebrow">Add a section</span><div class="sb-chips">' + Object.keys(SEC_NAME).filter(k => !have.includes(k)).map(k => '<button type="button" class="chip" data-ag="sb-add" data-v="' + k + '">+ ' + SEC_NAME[k] + '</button>').join('') + '</div><small class="muted">Sections with nothing to show (a gallery without photos, an area guide you have not written) stay hidden.</small></div>' : '');
    } else {
      body = '<ul class="sb-qa">' + (sp.qa || []).map(x => '<li class="' + (x.ok ? 'ok' : 'no') + '">' + I(x.ok ? 'check' : 'x') + '<span>' + esc(x.label) + (!x.ok && x.fix ? '<small>' + esc(x.fix) + '</small>' : '') + '</span></li>').join('') + '</ul>' +
        '<details class="sb-rules"><summary>The design rules every site follows</summary><ol>' + M.principles.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol></details>';
    }
    return '<div class="sb-panel">' +
      (M.ai ? '<form class="sb-ask" data-agform="sb-ask"><label for="sb-ask" class="eyebrow">Ask Claude for changes</label><div><textarea id="sb-ask" data-agf="sb.ask" rows="2" placeholder="Make it feel warmer, lead with the hot tub, more space between sections">' + esc(st.sb_ask || '') + '</textarea><button class="btn primary sm" data-ag="sb-revise">' + I('send') + 'Revise</button></div></form>' : '') +
      '<div class="seg sb-tabs" role="group" aria-label="Edit">' + tabs.map(([k, l]) => '<button type="button" aria-pressed="' + (tab === k) + '" data-ag="sb-tab" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
      '<div class="sb-tabbody">' + body + '</div></div>';
  }

  V.builder = {
    label: 'Site builder', group: 'Get found', icon: 'spark', order: 5,
    render(inst) {
      const s = S(), st = inst.st, M = meta(inst);
      const p = s.properties.find(x => x.id === st.sb_pid) || s.properties[0];
      if (!p) return '<div class="ag sb">' + vh('Site builder', 'Add a home first.') + '</div>';
      if (!live()) return '<div class="ag sb">' + vh('Site builder', 'Claude designs a premium booking site for each home.') + '<p class="muted">Available in the live console and the demo.</p></div>';
      if (!M) return '<div class="ag sb">' + vh('Site builder', 'Loading the design system…') + '<div class="a-card ag-card sb-load"></div></div>';
      const site = siteOf(p.id), sp = site && site.draft, pubd = site && site.published;
      const dirty = sp && pubd && JSON.stringify([sp.direction, sp.accent, sp.style || {}, sp.sections, sp.copy]) !== JSON.stringify([pubd.direction, pubd.accent, pubd.style || {}, pubd.sections, pubd.copy]);
      const dev = st.sb_dev || 'desk';
      const status = !sp ? '' : pubd ? (dirty ? BB.pill('warn', 'Unpublished changes') : BB.pill('good', 'Live')) : BB.pill('muted', 'Draft');
      const acts = sp ? (pubd ? '<button class="btn" data-ag="sb-unpublish">Use standard site</button>' : '') + '<a class="btn" href="' + PRE() + 'studio/' + encodeURIComponent(p.id) + '?bare=" target="_blank" rel="noopener">' + I('out') + 'Open preview</a>' +
        '<button class="btn primary" data-ag="sb-publish"' + (pubd && !dirty ? ' disabled' : '') + '>' + I('send') + (pubd ? (dirty ? 'Publish changes' : 'Published') : 'Publish site') + '</button>' : '';
      const tabsH = s.properties.length > 1 ? '<div class="ag-ptabs" role="tablist" aria-label="Homes">' + s.properties.map(x => { const sx = siteOf(x.id); return '<button type="button" role="tab" aria-selected="' + (x.id === p.id) + '" data-ag="sb-pid" data-v="' + x.id + '"><span><b>' + esc(x.name) + '</b><small>' + (sx && sx.published ? 'Live · ' + esc((M.directions[sx.published.direction] || {}).name) : sx && sx.draft ? 'Draft' : 'Not designed yet') + '</small></span></button>'; }).join('') + '</div>' : '';
      const showBrief = !sp || st.sb_rebrief;
      const left = st.sb_busy ? busy(inst) : showBrief ? briefCard(inst, p, !!sp) : panel(inst, p, site);
      const src = sp ? PRE() + 'studio/' + encodeURIComponent(p.id) + '?bare=1&t=' + encodeURIComponent(sp.at || '') + (sp.direction + (sp.accent || '')) : '';
      const right = sp ? '<div class="sb-stage"><div class="sb-bar"><div class="seg" role="group" aria-label="Device">' + [['desk', 'Desktop'], ['tablet', 'Tablet'], ['phone', 'Phone']].map(([k, l]) => '<button type="button" aria-pressed="' + (dev === k) + '" data-ag="sb-dev" data-v="' + k + '">' + l + '</button>').join('') + '</div>' +
          '<span class="sb-meta">' + status + '<small class="muted">' + esc((M.directions[sp.direction] || {}).name || '') + (sp.template && M.pageTemplates[sp.template] ? ' · ' + esc(M.pageTemplates[sp.template].name) : '') + ' · ' + (sp.by === 'ai' ? 'designed by Claude' : 'laid out by the design rules') + ' ' + ago(sp.at) + '</small></span>' +
          '<span class="sb-tools">' + ((site.history || []).length ? '<button class="btn sm ghost" data-ag="sb-undo">' + I('back') + 'Undo</button>' : '') + (!st.sb_rebrief ? '<button class="btn sm ghost" data-ag="sb-new">' + I('plus') + 'New design</button>' : '') + '</span></div>' +
          (sp.note ? '<div class="ag-banner warn">' + I('bolt') + '<p>' + esc(sp.note) + '</p></div>' : '') +
          '<div class="sb-dev ' + dev + '"><div class="sb-chrome"><i></i><i></i><i></i><span class="mono">' + esc(p.domain || 'your-site') + '</span></div><div class="sb-slot" data-sb-slot data-src="' + esc(src) + '" data-w="' + (dev === 'phone' ? 390 : dev === 'tablet' ? 820 : 1360) + '"></div></div></div>'
        : '<div class="sb-stage sb-empty"><div class="sb-hero-ill"><span class="disp">Designed for <em>' + esc(p.short || p.name) + '</em></span><p>' + Object.keys(M.directions).length + ' art directions, ' + Object.keys(M.fonts || {}).length + ' font pairings, ' + Object.keys(M.palettes || {}).length + ' palettes and ' + Object.keys(M.pageTemplates || {}).length + ' page templates, so no two sites look alike. Claude reads your home, looks at your photos, chooses the direction, lays out the page and writes every word. Then it checks the design against the rules below before you see it.</p>' +
          '<ul>' + M.principles.slice(0, 4).map(x => '<li>' + I('check') + esc(x.split('. ')[0]) + '</li>').join('') + '</ul></div></div>';
      return '<div class="ag sb">' + vh('Site builder', 'Claude designs a premium, direct-booking website for each home. Every page follows a tested design system, so it never looks like a template or like AI.', acts) + tabsH +
        (pubd && !dirty ? '<div class="ag-banner good">' + I('check') + '<p>Live on <b class="mono">' + esc(p.domain || '') + '</b> since ' + ago(site.publishedAt) + '. Search engines see the same structured data as before.</p></div>' : '') +
        '<div class="sb-cols">' + left + right + '</div></div>';
    },
    after: previewAfter,
    click(ev, inst) { const sm = ev.target.closest('.sb-wg > summary'); if (sm) { const g = sm.parentNode; inst.st.sb_wopen = g.open ? '-' : g.dataset.wg; return; } const a = ev.target.closest('[data-ag]'); if (a && H[a.dataset.ag]) { ev.preventDefault(); H[a.dataset.ag](inst, a.dataset.v, a); return; } const n = ev.target.closest('[data-ag-nav]'); if (n) { ev.preventDefault(); inst.nav ? inst.nav(n.dataset.agNav) : BB.go('app', { view: n.dataset.agNav }); } },
    input(ev, inst) {
      const el = ev.target, f = el.dataset && el.dataset.agf; if (!f) return; const [sc, k] = f.split('.');
      if (sc === 'sb' && k === 'ask') inst.st.sb_ask = el.value;
      else if (sc === 'sb') { (inst.st.sb_brief = inst.st.sb_brief || {})[k] = el.value; }
      else if (sc === 'sbw') { const was = Object.keys(inst.st.sb_wd || {}).length; (inst.st.sb_wd = inst.st.sb_wd || {})[k] = el.value; const c = inst.root.querySelector('[data-cnt="' + k + '"]'); if (c) { const mx = +c.textContent.split('/')[1]; c.textContent = el.value.length + '/' + mx; c.classList.toggle('over', el.value.length > mx); } if (!was) inst.render(); }
    },
    change(ev, inst) { const el = ev.target; if (el.dataset && el.dataset.sbvar != null) { const i = +el.dataset.sbvar; secEdit(inst, a => { a[i].variant = el.value; }); return; } if (el.dataset && el.dataset.sbacc != null) call(inst, 'studio/edit', { propertyId: pidOf(inst), patch: { accent: el.value } }).then(j => { if (j && j.spec && j.spec.accent !== el.value.toUpperCase()) BB.toast('That colour fails the contrast check on this background, so we kept a readable one.', 'bad'); }); },
    submit(ev, inst) { if (ev.target.dataset.agform === 'sb-ask') { ev.preventDefault(); H['sb-revise'](inst); } },
  };

  /* =====================================================================
     FUNNELS
     ===================================================================== */
  const TPL_ICON = { guide: 'pin', waitlist: 'bell', offer: 'tag', lastminute: 'cal', comeback: 'heart', event: 'cal' };
  const STEP_NAME = { optin: 'Sign-up page', offer: 'Offer page', thanks: 'Thank-you page' };
  const FH = {};
  const fns = () => ((S().studio || {}).funnels) || [];
  const linkOf = f => location.origin + (demo() ? '/demo/funnel/' + f.id + '/' + f.steps[0] : '/f/' + (BB.BOOT.slug || slugGuess()) + '/' + f.id);
  function slugGuess() { const u = Object.values((BB.BOOT && BB.BOOT.siteUrls) || {})[0] || ''; const m = u.match(/\/s\/([^/]+)/); return m ? m[1] : 'host'; }
  FH['fn-new'] = inst => inst.set({ fn_new: true, fn_tpl: null, fn_open: null });
  FH['fn-cancel'] = inst => inst.set({ fn_new: false, fn_tpl: null });
  FH['fn-tpl'] = (inst, v) => inst.set({ fn_tpl: v, fn_form: { pct: v === 'lastminute' ? 15 : 10, propertyId: S().properties[0].id, season: '', notes: '', code: '' } });
  FH['fn-create'] = async inst => { const st = inst.st; if (st.fn_busy) return; st.fn_busy = true; inst.render(); const j = await call(inst, 'funnels/create', Object.assign({ template: st.fn_tpl }, st.fn_form)); st.fn_busy = false; if (j && j.funnel) { st.fn_new = false; st.fn_open = j.funnel.id; st.fn_step = j.funnel.steps[0]; BB.toast('Funnel ready. Preview it, then make it live.', 'good'); } inst.render(); };
  FH['fn-open'] = (inst, v) => { const f = fns().find(x => x.id === v); inst.set({ fn_open: v, fn_step: f ? f.steps[0] : null, fn_new: false, fn_wd: null }); };
  FH['fn-close'] = inst => inst.set({ fn_open: null });
  FH['fn-step'] = (inst, v) => inst.set({ fn_step: v, fn_wd: null });
  FH['fn-live'] = (inst, v, a) => call(inst, 'funnels/edit', { id: v, patch: { status: a.dataset.s } }, a.dataset.s === 'live' ? 'Live. Copy the link and share it anywhere.' : 'Paused');
  FH['fn-del'] = (inst, v) => { if (inst.st.fn_del !== v) { inst.set({ fn_del: v }); return; } inst.st.fn_del = null; inst.st.fn_open = null; call(inst, 'funnels/delete', { id: v }, 'Funnel deleted'); };
  FH['fn-copy'] = (inst, v) => { const f = fns().find(x => x.id === v); if (f) BB.copy(linkOf(f)); };
  FH['fn-save'] = inst => { const st = inst.st, d = st.fn_wd || {}; const copy = Object.assign({}, d); if (d.points != null) copy.points = String(d.points).split('\n').map(x => x.trim()).filter(Boolean); st.fn_wd = null; call(inst, 'funnels/edit', { id: st.fn_open, patch: { step: st.fn_step, copy } }, 'Saved'); };
  FH['fn-dir'] = (inst, v) => call(inst, 'funnels/edit', { id: inst.st.fn_open, patch: { direction: v } });

  function stats(f) {
    const bk = S().bookings.filter(b => b.promo && f.code && b.promo === f.code && b.status !== 'cancelled');
    const views = Object.values((f.stats || {}).views || {}).reduce((a, b) => a + b, 0), first = ((f.stats || {}).views || {})[f.steps[0]] || 0, leads = (f.stats || {}).leads || 0;
    return { views, first, leads, bookings: bk.length, revenue: bk.reduce((a, b) => a + (b.total || 0), 0), rate: first ? Math.round(100 * (f.steps[0] === 'optin' ? leads : bk.length) / first) : 0 };
  }
  V.funnels = {
    label: 'Funnels', group: 'Grow', icon: 'bolt', order: 25,
    render(inst) {
      const s = S(), st = inst.st, M = meta(inst);
      if (!live()) return '<div class="ag sb">' + vh('Funnels', 'Focused pages that grow your guest list and fill dates.') + '</div>';
      if (!M) return '<div class="ag sb">' + vh('Funnels', 'Loading…') + '</div>';
      const list = fns();
      const head = vh('Funnels', 'Focused pages that grow your guest list and fill empty dates. Claude writes them in your site’s style, and every sign-up lands in Guests.', st.fn_new || st.fn_open ? '' : '<button class="btn primary" data-ag="fn-new">' + I('plus') + 'New funnel</button>');
      let main = '';
      if (st.fn_new) {
        const t = st.fn_tpl, f = st.fn_form || {};
        main = '<section class="a-card ag-card"><div class="a-card-h"><h3>' + (t ? M.templates[t].name : 'What should this funnel do?') + '</h3><button class="btn sm ghost" data-ag="fn-cancel">' + I('x') + 'Cancel</button></div>' +
          (!t ? '<div class="sb-tpls">' + Object.entries(M.templates).filter(([, x]) => !x.hidden).map(([k, x]) => '<button type="button" class="sb-tpl" data-ag="fn-tpl" data-v="' + k + '"><span class="sb-tpl-i">' + I(TPL_ICON[k]) + '</span><b>' + esc(x.name) + '</b><small>' + esc(x.blurb) + '</small><em>' + (x.goal === 'leads' ? 'Grows your list' : 'Brings bookings') + ' · ' + x.steps.map(z => STEP_NAME[z]).join(' → ') + '</em></button>').join('') + '</div>'
            : '<p class="muted" style="margin:0 0 14px">' + esc(M.templates[t].blurb) + '</p><div class="sb-fform">' +
              (s.properties.length > 1 ? '<label class="field"><span>Home</span><select data-agf="fn.propertyId">' + s.properties.map(p => '<option value="' + p.id + '"' + (f.propertyId === p.id ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label>' : '') +
              '<label class="field"><span>Discount for guests who book</span><select data-agf="fn.pct">' + [5, 10, 15, 20, 25].map(x => '<option' + (+f.pct === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
              '<label class="field"><span>Promo code <em class="muted">optional, we make one</em></span><input data-agf="fn.code" id="fn-code" class="mono" maxlength="14" value="' + esc(f.code || '') + '"></label>' +
              (t === 'waitlist' ? '<label class="field"><span>Which season or event?</span><input data-agf="fn.season" id="fn-season" placeholder="Summer 2027, Christmas week, the Great North Run" value="' + esc(f.season || '') + '"></label>' : '') +
              '<label class="field sb-wide"><span>Anything Claude should know?</span><textarea data-agf="fn.notes" id="fn-notes" rows="2" placeholder="Aim it at dog owners. Mention the new sauna.">' + esc(f.notes || '') + '</textarea></label></div>' +
              '<div class="ag-acts-row"><button class="btn primary" data-ag="fn-create"' + (st.fn_busy ? ' disabled' : '') + '>' + I('spark') + (st.fn_busy ? 'Claude is writing your pages…' : 'Create funnel') + '</button><button class="btn ghost" data-ag="fn-tpl" data-v="">Back</button></div>') + '</section>';
      }
      const open = list.find(x => x.id === st.fn_open);
      if (open) {
        const x = stats(open), step = open.steps.includes(st.fn_step) ? st.fn_step : open.steps[0], c = open.copy[step] || {}, d = st.fn_wd = st.fn_wd || {}; const val = k => d[k] != null ? d[k] : (k === 'points' ? (c.points || []).join('\n') : c[k] || '');
        const fld = (k, l, area) => '<label class="field"><span>' + l + '</span>' + (area ? '<textarea rows="' + (k === 'points' ? 3 : 2) + '" data-agf="fnw.' + k + '" id="fnw-' + k + '">' + esc(val(k)) + '</textarea>' : '<input data-agf="fnw.' + k + '" id="fnw-' + k + '" value="' + esc(val(k)) + '">') + '</label>';
        const fields = step === 'thanks' ? fld('headline', 'Headline') + fld('text', 'What happens next', 1) + fld('button', 'Button') : fld('eyebrow', 'Small line') + fld('headline', 'Headline') + fld('subhead', 'Subheading', 1) + fld('points', 'Benefits, one per line', 1) + fld('button', 'Button') + (step === 'optin' ? fld('fine', 'Consent line', 1) : fld('urgency', 'Why now'));
        main += '<div class="sb-fdetail"><button type="button" class="ag-back" data-ag="fn-close">' + I('back') + 'All funnels</button>' +
          '<div class="a-vh sb-fh"><div><h2 class="disp">' + esc(open.name) + '</h2><p>' + esc(M.templates[open.template].name) + (open.code ? ' · code <b class="mono">' + esc(open.code) + '</b> (' + open.pct + '% off)' : '') + '</p></div><div class="a-acts">' +
          (open.status === 'live' ? '<button class="btn" data-ag="fn-copy" data-v="' + open.id + '">' + I('out') + 'Copy link</button><button class="btn" data-ag="fn-live" data-v="' + open.id + '" data-s="paused">Pause</button>' : '<button class="btn primary" data-ag="fn-live" data-v="' + open.id + '" data-s="live">' + I('send') + 'Make it live</button>') + '</div></div>' +
          '<div class="sb-kpis"><div><small>Visitors</small><b class="num">' + x.first + '</b></div><div><small>Sign-ups</small><b class="num">' + x.leads + '</b></div><div><small>Bookings</small><b class="num">' + x.bookings + '</b></div><div><small>Revenue</small><b class="num">' + BB.money(x.revenue) + '</b></div><div><small>Conversion</small><b class="num">' + x.rate + '%</b></div></div>' +
          '<div class="sb-cols"><div class="sb-panel"><div class="seg sb-tabs" role="group" aria-label="Pages">' + open.steps.map(k => '<button type="button" aria-pressed="' + (k === step) + '" data-ag="fn-step" data-v="' + k + '">' + STEP_NAME[k] + '</button>').join('') + '</div><div class="sb-tabbody">' + fields +
          '<div class="sb-sticky"><button class="btn primary" data-ag="fn-save"' + (Object.keys(d).length ? '' : ' disabled') + '>' + I('check') + 'Save words</button></div>' +
          '<div class="sb-q"><span class="eyebrow">Style</span><div class="sb-dirs sm">' + Object.entries(M.directions).map(([k, dd]) => dirCard(k, dd, open.direction === k, 'fn-dir')).join('') + '</div></div>' +
          '<button class="btn ghost danger" data-ag="fn-del" data-v="' + open.id + '">' + (st.fn_del === open.id ? 'Tap again to delete' : 'Delete funnel') + '</button></div></div>' +
          '<div class="sb-stage"><div class="sb-dev desk"><div class="sb-chrome"><i></i><i></i><i></i><span class="mono">' + esc(open.status === 'live' ? linkOf(open).replace(/^https?:\/\//, '') : 'Preview · draft') + '</span></div><div class="sb-slot" data-sb-slot data-w="1280" data-src="' + PRE() + 'funnel/' + open.id + '/' + step + '?bare=1&t=' + encodeURIComponent(JSON.stringify(c).length + open.direction) + '"></div></div></div></div></div>';
      } else if (!st.fn_new) {
        main += list.length ? '<div class="sb-flist">' + list.map(f => { const x = stats(f); return '<button type="button" class="a-card sb-frow" data-ag="fn-open" data-v="' + f.id + '"><span class="sb-tpl-i">' + I(TPL_ICON[f.template] || 'bolt') + '</span><span class="sb-fn"><b>' + esc(f.name) + '</b><small>' + esc(M.templates[f.template].name) + (f.code ? ' · ' + esc(f.code) : '') + '</small></span>' +
          '<span class="sb-fs"><span><b class="num">' + x.first + '</b><small>visitors</small></span><span><b class="num">' + x.leads + '</b><small>sign-ups</small></span><span><b class="num">' + x.bookings + '</b><small>bookings</small></span></span>' + BB.pill(f.status === 'live' ? 'good' : f.status === 'paused' ? 'warn' : 'muted', f.status === 'live' ? 'Live' : f.status === 'paused' ? 'Paused' : 'Draft') + '</button>'; }).join('') + '</div>'
          : '<div class="a-card ag-card sb-fempty"><span class="disp">Turn visitors into <em>guests</em></span><p class="muted">Most people who find you are not ready to book today. A funnel catches them: a free local guide, first pick of next summer, or a code for last-minute dates. Each sign-up joins your guest list, so your next campaign has someone to go to.</p><button class="btn primary" data-ag="fn-new">' + I('plus') + 'Create your first funnel</button></div>';
      }
      return '<div class="ag sb">' + head + main + '</div>';
    },
    after: previewAfter,
    click(ev, inst) { const a = ev.target.closest('[data-ag]'); if (a && FH[a.dataset.ag]) { ev.preventDefault(); if (a.dataset.ag === 'fn-tpl' && !a.dataset.v) { inst.set({ fn_tpl: null }); return; } FH[a.dataset.ag](inst, a.dataset.v, a); } },
    input(ev, inst) {
      const el = ev.target, f = el.dataset && el.dataset.agf; if (!f) return; const [sc, k] = f.split('.');
      if (sc === 'fn') { inst.st.fn_form[k] = el.value; if (el.tagName === 'SELECT') inst.render(); }
      if (sc === 'fnw') { const was = Object.keys(inst.st.fn_wd || {}).length; (inst.st.fn_wd = inst.st.fn_wd || {})[k] = el.value; if (!was) inst.render(); }
    },
    change(ev, inst) { if (ev.target.tagName === 'SELECT') V.funnels.input(ev, inst); },
  };
})();
