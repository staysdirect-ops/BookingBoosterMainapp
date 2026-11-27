/* Bookingbooster: is a host's booking site finished? Shared by the browser and the server engine.
   BB.ready.check(p) lists everything a professional holiday let site needs, marks each step done or not, and gives a
   percentage. A new home in a live account starts in "building": guests and search engines see an "opening soon" page
   until every required step is done and the host presses Go live. A host who gets stuck can hand it to the team once
   the steps only they can do are done (photos, the facts of the home, payouts); the team then writes and polishes the
   words and publishes it from /admin/sites. Homes made before this existed have no launch record and count as live.

   p.launch = { state: 'building' | 'review' | 'live', since, requestedAt, note, teamNote, returnedAt, liveAt, by } */
(function () {
  const BB = window.BB; if (!BB) return;
  const S = () => BB.store.get();
  const A = BB.act;
  const stamp = () => S().today + 'T' + S().clock;
  const txt = v => String(v || '').trim();
  const words = t => txt(t).split(/\s+/).filter(Boolean).length;
  const DEFAULT_HEADLINE = 'book direct and save.';
  const faqsOf = pid => ((S().website || {}).faqs || {})[pid] || [];
  const seoOf = p => (BB.seo && BB.seo.seoOf ? BB.seo.seoOf(p) : Object.assign({ summary: '' }, p.seo || {}));

  // who: 'host' means only the host can do it (their photos, their facts, their bank); 'either' means our team can do
  // it for them in a review. go: where the console sends the host to do it.
  function steps(p) {
    const s = S(), photos = (p.photos || []).filter(x => x && x.url).length, faqs = faqsOf(p.id).length;
    const custom = !!p.domain && !p._autoDomain && !(BB.BOOT && BB.BOOT.sitesDomain && String(p.domain).endsWith('.' + BB.BOOT.sitesDomain));
    return [
      { id: 'photos', title: '10 or more photos', why: photos + ' of 10 added. Your best landscape shots, the first one is the cover.', done: photos >= 10, who: 'host', go: 'website' },
      { id: 'facts', title: 'What the home offers, 6 or more things', why: (p.amenities || []).length + ' listed. Hot tub, log burner, dogs, parking, Wi-Fi: guests and AI assistants match on these.', done: (p.amenities || []).filter(x => txt(x)).length >= 6, who: 'host', go: 'website' },
      { id: 'address', title: 'Full address', why: 'Puts the home on the map in search and in the guest trip app.', done: txt(p.address).length >= 10, who: 'host', go: 'website' },
      { id: 'entry', title: 'How guests get in', why: 'Key safe, lockbox or meet and greet. Guests see it after check-in.', done: txt(p.entry).length >= 10, who: 'host', go: 'website' },
      { id: 'payouts', title: 'Card payments switched on', why: 'Connect Stripe with your UK bank so guests can book and pay instantly.', done: !!(BB.q && BB.q.connected && BB.q.connected('stripe')) || !s.live, who: 'host', go: 'connections' },
      { id: 'headline', title: 'Headline and subheading', why: 'The first words guests read. Say what makes the stay special, not "book direct".', done: txt(p.headline).length >= 8 && txt(p.headline).toLowerCase() !== DEFAULT_HEADLINE && txt(p.sub).length >= 10, who: 'either', go: 'website' },
      { id: 'about', title: 'A full description, 60 words or more', why: words(p.about) + ' words so far. The rooms, the views and what is nearby. Google and AI assistants read it.', done: words(p.about) >= 60, who: 'either', go: 'website' },
      { id: 'faqs', title: '3 or more FAQs', why: faqs + ' added. The questions guests ask you most; AI assistants quote them.', done: faqs >= 3, who: 'either', go: 'website' },
      { id: 'summary', title: 'Answer-first summary for AI search', why: 'Two or three sentences that answer "where should I stay in ' + (txt(p.area).split(',')[0] || 'the area') + '?". In Search health.', done: txt(seoOf(p).summary).length >= 80, who: 'either', go: 'seo' },
      { id: 'domain', title: 'Your own web address', why: 'Optional. Your free address works until then.', done: custom, who: 'host', go: 'website', optional: true },
      { id: 'guide', title: 'Local area guide', why: 'Optional. Three or more places nearby, with how far and your tip.', done: (p.guide || []).length >= 3, who: 'either', go: 'website', optional: true },
      { id: 'hostNote', title: 'A line from you', why: 'Optional. Shown next to your name, it makes the site feel personal.', done: txt(p.hostNote).length >= 10, who: 'either', go: 'website', optional: true },
    ];
  }
  function check(p) {
    const list = steps(p), req = list.filter(x => !x.optional), done = req.filter(x => x.done).length;
    const hostLeft = req.filter(x => !x.done && x.who === 'host'), left = req.filter(x => !x.done);
    return { steps: list, required: req.length, done, pct: Math.round(100 * done / req.length), complete: done === req.length, left, hostLeft, canAskTeam: !hostLeft.length };
  }
  const stateOf = p => (p && p.launch && p.launch.state) || 'live';
  const isOpen = p => stateOf(p) === 'live';
  BB.ready = { check, steps, stateOf, isOpen };

  // Patches from the website editor never touch the launch record: going live has its own checked actions.
  const up0 = A.updateProperty;
  A.updateProperty = function (pid, patch, quiet) { if (patch && typeof patch === 'object' && 'launch' in patch) { patch = Object.assign({}, patch); delete patch.launch; } return up0(pid, patch, quiet); };

  function launch(p, by) {
    const was = stateOf(p);
    p.launch = Object.assign({}, p.launch, { state: 'live', liveAt: stamp(), by: by || 'host' });
    if (was !== 'live' && S().live) BB.fx('site.launched', { propertyId: p.id, by: by || 'host' });
    BB.log('site', by === 'team' ? 'Bookingbooster team' : 'Website editor', p.name + ' is live' + (by === 'team' ? ', finished and published by the Bookingbooster team.' : '. Guests and search engines can see it now.'), p.id, ['Website', p.domain || '']);
  }
  // The host presses Go live once every required step is done.
  A.goLive = function (pid) {
    const p = BB.q.property(pid); if (!p) return { ok: false, error: 'Unknown home' };
    if (isOpen(p)) return { ok: true };
    const r = check(p); if (!r.complete) return { ok: false, error: 'Finish ' + r.left.length + ' more step' + (r.left.length === 1 ? '' : 's') + ' first: ' + r.left.map(x => x.title).join(', ') + '.' };
    launch(p, 'host'); BB.store.commit({ type: 'property', id: pid }); return { ok: true };
  };
  // Stuck on the words? The team finishes them, once the host has done the parts only they can do.
  A.requestSiteReview = function (pid, note) {
    const p = BB.q.property(pid); if (!p) return { ok: false, error: 'Unknown home' };
    if (stateOf(p) !== 'building') return { ok: false, error: isOpen(p) ? 'This site is already live.' : 'Our team already has this site.' };
    const r = check(p); if (!r.canAskTeam) return { ok: false, error: 'Only you can do these, so they come first: ' + r.hostLeft.map(x => x.title).join(', ') + '.' };
    p.launch = Object.assign({}, p.launch, { state: 'review', requestedAt: stamp(), note: txt(note).slice(0, 1000), teamNote: '' });
    if (S().live) BB.fx('site.review', { propertyId: pid });
    BB.log('site', 'Website editor', 'Asked the Bookingbooster team to finish and publish ' + p.name + '.', pid, ['Website', 'Bookingbooster team']);
    BB.store.commit({ type: 'property', id: pid }); return { ok: true };
  };
  A.cancelSiteReview = function (pid) {
    const p = BB.q.property(pid); if (!p || stateOf(p) !== 'review') return { ok: false };
    p.launch = Object.assign({}, p.launch, { state: 'building' });
    BB.store.commit({ type: 'property', id: pid }); return { ok: true };
  };
  // Team only (blocked on /api/act): publish after polishing, or hand it back with a note.
  A.teamLaunch = function (pid) {
    const p = BB.q.property(pid); if (!p) return { ok: false, error: 'Unknown home' };
    const r = check(p); if (!r.complete) return { ok: false, error: 'Still missing: ' + r.left.map(x => x.title).join(', ') + '.' };
    launch(p, 'team'); BB.store.commit({ type: 'property', id: pid }); return { ok: true };
  };
  A.teamReturn = function (pid, note) {
    const p = BB.q.property(pid); if (!p || stateOf(p) === 'live') return { ok: false, error: 'This site is not waiting for the team.' };
    p.launch = Object.assign({}, p.launch, { state: 'building', teamNote: txt(note).slice(0, 1000), returnedAt: stamp() });
    if (S().live) BB.fx('site.returned', { propertyId: pid });
    BB.log('site', 'Bookingbooster team', 'Sent ' + p.name + ' back with a note: ' + txt(note).slice(0, 200), pid, ['Website', 'Bookingbooster team']);
    BB.store.commit({ type: 'property', id: pid }); return { ok: true };
  };
})();
