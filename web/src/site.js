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
    // One plan: a monthly price including VAT. No setup fee.
    { id: 'growth', name: 'Growth', price: 200, setup: 0, tag: 'Done for you', hot: true, blurb: 'We set it up and keep growing it.', feats: ['Booking site on your own domain', 'Card payments, deposit holds and payouts', 'Guest check-in app and door codes', 'New local SEO pages every month', 'AI visibility tracking and fixes', 'Campaigns written and sent for you', 'Text message outreach'], cta: 'Start with Growth' },
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
    ['Do prices include VAT?', 'Yes. Every price on this page includes VAT. It is £200 a month, with no setup fee. There is no contract, and you can cancel from your console at any time. Your domain stays yours.'],
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
  const DEMO_SHOT = '/media/shot-site.jpg';
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

  /* ---------- social-style building blocks: pills, chevrons, real product screens ---------- */
  const M = n => '/media/' + n + '.jpg';
  const CHEV = '<svg class="s-chev" viewBox="0 0 100 100" aria-hidden="true"><path d="M10 52 L50 14 L90 52"/><path d="M24 80 L50 56 L76 80"/></svg>';
  const pill = t => '<span class="s-pill"><i></i>' + t + '</span>';
  const frame = (img, url, cls) => '<div class="s-frame ' + (cls || '') + '"><div class="s-frame-bar"><b></b><b></b><b></b><span>' + icon('lock') + esc(url) + '</span></div><img src="' + M(img) + '" alt="" loading="lazy" decoding="async" width="1600" height="1000"></div>';
  const phoneF = (img, cls) => '<div class="s-phone ' + (cls || '') + '"><div class="s-phone-scr"><img src="' + M(img) + '" alt="" loading="lazy" decoding="async" width="560" height="1032"></div></div>';
  const NC_IC = { good: () => icon('check'), gpt: () => BB.aiLogo('chatgpt'), up: () => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>', spark: () => icon('spark'), key: () => icon('key') };
  const ncard = (k, b, ic, cls) => '<div class="s-nc ' + (cls || '') + '"><span class="s-nc-ic ' + ic + '">' + NC_IC[ic]() + '</span><span><small>' + k + '</small><b>' + b + '</b></span></div>';

  function hero(inst) {
    return '<section class="s-hero s-hero3 t-cobalt" id="s-top-' + inst.uid + '">' + CHEV + '<div class="s-w s-hero3-in">' +
      '<div class="s-hero3-copy">' +
        '<div class="s-rise" style="--d:0">' + pill('Direct bookings for UK holiday lets') + '</div>' +
        '<h1 class="s-h1 s-rise" style="--d:1">Fill your calendar <span class="s-hl">without the 15% fee.</span></h1>' +
        '<p class="s-lead s-rise" style="--d:2">Your own booking website, found on Google and in AI answers, with card payments, a guest app and emails that bring guests back. Set up for you, with no commission on bookings.</p>' +
        '<div class="s-cta s-rise" style="--d:3"><button class="btn s-yel lg" data-act="start">Get my booking site' + icon('arrow') + '</button><button class="btn s-out lg"' + go('live') + '>' + icon('play') + 'Try the live demo</button></div>' +
        '<p class="s-hero3-price s-rise" style="--d:4"><b>£200 a month. No setup fee.</b> No commission on bookings. Prices include VAT. Cancel anytime.</p>' +
      '</div>' +
      '<div class="s-hero3-stage s-rise" style="--d:2" role="img" aria-label="A holiday let booking website, the host app showing today’s bookings, a new direct booking and a ChatGPT recommendation">' +
        frame('shot-site', 'larchfellcabin.co.uk', 's-hero3-browser') + phoneF('phone-today', 's-hero3-phone') +
        ncard('New direct booking', '£1,180 · 4 nights', 'good', 'dark s-hn1') + ncard('Shows up in ChatGPT', 'Larch Fell Cabin', 'gpt', 's-hn2') +
      '</div>' +
    '</div></section>';
  }

  function proof() {
    const it = [[(FEE() * 100).toFixed(1) + '%', 'Airbnb’s host fee, kept by you on every direct booking'], ['0%', 'commission on your bookings, ever'], ['Same day', 'your booking site goes live on a free address'], ['5 in 1', 'website, SEO, AI search, guest app and outreach in one login']];
    return '<section class="s-proof3 t-ink" aria-label="At a glance"><div class="s-dots"></div><div class="s-w"><ul>' + it.map(([b, t]) => '<li><b>' + b + '</b><span>' + t + '</span></li>').join('') + '</ul></div></section>';
  }

  function logos() {
    const names = ['Stripe', 'Apple Pay', 'Google Pay', 'Nuki', 'Yale', 'Google Business Profile', 'Google Search Console', 'Email', 'Text messages'];
    return '<section class="s-logos" aria-label="Tools we run for you"><div class="s-w"><p class="eyebrow">Runs on tools you can trust</p><ul>' +
      names.map(n => '<li>' + esc(n) + '</li>').join('') + '</ul></div></section>';
  }

  function film() {
    return '<section class="s-sec s-film" id="s-film" aria-label="Explainer video"><div class="s-w">' +
      '<div class="s-head s-center">' + pill('See it in 47 seconds') + '<h2 class="s-h2">What Bookingbooster does for your holiday let.</h2></div>' +
      '<div class="s-film-frame"><video controls preload="none" playsinline poster="/media/explainer.jpg" src="/media/explainer.mp4" aria-label="Bookingbooster explainer video"></video></div>' +
      '</div></section>';
  }

  function features(inst, L) {
    const F = [
      { id: 'product', t: 't-white', pill: 'Your booking website', h: 'Your cottage. Your website. <span class="s-hl">Your guests.</span>',
        p: 'A fast, good-looking booking site on your own .co.uk domain, made from your listing. Live calendar, instant booking and card payments. Guests skip the platform’s service fee, so they choose you.',
        pts: ['Your domain, your brand, your house rules', 'Card, Apple Pay and Google Pay through Stripe', 'Security deposits held on the card, released on their own'],
        alt: 'A holiday let booking website on a laptop and a phone',
        vis: frame('shot-site2', 'tidewatercottage.co.uk', 's-fv-main') + phoneF('phone-site', 's-fv-phone') + ncard('Booked direct', 'No platform fee', 'good', 's-fv-nc'),
        cta: ['See a host site', go('property', { propertyId: L.p.id })] },
      { t: 't-sky', pill: 'Google SEO', h: 'Get found on Google for the stays <span class="s-hl">guests search.</span>',
        p: 'Your listing can’t rank on Google. Your website can. Every month we write and publish local pages for the searches guests really make near you, like “cabin with hot tub Lake District”.',
        pts: ['Local pages and area guides, written for you', 'Google Business Profile set up and kept fresh', 'Search Console connected, with a monthly report'],
        alt: 'The website and SEO screen in the host console',
        vis: frame('shot-seo', 'booking-booster.co.uk/app', 's-fv-main') + ncard('Example search ranking', '#4 for “cabin hot tub lake district”', 'up', 'dark s-fv-nc'),
        cta: ['See website and SEO', go('app', { view: 'website' })] },
    ];
    const G = [
      { t: 't-yellow', pill: 'Guest app', h: 'Your house guide in <span class="s-hl">every guest’s pocket.</span>',
        p: 'No download. Guests open it from their booking email, check in online in about three minutes, and the door code arrives on its own when they are done.',
        pts: ['ID check, rental agreement and deposit hold', 'Door codes for Nuki and Yale smart locks', 'House guide, local tips and messages in one place'],
        alt: 'The guest app on two phones: the trip page and messages',
        vis: phoneF('phone-guest', 's-fv-p1') + phoneF('phone-inbox', 's-fv-p2') + ncard('Check-in done', 'Door code sent', 'key', 's-fv-nc'),
        cta: ['Open the guest app', go('guest', { bookingId: (BB.q.upcoming()[0] || {}).id })] },
      { t: 't-cobalt', pill: 'Guest outreach', h: 'Quiet week? <span class="s-hl">Text your regulars.</span>',
        p: 'Past guests are your best guests. We bring them back with emails and texts sent in your name: gap-night offers, next-season reminders and a welcome-back note that pays for itself.',
        pts: ['Import past guests from your platform exports', 'Ready-made campaigns for gap nights and next season', 'See opens, clicks and bookings from every send'],
        alt: 'The campaigns screen in the host console',
        vis: frame('shot-campaigns', 'booking-booster.co.uk/app', 's-fv-main') + ncard('Example campaign', '23 rebooked from one email', 'good', 'dark s-fv-nc'),
        cta: ['See campaigns', go('app', { view: 'campaigns' })] },
      { t: 't-sky', pill: 'Host console and app', h: 'Every booking, message and payment. <span class="s-hl">One screen.</span>',
        p: 'Run it all from your laptop or your phone. See who arrives today, answer guests with suggested replies, and get a buzz the moment a direct booking lands.',
        pts: ['Calendar, bookings, payments and messages together', 'Suggested replies to guest questions', 'Fees kept and returning guests, tracked every month'],
        alt: 'The host console dashboard and the host app on a phone',
        vis: frame('shot-console', 'booking-booster.co.uk/app', 's-fv-main') + phoneF('phone-grow', 's-fv-phone'),
        cta: ['Open the host console', go('app', { view: 'dashboard' })] },
    ];
    const row = (f, i) => '<section class="s-feat ' + f.t + (i % 2 ? ' flip' : '') + '"' + (f.id ? ' id="s-' + f.id + '-' + inst.uid + '"' : '') + '>' + CHEV + '<div class="s-w s-feat-in">' +
      '<div class="s-feat-copy">' + pill(f.pill) + '<h2 class="s-h2">' + f.h + '</h2><p class="s-sub">' + f.p + '</p>' +
        '<ul class="s-ticks3">' + f.pts.map(x => '<li><span>' + icon('check') + '</span>' + x + '</li>').join('') + '</ul>' +
        '<button class="btn s-b lg"' + f.cta[1] + '>' + f.cta[0] + icon('arrow') + '</button></div>' +
      '<div class="s-feat-vis" role="img" aria-label="' + esc(f.alt) + '">' + f.vis + '</div></div></section>';
    return { top: F.map(row).join(''), bottom: G.map((f, i) => row(f, i + F.length + 1)).join('') };
  }

  const MYTHS = [
    ['SEO takes years.', 'Local pages for specific searches can rank in months, especially in smaller towns.'],
    ['I would have to leave the platforms.', 'Keep them if you like. The optional calendar sync blocks dates booked there, so you never double book.'],
    ['Direct bookings are risky.', 'Card payments, ID checks, rental agreements and security deposits protect every direct stay.'],
    ['My guests do not use apps.', 'No download needed. The guest app opens from a link in their booking confirmation.'],
    ['People do not trust small websites.', 'A secure site with real reviews, clear prices and instant payment earns trust fast.'],
    ['I need to be good with tech.', 'We set everything up. You approve it and keep hosting.'],
  ];
  function myths() {
    return '<section class="s-sec s-myths t-white"><div class="s-w"><div class="s-head">' + pill('Myth vs fact') + '<h2 class="s-h2">What hosts worry about, <span class="s-hl">and what is true.</span></h2></div>' +
      '<ul class="s-myth-grid">' + MYTHS.map(([m, f]) => '<li><p class="s-myth"><span>Myth</span><s>' + m + '</s></p><p class="s-fact"><span>Fact</span>' + f + '</p></li>').join('') + '</ul></div></section>';
  }

  function calcVals(st) {
    const direct = st.rev * st.share / 100, kept = Math.round(direct * FEE()), planYear = plan('growth').price * 12;
    return { direct, kept, planYear, net: kept - planYear, weeks: kept > 0 ? Math.ceil(planYear / (kept / 52)) : 99 };
  }
  function calc(inst) {
    const st = inst.st, v = calcVals(st), u = inst.uid, maxBar = Math.max(v.kept, v.planYear, 1);
    return '<section class="s-sec s-calc-sec"><div class="s-w s-calc">' +
      '<div class="s-calc-l">' + pill('Fee calculator') + '<h2 class="s-h2">What would going direct be worth to you?</h2>' +
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
        '<div><span>Plan, first year (12 × £' + plan('growth').price + ')</span><span class="s-cmp-bar"><i class="plan" data-cv="barPlan" style="width:' + (100 * v.planYear / maxBar) + '%"></i></span><b class="num">' + $(v.planYear) + '</b></div></div>' +
        '<div class="s-calc-net"><span data-cv="netLabel">' + (v.net >= 0 ? 'Left over after the plan' : 'Short of covering the plan') + '</span><b class="num" data-cv="net" data-v="' + v.net + '">' + $(v.net) + '</b></div>' +
        '<p class="s-calc-pay" data-cv="pay">' + payLine(v) + '</p>' +
        '<button class="btn accent lg block" data-act="start">Start keeping it' + icon('arrow') + '</button>' +
        '<p class="s-fine">Estimate only. Uses Airbnb’s host-only fee of 15.5% and the plan’s first year billed monthly (12 months at £200), including VAT.</p>' +
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
    const ok = icon('check');
    return '<section class="s-ink s-ai2" id="s-ai-' + u + '">' + CHEV + '<div class="s-w">' +
      '<div class="s-ai2-head">' +
        pill('AI search') +
        '<h2 class="s-h2">When guests ask ChatGPT, <span class="s-hl">be the answer.</span></h2>' +
        '<p class="s-sub">More guests start with ChatGPT, Gemini, Perplexity or Google’s AI answers instead of scrolling a listings site. Those assistants recommend the places they can read and trust. We make your booking site one of them, with a link that books direct.</p>' +
        '<div class="s-ai2-logos">' + ENGINES.map(([k, t]) => '<span>' + BB.aiName(k, t) + '</span>').join('') + '</div>' +
      '</div>' +
      '<ol class="s-ai2-steps">' +
        '<li><span class="s-ai2-n">1</span><h3>A guest asks</h3><p>They type a real question about your area, the way they would ask a friend.</p>' +
          '<div class="s-ai2-viz"><div class="s-ai2-bubble">' + esc(question) + '</div></div></li>' +
        '<li><span class="s-ai2-n">2</span><h3>The assistant reads the web</h3><p>It looks for clear, trusted facts. We put them on your site in the format assistants read.</p>' +
          '<div class="s-ai2-viz"><ul class="s-ai2-src">' +
            ['Your booking site, with structured data', 'Questions and answers about your home', 'Google Business Profile and reviews', 'An open door for AI crawlers'].map(t => '<li>' + ok + esc(t) + '</li>').join('') +
          '</ul></div></li>' +
        '<li><span class="s-ai2-n">3</span><h3>It recommends you</h3><p>Your home appears in the answer, with a link to your own site, so the guest books without a platform fee.</p>' +
          '<div class="s-ai2-viz"><div class="s-ai2-ans"><small>' + BB.aiName('chatgpt', 'ChatGPT') + '</small><p><b>Larch Fell Cabin</b> is a cosy cabin with a private hot tub and fell views, ten minutes from Windermere.</p><span class="s-ai2-link">' + icon('lock') + 'larchfellcabin.co.uk<em>Book direct</em></span></div></div></li>' +
      '</ol>' +
      '<div class="s-ai2-weekly"><h3>What we do for you, every week</h3><ul>' +
        '<li><b>Ask the questions guests ask.</b><span>We put travellers’ questions about your area to each assistant and read every answer.</span></li>' +
        '<li><b>Make your site easy for AI to read.</b><span>Structured data, clear answers about your home, a sitemap and an llms.txt file.</span></li>' +
        '<li><b>Fill the gaps.</b><span>When an assistant recommends someone else, we add the local pages and facts that were missing.</span></li>' +
        '<li><b>Show you the score.</b><span>A weekly AI visibility report in your console, so you can see it move.</span></li>' +
      '</ul></div>' +
      '<div class="s-ai2-shot"><div>' + pill('Your weekly AI report') + '<h3>Mentioned in 6 of 8 <span>AI answers.</span></h3><p>See which questions name you, which name a competitor, and the fixes that win you the next one. Example report with sample data.</p></div>' +
        '<div role="img" aria-label="The AI visibility report in the host console">' + frame('shot-ai', 'booking-booster.co.uk/app') + '</div></div>' +
      '<div class="s-ai2-check">' +
        '<div class="s-ai2-form"><h3>Check your area now</h3><p>See what assistants say when a traveller asks about stays near you.</p>' +
          '<form class="s-ai-form" data-form="ai" novalidate>' +
            '<label class="s-f"><span>Town or area</span><input id="s-ai-town-' + u + '" data-ai="town" value="' + esc(a.town) + '" maxlength="40" autocomplete="off" placeholder="Keswick"></label>' +
            '<label class="s-f"><span>Type of stay</span><select id="s-ai-type-' + u + '" data-ai="type">' + STAY_TYPES.map(([k, t]) => '<option value="' + k + '"' + (a.type === k ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
            '<button class="btn primary lg" type="submit"' + (a.phase === 'scan' ? ' disabled' : '') + '>' + icon('search') + (a.phase === 'done' ? 'Check again' : a.phase === 'scan' ? 'Checking…' : 'Check my area') + '</button>' +
            (a.err ? '<p class="s-err" role="alert">' + esc(a.err) + '</p>' : '') +
          '</form>' +
          '<p class="s-fine">This preview uses sample answers. The real check runs in your console every week.</p>' + BB.aiTm() +
        '</div>' +
        '<div class="s-ai-r" aria-live="polite"><div class="s-ai2-win"><i></i><i></i><i></i><span>AI answer check</span></div><div class="s-ai2-body">' + panel + '</div></div>' +
      '</div>' +
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
    return '<section class="s-sec"><div class="s-w"><div class="s-head">' + pill('How it works') + '<h2 class="s-h2">Live the same day. You barely lift a finger.</h2></div>' +
      '<ol class="s-steps">' + steps.map(([h, p, k], i) => '<li><span class="s-step-n num">' + (i + 1) + '</span><h3>' + h + '</h3><p>' + p + '</p>' +
        (k === 'link' ? '<div class="s-step-viz"><span class="s-url-demo">' + icon('globe') + 'airbnb.co.uk/rooms/48213907</span></div>' :
         k === 'build' ? '<div class="s-step-viz s-chk">' + ['Booking site', 'SEO pages', 'AI answers', 'Guest list'].map(x => '<span>' + icon('check') + x + '</span>').join('') + '</div>' :
         '<div class="s-step-viz"><span class="s-bk-demo">' + BB.chan('direct') + '<b class="num">+£980</b><em>no platform fee</em></span></div>') + '</li>').join('') + '</ol>' +
      '<div class="s-how-cta"><button class="btn primary lg" data-act="start">Paste my listing link' + icon('arrow') + '</button></div></div></section>';
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
      '<div class="s-head s-head-row"><div>' + pill('Pricing') + '<h2 class="s-h2">Less than one platform fee a month.</h2><p class="s-sub">One plan, done for you. £200 a month, with no setup fee. Cancel anytime. Prices include VAT. Covers up to 3 homes; more than that, talk to us.</p></div>' +
        '</div>' +
      '<div class="s-plans">' + PLANS.map(p => '<article class="s-plan' + (p.hot ? ' hot' : '') + '">' + '' +
        '<h3>' + p.name + '</h3><p class="s-plan-tag">' + p.tag + '</p><div class="s-amt"><b class="num">£' + perMonth(p, an) + '</b><span>/ month</span></div>' +
        '<p class="s-plan-bill">' + (an ? 'Billed ' + $(p.price * 10) + ' a year inc. VAT. You save ' + $(p.price * 2) + '.' : 'Billed monthly, inc. VAT. Cancel anytime.') + ' No setup fee.</p>' +
        '<ul>' + p.feats.map(f => '<li>' + icon('check') + f + '</li>').join('') + '</ul>' +
        '<button class="btn ' + (p.hot ? 'accent' : '') + ' block lg" data-act="start" data-plan="' + p.id + '">' + p.cta + '</button></article>').join('') + '</div>' +
      '<div class="s-addon"><span class="s-addon-ic">' + icon('sync') + '</span><div><b>Optional: ' + ADDON.name + ' <em>+£' + ADDON.price + ' a month</em></b><p>Calendar sync with your channel manager, Airbnb, Vrbo or Booking.com. Paste the calendar link and dates booked there are blocked on your site, so you never double book. Most hosts never need it.</p></div></div>' +
      '</div></section>';
  }

  function faq(inst) {
    const open = inst.st.faq;
    return '<section class="s-sec s-faq-sec" id="s-faq-' + inst.uid + '"><div class="s-w s-faq-w"><div class="s-head">' + pill('FAQ') + '<h2 class="s-h2">Questions hosts ask.</h2><p class="s-sub">Something else? Email <a href="mailto:' + esc(CO().support) + '">' + esc(CO().support) + '</a> and a person answers within a working day.</p></div>' +
      '<div class="s-faq">' + FAQ.map(([q, a], i) => '<div class="s-qa' + (open === i ? ' open' : '') + '"><h3><button id="s-faq-' + i + '-' + inst.uid + '" data-faq="' + i + '" aria-expanded="' + (open === i) + '" aria-controls="s-faqp-' + i + '-' + inst.uid + '">' + q + '<span class="s-pm" aria-hidden="true"></span></button></h3>' +
        '<div class="s-ans" id="s-faqp-' + i + '-' + inst.uid + '" role="region"' + (open === i ? '' : ' hidden') + '><p>' + a + '</p></div></div>').join('') + '</div></div></section>';
  }

  /* the brand's live social profiles (same list as server/marketing.js) */
  const SOCIAL = [
    ['Instagram', 'https://www.instagram.com/bookingbooster_1/', '<rect x="3" y="3" width="18" height="18" rx="5" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="17.4" cy="6.6" r="1.3" fill="currentColor"/>'],
    ['Facebook', 'https://www.facebook.com/1300137993193053', '<path fill="currentColor" d="M13.5 22v-8h2.7l.4-3.2h-3.1V8.8c0-.9.3-1.6 1.6-1.6h1.7V4.4c-.3 0-1.3-.1-2.5-.1-2.5 0-4.1 1.5-4.1 4.2v2.3H7.4V14h2.8v8z"/>'],
    ['TikTok', 'https://www.tiktok.com/@bookingbooster', '<path fill="currentColor" d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v3.1c-1.4.1-2.7-.3-3.9-1.1v6.1c0 3.4-2.5 5.6-5.6 5.6S5.4 18.2 5.4 15.1c0-3.3 2.8-5.7 6.3-5.2v3.2c-1.5-.4-3 .5-3 2.1 0 1.2 1 2.2 2.3 2.2 1.4 0 2.4-.9 2.4-2.7V3z"/>'],
    ['YouTube', 'https://www.youtube.com/channel/UC1jo2BbolkHDSDcFCwnV3PA', '<rect x="2" y="5" width="20" height="14" rx="4.5" fill="currentColor"/><path fill="var(--sicon-bg, #2747F5)" d="M10 9v6l5.2-3z"/>'],
  ];
  const socials = () => '<ul class="s-social" aria-label="Follow Bookingbooster">' + SOCIAL.map(([n, u, d]) => '<li><a href="' + u + '" target="_blank" rel="me noopener" aria-label="' + n + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg></a></li>').join('') + '</ul>';

  /* "Explore AI summary": each assistant opens with a prompt asking it to summarise our site. The marks are the brands' own
     logos (@lobehub/icons-static-svg 1.95.1, the source of brand/ai-platforms), on white chips so they are never recoloured.
     Gradient ids carry the instance uid so two renders on one page cannot clash. */
  const AI_PROMPT = 'Summarise what Bookingbooster (https://booking-booster.co.uk) offers UK holiday let and short-term let hosts: who it is for, what is included, what it costs and how it helps hosts take direct bookings. Use the website as your source.';
  const AI_SUMMARY = [
    ['ChatGPT', 'https://chatgpt.com/?q=', '<path fill="#000" fill-rule="evenodd" d="M9.205 8.658v-2.26c0-.19.072-.333.238-.428l4.543-2.616c.619-.357 1.356-.523 2.117-.523 2.854 0 4.662 2.212 4.662 4.566 0 .167 0 .357-.024.547l-4.71-2.759a.797.797 0 00-.856 0l-5.97 3.473zm10.609 8.8V12.06c0-.333-.143-.57-.429-.737l-5.97-3.473 1.95-1.118a.433.433 0 01.476 0l4.543 2.617c1.309.76 2.189 2.378 2.189 3.948 0 1.808-1.07 3.473-2.76 4.163zM7.802 12.703l-1.95-1.142c-.167-.095-.239-.238-.239-.428V5.899c0-2.545 1.95-4.472 4.591-4.472 1 0 1.927.333 2.712.928L8.23 5.067c-.285.166-.428.404-.428.737v6.898zM12 15.128l-2.795-1.57v-3.33L12 8.658l2.795 1.57v3.33L12 15.128zm1.796 7.23c-1 0-1.927-.332-2.712-.927l4.686-2.712c.285-.166.428-.404.428-.737v-6.898l1.974 1.142c.167.095.238.238.238.428v5.233c0 2.545-1.974 4.472-4.614 4.472zm-5.637-5.303l-4.544-2.617c-1.308-.761-2.188-2.378-2.188-3.948A4.482 4.482 0 014.21 6.327v5.423c0 .333.143.571.428.738l5.947 3.449-1.95 1.118a.432.432 0 01-.476 0zm-.262 3.9c-2.688 0-4.662-2.021-4.662-4.519 0-.19.024-.38.047-.57l4.686 2.71c.286.167.571.167.856 0l5.97-3.448v2.26c0 .19-.07.333-.237.428l-4.543 2.616c-.619.357-1.356.523-2.117.523zm5.899 2.83a5.947 5.947 0 005.827-4.756C22.287 18.339 24 15.84 24 13.296c0-1.665-.713-3.282-1.998-4.448.119-.5.19-.999.19-1.498 0-3.401-2.759-5.947-5.946-5.947-.642 0-1.26.095-1.88.31A5.962 5.962 0 0010.205 0a5.947 5.947 0 00-5.827 4.757C1.713 5.447 0 7.945 0 10.49c0 1.666.713 3.283 1.998 4.448-.119.5-.19 1-.19 1.499 0 3.401 2.759 5.946 5.946 5.946.642 0 1.26-.095 1.88-.309a5.96 5.96 0 004.162 1.713z"></path>'],
    ['Claude', 'https://claude.ai/new?q=', '<path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z" fill="#D97757" fill-rule="nonzero"></path>'],
    ['Perplexity', 'https://www.perplexity.ai/search/new?q=', '<path d="M19.785 0v7.272H22.5V17.62h-2.935V24l-7.037-6.194v6.145h-1.091v-6.152L4.392 24v-6.465H1.5V7.188h2.884V0l7.053 6.494V.19h1.09v6.49L19.786 0zm-7.257 9.044v7.319l5.946 5.234V14.44l-5.946-5.397zm-1.099-.08l-5.946 5.398v7.235l5.946-5.234V8.965zm8.136 7.58h1.844V8.349H13.46l6.105 5.54v2.655zm-8.982-8.28H2.59v8.195h1.8v-2.576l6.192-5.62zM5.475 2.476v4.71h5.115l-5.115-4.71zm13.219 0l-5.115 4.71h5.115v-4.71z" fill="#22B8CD" fill-rule="nonzero"></path>'],
    ['Gemini', 'https://gemini.google.com/app?q=', '<path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="#3186FF"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#bbai-gemini0-{u})"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#bbai-gemini1-{u})"></path><path d="M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z" fill="url(#bbai-gemini2-{u})"></path><defs><linearGradient gradientUnits="userSpaceOnUse" id="bbai-gemini0-{u}" x1="7" x2="11" y1="15.5" y2="12"><stop stop-color="#08B962"></stop><stop offset="1" stop-color="#08B962" stop-opacity="0"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="bbai-gemini1-{u}" x1="8" x2="11.5" y1="5.5" y2="11"><stop stop-color="#F94543"></stop><stop offset="1" stop-color="#F94543" stop-opacity="0"></stop></linearGradient><linearGradient gradientUnits="userSpaceOnUse" id="bbai-gemini2-{u}" x1="3.5" x2="17.5" y1="13.5" y2="12"><stop stop-color="#FABC12"></stop><stop offset=".46" stop-color="#FABC12" stop-opacity="0"></stop></linearGradient></defs>'],
    ['Grok', 'https://grok.com/?q=', '<path fill="#000" fill-rule="evenodd" d="M9.27 15.29l7.978-5.897c.391-.29.95-.177 1.137.272.98 2.369.542 5.215-1.41 7.169-1.951 1.954-4.667 2.382-7.149 1.406l-2.711 1.257c3.889 2.661 8.611 2.003 11.562-.953 2.341-2.344 3.066-5.539 2.388-8.42l.006.007c-.983-4.232.242-5.924 2.75-9.383.06-.082.12-.164.179-.248l-3.301 3.305v-.01L9.267 15.292M7.623 16.723c-2.792-2.67-2.31-6.801.071-9.184 1.761-1.763 4.647-2.483 7.166-1.425l2.705-1.25a7.808 7.808 0 00-1.829-1A8.975 8.975 0 005.984 5.83c-2.533 2.536-3.33 6.436-1.962 9.764 1.022 2.487-.653 4.246-2.34 6.022-.599.63-1.199 1.259-1.682 1.925l7.62-6.815"></path>'],
    ['Copilot', 'https://copilot.microsoft.com/?q=', '<path d="M17.533 1.829A2.528 2.528 0 0015.11 0h-.737a2.531 2.531 0 00-2.484 2.087l-1.263 6.937.314-1.08a2.528 2.528 0 012.424-1.833h4.284l1.797.706 1.731-.706h-.505a2.528 2.528 0 01-2.423-1.829l-.715-2.453z" fill="url(#bbai-copilot0-{u})" transform="translate(0 1)"></path><path d="M6.726 20.16A2.528 2.528 0 009.152 22h1.566c1.37 0 2.49-1.1 2.525-2.48l.17-6.69-.357 1.228a2.528 2.528 0 01-2.423 1.83h-4.32l-1.54-.842-1.667.843h.497c1.124 0 2.113.75 2.426 1.84l.697 2.432z" fill="url(#bbai-copilot1-{u})" transform="translate(0 1)"></path><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#bbai-copilot2-{u})" transform="translate(0 1)"></path><path d="M15 0H6.252c-2.5 0-4 3.331-5 6.662-1.184 3.947-2.734 9.225 1.75 9.225H6.78c1.13 0 2.12-.753 2.43-1.847.657-2.317 1.809-6.359 2.713-9.436.46-1.563.842-2.906 1.43-3.742A1.97 1.97 0 0115 0" fill="url(#bbai-copilot3-{u})" transform="translate(0 1)"></path><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#bbai-copilot4-{u})" transform="translate(0 1)"></path><path d="M9 22h8.749c2.5 0 4-3.332 5-6.663 1.184-3.948 2.734-9.227-1.75-9.227H17.22c-1.129 0-2.12.754-2.43 1.848a1149.2 1149.2 0 01-2.713 9.437c-.46 1.564-.842 2.907-1.43 3.743A1.97 1.97 0 019 22" fill="url(#bbai-copilot5-{u})" transform="translate(0 1)"></path><defs><radialGradient cx="85.44%" cy="100.653%" fx="85.44%" fy="100.653%" gradientTransform="scale(-.8553 -1) rotate(50.927 2.041 -1.946)" id="bbai-copilot0-{u}" r="105.116%"><stop offset="9.6%" stop-color="#00AEFF"></stop><stop offset="77.3%" stop-color="#2253CE"></stop><stop offset="100%" stop-color="#0736C4"></stop></radialGradient><radialGradient cx="18.143%" cy="32.928%" fx="18.143%" fy="32.928%" gradientTransform="scale(.8897 1) rotate(52.069 .193 .352)" id="bbai-copilot1-{u}" r="95.612%"><stop offset="0%" stop-color="#FFB657"></stop><stop offset="63.4%" stop-color="#FF5F3D"></stop><stop offset="92.3%" stop-color="#C02B3C"></stop></radialGradient><radialGradient cx="82.987%" cy="-9.792%" fx="82.987%" fy="-9.792%" gradientTransform="scale(-1 -.9441) rotate(-70.872 .142 1.17)" id="bbai-copilot4-{u}" r="140.622%"><stop offset="6.6%" stop-color="#8C48FF"></stop><stop offset="50%" stop-color="#F2598A"></stop><stop offset="89.6%" stop-color="#FFB152"></stop></radialGradient><linearGradient id="bbai-copilot2-{u}" x1="39.465%" x2="46.884%" y1="12.117%" y2="103.774%"><stop offset="15.6%" stop-color="#0D91E1"></stop><stop offset="48.7%" stop-color="#52B471"></stop><stop offset="65.2%" stop-color="#98BD42"></stop><stop offset="93.7%" stop-color="#FFC800"></stop></linearGradient><linearGradient id="bbai-copilot3-{u}" x1="45.949%" x2="50%" y1="0%" y2="100%"><stop offset="0%" stop-color="#3DCBFF"></stop><stop offset="24.7%" stop-color="#0588F7" stop-opacity="0"></stop></linearGradient><linearGradient id="bbai-copilot5-{u}" x1="83.507%" x2="83.453%" y1="-6.106%" y2="21.131%"><stop offset="5.8%" stop-color="#F8ADFA"></stop><stop offset="70.8%" stop-color="#A86EDD" stop-opacity="0"></stop></linearGradient></defs>'],
  ];
  const AI_TM = 'ChatGPT, Claude, Perplexity, Gemini, Grok and Copilot are trademarks of their owners. Bookingbooster is not affiliated with or endorsed by them.';
  const aiSummary = uid => '<div class="s-ai-sum"><b id="s-ai-sum-' + uid + '">Explore AI summary</b><ul aria-labelledby="s-ai-sum-' + uid + '">' + AI_SUMMARY.map(([n, u, d]) => '<li><a href="' + u + encodeURIComponent(AI_PROMPT) + '" target="_blank" rel="noopener nofollow" aria-label="Summarise Bookingbooster in ' + n + ' (opens in a new tab)" title="' + n + '"><svg viewBox="0 0 24 24" aria-hidden="true">' + d.replace(/\{u\}/g, uid) + '</svg></a></li>').join('') + '</ul></div>';

  function footer(inst) {
    return '<section class="s-final"><div class="s-w"><h2 class="s-final-h">Keep the 15%.<br>Get found. <span>Get booked.</span></h2>' +
      '<div class="s-cta"><button class="btn accent lg" data-act="start">Get my booking site' + icon('arrow') + '</button><button class="btn lg s-ghost-inv"' + go('live') + '>See the live demo</button></div>' +
      '<footer class="s-foot"><span class="s-foot-brand">' + BB.lockup() + '<em>Direct booking websites, SEO, AI visibility and guest marketing for UK holiday let and short-term let hosts.</em>' + socials() + aiSummary(inst.uid) + '</span>' +
      '<nav aria-label="Footer"><div><b>Product</b><button data-scroll="product">Overview</button><button data-scroll="ai">AI search</button><button data-scroll="pricing">Pricing</button></div>' +
      '<div><b>Try it</b><button' + go('live') + '>Live demo</button><button' + go('app') + '>Host console</button><button' + go('property', { propertyId: 'laurel' }) + '>Property site</button></div>' +
      '<div><b>Company</b>' + (LIVE() ? '<a href="/help">Help</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>' : '<button data-scroll="customers">Customers</button>') + '<button data-act="start">Get started</button><button' + go('app') + '>Log in</button></div></nav>' +
      (LIVE() ? '<p class="s-foot-fine">© ' + new Date().getFullYear() + ' ' + esc(CO().name) + '.' + (CO().number ? ' Registered in England and Wales, company no. ' + esc(CO().number) + '.' : '') + (CO().address && !/to be confirmed/i.test(CO().address) ? ' Registered office: ' + esc(CO().address) + '.' : '') + (CO().vat ? ' VAT no. ' + esc(CO().vat) + '.' : '') + ' Prices include VAT. ' + AI_TM + ' <a href="mailto:' + esc(CO().support) + '">' + esc(CO().support) + '</a></p></footer>'
        : '<p class="s-foot-fine">© 2026 Bookingbooster Ltd. Registered in England and Wales, company no. 01234567. Registered office: 1 Sample Street, Manchester M1 1AA. Prices include VAT. ' + AI_TM + ' <b>Sample details:</b> this is a prototype, and customers, figures and stories are sample data.</p></footer>') +
      '</div></section>';
  }

  function home(inst) {
    const L = liveData();
    const F = features(inst, L);
    return nav(inst) + hero(inst) + proof() + F.top + film() + calc(inst) + aiSection(inst) + F.bottom + how(inst) + myths() + customers(inst) + pricing(inst) + faq(inst) + footer(inst);
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
      theme: 'cabin', dq: '', dState: 'idle', dRes: null, dErr2: '', domain: '', dMode: 'new', own: '', ownErr: '', reg: '', conn: { stripe: 'off', lock: 'off' }, addon: false, plan: planId || 'growth', annual: false, launchN: -1, launched: null };
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
  // "I already have a domain": tidy what they typed into a bare address, the same way the server does.
  function cleanOwn(v) { return String(v || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, ''); }
  function ownProblem(h) {
    if (!h) return 'Type the domain you own, like larchcabin.co.uk.';
    if (h.length > 80 || !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return 'That does not look like a domain. Type it like larchcabin.co.uk.';
    if (/(^|\.)(bookingbooster\.site|booking-booster\.co\.uk)$/.test(h)) return 'That is one of our addresses. Type a domain you own, like larchcabin.co.uk.';
    return '';
  }
  function ownDomain(ob, sub) {
    const h = ob.domain, dns = (BB.BOOT && BB.BOOT.dns) || {}, target = dns.target || 'sites.booking-booster.co.uk', ips = dns.ips || [];
    const recs = [['TXT', '_bookingbooster', 'Your own code, shown in your console after sign-up', 'Proves the domain is yours'], ['CNAME', 'www', target, 'Sends www.' + h + ' to your booking site']]
      .concat(ips.length ? [['A', '@', ips.join(', '), 'Sends ' + h + ' to your booking site']] : []);
    return '<div class="s-own">' +
      '<div class="s-own-ok">' + icon('check') + '<p><b class="mono">' + esc(h) + '</b> stays registered where you bought it, and any email on it keeps working. You only add a few DNS records so it points at your booking site.</p></div>' +
      '<h2 class="s-own-h">The records you will add</h2>' +
      '<div class="s-own-recs" role="table" aria-label="DNS records"><div class="s-own-r s-own-th" role="row"><span role="columnheader">Type</span><span role="columnheader">Name</span><span role="columnheader">Value</span></div>' +
        recs.map(r => '<div class="s-own-r" role="row"><span class="mono s-own-t" role="cell">' + r[0] + '</span><span class="mono" role="cell">' + esc(r[1]) + '</span><span role="cell"><b class="' + (r[0] === 'TXT' ? 's-own-later' : 'mono') + '">' + esc(r[2]) + '</b><em>' + esc(r[3]) + '</em></span></div>').join('') + '</div>' +
      BB.dnsGuide(ob.reg, h) +
      '<h2 class="s-own-h">What happens next</h2><ol class="s-own-next">' +
        '<li><b>Your site goes live today</b><span>On your free address, <span class="mono">' + esc(sub) + '</span>, so you can take bookings straight away.</span></li>' +
        '<li><b>You add the records</b><span>Your console shows the exact values with copy buttons. We check every few minutes and switch your site over by itself once we see them.</span></li>' +
        '<li><b>We set up the padlock</b><span>A free security certificate (HTTPS) is added automatically, so guests see <span class="mono">https://' + esc(h) + '</span>.</span></li>' +
      '</ol></div>';
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
      signup = BB.api.call(BB.BOOT.signupUrl, { account: { name: a.name, email: a.email, password: a.password, business: a.business }, ref: a.ref || '', plan: plan(ob.plan).name, annual: ob.annual, addon: ob.addon, property: buildData(ob), listing: ob.url })
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
        const tabs = '<div class="s-tabs s-dmode" role="tablist" aria-label="Domain">' + [['new', 'search', 'Get a new domain'], ['own', 'globe', 'I already have a domain']].map(([k, ic, t]) => '<button type="button" role="tab" aria-selected="' + (ob.dMode === k) + '" data-dmode="' + k + '">' + icon(ic) + t + '</button>').join('') + '</div>';
        if (ob.dMode === 'own') {
          const ok = !!ob.domain && ob.domain === cleanOwn(ob.own) && !ownProblem(ob.domain);
          return '<h1 class="s-ob-h">Use your own domain.</h1><p class="s-ob-sub">Already bought one, at GoDaddy, 123-reg, IONOS or anywhere else? Keep it where it is. Your booking site moves onto it, and you pay nothing extra.</p>' + tabs +
            '<form data-form="own" novalidate class="s-dom-form"><label class="s-f s-f-big"><span>Your domain</span><span class="s-inwrap">' + icon('globe') + '<input id="s-ob-own-' + u + '" data-ob="own" value="' + esc(ob.own) + '" placeholder="larchcabin.co.uk" autocomplete="off" spellcheck="false" inputmode="url"></span></label><button class="btn ink lg" type="submit">' + (ok ? 'Update' : 'Use this domain') + '</button></form>' +
            (ob.ownErr ? '<p class="s-err" role="alert">' + esc(ob.ownErr) + '</p>' : '') +
            (ok ? ownDomain(ob, sub) : '<p class="s-fine">Type it without www, like <b>larchcabin.co.uk</b>. Next we show you exactly what to change, step by step.</p>') +
            '<form data-form="next" class="s-ob-form">' + navRow(ok ? 'Use ' + ob.domain : 'Type your domain to continue', !ok) + '</form>';
        }
        return '<h1 class="s-ob-h">Pick a domain.</h1><p class="s-ob-sub">Guests trust a name that matches the home. A .co.uk domain is included free for the first year on every plan.</p>' + tabs +
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
                '<div class="s-oauth-a"><button class="btn sm ghost" data-conn="' + k + '" data-c="off">Cancel</button><button class="btn sm primary" data-conn="' + k + '" data-c="busy">' + icon('lock') + 'Allow access</button></div><p class="s-fine">' + (REAL() ? 'You connect your real account securely from your console once you have signed up.' : 'Simulated sign-in for the demo.') + '</p></div>' : '') +
              '</div>';
          }).join('') +
          '<div class="s-conn s-conn-addon' + (ob.addon ? ' on' : '') + '"><div class="s-conn-top"><span class="s-conn-ic">' + icon('sync') + '</span><span class="s-conn-t"><b>' + ADDON.name + '<span class="s-need">Optional · £' + ADDON.price + ' a month</span></b><em>Calendar sync with your channel manager, Airbnb, Vrbo or Booking.com. Dates booked there are blocked on your site so you never double book.</em></span>' +
            '<button type="button" class="switch" role="switch" id="s-addon-' + u + '" data-act="addon" aria-checked="' + ob.addon + '" aria-label="' + ADDON.name + '"></button></div>' +
            (ob.addon ? '<p class="s-addon-note">' + icon('check') + 'Added for £' + ADDON.price + ' a month. Paste your calendar link in your console after launch.</p>' : '') + '</div>' +
          '</div>' +
          (ready ? '' : '<p class="s-fine">Connect Stripe so guests can pay you. It is the one thing a booking site needs.</p>') +
          '<form data-form="next" class="s-ob-form">' + navRow(ready ? 'Continue' : 'Connect Stripe to continue', !ready) + '</form>';
      }
      case 6: return '<h1 class="s-ob-h">Choose a plan.</h1><p class="s-ob-sub">£200 a month, with no setup fee. Cancel anytime, prices include VAT.</p>' +
        '<div class="s-obplans" role="radiogroup" aria-label="Plan">' + PLANS.map(p => '<button class="s-obplan' + (ob.plan === p.id ? ' on' : '') + '" role="radio" aria-checked="' + (ob.plan === p.id) + '" data-pick-plan="' + p.id + '">' +
          '<span class="s-obplan-h"><b>' + p.name + '</b>' + '' + '<i class="s-radio">' + icon('check') + '</i></span>' +
          '<span class="s-amt"><b class="num">£' + perMonth(p, ob.annual) + '</b><span>/ month</span></span><span class="s-plan-tag">' + p.blurb + ' No setup fee.</span>' +
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
            '<div><dt>Domain</dt><dd><b>' + esc(ob.domain) + '</b><span>' + (ob.dMode === 'own' ? 'Your own domain. Add the DNS records after launch, your free address works until then' : /bookingbooster\.site$/.test(ob.domain) ? 'Free address' : 'Included free for the first year') + '</span></dd><button class="btn sm ghost" data-goto="4">Edit</button></div>' +
            '<div><dt>Connected</dt><dd><b>' + (on.length ? on.map(c => c[2]).join(', ') : 'Nothing yet') + '</b><span>' + (ob.addon ? 'Plus the Calendar sync add-on' : on.length < 2 ? 'Add a smart lock from your console any time' : 'Payments and door codes are ready') + '</span></dd><button class="btn sm ghost" data-goto="5">Edit</button></div>' +
            '<div><dt>Plan</dt><dd><b>' + p.name + (ob.addon ? ' + add-on' : '') + ' · £' + total + ' a month</b><span>' + (ob.annual ? 'Plan billed ' + $(p.price * 10) + ' a year' : 'Billed monthly') + ', inc. VAT. No setup fee</span></dd><button class="btn sm ghost" data-goto="6">Edit</button></div>' +
          '</dl>' +
          '<form data-form="launch" class="s-ob-form" novalidate>' + (REAL() ? acctFields(inst) : '') + '<div class="s-ob-nav"><button type="button" class="btn ghost lg" data-act="back">' + icon('back') + 'Back</button><button class="btn primary lg s-glow" type="submit">' + icon('bolt') + (REAL() && BB.BOOT.payFirst ? 'Continue to payment' : 'Launch my site') + '</button></div></form>';
      }
    }
    return '';
  }
  function acctFields(inst) {
    const a = inst.st.ob.acct || (inst.st.ob.acct = { name: '', email: '', password: '', business: '', ref: inst.ref || '', terms: false }), u = inst.uid;
    const f = (k, label, type, ac, ph) => '<label class="s-f"><span>' + label + '</span><input id="s-ac-' + k + '-' + u + '" data-ac="' + k + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(a[k]) + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '></label>';
    return '<div class="s-acct"><h2 class="s-acct-h">Create your account</h2><p class="s-ob-sub">You will sign in with this to run your bookings. ' + (BB.BOOT.payFirst ? 'Next you pay your first month securely with Stripe, and your console opens straight after. No setup fee.' : 'No setup fee.') + '</p>' +
      '<div class="s-grid2">' + f('name', 'Your name', 'text', 'name') + f('business', 'Business name (optional)', 'text', 'organization', 'For example, Fell & Harbour Stays') + f('email', 'Email', 'email', 'email') + f('password', 'Password', 'password', 'new-password', 'At least 10 characters') + f('ref', 'Referral code (optional)', 'text', 'off', 'If someone recommended us') + '</div>' +
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
        (ob.dMode === 'own' ? '<p class="s-ob-sub">Guests can book <b>' + esc(p.name) + '</b> on your free address right now, with no platform fee. Add the DNS records shown in your console and your site moves to <b class="s-dom-live">' + esc(p.domain) + '</b> by itself.</p>' : '<p class="s-ob-sub">Guests can book <b>' + esc(p.name) + '</b> at <b class="s-dom-live">' + esc(p.domain) + '</b> right now, with no platform fee. We also told your console, so it is ready when you log in.</p>') +
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
      inst.uid = Math.random().toString(36).slice(2, 7); inst.timers = []; inst.ref = opts.ref || '';
      Object.assign(inst.st, { view: opts.view || 'home', anim: true, menu: false, rev: 80000, share: 30, tour: 'console', annual: false, faq: 0,
        ai: { town: 'Keswick', type: 'cabin', phase: 'idle', step: 0, err: '' }, ob: Object.assign(newOb(opts.plan), { annual: false, addon: !!opts.addon },
          opts.email || opts.name || opts.business ? { acct: { name: opts.name || '', email: opts.email || '', password: '', business: opts.business || '', ref: opts.ref || '', terms: false } } : {}) });
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
      BB.on(root, 'click', '[data-dmode]', el => {
        const ob = inst.st.ob, k = el.dataset.dmode; if (ob.dMode === k) return;
        ob.dMode = k; ob.domain = ''; ob.ownErr = '';
        if (k === 'own') { const h = cleanOwn(ob.own); if (h && !ownProblem(h)) ob.domain = h; }
        else if (ob.dRes) { const first = ob.dRes.find(x => x.ok); if (first) ob.domain = first.d; }
        else { ob.dq = ob.dq || slug(ob.d.name) + '.co.uk'; inst.render(); checkDomain(inst); return; }
        inst.render();
      });
      BB.on(root, 'click', '[data-dns-reg]', el => { const ob = inst.st.ob; ob.reg = ob.reg === el.dataset.dnsReg ? '' : el.dataset.dnsReg; inst.render(); });
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
      BB.on(root, 'input', '[data-d]', el => { inst.st.ob.d[el.dataset.d] = el.value; inst.st.ob.dErr = ''; if (el.dataset.d === 'name') { inst.st.ob.dq = ''; inst.st.ob.dRes = null; if (inst.st.ob.dMode !== 'own') inst.st.ob.domain = ''; } inst.render(); });

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
        if (kind === 'own') { const h = cleanOwn(ob.own), e = ownProblem(h); ob.ownErr = e; ob.domain = e ? '' : h; if (!e) ob.own = h; inst.render(); return; }
        if (kind === 'next') {
          if (ob.step === 4 && !ob.domain) return;
          if (ob.step === 5 && ob.conn.stripe !== 'on') return;
          ob.step++; if (ob.step === 4 && !ob.dRes && ob.dMode !== 'own') { ob.dq = ob.dq || slug(ob.d.name) + '.co.uk'; inst.render(); checkDomain(inst); } else inst.render();
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
