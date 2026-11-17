// Funnels: short, focused page sequences that turn visitors into guests on the host's list and into direct
// bookings. Built from the same design system as the sites, so a funnel looks like the home's own site.
'use strict';
const D = require('./design');
const { facts, head, fmtInline, ARROW, money, img } = require('./render');
const { esc } = require('../pages');

// Each template is a sequence of steps. optin: a form that adds the guest to the host's list. offer: a sales page
// with a promo code that books direct. thanks: what happens next.
const TEMPLATES = {
  guide: { name: 'Local guide opt-in', blurb: 'Give away your insider guide to the area in return for an email. Every sign-up joins your guest list.', steps: ['optin', 'thanks'], goal: 'leads' },
  waitlist: { name: 'First dibs on dates', blurb: 'Let people join a priority list for a season or event before the dates open to everyone.', steps: ['optin', 'thanks'], goal: 'leads' },
  offer: { name: 'Special offer', blurb: 'A focused sales page for one offer, with a promo code that takes guests straight to booking.', steps: ['offer'], goal: 'bookings' },
  lastminute: { name: 'Last-minute dates', blurb: 'Shows your next free dates, live from your calendar, with a code to fill them.', steps: ['offer'], goal: 'bookings' },
  comeback: { name: 'Welcome back', blurb: 'For past guests: a returning-guest discount and first pick of next season.', steps: ['optin', 'thanks'], goal: 'leads' },
};

// Free runs of nights in the next 60 days (for last-minute pages).
function gaps(s, p, today, D2) {
  const blocked = new Set(); const add = (a, n) => { const x = new Date(a + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const nights = (a, b) => { const o = []; for (let x = a; x < b; x = add(x, 1)) o.push(x); return o; };
  s.bookings.forEach(b => { if (b.propertyId === p.id && b.status !== 'cancelled') nights(b.checkIn, b.checkOut).forEach(x => blocked.add(x)); });
  (s.blocks || []).forEach(k => { if (k.propertyId === p.id) nights(k.from, k.to).forEach(x => blocked.add(x)); });
  const out = []; let run = null;
  for (let i = 1; i <= 60; i++) { const d = add(today, i); if (!blocked.has(d)) { if (!run) run = { from: d, n: 0 }; run.n++; } else if (run) { out.push(run); run = null; } }
  if (run) out.push(run);
  return out.filter(r => r.n >= Math.max(1, p.minNights || 1)).slice(0, 4).map(r => ({ from: r.from, to: add(r.from, r.n), n: r.n }));
}
const fmtD = s => new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/* ---------- copy written by rules (always available) ---------- */
function rulesCopy(tpl, f, o) {
  const code = o.code, pct = o.pct, season = o.season || 'next summer';
  const C = {
    guide: { optin: { eyebrow: 'Free guide · ' + f.town, headline: 'The *' + f.town + '* our guests never find on their own', subhead: 'The walks, pubs and quiet corners we send our own friends to, in one short guide. Free, straight to your inbox.', points: ['Where to walk when everywhere else is busy', 'The pub, the café and the view worth the detour', 'How to get the best out of a stay at ' + f.short], button: 'Send me the guide', fine: 'One short guide, then the odd note about dates and offers. Unsubscribe any time.' },
      thanks: { headline: 'Here is your *guide*', text: 'We have added you to our list for dates and offers. Your guide is below, and when you are ready to visit, booking direct means no platform fees.', button: 'See dates at ' + f.short } },
    waitlist: { optin: { eyebrow: 'Priority list · ' + season, headline: 'First pick of *' + season + '*', subhead: 'Our best weeks go fast. Join the list and we will email you before ' + season + ' opens to everyone.', points: ['Choose your dates before anyone else', 'Book direct, with no platform fees', 'No obligation. One email when dates open'], button: 'Join the list', fine: 'We only email about dates and offers at ' + f.short + '. Unsubscribe any time.' },
      thanks: { headline: 'You are *on the list*', text: 'We will email you before ' + season + ' opens. If you already know your dates, you can book now.', button: 'Check dates now' } },
    comeback: { optin: { eyebrow: 'For returning guests', headline: 'Come back to *' + f.short + '*', subhead: 'You have stayed before, so you get ' + pct + '% off your next stay when you book direct, and first pick of next season.', points: [pct + '% off every direct stay', 'First pick of the busy weeks', 'Talk to us directly, no platform in the middle'], button: 'Get my returning-guest code', fine: 'We will email your code and the odd note about dates. Unsubscribe any time.' },
      thanks: { headline: 'Welcome *back*', text: 'Your code is below. Use it at checkout on our booking page. It is already applied on the link.', button: 'Book with my code' } },
    offer: { offer: { eyebrow: pct + '% off · book direct', headline: o.headline || 'A little *more time* at ' + f.short, subhead: 'Book direct with the code below and save ' + pct + '% on your nights. No platform fees, and you talk to us directly.', points: [f.headline || 'A stay at ' + f.name, 'Sleeps ' + f.maxGuests + ', ' + f.bedrooms + ' bedroom' + (f.bedrooms === 1 ? '' : 's'), f.pets ? 'Dogs welcome' : 'Check-in from ' + f.checkin], urgency: 'While dates last', button: 'Book with ' + code } },
    lastminute: { offer: { eyebrow: 'Last-minute · ' + pct + '% off', headline: 'Free this month at *' + f.short + '*', subhead: 'A few nights have opened up. Book any of these dates direct with the code below and save ' + pct + '%.', points: [], urgency: 'Dates update live from our calendar', button: 'Book with ' + code } },
  };
  return C[tpl];
}

/* ---------- AI copy ---------- */
function schema(steps) {
  const s = { type: 'string' };
  const step = { type: 'object', additionalProperties: false, required: ['eyebrow', 'headline', 'subhead', 'points', 'button', 'fine', 'urgency', 'text'], properties: { eyebrow: s, headline: s, subhead: s, points: { type: 'array', items: s }, button: s, fine: s, urgency: s, text: s } };
  return { type: 'object', additionalProperties: false, required: ['name'].concat(steps), properties: Object.assign({ name: s }, Object.fromEntries(steps.map(k => [k, step]))) };
}
function aiPrompt(tpl, f, o) {
  const t = TEMPLATES[tpl];
  return 'Write the pages for a "' + t.name + '" funnel for this UK holiday let. ' + t.blurb + '\n\nSteps: ' + t.steps.join(', ') + '. optin pages have a short form (name, email); offer pages show a promo code and send guests to book; thanks pages follow an opt-in.\n' +
    'Facts: ' + JSON.stringify({ name: f.name, town: f.town, area: f.area, kind: f.kind, sleeps: f.maxGuests, bedrooms: f.bedrooms, dogs: f.pets, fromPerNight: '£' + f.nightly, amenities: f.amenities, about: f.about, areaGuide: f.guide.map(g => g.place) }) + '\n' +
    'Offer details: ' + JSON.stringify({ promoCode: o.code, discountPercent: o.pct, season: o.season || '', hostNotes: o.notes || '' }) + '\n\n' +
    'Rules: UK English, sentence case, specific and sensory, facts only. headline under nine words; wrap one word in *asterisks* for italic emphasis. subhead one or two sentences. points: three short benefit lines (empty array for thanks steps). ' +
    'button: a first-person action under five words ("Send me the guide"). fine: one reassuring line about email consent for optin steps, otherwise empty. urgency: an honest reason to act now for offer steps (never fake scarcity or countdowns), otherwise empty. text: for thanks steps, two sentences on what happens next; otherwise empty. ' +
    'name: a short internal name for the funnel. Banned: ' + D.CLICHES.join(', ') + '.';
}

/* ---------- rendering a funnel step ---------- */
function page(s, p, fn, step, ctx) {
  const f = facts(s, p, ctx), dir = fn.direction || ctx.direction || 'linen', L = D.look({ direction: dir, accent: fn.accent || ctx.accent, style: fn.style || ctx.style }), c = (fn.copy || {})[step] || {};
  const ph = f.photos[0];
  const book = ctx.siteUrl + (ctx.siteUrl.includes('?') ? '&' : '?') + (fn.code ? 'promo=' + encodeURIComponent(fn.code) + '&' : '') + 'utm_source=funnel&utm_campaign=' + encodeURIComponent(fn.id) + '#book';
  const h1 = '<h1 class="disp h1" style="font-size:calc(clamp(2.6rem,6vw,5.6rem) * var(--ds))">' + fmtInline(c.headline || '') + '</h1>';
  const pts = (c.points || []).filter(Boolean).length ? '<ul class="fn-pts">' + c.points.filter(Boolean).map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '';
  const pic = ph ? '<figure class="frame" style="margin:0">' + img(ph, 'fetchpriority="high"') + '</figure>' : '<div class="frame" aria-hidden="true" style="aspect-ratio:4/5;background:var(--deep);border-radius:var(--ri);display:grid;place-items:center;color:var(--deepInk)"><span class="disp" style="font-size:calc(clamp(2.4rem,5vw,4.4rem) * var(--ds));text-align:center;padding:30px">' + esc(f.name) + '</span></div>';
  let main = '';
  if (step === 'optin') {
    main = '<section class="fn-hero"><div class="w"><div><p class="eb">' + esc(c.eyebrow || '') + '</p>' + h1 + '<p class="lede">' + esc(c.subhead || '') + '</p>' + pts +
      '<form class="fn-form" method="post" action="' + esc(ctx.postUrl) + '"><div class="fr"><label>First name<input name="name" autocomplete="given-name" required maxlength="60"></label><label>Email<input name="email" type="email" autocomplete="email" required maxlength="120"></label>' +
      '<label class="chk full"><input type="checkbox" name="consent" value="1" checked> Email me about dates and offers from ' + esc(f.business) + '. I can unsubscribe any time.</label></div>' +
      '<input type="text" name="website" tabindex="-1" autocomplete="off" style="position:absolute;left:-9999px" aria-hidden="true">' + (ctx.error ? '<p style="color:#B3261E;margin:0">' + esc(ctx.error) + '</p>' : '') +
      '<button class="btn" type="submit">' + esc(c.button || 'Join') + ARROW + '</button>' + (c.fine ? '<p class="mut" style="font-size:13px;margin:0">' + esc(c.fine) + '</p>' : '') + '</form></div>' + pic + '</div></section>';
  } else if (step === 'thanks') {
    const extra = fn.template === 'guide' && f.guide.length ? '<section class="sec ar"><div class="w"><div><p class="eb">Your guide</p><h2 class="disp h2">Around ' + esc(f.town) + '</h2></div><ol>' + f.guide.map(g => '<li><b>' + esc(g.place) + '</b>' + (g.far ? '<span class="far">' + esc(g.far) + '</span>' : '<span></span>') + (g.tip ? '<p>' + esc(g.tip) + '</p>' : '') + '</li>').join('') + '</ol></div></section>' : '';
    main = '<section class="fn-hero"><div class="w"><div>' + h1 + '<p class="lede">' + esc(c.text || c.subhead || '') + '</p>' + (fn.code && fn.template === 'comeback' ? '<div class="code">' + esc(fn.code) + '</div><p class="mut" style="font-size:14px">' + fn.pct + '% off your nights when you book direct</p>' : '') +
      '<div class="acts" style="margin-top:34px"><a class="btn" href="' + esc(book) + '">' + esc(c.button || 'See dates') + ARROW + '</a></div></div>' + pic + '</div></section>' + extra;
  } else {
    const gp = fn.template === 'lastminute' ? gaps(s, p, ctx.today) : [];
    const gapList = fn.template === 'lastminute' ? (gp.length ? '<ul class="fn-pts">' + gp.map(g => '<li><b>' + fmtD(g.from) + ' – ' + fmtD(g.to) + '</b>&nbsp;<span class="mut">' + g.n + ' night' + (g.n === 1 ? '' : 's') + ' free</span></li>').join('') + '</ul>' : '<p class="mut" style="margin-top:24px">We are fully booked for the next few weeks. Check later dates below.</p>') : '';
    main = '<section class="fn-hero"><div class="w"><div><p class="eb">' + esc(c.eyebrow || '') + '</p>' + h1 + '<p class="lede">' + esc(c.subhead || '') + '</p>' + pts + gapList +
      (fn.code ? '<div class="code" aria-label="Promo code">' + esc(fn.code) + '</div><p class="mut" style="font-size:14px;margin:0">' + fn.pct + '% off your nights. Applied automatically on the next page.</p>' : '') +
      '<div class="acts" style="margin-top:30px"><a class="btn" href="' + esc(book) + '">' + esc(c.button || 'Check dates') + ARROW + '</a>' + (c.urgency ? '<span class="urg">' + esc(c.urgency) + '</span>' : '') + '</div>' +
      '<p class="mut" style="font-size:14px;margin-top:22px">From <b class="num">' + money(f.nightly) + '</b> a night · sleeps ' + f.maxGuests + (f.rating && f.reviewCount ? ' · rated ' + Number(f.rating).toFixed(2) + ' by ' + f.reviewCount + ' guests' : '') + '</p></div>' + pic + '</div></section>';
  }
  const navb = '<nav class="nav solid" aria-label="Main"><div class="w"><a class="wm" href="' + esc(ctx.siteUrl) + '">' + esc(f.short) + '</a><a class="btn" href="' + esc(book) + '">Check dates</a></div></nav>';
  return head({ look: L, title: (c.headline || fn.name || f.name).replace(/\*/g, '') + ' · ' + f.name, description: c.subhead || f.headline, robots: ctx.preview || step === 'thanks' ? 'noindex' : null, preload: ph && ph.url }) +
    '<body>' + navb + '<main>' + main + '</main><footer class="ft" style="padding-top:50px"><div class="w"><div class="cols"><span>' + esc(f.name) + ' · ' + esc(f.area) + '</span><span>' + esc(f.business) + '</span><a href="' + esc(ctx.siteUrl) + '">Visit the website</a></div></div></footer>' +
    (ctx.banner ? '<div style="position:fixed;left:50%;top:86px;transform:translateX(-50%);z-index:70;background:#111;color:#fff;font:600 13px/1 system-ui;padding:10px 16px;border-radius:999px">' + ctx.banner + '</div>' : '') +
    '<script>document.documentElement.classList.add("js")</script></body></html>';
}

module.exports = { TEMPLATES, rulesCopy, schema, aiPrompt, page, gaps };
