// Renders a Studio site spec (and funnel pages) into a complete, fast, crawlable HTML page.
// Facts (prices, sleeps, photos, reviews, availability) always come live from the home itself; the spec only
// carries the art direction, the layout choices and the words.
'use strict';
const D = require('./design');
const { esc } = require('../pages');
const seo = require('../seo');

const money = n => '£' + Number(n || 0).toLocaleString('en-GB');
const plural = (n, w, pl) => n + ' ' + (n === 1 ? w : (pl || w + 's'));
const town = p => String(p.area || '').split(',')[0].trim();
const KIND = { cabin: 'cabin', lake: 'cottage', city: 'townhouse' };

/* ---------- facts: everything true about the home, in one place ---------- */
function facts(s, p, o) {
  o = o || {};
  const guide = (p.guide || []).map(l => String(l).split('|').map(x => x.trim())).filter(x => x[0]).map(x => ({ place: x[0], far: x[1] || '', tip: x[2] || '' }));
  let photos = (p.photos || []).filter(x => x && x.url).map((x, i) => ({ url: x.url, cap: x.cap || '', alt: x.cap || p.name + ', photo ' + (i + 1) }));
  if (!photos.length && o.samplePhotos) photos = o.samplePhotos;
  const reviews = seo.reviewsOf ? seo.reviewsOf(s, p) : [];
  return {
    id: p.id, name: p.name, short: p.short || p.name, area: p.area || '', town: town(p), kind: KIND[p.theme] || 'holiday let', theme: p.theme,
    headline: p.headline || '', sub: p.sub || '', about: p.about || '', hostNote: p.hostNote || '',
    nightly: +p.nightly || 0, weekend: +p.weekend || 0, cleaning: +p.cleaning || 0, minNights: +p.minNights || 1, maxGuests: +p.maxGuests || 2,
    bedrooms: +p.bedrooms || 1, baths: +p.baths || 1, pets: !!p.petsAllowed, petFee: +p.petFee || 0,
    checkin: p.checkinTime || '4pm', checkout: p.checkoutTime || '10am', parking: p.parking || '',
    amenities: (p.amenities || []).slice(0, 30), rules: (p.rules || []).slice(0, 12), guide, photos,
    rating: p.rating || 0, reviewCount: p.reviews || 0, reviews,
    business: s.account.business, owner: String(s.account.owner || '').split(' ')[0], live: !!s.live,
    faqs: seo.faqsOf(s, p),
  };
}

/* ---------- styles ---------- */
const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 .55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")";

// The page's design tokens and style switches, from a resolved look (design.look).
const IMGS = '.frame img,.h-ed .img img,.h-cen .wide img,.mos img,.h-arch .main,.hl-pan .pic img,.grid button,.strip img,.st-ph .pic img,.hl-cards img,.msn button,.cl-split .pic img';
function css(L) {
  const pal = L.pal, d = L.d, ds = L.disp, sh = L.shape;
  const v = '--bg:' + pal.bg + ';--bg2:' + pal.bg2 + ';--ink:' + pal.ink + ';--mut:' + pal.muted + ';--line:' + pal.line + ';--ac:' + pal.accent + ';--acInk:' + pal.accentInk + ';--acT:' + pal.accentText + ';--acD:' + pal.accentDeep + ';--dBtn:' + pal.deepBtn + ';--dBtnI:' + pal.deepBtnInk +
    ';--deep:' + pal.deep + ';--deepInk:' + pal.deepInk + ";--fd:'" + L.fonts.display + "',Georgia,serif;--ft:'" + L.fonts.text + "',system-ui,sans-serif;--dw:" + ds.weight + ';--dt:' + ds.track + ';--dl:' + ds.lead +
    ';--dc:' + ds.case + ';--ds:' + ds.scale + ';--r:' + sh.radius + 'px;--rb:' + sh.button + 'px;--ri:' + sh.image + 'px;--sp:' + L.spacing + ';--deepMut:' + D.mix(pal.deepInk, pal.deep, 0.32) + ';--deepLine:' + D.mix(pal.deepInk, pal.deep, 0.78);
  let x = '';
  x += L.texture === 'grain' ? 'body::after{opacity:.06}' : L.texture === 'paper' ? 'body::after{opacity:.045}' : 'body::after{display:none}';
  if (L.dark) x += 'body::after{mix-blend-mode:screen;opacity:.035}';
  if (L.italicHead) x += '.disp{font-style:italic}.disp em{font-style:normal}';
  // buttons: the booking card, phone bar and forms always keep a solid button, so the main action never fades
  const keep = ':not(.card .btn):not(.mbar .btn):not(.fn-form .btn)';
  if (L.buttons === 'outline') x += '.btn' + keep + ':not(.gh){background:transparent!important;color:inherit!important;border:1.5px solid currentColor!important}.btn' + keep + ':hover{background:color-mix(in srgb,currentColor 9%,transparent)!important;box-shadow:none!important}';
  if (L.buttons === 'link') x += '.btn' + keep + '{background:none!important;color:inherit!important;border:0!important;border-bottom:1.5px solid currentColor!important;border-radius:0!important;padding:0 2px!important;min-height:44px;box-shadow:none!important}.btn' + keep + ':hover{transform:none;gap:16px}.pill{padding-right:26px}';
  if (L.images === 'framed') x += IMGS + '{padding:clamp(6px,.8vw,12px)!important;background:#FFFFFF!important;box-shadow:0 1px 2px rgba(0,0,0,.06),0 22px 44px -26px rgba(0,0,0,.42)}.frame::before{display:none}';
  if (L.images === 'shadow') x += IMGS + '{box-shadow:0 34px 70px -34px rgba(0,0,0,.5)}';
  if (L.bands === 'flat') x += '.sec.alt{background:var(--bg);border-top:1px solid var(--line)}.sec.alt+.sec:not(.alt):not(.dk){border-top:1px solid var(--line)}';
  if (L.bands === 'bold') x += '.sec.alt{background:' + pal.deep + ';color:' + pal.deepInk + ';--bg:' + pal.deep + ';--bg2:' + D.mix(pal.deep, pal.deepInk, 0.08) + ';--ink:' + pal.deepInk + ';--mut:var(--deepMut);--line:var(--deepLine);--acT:var(--acD)}.sec.alt .btn:not(.gh){background:var(--dBtn);color:var(--dBtnI);border-color:var(--dBtn)}.sec.alt .mono{background:var(--dBtn);color:var(--dBtnI)}';
  return ':root{' + v + ';color-scheme:' + (L.dark ? 'dark' : 'light') + '}' + BASE + MORE + x;
}
const BASE = `
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth;scroll-padding-top:84px}
body{margin:0;background:var(--bg);color:var(--ink);font:400 17px/1.65 var(--ft);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden}
body::after{content:"";position:fixed;inset:0;pointer-events:none;z-index:90;background-image:${GRAIN};mix-blend-mode:multiply}
img{display:block;max-width:100%}a{color:inherit}button,input,select{font:inherit;color:inherit}
:focus-visible{outline:2px solid var(--ac);outline-offset:3px}
.skip{position:absolute;left:-999px;top:8px;background:var(--ink);color:var(--bg);padding:10px 14px;z-index:100}.skip:focus{left:8px}
.w{width:100%;max-width:1320px;margin:0 auto;padding-inline:clamp(20px,5vw,64px)}
.disp{font-family:var(--fd);font-weight:var(--dw);letter-spacing:var(--dt);line-height:var(--dl);text-transform:var(--dc);font-optical-sizing:auto;margin:0;text-wrap:balance}
.disp em{font-style:italic;color:var(--acT)}
.h1{font-size:calc(clamp(3rem,7.6vw,7.4rem) * var(--ds))}.h2{font-size:calc(clamp(2.3rem,4.8vw,4.4rem) * var(--ds))}.h3{font-size:calc(clamp(1.45rem,2.2vw,1.9rem) * var(--ds));line-height:1.12}
.eb{display:inline-flex;align-items:center;gap:12px;font:600 12px/1 var(--ft);letter-spacing:.18em;text-transform:uppercase;color:var(--mut);margin:0 0 22px}
.eb::before{content:"";width:28px;height:1px;background:currentColor;opacity:.7}
.lede{font-size:clamp(1.12rem,1.5vw,1.3rem);line-height:1.6;color:var(--mut);max-width:38em;margin:0}
p{margin:0 0 1.1em}.mut{color:var(--mut)}.num{font-variant-numeric:tabular-nums lining-nums}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-height:52px;padding:0 28px;border-radius:var(--rb);background:var(--ac);color:var(--acInk);font-weight:600;font-size:15px;letter-spacing:.02em;text-decoration:none;border:1px solid var(--ac);cursor:pointer;transition:transform .35s cubic-bezier(.2,.7,.1,1),background .3s,box-shadow .35s}
.btn:hover{transform:translateY(-2px);box-shadow:0 14px 30px -14px color-mix(in srgb,var(--ac) 80%,transparent)}
.btn.gh{background:transparent;color:inherit;border-color:currentColor}.btn.gh:hover{background:color-mix(in srgb,currentColor 8%,transparent);box-shadow:none}
.btn svg{width:18px;height:18px}
.sec{padding-block:calc(clamp(84px,11vw,168px) * var(--sp,1));position:relative}.sec.alt{background:var(--bg2)}.sec.dk{background:var(--deep);color:var(--deepInk)}.sec.dk .mut,.sec.dk .eb{color:var(--deepMut)}.sec.dk .disp em{color:inherit}
.rule{height:1px;background:var(--line);border:0;margin:0}
/* nav */
.nav{position:fixed;inset:0 0 auto;z-index:50;transition:background .4s,box-shadow .4s,color .4s}
.nav .w{display:flex;align-items:center;justify-content:space-between;gap:24px;height:78px}
.nav .wm{font-family:var(--fd);font-weight:var(--dw);font-size:calc(1.55rem * var(--ds));letter-spacing:var(--dt);text-transform:var(--dc);text-decoration:none;white-space:nowrap}
.nav ul{display:flex;gap:30px;list-style:none;margin:0;padding:0}.nav li a{text-decoration:none;font-size:14px;font-weight:500;letter-spacing:.04em;opacity:.82}.nav li a:hover{opacity:1}
.nav .btn{min-height:42px;padding:0 20px;font-size:14px}
.nav.ov{color:#fff}.nav.ov .btn{background:#fff;color:#111;border-color:#fff}
.nav.solid{background:color-mix(in srgb,var(--bg) 90%,transparent);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px);color:var(--ink);box-shadow:0 1px 0 var(--line)}
.nav.solid .btn{background:var(--ac);color:var(--acInk);border-color:var(--ac)}
@media(max-width:900px){.nav ul{display:none}}
/* hero */
.hero{position:relative}.hero .ln{display:block;overflow:hidden;padding-bottom:.06em}.hero .ln>span{display:block}
.js .hero .ln>span{animation:rise 1.25s cubic-bezier(.16,.84,.2,1) both}.js .hero .ln:nth-child(2)>span{animation-delay:.12s}.js .hero .ln:nth-child(3)>span{animation-delay:.24s}
.js .hero .fade{animation:fade 1.4s .45s cubic-bezier(.2,.7,.1,1) both}.js .hero .zoom{animation:zoom 2.6s cubic-bezier(.2,.7,.1,1) both}
@keyframes rise{from{transform:translateY(105%)}to{transform:none}}@keyframes fade{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}@keyframes zoom{from{transform:scale(1.08)}to{transform:scale(1)}}
.h-cin{min-height:max(640px,100svh);display:flex;align-items:flex-end;color:#fff;overflow:hidden;isolation:isolate}
.h-cin .bgimg{position:absolute;inset:0;z-index:-2}.h-cin .bgimg img{width:100%;height:100%;object-fit:cover}
.h-cin::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(180deg,rgba(0,0,0,.42) 0%,rgba(0,0,0,0) 26%,rgba(0,0,0,0) 46%,rgba(0,0,0,.62) 100%)}
.h-cin .w{display:grid;grid-template-columns:1fr auto;align-items:end;gap:40px;padding-bottom:clamp(44px,7vw,92px)}
.h-cin .eb{color:rgba(255,255,255,.86)}.h-cin .lede{color:rgba(255,255,255,.86);margin-top:26px}.h-cin .disp em{color:inherit}
.pill{display:flex;align-items:center;gap:22px;padding:14px 14px 14px 26px;border-radius:var(--rb);background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.28);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);color:#fff;white-space:nowrap}
.pill small{display:block;font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.8}.pill b{font:var(--dw) 1.7rem/1 var(--fd)}.pill .btn{background:#fff;color:#111;border-color:#fff}
@media(max-width:820px){.h-cin .w{grid-template-columns:1fr}.pill{justify-self:start}}
.h-split{padding-top:132px;padding-bottom:clamp(60px,8vw,110px)}.h-split .w{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(36px,6vw,96px);align-items:center}
.h-split .lede{margin-top:28px}.h-split .acts{margin-top:40px}
.frame{position:relative}.frame img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--ri)}
.frame::before{content:"";position:absolute;inset:22px -22px -22px 22px;border:1px solid var(--ac);border-radius:var(--ri);z-index:-1;opacity:.55}
.frame figcaption{position:absolute;left:-1px;bottom:28px;background:var(--bg);padding:10px 16px;font-size:13px;color:var(--mut);letter-spacing:.02em}
@media(max-width:900px){.h-split .w{grid-template-columns:1fr}.h-split{padding-top:110px}.frame::before{inset:14px -10px -14px 10px}}
.acts{display:flex;flex-wrap:wrap;align-items:center;gap:14px 22px}.acts .note{font-size:14px;color:var(--mut)}
.h-ed{padding-top:150px}.h-ed .top{display:grid;grid-template-columns:repeat(12,1fr);gap:24px;align-items:end}
.h-ed .disp{grid-column:1/-1;font-size:calc(clamp(3.2rem,9.4vw,9.6rem) * var(--ds))}.h-ed .meta{grid-column:1/6;margin-top:40px}.h-ed .meta .acts{margin-top:30px}
.h-ed .img{grid-column:6/-1;margin-top:40px}.h-ed .img img{width:100%;aspect-ratio:16/10;object-fit:cover;border-radius:var(--ri)}
.h-ed figcaption{display:flex;justify-content:space-between;gap:16px;font-size:13px;color:var(--mut);padding-top:12px;border-top:1px solid var(--line);margin-top:14px}
@media(max-width:900px){.h-ed .meta,.h-ed .img{grid-column:1/-1}}
.h-mos{padding-top:128px;padding-bottom:clamp(50px,7vw,100px)}.h-mos .w{display:grid;grid-template-columns:.9fr 1.1fr;gap:clamp(30px,5vw,80px);align-items:center}
.mos{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:1fr 1fr;gap:14px;height:min(78vh,720px)}.mos img{width:100%;height:100%;object-fit:cover;border-radius:var(--ri)}.mos img:first-child{grid-row:1/3}
.h-mos .lede{margin-top:26px}.h-mos .acts{margin-top:36px}
@media(max-width:900px){.h-mos .w{grid-template-columns:1fr}.mos{height:auto;grid-template-rows:auto}.mos img{aspect-ratio:1}.mos img:first-child{grid-row:auto;grid-column:1/-1;aspect-ratio:4/3}}
.h-type{min-height:max(620px,94svh);display:flex;align-items:flex-end;background:var(--deep);color:var(--deepInk);overflow:hidden;isolation:isolate}
.h-type .art{position:absolute;inset:auto 0 0 0;z-index:-1;color:var(--acD);opacity:.9}.h-type .art svg{width:100%;height:auto;display:block}
.h-type .w{padding-bottom:clamp(170px,22vw,300px);padding-top:150px}.h-type .eb{color:var(--deepMut)}.h-type .lede{color:var(--deepMut);margin-top:26px}.h-type .disp em{color:var(--acD)}
.h-type .acts{margin-top:36px}.h-type .btn:not(.gh),.sec.dk .btn:not(.gh){background:var(--dBtn);color:var(--dBtnI);border-color:var(--dBtn)}.h-type .btn.gh{color:var(--deepInk)}
/* facts */
.facts{border-block:1px solid var(--line)}.facts ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr))}
.facts li{padding:30px 24px 28px;border-left:1px solid var(--line)}.facts li:first-child{border-left:0;padding-left:0}
.facts b{display:block;font:var(--dw) calc(2.4rem * var(--ds))/1 var(--fd);letter-spacing:var(--dt);text-transform:var(--dc)}.facts span{display:block;margin-top:10px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--mut)}
@media(max-width:700px){.facts li{border-left:0;border-top:1px solid var(--line);padding-left:0}.facts li:first-child{border-top:0}}
/* story */
.st-lede .w{display:grid;grid-template-columns:5fr 7fr;gap:clamp(30px,6vw,110px)}.st-lede .txt{column-gap:48px}.st-pull .txt.cols{columns:2 300px}.st-pull .txt:not(.cols){max-width:34em;text-align:center}
.st-lede .txt p:first-child::first-letter{float:left;font:var(--dw) 4.6em/.82 var(--fd);padding:.06em .1em 0 0;color:var(--acT)}
.st-pull{text-align:center}.st-pull blockquote{margin:0 auto;max-width:18em;font-size:calc(clamp(2rem,4.2vw,3.8rem) * var(--ds))}.st-pull .txt{max-width:720px;margin:56px auto 0;text-align:left;columns:2 300px;column-gap:48px}
@media(max-width:900px){.st-lede .w{grid-template-columns:1fr}}
/* highlights */
.hl-num .hd{display:flex;justify-content:space-between;align-items:end;gap:30px;margin-bottom:64px}.hl-num ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));border-top:1px solid var(--line)}
.hl-num li{padding:34px 34px 10px 0;border-right:1px solid var(--line);margin-right:34px}.hl-num li:last-child{border-right:0}
.hl-num .n{font:var(--dw) 3.4rem/1 var(--fd);color:var(--acT);display:block;margin-bottom:28px;font-variant-numeric:lining-nums}
.hl-num h3{margin-bottom:12px}
@media(max-width:700px){.hl-num li{border-right:0;border-bottom:1px solid var(--line);margin-right:0}}
.hl-pan .row{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,100px);align-items:center}.hl-pan .row+.row{margin-top:clamp(70px,9vw,140px)}
.hl-pan .row:nth-child(even) .pic{order:2}.hl-pan .pic img{width:100%;aspect-ratio:5/4;object-fit:cover;border-radius:var(--ri)}.hl-pan .n{font-size:13px;letter-spacing:.18em;color:var(--acT);font-weight:600;display:block;margin-bottom:22px}
.hl-pan h3{font-size:calc(clamp(1.9rem,3.4vw,3rem) * var(--ds));margin-bottom:20px}
@media(max-width:900px){.hl-pan .row{grid-template-columns:1fr}.hl-pan .row:nth-child(even) .pic{order:0}}
/* gallery */
.gal .hd{display:flex;justify-content:space-between;align-items:end;gap:20px;margin-bottom:48px}
.grid{display:grid;grid-template-columns:repeat(6,1fr);grid-auto-rows:clamp(130px,13vw,200px);gap:14px}
.grid button{padding:0;border:0;background:none;cursor:zoom-in;overflow:hidden;border-radius:var(--ri)}.grid img{width:100%;height:100%;object-fit:cover;transition:transform 1.2s cubic-bezier(.2,.7,.1,1)}.grid button:hover img{transform:scale(1.04)}
.grid button:nth-child(7n+1){grid-column:span 4;grid-row:span 3}.grid button:nth-child(7n+2){grid-column:span 2;grid-row:span 2}.grid button:nth-child(7n+3){grid-column:span 2;grid-row:span 1}
.grid button:nth-child(7n+4),.grid button:nth-child(7n+5),.grid button:nth-child(7n+6){grid-column:span 2;grid-row:span 2}.grid button:nth-child(7n+7){grid-column:span 6;grid-row:span 3}
@media(max-width:760px){.grid{grid-template-columns:1fr 1fr;grid-auto-rows:150px}.grid button:nth-child(n){grid-column:span 1;grid-row:span 1}.grid button:nth-child(3n+1){grid-column:span 2;grid-row:span 2}}
.strip{display:flex;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding-inline:clamp(20px,5vw,64px);scrollbar-width:none}.strip::-webkit-scrollbar{display:none}
.strip figure{margin:0;flex:0 0 min(78vw,760px);scroll-snap-align:center}.strip img{width:100%;aspect-ratio:3/2;object-fit:cover;border-radius:var(--ri)}.strip figcaption{font-size:13px;color:var(--mut);padding-top:12px}
dialog.lb{border:0;padding:0;background:transparent;max-width:min(94vw,1500px);max-height:92vh}dialog.lb::backdrop{background:rgba(10,10,10,.9)}dialog.lb img{max-height:88vh;width:auto;margin:auto}
dialog.lb p{color:#ddd;font-size:14px;text-align:center;margin:12px 0 0}
/* amenities */
.am .w{display:grid;grid-template-columns:4fr 8fr;gap:clamp(30px,6vw,110px)}.am ul{list-style:none;margin:0;padding:0;columns:2 220px;column-gap:40px}
.am li{break-inside:avoid;padding:15px 0;border-bottom:1px solid var(--line);display:flex;gap:14px;align-items:baseline}.am li::before{content:"";flex:0 0 7px;height:7px;border-radius:50%;background:var(--ac);transform:translateY(-2px)}
.am .tm{margin-top:42px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:16px}.am .tm div{padding:20px;border:1px solid var(--line);border-radius:var(--r)}.am .tm b{display:block;font:var(--dw) 1.5rem/1.1 var(--fd)}.am .tm span{font-size:13px;color:var(--mut)}
.am .rules{margin-top:34px;font-size:15px;color:var(--mut)}.am .rules li{border:0;padding:6px 0}.am .rules li::before{background:var(--line)}
@media(max-width:900px){.am .w{grid-template-columns:1fr}}
/* reviews */
.rv .score{display:flex;align-items:baseline;gap:22px;flex-wrap:wrap;margin-bottom:64px}.rv .score b{font:var(--dw) calc(clamp(4rem,9vw,8rem) * var(--ds))/.9 var(--fd);letter-spacing:var(--dt)}
.stars{color:var(--acT);letter-spacing:.12em;font-size:15px}
.wall{columns:3 300px;column-gap:24px}.wall figure{break-inside:avoid;margin:0 0 24px;padding:34px;border:1px solid var(--line);border-radius:var(--r);background:color-mix(in srgb,var(--bg) 70%,var(--bg2))}
.wall blockquote{margin:16px 0 20px;font-size:17px;line-height:1.6}.wall figcaption{font-size:14px;color:var(--mut)}
.feat blockquote{margin:0;font-size:calc(clamp(1.9rem,3.6vw,3.3rem) * var(--ds));max-width:22em}.feat figcaption{margin-top:30px;color:var(--mut)}.feat .more{margin-top:70px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:40px;border-top:1px solid var(--line);padding-top:40px}
.feat .more blockquote{font:400 16px/1.6 var(--ft);margin:10px 0}
/* area */
.ar .w{display:grid;grid-template-columns:4fr 8fr;gap:clamp(30px,6vw,110px)}.ar ol{list-style:none;margin:0;padding:0;counter-reset:a}
.ar li{display:grid;grid-template-columns:1fr auto;gap:6px 30px;padding:26px 0;border-bottom:1px solid var(--line)}.ar li:first-child{border-top:1px solid var(--line)}
.ar li b{font:var(--dw) calc(1.65rem * var(--ds))/1.15 var(--fd);letter-spacing:var(--dt);text-transform:var(--dc)}.ar li .far{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--acT);font-weight:600;align-self:center}
.ar li p{grid-column:1/-1;margin:0;color:var(--mut)}
@media(max-width:900px){.ar .w{grid-template-columns:1fr}}
/* host */
.ho .w{display:grid;grid-template-columns:auto 1fr;gap:clamp(24px,5vw,70px);align-items:center;max-width:1040px}
.mono{width:clamp(96px,12vw,150px);aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:var(--ac);color:var(--acInk);font:var(--dw) calc(clamp(2.4rem,4vw,3.6rem) * var(--ds))/1 var(--fd)}
.ho blockquote{margin:0 0 18px;font-size:calc(clamp(1.6rem,2.8vw,2.5rem) * var(--ds))}
@media(max-width:640px){.ho .w{grid-template-columns:1fr}}
/* booking */
.bk .w{display:grid;grid-template-columns:5fr 6fr;gap:clamp(30px,6vw,100px);align-items:start}
.bk .save{margin-top:34px;padding:22px 24px;border:1px solid var(--deepLine);border-radius:var(--r);font-size:15px}.bk .save b{color:var(--deepInk)}
.card{background:var(--bg);color:var(--ink);border-radius:max(var(--r),6px);padding:clamp(20px,3vw,34px);box-shadow:0 40px 80px -40px rgba(0,0,0,.45)}
.card h3{font:600 15px/1.3 var(--ft);margin:0 0 14px;display:flex;justify-content:space-between;align-items:center}
.cal{display:grid;grid-template-columns:1fr 1fr;gap:26px}.cal .mo b{display:block;text-align:center;font-weight:600;font-size:14px;margin-bottom:10px}
.cal .dw,.cal .dd{display:grid;grid-template-columns:repeat(7,1fr);text-align:center}.cal .dw span{font-size:11px;color:var(--mut);letter-spacing:.08em;padding-bottom:6px}
.cal .dd button{aspect-ratio:1;border:0;background:none;font-size:14px;border-radius:999px;cursor:pointer;position:relative;font-variant-numeric:tabular-nums}
.cal .dd button:hover:not(:disabled):not(.a):not(.b){background:var(--bg2)}.cal .dd button:disabled{color:color-mix(in srgb,var(--mut) 55%,transparent);text-decoration:line-through;cursor:not-allowed}
.cal .dd button.in{background:color-mix(in srgb,var(--ac) 16%,transparent);border-radius:0}.cal .dd button.a,.cal .dd button.b{background:var(--ac);color:var(--acInk)}
.cal .nv{display:flex;gap:8px}.cal-btn{width:36px;height:36px;border-radius:999px;border:1px solid var(--line);background:none;cursor:pointer}
@media(max-width:560px){.cal{grid-template-columns:1fr}.cal .mo+.mo{display:none}}
.fr{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:18px}.fr label{display:grid;gap:6px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);font-weight:600}
.fr input,.fr select{min-height:48px;padding:0 14px;border:1px solid var(--line);border-radius:max(var(--r),6px);background:var(--bg);font-size:16px;text-transform:none;letter-spacing:0;font-weight:400;color:var(--ink)}
.fr .full{grid-column:1/-1}.chk{display:flex!important;gap:10px;align-items:flex-start;text-transform:none!important;letter-spacing:0!important;font-weight:400!important;font-size:14px!important;color:var(--mut)}.chk input{min-height:0;margin-top:3px}
.qt{margin-top:18px;border-top:1px solid var(--line);padding-top:14px;font-size:15px}.qt div{display:flex;justify-content:space-between;padding:4px 0}.qt .tot{font-weight:600;font-size:17px;border-top:1px solid var(--line);margin-top:8px;padding-top:12px}
.qt .err{color:#B3261E}.card .btn{width:100%;margin-top:18px}.card .btn+.btn{margin-top:10px}.card .fine{font-size:13px;color:var(--mut);margin:12px 0 0;text-align:center}
.ok{padding:30px 6px;text-align:center}.ok b{display:block;font:var(--dw) 2rem/1.1 var(--fd);margin-bottom:10px}
@media(max-width:900px){.bk .w{grid-template-columns:1fr}}
/* faq */
.fq .w{display:grid;grid-template-columns:4fr 8fr;gap:clamp(30px,6vw,110px)}.fq details{border-bottom:1px solid var(--line)}.fq details:first-child{border-top:1px solid var(--line)}
.fq summary{list-style:none;cursor:pointer;padding:24px 44px 24px 0;position:relative;font:var(--dw) calc(1.3rem * var(--ds))/1.3 var(--fd);letter-spacing:var(--dt)}.fq summary::-webkit-details-marker{display:none}
.fq summary::after{content:"";position:absolute;right:6px;top:50%;width:14px;height:14px;margin-top:-7px;background:linear-gradient(currentColor,currentColor) center/14px 1.5px no-repeat,linear-gradient(currentColor,currentColor) center/1.5px 14px no-repeat;transition:transform .35s}
.fq details[open] summary::after{transform:rotate(45deg)}.fq details p{color:var(--mut);padding-bottom:22px;margin:0;max-width:44em}
@media(max-width:900px){.fq .w{grid-template-columns:1fr}}
/* closing + footer */
.cl{position:relative;min-height:70vh;display:flex;align-items:center;justify-content:center;text-align:center;color:#fff;overflow:hidden;isolation:isolate}.cl img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2}
.cl::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.45);z-index:-1}.cl.np{background:var(--ac);color:var(--acInk)}.cl.np::before{display:none}.cl .disp{max-width:14em;margin:0 auto 34px}.cl .btn{background:#fff;color:#111;border-color:#fff}
.ft{background:var(--deep);color:var(--deepInk);padding:clamp(70px,9vw,120px) 0 40px}.ft .big{font-size:calc(clamp(3rem,10vw,10rem) * var(--ds));margin-bottom:60px}
.ft .cols{display:flex;flex-wrap:wrap;justify-content:space-between;gap:24px;border-top:1px solid var(--deepLine);padding-top:26px;font-size:14px;color:var(--deepMut)}.ft a{text-decoration:none}.ft a:hover{text-decoration:underline}
.mbar{display:none}
@media(max-width:820px){.mbar{display:flex;position:fixed;left:12px;right:12px;bottom:12px;z-index:60;align-items:center;justify-content:space-between;gap:12px;padding:10px 10px 10px 20px;border-radius:max(var(--rb),12px);background:var(--ink);color:var(--bg);box-shadow:0 18px 40px -16px rgba(0,0,0,.5);transform:translateY(140%);transition:transform .5s cubic-bezier(.2,.7,.1,1)}.mbar.on{transform:none}.mbar b{font:var(--dw) 1.3rem/1 var(--fd)}.mbar small{display:block;font-size:12px;opacity:.75}.mbar .btn{min-height:44px}body{padding-bottom:0}}
/* funnel pages */
.fn-hero{padding-top:130px;padding-bottom:clamp(60px,8vw,110px)}.fn-hero .w{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(30px,6vw,90px);align-items:center}
.fn-hero .lede{margin-top:26px}.fn-form{margin-top:34px;display:grid;gap:12px;max-width:520px}.fn-form .fr{margin:0}
.fn-pts{list-style:none;margin:30px 0 0;padding:0;display:grid;gap:12px}.fn-pts li{display:flex;gap:14px;align-items:baseline}.fn-pts li::before{content:"";flex:0 0 8px;height:8px;border-radius:50%;background:var(--ac)}
.code{display:inline-block;margin:18px 0 6px;padding:14px 22px;border:1.5px dashed var(--ac);border-radius:var(--r);font:600 1.6rem/1 var(--ft);letter-spacing:.14em;color:var(--acT)}
.urg{display:inline-flex;gap:10px;align-items:center;font-size:13px;letter-spacing:.12em;text-transform:uppercase;font-weight:600;color:var(--acT)}
@media(max-width:900px){.fn-hero .w{grid-template-columns:1fr}}
/* reveal */
.js [data-rv]{opacity:0;transform:translateY(26px);transition:opacity 1.1s cubic-bezier(.2,.7,.1,1),transform 1.1s cubic-bezier(.2,.7,.1,1)}.js [data-rv].in{opacity:1;transform:none}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.js [data-rv]{opacity:1;transform:none}html{scroll-behavior:auto}}
`;

// Styles for the extra section layouts and nav styles.
const MORE = `
/* nav styles */
.nav.n-cen .w{display:grid;grid-template-columns:1fr auto 1fr}.nav.n-cen ul{justify-self:start}.nav.n-cen .wm{justify-self:center}.nav.n-cen .btn{justify-self:end}
.nav.n-min .w{height:86px}.nav.n-min .wm{font-size:calc(1.35rem * var(--ds));letter-spacing:.14em;text-transform:uppercase}
@media(max-width:900px){.nav.n-cen .w{display:flex}}
/* hero: centred */
.h-cen{padding-top:clamp(130px,15vw,190px);text-align:center}.h-cen .eb{justify-content:center}.h-cen .eb::after{content:"";width:28px;height:1px;background:currentColor;opacity:.7}
.h-cen .disp{max-width:15em;margin-inline:auto}.h-cen .lede{margin:28px auto 0}.h-cen .acts{justify-content:center;margin-top:36px}
.h-cen .wide{margin:clamp(52px,7vw,96px) auto 0;padding-inline:clamp(20px,5vw,64px);max-width:1440px}.h-cen .wide img{width:100%;aspect-ratio:21/9;object-fit:cover;border-radius:var(--ri)}
@media(max-width:760px){.h-cen .wide img{aspect-ratio:4/3}}
/* hero: framed */
.h-frm{padding:92px clamp(10px,1.6vw,22px) 0}.h-frm .ph{border-radius:max(var(--ri),2px);overflow:hidden;height:min(84svh,880px);min-height:520px}.h-frm .ph img{width:100%;height:100%;object-fit:cover}
.h-frm .w{position:relative;z-index:2}.h-frm .panel{background:var(--bg);max-width:740px;margin-top:calc(-1 * clamp(150px,20vw,280px));padding:clamp(28px,4vw,60px) clamp(24px,4vw,60px) 0 0;border-radius:0 var(--r) 0 0;position:relative}
.h-frm .panel::before{content:"";position:absolute;inset:0 0 0 -100vw;background:var(--bg);z-index:-1;border-radius:inherit}
.h-frm .h1{font-size:calc(clamp(2.7rem,6vw,6rem) * var(--ds))}.h-frm .lede{margin-top:24px}.h-frm .acts{margin-top:32px}
@media(max-width:760px){.h-frm .ph{height:62svh;min-height:380px}.h-frm .panel{margin-top:-70px;padding-top:28px}}
/* hero: arch */
.h-arch{padding-top:clamp(120px,13vw,160px);padding-bottom:clamp(60px,8vw,110px)}.h-arch .w{display:grid;grid-template-columns:1.1fr .9fr;gap:clamp(36px,6vw,96px);align-items:center}
.h-arch .lede{margin-top:28px}.h-arch .acts{margin-top:40px}.h-arch .ar-w{position:relative;max-width:520px;justify-self:end;width:100%}
.h-arch .main{width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:999px 999px var(--ri) var(--ri)}
.h-arch .sub{position:absolute;left:-14%;bottom:8%;width:38%;aspect-ratio:1;object-fit:cover;border-radius:50%;border:8px solid var(--bg)}
.h-arch .badge{position:absolute;right:-4%;top:12%;width:112px;height:112px;border-radius:50%;background:var(--ac);color:var(--acInk);display:grid;place-items:center;text-align:center;font:600 12px/1.25 var(--ft);letter-spacing:.06em;transform:rotate(-8deg)}
.h-arch .badge b{display:block;font:var(--dw) 1.6rem/1 var(--fd)}
@media(max-width:900px){.h-arch .w{grid-template-columns:1fr}.h-arch .ar-w{justify-self:center;max-width:420px}.h-arch .sub{left:-6%}}
/* facts: tiles and one line */
.facts.ft-tiles{border:0;padding-block:clamp(28px,4vw,56px)}.ft-tiles ul{gap:12px;grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.ft-tiles li,.ft-tiles li:first-child{border:0;padding:26px 24px;background:var(--bg2);border-radius:var(--r)}
.facts.ft-inline{border-block:0;padding-block:clamp(24px,3vw,40px)}.ft-inline ul{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 0}.ft-inline li,.ft-inline li:first-child{border:0;padding:6px 22px;display:flex;align-items:baseline;gap:9px}
.ft-inline li+li{border-left:1px solid var(--line)}.ft-inline b{display:inline;font-size:calc(1.6rem * var(--ds))}.ft-inline span{display:inline;margin:0}
@media(max-width:700px){.ft-inline li+li{border-left:0;border-top:0}}
/* story with a photo */
.st-ph .w{display:grid;grid-template-columns:1fr 1fr;gap:clamp(30px,6vw,110px);align-items:center}.st-ph .pic img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--ri)}.st-ph .h2{margin-bottom:28px}
@media(max-width:900px){.st-ph .w{grid-template-columns:1fr}}
/* highlight cards */
.hl-cards .hd{margin-bottom:56px;max-width:720px}.hl-cards ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.hl-cards li{background:var(--bg);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;display:flex;flex-direction:column}.hl-cards img{width:100%;aspect-ratio:4/3;object-fit:cover}
.hl-cards .bd{padding:28px 28px 30px}.hl-cards .n{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--acT);font-weight:600;display:block;margin-bottom:14px}.hl-cards h3{margin-bottom:12px}
/* masonry gallery */
.msn{columns:3 260px;column-gap:14px}.msn button{display:block;width:100%;padding:0;border:0;background:none;margin:0 0 14px;cursor:zoom-in;overflow:hidden;border-radius:var(--ri);break-inside:avoid}
.msn img{width:100%;height:auto;transition:transform 1.2s cubic-bezier(.2,.7,.1,1)}.msn button:nth-child(3n+1) img{aspect-ratio:4/5;object-fit:cover}.msn button:nth-child(3n+2) img{aspect-ratio:1;object-fit:cover}.msn button:nth-child(3n) img{aspect-ratio:3/2;object-fit:cover}.msn button:hover img{transform:scale(1.04)}
/* amenity tiles */
.am.am-t .w{grid-template-columns:1fr}.am.am-t .hd{margin-bottom:44px;max-width:720px}.am.am-t ul.tl{columns:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:12px}
.am.am-t ul.tl li{border:1px solid var(--line);border-radius:var(--r);padding:20px 20px;background:color-mix(in srgb,var(--bg) 60%,transparent)}
/* reviews: colour band and cards */
.rv-band{text-align:center}.rv-band .eb{justify-content:center}.rv-band .score{justify-content:center}.rv-band blockquote{margin:0 auto;max-width:20em;font-size:calc(clamp(1.9rem,3.8vw,3.4rem) * var(--ds))}.rv-band figcaption{margin-top:28px;color:var(--deepMut)}
.rv-band .stars{color:var(--acD)}.rv-band .more{margin:64px auto 0;max-width:1000px;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:36px;text-align:left;border-top:1px solid var(--deepLine);padding-top:36px}.rv-band .more blockquote{font:400 16px/1.6 var(--ft);margin:10px 0;max-width:none}
.rv-cards .row{display:flex;gap:18px;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:12px;scrollbar-width:thin}
.rv-cards figure{flex:0 0 min(84vw,390px);scroll-snap-align:start;margin:0;padding:32px;border-radius:var(--r);background:var(--bg2);display:flex;flex-direction:column}.rv-cards blockquote{margin:16px 0 22px;flex:1}.rv-cards figcaption{font-weight:600;font-size:14px}
/* area cards */
.ar-c .hd{max-width:720px;margin-bottom:52px}.ar-c ol{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:18px}
.ar-c li{padding:30px 28px;border-radius:var(--r);border:1px solid var(--line);display:flex;flex-direction:column;gap:12px}.ar-c li .i{font:var(--dw) 2.4rem/1 var(--fd);color:var(--acT)}
.ar-c li b{font:var(--dw) calc(1.55rem * var(--ds))/1.15 var(--fd);letter-spacing:var(--dt);text-transform:var(--dc)}.ar-c .far{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--acT);font-weight:600}.ar-c li p{margin:0;color:var(--mut)}
/* host: centred */
.ho-c{text-align:center}.ho-c .w{display:block;max-width:880px}.ho-c .mono{margin:0 auto 30px}.ho-c .eb{justify-content:center}
/* booking: centred on the page colour */
.bk-c .w{display:block;max-width:900px}.bk-c .hd{text-align:center;max-width:680px;margin:0 auto 46px}.bk-c .eb{justify-content:center}.bk-c .card{border:1px solid var(--line);box-shadow:0 30px 70px -40px rgba(0,0,0,.35)}
.bk-c .save{margin:22px auto 0;border-color:var(--line);display:inline-block}.bk-c .save b{color:var(--acT)}
/* faq: columns and centred */
.fq-cols .hd{max-width:720px;margin-bottom:52px}.fq-cols dl{margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:34px 56px}.fq-cols dt{font:var(--dw) calc(1.3rem * var(--ds))/1.3 var(--fd);letter-spacing:var(--dt);margin-bottom:10px}.fq-cols dd{margin:0;color:var(--mut)}
.fq-cols dl>div{border-top:1px solid var(--line);padding-top:22px}
.fq-c .w{display:block;max-width:860px}.fq-c .hd{text-align:center;margin-bottom:46px}.fq-c .eb{justify-content:center}
/* closing: split and minimal */
.cl-split{display:grid;grid-template-columns:1fr 1fr;min-height:64vh;background:var(--deep);color:var(--deepInk)}.cl-split .pic img{width:100%;height:100%;object-fit:cover;border-radius:0}
.cl-split .tx{display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:clamp(40px,7vw,110px)}.cl-split .disp{margin-bottom:34px;max-width:11em}.cl-split .disp em{color:var(--acD)}.cl-split .btn:not(.gh){background:var(--dBtn);color:var(--dBtnI);border-color:var(--dBtn)}
@media(max-width:820px){.cl-split{grid-template-columns:1fr}.cl-split .pic img{aspect-ratio:4/3}}
.cl-min{text-align:center;background:var(--bg2)}.cl-min .disp{max-width:13em;margin:0 auto 34px}
`;

/* ---------- line art for type-led heroes (no photos yet) ---------- */
function art(kind) {
  const s = 'fill="none" stroke="currentColor" stroke-width="1.4" vector-effect="non-scaling-stroke"';
  if (/beach|lake|harbour|cottage/.test(kind) && kind !== 'cottage') return '<svg viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true"><path ' + s + ' d="M0 150 C120 130 240 170 360 150 S600 130 720 150 960 170 1080 150 1320 130 1440 150"/><path ' + s + ' opacity=".6" d="M0 195 C140 178 260 210 400 195 S660 178 800 195 1060 210 1200 195 1360 182 1440 190"/><path ' + s + ' opacity=".35" d="M0 240 C160 226 300 252 460 240 S760 226 920 240 1220 252 1440 236"/><circle ' + s + ' cx="1110" cy="70" r="34"/></svg>';
  if (/town|apartment|city/.test(kind)) return '<svg viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true"><path ' + s + ' d="M0 300 V210 H90 V150 L130 120 L170 150 V210 H250 V130 H330 V210 H420 V90 L470 60 L520 90 V210 H610 V160 H700 V100 H760 V160 H850 V210 H960 V120 L1010 80 L1060 120 V210 H1150 V150 H1240 V200 H1330 V140 L1385 110 L1440 140 V300"/><path ' + s + ' opacity=".4" d="M0 250 H1440"/></svg>';
  return '<svg viewBox="0 0 1440 300" preserveAspectRatio="none" aria-hidden="true"><path ' + s + ' d="M0 260 L180 120 L300 200 L470 60 L640 210 L760 140 L930 250 L1080 110 L1250 220 L1440 130"/><path ' + s + ' opacity=".55" d="M0 290 L220 190 L380 250 L560 160 L760 270 L980 180 L1180 270 L1440 200"/><circle ' + s + ' opacity=".8" cx="1180" cy="64" r="30"/></svg>';
}

/* ---------- section renderers ---------- */
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
function headline(c, cls) {
  const raw = String(c || '').trim(); const parts = raw.includes('\n') ? raw.split('\n') : [raw];
  // *word* in the headline is set in the display italic or accent: one emphasis per headline at most
  const fmt = t => esc(t).replace(/\*([^*]{1,40})\*/, '<em>$1</em>').replace(/\*/g, '');
  return '<h1 class="disp ' + (cls || 'h1') + '">' + parts.slice(0, 3).map(x => '<span class="ln"><span>' + fmt(x) + '</span></span>').join('') + '</h1>';
}
const fmtInline = t => esc(t).replace(/\*([^*]{1,40})\*/, '<em>$1</em>').replace(/\*/g, '');
const img = (ph, attrs) => ph ? '<img src="' + esc(ph.url) + '" alt="' + esc(ph.alt || ph.cap || '') + '" ' + (attrs || 'loading="lazy" decoding="async"') + '>' : '';
const secHd = (eb, title, cls) => '<div class="hd' + (cls ? ' ' + cls : '') + '"><p class="eb" data-rv>' + esc(eb) + '</p><h2 class="disp h2" data-rv>' + fmtInline(title) + '</h2></div>';
const ctaBtn = (c, ghost) => '<a class="btn' + (ghost ? ' gh' : '') + '" href="#book">' + esc(c || 'Check dates') + ARROW + '</a>';

const R = {
  hero(sec, f, c, ctx) {
    const v = sec.variant, ph = f.photos, eb = '<p class="eb fade">' + esc(c.tagline || f.town + ' · ' + f.kind) + '</p>';
    const from = '<span class="note">From <b class="num">' + money(f.nightly) + '</b> a night · no booking fees</span>';
    if (v === 'cinematic' && ph[0]) return '<header class="hero h-cin" id="top"><div class="bgimg zoom">' + img(ph[0], 'fetchpriority="high" decoding="async"') + '</div><div class="w"><div>' + eb + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p></div>' +
      '<div class="pill fade"><div><small>From</small><b class="num">' + money(f.nightly) + '</b> <small style="display:inline">/ night</small></div>' + ctaBtn(c.cta) + '</div></div></header>';
    if (v === 'split' && ph[0]) return '<header class="hero h-split" id="top"><div class="w"><div>' + eb + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p><div class="acts fade">' + ctaBtn(c.cta) + from + '</div></div>' +
      '<figure class="frame fade" style="margin:0">' + img(ph[0], 'fetchpriority="high" decoding="async"') + (ph[0].cap ? '<figcaption>' + esc(ph[0].cap) + '</figcaption>' : '') + '</figure></div></header>';
    if (v === 'editorial' && ph[0]) return '<header class="hero h-ed" id="top"><div class="w"><div class="top">' + '<div style="grid-column:1/-1">' + eb + '</div>' + headline(c.headline) +
      '<div class="meta fade"><p class="lede">' + esc(c.subhead) + '</p><div class="acts">' + ctaBtn(c.cta) + '</div><p class="note mut" style="margin-top:18px;font-size:14px">From <b class="num">' + money(f.nightly) + '</b> a night · sleeps ' + f.maxGuests + '</p></div>' +
      '<figure class="img fade" style="margin:0">' + img(ph[0], 'fetchpriority="high" decoding="async"') + '<figcaption><span>' + esc(ph[0].cap || f.name) + '</span><span>' + esc(f.town) + '</span></figcaption></figure></div></div></header>';
    if (v === 'mosaic' && ph.length >= 3) return '<header class="hero h-mos" id="top"><div class="w"><div>' + eb + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p><div class="acts fade">' + ctaBtn(c.cta) + from + '</div></div>' +
      '<div class="mos fade">' + ph.slice(0, 3).map((x, i) => img(x, i ? 'loading="lazy"' : 'fetchpriority="high"')).join('') + '</div></div></header>';
    if (v === 'centered' && ph[0]) return '<header class="hero h-cen" id="top"><div class="w">' + eb.replace('class="eb fade"', 'class="eb fade"') + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p><div class="acts fade">' + ctaBtn(c.cta) + from + '</div></div>' +
      '<figure class="wide fade" style="margin-bottom:0">' + img(ph[0], 'fetchpriority="high" decoding="async"') + '</figure></header>';
    if (v === 'framed' && ph[0]) return '<header class="hero h-frm" id="top"><div class="ph zoom">' + img(ph[0], 'fetchpriority="high" decoding="async"') + '</div><div class="w"><div class="panel">' + eb + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p><div class="acts fade">' + ctaBtn(c.cta) + from + '</div></div></div></header>';
    if (v === 'arch' && ph[0]) return '<header class="hero h-arch" id="top"><div class="w"><div>' + eb + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p><div class="acts fade">' + ctaBtn(c.cta) + from + '</div></div>' +
      '<div class="ar-w fade">' + img(ph[0], 'class="main" fetchpriority="high" decoding="async"') + (ph[1] ? img(ph[1], 'class="sub" loading="lazy"') : '') + '<span class="badge" aria-hidden="true"><span><b class="num">' + f.maxGuests + '</b>guests</span></span></div></div></header>';
    // type-led: no photographs yet (or the chosen layout needs more than we have)
    return '<header class="hero h-type" id="top"><div class="art fade">' + art(ctx.kindHint || f.kind) + '</div><div class="w">' + eb.replace('class="eb', 'class="eb') + headline(c.headline) + '<p class="lede fade">' + esc(c.subhead) + '</p><div class="acts fade">' + ctaBtn(c.cta) + '<span class="note" style="color:var(--deepMut)">From <b class="num">' + money(f.nightly) + '</b> a night · no booking fees</span></div></div></header>';
  },
  facts(sec, f) {
    const cells = [[f.maxGuests, 'Guests'], [f.bedrooms, f.bedrooms === 1 ? 'Bedroom' : 'Bedrooms'], [f.baths, f.baths === 1 ? 'Bathroom' : 'Bathrooms'], [money(f.nightly), 'From, a night'], [f.pets ? 'Yes' : 'No', 'Dogs welcome'], [f.minNights, 'Night minimum']];
    const cls = sec.variant === 'tiles' ? ' ft-tiles' : sec.variant === 'inline' ? ' ft-inline' : '';
    return '<section class="facts' + cls + '" aria-label="At a glance"><div class="w"><ul>' + cells.map(x => '<li data-rv><b class="num">' + esc(x[0]) + '</b><span>' + x[1] + '</span></li>').join('') + '</ul></div></section>';
  },
  story(sec, f, c) {
    const paras = (c.story && c.story.length ? c.story : [f.about]).filter(Boolean).map(x => '<p>' + esc(x) + '</p>').join('');
    const sp = f.photos[1] || f.photos[0];
    if (sec.variant === 'photo' && sp) return '<section class="sec st-ph" id="stay"><div class="w"><div class="pic" data-rv>' + img(sp) + '</div><div><p class="eb" data-rv>' + esc(c.storyEyebrow || 'The stay') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.storyTitle || f.name) + '</h2><div class="txt" data-rv>' + paras + '</div></div></div></section>';
    if (sec.variant === 'pull') return '<section class="sec st-pull" id="stay"><div class="w"><p class="eb" data-rv>' + esc(c.storyEyebrow || 'The stay') + '</p><blockquote class="disp" data-rv>' + fmtInline(c.pull || c.storyTitle || f.headline) + '</blockquote><div class="txt' + ((c.story || []).join(' ').length > 520 ? ' cols' : '') + '" data-rv>' + paras + '</div></div></section>';
    return '<section class="sec st-lede" id="stay"><div class="w"><div><p class="eb" data-rv>' + esc(c.storyEyebrow || 'The stay') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.storyTitle || f.name) + '</h2></div><div class="txt lede" style="max-width:none;color:var(--ink)" data-rv>' + paras + '</div></div></section>';
  },
  highlights(sec, f, c) {
    const items = (c.highlights || []).slice(0, 4); if (!items.length) return '';
    if (sec.variant === 'panels' && f.photos.length >= 3) {
      const pics = f.photos.slice(1).concat(f.photos);
      return '<section class="sec hl-pan alt"><div class="w">' + items.slice(0, 3).map((h, i) => '<div class="row"><div class="pic" data-rv>' + img(pics[i]) + '</div><div data-rv><span class="n">' + String(i + 1).padStart(2, '0') + ' — ' + esc(h.eyebrow || '') + '</span><h3 class="disp">' + fmtInline(h.title) + '</h3><p class="lede">' + esc(h.text) + '</p></div></div>').join('') + '</div></section>';
    }
    if (sec.variant === 'cards') {
      const pics = f.photos.length >= 4 ? f.photos.slice(1).concat(f.photos) : [];
      return '<section class="sec hl-cards alt"><div class="w">' + secHd(c.highlightsEyebrow || 'Why guests come back', c.highlightsTitle || 'What makes it') + '<ol>' +
        items.map((h, i) => '<li data-rv>' + (pics[i] ? img(pics[i]) : '') + '<div class="bd"><span class="n">' + String(i + 1).padStart(2, '0') + (h.eyebrow ? ' · ' + esc(h.eyebrow) : '') + '</span><h3 class="disp h3">' + fmtInline(h.title) + '</h3><p class="mut" style="margin:0">' + esc(h.text) + '</p></div></li>').join('') + '</ol></div></section>';
    }
    return '<section class="sec hl-num"><div class="w"><div class="hd"><div><p class="eb" data-rv>' + esc(c.highlightsEyebrow || 'Why guests come back') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.highlightsTitle || 'What makes it') + '</h2></div></div><ol>' +
      items.map((h, i) => '<li data-rv><span class="n">' + String(i + 1).padStart(2, '0') + '</span><h3 class="disp h3">' + fmtInline(h.title) + '</h3><p class="mut">' + esc(h.text) + '</p></li>').join('') + '</ol></div></section>';
  },
  gallery(sec, f, c) {
    if (f.photos.length < 4) return '';
    const hd = '<div class="w"><div class="hd"><div><p class="eb" data-rv>' + esc(c.galleryEyebrow || 'Look around') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.galleryTitle || 'Inside and out') + '</h2></div><span class="mut num" data-rv>' + plural(f.photos.length, 'photo') + '</span></div></div>';
    if (sec.variant === 'masonry') return '<section class="sec gal" id="gallery">' + hd + '<div class="w"><div class="msn" data-rv>' + f.photos.slice(0, 15).map((x, i) => '<button type="button" data-lb="' + i + '" aria-label="Open photo: ' + esc(x.alt) + '">' + img(x) + '</button>').join('') + '</div></div>' +
      '<dialog class="lb" aria-label="Photo"><img alt=""><p></p></dialog></section>';
    if (sec.variant === 'strip') return '<section class="sec gal" id="gallery">' + hd + '<div class="strip" data-rv>' + f.photos.map(x => '<figure>' + img(x) + (x.cap ? '<figcaption>' + esc(x.cap) + '</figcaption>' : '') + '</figure>').join('') + '</div></section>';
    return '<section class="sec gal" id="gallery">' + hd + '<div class="w"><div class="grid" data-rv>' + f.photos.slice(0, 14).map((x, i) => '<button type="button" data-lb="' + i + '" aria-label="Open photo: ' + esc(x.alt) + '">' + img(x) + '</button>').join('') + '</div></div>' +
      '<dialog class="lb" aria-label="Photo"><img alt=""><p></p></dialog></section>';
  },
  amenities(sec, f, c) {
    if (!f.amenities.length) return '';
    const tm = [[f.checkin, 'Check-in from'], [f.checkout, 'Checkout by'], [plural(f.minNights, 'night'), 'Minimum stay']];
    const rules = (f.rules.length || f.parking ? '<ul class="rules" aria-label="House rules and parking">' + (f.parking ? '<li>Parking: ' + esc(f.parking) + '</li>' : '') + f.rules.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '');
    if (sec.variant === 'tiles') return '<section class="sec am am-t" id="details"><div class="w">' + secHd(c.amenitiesEyebrow || 'The details', c.amenitiesTitle || 'Everything you need') + '<div data-rv><ul class="tl">' + f.amenities.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul><div class="tm">' + tm.map(x => '<div><b>' + esc(x[0]) + '</b><span>' + x[1] + '</span></div>').join('') + '</div>' + rules + '</div></div></section>';
    return '<section class="sec am alt" id="details"><div class="w"><div><p class="eb" data-rv>' + esc(c.amenitiesEyebrow || 'The details') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.amenitiesTitle || 'Everything you need') + '</h2></div><div data-rv><ul>' +
      f.amenities.map(a => '<li>' + esc(a) + '</li>').join('') + '</ul><div class="tm">' + tm.map(x => '<div><b>' + esc(x[0]) + '</b><span>' + x[1] + '</span></div>').join('') + '</div>' +
      (f.rules.length || f.parking ? '<ul class="rules" aria-label="House rules and parking">' + (f.parking ? '<li>Parking: ' + esc(f.parking) + '</li>' : '') + f.rules.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '') + '</div></div></section>';
  },
  reviews(sec, f, c) {
    const rv = f.reviews; if (!rv.length && !(f.rating && f.reviewCount)) return '';
    const score = f.rating && f.reviewCount ? '<div class="score" data-rv><b class="num">' + Number(f.rating).toFixed(2) + '</b><div><span class="stars" aria-hidden="true">★★★★★</span><p class="mut" style="margin:6px 0 0">' + plural(f.reviewCount, 'review') + ' from guests who stayed</p></div></div>' : '';
    const hd = '<p class="eb" data-rv>' + esc(c.reviewsEyebrow || 'Guests say') + '</p>' + (score ? '' : '<h2 class="disp h2" data-rv style="margin-bottom:56px">' + fmtInline(c.reviewsTitle || 'In their words') + '</h2>');
    const fig = r => '<figure data-rv><span class="stars" aria-label="' + r.stars + ' out of 5">' + '★'.repeat(r.stars) + '</span><blockquote>' + esc(r.text) + '</blockquote><figcaption>' + esc(r.name) + '</figcaption></figure>';
    const note = f.live && rv.length ? '<p class="mut" style="font-size:13px;margin-top:20px">Every review is from a guest who stayed and chose to share it, whatever their rating.</p>' : '';
    if (sec.variant === 'feature' && rv.length) return '<section class="sec rv feat" id="reviews"><div class="w">' + hd + score + '<figure style="margin:0" data-rv><blockquote class="disp">“' + esc(rv[0].text) + '”</blockquote><figcaption>' + esc(rv[0].name) + ' · <span class="stars">' + '★'.repeat(rv[0].stars) + '</span></figcaption></figure>' +
      (rv.length > 1 ? '<div class="more">' + rv.slice(1, 4).map(r => '<figure style="margin:0" data-rv><span class="stars">' + '★'.repeat(r.stars) + '</span><blockquote>' + esc(r.text) + '</blockquote><figcaption class="mut">' + esc(r.name) + '</figcaption></figure>').join('') + '</div>' : '') + note + '</div></section>';
    if (sec.variant === 'band') return '<section class="sec rv rv-band dk" id="reviews"><div class="w"><p class="eb" data-rv>' + esc(c.reviewsEyebrow || 'Guests say') + '</p>' + score + (rv.length ? '<figure style="margin:0" data-rv><blockquote class="disp">“' + esc(rv[0].text) + '”</blockquote><figcaption>' + esc(rv[0].name) + ' · <span class="stars">' + '★'.repeat(rv[0].stars) + '</span></figcaption></figure>' : '') +
      (rv.length > 1 ? '<div class="more">' + rv.slice(1, 4).map(r => '<figure style="margin:0" data-rv><span class="stars">' + '★'.repeat(r.stars) + '</span><blockquote>' + esc(r.text) + '</blockquote><figcaption style="margin:0">' + esc(r.name) + '</figcaption></figure>').join('') + '</div>' : '') + note.replace('class="mut"', 'style="color:var(--deepMut);font-size:13px;margin-top:28px"').replace(' style="font-size:13px;margin-top:20px"', '') + '</div></section>';
    if (sec.variant === 'cards' && rv.length) return '<section class="sec rv rv-cards" id="reviews"><div class="w">' + hd + score + '<div class="row" data-rv>' + rv.slice(0, 9).map(r => '<figure><span class="stars" aria-label="' + r.stars + ' out of 5">' + '★'.repeat(r.stars) + '</span><blockquote>' + esc(r.text) + '</blockquote><figcaption>' + esc(r.name) + '</figcaption></figure>').join('') + '</div>' + note + '</div></section>';
    return '<section class="sec rv" id="reviews"><div class="w">' + hd + score + (rv.length ? '<div class="wall">' + rv.slice(0, 9).map(fig).join('') + '</div>' : '') + note + '</div></section>';
  },
  area(sec, f, c) {
    if (!f.guide.length) return '';
    if (sec.variant === 'cards') return '<section class="sec ar-c" id="area"><div class="w"><div class="hd"><p class="eb" data-rv>' + esc(c.areaEyebrow || 'Around ' + f.town) + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.areaTitle || 'Days out, picked by your host') + '</h2>' + (c.areaIntro ? '<p class="lede" style="margin-top:24px" data-rv>' + esc(c.areaIntro) + '</p>' : '') + '</div><ol>' +
      f.guide.map((g, i) => '<li data-rv><span class="i num">' + String(i + 1).padStart(2, '0') + '</span><b>' + esc(g.place) + '</b>' + (g.far ? '<span class="far">' + esc(g.far) + '</span>' : '') + (g.tip ? '<p>' + esc(g.tip) + '</p>' : '') + '</li>').join('') + '</ol></div></section>';
    return '<section class="sec ar" id="area"><div class="w"><div><p class="eb" data-rv>' + esc(c.areaEyebrow || 'Around ' + f.town) + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.areaTitle || 'Days out, picked by your host') + '</h2>' + (c.areaIntro ? '<p class="lede" style="margin-top:24px" data-rv>' + esc(c.areaIntro) + '</p>' : '') + '</div><ol>' +
      f.guide.map(g => '<li data-rv><b>' + esc(g.place) + '</b>' + (g.far ? '<span class="far">' + esc(g.far) + '</span>' : '<span></span>') + (g.tip ? '<p>' + esc(g.tip) + '</p>' : '') + '</li>').join('') + '</ol></div></section>';
  },
  host(sec, f, c) {
    const note = c.hostNote || f.hostNote; if (!note && !f.owner) return '';
    if (sec.variant === 'centered') return '<section class="sec ho ho-c"><div class="w"><div class="mono" aria-hidden="true" data-rv>' + esc((f.owner || f.business || 'H')[0]) + '</div><div data-rv><p class="eb">' + esc(c.hostEyebrow || 'Your host') + '</p><blockquote class="disp">“' + esc(note || 'Message me any time before or during your stay.') + '”</blockquote><p class="mut">' + esc((f.owner ? f.owner + ', ' : '') + f.business) + '</p></div></div></section>';
    return '<section class="sec ho alt"><div class="w"><div class="mono" aria-hidden="true" data-rv>' + esc((f.owner || f.business || 'H')[0]) + '</div><div data-rv><p class="eb">' + esc(c.hostEyebrow || 'Your host') + '</p><blockquote class="disp">“' + esc(note || 'Message me any time before or during your stay.') + '”</blockquote><p class="mut">' + esc((f.owner ? f.owner + ', ' : '') + f.business) + '</p></div></div></section>';
  },
  book(sec, f, c, ctx) {
    const save = Math.round((f.nightly * 3 + f.cleaning) * 0.142);
    if (sec.variant === 'centered') return '<section class="sec bk bk-c alt" id="book"><div class="w"><div class="hd"><p class="eb" data-rv>' + esc(c.bookEyebrow || 'Book direct') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.bookTitle || 'Pick your dates') + '</h2><p class="lede" style="margin:24px auto 0" data-rv>' + esc(c.bookText || 'Book here with ' + (f.owner || 'your host') + ' and pay no platform booking fee.') + '</p>' +
      '<div class="save" data-rv>Booking direct skips the platform guest fee. On a 3-night stay that is about <b class="num">' + money(save) + '</b> kept in your pocket.</div></div>' +
      '<div class="card" data-rv id="bw" aria-live="polite"><noscript><p>Turn on JavaScript to check dates, or email ' + esc(f.business) + '.</p></noscript></div></div></section>';
    return '<section class="sec bk dk" id="book"><div class="w"><div><p class="eb" data-rv>' + esc(c.bookEyebrow || 'Book direct') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.bookTitle || 'Pick your dates') + '</h2><p class="lede" style="margin-top:24px;color:var(--deepMut)" data-rv>' + esc(c.bookText || 'Book here with ' + (f.owner || 'your host') + ' and pay no platform booking fee.') + '</p>' +
      '<div class="save" data-rv>Booking direct skips the platform guest fee. On a 3-night stay that is about <b class="num">' + money(save) + '</b> kept in your pocket.</div></div>' +
      '<div class="card" data-rv id="bw" aria-live="polite"><noscript><p>Turn on JavaScript to check dates, or email ' + esc(f.business) + '.</p></noscript></div></div></section>';
  },
  faq(sec, f, c) {
    const qs = f.faqs.slice(0, 12);
    if (sec.variant === 'columns') return '<section class="sec fq-cols" id="faq"><div class="w">' + secHd(c.faqEyebrow || 'Good to know', c.faqTitle || 'Questions guests ask') + '<dl data-rv>' + qs.map(([q, a]) => '<div><dt>' + esc(q) + '</dt><dd>' + esc(a) + '</dd></div>').join('') + '</dl></div></section>';
    if (sec.variant === 'centered') return '<section class="sec fq fq-c" id="faq"><div class="w">' + secHd(c.faqEyebrow || 'Good to know', c.faqTitle || 'Questions guests ask') + '<div data-rv>' + qs.map(([q, a], i) => '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>').join('') + '</div></div></section>';
    return '<section class="sec fq" id="faq"><div class="w"><div><p class="eb" data-rv>' + esc(c.faqEyebrow || 'Good to know') + '</p><h2 class="disp h2" data-rv>' + fmtInline(c.faqTitle || 'Questions guests ask') + '</h2></div><div data-rv>' +
      f.faqs.slice(0, 12).map(([q, a], i) => '<details' + (i === 0 ? ' open' : '') + '><summary>' + esc(q) + '</summary><p>' + esc(a) + '</p></details>').join('') + '</div></div></section>';
  },
  closing(sec, f, c) {
    const ph = f.photos[f.photos.length - 1];
    if (sec.variant === 'split' && ph) return '<section class="cl-split"><div class="pic">' + img(ph) + '</div><div class="tx" data-rv><h2 class="disp h2">' + fmtInline(c.closing || 'Your dates are waiting') + '</h2>' + ctaBtn(c.cta) + '</div></section>';
    if (sec.variant === 'minimal' || (sec.variant === 'split' && !ph)) return '<section class="sec cl-min"><div class="w" data-rv><h2 class="disp h2">' + fmtInline(c.closing || 'Your dates are waiting') + '</h2>' + ctaBtn(c.cta) + '</div></section>';
    return '<section class="cl' + (ph ? '' : ' np') + '">' + (ph ? img(ph) : '') + '<div class="w" data-rv><h2 class="disp h2">' + fmtInline(c.closing || 'Your dates are waiting') + '</h2>' + ctaBtn(c.cta) + '</div></section>';
  },
};

function nav(f, c, types, overlay, kind) {
  const links = [['stay', 'The stay', 'story'], ['gallery', 'Gallery', 'gallery'], ['area', 'Area', 'area'], ['reviews', 'Reviews', 'reviews'], ['faq', 'FAQ', 'faq']].filter(x => types.includes(x[2]));
  const wm = '<a class="wm" href="#top">' + esc(c.wordmark || f.short || f.name) + '</a>', ul = '<ul>' + links.map(x => '<li><a href="#' + x[0] + '">' + x[1] + '</a></li>').join('') + '</ul>', bt = '<a class="btn" href="#book">Check dates</a>';
  const cls = kind === 'centered' ? ' n-cen' : kind === 'minimal' ? ' n-min' : '';
  return '<nav class="nav' + (overlay ? ' ov' : ' solid') + cls + '" id="nav" aria-label="Main"><div class="w">' + (kind === 'centered' ? ul + wm + bt : kind === 'minimal' ? wm + bt : wm + ul + bt) + '</div></nav>';
}
function footer(f, c, url) {
  return '<footer class="ft"><div class="w"><p class="disp big">' + esc(f.name) + '</p><div class="cols"><span>' + esc(f.area) + '</span><span>' + esc(c.footerLine || 'Book direct with your host. No platform fees.') + '</span><span>' + esc(f.business) + ' · <a href="' + esc(url.replace(/\/$/, '') + '/llms.txt') + '">llms.txt</a></span></div></div></footer>' +
    '<div class="mbar" id="mbar"><div><small>From</small><b class="num">' + money(f.nightly) + '</b> <small style="display:inline">night</small></div><a class="btn" href="#book">Check dates</a></div>';
}

/* ---------- the booking widget and page behaviour (inline, no libraries) ---------- */
const CLIENT = `(function(){var d=document,R=d.documentElement;R.classList.add('js');var B=window.__ST__||{};
var io='IntersectionObserver'in window?new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'}):null;
d.querySelectorAll('[data-rv]').forEach(function(el,i){if(io)io.observe(el);else el.classList.add('in')});
var nv=d.getElementById('nav'),mb=d.getElementById('mbar'),ov=nv&&nv.classList.contains('ov');function sc(){var y=scrollY;if(nv&&ov)nv.classList.toggle('solid',y>40),nv.classList.toggle('ov',y<=40);if(mb){var bk=d.getElementById('book'),r=bk&&bk.getBoundingClientRect();mb.classList.toggle('on',y>500&&!(r&&r.top<innerHeight&&r.bottom>0))}}addEventListener('scroll',sc,{passive:true});sc();
var lb=d.querySelector('dialog.lb');if(lb)d.querySelectorAll('[data-lb]').forEach(function(b){b.addEventListener('click',function(){var im=b.querySelector('img');lb.querySelector('img').src=im.src;lb.querySelector('img').alt=im.alt;lb.querySelector('p').textContent=im.alt;lb.showModal()})}),lb.addEventListener('click',function(){lb.close()});
var W=d.getElementById('bw');if(!W||!B.book)return;var K=B.book,qs=new URLSearchParams(location.search);
var blocked=new Set(K.blocked||[]),st={a:null,b:null,m:null,promo:(qs.get('promo')||'').toUpperCase(),busy:false,err:'',done:null};
function iso(x){return x.toISOString().slice(0,10)}function P(s){var p=s.split('-');return new Date(Date.UTC(+p[0],+p[1]-1,+p[2]))}function add(s,n){var x=P(s);x.setUTCDate(x.getUTCDate()+n);return iso(x)}
function nights(a,b){var o=[];for(var x=a;x<b;x=add(x,1))o.push(x);return o}function free(a,b){return nights(a,b).every(function(x){return!blocked.has(x)})}
function fnv(s){var h=0x811c9dc5;for(var i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,0x01000193)>>>0}return h.toString(36)}
function gbp(n){return '£'+Math.round(n).toLocaleString('en-GB')}var MO=['January','February','March','April','May','June','July','August','September','October','November','December'];
if(!st.m){st.m=K.today.slice(0,7)}
// dates passed in the link (from an event ad or funnel) are picked for the guest when they are still free
(function(){var ci=qs.get('checkin')||'',co=qs.get('checkout')||'';if(ci.length===10&&co.length===10&&!isNaN(P(ci))&&!isNaN(P(co))&&ci>K.today&&co>ci&&free(ci,co)){st.a=ci;st.b=co;st.m=ci.slice(0,7)}})();
function quote(){if(!st.a||!st.b)return null;var ns=nights(st.a,st.b),n=ns.reduce(function(s,x){var w=P(x).getUTCDay();return s+K.nightly+((w===5||w===6)?K.weekend:0)},0);var g=val('ad')+val('ch'),pet=K.pets&&chk('pt')?K.petFee:0;var pc=st.promo&&K.promos[fnv(st.promo)]||0,disc=Math.round(n*pc/100);
var pr=[];if(ns.length<K.minNights)pr.push('The minimum stay is '+K.minNights+' nights.');if(g>K.maxGuests)pr.push('This home sleeps '+K.maxGuests+'.');if(!free(st.a,st.b))pr.push('Some of those nights are taken.');
return{n:ns.length,nightly:n,clean:K.cleaning,pet:pet,pc:pc,disc:disc,total:n+K.cleaning+pet-disc,pr:pr}}
function val(id){var e=d.getElementById('bw-'+id);return e?(+e.value||0):(id==='ad'?2:0)}function chk(id){var e=d.getElementById('bw-'+id);return!!(e&&e.checked)}function txt(id){var e=d.getElementById('bw-'+id);return e?e.value.trim():''}
function month(ym){var y=+ym.slice(0,4),m=+ym.slice(5,7)-1,first=new Date(Date.UTC(y,m,1)),pad=(first.getUTCDay()+6)%7,days=new Date(Date.UTC(y,m+1,0)).getUTCDate(),h='<div class="mo"><b>'+MO[m]+' '+y+'</b><div class="dw">'+['M','T','W','T','F','S','S'].map(function(x){return'<span>'+x+'</span>'}).join('')+'</div><div class="dd">';
for(var i=0;i<pad;i++)h+='<span></span>';for(var dd=1;dd<=days;dd++){var s=ym+'-'+(dd<10?'0':'')+dd,past=s<=K.today,bad=past||(blocked.has(s)&&s!==st.b&&!(st.a&&!st.b&&s>st.a&&free(st.a,s))),cls=s===st.a?'a':s===st.b?'b':(st.a&&st.b&&s>st.a&&s<st.b)?'in':'';h+='<button type="button" data-d="'+s+'" class="'+cls+'"'+(bad?' disabled':'')+' aria-label="'+dd+' '+MO[m]+'">'+dd+'</button>'}return h+'</div></div>'}
function nextM(ym,k){var y=+ym.slice(0,4),m=+ym.slice(5,7)-1+k;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+'-'+(m<9?'0':'')+(m+1)}
function draw(){if(st.done){W.innerHTML='<div class="ok"><b>'+st.done.t+'</b><p class="mut">'+st.done.p+'</p>'+(st.done.u?'<a class="btn" href="'+st.done.u+'">Open your trip</a>':'')+'</div>';return}
var q=quote(),fd=document.activeElement&&document.activeElement.id;var keep={};['ad','ch','nm','em','ph','pr'].forEach(function(k){var e=d.getElementById('bw-'+k);if(e)keep[k]=e.value});var kp=chk('pt'),ks=d.getElementById('bw-sb')?chk('sb'):true;
var opt=function(n,a){var h='';for(var i=a;i<=n;i++)h+='<option>'+i+'</option>';return h};
W.innerHTML='<h3><span>'+(st.a?(st.b?fmt(st.a)+' – '+fmt(st.b):'Now pick your checkout'):'Pick your arrival date')+'</span><span class="cal nv"><button type="button" class="cal-btn" data-m="-1" aria-label="Earlier months">‹</button><button type="button" class="cal-btn" data-m="1" aria-label="Later months">›</button></span></h3><div class="cal">'+month(st.m)+month(nextM(st.m,1))+'</div>'+
'<div class="fr"><label>Adults<select id="bw-ad">'+opt(K.maxGuests,1)+'</select></label><label>Children<select id="bw-ch">'+opt(Math.max(0,K.maxGuests-1),0)+'</select></label>'+(K.pets?'<label class="chk full"><input type="checkbox" id="bw-pt"> Bringing a dog ('+gbp(K.petFee)+' per stay)</label>':'')+'</div>'+
(q?'<div class="qt">'+(q.pr.length?'<div class="err">'+q.pr[0]+'</div>':'<div><span>'+q.n+' nights</span><span class="num">'+gbp(q.nightly)+'</span></div><div><span>Cleaning</span><span class="num">'+gbp(q.clean)+'</span></div>'+(q.pet?'<div><span>Dog</span><span class="num">'+gbp(q.pet)+'</span></div>':'')+(q.disc?'<div><span>Code '+st.promo+' ('+q.pc+'% off)</span><span class="num">−'+gbp(q.disc)+'</span></div>':'')+'<div class="tot"><span>Total</span><span class="num">'+gbp(q.total)+'</span></div>')+'</div>':'')+
(q&&!q.pr.length?'<div class="fr"><label class="full">Your name<input id="bw-nm" autocomplete="name" required></label><label>Email<input id="bw-em" type="email" autocomplete="email" required></label><label>Phone<input id="bw-ph" type="tel" autocomplete="tel"></label><label class="full">Promo code<input id="bw-pr" autocapitalize="characters"></label><label class="chk full"><input type="checkbox" id="bw-sb" checked> Send me the odd offer from '+esc(K.business)+'. Unsubscribe any time.</label></div>'+(st.err?'<p class="qt err" role="alert">'+esc(st.err)+'</p>':'')+'<button type="button" class="btn" id="bw-go"'+(st.busy?' disabled':'')+'>'+(st.busy?'One moment…':K.stripe?'Book and pay securely':'Send booking request')+'</button>'+(K.bank?'<button type="button" class="btn gh" id="bw-tr"'+(st.busy?' disabled':'')+'>Book and pay by bank transfer</button>':'')+'<p class="fine">'+(K.stripe?'Secure card payment by Stripe. ':'Your host confirms, then sends a secure payment link. ')+(K.bank?'Bank transfer: pay within '+K.bank.days+' days. ':'')+'No platform booking fee.</p>':'<p class="fine">From '+gbp(K.nightly)+' a night · minimum '+K.minNights+' nights</p>');
if(!('ad' in keep)&&K.maxGuests>=2)d.getElementById('bw-ad').value='2';Object.keys(keep).forEach(function(k){var e=d.getElementById('bw-'+k);if(e&&keep[k]!=null)e.value=keep[k]});var pt=d.getElementById('bw-pt');if(pt)pt.checked=kp;var sb=d.getElementById('bw-sb');if(sb)sb.checked=ks;var pr=d.getElementById('bw-pr');if(pr&&!pr.value)pr.value=st.promo;if(fd&&d.getElementById(fd))d.getElementById(fd).focus()}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(s){var x=P(s);return x.getUTCDate()+' '+MO[x.getUTCMonth()].slice(0,3)}
W.addEventListener('click',function(e){var t=e.target.closest('button');if(!t)return;if(t.dataset.m){st.m=nextM(st.m,+t.dataset.m);if(st.m<K.today.slice(0,7))st.m=K.today.slice(0,7);draw();return}
if(t.dataset.d){var s=t.dataset.d;if(!st.a||st.b||s<=st.a){st.a=s;st.b=null}else if(free(st.a,s)){st.b=s}else{st.a=s;st.b=null}st.err='';draw();return}
if(t.id==='bw-go')go();if(t.id==='bw-tr')go('transfer')});
W.addEventListener('change',function(e){if(e.target.id==='bw-pr'){st.promo=e.target.value.trim().toUpperCase()}if(['bw-ad','bw-ch','bw-pt','bw-pr'].indexOf(e.target.id)>=0)draw()});
function go(kind){var q=quote();if(!q||q.pr.length)return;var nm=txt('nm'),em=txt('em');if(!nm||!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/.test(em)){st.err='Add your name and a valid email.';draw();return}
st.busy=true;st.err='';draw();var src=qs.get('utm_source')==='funnel'||qs.get('utm_source')==='email'?'campaign':(/google|bing|duckduckgo/.test(document.referrer)?'google':(/chatgpt|perplexity|gemini|claude|copilot/.test(document.referrer)?'ai':'website'));
fetch(K.url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:kind||undefined,input:{propertyId:K.pid,checkIn:st.a,checkOut:st.b,name:nm,email:em,phone:txt('ph'),adults:val('ad'),children:val('ch'),pets:chk('pt'),promo:st.promo,subscribe:chk('sb'),source:src}})}).then(function(r){return r.json()}).then(function(j){st.busy=false;
if(!j.ok){st.err=j.error||'Those dates could not be booked.';draw();return}if(j.checkoutUrl){location.href=j.checkoutUrl;return}
st.done=j.invoiceUrl?{t:'You are booked',p:'Your invoice with the bank details is on its way to '+em+'. Pay within '+K.bank.days+' days to keep the dates.',u:j.tripUrl}:j.request?{t:'Request sent',p:'Your host will confirm shortly and email you a secure payment link.',u:j.tripUrl}:{t:'You are booked',p:'Your confirmation is on its way to '+em+'.',u:j.tripUrl};draw()}).catch(function(){st.busy=false;st.err='Something went wrong. Try again.';draw()})}
draw()})();`;

/* ---------- whole pages ---------- */
function head(o) {
  const L = o.look || D.look({ direction: o.dir, accent: o.accent });
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">' +
    '<title>' + esc(o.title) + '</title><meta name="description" content="' + esc(o.description) + '">' + (o.robots ? '<meta name="robots" content="' + esc(o.robots) + '">' : '') +
    '<meta name="theme-color" content="' + esc(L.pal.bg) + '">' + (o.extra || '') +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?' + L.fonts.href + '&display=swap">' +
    (o.preload ? '<link rel="preload" as="image" href="' + esc(o.preload) + '" fetchpriority="high">' : '') +
    '<style>' + css(L) + '</style></head>';
}

// Turns a validated spec into the full page for one home. ctx: { url, bookUrl, stripe, today, blocked, promos, preview, samplePhotos }
function site(s, p, spec, ctx) {
  const f = facts(s, p, ctx), c = spec.copy || {}, L = D.look(spec);
  let secs = (spec.sections || []).filter(x => R[x.type]);
  const heroSec = secs.find(x => x.type === 'hero');
  if (heroSec && heroSec.variant !== 'type' && !f.photos.length) heroSec.variant = 'type';
  if (heroSec && heroSec.variant === 'mosaic' && f.photos.length < 3) heroSec.variant = f.photos.length ? 'split' : 'type';
  // each section is tagged with its type, so the console can scroll the preview to it
  const body = secs.map(x => R[x.type](x, f, c, Object.assign({ kindHint: spec.kindHint }, ctx)).replace(/^<(\w+)/, '<$1 data-sec="' + x.type + '"')).join('');
  const types = secs.map(x => x.type);
  const overlay = heroSec && heroSec.variant === 'cinematic';
  const typeHero = heroSec && heroSec.variant === 'type';
  const title = c.seoTitle || seo.titleOf(p), description = c.seoDescription || seo.descOf(p);
  const boot = { book: { url: ctx.bookUrl, pid: p.id, nightly: f.nightly, weekend: f.weekend, cleaning: f.cleaning, pets: f.pets, petFee: f.petFee, minNights: f.minNights, maxGuests: f.maxGuests, today: ctx.today, blocked: ctx.blocked || [], promos: ctx.promos || {}, stripe: !!ctx.stripe, bank: ctx.bank && ctx.bank.on ? { days: ctx.bank.days || 7 } : null, business: f.business } };
  return head({ look: L, title, description, robots: ctx.preview ? 'noindex' : null, preload: overlay || (heroSec && heroSec.variant !== 'type') ? (f.photos[0] || {}).url : null, extra: ctx.preview ? '' : seo.head(s, p, ctx.url) }) +
    '<body><a class="skip" href="#book">Skip to booking</a>' + nav(f, c, types, overlay || typeHero, L.nav) + '<main>' + body + '</main>' + footer(f, c, ctx.url) +
    (ctx.banner ? '<div style="position:fixed;left:50%;top:86px;transform:translateX(-50%);z-index:70;background:#111;color:#fff;font:600 13px/1 system-ui;padding:10px 16px;border-radius:999px;box-shadow:0 10px 30px -10px rgba(0,0,0,.4)">' + ctx.banner + '</div>' : '') +
    '<script>window.__ST__=' + JSON.stringify(boot).replace(/</g, '\\u003c') + '</script><script>' + CLIENT + '</script></body></html>';
}

module.exports = { site, facts, head, css, R, CLIENT, ARROW, fmtInline, headline, img, money, footer };
