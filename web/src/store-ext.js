/* Bookingbooster: store extensions shared by the browser and the server engine.
   Actions that used to live inside UI modules are here so the server can run exactly the same rules.
   BB.fx(type, data) queues a real-world side effect (email, text, refund...). The server drains state._fx after
   every action and carries it out; in the browser the queue is simply replaced by the server's copy. */
(function () {
  const BB = window.BB, D = BB.D;
  const S = () => BB.store.get();
  const first = name => String(name || '').split(' ')[0];
  const stamp = () => S().today + 'T' + S().clock;
  const money = BB.money;
  const gOf = b => BB.q.guest(b.guestId) || { id: '', name: 'Guest', email: '', phone: '', tags: [] };
  const P = id => BB.q.property(id) || { id, short: 'Home', name: 'Home', checkinTime: '4pm', checkoutTime: '11am', nightly: 0, weekend: 0 };
  function ciMissing(b) { const c = b.checkin, m = []; if (!c.id) m.push('ID'); if (!c.selfie) m.push('selfie'); if (!c.agreement) m.push('agreement'); if (!c.deposit) m.push('deposit'); return m; }

  BB.fx = function (type, data) { const s = S(); (s._fx = s._fx || []).push({ type, data: data || {}, at: stamp() }); };

  /* ---------- actions moved out of the UI modules ---------- */
  BB.act.sendGuestOffer = function (gid, o) {
    const g = BB.q.guest(gid), p = BB.q.property(o.propertyId); if (!g || !p) return null;
    const code = String(o.code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || first(g.name).toUpperCase() + o.pct;
    S().promos[code] = +o.pct || 10;
    const t = BB.act.openThread(gid);
    const text = 'Hi ' + first(g.name) + ', we would love to have you back at ' + p.name + '. Book direct at ' + p.domain + ' with code ' + code + ' and take ' + o.pct + '% off any dates in the next 6 months.';
    t.messages.push({ from: 'host', text, at: stamp() });
    BB.log('email', 'Guests', 'Sent ' + g.name + ' a come-back offer: ' + o.pct + '% off ' + p.short + ' with code ' + code + '.', t.id, ['Guest profile', 'Email', 'Inbox']);
    if (!BB.q.connected('email')) BB.log('system', 'Guests', 'Email sending is disconnected, so the offer waits in the inbox until it is reconnected.', t.id);
    else BB.fx('email.guest', { guestId: gid, propertyId: p.id, template: 'offer', subject: o.pct + '% off your next stay at ' + p.name, text, threadId: t.id });
    BB.store.commit({ type: 'guest', id: gid });
    return { thread: t, code };
  };
  BB.act.addFaq = function (pid, q, a) {
    const s = S(); s.website.faqs = s.website.faqs || {}; (s.website.faqs[pid] = s.website.faqs[pid] || []).push(q.trim() + '|' + a.trim());
    const p = BB.q.property(pid);
    BB.log('site', 'Website editor', 'Added an FAQ to ' + p.domain + ': "' + q.trim() + '"', pid, ['Website editor', p.domain, 'AI answers']);
    BB.store.commit({ type: 'property', id: pid });
  };
  BB.act.removeFaq = function (pid, i) {
    const list = (S().website.faqs || {})[pid]; if (!list || !list[i]) return;
    list.splice(i, 1); BB.log('site', 'Website editor', 'Removed an FAQ from ' + P(pid).domain + '.', pid); BB.store.commit({ type: 'property', id: pid });
  };
  BB.act.runAiCheck = function () {
    const s = S();
    if (s.live) { s.ai.questions.forEach(q => { q.pending = true; }); BB.log('ai', 'AI visibility', 'Asking AI assistants ' + s.ai.questions.length + ' traveller questions now.', null, ['AI visibility']); BB.fx('ai.check', {}); BB.store.commit({ type: 'ai' }); return; }
    s.ai.checkedAt = s.today; const sc = BB.aiScore();
    BB.log('ai', 'AI visibility', 'Asked ChatGPT, Gemini, Perplexity and Google ' + s.ai.questions.length + ' traveller questions. Your homes came up in ' + sc.score + '% of answers.', null, ['AI visibility', 'Answer engines']);
    BB.fx('ai.check', {});
    BB.store.commit({ type: 'ai' });
  };
  BB.act.addAiQuestion = function (q, pid) {
    q = String(q || '').trim(); if (!q || !BB.q.property(pid)) return;
    S().ai.questions.push({ q, propertyId: pid, engines: { chatgpt: false, gemini: false, perplexity: false, google: false }, pending: true });
    BB.log('ai', 'AI visibility', 'Tracking a new traveller question: "' + q + '".', pid); BB.store.commit({ type: 'ai' });
  };
  BB.act.remindCheckin = function (id) {
    const b = BB.q.booking(id); if (!b) return false;
    const g = gOf(b), p = P(b.propertyId);
    const sms = BB.q.connected('sms'), email = BB.q.connected('email');
    if (!sms && !email) { BB.log('system', 'Check-in reminder', 'Could not remind ' + g.name + ': text and email sending are both disconnected.', id); BB.store.commit({ type: 'checkin', id }); return false; }
    const miss = ciMissing(b);
    BB.log(sms ? 'sms' : 'email', 'Check-in reminder', (sms ? 'Texted ' : 'Emailed ') + g.name + ' a reminder to finish check-in for ' + p.short + (miss.length ? ' (' + miss.join(', ') + ' to go)' : '') + '.', id, ['Host console', sms ? 'Text' : 'Email', 'Guest app']);
    BB.fx(sms ? 'sms.guest' : 'email.guest', { guestId: b.guestId, bookingId: id, propertyId: p.id, template: 'checkin-reminder' });
    BB.store.commit({ type: 'checkin', id }); return true;
  };
  BB.act.markPaid = function (id) {
    const b = BB.q.booking(id); if (!b || b.paid) return;
    b.paid = true; if (b.status === 'pending') b.status = 'confirmed';
    BB.log('payment', 'Host console', 'Marked ' + b.id + ' as paid offline, ' + BB.money(b.total) + ' from ' + gOf(b).name + '.', id);
    BB.store.commit({ type: 'booking', id });
  };
  BB.act.buyExtra = function (bookingId, name, price) {
    const b = BB.q.booking(bookingId); if (!b) return;
    const g = BB.q.guest(b.guestId), p = BB.q.property(b.propertyId);
    b.extras = b.extras || [];
    if (b.extras.some(x => x.name === name)) return;
    b.extras.push({ name, price, at: S().today });
    b.total += price;
    BB.log('payment', 'Stripe', 'Charged ' + money(price) + ' to ' + g.name.split(' ')[0] + "'s card for " + name + ' at ' + p.short + '.', b.id, ['Guest app', 'Stripe']);
    BB.fx('payment.extra', { bookingId, name, price });
    BB.store.commit({ type: 'extra', id: b.id });
  };
  BB.act.rateStay = function (bookingId, stars, text, pub) {
    const b = BB.q.booking(bookingId); if (!b) return;
    const g = BB.q.guest(b.guestId); const code = g.name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '') + '10';
    if (!S().promos[code]) { S().promos[code] = 10; BB.log('campaign', 'Guest app', 'Gave ' + g.name + ' come-back code ' + code + ' for 10% off their next direct stay.', b.id); }
    BB.act.review(bookingId, stars, text, pub);
  };
  BB.act.requestPropertyBooking = function (input) {
    const r = BB.act.createBooking(Object.assign({}, input, { pay: 'manual', channel: 'direct', request: true }));
    if (r.ok && !r.request) {
      const p = BB.q.property(input.propertyId);
      BB.log('payment', p.domain, 'Booking request from ' + r.guest.name + ' for ' + BB.money(r.booking.total) + '. No card was taken. Send a payment link to confirm.', r.booking.id, [p.domain, 'Host console']);
      BB.store.commit({ type: 'booking', id: r.booking.id });
    }
    return r;
  };
  // Guest app request (no card): same as a property-site request, logged from the guest app.
  BB.act.requestGuestBooking = function (input) {
    const r = BB.act.createBooking(Object.assign({}, input, { pay: 'manual', channel: 'direct', request: true }));
    if (r.ok && !r.request) { BB.log('booking', 'Guest app', r.guest.name + ' sent a booking request for ' + P(input.propertyId).short + '. Payment link pending.', r.booking.id); BB.store.commit({ type: 'booking', id: r.booking.id }); }
    return r;
  };
  // Host accepts a booking request: it becomes a confirmed (unpaid) stay, the usual booking messages go out,
  // and the guest gets a payment link when Stripe is connected.
  BB.act.acceptRequest = function (id) {
    const b = BB.q.booking(id); if (!b || b.status !== 'request') return false;
    const g = gOf(b), p = P(b.propertyId);
    b.status = 'confirmed'; b.acceptedAt = stamp();
    BB.log('booking', 'Host console', 'Accepted ' + g.name + '’s request for ' + p.short + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + '.', id, ['Host console']);
    BB.runAutomations('booking.created', b);
    const t = BB.q.threadFor(id); if (t) t.messages.push({ from: 'auto', text: 'Good news ' + g.name.split(' ')[0] + ', your stay at ' + p.name + ' is confirmed for ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + '.' + (BB.q.connected('stripe') ? ' A secure payment link is on its way.' : ' Your host will be in touch about payment.'), at: stamp() });
    if (BB.q.connected('stripe')) BB.fx('payment.link', { bookingId: id });
    BB.store.commit({ type: 'booking', id }); return true;
  };
  BB.act.declineRequest = function (id, reason) {
    const b = BB.q.booking(id); if (!b || b.status !== 'request') return false;
    const g = gOf(b), p = P(b.propertyId);
    b.status = 'cancelled'; b.declined = true;
    const text = 'Hi ' + g.name.split(' ')[0] + ', thank you for asking about ' + p.name + '. Sorry, we cannot take this booking for ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + '.' + (reason ? ' ' + String(reason).slice(0, 400) : '') + ' Nothing was charged.';
    const t = BB.q.threadFor(id); if (t) t.messages.push({ from: 'host', text, at: stamp() });
    BB.fx('email.guest', { guestId: g.id, bookingId: id, template: 'message', subject: 'About your request for ' + p.name, text });
    BB.log('booking', 'Host console', 'Declined ' + g.name + '’s request for ' + p.short + '. The dates are open again.', id, ['Host console']);
    BB.store.commit({ type: 'booking', id }); return true;
  };
  // Host sends a payment link for an unpaid booking (request, or a booking taken by phone).
  BB.act.sendPaymentLink = function (id) {
    const b = BB.q.booking(id); if (!b || b.paid) return false;
    BB.log('payment', 'Host console', 'Sent ' + gOf(b).name + ' a secure payment link for ' + money(b.total) + '.', id, ['Host console', 'Email', 'Stripe']);
    BB.fx('payment.link', { bookingId: id });
    BB.store.commit({ type: 'booking', id }); return true;
  };
  // Import the host's own guest list (CSV pasted or uploaded). Only guests who agreed to hear from the host are subscribed.
  BB.act.importGuests = function (rows, opts) {
    const s = S(); const consent = !!(opts && opts.consent); let added = 0, updated = 0, skipped = 0;
    const iso = v => { const m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/) || String(v || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (!m) return null; return m[1].length === 4 ? m[1] + '-' + m[2] + '-' + m[3] : m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); };
    (rows || []).slice(0, 5000).forEach(r => {
      const email = String(r.email || '').trim().toLowerCase(); const name = String(r.name || '').trim().slice(0, 80);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { skipped++; return; }
      const last = iso(r.lastStay), stays = Math.max(0, Math.min(99, parseInt(r.stays, 10) || (last ? 1 : 0)));
      const ex = s.guests.find(g => (g.email || '').toLowerCase() === email);
      if (ex) { if (last && (!ex.lastStay || last > ex.lastStay)) ex.lastStay = last; if (stays > (ex.stays || 0)) ex.stays = stays; if (consent && !ex.unsubscribedAt) ex.subscribed = true; if (r.phone && !ex.phone) ex.phone = String(r.phone).slice(0, 30); updated++; return; }
      s.guests.push({ id: 'g' + (++s.seq), name: name || email.split('@')[0], email, phone: String(r.phone || '').slice(0, 30), city: String(r.city || '').slice(0, 40), tags: ['Imported'].concat(/^(y|yes|true|1)$/i.test(String(r.dog || r.pets || '')) ? ['Pet owner'] : []),
        subscribed: consent, source: 'import', notes: '', lastStay: last, stays, firstSeen: s.today });
      added++;
    });
    BB.log('campaign', 'Guests', 'Imported ' + added + ' guest' + (added === 1 ? '' : 's') + (updated ? ', updated ' + updated : '') + (skipped ? ', skipped ' + skipped + ' without a valid email' : '') + '.' + (consent ? '' : ' They are not subscribed, so campaigns will not go to them.'), null, ['Guests']);
    BB.store.commit({ type: 'guest' });
    return { added, updated, skipped };
  };
  // Calendar link (iCal) for an add-on calendar, per home. Stored on the integration so the server can read it.
  BB.act.setCalendarLink = function (id, pid, url) {
    const i = BB.q.integration(id); if (!i) return;
    i.links = i.links || {}; url = String(url || '').trim();
    if (url) i.links[pid] = url; else delete i.links[pid];
    if (url && !i.connected) { i.connected = true; i.lastSync = stamp(); }
    if (url && S().live) S().account.addon = true;
    if (!url && !Object.keys(i.links).length) i.connected = false;
    BB.log('sync', i.name, (url ? 'Saved the calendar link for ' : 'Removed the calendar link for ') + P(pid).short + '.', id);
    if (url) BB.fx('ical.sync', { id });
    BB.store.commit({ type: 'integration', id });
  };
  // Replace the dates read from one calendar link with what the server found in it (dates only).
  BB.act.applyCalendar = function (id, pid, ranges) {
    const i = BB.q.integration(id); if (!i) return { added: 0, removed: 0 };
    const s = S(); const before = s.blocks.filter(k => k.sync === id && k.propertyId === pid);
    const key = k => k.from + '|' + k.to;
    const have = new Set(before.map(key)), want = new Set(ranges.map(key));
    const removed = before.filter(k => !want.has(key(k))).length;
    s.blocks = s.blocks.filter(k => !(k.sync === id && k.propertyId === pid && !want.has(key(k))));
    let added = 0; const p = P(pid);
    ranges.forEach(r => { if (!have.has(key(r)) && r.to > s.today) { s.blocks.push({ propertyId: pid, from: r.from, to: r.to, note: BB.bookedOn(id), sync: id }); added++;
      const clash = s.bookings.find(b => b.propertyId === pid && b.status !== 'cancelled' && b.checkIn < r.to && b.checkOut > r.from);
      if (clash) { BB.notify('Possible double booking at ' + p.short, BB.bookedOn(id) + ' ' + D.fmt(r.from) + '–' + D.fmt(r.to) + ' overlaps ' + clash.id + '. Check both calendars.', clash.id); BB.log('sync', i.name, 'Overlap: ' + BB.bookedOn(id) + ' ' + D.fmt(r.from) + '–' + D.fmt(r.to) + ' clashes with ' + clash.id + ' at ' + p.short + '.', clash.id); }
    } });
    i.lastSync = stamp();
    if (added || removed) BB.log('sync', i.name, BB.bookedOn(id) + ': ' + added + ' new and ' + removed + ' removed date range' + (added + removed === 1 ? '' : 's') + ' at ' + p.short + '. Your sites are up to date.', pid, [i.name, 'Your calendar', p.domain]);
    BB.store.commit({ type: 'sync', quiet: !(added || removed) });
    return { added, removed };
  };
  // Results from real AI checks, run by the server against the answer engines the platform has keys for.
  BB.act.applyAiResults = function (results) {
    const s = S(); let changed = 0;
    results.forEach(r => { const q = s.ai.questions[r.i]; if (!q) return; Object.keys(r.engines).forEach(k => { if (q.engines[k] !== r.engines[k]) changed++; q.engines[k] = r.engines[k]; }); q.pending = false; if (r.answers) q.answers = r.answers; });
    s.ai.checkedAt = s.today; s.ai.live = true;
    const sc = BB.aiScore();
    BB.log('ai', 'AI visibility', 'Checked ' + s.ai.questions.length + ' traveller questions in ChatGPT, Gemini, Perplexity and Google. Your homes came up in ' + sc.score + '% of answers' + (changed ? ', ' + changed + ' changed since last time.' : '.'), null, ['AI visibility', 'Answer engines']);
    BB.store.commit({ type: 'ai' });
  };
  // Payment confirmed by Stripe (webhook). Turns a pending booking into a confirmed, paid one.
  BB.act.paymentConfirmed = function (id, info) {
    const b = BB.q.booking(id); if (!b) return;
    const was = b.status; b.paid = true; if (b.status === 'pending') b.status = 'confirmed';
    b.payment = Object.assign({}, b.payment || {}, info || {});
    BB.log('payment', 'Stripe', 'Charged ' + money(b.total) + ' to ' + first(gOf(b).name) + "'s card. Payout lands in 2 days.", id, ['Booking site', 'Stripe']);
    if (was === 'pending') { BB.runAutomations('booking.created', b); BB.notify('Payment received · ' + money(b.total), gOf(b).name + ' paid for ' + P(b.propertyId).short + '.', id); }
    BB.store.commit({ type: 'booking', id });
  };
  BB.act.expirePending = function (id) {
    const b = BB.q.booking(id); if (!b || b.status !== 'pending') return;
    b.status = 'cancelled'; BB.log('booking', 'Booking site', 'Released ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + ' at ' + P(b.propertyId).short + ': ' + gOf(b).name + ' did not finish paying.', id);
    BB.store.commit({ type: 'booking', id });
  };
  BB.act.unsubscribe = function (gid) { const g = BB.q.guest(gid); if (!g || !g.subscribed) return; g.subscribed = false; g.unsubscribedAt = S().today; BB.log('campaign', 'Guest list', g.name + ' unsubscribed from emails.', gid); BB.store.commit({ type: 'guest', id: gid }); };
  BB.act.updateAccount = function (patch) { Object.assign(S().account, patch); BB.store.commit({ type: 'account' }); };

  /* ---------- blank workspace for a real host ---------- */
  BB.aiQuestionsFor = function (p) {
    const area = String(p.area || '').split(',')[0].trim() || 'the area';
    const kind = { cabin: 'cabin', lake: 'cottage', city: 'apartment' }[p.theme] || 'holiday let';
    const qs = [kind + ' to stay in ' + area, 'best place to stay in ' + area + ' for a weekend', (p.petsAllowed ? 'dog friendly ' : 'quiet ') + kind + ' ' + area];
    if ((p.amenities || []).some(a => /hot tub/i.test(a))) qs.push(kind + ' with hot tub in ' + area);
    return qs.map(q => ({ q, propertyId: p.id, engines: { chatgpt: false, gemini: false, perplexity: false, google: false }, pending: true }));
  };
  BB.seedBlank = function (o) {
    const today = o.today, clock = o.clock || '09:00';
    const tmpl = BB.seedDemo();
    const integrations = tmpl.integrations.map(i => Object.assign({}, i, { connected: i.id === 'email', lastSync: i.id === 'email' ? today + 'T' + clock : null,
      detail: { stripe: 'Take card, Apple Pay and Google Pay payments and deposit holds. Payouts go to your bank.', lock: 'Create a unique door code for every stay', email: 'Sends from Bookingbooster for you, with replies going to your own inbox', sms: 'Text guests their check-in link and door code', google: 'Keep your Google Business Profile in step with your site', gsc: 'See which searches find your sites' }[i.id] || i.detail }));
    return {
      v: 1, live: true, today, clock,
      account: { business: o.business, owner: o.owner, email: o.email, plan: o.plan || 'Growth', onboarded: false },
      properties: [], guests: [], bookings: [], threads: [], campaigns: [], automations: tmpl.automations.map(a => Object.assign({}, a, { runs: 0, on: a.id !== 'a6', steps: a.steps.map(x => x.replace(' with wallet pass', '')) })), integrations,
      ai: { checkedAt: null, questions: [], tasks: [] }, website: { visitors: {}, fromSearch: 0, conversion: 0, faqs: {} }, promos: { WELCOME5: 5 },
      blocks: [], events: [], notifications: [], seq: 100,
    };
  };
})();
