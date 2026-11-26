/* Bookingbooster: the Search health view in the host console (Get found). One home at a time: a score across every
   kind of search work that applies to a holiday let, the fixes worth doing first, and the tools to do them.
   Rules live in seo-rules.js (shared with the server). Drafts come from Claude when the server has a key, otherwise
   from the home's own facts. Registers into BB.appViews; app.js owns the frame and routing. */
(function () {
  const BB = window.BB; BB.appViews = BB.appViews || {};
  const V = BB.appViews, esc = BB.esc, I = BB.icon;
  const S = () => BB.store.get();
  const uid = inst => inst.uid || (inst.uid = Math.random().toString(36).slice(2, 7));
  const ID = (inst, k) => 'sh-' + k + '-' + uid(inst);
  const nav = (inst, view, id) => (inst && inst.nav ? inst.nav(view, id == null ? null : id) : BB.go('app', { view, id: id == null ? null : id }));
  const api = () => !!(BB.api && BB.BOOT && (BB.BOOT.mode === 'host' || BB.BOOT.mode === 'demo'));
  const API = () => (BB.BOOT && BB.BOOT.mode === 'demo' ? '/api/demo/' : '/api/');
  const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  const vh = (title, sub, acts) => '<div class="a-vh"><div><h2 class="disp">' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '') + '</div>' + (acts ? '<div class="a-acts">' + acts + '</div>' : '') + '</div>';
  const card = (id, title, meta, body, cls) => '<section class="a-card ag-card sh-card ' + (cls || '') + '"' + (id ? ' id="sh-' + id + '"' : '') + '><div class="a-card-h"><h3>' + title + '</h3>' + (meta ? '<span class="ag-meta">' + meta + '</span>' : '') + '</div>' + body + '</section>';
  const tone = n => n >= 85 ? 'good' : n >= 60 ? 'warn' : 'bad';
  function gauge(n) {
    const r = 46, c = 2 * Math.PI * r, off = c * (1 - n / 100);
    return '<svg class="ag-gauge sh-g-' + tone(n) + '" viewBox="0 0 120 120" role="img" aria-label="Search health ' + n + ' of 100"><circle cx="60" cy="60" r="' + r + '" class="tr"/><circle cx="60" cy="60" r="' + r + '" class="fg" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" transform="rotate(-90 60 60)"/><text x="60" y="68" text-anchor="middle">' + n + '</text></svg>';
  }
  const STI = { ok: 'check', auto: 'bolt', warn: 'clock', fail: 'x' };
  const STL = { ok: 'Done', auto: 'Handled for you', warn: 'Could be better', fail: 'To fix' };

  // Every kind of search work, and how Bookingbooster covers it for a holiday let.
  const COVER = [
    ['On-page SEO', 'auto', 'Titles, descriptions, headings and internal links are written for every page. You can set your own title and description here.'],
    ['Technical SEO', 'auto', 'Server-rendered pages, HTTPS, mobile-first, canonical tags, robots.txt, an image sitemap and IndexNow pings.'],
    ['Content SEO', 'tool', 'Area guide, about text and FAQs, with drafts written from your facts and keyword ideas for what to write about.'],
    ['Local SEO', 'tool', 'Map pin, address, reviews and LodgingBusiness schema are automatic. Google Business Profile is a guided checklist.'],
    ['Off-page SEO', 'guide', 'We list where to get links and mentions and add each one to your schema. Getting them is up to you.'],
    ['Image and video SEO', 'tool', 'Photo captions become alt text and image sitemap entries. A YouTube walkthrough adds video schema.'],
    ['SXO (search experience)', 'auto', 'Price up front, instant booking, reviews and a host note on the page that search visitors land on.'],
    ['AEO (answer engines)', 'tool', 'An answer-first summary, FAQ ideas with drafted answers, FAQPage and speakable schema.'],
    ['GEO (generative engines)', 'auto', 'llms.txt, AI crawler access and real weekly checks in ChatGPT, Gemini, Perplexity and Google, with the sites they cite.'],
    ['LLMO (brand recognition)', 'guide', 'sameAs links tie your listings and profiles to one home, and we track whether answers link to your site.'],
    ['AIO (Google AI Overviews)', 'tool', 'Google answers are checked with each AI run, and the summary sits where AI Overviews read first.'],
    ['Ecommerce SEO', 'part', 'Partly applies: each home is a bookable product with Offer schema, a live price and checkout. There are no category pages to manage.'],
    ['International SEO', 'part', 'Partly applies: pages are en-GB with prices in pounds. Separate language versions are not needed for UK stays.'],
    ['ASO (app stores)', 'none', 'Does not apply: the guest app installs from your site, so there is no App Store listing to optimise.'],
  ];
  const COVL = { auto: ['good', 'Automatic'], tool: ['info', 'Tool, you approve'], guide: ['warn', 'Guidance'], part: ['muted', 'Partly applies'], none: ['muted', 'Not applicable'] };

  function home(inst) { const s = S(); const p = BB.q.property(inst.st.sh_pid) || s.properties[0]; if (p) inst.st.sh_pid = p.id; return p; }
  async function loadFiles(inst, pid) {
    const st = inst.st; st.sh_files = st.sh_files || {}; if (!api() || st.sh_files[pid]) return;
    st.sh_files[pid] = { loading: true };
    try { st.sh_files[pid] = await BB.api.call(API() + 'seo/files?propertyId=' + encodeURIComponent(pid), null, 'GET'); }
    catch (e) { st.sh_files[pid] = { error: e.message }; }
    if (st.view === 'seo') inst.render();
  }
  async function write(inst, what) {
    const p = home(inst), st = inst.st; st.sh_busy = what; inst.render();
    let d = null, by = 'rules', note = null;
    const questions = what === 'faqs' ? BB.seo.faqIdeas(p).map(f => f.q) : undefined;
    if (api()) { try { const j = await BB.api.call(API() + 'seo/write', { propertyId: p.id, what, questions }); d = j.draft; by = j.by || 'rules'; note = j.error || (j.credit && j.credit.message) || null; } catch (e) { note = e.message; } }
    if (!d) { by = 'rules'; d = what === 'faqs' ? null : BB.seo.draft(p, what); }
    st.sh_busy = null;
    if (what === 'summary') { st.sh_sum = d; st.sh_sum_by = by; }
    if (what === 'area' && !d) { inst.render(); BB.toast('Add a few nearby places in Website & SEO first, then draft again.'); return; }
    if (what === 'area') { st.sh_area = d; st.sh_area_by = by; }
    if (what === 'meta') { st.sh_mt = d.title; st.sh_md = d.description; st.sh_meta_by = by; }
    if (what === 'faqs' && d) { st.sh_faq = {}; d.forEach(f => { if (f.a) st.sh_faq[f.q] = f.a; }); st.sh_faq_by = by; }
    if (note) BB.toast(note);
    inst.render();
  }
  function scrollTo(inst, id) { const el = inst.root && inst.root.querySelector('#sh-' + id); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function doFix(inst, c) {
    const a = c.act; if (!a) return;
    if (a.kind === 'nav') nav(inst, a.view);
    else if (a.kind === 'scroll') scrollTo(inst, a.to);
    else if (a.kind === 'write') { scrollTo(inst, a.what === 'area' ? 'area' : 'summary'); write(inst, a.what); }
    else if (a.kind === 'meta') { scrollTo(inst, 'meta'); write(inst, 'meta'); }
    else if (a.kind === 'aicheck') { BB.act.runAiCheck(); BB.toast(S().live ? 'Asking AI assistants now. Results arrive in a few minutes.' : 'AI check done', 'good'); }
  }
  const fixLabel = a => !a ? '' : a.kind === 'nav' ? ({ website: 'Open Website & SEO', connections: 'Open Connections', automations: 'Open Automations', reviews: 'Open Reviews', ai: 'Open AI visibility' }[a.view] || 'Open') : a.kind === 'write' ? 'Draft it' : a.kind === 'meta' ? 'Draft it' : a.kind === 'aicheck' ? 'Run AI check' : 'Show me';

  const HANDLERS = {
    'sh-pid': (inst, v) => { const st = inst.st; ['sh_sum', 'sh_area', 'sh_mt', 'sh_md', 'sh_faq', 'sh_cat', 'sh_link', 'sh_video', 'sh_pin'].forEach(k => { st[k] = undefined; }); inst.set({ sh_pid: v }); },
    'sh-cat': (inst, v) => inst.set({ sh_cat: inst.st.sh_cat === v ? null : v }),
    'sh-fix': (inst, v) => { const c = BB.seo.audit(home(inst)).checks.find(x => x.id === v); if (c) doFix(inst, c); },
    'sh-write': (inst, v) => write(inst, v),
    'sh-save-sum': inst => { const p = home(inst); BB.act.updateSeo(p.id, { summary: inst.st.sh_sum }); inst.st.sh_sum = undefined; inst.render(); BB.toast('Summary published', 'good'); },
    'sh-save-area': inst => { const p = home(inst); BB.act.updateSeo(p.id, { areaIntro: inst.st.sh_area }); inst.st.sh_area = undefined; inst.render(); BB.toast('Area guide published', 'good'); },
    'sh-save-meta': inst => { const p = home(inst), st = inst.st; BB.act.updateSeo(p.id, { metaTitle: st.sh_mt == null ? BB.seo.seoOf(p).metaTitle : st.sh_mt, metaDescription: st.sh_md == null ? BB.seo.seoOf(p).metaDescription : st.sh_md }); st.sh_mt = st.sh_md = undefined; inst.render(); BB.toast('Google title and description published', 'good'); },
    'sh-reset-meta': inst => { const p = home(inst); BB.act.updateSeo(p.id, { metaTitle: '', metaDescription: '' }); inst.st.sh_mt = inst.st.sh_md = undefined; inst.render(); BB.toast('Back to the automatic title and description'); },
    'sh-faq-add': (inst, v) => { const p = home(inst), idea = BB.seo.faqIdeas(p)[+v]; if (!idea) return; const a = ((inst.st.sh_faq || {})[idea.q] != null ? inst.st.sh_faq[idea.q] : idea.a).trim(); if (!a) { inst.st.sh_faq_err = idea.q; inst.render(); return; } BB.act.addFaqs(p.id, [{ q: idea.q, a }]); inst.st.sh_faq_err = null; BB.toast('FAQ published', 'good'); },
    'sh-kw': (inst, v) => { const p = home(inst), o = BB.seo.seoOf(p); const kws = (o.keywords || []).slice(); const i = kws.indexOf(v); if (i >= 0) kws.splice(i, 1); else kws.push(v); BB.act.updateSeo(p.id, { keywords: kws }); },
    'sh-track': (inst, v) => { const p = home(inst); const n = BB.act.trackAiQuestions(p.id, [v]); BB.toast(n ? 'Tracking in AI visibility' : 'Already tracked', n ? 'good' : undefined); },
    'sh-track-top': inst => { const p = home(inst); const list = BB.seo.keywords(p).filter(k => k.intent !== 'Plan').slice(0, 5).map(k => k.q); const n = BB.act.trackAiQuestions(p.id, list); BB.toast(n ? 'Tracking ' + n + ' new questions' : 'All already tracked', n ? 'good' : undefined); },
    'sh-link-del': (inst, v) => { const p = home(inst); const l = (BB.seo.seoOf(p).sameAs || []).filter((x, i) => i !== +v); BB.act.updateSeo(p.id, { sameAs: l }); },
    'sh-gbp': (inst, v) => { const p = home(inst); const g = Object.assign({}, BB.seo.seoOf(p).gbp); g[v] = !g[v]; BB.act.updateSeo(p.id, { gbp: g }); },
    'sh-submit': async (inst, v, el) => { el.disabled = true; el.textContent = 'Submitting…'; try { const j = await BB.api.call(API() + 'seo/submit', { propertyId: home(inst).id }); BB.api.accept(j); BB.toast(j.message, j.ok ? 'good' : undefined); } catch (e) { BB.toast(e.message); } inst.render(); },
    'sh-ping': async (inst, v, el) => { const p = home(inst); el.disabled = true; try { const j = await BB.api.call(API() + 'seo/ping', { propertyId: p.id }); BB.api.accept(j); BB.toast(j.message, j.ok ? 'good' : undefined); } catch (e) { BB.toast(e.message); } el.disabled = false; },
    'sh-files': inst => inst.set({ sh_show: inst.st.sh_show === 'files' ? null : 'files' }),
    'sh-copy': (inst, v) => { try { navigator.clipboard.writeText(v); BB.toast('Copied'); } catch (_) {} },
  };
  function onClick(ev, inst) {
    const n = ev.target.closest('[data-sh-nav]'); if (n) { ev.preventDefault(); nav(inst, n.dataset.shNav); return; }
    const a = ev.target.closest('[data-sh]'); if (!a) return; const H = HANDLERS[a.dataset.sh]; if (H) { ev.preventDefault(); H(inst, a.dataset.v, a); }
  }
  function onInput(ev, inst) {
    const el = ev.target, f = el.dataset && el.dataset.shf; if (!f) return; const st = inst.st;
    if (f.startsWith('faq:')) { st.sh_faq = st.sh_faq || {}; st.sh_faq[f.slice(4)] = el.value; return; }
    st[f] = el.value;
    if (['sh_sum', 'sh_area', 'sh_mt', 'sh_md'].includes(f)) { clearTimeout(inst._shT); inst._shT = setTimeout(() => { inst._focus = '[data-shf="' + f + '"]'; inst.render(); }, 500); }
  }
  function onSubmit(ev, inst) {
    const f = ev.target.closest('form[data-shform]'); if (!f) return; ev.preventDefault();
    const p = home(inst), st = inst.st, k = f.dataset.shform;
    if (k === 'link') { const u = String(st.sh_link || '').trim(); if (!/^https:\/\/\S+\.\S+/.test(u)) { BB.toast('Paste a full link that starts with https://'); return; } BB.act.updateSeo(p.id, { sameAs: (BB.seo.seoOf(p).sameAs || []).concat(u) }); st.sh_link = ''; BB.toast(BB.seo.LINK_LABEL[BB.seo.linkKind(u)] + ' added', 'good'); }
    if (k === 'video') { const u = String(st.sh_video || '').trim(); const o = BB.act.updateSeo(p.id, { videoUrl: u }); if (u && !(o && o.videoUrl)) { BB.toast('Paste a YouTube or Vimeo link'); return; } st.sh_video = undefined; BB.toast(u ? 'Video linked' : 'Video removed', 'good'); }
    if (k === 'pin') { const m = String(st.sh_pin || '').match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/); if (!m || !BB.act.setMapPin(p.id, m[1], m[2])) { BB.toast('Paste the pin as two numbers, like 54.4281, -2.9037'); return; } st.sh_pin = undefined; BB.toast('Map pin saved', 'good'); }
    inst.render();
  }
  // Where each search engine stands for this home, and Google's own numbers when Search Console has them.
  function indexStatus(p, files, live) {
    const ix = p.indexing || {}, g = ix.google || {}, n = ix.indexnow || {}, perf = ix.perf;
    const when = t => t ? new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '';
    const row = (name, st, txt) => '<li class="sh-ck sh-ix s-' + st + '"><span class="sh-st">' + I(STI[st]) + '</span><div><b>' + name + '</b><small>' + txt + '</small></div></li>';
    const gRow = !live ? row('Google Search Console', 'auto', 'Verified and submitted for you in a real account, with no Google login.')
      : g.state === 'submitted' ? row('Google Search Console', 'ok', 'Verified and sitemap submitted ' + when(g.at) + '. We resubmit daily.')
      : g.state === 'error' ? row('Google Search Console', 'warn', 'Google said: ' + esc(g.error || 'not yet') + '. We retry daily.')
      : files.google ? row('Google Search Console', 'warn', 'Not submitted yet. Press Submit now, or it goes out tonight.')
      : row('Google Search Console', 'warn', 'Automatic submission is not switched on for this server yet. Google still finds your sitemap through robots.txt.');
    const b = ix.bing || {};
    const bRow = !live ? row('Bing Webmaster Tools (ChatGPT, Copilot)', 'auto', 'Verified and submitted for you in a real account, with no Bing login.')
      : b.state === 'submitted' ? row('Bing Webmaster Tools (ChatGPT, Copilot)', 'ok', 'Verified and sitemap submitted ' + when(b.at) + '. We resubmit daily.')
      : b.state === 'verifying' ? row('Bing Webmaster Tools (ChatGPT, Copilot)', 'warn', 'Bing is checking your site. We submit the sitemap as soon as it is verified.')
      : b.state === 'error' ? row('Bing Webmaster Tools (ChatGPT, Copilot)', 'warn', 'Bing said: ' + esc(b.error || 'not yet') + '. We retry daily.')
      : files.bing ? row('Bing Webmaster Tools (ChatGPT, Copilot)', 'warn', 'Not submitted yet. Press Submit now, or it goes out tonight.')
      : null;
    const nRow = !live ? row('Bing, Yandex, Seznam, Naver (IndexNow)', 'auto', 'Pinged whenever your page changes.')
      : n.state === 'sent' ? row('Bing, Yandex, Seznam, Naver (IndexNow)', 'ok', 'Told about your latest changes ' + when(n.at) + '.')
      : n.state === 'error' ? row('Bing, Yandex, Seznam, Naver (IndexNow)', 'warn', esc(n.message || 'Not accepted yet') + ' We retry when the page changes.')
      : row('Bing, Yandex, Seznam, Naver (IndexNow)', 'warn', 'Goes out tonight, or press Submit now.');
    const pf = perf ? '<div class="sh-perf"><span class="eyebrow">Google search, ' + esc(perf.from) + ' to ' + esc(perf.to) + '</span><div class="sh-perf-k"><div><small>Clicks</small><b class="num">' + perf.clicks.toLocaleString('en-GB') + '</b></div><div><small>Impressions</small><b class="num">' + perf.impressions.toLocaleString('en-GB') + '</b></div><div><small>Click rate</small><b class="num">' + perf.ctr + '%</b></div><div><small>Avg position</small><b class="num">' + (perf.position || '–') + '</b></div></div>' +
      (perf.queries.length ? '<table class="tbl sh-q"><thead><tr><th>Top searches</th><th>Clicks</th><th>Shown</th><th>Pos.</th></tr></thead><tbody>' + perf.queries.map(q => '<tr><td>' + esc(q.q) + '</td><td class="num">' + q.clicks + '</td><td class="num">' + q.impressions + '</td><td class="num">' + q.position + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No searches yet. New sites usually show up within 2 to 4 weeks.</p>') + '</div>' : '';
    return '<ul class="sh-checks sh-ixl">' + gRow + (bRow || '') + nRow + row('Every other crawler', 'auto', 'robots.txt points to your sitemap, so every engine and AI crawler finds it.') + '</ul>' + pf;
  }
  function edBox(inst, key, val, rows, ph) { return '<textarea class="sh-ta" data-shf="' + key + '" id="' + ID(inst, key) + '" rows="' + rows + '" placeholder="' + esc(ph || '') + '">' + esc(val || '') + '</textarea>'; }
  const byLine = by => by === 'claude' ? '<span class="sh-by ai">' + I('spark') + 'Written by Claude from your facts. Check it before you publish.</span>' : by === 'rules' ? '<span class="sh-by">' + I('edit') + 'Drafted from your facts. Make it yours before you publish.</span>' : '';

  V.seo = {
    label: 'Search health', group: 'Get found', icon: 'search', order: 15,
    click: onClick, input: onInput, submit: onSubmit,
    after(inst) { const p = home(inst); if (p) loadFiles(inst, p.id); },
    render(inst) {
      const s = S(), st = inst.st;
      if (!s.properties.length) return '<div class="ag sh">' + vh('Search health', 'Add a home first, then come back to see how it shows up in Google and AI answers.') + '</div>';
      const p = home(inst), A = BB.seo.audit(p), o = BB.seo.seoOf(p), files = (st.sh_files || {})[p.id] || {};
      const live = !!s.live, writer = files.writer;
      const cat = st.sh_cat ? A.cats.find(c => c.id === st.sh_cat) : null;
      const list = cat ? cat.checks : A.fixes.slice(0, 8);
      const row = c => '<li class="sh-ck s-' + c.status + '"><span class="sh-st" title="' + STL[c.status] + '">' + I(STI[c.status]) + '</span><div><b>' + esc(c.label) + '</b><small>' + esc(c.detail) + '</small>' + (c.fix ? '<p>' + esc(c.fix) + '</p>' : '') + '</div>' +
        (c.fix ? '<span class="sh-gain">+' + (c.gain || '') + (c.gain ? ' pts' : '') + '</span>' + (c.act ? '<button class="btn sm' + (c.status === 'fail' ? ' primary' : '') + '" data-sh="sh-fix" data-v="' + c.id + '">' + fixLabel(c.act) + '</button>' : '') : BB.pill(c.status === 'auto' ? 'muted' : 'good', STL[c.status])) + '</li>';
      if (cat) list.forEach(c => { if (c.fix) c.gain = (A.fixes.find(f => f.id === c.id) || {}).gain; });

      const sumV = st.sh_sum != null ? st.sh_sum : o.summary, areaV = st.sh_area != null ? st.sh_area : o.areaIntro;
      const mt = st.sh_mt != null ? st.sh_mt : (o.metaTitle || BB.seo.titleOf(p)), md = st.sh_md != null ? st.sh_md : (o.metaDescription || BB.seo.descOf(p));
      const drafting = what => st.sh_busy === what;
      const wbtn = (what, label) => '<button class="btn sm" data-sh="sh-write" data-v="' + what + '"' + (st.sh_busy ? ' disabled' : '') + '>' + I(writer ? 'spark' : 'edit') + (drafting(what) ? 'Writing…' : label || (writer ? 'Write with AI' : 'Draft from my facts')) + '</button>';
      const ideas = BB.seo.faqIdeas(p), kws = BB.seo.keywords(p), tracked = new Set(s.ai.questions.filter(q => q.propertyId === p.id).map(q => q.q.toLowerCase()));
      const links = o.sameAs || [], srcs = BB.seo.sources(p.id), ownDom = String(p.domain || '').replace(/^www\./, '');
      const maxSrc = srcs.reduce((a, x) => Math.max(a, x.n), 1);

      return '<div class="ag sh' + (inst.compact ? ' ag-compact' : '') + '">' +
        vh('Search health', 'How well ' + esc(p.name) + ' is set up to be found on Google, in maps and in AI answers, and what to do next.', '<button class="btn" data-sh-nav="ai">' + I('spark') + 'AI visibility</button><button class="btn" data-sh-nav="website">' + I('web') + 'Website & SEO</button>') +
        (s.properties.length > 1 ? '<div class="ag-ptabs" role="tablist" aria-label="Homes">' + s.properties.map(x => { const sc = BB.seo.audit(x).score; return '<button type="button" role="tab" aria-selected="' + (x.id === p.id) + '" data-sh="sh-pid" data-v="' + x.id + '"><span class="sh-pscore t-' + tone(sc) + '">' + sc + '</span><span><b>' + esc(x.name) + '</b><small class="mono">' + esc(x.domain || '') + '</small></span></button>'; }).join('') + '</div>' : '') +

        '<div class="sh-top">' +
          '<section class="a-card ag-card sh-score"><div class="sh-score-in">' + gauge(A.score) + '<div><span class="eyebrow">Search health</span><b class="disp">' + A.grade + '</b><p class="muted">' + A.auto + ' checks handled for you. ' + A.fixes.length + (A.fixes.length === 1 ? ' thing' : ' things') + ' to improve, best first below.</p></div></div></section>' +
          '<div class="sh-cats" role="list">' + A.cats.map(c => '<button type="button" role="listitem" class="sh-cat' + (st.sh_cat === c.id ? ' on' : '') + '" data-sh="sh-cat" data-v="' + c.id + '" title="' + esc(c.about) + '"><span>' + esc(c.label) + '</span><b class="num t-' + tone(c.score) + '">' + c.score + '</b><i><em class="t-' + tone(c.score) + '" style="width:' + c.score + '%"></em></i><small>' + (c.todo ? c.todo + ' to improve' : 'All good') + '</small></button>').join('') + '</div>' +
        '</div>' +

        card('fixes', cat ? esc(cat.label) : 'Fix these first', cat ? esc(cat.about) + ' <button class="sh-link" data-sh="sh-cat" data-v="' + cat.id + '">Show top fixes</button>' : 'Ordered by how much each one adds', '<ul class="sh-checks">' + (list.length ? list.map(row).join('') : '<li class="sh-ck s-ok"><span class="sh-st">' + I('check') + '</span><div><b>Nothing left to fix</b><small>Every check passes. We keep checking as your site and AI answers change.</small></div></li>') + '</ul>') +

        '<div class="sh-grid">' +
          card('summary', 'Answer-first summary', 'AEO · AIO · GEO', '<p class="sh-help">40 to 60 words that answer "what is it, where, who for, how much". It sits under the main heading, in the schema and in llms.txt, where answer engines read first.</p>' +
            edBox(inst, 'sh_sum', sumV, 4, 'e.g. ' + BB.seo.draft(p, 'summary')) + '<div class="sh-row"><small class="muted num">' + words(sumV) + ' words</small>' + byLine(st.sh_sum != null ? st.sh_sum_by : null) + '<span class="sh-sp"></span>' + wbtn('summary') + '<button class="btn sm primary" data-sh="sh-save-sum"' + (st.sh_sum != null && st.sh_sum !== o.summary ? '' : ' disabled') + '>Publish</button></div>') +
          card('meta', 'Google title and description', 'On-page', '<div class="ag-serp-r sh-serp"><div class="ag-serp-u"><span class="ag-fav" style="background:' + esc(p.color || '#3355FF') + '"></span><div><b>' + esc(p.name) + '</b><small>https://' + esc(p.domain || '') + '</small></div></div><p class="ag-serp-t">' + esc(mt.slice(0, 62)) + (mt.length > 62 ? '…' : '') + '</p><p class="ag-serp-d">' + esc(md.slice(0, 160)) + (md.length > 160 ? '…' : '') + '</p></div>' +
            '<label class="field"><span>Title <em class="num ' + (mt.length > 62 ? 't-bad' : 'muted') + '">' + mt.length + '/62</em></span><input data-shf="sh_mt" value="' + esc(mt) + '"></label><label class="field"><span>Description <em class="num ' + (md.length > 160 ? 't-bad' : 'muted') + '">' + md.length + '/160</em></span><textarea class="sh-ta" data-shf="sh_md" rows="3">' + esc(md) + '</textarea></label>' +
            '<div class="sh-row">' + byLine(st.sh_mt != null ? st.sh_meta_by : null) + '<span class="sh-sp"></span>' + (o.metaTitle || o.metaDescription ? '<button class="btn sm" data-sh="sh-reset-meta">Use automatic</button>' : '') + wbtn('meta') + '<button class="btn sm primary" data-sh="sh-save-meta"' + (st.sh_mt != null || st.sh_md != null ? '' : ' disabled') + '>Publish</button></div>') +
        '</div>' +

        card('area', 'Local area guide', 'Content · Local · AIO', '<p class="sh-help">For searches like "things to do near ' + esc(BB.seo.town(p) || 'here') + '". It is published on your page with your nearby places, and marked up as tourist attractions.</p>' +
          edBox(inst, 'sh_area', areaV, 7, 'Walks, pubs, beaches and days out near ' + p.name + '…') + '<div class="sh-row"><small class="muted num">' + words(areaV) + ' words · ' + (p.guide || []).length + ' nearby places</small>' + byLine(st.sh_area != null ? st.sh_area_by : null) + '<span class="sh-sp"></span>' + wbtn('area') + '<button class="btn sm primary" data-sh="sh-save-area"' + (st.sh_area != null && st.sh_area !== o.areaIntro ? '' : ' disabled') + '>Publish</button></div>') +

        '<div class="sh-grid">' +
          card('faqs', 'Questions to answer', 'AEO · GEO', '<p class="sh-help">Questions guests ask that your site does not answer yet. Answers are drafted from your facts; anything we cannot know is left for you.</p>' +
            (ideas.length ? '<ul class="sh-ideas">' + ideas.map((f, i) => { const v = (st.sh_faq || {})[f.q] != null ? st.sh_faq[f.q] : f.a; return '<li><b>' + esc(f.q) + '</b><textarea class="sh-ta" rows="2" data-shf="faq:' + esc(f.q) + '" placeholder="' + (f.needs ? 'Only you know this. Write a one-line answer.' : '') + '">' + esc(v) + '</textarea>' + (st.sh_faq_err === f.q ? '<small class="t-bad">Write an answer first.</small>' : '') + '<div class="sh-row">' + (f.needs && !v ? BB.pill('warn', 'Needs your answer') : '') + '<span class="sh-sp"></span><button class="btn sm" data-sh="sh-faq-add" data-v="' + i + '">' + I('plus') + 'Add to site</button></div></li>'; }).join('') + '</ul>' + (writer ? '<div class="sh-row"><span class="sh-sp"></span>' + byLine(st.sh_faq_by) + wbtn('faqs', 'Answer all with AI') + '</div>' : '') : '<p class="muted">Every common question is answered. Add your own in Website & SEO.</p>')) +
          card('keywords', 'Searches to target', 'Content · On-page · GEO', '<p class="sh-help">What travellers type into Google and ask AI assistants, built from your home\'s facts. Target the ones that fit, and track them in AI visibility.</p>' +
            '<div class="tblwrap"><table class="tbl sh-kw"><thead><tr><th>Search</th><th>Intent</th><th>On site</th><th></th></tr></thead><tbody>' + kws.map(k => { const on = (o.keywords || []).includes(k.q); return '<tr><td><b>' + esc(k.q) + '</b><small class="muted">' + esc(k.use) + '</small></td><td>' + BB.pill(k.intent === 'Book' ? 'good' : k.intent === 'Compare' ? 'info' : 'muted', k.intent) + '</td><td>' + (k.onSite ? '<span class="t-good">' + I('check') + '</span>' : '<span class="muted">–</span>') + '</td><td class="sh-kwa"><button class="btn sm' + (on ? ' primary' : '') + '" data-sh="sh-kw" data-v="' + esc(k.q) + '" aria-pressed="' + on + '">' + (on ? 'Targeted' : 'Target') + '</button>' + (k.intent !== 'Plan' ? '<button class="btn sm" data-sh="sh-track" data-v="' + esc(k.q) + '"' + (tracked.has(k.q) ? ' disabled' : '') + '>' + (tracked.has(k.q) ? 'Tracked' : 'Track in AI') + '</button>' : '') + '</td></tr>'; }).join('') + '</tbody></table></div>' +
            '<div class="sh-row"><span class="sh-sp"></span><button class="btn sm" data-sh="sh-track-top">' + I('spark') + 'Track the top 5 in AI visibility</button></div>') +
        '</div>' +

        '<div class="sh-grid">' +
          card('listed', 'Where this home is listed', 'Local · Off-page · LLMO', '<p class="sh-help">Your other listings, Google Maps, social profiles and any local or press mentions. Each becomes a sameAs link, so Google and AI models know they are all the same home.</p>' +
            (links.length ? '<ul class="sh-links">' + links.map((u, i) => '<li>' + BB.pill(BB.seo.linkKind(u) === 'local' ? 'info' : 'muted', BB.seo.LINK_LABEL[BB.seo.linkKind(u)]) + '<a href="' + esc(u) + '" target="_blank" rel="noopener" class="mono">' + esc(u.replace(/^https:\/\/(www\.)?/, '').slice(0, 48)) + '</a><button class="btn sm ghost" data-sh="sh-link-del" data-v="' + i + '" aria-label="Remove">' + I('x') + '</button></li>').join('') + '</ul>' : '') +
            '<form data-shform="link" class="sh-inl"><input data-shf="sh_link" placeholder="https://www.airbnb.co.uk/rooms/…" value="' + esc(st.sh_link || '') + '" aria-label="Link"><button class="btn sm" type="submit">' + I('plus') + 'Add</button></form>' +
            '<form data-shform="video" class="sh-inl"><input data-shf="sh_video" placeholder="YouTube walkthrough link" value="' + esc(st.sh_video != null ? st.sh_video : o.videoUrl) + '" aria-label="Video link"><button class="btn sm" type="submit">' + I('play') + 'Save video</button></form>' +
            '<form data-shform="pin" class="sh-inl"><input data-shf="sh_pin" placeholder="Map pin, like 54.4281, -2.9037" value="' + esc(st.sh_pin != null ? st.sh_pin : (p.lat && p.lng ? p.lat + ', ' + p.lng : '')) + '" aria-label="Map pin"><button class="btn sm" type="submit">' + I('pin') + 'Save pin</button></form>' +
            '<p class="sh-tip">' + I('bolt') + '<span>In Google Maps, right-click the home and click the numbers at the top to copy its pin.</span></p>') +
          card('gbp', 'Google Business Profile', 'Local · Guidance', '<p class="sh-help">The profile decides whether you show in the map pack and "near me" searches. Tick each step as you do it.</p><ul class="sh-gbp">' +
            BB.seo.GBP.map(([id, t, d]) => { const on = !!(o.gbp || {})[id]; return '<li><button type="button" class="sh-tick' + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '" data-sh="sh-gbp" data-v="' + id + '">' + I('check') + '</button><div><b>' + esc(t) + '</b><small>' + esc(d) + '</small></div></li>'; }).join('') + '</ul>' +
            '<a class="btn sm" href="https://business.google.com/" target="_blank" rel="noopener">' + I('out') + 'Open Google Business Profile</a>') +
        '</div>' +

        '<div class="sh-grid">' +
          card('cites', 'Sites AI assistants cite', 'GEO · LLMO', srcs.length ? '<p class="sh-help">The sources ChatGPT, Gemini, Perplexity and Google used when answering your tracked questions. Getting listed or mentioned on the top ones is the fastest way into answers.</p><ul class="sh-src">' + srcs.map(x => { const own = ownDom && ownDom.startsWith(x.domain); return '<li class="' + (own ? 'own' : '') + '"><span class="mono">' + esc(x.domain) + '</span>' + (own ? BB.pill('good', 'Your site') : BB.pill('muted', BB.seo.LINK_LABEL[BB.seo.linkKind('https://' + x.domain)])) + '<i><em style="width:' + Math.round(100 * x.n / maxSrc) + '%"></em></i><span class="num">' + x.n + '</span><span class="sh-eng">' + BB.aiLogos(Object.keys(x.engines), 'sh-logos') + '</span></li>'; }).join('') + '</ul>'
            : '<p class="muted">' + (live ? 'Shown after the next AI check. We record every site each answer cites.' : 'Run an AI check to see the sites answers cite.') + '</p>') +
          card('index', 'Indexing', 'Technical', (files.sitemap ? '<ul class="sh-files"><li><span>Sitemap with images</span><a class="mono" href="' + esc(files.sitemap) + '" target="_blank" rel="noopener">' + esc(files.sitemap.replace(/^https?:\/\//, '')) + '</a></li><li><span>robots.txt</span><a class="mono" href="' + esc(files.robots) + '" target="_blank" rel="noopener">' + esc(files.robots.replace(/^https?:\/\//, '')) + '</a></li><li><span>llms.txt</span><a class="mono" href="' + esc(files.llmsUrl) + '" target="_blank" rel="noopener">' + esc(files.llmsUrl.replace(/^https?:\/\//, '')) + '</a></li></ul>' : '<p class="muted">' + (files.loading ? 'Loading…' : 'Sitemap, robots.txt and llms.txt are published with your site.') + '</p>') +
            indexStatus(p, files, live) +
            '<div class="sh-ping"><div><b>Submit to search engines now</b><small>' + (live ? 'We do this every day by ourselves. Google gets the sitemap through our Search Console account, and Bing, Yandex, Seznam and Naver hear about changes through IndexNow. Your guests never see any of it, and you never sign in.' : 'In your account this runs every day by itself: Google Search Console through our account, and IndexNow for Bing and others. No logins.') + '</small></div><button class="btn sm primary" data-sh="sh-submit"' + (api() ? '' : ' disabled') + '>' + I('send') + 'Submit now</button></div>' +
            '<details class="sh-steps"><summary>Also want it in your own Search Console? (optional)</summary><ol><li>Open <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> and add a URL-prefix property for your site address.</li><li>Verify with the HTML tag method, or with a DNS record if you use your own domain.</li><li>Under Sitemaps, submit the sitemap address above.</li><li>In <a href="https://www.bing.com/webmasters" target="_blank" rel="noopener">Bing Webmaster Tools</a>, choose "Import from Google Search Console". It copies everything in one step.</li></ol></details>' +
            '<button class="btn sm" data-sh="sh-files">' + I('search') + (st.sh_show === 'files' ? 'Hide what crawlers see' : 'See what crawlers and AI read') + '</button>' +
            (st.sh_show === 'files' ? (files.jsonld ? '<div class="sh-types">' + files.jsonld['@graph'].map(n => BB.pill('info', n['@type'])).join('') + '</div><span class="eyebrow">llms.txt</span><pre class="sh-pre">' + esc(files.llms) + '</pre><span class="eyebrow">Structured data</span><pre class="sh-pre">' + esc(JSON.stringify(files.jsonld, null, 2)) + '</pre>' : '<p class="muted">' + esc(files.error || 'Loading…') + '</p>') : '')) +
        '</div>' +

        card('cover', 'Every kind of search, covered', 'What is automatic and what is guidance', '<div class="tblwrap"><table class="tbl sh-cover"><tbody>' + COVER.map(([n, k, d]) => '<tr><td><b>' + esc(n) + '</b></td><td>' + BB.pill(COVL[k][0], COVL[k][1]) + '</td><td class="muted">' + esc(d) + '</td></tr>').join('') + '</tbody></table></div>') +
      '</div>';
    },
  };
})();
