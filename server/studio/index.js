// HTTP side of the Studio: the AI site builder and the funnel creator. Host routes (signed in or demo) design,
// edit, preview and publish; public routes serve published sites and funnels and take funnel sign-ups.
// Everything is saved in the workspace state under state.studio:
//   { sites: { [homeId]: { draft, published, publishedAt, brief, history: [spec] } }, funnels: [funnel] }
'use strict';
const crypto = require('crypto');
const D = require('./design');
const render = require('./render');
const FN = require('./funnels');
const EV = require('./events');
const Gen = require('./generate');

module.exports = function (o) {
  const { cfg, ws, auth, pub, urls, stripeReady, log, json, jsonBody, send, err, ip } = o;
  const gen = Gen(cfg);
  // AI credit (server/credits.js): checked before each AI design or funnel, and charged for what Claude used.
  const credits = o.credits || { check: async () => {}, meter: () => null };
  const HTML = 'text/html; charset=utf-8';
  const st = s => (s.studio = s.studio || { sites: {}, funnels: [] });
  const today = s => s.today;

  /* ---------- live data the pages need ---------- */
  function blockedNights(s, pid) {
    const out = new Set(); const end = addDays(s.today, 540);
    const run = (a, b) => { for (let x = a < s.today ? s.today : a; x < b && x < end; x = addDays(x, 1)) out.add(x); };
    s.bookings.forEach(b => { if (b.propertyId === pid && b.status !== 'cancelled' && b.checkOut > s.today) run(b.checkIn, b.checkOut); });
    (s.blocks || []).forEach(k => { if (k.propertyId === pid && k.to > s.today) run(k.from, k.to); });
    return [...out].sort();
  }
  function addDays(a, n) { const x = new Date(a + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); }
  const promosHashed = s => Object.fromEntries(Object.entries(s.promos || {}).map(([k, v]) => [pub.fnv(k), v]));
  function siteCtx(w, p, url, extra) {
    const s = w.state;
    return Object.assign({ url, bookUrl: '/api/public/' + w.slug + '/book', today: s.today, blocked: blockedNights(s, p.id), promos: promosHashed(s), stripe: stripeReady(w) || w.kind !== 'live', bank: ((pub.siteState(s, p.id) || {}).account || {}).bank || null }, extra || {});
  }

  /* ---------- public: the published site for a home ---------- */
  function publishedSite(w, p, canonical) {
    const site = ((w.state.studio || {}).sites || {})[p.id];
    if (!site || !site.published) return null;
    return render.site(w.state, p, site.published, siteCtx(w, p, canonical));
  }

  /* ---------- host routes ---------- */
  const brief = b => { b = b || {}; return { vibe: Gen.VIBES[b.vibe] ? b.vibe : '', audience: String(b.audience || '').slice(0, 200), notes: String(b.notes || '').slice(0, 600), direction: D.DIRECTIONS[b.direction] ? b.direction : '', instruction: String(b.instruction || '').slice(0, 600) }; };
  const limited = (w, what, n) => { if (!auth.limit('studio:' + what + ':' + w.id, n, 3600e3)) throw err(429, 'That is a lot of designs this hour. Try again in a little while.'); };

  async function save(wid, fn, meta) { return ws.withWs(wid, BB => fn(BB.store.get(), BB), meta || { action: 'studio' }); }
  async function reply(res, wid, extra, headers) { const w = await ws.open(wid); return json(res, Object.assign({ state: w.state, version: await ws.version(wid) }, extra || {}), 200, headers); }

  // Returns true when it handled the request. base: '/api' or '/api/demo', preview base: '/app' or '/demo'
  async function host(req, res, p, m, w, headers) {
    const api = p.replace(/^\/api\/demo\//, '/api/');
    const s = w.state;
    if (api === '/api/studio/meta' && m === 'GET') return json(res, { ai: gen.enabled, principles: D.PRINCIPLES, directions: Object.fromEntries(Object.entries(D.DIRECTIONS).map(([k, d]) => [k, { name: d.name, mood: d.mood, fonts: d.fonts.display + ' & ' + d.fonts.text, href: d.fonts.href, pal: d.pal, dark: !!d.dark, font: d.font, palette: d.palette }])), sections: D.SECTIONS, vibes: Gen.VIBES, templates: FN.TEMPLATES,
      fonts: Object.fromEntries(Object.entries(D.FONTS).map(([k, x]) => [k, { name: x.name, display: x.display, text: x.text, feel: x.feel, href: x.href }])), palettes: D.PALETTES, style: D.STYLE, pageTemplates: Object.fromEntries(Object.entries(D.TEMPLATES).map(([k, x]) => [k, { name: x.name, note: x.note }])), variantNames: D.VARIANT_NAMES, events: eventsMeta(w) }, 200, headers), true;

    if (api === '/api/studio/generate' && m === 'POST') {
      limited(w, 'gen', w.kind === 'demo' ? 12 : 40);
      const j = await jsonBody(req, 2e4); const prop = s.properties.find(x => x.id === j.propertyId); if (!prop) throw err(404, 'Home not found');
      const cur = (st(s).sites || {})[prop.id] || {}; const b = brief(j.brief);
      const prev = j.mode === 'revise' ? cur.draft : null;
      const avoid = j.mode === 'another' && cur.draft ? [cur.draft.direction].concat(cur.tried || []).slice(0, 7) : null;
      let spec;
      if (gen.enabled) await credits.check(w.id);
      try { spec = await gen.design(s, prop, b, { previous: prev, avoid, onUsage: credits.meter(w.id, 'studio') }); }
      catch (e) { log('studio', e.message); spec = await Gen({ ai: {} }).design(s, prop, b, { previous: prev, avoid }); spec.note = 'The AI designer was not available, so this version was laid out by the design rules. Try again in a minute for an AI design.'; }
      spec.at = new Date().toISOString();
      await save(w.id, (S, BB) => { const sx = st(S); const x = sx.sites[prop.id] = sx.sites[prop.id] || {};
        if (x.draft) { x.history = [x.draft].concat(x.history || []).slice(0, 6); }
        x.draft = spec; x.brief = b; x.tried = j.mode === 'another' ? (avoid || []) : [];
        BB.log('site', 'Site builder', (j.mode === 'revise' ? 'Revised the design for ' : 'Designed a new site for ') + prop.name + ' in the ' + D.DIRECTIONS[spec.direction].name + ' direction. Preview it, then publish.', prop.id);
        BB.store.commit({ type: 'website', quiet: true }); });
      return reply(res, w.id, { spec }, headers), true;
    }
    if (api === '/api/studio/edit' && m === 'POST') {
      const j = await jsonBody(req, 6e4); const prop = s.properties.find(x => x.id === j.propertyId); if (!prop) throw err(404, 'Home not found');
      const cur = ((s.studio || {}).sites || {})[prop.id]; if (!cur || !cur.draft) throw err(400, 'Design a site first.');
      const f = render.facts(s, prop); const x = j.patch || {};
      const merged = { direction: x.direction || cur.draft.direction, accent: x.accent === '' ? null : (x.accent || cur.draft.accent), heroVariant: x.heroVariant, sections: x.sections || cur.draft.sections, copy: Object.assign({}, cur.draft.copy, x.copy || {}),
        style: Object.assign({}, cur.draft.style || {}), template: x.template || cur.draft.template || null };
      // a new direction brings its own fonts and colours; the host's other style choices stay
      if (x.direction && x.direction !== cur.draft.direction) { delete merged.style.font; delete merged.style.palette; }
      if (x.style && typeof x.style === 'object') for (const [k, v] of Object.entries(x.style)) { if (!D.STYLE_KEYS.includes(k)) continue; if (v === '' || v == null) delete merged.style[k]; else merged.style[k] = String(v); }
      if (x.style === null) merged.style = {};
      // a page template re-lays every section (keeping which sections the host has), and can move the gallery up
      if (x.template && D.TEMPLATES[x.template]) {
        const have = new Set(merged.sections.map(q => q.type)), T = D.TEMPLATES[x.template];
        const laid = Gen.fromTemplate(f, x.template).filter(q => have.has(q.type));
        merged.sections.forEach(q => { if (!laid.some(r => r.type === q.type)) laid.splice(Math.max(1, laid.findIndex(r => r.type === 'book')), 0, { type: q.type, variant: T.v[q.type] || q.variant }); });
        merged.sections = laid;
      }
      // "Shuffle the style": a fresh, coherent mix of fonts, colours, shapes and layouts within the same direction
      if (x.shuffle) {
        const n = (cur.shuffles || 0) + 1 + Math.floor(Math.random() * 1000);
        merged.style = D.varyStyle(merged.direction, prop.id, [{ direction: merged.direction, style: cur.draft.style || {} }], n);
        if (n % 3) { const opts = (D.DIRECTIONS[merged.direction].alts.fonts).concat([D.DIRECTIONS[merged.direction].font]); merged.style.font = opts[n % opts.length]; }
        merged.style.corners = Object.keys(D.STYLE.corners)[n % 4];
        const tpls = Object.keys(D.TEMPLATES).filter(t => t !== cur.draft.template); const tpl = tpls[n % tpls.length];
        const have = new Set(merged.sections.map(q => q.type));
        merged.sections = Gen.fromTemplate(f, tpl, Gen.pickHero(merged.direction, f.photos.length, prop.id, n)).filter(q => have.has(q.type)); merged.template = tpl;
        merged.style = D.cleanStyle(merged.style);
      }
      if (x.heroVariant) merged.sections = merged.sections.map(q => q.type === 'hero' ? { type: 'hero', variant: x.heroVariant } : q);
      const fallback = { direction: merged.direction, sections: cur.draft.sections, copy: cur.draft.copy, style: {} };
      const spec = Object.assign(gen.normalize(merged, f, fallback), { by: cur.draft.by, at: new Date().toISOString(), rationale: cur.draft.rationale });
      if (x.template || x.shuffle) spec.template = merged.template;
      if (x.heroVariant && x.heroVariant !== 'type' && !f.photos.length) spec.note = 'Add photos in Website & SEO to use an image-led hero.';
      spec.qa = D.qa(spec, f);
      await save(w.id, S => { const x = st(S).sites[prop.id]; x.history = [x.draft].concat(x.history || []).slice(0, 12); x.draft = spec; });
      return reply(res, w.id, { spec }, headers), true;
    }
    if (api === '/api/studio/undo' && m === 'POST') {
      const j = await jsonBody(req, 2e3);
      await save(w.id, S => { const x = ((S.studio || {}).sites || {})[j.propertyId]; if (!x || !(x.history || []).length) throw err(400, 'Nothing to undo.'); x.draft = x.history.shift(); });
      return reply(res, w.id, {}, headers), true;
    }
    if (api === '/api/studio/publish' && m === 'POST') {
      const j = await jsonBody(req, 2e3); const prop = s.properties.find(x => x.id === j.propertyId); if (!prop) throw err(404, 'Home not found');
      await save(w.id, (S, BB) => { const x = ((S.studio || {}).sites || {})[prop.id];
        if (j.off) { if (x) { x.published = null; x.publishedAt = null; } BB.log('site', 'Site builder', prop.name + ' is back on the standard booking site.', prop.id); }
        else { if (!x || !x.draft) throw err(400, 'Design a site first.'); x.published = JSON.parse(JSON.stringify(x.draft)); x.publishedAt = new Date().toISOString(); BB.log('site', 'Site builder', 'Published the new ' + D.DIRECTIONS[x.draft.direction].name + ' site for ' + prop.name + '. Guests and search engines see it now.', prop.id); }
        BB.store.commit({ type: 'website' }); });
      return reply(res, w.id, {}, headers), true;
    }

    /* funnels */
    if (api === '/api/funnels/create' && m === 'POST') {
      limited(w, 'fn', w.kind === 'demo' ? 12 : 40);
      const j = await jsonBody(req, 1e4); const tpl = FN.TEMPLATES[j.template] ? j.template : null; if (!tpl) throw err(400, 'Pick a funnel type.');
      const prop = s.properties.find(x => x.id === j.propertyId) || s.properties[0]; if (!prop) throw err(400, 'Add a home first.');
      const pct = Math.max(5, Math.min(30, parseInt(j.pct, 10) || (tpl === 'lastminute' ? 15 : 10)));
      const code = (String(j.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14)) || ({ guide: 'GUIDE', waitlist: 'FIRST', offer: 'DIRECT', lastminute: 'LASTMIN', comeback: 'WELCOMEBACK' }[tpl] + pct);
      const opt = { code, pct, season: String(j.season || '').slice(0, 40), notes: String(j.notes || '').slice(0, 400), headline: '' };
      const f = render.facts(s, prop); const steps = FN.TEMPLATES[tpl].steps.concat(FN.TEMPLATES[tpl].steps.includes('optin') && !FN.TEMPLATES[tpl].steps.includes('thanks') ? ['thanks'] : []);
      let copy = FN.rulesCopy(tpl, f, opt), name = FN.TEMPLATES[tpl].name + ' · ' + prop.short, by = 'rules';
      if (gen.enabled) {
        await credits.check(w.id);
        try { const r = await gen.ask('You write high-converting, honest landing pages for UK holiday lets, at the standard of a top design studio.\n' + D.PRINCIPLES.join('\n'), [{ type: 'text', text: FN.aiPrompt(tpl, f, opt) }], FN.schema(steps), credits.meter(w.id, 'funnel'));
          const clean = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n);
          steps.forEach(k => { const a = r[k] || {}, b = copy[k] || {}; copy[k] = { eyebrow: clean(a.eyebrow, 60) || b.eyebrow, headline: clean(a.headline, 90) || b.headline, subhead: clean(a.subhead, 260) || b.subhead, points: (Array.isArray(a.points) && a.points.length ? a.points : b.points || []).map(x => clean(x, 110)).slice(0, 4), button: clean(a.button, 32) || b.button, fine: clean(a.fine, 160) || b.fine || '', urgency: clean(a.urgency, 60) || b.urgency || '', text: clean(a.text, 300) || b.text || '' }; });
          if (r.name) name = clean(r.name, 60); by = 'ai';
        } catch (e) { log('studio funnel', e.message); }
      }
      const site = ((s.studio || {}).sites || {})[prop.id] || {}; const look = site.published || site.draft || {};
      const fnl = { id: 'fn' + crypto.randomBytes(4).toString('hex'), name, template: tpl, propertyId: prop.id, status: 'draft', code, pct, season: opt.season, steps, copy, by,
        direction: look.direction || gen.guessDirection(f, null), accent: look.accent || null, style: look.style || null, createdAt: s.today, stats: { views: {}, leads: 0 } };
      await save(w.id, (S, BB) => { st(S).funnels.unshift(fnl); if (code) S.promos[code] = S.promos[code] || pct; BB.log('campaign', 'Funnels', 'Created the "' + name + '" funnel' + (code ? ' with code ' + code + ' (' + pct + '% off)' : '') + '. Preview it, then make it live.', fnl.id); BB.store.commit({ type: 'campaign', quiet: true }); });
      return reply(res, w.id, { funnel: fnl }, headers), true;
    }
    if (api === '/api/funnels/edit' && m === 'POST') {
      const j = await jsonBody(req, 4e4);
      await save(w.id, (S, BB) => { const x = (st(S).funnels || []).find(q => q.id === j.id); if (!x) throw err(404, 'Funnel not found');
        const pt = j.patch || {};
        if (pt.name) x.name = String(pt.name).slice(0, 60);
        if (pt.direction && D.DIRECTIONS[pt.direction]) x.direction = pt.direction;
        if (pt.status === 'live' || pt.status === 'draft' || pt.status === 'paused') { x.status = pt.status; BB.log('campaign', 'Funnels', '"' + x.name + '" is ' + (pt.status === 'live' ? 'live. Share its link anywhere.' : pt.status === 'paused' ? 'paused.' : 'back in draft.'), x.id); }
        if (pt.step && x.copy[pt.step] && pt.copy) { const c = x.copy[pt.step]; ['eyebrow', 'headline', 'subhead', 'button', 'fine', 'urgency', 'text'].forEach(k => { if (typeof pt.copy[k] === 'string') c[k] = pt.copy[k].replace(/[<>]/g, '').slice(0, 300); }); if (Array.isArray(pt.copy.points)) c.points = pt.copy.points.map(q => String(q).replace(/[<>]/g, '').slice(0, 110)).filter(Boolean).slice(0, 4); }
        BB.store.commit({ type: 'campaign', quiet: true }); });
      return reply(res, w.id, {}, headers), true;
    }
    if (api === '/api/funnels/delete' && m === 'POST') {
      const j = await jsonBody(req, 2e3);
      await save(w.id, S => { const sx = st(S); sx.funnels = sx.funnels.filter(q => q.id !== j.id); });
      return reply(res, w.id, {}, headers), true;
    }

    /* event ads (server/studio/events.js) */
    if (api.startsWith('/api/eventads/')) return eventAds(req, res, api, m, w, headers);
    return false;
  }

  /* ---------- Event ads ---------- */
  // state.studio.events: { found: [event], ads: [adset], scans: { [homeId]: { at, sources, place } }, prefs: { radius, minDays, months } }
  const evs = s => { const x = st(s); x.events = x.events || { found: [], ads: [], scans: {}, prefs: {} }; return x.events; };
  function eventsMeta(w) {
    const E = cfg.events || {}, demo = w.kind === 'demo';
    const on = { web: !!(cfg.ai.anthropic && E.webSearch), predicthq: !!E.predicthq, ticketmaster: !!E.ticketmaster, manual: true };
    return { kinds: EV.KINDS, demo, sources: Object.entries(EV.SOURCES).map(([id, x]) => Object.assign({ id, on: demo ? id === 'manual' : on[id] }, x)) };
  }
  // what the host sees for each event: how it sits against the calendar today
  function withFit(s, list) {
    return list.map(e => { const p = s.properties.find(x => x.id === e.propertyId); if (!p) return null; return Object.assign({}, e, { fit: EV.fit(e, new Set(blockedNights(s, p.id)), p, s.today) }); }).filter(Boolean);
  }
  async function eventAds(req, res, api, m, w, headers) {
    const s = w.state, E = s.studio && s.studio.events;
    const home = id => { const p = s.properties.find(x => x.id === id) || s.properties[0]; if (!p) throw err(400, 'Add a home first.'); return p; };
    if (api === '/api/eventads/list' && m === 'GET') {
      const x = E || { found: [], ads: [], scans: {}, prefs: {} };
      return json(res, { events: withFit(s, x.found.filter(e => !e.hidden)), ads: x.ads, scans: x.scans, prefs: x.prefs, meta: eventsMeta(w) }, 200, headers), true;
    }
    if (api === '/api/eventads/find' && m === 'POST') {
      limited(w, 'events', w.kind === 'demo' ? 12 : 20);
      const j = await jsonBody(req, 2e3), p = home(j.propertyId), demo = w.kind === 'demo';
      const o = { today: s.today, radius: [10, 25, 50].includes(+j.radius) ? +j.radius : 25, minDays: [2, 3, 5].includes(+j.minDays) ? +j.minDays : 2, months: [3, 6, 12].includes(+j.months) ? +j.months : 6 };
      o.from = EV.add(s.today, 1); o.to = EV.add(s.today, Math.round(o.months * 30.5));
      const meta = eventsMeta(w);
      if (!demo && !meta.sources.some(x => x.on && x.id !== 'manual')) throw err(400, 'No event sources are switched on yet. Add an event yourself below, or ask us to turn on web search.');
      if (!demo && meta.sources.find(x => x.id === 'web').on) await credits.check(w.id);
      const r = await EV.find(cfg, render.facts(s, p), p, o, { demo, onUsage: credits.meter(w.id, 'eventads') });
      let added = 0;
      await save(w.id, (S, BB) => { const x = evs(S);
        r.events.forEach(e => { const old = x.found.find(q => q.id === e.id); if (old) { if (!old.url && e.url) old.url = e.url; return; } x.found.push(e); added++; });
        // keep the list tidy: drop events that are over, and keep at most 80 a home
        x.found = x.found.filter(e => e.end >= S.today || x.ads.some(a => a.eventId === e.id)).sort((a, b) => a.start.localeCompare(b.start));
        S.properties.forEach(q => { const mine = x.found.filter(e => e.propertyId === q.id); if (mine.length > 80) { const drop = new Set(mine.slice(80).map(e => e.id)); x.found = x.found.filter(e => !drop.has(e.id)); } });
        x.prefs = { radius: o.radius, minDays: o.minDays, months: o.months };
        x.scans[p.id] = { at: new Date().toISOString(), place: (r.loc && r.loc.place) || '', sources: r.sources };
        BB.log('campaign', 'Event ads', 'Looked for events near ' + p.name + ': ' + r.events.length + ' found, ' + added + ' new.', p.id);
        BB.store.commit({ type: 'campaign', quiet: true }); });
      const w2 = await ws.open(w.id), x2 = w2.state.studio.events;
      return json(res, { events: withFit(w2.state, x2.found.filter(e => !e.hidden)), ads: x2.ads, scans: x2.scans, prefs: x2.prefs, added, sources: r.sources, state: w2.state, version: await ws.version(w.id) }, 200, headers), true;
    }
    if (api === '/api/eventads/add' && m === 'POST') {
      const j = await jsonBody(req, 4e3), p = home(j.propertyId);
      const e = EV.norm(Object.assign({}, j, { kind: j.kind }), 'manual', p.id);
      if (!e) throw err(400, 'Add the event’s name and its first day.');
      if (e.end <= s.today) throw err(400, 'That event is already over.');
      await save(w.id, S => { const x = evs(S); x.found = x.found.filter(q => q.id !== e.id); x.found.push(e); x.found.sort((a, b) => a.start.localeCompare(b.start)); });
      return reply(res, w.id, { event: e }, headers), true;
    }
    if (api === '/api/eventads/hide' && m === 'POST') {
      const j = await jsonBody(req, 2e3);
      await save(w.id, S => { const e = evs(S).found.find(q => q.id === j.id); if (e) e.hidden = !j.show; });
      return reply(res, w.id, {}, headers), true;
    }
    if (api === '/api/eventads/create' && m === 'POST') {
      limited(w, 'evad', w.kind === 'demo' ? 12 : 40);
      const j = await jsonBody(req, 2e3), ev = E && E.found.find(q => q.id === j.eventId); if (!ev) throw err(404, 'Event not found');
      const p = home(ev.propertyId), ft = EV.fit(ev, new Set(blockedNights(s, p.id)), p, s.today);
      if (!ft.stay) throw err(400, 'Those nights are already booked, so there is nothing to advertise.');
      const pct = Math.max(0, Math.min(30, parseInt(j.pct, 10) >= 0 ? parseInt(j.pct, 10) : 10));
      const code = pct ? ((String(j.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14)) || (ev.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 6) || 'EVENT') + pct) : '';
      const f = render.facts(s, p), o = { code, pct };
      let copy = EV.rulesAds(f, ev, ft, o), by = 'rules';
      if (gen.enabled) {
        await credits.check(w.id);
        try { copy = EV.mergeAds(await gen.ask('You write honest, high-performing paid social and search ads for UK holiday lets.', [{ type: 'text', text: EV.adPrompt(f, ev, ft, o) }], EV.adSchema(), credits.meter(w.id, 'eventads')), copy); by = 'ai'; }
        catch (e) { log('event ads', e.message); }
      }
      const scan = (E.scans || {})[p.id] || {};
      const plan = EV.plan(f, ev, ft, s.today, null);
      const site = ((s.studio || {}).sites || {})[p.id] || {}, look = site.published || site.draft || {};
      const stay = Object.assign({}, ft.stay, { n: EV.diff(ft.stay.from, ft.stay.to) });
      let fnl = null;
      if (j.landing !== false) {
        fnl = { id: 'fn' + crypto.randomBytes(4).toString('hex'), name: ('Event · ' + ev.name).slice(0, 60), template: 'event', propertyId: p.id, status: 'draft', code, pct, season: '', steps: ['offer'],
          copy: { offer: Object.assign({ fine: '', text: '' }, copy.landing) }, by, stay, event: { id: ev.id, name: ev.name, start: ev.start, end: ev.end },
          direction: look.direction || gen.guessDirection(f, null), accent: look.accent || null, style: look.style || null, createdAt: s.today, stats: { views: {}, leads: 0 } };
      }
      const ad = { id: 'ea' + crypto.randomBytes(4).toString('hex'), eventId: ev.id, propertyId: p.id, event: { name: ev.name, kind: ev.kind, start: ev.start, end: ev.end, venue: ev.venue, town: ev.town, url: ev.url },
        stay, code, pct, by, meta: copy.meta, google: copy.google, audience: copy.audience, plan, funnelId: fnl && fnl.id, place: scan.place || '', status: 'draft', createdAt: s.today };
      delete ad.landing;
      await save(w.id, (S, BB) => { const x = evs(S); x.ads = x.ads.filter(a => a.eventId !== ev.id || a.status === 'running'); x.ads.unshift(ad);
        if (fnl) st(S).funnels.unshift(fnl); if (code) S.promos[code] = S.promos[code] || pct;
        BB.log('campaign', 'Event ads', 'Wrote ads for ' + ev.name + ' (' + EV.range(stay.from, stay.to) + ', ' + stay.n + ' nights at ' + p.name + ')' + (code ? ' with code ' + code : '') + '.', ad.id);
        BB.store.commit({ type: 'campaign', quiet: true }); });
      return reply(res, w.id, { ad }, headers), true;
    }
    if (api === '/api/eventads/edit' && m === 'POST') {
      const j = await jsonBody(req, 2e4);
      await save(w.id, (S, BB) => { const a = evs(S).ads.find(q => q.id === j.id); if (!a) throw err(404, 'Ads not found'); const pt = j.patch || {};
        const t = (x, n) => String(x || '').replace(/[<>]/g, '').trim().slice(0, n);
        if (pt.meta) { if (typeof pt.meta.primary === 'string') a.meta.primary = t(pt.meta.primary, 600); if (typeof pt.meta.headline === 'string') a.meta.headline = t(pt.meta.headline, 40); if (typeof pt.meta.description === 'string') a.meta.description = t(pt.meta.description, 30); }
        if (pt.google) { const L = (v, n, max) => (Array.isArray(v) ? v : String(v || '').split('\n')).map(x => t(x, n)).filter(Boolean).slice(0, max);
          if (pt.google.headlines != null) a.google.headlines = L(pt.google.headlines, 30, 15); if (pt.google.descriptions != null) a.google.descriptions = L(pt.google.descriptions, 90, 4); if (pt.google.keywords != null) a.google.keywords = L(pt.google.keywords, 80, 30); }
        if (pt.status === 'running' || pt.status === 'draft' || pt.status === 'done') { a.status = pt.status; if (pt.status === 'running') BB.log('campaign', 'Event ads', 'Ads for ' + a.event.name + ' are marked as running.', a.id); }
        BB.store.commit({ type: 'campaign', quiet: true }); });
      return reply(res, w.id, {}, headers), true;
    }
    if (api === '/api/eventads/delete' && m === 'POST') {
      const j = await jsonBody(req, 2e3);
      await save(w.id, S => { const x = evs(S); const a = x.ads.find(q => q.id === j.id); x.ads = x.ads.filter(q => q.id !== j.id); if (a && a.funnelId && j.landing) st(S).funnels = st(S).funnels.filter(q => q.id !== a.funnelId); });
      return reply(res, w.id, {}, headers), true;
    }
    return false;
  }

  // Previews for the signed-in host or the demo visitor: /app/studio/<home>?v=draft|published, /app/funnel/<id>/<step>
  function preview(res, w, p, q, isDemo) {
    let mm;
    if ((mm = p.match(/^\/(?:app|demo)\/studio\/([^/]+)$/))) {
      const prop = w.state.properties.find(x => x.id === decodeURIComponent(mm[1])); if (!prop) return send(res, 404, 'Not found', 'text/plain'), true;
      const site = ((w.state.studio || {}).sites || {})[prop.id]; const spec = site && (q.get('v') === 'published' ? site.published : site.draft);
      if (!spec) return send(res, 404, 'No design yet', 'text/plain'), true;
      const url = urls.site(w, prop);
      send(res, 200, render.site(w.state, prop, spec, siteCtx(w, prop, url, { preview: true, banner: q.get('bare') ? null : (isDemo ? 'Demo preview · bookings here are pretend' : 'Preview · ' + (q.get('v') === 'published' ? 'live version' : 'draft, not published yet')) })), HTML, { 'cache-control': 'no-store' });
      return true;
    }
    if ((mm = p.match(/^\/(?:app|demo)\/funnel\/([^/]+)\/(optin|offer|thanks)$/))) {
      const fn = ((w.state.studio || {}).funnels || []).find(x => x.id === mm[1]); if (!fn) return send(res, 404, 'Not found', 'text/plain'), true;
      const prop = w.state.properties.find(x => x.id === fn.propertyId) || w.state.properties[0];
      send(res, 200, FN.page(w.state, prop, fn, mm[2], { siteUrl: isDemo ? '/demo' : urls.site(w, prop), postUrl: '#', today: w.state.today, preview: true, banner: q.get('bare') ? null : 'Preview' }), HTML, { 'cache-control': 'no-store' });
      return true;
    }
    return false;
  }

  /* ---------- public funnels: /f/<host>/<funnel>[/<step>] ---------- */
  let day = '', seen = new Set();
  async function countView(w, fn, step, req) {
    const ua = String(req.headers['user-agent'] || ''); if (!ua || /bot|crawl|spider|preview|curl|headless/i.test(ua)) return;
    const t = new Date().toISOString().slice(0, 10); if (t !== day) { day = t; seen = new Set(); }
    const h = crypto.createHash('sha256').update(t + ip(req) + ua + fn.id + step).digest('base64url').slice(0, 16); if (seen.has(h)) return; seen.add(h);
    await ws.withWs(w.id, BB => { const x = ((BB.store.get().studio || {}).funnels || []).find(q => q.id === fn.id); if (!x) return; x.stats = x.stats || { views: {}, leads: 0 }; x.stats.views[step] = (x.stats.views[step] || 0) + 1; BB.store.commit({ type: 'campaign', quiet: true }); }, { quiet: true });
  }
  async function funnel(req, res, p, m, u) {
    const mm = p.match(/^\/f\/([a-z0-9-]+)\/([a-z0-9]+)(?:\/(optin|offer|thanks))?\/?$/); if (!mm) return false;
    const r = await ws.bySlug(mm[1]); if (!r) return false;
    const w = await ws.open(r.id); w.catchUp();
    const fn = ((w.state.studio || {}).funnels || []).find(x => x.id === mm[2]);
    if (!fn || fn.status !== 'live') { send(res, 404, '<!doctype html><title>Not found</title><p style="font:16px system-ui;padding:40px">This page is not available.</p>', HTML); return true; }
    if (o.hidden && await o.hidden(req, w)) { send(res, 503, '<!doctype html><title>Coming soon</title><p style="font:16px system-ui;padding:40px">This page is opening soon.</p>', HTML); return true; }
    const prop = w.state.properties.find(x => x.id === fn.propertyId) || w.state.properties[0];
    const step = mm[3] || fn.steps[0]; if (!fn.steps.includes(step)) return false;
    const base = cfg.baseUrl + '/f/' + w.slug + '/' + fn.id;
    const ctx = { siteUrl: urls.site(w, prop), postUrl: base + '/optin', today: w.state.today };
    if (m === 'POST' && step === 'optin') {
      if (!auth.limit('optin:' + ip(req), 10, 3600e3)) { send(res, 429, FN.page(w.state, prop, fn, 'optin', Object.assign(ctx, { error: 'Too many tries from here. Try again later.' })), HTML); return true; }
      const raw = await new Promise(ok => { let b = ''; req.on('data', c => { b += c; if (b.length > 4e3) req.destroy(); }); req.on('end', () => ok(b)); });
      const f = Object.fromEntries(new URLSearchParams(raw));
      const email = String(f.email || '').trim().toLowerCase().slice(0, 120), name = String(f.name || '').trim().slice(0, 60);
      if (f.website) { res.writeHead(303, { location: base + '/thanks' }); res.end(); return true; } // honeypot
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) { send(res, 400, FN.page(w.state, prop, fn, 'optin', Object.assign(ctx, { error: 'Add your first name and a valid email.' })), HTML); return true; }
      const consent = f.consent === '1';
      await ws.withWs(w.id, BB => {
        const S = BB.store.get(); const x = ((S.studio || {}).funnels || []).find(q => q.id === fn.id); const tag = 'Funnel: ' + fn.name.slice(0, 30);
        let g = S.guests.find(q => String(q.email).toLowerCase() === email);
        if (!g) { g = { id: 'g' + (++S.seq), name, email, phone: '', city: '', tags: [tag], subscribed: consent, notes: '', source: 'funnel', createdAt: S.today }; S.guests.push(g); }
        else { if (!g.tags.includes(tag)) g.tags.push(tag); if (consent && !g.unsubscribedAt) g.subscribed = true; }
        if (x) { x.stats = x.stats || { views: {}, leads: 0 }; x.stats.leads = (x.stats.leads || 0) + 1; }
        BB.log('campaign', 'Funnels', name + ' signed up through "' + fn.name + '"' + (consent ? ' and joined your guest list.' : ' (no marketing consent).'), g.id);
        BB.store.commit({ type: 'guest', id: g.id });
      });
      res.writeHead(303, { location: base + '/thanks' }); res.end(); return true;
    }
    if (m !== 'GET' && m !== 'HEAD') return false;
    countView(w, fn, step, req).catch(() => {});
    send(res, 200, FN.page(w.state, prop, fn, step, ctx), HTML, { 'cache-control': 'no-cache' });
    return true;
  }

  return { host, preview, publishedSite, funnel, gen };
};
