/* Bookingbooster prototype: our own marketing website (bookingbooster.com, selling to hosts) and the host signup wizard.
   Surface 'site'. opts.view: 'home' | 'onboard' | 'pricing'. Reads live numbers from the shared store and ends onboarding
   with BB.act.addProperty, so the new home shows up in the console, the property site and the activity feed. */
(function () {
  const BB = window.BB, esc = BB.esc, D = BB.D, $ = BB.money, icon = BB.icon;
  const FEE = () => BB.PLATFORM_FEE.airbnb;
  // On the real marketing site (not the demo) we show no sample customers or figures, and the real company details.
  const LIVE = () => !!(BB.BOOT && BB.BOOT.mode === 'marketing');
  const CO = () => Object.assign({ name: 'Bookingbooster Ltd', number: '', address: '', vat: '', support: 'help@booking-booster.co.uk' }, (BB.BOOT && BB.BOOT.company) || {});

  /* ---------- static content ---------- */
  const PLANS = [
    // One plan: a one-off setup fee, first month free, then a monthly price. Both include VAT.
    { id: 'growth', name: 'Growth', price: 200, setup: 997, tag: 'Done for you', hot: true, blurb: 'We set it up and keep growing it.', feats: ['Booking site on your own domain', 'Card payments, deposit holds and payouts', 'Guest check-in app and door codes', 'New local SEO pages every month', 'AI visibility tracking and fixes', 'Campaigns written and sent for you', 'Text message outreach'], cta: 'Start with Growth' },
  ];
  const ADDON = { name: 'Calendar sync add-on', price: 15 };
  const plan = id => PLANS.find(p => p.id === id) || PLANS[0];
  const perMonth = (p, annual) => annual ? Math.round(p.price * 10 / 12) : p.price;
  const gbp = n => '£' + n;

  const THEMES = {
    cabin: { label: 'Fell cabin', note: 'Larch wood, serif type, fellside light', color: '#2F5D46' },
    lake: { label: 'Harbour cottage', note: 'Sea blues, clean type, harbour views', color: '#0F6E8C' },
    city: { label: 'Georgian townhouse', note: 'Honey stone, elegant type, city calm', color: '#8A5A2B' },
  };
  const ENGINES = [['chatgpt', 'ChatGPT'], ['gemini', 'Gemini'], ['perplexity', 'Perplexity'], ['google', 'Google AI Overviews']];
  const STAY_TYPES = [['cabin', 'Cabin or lodge'], ['cottage', 'Country cottage'], ['beach', 'Seaside cottage'], ['city', 'City apartment'], ['farm', 'Barn conversion'], ['hut', 'Shepherd’s hut']];
  const FAQ = [
    ['Do I have to leave Airbnb or Vrbo?', 'No. Keep your listings if you like. We focus on growing your direct bookings, so over time fewer stays need a platform. If you keep a listing running, the optional Calendar sync add-on (£15 a month) reads the calendar from your channel manager, Airbnb, Vrbo or Booking.com and blocks those dates on your site, so you never double book. We never list your home on the platforms or change your rates there.'],
    ['How do guests pay?', 'By card, Apple Pay or Google Pay through Stripe, paid straight into your UK bank account. Security deposits are card holds that release on their own after checkout.'],
    ['What is AI visibility?', 'How often your holiday let shows up in ChatGPT, Gemini, Perplexity and Google when travellers ask where to stay. We check the questions guests ask about your area every week and fix the gaps.'],
    ['How long does setup take?', 'Paste your listing link and your site is live the same day on a free address. Connecting your own .co.uk domain, SEO pages and your guest list takes us about a week.'],
    ['Who owns the guest list?', 'You do. Every guest who books direct, and every past guest you import, is yours to export at any time. We handle their data under UK GDPR.'],
    ['Do prices include VAT?', 'Yes. Every price on this page includes VAT. There is a one-off £997 setup fee, your first month is free, then it is £200 a month. There is no contract, and you can cancel from your console at any time. Your domain stays yours.'],
  ];

  /* ---------- small helpers ---------- */
  const hash = s => { let h = 7; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
  const slug = s => String(s || '').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '').slice(0, 30);
  const pct = n => Math.round(n * 100) + '%';
  const compact = n => n >= 1000 ? '£' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : $(n);
  const county = area => (String(area).split(',')[1] || '').trim();
  const town = area => String(area || '').split(',')[0].trim();
  const cap = s => String(s || '').replace(/\b\w/g, c => c.toUpperCase());

  function tween(el, to, fmt) {
    const from = el._v != null ? el._v : Number(el.dataset.v || to); el._v = to;
    if (el._raf) cancelAnimationFrame(el._raf);
    const t0 = performance.now(), dur = 520;
    const stepF = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(from + (to - from) * e); if (k < 1) el._raf = requestAnimationFrame(stepF); };
    el._raf = requestAnimationFrame(stepF);
  }
  function later(inst, ms, fn) { const t = setTimeout(() => { inst.timers = inst.timers.filter(x => x !== t); if (inst.alive) fn(); }, ms); inst.timers.push(t); }
  function clearTimers(inst) { (inst.timers || []).forEach(clearTimeout); inst.timers = []; }
  const go = (surface, opts) => ' data-go="' + surface + '"' + (opts ? ' data-opts="' + esc(JSON.stringify(opts)) + '"' : '');

  /* ---------- illustrations: property scenes and a mini property site ---------- */
  function scene(theme) {
    if (theme === 'lake') return '<div class="s-scene t-lake" aria-hidden="true"><i class="sun"></i><i class="head"></i><i class="sea"></i><i class="wall"></i><i class="boat b1"></i><i class="boat b2"></i><i class="cot"></i><i class="roof"></i><i class="cwin"></i></div>';
    if (theme === 'city') return '<div class="s-scene t-city" aria-hidden="true"><i class="hill"></i><i class="ter"></i><i class="par"></i><i class="win"></i><i class="doors"></i><i class="rail"></i><i class="street"></i></div>';
    return '<div class="s-scene t-cabin" aria-hidden="true"><i class="sun"></i><i class="mtn"></i><i class="mtn m2"></i><i class="tree t1"></i><i class="tree t3"></i><i class="cab"></i><i class="win"></i><i class="tree t2"></i><i class="tree t4"></i></div>';
  }
  // The demo guest site, shown as a real screenshot in a browser frame (see /media in server/index.js).
  const DEMO_SHOT = '/media/demo-site.jpg';
  function shotSite(o) {
    return '<div class="s-browser s-shot' + (o.cls ? ' ' + o.cls : '') + '">' +
      '<div class="s-bbar"><i></i><i></i><i></i><span>' + icon('lock') + 'larchfellcabin.co.uk</span></div>' +
      '<div class="s-shot-vp"><img src="' + DEMO_SHOT + '" alt="Larch Fell Cabin, a demo booking website made with Bookingbooster" loading="eager"></div></div>';
  }
  function miniSite(o) {
    if (o.shot) return shotSite(o);
    const th = o.theme || 'cabin';
    return '<div class="s-browser th-' + th + (o.cls ? ' ' + o.cls : '') + '">' +
      '<div class="s-bbar"><i></i><i></i><i></i><span>' + icon('lock') + esc(o.domain || 'yourhome.co.uk') + '</span></div>' +
      '<div class="s-ms">' +
        '<div class="s-ms-nav"><b>' + esc(o.name || 'Your home') + '</b><span>The home<em>·</em>Area<em>·</em>Reviews</span><i>Book</i></div>' +
        '<div class="s-ms-hero">' + scene(th) +
          '<div class="s-ms-over"><h5>' + esc(o.name || 'Your home') + '</h5>' +
          (o.price ? '<div class="s-ms-book"><span><b>' + $(o.price) + '</b> / night</span>' + (o.save ? '<em>Save ' + $(o.save) + ' vs Airbnb</em>' : '') + '<i>Book direct</i></div>' : '') +
        '</div></div>' +
      '</div></div>';
  }

  /* ---------- data pulled from the store ---------- */
  function liveData() {
    const s = BB.store.get();
    const m = BB.metrics();
    const p = s.properties[0];
    const q = BB.quote(p.id, D.add(s.today, 20), D.add(s.today, 23), { adults: 2 });
    const recent = s.bookings.filter(b => b.channel === 'direct' && b.status !== 'cancelled').sort((a, b) => (b.createdAt + b.id).localeCompare(a.createdAt + a.id))[0];
    const found = s.bookings.filter(b => b.status !== 'cancelled' && ['google', 'ai'].includes(b.source)).sort((a, b) => (b.createdAt + b.id).localeCompare(a.createdAt + a.id))[0] || recent;
    const aiQ = s.ai.questions.find(x => x.engines.chatgpt && found && x.propertyId === found.propertyId) || s.ai.questions.find(x => x.engines.chatgpt) || s.ai.questions[0];
    const ai = BB.aiScore();
    return { s, m, p, save: q ? q.guestSaves : 0, recent, found, aiQ, aiP: BB.q.property(aiQ.propertyId), ai };
  }

  /* =====================================================================
     HOME
     ===================================================================== */
  function nav(inst) {
    const u = inst.uid, links = [['product', 'Product'], ['ai', 'AI search'], ['pricing', 'Pricing'], LIVE() ? ['faq', 'FAQ'] : ['customers', 'Customers']];
    return '<header class="s-nav"><div class="s-w s-nav-in">' +
      '<button class="s-logo" data-scroll="top" aria-label="Bookingbooster home">' + BB.lockup() + '</button>' +
      '<nav class="s-links" aria-label="Main">' + links.map(([k, t]) => '<button data-scroll="' + k + '">' + t + '</button>').join('') + '</nav>' +
      '<div class="s-nav-acts"><button class="btn ghost s-login"' + go('app') + '>Log in</button><button class="btn ink" data-act="start">Get started</button>' +
      '<button class="iconbtn s-menu" data-act="menu" aria-expanded="' + !!inst.st.menu + '" aria-controls="s-mnav-' + u + '" aria-label="Menu">' + icon(inst.st.menu ? 'x' : 'menu') + '</button></div>' +
      '</div>' +
      (inst.st.menu ? '<div class="s-mnav" id="s-mnav-' + u + '">' + links.map(([k, t]) => '<button data-scroll="' + k + '">' + t + icon('chev') + '</button>').join('') +
        '<div class="s-mnav-acts"><button class="btn lg"' + go('app') + '>Log in</button><button class="btn primary lg" data-act="start">Get started</button></div></div>' : '') +
      '</header>';
  }

  function hero(inst, L) {
    const r = L.found, g = r && BB.q.guest(r.guestId), rp = r && BB.q.property(r.propertyId);
    const gname = g ? g.name.split(' ')[0] + ' ' + (g.name.split(' ')[1] || '')[0] + '.' : '';
    const via = r && r.source === 'ai' ? 'ChatGPT' : r && r.source === 'google' ? 'Google search' : 'your site';
    const ret = Math.round(L.m.returningShare * 100);
    const retNames = L.s.guests.filter(x => x.tags.includes('Repeat')).slice(0, 3).map(x => x.name);
    return '<section class="s-hero" id="s-top-' + inst.uid + '"><div class="s-w s-hero-in">' +
      '<div class="s-hero-copy">' +
        '<button class="s-tagline s-rise" style="--d:0" data-scroll="ai"><b>New</b>Does AI recommend your holiday let?' + icon('arrow') + '</button>' +
        '<h1 class="s-h1 s-rise" style="--d:1">More direct bookings. <span class="s-hl">Less platform fees.</span></h1>' +
        '<p class="s-lead s-rise" style="--d:2">Own your bookings, your guests and your website. We get your holiday let found on Google and in AI answers, bring past guests back, and you stop paying 15% or more on every stay.</p>' +
        '<div class="s-cta s-rise" style="--d:3"><button class="btn primary lg s-glow" data-act="start">Get my booking site' + icon('arrow') + '</button><button class="btn lg"' + go('live') + '>' + icon('play') + 'See the live demo</button></div>' +
        (LIVE() ? '<div class="s-proof s-rise" style="--d:4"><span><b>No commission on bookings.</b> First month free. Prices include VAT.</span></div>'
          : '<div class="s-proof s-rise" style="--d:4"><span class="s-faces">' + ['Amelia Clarke', 'Rhys Evans', 'Priya Nair', 'Callum Reid'].map(n => BB.avatar(n, 'sm')).join('') + '</span>' +
          '<span><b>1,200+ UK hosts</b> keep their fees<span class="s-stars">★★★★★</span>4.9 average<small>Sample figures</small></span></div>') +
      '</div>' +
      '<div class="s-collage" aria-label="Product preview with live numbers from the demo">' +
        '<div class="s-rise" style="--d:2">' + miniSite({ theme: L.p.theme, name: L.p.name, domain: L.p.domain, price: L.p.nightly, save: L.save, cls: 's-hero-browser', shot: true }) + '</div>' +
        (r ? '<div class="s-fc s-fc-ai s-rise" style="--d:5"><small>' + icon(r.source === 'ai' ? 'spark' : 'search') + 'Booked via ' + via + '</small>' +
          (r.source === 'ai' ? '<p class="s-fc-q">“' + esc(L.aiQ.q.charAt(0).toUpperCase() + L.aiQ.q.slice(1)) + '?”</p>' : '') +
          '<p><b>' + esc(gname) + ' booked ' + esc(rp.short) + '</b> for ' + BB.dates(r) + '.</p><span class="s-fc-row"><b class="num">' + $(r.total) + '</b><span class="s-cite">' + icon('check') + 'You kept ' + $(Math.round(r.total * FEE())) + '</span></span></div>' : '') +
        '<div class="s-fc s-fc-bk s-rise" style="--d:6"><span class="s-faces">' + retNames.map(n => BB.avatar(n, 'sm')).join('') + '</span><span><small>Returning guests</small><b><span class="num">' + ret + '%</span> of bookings</b><em>came from guests who stayed before</em></span></div>' +
        '<div class="s-fc s-fc-fee s-rise" style="--d:7"><small>Fees kept this year</small><b class="num">' + $(L.m.saved) + '</b><span class="s-bars">' + [32, 44, 51, 63, 78, 100].map(h => '<i style="height:' + h + '%"></i>').join('') + '</span></div>' +
      '</div>' +
    '</div></section>';
  }

  function logos() {
    const names = ['Stripe', 'Apple Pay', 'Google Pay', 'Nuki', 'Yale', 'Google Business Profile', 'Google Search Console', 'Email', 'Text messages'];
    return '<section class="s-logos" aria-label="Tools we run for you"><div class="s-w"><p class="eyebrow">Runs on tools you can trust</p><ul>' +
      names.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div></section>';
  }

  function film() {
    return '<section class="s-sec s-film" id="s-film" aria-label="Explainer video"><div class="s-w">' +
      '<div class="s-head s-center"><p class="eyebrow">See it in 47 seconds</p><h2 class="s-h2">What Bookingbooster does for your holiday let.</h2></div>' +
      '<div class="s-film-frame"><video controls preload="none" playsinline poster="/media/explainer.jpg" src="/media/explainer.mp4" aria-label="Bookingbooster explainer video"></video></div>' +
      '</div></section>';
  }

  function pillars(inst, L) {
    const vis = Object.values(L.s.website.visitors).reduce((a, b) => a + b, 0);
    const c1 = L.s.campaigns.find(c => c.status === 'sent') || L.s.campaigns[0];
    const lp = L.p;
    const cards = [
      ['blue', '01', 'Website', 'Your own booking site', 'Your domain, instant booking, payments and deposits. Guests skip the service fee, so they pick you.', '<span class="s-viz-url">' + icon('lock') + esc(lp.domain) + '</span><span class="s-viz-row"><b class="num">' + vis.toLocaleString('en-GB') + '</b> visits this month</span>', go('property', { propertyId: lp.id }), 'See a host site'],
      ['', '02', 'SEO', 'Found on Google', 'Local pages for the searches guests really make near you, written and published every month.', '<span class="s-viz-q">“cabin hot tub lake district”</span><span class="s-viz-row"><b class="num">#4</b><em class="s-up">▲ 3</em> in Google</span>', go('app', { view: 'website' }), 'See website and SEO'],
      ['dark', '03', 'AI answers', 'Recommended by AI', 'Structured so your holiday let shows up in ChatGPT, Gemini, Perplexity and Google AI answers, with a link that books direct.', '<span class="s-viz-row s-viz-ai">' + BB.aiLogos() + '</span><span class="s-viz-row">Mentioned in <b class="num s-yel">' + L.ai.mentioned + ' of ' + L.ai.total + '</b> AI answers</span><span class="s-meter"><i style="width:' + L.ai.score + '%"></i></span>', go('app', { view: 'ai' }), 'See AI visibility'],
      ['yel', '04', 'Guests', 'Guests who return', 'Check-in app, emails and texts that turn one stay into three, sent from your own name.', '<span class="s-viz-row"><b class="num">' + pct(c1.recipients ? c1.opens / c1.recipients : 0.54) + '</b> opened · <b class="num">' + c1.bookings + '</b> rebooked</span><span class="s-viz-q">' + esc(c1.subject) + '</span>', go('app', { view: 'campaigns' }), 'See campaigns'],
    ];
    return '<section class="s-sec" id="s-product-' + inst.uid + '"><div class="s-w">' +
      '<div class="s-head"><p class="eyebrow">One system</p><h2 class="s-h2">Everything a host needs to go direct.</h2>' +
      '<p class="s-sub">Four tools that share one guest list you own. The guest who finds you on Google books on your site, checks in on your app and hears from you next season. No platform in the middle.</p></div>' +
      '<div class="s-pillars">' + cards.map(([cls, n, k, h, p, viz, link, lt]) =>
        '<article class="s-pil ' + cls + '"><span class="s-pil-n">' + n + ' · ' + k + '</span><h3>' + h + '</h3><p>' + p + '</p><div class="s-viz">' + viz + '</div>' +
        '<button class="s-see"' + link + '>' + lt + icon('arrow') + '</button></article>').join('') + '</div>' +
      '</div></section>';
  }

  function calcVals(st) {
    const direct = st.rev * st.share / 100, kept = Math.round(direct * FEE()), planYear = plan('growth').price * 11 + plan('growth').setup;
    return { direct, kept, planYear, net: kept - planYear, weeks: kept > 0 ? Math.ceil(planYear / (kept / 52)) : 99 };
  }
  function calc(inst) {
    const st = inst.st, v = calcVals(st), u = inst.uid, maxBar = Math.max(v.kept, v.planYear, 1);
    return '<section class="s-sec s-calc-sec"><div class="s-w s-calc">' +
      '<div class="s-calc-l"><p class="eyebrow">Fee calculator</p><h2 class="s-h2">What would going direct be worth to you?</h2>' +
        '<p class="s-sub">Every guest who books on your own site skips the platform and its fee. Here is the money that stays with you, in pounds.</p>' +
        '<div class="s-slider"><label for="s-rev-' + u + '"><span>Yearly booking revenue</span><b class="num" data-cv="rev">' + $(st.rev) + '</b></label>' +
          '<input type="range" id="s-rev-' + u + '" data-calc="rev" min="10000" max="250000" step="2000" value="' + st.rev + '" style="--p:' + ((st.rev - 10000) / 2400) + '%"><div class="s-ticks"><span>£10k</span><span>£250k</span></div></div>' +
        '<div class="s-slider"><label for="s-share-' + u + '"><span>Share you could move direct</span><b class="num" data-cv="share">' + st.share + '%</b></label>' +
          '<input type="range" id="s-share-' + u + '" data-calc="share" min="5" max="60" step="1" value="' + st.share + '" style="--p:' + ((st.share - 5) / 0.55) + '%"><div class="s-ticks"><span>5%</span><span>30% is a common first-year goal</span><span>60%</span></div></div>' +
      '</div>' +
      '<div class="s-calc-r" aria-live="polite">' +
        '<p class="s-calc-k">Platform fees you keep each year</p>' +
        '<p class="s-calc-big num" data-cv="kept" data-v="' + v.kept + '">' + $(v.kept) + '</p>' +
        '<p class="s-calc-sm">on <b class="num" data-cv="direct" data-v="' + v.direct + '">' + $(v.direct) + '</b> of bookings moved direct, at Airbnb’s ' + (FEE() * 100).toFixed(1) + '% host fee</p>' +
        '<div class="s-cmp"><div><span>Fees you keep</span><span class="s-cmp-bar"><i class="kept" data-cv="barKept" style="width:' + (100 * v.kept / maxBar) + '%"></i></span><b class="num" data-cv="kept2" data-v="' + v.kept + '">' + $(v.kept) + '</b></div>' +
        '<div><span>Growth plan, first year</span><span class="s-cmp-bar"><i class="plan" data-cv="barPlan" style="width:' + (100 * v.planYear / maxBar) + '%"></i></span><b class="num">' + $(v.planYear) + '</b></div></div>' +
        '<div class="s-calc-net"><span data-cv="netLabel">' + (v.net >= 0 ? 'Left over after the plan' : 'Short of covering the plan') + '</span><b class="num" data-cv="net" data-v="' + v.net + '">' + $(v.net) + '</b></div>' +
        '<p class="s-calc-pay" data-cv="pay">' + payLine(v) + '</p>' +
        '<button class="btn accent lg block" data-act="start">Start keeping it' + icon('arrow') + '</button>' +
        '<p class="s-fine">Estimate only. Uses Airbnb’s host-only fee of 15.5% and the Growth plan’s first year billed monthly (setup fee plus 11 paid months), including VAT.</p>' +
      '</div>' +
    '</div></section>';
  }
  function payLine(v) { return v.net >= 0 ? 'Growth pays for itself in about <b>' + v.weeks + ' weeks</b> of direct bookings.' : 'Move a little more direct and Growth soon pays for itself.'; }
  function updateCalc(inst) {
    const r = inst.root, st = inst.st, v = calcVals(st), q = k => r.querySelector('[data-cv="' + k + '"]'), maxBar = Math.max(v.kept, v.planYear, 1);
    if (!q('kept')) return;
    q('rev').textContent = $(st.rev); q('share').textContent = st.share + '%';
    tween(q('kept'), v.kept, n => $(Math.round(n))); tween(q('kept2'), v.kept, n => $(Math.round(n)));
    tween(q('direct'), v.direct, n => $(Math.round(n))); tween(q('net'), v.net, n => $(Math.round(n)));
    q('barKept').style.width = (100 * v.kept / maxBar) + '%'; q('barPlan').style.width = (100 * v.planYear / maxBar) + '%';
    q('netLabel').textContent = v.net >= 0 ? 'Left over after the plan' : 'Short of covering the plan';
    q('pay').innerHTML = payLine(v);
  }

  /* AI checker */
  function competitors(townName, type) {
    const h = hash(townName.toLowerCase() + type);
    const pre = ['Bracken', 'Heather', 'Sloe', 'Rowan', 'Mill Beck', 'Holly', 'Bramble', 'Hawthorn', 'Ash Ghyll', 'Foxglove'];
    const suf = { cabin: ['Lodge', 'Cabin', 'Hideaway'], cottage: ['Cottage', 'Farmhouse', 'Coach House'], beach: ['Beach House', 'Fisherman’s Cottage', 'Harbour View'], city: ['Apartment', 'Townhouse', 'Mews'], farm: ['Barn', 'Granary', 'Hayloft'], hut: ['Shepherd’s Hut', 'Cabin', 'Treehouse'] }[type] || ['Lodge', 'Cabin', 'Hideaway'];
    const perks = { cabin: ['hot tub and fell views', 'wood burner, sleeps 6', 'riverside, dogs welcome'], cottage: ['inglenook fireplace', 'walled garden, sleeps 6', 'pub at the end of the lane'], beach: ['two minutes to the sand', 'sea-view terrace', 'surfboards and wetsuits'], city: ['walk to everything', 'roof terrace', 'quiet street, fast Wi-Fi'], farm: ['vaulted beams and a log burner', 'open fields, dark skies', 'restored barn, sleeps 8'], hut: ['wood-fired hot tub', 'hidden in an orchard', 'fire pit and stargazing'] }[type] || [];
    const src = ['airbnb.co.uk', 'sykescottages.co.uk', 'vrbo.com'];
    return [0, 1, 2].map(i => ({ name: (i === 1 ? 'The ' + townName + ' ' : pre[((h >>> (i * 3)) + i * 3) % pre.length] + ' ') + suf[i], perk: perks[i], src: src[i] }));
  }
  function aiResult(st) {
    const h = hash(st.town.toLowerCase() + st.type);
    const weak = ENGINES[h % 4][0];
    return { score: 8 + (h % 21), weak, engines: ENGINES.map(([k, t]) => ({ k, t, hit: k === weak })) };
  }
  function aiSection(inst) {
    const a = inst.st.ai, u = inst.uid, typeLabel = (STAY_TYPES.find(t => t[0] === a.type) || STAY_TYPES[0])[1];
    const question = 'Best ' + typeLabel.toLowerCase() + ' to rent in ' + (a.town || 'your town') + ' for a weekend?';
    let panel;
    if (a.phase === 'idle') {
      panel = '<div class="s-chat"><div class="s-q">' + esc(question) + '</div>' +
        '<div class="s-ai-idle">' + ENGINES.map(([k, t]) => '<span>' + BB.aiName(k, t) + '</span>').join('') + '</div>' +
        '<p class="s-ai-hint">Press <b>Check</b> and we ask ChatGPT, Gemini, Perplexity and Google what a traveller would ask about your area.</p></div>';
    } else if (a.phase === 'scan') {
      panel = '<div class="s-chat"><div class="s-q">' + esc(question) + '</div><ul class="s-scan">' + ENGINES.map(([k, t], i) =>
        '<li class="' + (i < a.step ? 'done' : i === a.step ? 'on' : '') + '"><span class="s-scan-ic">' + (i < a.step ? icon('check') : i === a.step ? '<i class="s-spin"></i>' : '') + '</span>' + BB.aiName(k, t) + '<em>' + (i < a.step ? 'Answer read' : i === a.step ? 'Asking…' : 'Waiting') + '</em></li>').join('') + '</ul>' +
        '<div class="s-prog"><i style="width:' + (a.step * 25) + '%"></i></div></div>';
    } else {
      const R = aiResult(a), comp = competitors(a.town, a.type);
      panel = '<div class="s-ai-res">' +
        '<div class="s-ai-score"><div class="s-ring" style="--v:' + R.score + '"><b class="num">' + R.score + '</b><span>of 100</span></div>' +
          '<div><p class="s-ai-verdict">AI assistants rarely recommend holiday lets like yours in ' + esc(a.town) + '.</p><ul class="s-eng">' + R.engines.map(e => '<li>' + BB.aiName(e.k, e.t) + (e.hit ? '<em class="warn">Listed 4th, no link</em>' : '<em class="bad">Not mentioned</em>') + '</li>').join('') + '</ul></div></div>' +
        '<div class="s-chat s-chat-a"><div class="s-q">' + esc(question) + '</div><div class="s-a"><small>Sample answer</small><p>Travellers to ' + esc(a.town) + ' rate these highly:</p><ol>' +
          comp.map(c => '<li><b>' + esc(c.name) + '</b>: ' + esc(c.perk) + '. <span class="s-src">' + c.src + '</span></li>').join('') + '</ol><p class="s-miss">' + icon('x') + 'Your holiday let is not in this answer.</p></div></div>' +
        '<div class="s-ai-cta"><button class="btn accent" data-act="start">Fix my AI visibility' + icon('arrow') + '</button><button class="btn s-ghost-inv"' + go('app', { view: 'ai' }) + '>See the weekly AI report</button></div>' +
      '</div>';
    }
    return '<section class="s-ink" id="s-ai-' + u + '"><div class="s-w s-ai">' +
      '<div class="s-ai-l"><p class="eyebrow">AI search</p><h2 class="s-h2">Travellers ask AI where to stay. Be the answer.</h2>' +
        '<p class="s-sub">We track the questions guests ask about your area and shape your site so assistants recommend it, with a link that books direct.</p>' +
        '<form class="s-ai-form" data-form="ai" novalidate>' +
          '<label class="s-f"><span>Town or area</span><input id="s-ai-town-' + u + '" data-ai="town" value="' + esc(a.town) + '" maxlength="40" autocomplete="off" placeholder="Keswick"></label>' +
          '<label class="s-f"><span>Type of stay</span><select id="s-ai-type-' + u + '" data-ai="type">' + STAY_TYPES.map(([k, t]) => '<option value="' + k + '"' + (a.type === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
          '<button class="btn accent lg" type="submit"' + (a.phase === 'scan' ? ' disabled' : '') + '>' + icon('search') + (a.phase === 'done' ? 'Check again' : a.phase === 'scan' ? 'Checking…' : 'Check') + '</button>' +
          (a.err ? '<p class="s-err" role="alert">' + esc(a.err) + '</p>' : '') +
        '</form>' +
        '<p class="s-fine">Demo: this check is simulated with sample answers. The real check runs in your console every week.</p>' + BB.aiTm() +
      '</div>' +
      '<div class="s-ai-r" aria-live="polite">' + panel + '</div>' +
    '</div></section>';
  }
  function runAi(inst) {
    const a = inst.st.ai; a.town = cap(String(a.town || '').trim()).slice(0, 40);
    if (!a.town) { a.err = 'Enter a town or area to check.'; inst.render(); return; }
    a.err = ''; a.phase = 'scan'; a.step = 0; inst.render();
    const tick = () => later(inst, 650, () => { a.step++; if (a.step >= 4) { a.phase = 'done'; } else tick(); inst.render(); });
    tick();
  }

  function how(inst) {
    const steps = [
      ['Paste your listing link', 'We copy your photos, reviews and house rules from an Airbnb or Vrbo listing in about a minute. Nothing is connected or changed there.', 'link'],
      ['We build and tune it', 'Your booking site, local SEO pages, AI-ready answers and your guest list, set up and kept up for you.', 'build'],
      ['Bookings come direct', 'Guests find you on Google and in AI answers, pay you, check in on your app, and are invited back next season.', 'book'],
    ];
    return '<section class="s-sec"><div class="s-w"><div class="s-head"><p class="eyebrow">How it works</p><h2 class="s-h2">Live the same day. You barely lift a finger.</h2></div>' +
      '<ol class="s-steps">' + steps.map(([h, p, k], i) => '<li><span class="s-step-n num">' + (i + 1) + '</span><h3>' + h + '</h3><p>' + p + '</p>' +
        (k === 'link' ? '<div class="s-step-viz"><span class="s-url-demo">' + icon('globe') + 'airbnb.co.uk/rooms/48213907</span></div>' :
         k === 'build' ? '<div class="s-step-viz s-chk">' + ['Booking site', 'SEO pages', 'AI answers', 'Guest list'].map(x => '<span>' + icon('check') + x + '</span>').join('') + '</div>' :
         '<div class="s-step-viz"><span class="s-bk-demo">' + BB.chan('direct') + '<b class="num">+£980</b><em>no platform fee</em></span></div>') + '</li>').join('') + '</ol>' +
      '<div class="s-how-cta"><button class="btn primary lg" data-act="start">Paste my listing link' + icon('arrow') + '</button></div></div></section>';
  }

  function tour(inst, L) {
    const t = inst.st.tour, s = L.s, m = L.m;
    const tabs = [['console', 'Host console', 'dash'], ['mobile', 'Host app', 'phone'], ['guest', 'Guest app', 'key'], ['property', 'Property site', 'home']];
    let prev, info;
    if (t === 'console') {
      const months = m.months.slice(-6), mx = Math.max(...months.map(k => m.byMonth[k].direct + m.byMonth[k].platforms), 1);
      prev = '<div class="s-con"><aside><span class="s-con-logo">' + BB.MARK + '</span>' + ['dash', 'cal', 'inbox', 'users', 'mail', 'spark'].map((k, i) => '<i class="' + (i ? '' : 'on') + '">' + icon(k) + '</i>').join('') + '</aside>' +
        '<div class="s-con-main"><div class="s-con-h"><b>Good morning, ' + esc(s.account.owner.split(' ')[0]) + '</b><span>' + D.fmt(s.today, { weekday: 'long', month: 'long' }) + '</span></div>' +
        '<div class="s-kpis"><div><span>Revenue, 30 days</span><b class="num">' + $(m.rev30) + '</b></div><div><span>Returning guests</span><b class="num">' + pct(m.returningShare) + '</b></div><div><span>Fees kept</span><b class="num">' + $(m.saved) + '</b></div></div>' +
        '<div class="s-chart">' + months.map(k => { const x = m.byMonth[k]; return '<div><span class="s-col"><i class="pl" style="height:' + (100 * (x.returning || 0) / mx) + '%"></i><i class="di" style="height:' + (100 * (x.newGuests || 0) / mx) + '%"></i></span><em>' + BB.monthName(k).slice(0, 3) + '</em></div>'; }).join('') + '</div>' +
        '<div class="s-legend"><span><i class="di"></i>New guests</span><span><i class="pl"></i>Returning guests</span></div></div></div>';
      info = ['Run everything from one screen', 'Calendar, bookings, payments, messages, guests and campaigns, all on bookings you own.', go('app', { view: 'dashboard' }), 'Open the host console'];
    } else if (t === 'mobile') {
      const arr = BB.q.arrivals().slice(0, 3);
      prev = '<div class="s-mini-phone"><div class="s-mp-screen"><div class="s-mp-top"><b>Today</b><span>' + D.fmt(s.today, { weekday: 'short' }) + '</span></div>' +
        '<div class="s-mp-kpi"><span>Arriving</span><b class="num">' + BB.q.arrivals().length + '</b><span>Staying</span><b class="num">' + BB.q.inHouse().length + '</b></div>' +
        arr.map(b => { const g = BB.q.guest(b.guestId); return '<div class="s-mp-row">' + BB.avatar(g.name, 'sm') + '<span><b>' + esc(g.name) + '</b><em>' + esc(BB.q.property(b.propertyId).short) + ' · ' + esc(BB.sourceLabel(b)) + '</em></span>' + BB.stepDots(b) + '</div>'; }).join('') +
        '<div class="s-mp-tabs">' + ['dash', 'cal', 'inbox', 'user'].map((k, i) => '<i class="' + (i ? '' : 'on') + '">' + icon(k) + '</i>').join('') + '</div></div></div>';
      info = ['Your business in your pocket', 'See who arrives today, reply to guests, and get a buzz the moment a direct booking lands.', go('mobile'), 'Open the host app'];
    } else if (t === 'guest') {
      const b = BB.q.upcoming().find(x => !x.checkin.done) || BB.q.upcoming()[0];
      const g = BB.q.guest(b.guestId), p = BB.q.property(b.propertyId), c = b.checkin;
      prev = '<div class="s-mini-phone"><div class="s-mp-screen"><div class="s-mp-hero">' + scene(p.theme) + '<span>' + esc(p.name) + '</span></div>' +
        '<div class="s-mp-body"><b class="s-mp-hi">Hi ' + esc(g.name.split(' ')[0]) + ', check in before you arrive</b><em>' + BB.dates(b) + '</em>' +
        [['ID and selfie', c.id && c.selfie], ['Rental agreement', c.agreement], ['Deposit hold', c.deposit]].map(([x, ok]) => '<div class="s-mp-step ' + (ok ? 'ok' : '') + '"><i>' + (ok ? icon('check') : '') + '</i>' + x + '</div>').join('') +
        '<span class="s-mp-btn">Start check-in</span></div></div></div>';
      info = ['A check-in app guests actually finish', 'ID, agreement and deposit in three minutes. The door code arrives on its own when they are done.', go('guest', { bookingId: b.id }), 'Open the guest app'];
    } else {
      prev = miniSite({ theme: L.p.theme, name: L.p.name, domain: L.p.domain, price: L.p.nightly, save: L.save, cls: 's-tour-browser', shot: true });
      info = ['A site that books, not just a brochure', 'Live calendar, instant booking, and a price that shows guests what they save by skipping the platform.', go('property', { propertyId: L.p.id }), 'Open a property site'];
    }
    return '<section class="s-sec s-tour-sec"><div class="s-w"><div class="s-head"><p class="eyebrow">Product tour</p><h2 class="s-h2">One login. Four places it shows up.</h2>' +
      '<p class="s-sub">Every part runs on the same data. Book a stay on the property site and it appears in the console, the host app and the guest app at once.</p></div>' +
      '<div class="s-tabs" role="tablist" aria-label="Product tour">' + tabs.map(([k, l, i]) => '<button role="tab" id="s-tab-' + k + '-' + inst.uid + '" aria-selected="' + (t === k) + '" data-tour="' + k + '">' + icon(i) + l + '</button>').join('') + '</div>' +
      '<div class="s-tour" role="tabpanel"><div class="s-tour-prev">' + prev + '</div><div class="s-tour-info"><h3>' + info[0] + '</h3><p>' + info[1] + '</p><button class="btn primary"' + info[2] + '>' + info[3] + icon('arrow') + '</button><p class="s-fine">Opens the working prototype with sample data.</p></div></div>' +
      '</div></section>';
  }

  function customers(inst) {
    if (LIVE()) return '';
    return '<section class="s-sec s-cust" id="s-customers-' + inst.uid + '"><div class="s-w">' +
      '<figure class="s-quote"><div class="s-face" aria-hidden="true"><i></i></div><div><blockquote>“Our past guests were sitting in an inbox we never used. The first email brought back twenty-three bookings.”</blockquote>' +
        '<figcaption><b>Dana Whitfield</b><span>Fell &amp; Harbour Stays, 3 holiday lets in Cumbria, Cornwall and Bath</span><small>Sample customer story</small></figcaption></div></figure>' +
      '<div class="s-stats">' + [['41%', 'of bookings from returning guests'], ['£4.8k', 'fees kept per host, per year'], ['54%', 'average guest email open rate'], ['1 day', 'from sign-up to a live site']].map(([b, t]) => '<div><b class="num">' + b + '</b><span>' + t + '</span></div>').join('') + '</div>' +
      '<p class="s-fine s-center">Sample figures for this prototype.</p>' +
      '</div></section>';
  }

  function pricing(inst) {
    const an = inst.st.annual;
    return '<section class="s-sec s-pricing" id="s-pricing-' + inst.uid + '"><div class="s-w">' +
      '<div class="s-head s-head-row"><div><p class="eyebrow">Pricing</p><h2 class="s-h2">Less than one platform fee a month.</h2><p class="s-sub">One plan, done for you. A one-off £997 setup fee, your first month free, then £200 a month. Cancel anytime. Prices include VAT. Covers up to 3 homes; more than that, talk to us.</p></div>' +
        '</div>' +
      '<div class="s-plans">' + PLANS.map(p => '<article class="s-plan' + (p.hot ? ' hot' : '') + '">' + '' +
        '<h3>' + p.name + '</h3><p class="s-plan-tag">' + p.tag + '</p><div class="s-amt"><b class="num">£' + perMonth(p, an) + '</b><span>/ month</span></div>' +
        '<p class="s-plan-bill">' + (an ? 'Billed ' + $(p.price * 10) + ' a year inc. VAT. You save ' + $(p.price * 2) + '.' : 'Billed monthly, inc. VAT. Cancel anytime.') + ' Plus a one-off ' + $(p.setup) + ' setup fee. First month free.</p>' +
        '<ul>' + p.feats.map(f => '<li>' + icon('check') + f + '</li>').join('') + '</ul>' +
        '<button class="btn ' + (p.hot ? 'accent' : '') + ' block lg" data-act="start" data-plan="' + p.id + '">' + p.cta + '</button></article>').join('') + '</div>' +
      '<div class="s-addon"><span class="s-addon-ic">' + icon('sync') + '</span><div><b>Optional: ' + ADDON.name + ' <em>+£' + ADDON.price + ' a month</em></b><p>Calendar sync with your channel manager, Airbnb, Vrbo or Booking.com. Paste the calendar link and dates booked there are blocked on your site, so you never double book. Most hosts never need it.</p></div></div>' +
      '</div></section>';
  }

  function faq(inst) {
    const open = inst.st.faq;
    return '<section class="s-sec s-faq-sec" id="s-faq-' + inst.uid + '"><div class="s-w s-faq-w"><div class="s-head"><p class="eyebrow">FAQ</p><h2 class="s-h2">Questions hosts ask.</h2><p class="s-sub">Something else? Email <a href="mailto:' + esc(CO().support) + '">' + esc(CO().support) + '</a> and a person answers within a working day.</p></div>' +
      '<div class="s-faq">' + FAQ.map(([q, a], i) => '<div class="s-qa' + (open === i ? ' open' : '') + '"><h3><button id="s-faq-' + i + '-' + inst.uid + '" data-faq="' + i + '" aria-expanded="' + (open === i) + '" aria-controls="s-faqp-' + i + '-' + inst.uid + '">' + q + '<span class="s-pm" aria-hidden="true"></span></button></h3>' +
        '<div class="s-ans" id="s-faqp-' + i + '-' + inst.uid + '" role="region"' + (open === i ? '' : ' hidden') + '><p>' + a + '</p></div></div>').join('') + '</div></div></section>';
  }

  function footer() {
    return '<section class="s-final"><div class="s-w"><h2 class="s-final-h">Keep the 15%.<br>Get found. <span>Get booked.</span></h2>' +
      '<div class="s-cta"><button class="btn accent lg" data-act="start">Get my booking site' + icon('arrow') + '</button><button class="btn lg s-ghost-inv"' + go('live') + '>See the live demo</button></div>' +
      '<footer class="s-foot"><span class="s-foot-brand">' + BB.lockup() + '<em>Direct booking websites, SEO, AI visibility and guest marketing for UK holiday let and short-term let hosts.</em></span>' +
      '<nav aria-label="Footer"><div><b>Product</b><button data-scroll="product">Overview</button><button data-scroll="ai">AI search</button><button data-scroll="pricing">Pricing</button></div>' +
      '<div><b>Try it</b><button' + go('live') + '>Live demo</button><button' + go('app') + '>Host console</button><button' + go('property', { propertyId: 'laurel' }) + '>Property site</button></div>' +
      '<div><b>Company</b>' + (LIVE() ? '<a href="/help">Help</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>' : '<button data-scroll="customers">Customers</button>') + '<button data-act="start">Get started</button><button' + go('app') + '>Log in</button></div></nav>' +
      (LIVE() ? '<p class="s-foot-fine">© ' + new Date().getFullYear() + ' ' + esc(CO().name) + '.' + (CO().number ? ' Registered in England and Wales, company no. ' + esc(CO().number) + '.' : '') + (CO().address && !/to be confirmed/i.test(CO().address) ? ' Registered office: ' + esc(CO().address) + '.' : '') + (CO().vat ? ' VAT no. ' + esc(CO().vat) + '.' : '') + ' Prices include VAT. <a href="mailto:' + esc(CO().support) + '">' + esc(CO().support) + '</a></p></footer>'
        : '<p class="s-foot-fine">© 2026 Bookingbooster Ltd. Registered in England and Wales, company no. 01234567. Registered office: 1 Sample Street, Manchester M1 1AA. Prices include VAT. <b>Sample details:</b> this is a prototype, and customers, figures and stories are sample data.</p></footer>') +
      '</div></section>';
  }

  function home(inst) {
    const L = liveData();
    return nav(inst) + hero(inst, L) + logos() + film() + pillars(inst, L) + calc(inst) + aiSection(inst) + how(inst) + tour(inst, L) + customers(inst) + pricing(inst) + faq(inst) + footer();
  }

  /* =====================================================================
     ONBOARDING
     ===================================================================== */
  const STEPS = ['Listing', 'Details', 'Look', 'Domain', 'Connect', 'Plan', 'Launch'];
  const SAMPLES = {
    airbnb: { url: 'https://www.airbnb.co.uk/rooms/48213907', name: 'Bracken Howe Cottage', area: 'Keswick, Cumbria', nightly: 165, sleeps: 6, bedrooms: 3, pets: true, theme: 'cabin' },
    vrbo: { name: 'Gull Rock Cottage', area: 'Padstow, Cornwall', nightly: 195, sleeps: 4, bedrooms: 2, pets: false, theme: 'lake' },
  };
  const IMPORTS = [['image', 'Photos', '38 photos, sorted by room'], ['star', 'Reviews', '212 reviews, 4.9 average'], ['list', 'House rules', 'Quiet hours, pets, max guests'], ['tag', 'Prices', 'Nightly rates, cleaning fee, minimum stay'], ['home', 'Amenities', '16 amenities and the home description']];
  const LAUNCH = ['Publishing your site', 'Writing 6 local SEO pages', 'Adding AI-ready answers', 'Setting up guest check-in', 'Starting your guest list'];
  const CONNECT = [
    ['stripe', 'card', 'Stripe payments', 'Required', 'Take cards, Apple Pay and Google Pay, and hold deposits. Payouts go to your UK bank.', ['Accept payments for your bookings', 'Place and release security deposit holds', 'Send payouts to your bank account']],
    ['lock', 'lock', 'Smart lock', 'Recommended', 'Nuki, Yale or Ultion. A unique door code for every stay, sent when check-in is done.', ['Create and remove door codes', 'Read lock battery and status']],
  ];

  function newOb(planId) {
    return { step: 1, url: '', urlErr: '', source: 'airbnb', importN: 0, imported: false, importedFrom: '', d: { name: '', area: '', nightly: '', sleeps: '', bedrooms: '', pets: false }, dErr: '',
      theme: 'cabin', dq: '', dState: 'idle', dRes: null, dErr2: '', domain: '', conn: { stripe: 'off', lock: 'off' }, addon: false, plan: planId || 'growth', annual: false, launchN: -1, launched: null };
  }
  function parseListing(u) {
    let url; try { url = new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : 'https://' + u.trim()); } catch (_) { return null; }
    const h = url.hostname.replace(/^www\./, '');
    if (/(^|\.)airbnb\.[a-z.]+$/.test(h) && /\/(rooms|h)\/[\w-]+/.test(url.pathname)) return 'airbnb';
    if (/(^|\.)vrbo\.com$/.test(h) && /\/\d+/.test(url.pathname)) return 'vrbo';
    return null;
  }
  function obDomainResults(ob) {
    let qd = ob.dq.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
    if (qd && !qd.includes('.')) qd += '.co.uk';
    if (!/^[a-z0-9][a-z0-9-]{1,40}\.[a-z]{2,10}(\.[a-z]{2,4})?$/.test(qd)) return { err: 'Enter a domain like ' + slug(ob.d.name || 'yourhome') + '.co.uk' };
    const base = slug(ob.d.name) || qd.split('.')[0], tn = slug(town(ob.d.area));
    const sugg = [base + '.co.uk', 'stay' + base + '.co.uk', base + tn + '.co.uk', base + '.uk', base + '.com'].filter((x, i, a) => x !== qd && a.indexOf(x) === i).slice(0, 4);
    return { list: [{ d: qd, ok: hash(qd) % 3 !== 0, main: true }].concat(sugg.map(x => ({ d: x, ok: hash(x) % 3 !== 0 }))) };
  }
  function checkDomain(inst) {
    const ob = inst.st.ob, r = obDomainResults(ob);
    if (r.err) { ob.dErr2 = r.err; ob.dState = 'idle'; inst.render(); return; }
    ob.dErr2 = ''; ob.dState = 'checking'; inst.render();
    later(inst, 750, () => { ob.dState = 'done'; ob.dRes = r.list; if (!ob.domain) { const first = r.list.find(x => x.ok); if (first) ob.domain = first.d; } inst.render(); });
  }
  function startImport(inst) {
    const ob = inst.st.ob; ob.importN = 0; ob.imported = false; ob.importedFrom = ob.url;
    const S = SAMPLES[ob.source];
    const t = () => later(inst, 430, () => {
      ob.importN++;
      if (ob.importN >= IMPORTS.length) { later(inst, 350, () => { ob.imported = true; ob.d = { name: S.name, area: S.area, nightly: S.nightly, sleeps: S.sleeps, bedrooms: S.bedrooms, pets: S.pets }; ob.theme = S.theme; ob.dq = ''; ob.dRes = null; ob.domain = ''; inst.render(); }); }
      else t();
      inst.render();
    });
    t();
  }
  function validDetails(d) {
    if (!String(d.name).trim()) return 'Give your home a name.';
    if (!String(d.area).trim()) return 'Add the town or area your home is in.';
    if (!(+d.nightly >= 30 && +d.nightly <= 3000)) return 'Nightly rate should be between £30 and £3,000.';
    if (!(+d.sleeps >= 1 && +d.sleeps <= 24)) return 'Sleeps should be between 1 and 24.';
    if (!(+d.bedrooms >= 0 && +d.bedrooms <= 12)) return 'Bedrooms should be between 0 and 12.';
    return '';
  }
  function buildData(ob) {
    const d = ob.d, tn = town(d.area), beds = +d.bedrooms, sleeps = +d.sleeps;
    const first = d.name.trim().split(' ')[0];
    const H = { cabin: 'Your fellside hideaway near ' + tn + '.', lake: 'Sea views and harbour mornings in ' + tn + '.', city: 'Georgian calm in the heart of ' + tn + '.' };
    const AM = { cabin: ['Hot tub', 'Wood burner', 'Fell views'], lake: ['Sea view', 'Harbour five minutes’ walk', 'Garden with fire pit'], city: ['King-size bed', 'Espresso machine', 'Washer-dryer'] }[ob.theme];
    return {
      name: d.name.trim(), short: d.name.trim().split(' ').slice(0, 2).join(' '), theme: ob.theme, domain: ob.domain, nightly: +d.nightly, maxGuests: sleeps, bedrooms: beds, baths: Math.max(1, Math.round(beds / 2)),
      petsAllowed: !!d.pets, petFee: d.pets ? 30 : 0, area: d.area.trim(), color: THEMES[ob.theme].color,
      headline: H[ob.theme], sub: beds + ' bedroom' + (beds === 1 ? '' : 's') + ' · sleeps ' + sleeps + ' · ' + tn,
      about: d.name.trim() + ' sleeps ' + sleeps + ' across ' + beds + ' bedroom' + (beds === 1 ? '' : 's') + ' in ' + tn + '. Book direct here to skip the platform service fee and talk to your host yourself.',
      amenities: AM.concat(['Fast Wi-Fi', d.pets ? 'Dogs welcome' : 'Free parking', 'Self check-in']),
      rules: ['Quiet hours are 10pm to 8am.', 'No parties or events, and no more than ' + sleeps + ' guests overnight.', d.pets ? 'One dog is welcome (£30 pet fee).' : 'Sorry, no pets at this home.'],
      address: (1 + hash(d.name) % 60) + ' ' + first + ' Lane, ' + tn + (county(d.area) ? ', ' + county(d.area) : ''), reviews: 212, rating: 4.9,
    };
  }
  const REAL = () => !!(BB.BOOT && BB.BOOT.mode === 'marketing');
  function acctError(a) {
    if (!a || String(a.name || '').trim().length < 2) return 'Enter your name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(a.email || '').trim())) return 'Enter your email address.';
    if (String(a.password || '').length < 10) return 'Use a password of at least 10 characters.';
    if (!a.terms) return 'Tick the box to accept the terms.';
    return '';
  }
  function launch(inst) {
    const ob = inst.st.ob; ob.launchN = 0; inst.render();
    let signup = null;
    if (REAL()) {
      const a = ob.acct || {};
      signup = BB.api.call(BB.BOOT.signupUrl, { account: { name: a.name, email: a.email, password: a.password, business: a.business }, plan: plan(ob.plan).name, annual: ob.annual, addon: ob.addon, property: buildData(ob), listing: ob.url })
        .then(j => ({ ok: true, j }), e => ({ ok: false, e }));
    }
    const t = () => later(inst, 480, () => {
      ob.launchN++;
      if (ob.launchN >= LAUNCH.length) {
        if (signup) {
          signup.then(r => {
            if (r.ok) { location.href = r.j.redirect || '/app'; return; }
            ob.launchN = -1; ob.acctErr = r.e.message; inst.render();
          });
          return;
        }
        const data = buildData(ob);
        const on = CONNECT.filter(c => ob.conn[c[0]] === 'on').map(c => c[2]);
        if (on.length) BB.log('sync', 'Onboarding', 'Connected ' + on.join(' and ') + ' for ' + data.name + '.', null, ['Onboarding', 'Integrations']);
        if (ob.addon) BB.log('system', 'Onboarding', 'Added the Calendar sync add-on (£15 a month) for ' + data.name + '. Paste a calendar link from your channel manager, Airbnb, Vrbo or Booking.com in Connections to block its dates.', null, ['Onboarding', 'Add-ons']);
        const p = BB.act.addProperty(data);
        ob.launched = p.id; ob.step = 8; inst.render(); window.scrollTo({ top: 0 });
      } else { t(); inst.render(); }
    });
    t();
  }

  function obRail(ob) {
    const d = ob.d, p = plan(ob.plan), conns = CONNECT.filter(c => ob.conn[c[0]] === 'on').map(c => c[2].replace(' payments', ''));
    const rows = [
      ['Listing', ob.importedFrom ? (ob.source === 'vrbo' ? 'Vrbo' : 'Airbnb') + ' listing' : null, ob.step > 1],
      ['Home', d.name ? esc(d.name) + (d.area ? '<em>' + esc(d.area) + '</em>' : '') : null, ob.step > 2],
      ['Look', ob.step > 3 || ob.step === 3 ? THEMES[ob.theme].label + ' theme' : null, ob.step > 3],
      ['Domain', ob.domain ? esc(ob.domain) : null, ob.step > 4],
      ['Connected', ob.step >= 5 ? (conns.length ? conns.join(', ') : 'Nothing yet') + (ob.addon ? '<em>+ Calendar sync add-on</em>' : '') : null, ob.step > 5],
      ['Plan', ob.step >= 6 ? p.name + ' · £' + (perMonth(p, ob.annual) + (ob.addon ? ADDON.price : 0)) + '/mo' + (ob.annual ? '<em>billed yearly</em>' : '') : null, ob.step > 6],
    ];
    return '<aside class="s-rail" aria-label="Your setup so far"><p class="eyebrow">Your site so far</p>' +
      miniSite({ theme: ob.theme, name: d.name || 'Your home', domain: ob.domain || (d.name ? slug(d.name) + '.co.uk' : 'yourhome.co.uk'), price: +d.nightly || null, save: d.nightly ? Math.round(+d.nightly * 3 * 0.142) : 0, cls: 's-rail-browser s-compact' }) +
      '<ul class="s-rail-list">' + rows.map(([k, v, done]) => '<li class="' + (done ? 'done' : '') + '"><i>' + (done ? icon('check') : '') + '</i><span>' + k + '</span><b>' + (v || '<span class="muted">Not yet</span>') + '</b></li>').join('') + '</ul>' +
      '<p class="s-rail-note">' + icon('lock') + 'Your site, your guests and your bookings belong to you.</p></aside>';
  }

  function obStep(inst) {
    const ob = inst.st.ob, u = inst.uid, d = ob.d;
    switch (ob.step) {
      case 1: return '<h1 class="s-ob-h">Paste your Airbnb or Vrbo listing link.</h1><p class="s-ob-sub">We copy your photos, reviews and house rules to start your site. We don’t connect to the platform, and nothing changes on your listing.</p>' +
        '<form data-form="url" novalidate class="s-ob-form"><label class="s-f s-f-big"><span>Listing link</span><span class="s-inwrap">' + icon('globe') + '<input id="s-ob-url-' + u + '" data-ob="url" type="url" inputmode="url" value="' + esc(ob.url) + '" placeholder="https://www.airbnb.co.uk/rooms/…" autocomplete="off" aria-invalid="' + !!ob.urlErr + '"></span></label>' +
        (ob.urlErr ? '<p class="s-err" role="alert">' + esc(ob.urlErr) + '</p>' : '') +
        '<div class="s-ob-alt"><button type="button" class="btn ghost" data-act="sample">' + icon('spark') + 'Use a sample listing</button><span class="muted">Find it in the Airbnb app under Listings, then Share.</span></div>' +
        '<div class="s-ob-nav"><span></span><button class="btn primary lg" type="submit">Import my listing' + icon('arrow') + '</button></div></form>';
      case 2: if (!ob.imported) return '<h1 class="s-ob-h">Importing your listing…</h1><p class="s-ob-sub">This takes about a minute on a real listing.</p>' +
        '<ul class="s-imp">' + IMPORTS.map(([ic, t, sub], i) => '<li class="' + (i < ob.importN ? 'done' : i === ob.importN ? 'on' : '') + '"><span class="s-imp-ic">' + (i < ob.importN ? icon('check') : i === ob.importN ? '<i class="s-spin"></i>' : icon(ic)) + '</span><span><b>' + t + '</b><em>' + (i < ob.importN ? sub : i === ob.importN ? 'Importing…' : 'Waiting') + '</em></span></li>').join('') + '</ul>' +
        '<div class="s-prog s-prog-lg"><i style="width:' + (100 * ob.importN / IMPORTS.length) + '%"></i></div>';
        return '<h1 class="s-ob-h">Here is what we found. Check the details.</h1><p class="s-ob-sub">Copied 38 photos, 212 reviews, house rules and your prices. Edit anything that looks off.</p>' +
        '<form data-form="details" novalidate class="s-ob-form"><div class="s-grid2">' +
          '<label class="s-f s-span2"><span>Home name</span><input id="s-d-name-' + u + '" data-d="name" value="' + esc(d.name) + '" maxlength="48"></label>' +
          '<label class="s-f s-span2"><span>Town and county</span><input id="s-d-area-' + u + '" data-d="area" value="' + esc(d.area) + '" maxlength="60"></label>' +
          '<label class="s-f"><span>Nightly rate, GBP</span><span class="s-inwrap s-pre"><i>£</i><input id="s-d-nightly-' + u + '" data-d="nightly" type="number" inputmode="numeric" min="40" max="3000" value="' + esc(d.nightly) + '"></span></label>' +
          '<label class="s-f"><span>Sleeps</span><input id="s-d-sleeps-' + u + '" data-d="sleeps" type="number" inputmode="numeric" min="1" max="24" value="' + esc(d.sleeps) + '"></label>' +
          '<label class="s-f"><span>Bedrooms</span><input id="s-d-bedrooms-' + u + '" data-d="bedrooms" type="number" inputmode="numeric" min="0" max="12" value="' + esc(d.bedrooms) + '"></label>' +
          '<div class="s-f"><span id="s-pets-l-' + u + '">Pets allowed</span><div class="s-switchrow"><button type="button" class="switch" role="switch" id="s-d-pets-' + u + '" data-act="pets" aria-checked="' + !!d.pets + '" aria-labelledby="s-pets-l-' + u + '"></button><span>' + (d.pets ? 'Yes, £30 pet fee' : 'No pets') + '</span></div></div>' +
        '</div>' +
        '<div class="s-imported">' + IMPORTS.map(([ic, t, sub]) => '<span>' + icon('check') + sub + '</span>').join('') + '</div>' +
        (ob.dErr ? '<p class="s-err" role="alert">' + esc(ob.dErr) + '</p>' : '') +
        navRow('Looks right') + '</form>';
      case 3: return '<h1 class="s-ob-h">Choose a look.</h1><p class="s-ob-sub">Each theme is built for booking: fast, mobile first and easy for search engines and AI to read. You can change it any time.</p>' +
        '<div class="s-themes" role="radiogroup" aria-label="Theme">' + Object.keys(THEMES).map(k => '<button class="s-theme' + (ob.theme === k ? ' on' : '') + '" role="radio" aria-checked="' + (ob.theme === k) + '" data-theme-pick="' + k + '">' +
          miniSite({ theme: k, name: d.name, domain: slug(d.name) + '.co.uk', price: +d.nightly, cls: 's-theme-browser s-compact' }) + '<span class="s-theme-l"><b>' + THEMES[k].label + '</b><em>' + THEMES[k].note + '</em></span><i class="s-radio">' + icon('check') + '</i></button>').join('') + '</div>' +
        '<form data-form="next" class="s-ob-form">' + navRow('Use the ' + THEMES[ob.theme].label + ' look') + '</form>';
      case 4: {
        const sub = slug(d.name) + '.bookingbooster.site';
        return '<h1 class="s-ob-h">Pick a domain.</h1><p class="s-ob-sub">Guests trust a name that matches the home. A .co.uk domain is included free for the first year on every plan.</p>' +
          '<form data-form="domain" novalidate class="s-dom-form"><label class="s-f s-f-big"><span>Search for a domain</span><span class="s-inwrap">' + icon('search') + '<input id="s-ob-dq-' + u + '" data-ob="dq" value="' + esc(ob.dq) + '" autocomplete="off" spellcheck="false"></span></label><button class="btn ink lg" type="submit"' + (ob.dState === 'checking' ? ' disabled' : '') + '>' + (ob.dState === 'checking' ? 'Checking…' : 'Check') + '</button></form>' +
          (ob.dErr2 ? '<p class="s-err" role="alert">' + esc(ob.dErr2) + '</p>' : '') +
          '<div class="s-doms" aria-live="polite">' + (ob.dState === 'checking' ? '<p class="s-dom-wait"><i class="s-spin"></i>Checking availability…</p>' : (ob.dRes || []).map(r =>
            '<div class="s-dom' + (ob.domain === r.d ? ' on' : '') + (r.ok ? '' : ' taken') + '"><span class="s-dom-n">' + esc(r.d) + (r.main ? '<em>Your search</em>' : '') + '</span>' +
            (r.ok ? '<span class="s-dom-p">' + BB.pill('good', 'Available') + '<span class="muted">Free first year</span></span>' : '<span class="s-dom-p">' + BB.pill('muted', 'Taken') + '</span>') +
            (r.ok ? '<button class="btn sm ' + (ob.domain === r.d ? 'primary' : '') + '" data-dom="' + esc(r.d) + '" aria-pressed="' + (ob.domain === r.d) + '">' + (ob.domain === r.d ? icon('check') + 'Selected' : 'Choose') + '</button>' : '<span></span>') + '</div>').join('')) +
          '<div class="s-dom s-dom-free' + (ob.domain === sub ? ' on' : '') + '"><span class="s-dom-n">' + esc(sub) + '<em>Free address, add a domain later</em></span><span class="s-dom-p">' + BB.pill('info', 'Always free') + '</span>' +
            '<button class="btn sm ' + (ob.domain === sub ? 'primary' : '') + '" data-dom="' + esc(sub) + '" aria-pressed="' + (ob.domain === sub) + '">' + (ob.domain === sub ? icon('check') + 'Selected' : 'Choose') + '</button></div></div>' +
          '<form data-form="next" class="s-ob-form">' + navRow(ob.domain ? 'Use ' + ob.domain : 'Choose a domain', !ob.domain) + '</form>';
      }
      case 5: {
        const ready = ob.conn.stripe === 'on';
        return '<h1 class="s-ob-h">Connect payments and keys.</h1><p class="s-ob-sub">So guests can pay you directly and door codes send themselves. Each one takes a few seconds.</p>' +
          '<div class="s-conns">' + CONNECT.map(([k, ic, name, need, desc, perms]) => {
            const st = ob.conn[k];
            return '<div class="s-conn ' + st + '"><div class="s-conn-top"><span class="s-conn-ic">' + icon(ic) + '</span><span class="s-conn-t"><b>' + name + '<span class="s-need ' + (k === 'stripe' ? 'req' : '') + '">' + need + '</span></b><em>' + desc + '</em></span>' +
              (st === 'on' ? '<span class="s-conn-ok">' + BB.pill('good', 'Connected') + '<button class="btn sm ghost" data-conn="' + k + '" data-c="off">Disconnect</button></span>' :
               st === 'busy' ? '<span class="s-conn-ok"><i class="s-spin"></i>Connecting…</span>' :
               st === 'auth' ? '' : '<button class="btn sm primary" data-conn="' + k + '" data-c="auth">Connect</button>') + '</div>' +
              (st === 'auth' ? '<div class="s-oauth"><p><b>' + name + '</b> will let Bookingbooster:</p><ul>' + perms.map(p => '<li>' + icon('check') + p + '</li>').join('') + '</ul>' +
                '<div class="s-oauth-a"><button class="btn sm ghost" data-conn="' + k + '" data-c="off">Cancel</button><button class="btn sm primary" data-conn="' + k + '" data-c="busy">' + icon('lock') + 'Allow access</button></div><p class="s-fine">Simulated sign-in for the prototype.</p></div>' : '') +
              '</div>';
          }).join('') +
          '<div class="s-conn s-conn-addon' + (ob.addon ? ' on' : '') + '"><div class="s-conn-top"><span class="s-conn-ic">' + icon('sync') + '</span><span class="s-conn-t"><b>' + ADDON.name + '<span class="s-need">Optional · £' + ADDON.price + ' a month</span></b><em>Calendar sync with your channel manager, Airbnb, Vrbo or Booking.com. Dates booked there are blocked on your site so you never double book.</em></span>' +
            '<button type="button" class="switch" role="switch" id="s-addon-' + u + '" data-act="addon" aria-checked="' + ob.addon + '" aria-label="' + ADDON.name + '"></button></div>' +
            (ob.addon ? '<p class="s-addon-note">' + icon('check') + 'Added for £' + ADDON.price + ' a month. Paste your calendar link in your console after launch.</p>' : '') + '</div>' +
          '</div>' +
          (ready ? '' : '<p class="s-fine">Connect Stripe so guests can pay you. It is the one thing a booking site needs.</p>') +
          '<form data-form="next" class="s-ob-form">' + navRow(ready ? 'Continue' : 'Connect Stripe to continue', !ready) + '</form>';
      }
      case 6: return '<h1 class="s-ob-h">Choose a plan.</h1><p class="s-ob-sub">A one-off £997 setup fee, your first month free, then £200 a month. Cancel anytime, prices include VAT.</p>' +
        '<div class="s-obplans" role="radiogroup" aria-label="Plan">' + PLANS.map(p => '<button class="s-obplan' + (ob.plan === p.id ? ' on' : '') + '" role="radio" aria-checked="' + (ob.plan === p.id) + '" data-pick-plan="' + p.id + '">' +
          '<span class="s-obplan-h"><b>' + p.name + '</b>' + '' + '<i class="s-radio">' + icon('check') + '</i></span>' +
          '<span class="s-amt"><b class="num">£' + perMonth(p, ob.annual) + '</b><span>/ month</span></span><span class="s-plan-tag">' + p.blurb + ' Plus a one-off ' + $(p.setup) + ' setup fee. First month free.</span>' +
          '<ul>' + p.feats.map(f => '<li>' + icon('check') + f + '</li>').join('') + '</ul></button>').join('') + '</div>' +
        (ob.addon ? '<p class="s-addon-note">' + icon('sync') + 'Plus the Calendar sync add-on, £' + ADDON.price + ' a month.</p>' : '') +
        '<form data-form="next" class="s-ob-form">' + navRow('Continue with ' + plan(ob.plan).name) + '</form>';
      case 7: {
        const p = plan(ob.plan), on = CONNECT.filter(c => ob.conn[c[0]] === 'on'), total = perMonth(p, ob.annual) + (ob.addon ? ADDON.price : 0);
        if (ob.launchN >= 0) return '<h1 class="s-ob-h">Launching ' + esc(d.name) + '…</h1><p class="s-ob-sub">Hang tight. This is the part we do for you.</p>' +
          '<ul class="s-imp">' + LAUNCH.map((t, i) => '<li class="' + (i < ob.launchN ? 'done' : i === ob.launchN ? 'on' : '') + '"><span class="s-imp-ic">' + (i < ob.launchN ? icon('check') : i === ob.launchN ? '<i class="s-spin"></i>' : icon('spark')) + '</span><span><b>' + t + '</b><em>' + (i < ob.launchN ? 'Done' : i === ob.launchN ? 'Working…' : 'Waiting') + '</em></span></li>').join('') + '</ul>' +
          '<div class="s-prog s-prog-lg"><i style="width:' + (100 * ob.launchN / LAUNCH.length) + '%"></i></div>';
        return '<h1 class="s-ob-h">Ready to launch.</h1><p class="s-ob-sub">Check everything once. You can change any of it later from your console.</p>' +
          '<dl class="s-review">' +
            '<div><dt>Home</dt><dd><b>' + esc(d.name) + '</b><span>' + esc(d.area) + ' · ' + $(+d.nightly) + ' a night · sleeps ' + esc(d.sleeps) + ' · ' + esc(d.bedrooms) + ' bedrooms · ' + (d.pets ? 'pets welcome' : 'no pets') + '</span></dd><button class="btn sm ghost" data-goto="2">Edit</button></div>' +
            '<div><dt>Look</dt><dd><b>' + THEMES[ob.theme].label + '</b><span>' + THEMES[ob.theme].note + '</span></dd><button class="btn sm ghost" data-goto="3">Edit</button></div>' +
            '<div><dt>Domain</dt><dd><b>' + esc(ob.domain) + '</b><span>' + (/bookingbooster\.site$/.test(ob.domain) ? 'Free address' : 'Included free for the first year') + '</span></dd><button class="btn sm ghost" data-goto="4">Edit</button></div>' +
            '<div><dt>Connected</dt><dd><b>' + (on.length ? on.map(c => c[2]).join(', ') : 'Nothing yet') + '</b><span>' + (ob.addon ? 'Plus the Calendar sync add-on' : on.length < 2 ? 'Add a smart lock from your console any time' : 'Payments and door codes are ready') + '</span></dd><button class="btn sm ghost" data-goto="5">Edit</button></div>' +
            '<div><dt>Plan</dt><dd><b>' + p.name + (ob.addon ? ' + add-on' : '') + ' · £' + total + ' a month</b><span>' + (ob.annual ? 'Plan billed ' + $(p.price * 10) + ' a year' : 'Billed monthly') + ', inc. VAT, plus a one-off ' + $(p.setup) + ' setup fee. First month free</span></dd><button class="btn sm ghost" data-goto="6">Edit</button></div>' +
          '</dl>' +
          '<form data-form="launch" class="s-ob-form" novalidate>' + (REAL() ? acctFields(inst) : '') + '<div class="s-ob-nav"><button type="button" class="btn ghost lg" data-act="back">' + icon('back') + 'Back</button><button class="btn primary lg s-glow" type="submit">' + icon('bolt') + 'Launch my site</button></div></form>';
      }
    }
    return '';
  }
  function acctFields(inst) {
    const a = inst.st.ob.acct || (inst.st.ob.acct = { name: '', email: '', password: '', business: '', terms: false }), u = inst.uid;
    const f = (k, label, type, ac, ph) => '<label class="s-f"><span>' + label + '</span><input id="s-ac-' + k + '-' + u + '" data-ac="' + k + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(a[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
    return '<div class="s-acct"><h2 class="s-acct-h">Create your account</h2><p class="s-ob-sub">You will sign in with this to run your bookings. No card is needed today. You pay the £997 setup fee from your console when you start your plan, and your first month is free.</p>' +
      '<div class="s-grid2">' + f('name', 'Your name', 'text', 'name') + f('business', 'Business name (optional)', 'text', 'organization', 'For example, Fell & Harbour Stays') + f('email', 'Email', 'email', 'email') + f('password', 'Password', 'password', 'new-password', 'At least 10 characters') + '</div>' +
      '<label class="s-terms"><input type="checkbox" id="s-ac-terms-' + u + '" data-ac="terms"' + (a.terms ? ' checked' : '') + '> <span>I accept the <a href="/terms" target="_blank">terms</a> and <a href="/privacy" target="_blank">privacy notice</a>.</span></label>' +
      (inst.st.ob.acctErr ? '<p class="s-err" role="alert">' + esc(inst.st.ob.acctErr) + '</p>' : '') + '</div>';
  }
  function navRow(label, disabled) {
    return '<div class="s-ob-nav"><button type="button" class="btn ghost lg" data-act="back">' + icon('back') + 'Back</button><button class="btn primary lg" type="submit"' + (disabled ? ' disabled' : '') + '>' + esc(label) + icon('arrow') + '</button></div>';
  }

  function obSuccess(inst) {
    const ob = inst.st.ob, p = BB.q.property(ob.launched);
    if (!p) { inst.st.ob = newOb(); return onboard(inst); }
    const on = k => ob.conn[k] === 'on';
    const auto = [
      ['web', 'Hosts your booking site on ' + p.domain + ' with a live calendar and instant booking', true],
      ['search', 'Publishes local pages so guests searching ' + town(p.area) + ' find you on Google', true],
      ['card', on('stripe') ? 'Takes payments and deposit holds through Stripe' : 'Payments start when you connect Stripe', on('stripe')],
      ['mail', 'Emails the confirmation and texts the check-in link after every booking', true],
      ['key', on('lock') ? 'Creates a unique door code when a guest finishes check-in' : 'Door codes start when you connect your lock', on('lock')],
      ['spark', 'Checks ChatGPT, Gemini, Perplexity and Google for ' + town(p.area) + ' every week', true, 'ai'],
      ['users', 'Adds every guest to your list after checkout and invites them back', true],
    ].concat(ob.addon ? [['sync', 'Blocks dates booked elsewhere once you add your calendar link (Calendar sync add-on)', false]] : []);
    return '<div class="s-ob s-done"><header class="s-ob-top"><div class="s-w s-ob-top-in"><button class="s-logo" data-act="home">' + BB.lockup() + '</button><span class="s-done-tag">' + BB.pill('good', 'Live') + '</span></div></header>' +
      '<div class="s-w s-done-in">' +
        '<div class="s-done-copy"><span class="s-burst">' + icon('check') + '</span><p class="eyebrow">' + esc(p.name) + '</p><h1 class="s-ob-h s-done-h">Your site is live.</h1>' +
        '<p class="s-ob-sub">Guests can book <b>' + esc(p.name) + '</b> at <b class="s-dom-live">' + esc(p.domain) + '</b> right now, with no platform fee. We also told your console, so it is ready when you log in.</p>' +
        '<div class="s-cta"><button class="btn primary lg"' + go('property', { propertyId: p.id }) + '>' + icon('out') + 'Open your site</button><button class="btn lg"' + go('app', { view: 'website' }) + '>' + icon('dash') + 'Go to your console</button></div>' +
        '<div class="s-done-stats"><span><b class="num">' + p.reviews + '</b>reviews imported</span><span><b class="num">6</b>SEO pages for ' + esc(town(p.area)) + '</span><span><b class="num">' + $(Math.round(p.nightly * 0.155 * 3)) + '</b>kept on a 3-night stay</span></div>' +
        '<button class="btn ghost s-again" data-act="again">' + icon('plus') + 'Add another home</button></div>' +
        '<div class="s-done-r">' + miniSite({ theme: p.theme, name: p.name, domain: p.domain, price: p.nightly, save: Math.round(p.nightly * 3 * 0.142), cls: 's-done-browser' }) +
        '<div class="s-auto"><h2>What Bookingbooster now does for you</h2><ul>' + auto.map(([ic, t, ok, ai]) => '<li class="' + (ok ? 'ok' : 'wait') + '"><span>' + icon(ok ? 'check' : ic) + '</span>' + (ai ? BB.aiText(t) : esc(t)) + '</li>').join('') + '</ul>' + BB.aiTm() + '</div></div>' +
      '</div></div>';
  }

  function onboard(inst) {
    const ob = inst.st.ob;
    if (ob.step === 8) return obSuccess(inst);
    const pctDone = Math.round(100 * (ob.step - 1) / STEPS.length);
    const enter = inst._obStep !== ob.step + ':' + ob.imported + ':' + (ob.launchN >= 0); inst._obStep = ob.step + ':' + ob.imported + ':' + (ob.launchN >= 0);
    return '<div class="s-ob"><header class="s-ob-top"><div class="s-w s-ob-top-in"><button class="s-logo" data-act="home" aria-label="Back to the Bookingbooster home page">' + BB.lockup() + '</button>' +
      '<span class="s-ob-count num">Step ' + ob.step + ' of ' + STEPS.length + '<em> · ' + STEPS[ob.step - 1] + '</em></span>' +
      '<button class="btn ghost sm" data-act="home"><span class="s-exit-l">Save and exit</span><span class="s-exit-s">Exit</span></button></div>' +
      '<div class="s-ob-prog" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pctDone + '" aria-label="Setup progress"><i style="width:' + pctDone + '%"></i></div>' +
      '<div class="s-w"><ol class="s-ob-steps">' + STEPS.map((t, i) => '<li class="' + (i + 1 < ob.step ? 'done' : i + 1 === ob.step ? 'on' : '') + '"><span class="num">' + (i + 1 < ob.step ? icon('check') : i + 1) + '</span>' + t + '</li>').join('') + '</ol></div></header>' +
      '<div class="s-w s-ob-body"><main class="s-ob-main" id="s-ob-main-' + inst.uid + '">' + obStep(inst) + '</main>' + obRail(ob) + '</div></div>';
  }

  /* =====================================================================
     surface
     ===================================================================== */
  function scrollToSection(inst, key) {
    const wasMenu = inst.st.menu; inst.st.menu = false;
    const el = key === 'top' ? inst.root.querySelector('.s-hero') : inst.root.querySelector('#s-' + key + '-' + inst.uid);
    if (inst.st.view !== 'home' || !el || wasMenu) { inst.st.view = 'home'; inst.render(); }
    const t = key === 'top' ? null : inst.root.querySelector('#s-' + key + '-' + inst.uid);
    if (key === 'top') window.scrollTo({ top: 0, behavior: 'smooth' }); else if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function startOnboarding(inst, planId) {
    const ob = inst.st.ob;
    if (!ob || ob.step === 8) inst.st.ob = newOb(planId);
    else if (planId) ob.plan = planId;
    BB.go('site', { view: 'onboard' });
  }

  BB.define('site', {
    create(root, opts, inst) {
      inst.uid = Math.random().toString(36).slice(2, 7); inst.timers = [];
      Object.assign(inst.st, { view: opts.view || 'home', anim: true, menu: false, rev: 60000, share: 30, tour: 'console', annual: false, faq: 0,
        ai: { town: 'Keswick', type: 'cabin', phase: 'idle', step: 0, err: '' }, ob: Object.assign(newOb(opts.plan), { annual: false, addon: !!opts.addon },
          opts.email || opts.name || opts.business ? { acct: { name: opts.name || '', email: opts.email || '', password: '', business: opts.business || '', terms: false } } : {}) });
      if (opts.view === 'pricing') inst.pendingScroll = 'pricing';
      root.classList.add('x-site');

      BB.on(root, 'click', '[data-go]', el => { inst.st.menu = false; let o = {}; try { o = JSON.parse(el.dataset.opts || '{}'); } catch (_) {} BB.go(el.dataset.go, o); });
      BB.on(root, 'click', '[data-scroll]', el => scrollToSection(inst, el.dataset.scroll));
      BB.on(root, 'click', '[data-tour]', el => inst.set({ tour: el.dataset.tour }));
      BB.on(root, 'click', '[data-bill]', el => inst.set({ annual: el.dataset.bill === 'y' }));
      BB.on(root, 'click', '[data-faq]', el => { const i = +el.dataset.faq; inst.set({ faq: inst.st.faq === i ? -1 : i }); });
      BB.on(root, 'keydown', '[role="tab"]', (el, ev) => {
        if (!['ArrowRight', 'ArrowLeft'].includes(ev.key)) return; ev.preventDefault();
        const ks = ['console', 'mobile', 'guest', 'property'], i = (ks.indexOf(inst.st.tour) + (ev.key === 'ArrowRight' ? 1 : 3)) % 4;
        inst.set({ tour: ks[i] }); const t = root.querySelector('#s-tab-' + ks[i] + '-' + inst.uid); if (t) t.focus();
      });
      BB.on(root, 'click', '[data-act]', (el, ev) => {
        const a = el.dataset.act, ob = inst.st.ob;
        if (a === 'start') { inst.st.menu = false; startOnboarding(inst, el.dataset.plan); }
        else if (a === 'menu') inst.set({ menu: !inst.st.menu });
        else if (a === 'home') { clearTimers(inst); if (ob.launchN >= 0 && ob.step === 7) ob.launchN = -1; BB.go('site', { view: 'home' }); }
        else if (a === 'sample') { ob.url = SAMPLES.airbnb.url; ob.urlErr = ''; ob.source = 'airbnb'; ob.step = 2; startImport(inst); inst.render(); }
        else if (a === 'back') { clearTimers(inst); if (ob.step === 2 && !ob.imported) ob.importedFrom = ''; ob.dState = ob.dState === 'checking' ? 'idle' : ob.dState; ob.conn = mapConn(ob.conn); ob.step = Math.max(1, ob.step - 1); inst.render(); scrollTopOb(); }
        else if (a === 'pets') { ob.d.pets = !ob.d.pets; inst.render(); }
        else if (a === 'addon') { ob.addon = !ob.addon; inst.render(); }
        else if (a === 'again') { inst.st.ob = newOb(); inst.render(); window.scrollTo({ top: 0 }); }
      });
      BB.on(root, 'click', '[data-theme-pick]', el => { inst.st.ob.theme = el.dataset.themePick; inst.render(); });
      BB.on(root, 'click', '[data-dom]', el => { inst.st.ob.domain = el.dataset.dom; inst.render(); });
      BB.on(root, 'click', '[data-pick-plan]', el => { inst.st.ob.plan = el.dataset.pickPlan; inst.render(); });
      BB.on(root, 'click', '[data-obbill]', el => { inst.st.ob.annual = el.dataset.obbill === 'y'; inst.render(); });
      BB.on(root, 'click', '[data-goto]', el => { inst.st.ob.step = +el.dataset.goto; inst.render(); scrollTopOb(); });
      BB.on(root, 'click', '[data-conn]', el => {
        const ob = inst.st.ob, k = el.dataset.conn, c = el.dataset.c;
        ob.conn[k] = c; inst.render();
        if (c === 'busy') later(inst, 950, () => { ob.conn[k] = 'on'; inst.render(); BB.toast(CONNECT.find(x => x[0] === k)[2] + ' connected', 'good'); });
      });

      BB.on(root, 'input', '[data-calc]', el => {
        const k = el.dataset.calc, v = +el.value; inst.st[k] = v;
        el.style.setProperty('--p', (k === 'rev' ? (v - 10000) / 2400 : (v - 5) / 0.55) + '%');
        updateCalc(inst);
      });
      BB.on(root, 'input', '[data-ai]', el => { inst.st.ai[el.dataset.ai] = el.value; });
      BB.on(root, 'change', '[data-ai]', el => { inst.st.ai[el.dataset.ai] = el.value; });
      BB.on(root, 'input', '[data-ac]', el => { const a = inst.st.ob.acct; a[el.dataset.ac] = el.type === 'checkbox' ? el.checked : el.value; if (inst.st.ob.acctErr) { inst.st.ob.acctErr = ''; const er = root.querySelector('.s-acct .s-err'); if (er) er.remove(); } });
      BB.on(root, 'change', '[data-ac="terms"]', el => { inst.st.ob.acct.terms = el.checked; });
      BB.on(root, 'input', '[data-ob]', el => { inst.st.ob[el.dataset.ob] = el.value; if (el.dataset.ob === 'url' && inst.st.ob.urlErr) { inst.st.ob.urlErr = ''; inst.render(); } });
      BB.on(root, 'input', '[data-d]', el => { inst.st.ob.d[el.dataset.d] = el.value; inst.st.ob.dErr = ''; if (el.dataset.d === 'name') { inst.st.ob.dq = ''; inst.st.ob.dRes = null; inst.st.ob.domain = ''; } inst.render(); });

      root.addEventListener('submit', ev => {
        const f = ev.target.closest('[data-form]'); if (!f) return; ev.preventDefault();
        const ob = inst.st.ob, kind = f.dataset.form;
        if (kind === 'ai') { runAi(inst); return; }
        if (kind === 'url') {
          const src = parseListing(ob.url || '');
          if (!ob.url.trim()) { ob.urlErr = 'Paste the link to your Airbnb or Vrbo listing, or use a sample listing.'; inst.render(); return; }
          if (!src) { ob.urlErr = 'That does not look like an Airbnb or Vrbo listing link. It should look like airbnb.co.uk/rooms/12345 or vrbo.com/12345.'; inst.render(); return; }
          ob.source = src; ob.urlErr = ''; ob.step = 2; if (ob.importedFrom !== ob.url || !ob.imported) startImport(inst); inst.render(); scrollTopOb(); return;
        }
        if (kind === 'details') { const e = validDetails(ob.d); if (e) { ob.dErr = e; inst.render(); return; } ob.step = 3; inst.render(); scrollTopOb(); return; }
        if (kind === 'domain') { checkDomain(inst); return; }
        if (kind === 'next') {
          if (ob.step === 4 && !ob.domain) return;
          if (ob.step === 5 && ob.conn.stripe !== 'on') return;
          ob.step++; if (ob.step === 4 && !ob.dRes) { ob.dq = ob.dq || slug(ob.d.name) + '.co.uk'; inst.render(); checkDomain(inst); } else inst.render();
          scrollTopOb(); return;
        }
        if (kind === 'launch') { if (REAL()) { const e = acctError(ob.acct); if (e) { ob.acctErr = e; inst.render(); return; } } if (ob.launchN < 0) launch(inst); }
      });
      function scrollTopOb() { window.scrollTo({ top: 0 }); }
      function mapConn(c) { const o = {}; Object.keys(c).forEach(k => o[k] = c[k] === 'on' ? 'on' : 'off'); return o; }
    },
    render(inst) {
      const v = inst.st.view === 'onboard' ? 'onboard' : 'home';
      return '<div class="s-root ' + (inst.st.anim ? 's-anim ' : '') + 's-v-' + v + '">' + (v === 'onboard' ? onboard(inst) : home(inst)) + '</div>';
    },
    after(inst) {
      if (inst.st.anim) { inst.st.anim = false; }
      if (inst.pendingScroll) {
        const k = inst.pendingScroll; inst.pendingScroll = null;
        setTimeout(() => { const t = inst.root.querySelector('#s-' + k + '-' + inst.uid); if (t && inst.alive) t.scrollIntoView({ block: 'start' }); }, 40);
      }
    },
    route(inst, opts) {
      const v = opts.view || 'home';
      if (v === 'onboard') { if (!inst.st.ob || inst.st.ob.step === 8 && inst.st.view !== 'onboard') inst.st.ob = newOb(opts.plan); if (opts.plan) inst.st.ob.plan = opts.plan; }
      inst.st.menu = false;
      inst.st.view = v === 'pricing' ? 'home' : v;
      if (v === 'pricing') inst.pendingScroll = 'pricing';
      inst.render();
    },
    destroy(inst) { clearTimers(inst); },
  });
})();
