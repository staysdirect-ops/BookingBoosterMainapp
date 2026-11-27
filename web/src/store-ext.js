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
    S().ai.questions.push({ q, propertyId: pid, engines: { chatgpt: false, gemini: false, perplexity: false, claude: false, google: false }, pending: true });
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
    b.paid = true; b.paidAt = S().today; if (b.status === 'pending') b.status = 'confirmed';
    if (b.payBy === 'transfer') {
      const g = gOf(b), p = P(b.propertyId);
      BB.log('payment', 'Host console', 'Bank transfer received for ' + b.id + ': ' + money(b.total) + ' from ' + g.name + '. Invoice ' + (b.invoice ? b.invoice.no : '') + ' is paid.', id, ['Host console', 'Email']);
      const t = BB.q.threadFor(id); if (t) t.messages.push({ from: 'auto', text: 'Thanks ' + first(g.name) + ', your bank transfer of ' + money(b.total) + ' has arrived. Your stay at ' + p.name + ' is paid in full.', at: stamp() });
      // The booking email was held back while the invoice was open; now it goes out as a paid confirmation.
      if (BB.q.connected('email')) BB.fx('email.guest', { guestId: b.guestId, bookingId: id, propertyId: b.propertyId, template: 'confirmation' });
      if (b.checkin && b.checkin.done) BB.fx(BB.q.connected('sms') ? 'sms.guest' : 'email.guest', { guestId: b.guestId, bookingId: id, propertyId: b.propertyId, template: 'door-code' });
    } else BB.log('payment', 'Host console', 'Marked ' + b.id + ' as paid offline, ' + BB.money(b.total) + ' from ' + gOf(b).name + '.', id);
    BB.store.commit({ type: 'booking', id });
  };
  /* ---------- bank transfer and invoices ---------- */
  // The host's bank details for guests who would rather pay by bank transfer than by card.
  const BANK_KEYS = { holder: 70, bankName: 60, sortCode: 8, account: 8, iban: 34, bic: 11, note: 300 };
  BB.bankReady = function (s) { const k = (s || S()).account.bank; return !!(k && k.on && k.holder && ((k.sortCode && k.account) || k.iban)); };
  BB.transferDays = function (s) { const k = (s || S()).account.bank; return Math.max(1, Math.min(30, (k && +k.days) || 3)); };
  // Due in the host's number of days, but never later than the day before arrival (or today, for a last-minute stay).
  BB.transferDue = function (b) { const t = S().today, due = D.add(t, BB.transferDays()), last = D.add(b.checkIn, -1); return due < last ? due : (last > t ? last : t); };
  // How guests pay on the host's own sites: 'card' (Stripe), 'transfer' (bank transfer) or 'both' (the default).
  // Bank transfer only counts once the bank details are complete, so a host can never be left with no way to get paid.
  BB.GUEST_PAY = ['both', 'card', 'transfer'];
  BB.guestPay = function (s) {
    s = s || S(); const want = BB.GUEST_PAY.includes(s.account.guestPay) ? s.account.guestPay : 'both';
    const transfer = want !== 'card' && BB.bankReady(s), card = want !== 'transfer' || !transfer;
    return { want, card, transfer, mode: card && transfer ? 'both' : card ? 'card' : 'transfer' };
  };
  BB.act.setGuestPay = function (mode) {
    if (!BB.GUEST_PAY.includes(mode)) return { ok: false, error: 'Choose card, bank transfer, or both.' };
    if (mode !== 'card' && !BB.bankReady()) return { ok: false, error: 'Add your bank details and turn on bank transfer first.' };
    S().account.guestPay = mode;
    BB.log('payment', 'Payments', mode === 'card' ? 'Guests now pay by card through Stripe only.' : mode === 'transfer' ? 'Guests now book and pay by bank transfer only.' : 'Guests can now choose to pay by card or by bank transfer.', null, ['Payments']);
    BB.store.commit({ type: 'account' }); return { ok: true };
  };
  BB.act.saveBankTransfer = function (patch) {
    const a = S().account, k = Object.assign({}, a.bank || {});
    patch = patch || {};
    Object.keys(BANK_KEYS).forEach(f => { if (patch[f] !== undefined) k[f] = String(patch[f] || '').trim().slice(0, BANK_KEYS[f]); });
    if (patch.sortCode !== undefined) { const d = String(patch.sortCode).replace(/\D/g, ''); k.sortCode = d.length === 6 ? d.slice(0, 2) + '-' + d.slice(2, 4) + '-' + d.slice(4) : ''; }
    if (patch.account !== undefined) { const d = String(patch.account).replace(/\D/g, ''); k.account = d.length === 8 ? d : ''; }
    if (patch.iban !== undefined) k.iban = String(patch.iban).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 34);
    if (patch.bic !== undefined) k.bic = String(patch.bic).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11);
    if (patch.days !== undefined) k.days = Math.max(1, Math.min(30, parseInt(patch.days, 10) || 3));
    if (patch.on !== undefined) k.on = !!patch.on;
    a.bank = k;
    if (k.on && !BB.bankReady()) { k.on = false; BB.store.commit({ type: 'account' }); return { ok: false, error: 'Add the account name and either a sort code and 8-digit account number, or an IBAN.' }; }
    BB.log('payment', 'Payments', k.on ? 'Bank transfer is on. Guests can book and pay by invoice within ' + BB.transferDays() + ' days.' : 'Bank transfer details saved. Guests cannot choose bank transfer at checkout.', null, ['Payments']);
    BB.store.commit({ type: 'account' }); return { ok: true };
  };
  // A guest books on the site and pays by bank transfer: the stay is booked, unpaid, with an invoice due in a few days.
  BB.act.bookByTransfer = function (input) {
    if (!BB.guestPay().transfer) return { ok: false, error: 'Bank transfer is not available for this home. Pay by card or send a booking request.' };
    return BB.act.createBooking(Object.assign({}, input, { pay: 'manual', channel: 'direct', payBy: 'transfer', pending: false, request: false }));
  };
  // Host sends an invoice with bank details for any unpaid direct booking (a phone booking, or an accepted request).
  BB.act.sendInvoice = function (id) {
    const b = BB.q.booking(id); if (!b || b.paid || b.channel !== 'direct' || !['confirmed', 'pending'].includes(b.status)) return { ok: false, error: 'Only unpaid direct bookings can be invoiced.' };
    if (!BB.bankReady()) return { ok: false, error: 'Add your bank details in Payments first.' };
    const again = b.payBy === 'transfer' && b.invoice;
    b.payBy = 'transfer'; if (b.status === 'pending') { b.status = 'confirmed'; delete b.holdUntil; }
    if (!b.invoice) b.invoice = { no: 'INV-' + b.id, issued: S().today, due: BB.transferDue(b) };
    b.invoice.sentAt = stamp();
    BB.log('payment', 'Host console', (again ? 'Emailed ' : 'Sent ') + gOf(b).name + ' invoice ' + b.invoice.no + ' for ' + money(b.total) + ', due by bank transfer ' + D.fmt(b.invoice.due) + '.', id, ['Host console', 'Email']);
    BB.fx('payment.invoice', { bookingId: id });
    BB.store.commit({ type: 'booking', id }); return { ok: true };
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
  // Damage deposit: the guest saved a card at check-in (nothing is charged then). The host can charge up to the deposit
  // for damage, until 3 days after checkout. The server takes it from the saved card and pays it out to the host.
  BB.DEPOSIT = 200;
  BB.damageLeft = b => Math.max(0, BB.DEPOSIT - (b.damage || []).filter(x => x.status !== 'failed').reduce((t, x) => t + x.amount, 0));
  BB.canChargeDamage = b => !!(b && b.checkin && b.checkin.deposit && ['held', 'releasing'].includes(b.deposit) && b.status !== 'cancelled' && b.status !== 'request' &&
    D.add(b.checkOut, 3) >= S().today && BB.damageLeft(b) > 0);
  BB.act.chargeDamage = function (id, amount, reason) {
    const b = BB.q.booking(id); if (!BB.canChargeDamage(b)) return { ok: false, error: 'There is no saved card to charge for this stay.' };
    if ((b.damage || []).some(x => x.status === 'charging')) return { ok: false, error: 'A charge for this stay is still going through. Try again in a minute.' };
    amount = Math.round(Number(amount) * 100) / 100; reason = String(reason || '').trim().slice(0, 200);
    const left = BB.damageLeft(b);
    if (!(amount >= 1 && amount <= left)) return { ok: false, error: 'Enter an amount from £1 to ' + money(left) + '.' };
    if (!reason) return { ok: false, error: 'Say what the charge is for. The guest sees this.' };
    const n = (b.damage = b.damage || []).length + 1, live = S().live;
    b.damage.push({ n, amount, reason, at: stamp(), status: live ? 'charging' : 'paid' });
    BB.log('payment', 'Host console', (live ? 'Charging ' : 'Charged ') + money(amount) + ' to ' + first(gOf(b).name) + '’s saved card for damage: ' + reason + '.', id, ['Host console', 'Stripe']);
    if (live) BB.fx('payment.damage', { bookingId: id, n });
    BB.store.commit({ type: 'booking', id }); return { ok: true };
  };
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
  /* ---------- contacts (CSV upload with column mapping and dedupe) ----------
     Everything runs here, in the browser for the preview and on the server for the saved copy. No outside service. */
  const CT = BB.contacts = {};
  CT.MAX = 5000;
  CT.FIELDS = [['name', 'Full name'], ['firstName', 'First name'], ['lastName', 'Last name'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'Town or city'],
    ['lastStay', 'Last stay date'], ['stays', 'Number of stays'], ['tags', 'Tags'], ['notes', 'Notes'], ['dog', 'Has a dog'], ['consent', 'Agreed to emails']];
  // CSV, semicolon or tab separated text into rows of cells. Handles quotes, doubled quotes and line breaks inside quotes.
  CT.parse = function (text) {
    text = String(text || '').replace(/^﻿/, '');
    const first = (text.split(/\r?\n/)[0] || '');
    const count = ch => first.split(ch).length - 1;
    const sep = count('\t') > count(',') && count('\t') >= count(';') ? '\t' : count(';') > count(',') ? ';' : ',';
    const rows = []; let row = [], cell = '', q = false;
    for (let i = 0; i < text.length; i++) { const c = text[i];
      if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
      else if (c === '"' && !cell.trim()) { q = true; cell = ''; }
      else if (c === sep) { row.push(cell.trim()); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell.trim()); if (row.some(Boolean)) rows.push(row); row = []; cell = ''; if (rows.length > CT.MAX + 1) break; }
      else cell += c; }
    row.push(cell.trim()); if (row.some(Boolean)) rows.push(row);
    return rows;
  };
  const EMAIL_RE = /^[^@\s<>",;]+@[^@\s<>",;]+\.[^@\s<>",;.]{2,}$/;
  CT.email = v => { const e = String(v || '').trim().replace(/^mailto:/i, '').toLowerCase(); return EMAIL_RE.test(e) ? e.slice(0, 120) : ''; };
  // Phone numbers compared on digits only, with UK +44 / 0044 written the same as a leading 0.
  CT.phoneKey = v => {
    let d = String(v || '').trim().replace(/[^\d+]/g, '');
    if (/^\+44|^0044/.test(d)) d = '0' + d.replace(/^\+44|^0044/, '').replace(/^0/, '');
    else if (/^44\d{10}$/.test(d)) d = '0' + d.slice(2);
    else if (d[0] === '+') d = '+' + d.slice(1).replace(/\+/g, ''); else d = d.replace(/\+/g, '');
    if (/^7\d{9}$/.test(d)) d = '0' + d; // spreadsheets drop the leading 0 of UK mobiles
    return d.replace(/\D/g, '').length >= 7 ? d : '';
  };
  CT.date = v => {
    const s = String(v || '').trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0');
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (+m[2] > 12) return null; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); } // UK order: day first
    return null;
  };
  // Guess what each column holds from its heading, then from what is in it.
  CT.guess = function (head, sample) {
    const R = [['email', /e-?mail/], ['firstName', /^(first|given|fore)\s*name|^first$/], ['lastName', /^(last|family|sur)\s*name|^surname$|^last$/], ['phone', /phone|mobile|tel|cell|whats/],
      ['lastStay', /last|check(ed)?.?(out|in)|stay(ed)?\s*(on|date)|^date|arriv|depart/], ['stays', /^stays$|times|visits|number of|^bookings$|count/], ['city', /city|town|location|^place/],
      ['dog', /dog|pet/], ['consent', /consent|opt.?in|marketing|subscri|newsletter|agreed/], ['tags', /^tags?$|label|group|segment/], ['notes', /note|comment/], ['name', /name|guest|contact|customer|^who$/]];
    const used = new Set();
    return head.map((h, i) => {
      const k = String(h || '').trim().toLowerCase();
      let f = (R.find(([f, re]) => re.test(k) && !used.has(f)) || [])[0];
      if (!f) { const vals = sample.map(r => r[i] || '').filter(Boolean); if (vals.length && vals.every(v => CT.email(v))) f = 'email'; else if (vals.length && vals.every(v => CT.phoneKey(v) && !/[a-z]/i.test(v))) f = 'phone'; }
      if (f && used.has(f)) f = '';
      if (f) used.add(f); return f || '';
    });
  };
  // Does the first row look like headings rather than a contact?
  CT.hasHeader = rows => !!rows.length && !rows[0].some(v => CT.email(v)) && rows[0].some(v => /[a-z]/i.test(v));
  // Rows of cells plus a column map into contact objects.
  CT.apply = function (rows, map) {
    return rows.slice(0, CT.MAX).map(r => { const o = {}; map.forEach((f, i) => { if (f && r[i] != null && String(r[i]).trim()) o[f] = o[f] ? o[f] + ' ' + String(r[i]).trim() : String(r[i]).trim(); }); return o; });
  };
  const yes = v => /^(y|yes|true|1|x|✓|ticked|agreed|subscribed|opted.?in)$/i.test(String(v || '').trim());
  const cleanRow = r => {
    const name = (String(r.name || '').trim() || [r.firstName, r.lastName].filter(Boolean).join(' ').trim()).replace(/\s+/g, ' ').slice(0, 80);
    const tags = String(r.tags || '').split(/[,;|]/).map(t => t.trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean).slice(0, 8);
    return { name, email: CT.email(r.email), phoneKey: CT.phoneKey(r.phone), phone: String(r.phone || '').trim().slice(0, 30), city: String(r.city || '').trim().slice(0, 40),
      lastStay: CT.date(r.lastStay), stays: Math.max(0, Math.min(99, parseInt(r.stays, 10) || 0)), tags, notes: String(r.notes || '').trim().slice(0, 500), dog: yes(r.dog) || yes(r.pets), consent: r.consent == null ? null : yes(r.consent) };
  };
  // Work out what an upload would do, without changing anything. Rows sharing an email or phone number are one contact.
  CT.plan = function (rows) {
    const s = S(), byEmail = new Map(), byPhone = new Map();
    s.guests.forEach(g => { const e = CT.email(g.email); if (e && !byEmail.has(e)) byEmail.set(e, g); const p = CT.phoneKey(g.phone); if (p && !byPhone.has(p)) byPhone.set(p, g); });
    const out = [], fileEmail = new Map(), filePhone = new Map(), claimed = new Map(); let invalid = 0, dupes = 0;
    (rows || []).slice(0, CT.MAX).forEach((raw, i) => {
      const c = cleanRow(raw);
      if (!c.email && !c.phoneKey) { invalid++; out.push({ row: i, status: 'skip', c, why: raw.email || raw.phone ? 'Email and phone both look wrong' : 'No email or phone' }); return; }
      // A phone match only counts when the emails don't disagree: two people can share a home phone.
      const differ = (x, y) => !!(x && y && x !== y);
      const byP = c.phoneKey && byPhone.get(c.phoneKey);
      const ex = (c.email && byEmail.get(c.email)) || (byP && !differ(c.email, CT.email(byP.email)) ? byP : null) || null;
      const pt = c.phoneKey && filePhone.get(c.phoneKey);
      const twin = (c.email && fileEmail.get(c.email)) || (ex && claimed.get(ex.id)) || (!ex && pt && !differ(c.email, pt.c.email) ? pt : null);
      if (twin) { dupes++; merge(twin.c, c); index(twin); out.push({ row: i, status: 'dupe', c, of: twin.row }); return; }
      const e = { row: i, status: ex ? 'update' : 'new', c, guestId: ex ? ex.id : null, by: ex ? (c.email && byEmail.get(c.email) === ex ? 'email' : 'phone') : null };
      if (ex) claimed.set(ex.id, e);
      out.push(e); index(e);
    });
    function index(e) { if (e.c.email && !fileEmail.has(e.c.email)) fileEmail.set(e.c.email, e); if (e.c.phoneKey && !filePhone.has(e.c.phoneKey)) filePhone.set(e.c.phoneKey, e); }
    function merge(a, b) {
      ['name', 'email', 'phone', 'phoneKey', 'city', 'notes'].forEach(k => { if (!a[k] && b[k]) a[k] = b[k]; });
      if (b.lastStay && (!a.lastStay || b.lastStay > a.lastStay)) a.lastStay = b.lastStay; a.stays = Math.max(a.stays, b.stays);
      b.tags.forEach(t => { if (!a.tags.some(x => x.toLowerCase() === t.toLowerCase())) a.tags.push(t); }); a.dog = a.dog || b.dog; if (b.consent != null) a.consent = a.consent === false ? false : b.consent;
    }
    const n = k => out.filter(x => x.status === k).length;
    return { rows: out, added: n('new'), updated: n('update'), duplicates: dupes, invalid, total: (rows || []).length, capped: (rows || []).length > CT.MAX };
  };
  // Upload contacts. opts.consent: they all agreed to emails (a per-row "agreed" column wins when it is mapped).
  // opts.sms: they agreed to texts. opts.tag: an extra tag for this upload. Anyone who unsubscribed stays unsubscribed.
  BB.act.importContacts = function (rows, opts) {
    opts = opts || {}; const s = S(); const plan = CT.plan(rows);
    const tag = String(opts.tag || '').trim().replace(/\s+/g, ' ').slice(0, 24);
    const addTags = (g, list) => list.forEach(t => { if (t && !g.tags.some(x => x.toLowerCase() === t.toLowerCase())) g.tags.push(t); });
    let subscribed = 0;
    plan.rows.forEach(e => {
      if (e.status !== 'new' && e.status !== 'update') return;
      const c = e.c; const agreed = c.consent == null ? !!opts.consent : c.consent;
      let g;
      if (e.status === 'update') {
        g = BB.q.guest(e.guestId); if (!g) return;
        if (!g.email && c.email) g.email = c.email;
        if (!g.phone && c.phone) g.phone = c.phone;
        if ((!g.name || g.name === (g.email || '').split('@')[0]) && c.name) g.name = c.name;
        if (!g.city && c.city) g.city = c.city;
        if (c.notes && !(g.notes || '').includes(c.notes)) g.notes = ((g.notes ? g.notes + '\n' : '') + c.notes).slice(0, 2000);
        if (c.lastStay && (!g.lastStay || c.lastStay > g.lastStay)) g.lastStay = c.lastStay;
        if (c.stays > (g.stays || 0)) g.stays = c.stays;
      } else {
        g = { id: 'g' + (++s.seq), name: c.name || (c.email ? c.email.split('@')[0] : 'Contact ' + c.phone), email: c.email, phone: c.phone, city: c.city, tags: ['Imported'],
          subscribed: false, source: 'import', notes: c.notes, lastStay: c.lastStay, stays: c.stays || (c.lastStay ? 1 : 0), firstSeen: s.today, createdAt: s.today };
        s.guests.push(g);
      }
      g.tags = g.tags || []; addTags(g, c.tags.concat(c.dog ? ['Pet owner'] : [], tag ? [tag] : []));
      if (agreed && g.email && !g.unsubscribedAt && !g.subscribed) { g.subscribed = true; subscribed++; }
      if (opts.sms && g.phone && !g.smsOptOut) g.smsOptIn = true;
    });
    const r = { added: plan.added, updated: plan.updated, duplicates: plan.duplicates, skipped: plan.invalid, subscribed };
    BB.log('campaign', 'Contacts', 'Uploaded contacts: ' + r.added + ' new, ' + r.updated + ' matched to people already here' + (r.duplicates ? ', ' + r.duplicates + ' duplicate row' + (r.duplicates === 1 ? '' : 's') + ' merged' : '') +
      (r.skipped ? ', ' + r.skipped + ' skipped without an email or phone' : '') + '. ' + (r.subscribed ? r.subscribed + ' subscribed to your emails.' : 'Nobody new was subscribed, so campaigns will not go to them.'), null, ['Contacts']);
    BB.store.commit({ type: 'guest' });
    return r;
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
    results.forEach(r => { const q = s.ai.questions[r.i]; if (!q) return; Object.keys(r.engines).forEach(k => { if (q.engines[k] !== r.engines[k]) changed++; q.engines[k] = r.engines[k]; }); q.pending = false; if (r.answers) q.answers = r.answers; if (r.cited) q.cited = r.cited; if (r.sources) q.sources = r.sources; });
    s.ai.checkedAt = s.today; s.ai.live = true;
    const sc = BB.aiScore();
    BB.log('ai', 'AI visibility', 'Checked ' + s.ai.questions.length + ' traveller questions in ChatGPT, Gemini, Perplexity and Google. Your homes came up in ' + sc.score + '% of answers' + (changed ? ', ' + changed + ' changed since last time.' : '.'), null, ['AI visibility', 'Answer engines']);
    BB.store.commit({ type: 'ai' });
  };
  // Payment confirmed by Stripe (webhook). Turns a pending booking into a confirmed, paid one.
  BB.act.paymentConfirmed = function (id, info) {
    const b = BB.q.booking(id); if (!b) return;
    if (info && info.intent && b.payment && b.payment.intent === info.intent && (b.paid || b.lateRefund)) return; // Stripe sent the same event again
    // The payment landed after the 30 minute hold was released (Stripe's own session lasts a minute longer, and webhooks
    // can arrive late). Take the stay back if the nights are still free; otherwise, or if it was cancelled on purpose, refund the card.
    if (b.status === 'cancelled') {
      b.payment = Object.assign({}, b.payment || {}, info || {});
      if (!b.expired || !BB.q.isAvailable(b.propertyId, b.checkIn, b.checkOut, b.id)) {
        b.lateRefund = true; BB.fx('payment.refund', { bookingId: id });
        BB.log('payment', 'Stripe', first(gOf(b).name) + ' paid ' + money(b.total) + ' after ' + b.id + ' was released, and the dates are no longer free. The payment is being refunded to their card.', id, ['Booking site', 'Stripe']);
        BB.notify('Late payment refunded · ' + money(b.total), gOf(b).name + ' paid after the hold ran out. Stripe is refunding it.', id);
        BB.store.commit({ type: 'booking', id }); return;
      }
      b.status = 'pending'; delete b.expired;
    }
    const was = b.status; b.paid = true; if (b.status === 'pending') { b.status = 'confirmed'; delete b.holdUntil; }
    b.payment = Object.assign({}, b.payment || {}, info || {});
    BB.log('payment', 'Stripe', 'Charged ' + money(b.total) + ' to ' + first(gOf(b).name) + "'s card. Payout lands in 2 days.", id, ['Booking site', 'Stripe']);
    if (was === 'pending') { BB.runAutomations('booking.created', b); BB.notify('Payment received · ' + money(b.total), gOf(b).name + ' paid for ' + P(b.propertyId).short + '.', id); }
    BB.store.commit({ type: 'booking', id });
  };
  BB.act.expirePending = function (id) {
    const b = BB.q.booking(id); if (!b || b.status !== 'pending') return;
    b.status = 'cancelled'; b.expired = true; BB.log('booking', 'Booking site', 'Released ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + ' at ' + P(b.propertyId).short + ': ' + gOf(b).name + ' did not finish paying.', id);
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
    return qs.map(q => ({ q, propertyId: p.id, engines: { chatgpt: false, gemini: false, perplexity: false, claude: false, google: false }, pending: true }));
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

  /* ---------- calendar sync add-on: more calendars and channel manager APIs ---------- */
  // Added to every account, old or new, the first time it loads.
  BB.SYNC_EXTRA = [
    { id: 'other', name: 'Other calendar', group: 'Add-ons', addon: true, connected: false, detail: 'Optional. Paste a calendar link (iCal) from any other site, such as a small agency or a site not in our list. Dates booked there are blocked on your sites.', lastSync: null },
    { id: 'beds24', name: 'Beds24', group: 'Add-ons', addon: true, api: true, connected: false, detail: 'Two-way sync with your Beds24 account. Dates booked there close on your sites, and direct bookings close the dates in Beds24 within minutes.', lastSync: null },
    { id: 'smoobu', name: 'Smoobu', group: 'Add-ons', addon: true, api: true, connected: false, detail: 'Two-way sync with your Smoobu account. Dates booked there close on your sites, and direct bookings close the dates in Smoobu within minutes.', lastSync: null },
    { id: 'hostaway', name: 'Hostaway', group: 'Add-ons', addon: true, api: true, connected: false, detail: 'Two-way sync with your Hostaway account. Dates booked there close on your sites, and direct bookings close the dates in Hostaway within minutes.', lastSync: null },
    { id: 'guesty', name: 'Guesty', group: 'Add-ons', addon: true, api: true, connected: false, detail: 'Two-way sync with your Guesty account. Dates booked there close on your sites, and direct bookings close the dates in Guesty within minutes.', lastSync: null },
    { id: 'lodgify', name: 'Lodgify', group: 'Add-ons', addon: true, api: true, readOnly: true, connected: false, detail: 'Reads your Lodgify bookings every few minutes so those dates close on your sites. Lodgify reads your direct bookings back from your Bookingbooster calendar link.', lastSync: null },
  ];
  // All channels: one connection that lists every home on Airbnb, Booking.com, Vrbo, Expedia and 70+ more,
  // keeps open dates (and, on the All channels plan, prices and minimum stays) in step everywhere, and brings their
  // bookings back here. Bookingbooster runs the connection, so the host never needs an account of their own.
  BB.SYNC_EXTRA.push({ id: 'hub', name: 'All channels', group: 'Add-ons', addon: true, hub: true, connected: false, detail: 'List your homes on Airbnb, Booking.com, Vrbo, Expedia and 70+ more sites from one place. Dates, and on the All channels plan prices, stay in step everywhere, and every booking lands here.', lastSync: null });
  BB.CHANNEL.hub = 'All channels';
  BB.ALL_CHANNELS = { price: 29, addon: 15 };
  // Short names for the booking sites a booking can come from.
  BB.OTA = { BookingCom: 'Booking.com', Airbnb: 'Airbnb', AirBNB: 'Airbnb', Expedia: 'Expedia', VRBO: 'Vrbo', Vrbo: 'Vrbo', Agoda: 'Agoda', Google: 'Google', Hostelworld: 'Hostelworld', Tripadvisor: 'Tripadvisor', Trip: 'Trip.com' };
  BB.otaName = x => BB.OTA[x] || String(x || 'another site').replace(/([a-z])([A-Z])/g, '$1 $2');
  // The host turns it on. prices: true also keeps nightly prices and minimum stays in step (the All channels plan).
  BB.act.joinAllChannels = function (prices) {
    const s = S(); const i = BB.q.integration('hub'); if (!i) return { ok: false };
    const was = i.connected && (s.account.tier === 'all') === !!prices;
    i.connected = true; s.account.addon = true; if (prices) s.account.tier = 'all'; else delete s.account.tier;
    i.joinedAt = i.joinedAt || stamp();
    if (!was) BB.log('sync', 'All channels', prices ? 'Switched on All channels with price sync. Your homes, dates and prices go to every booking site you connect.' : 'Switched on All channels. Your homes and open dates go to every booking site you connect.', 'hub');
    BB.fx('hub.run', {}); BB.fx('billing.addon', {});
    BB.store.commit({ type: 'integration', id: 'hub' });
    return { ok: true };
  };
  BB.act.leaveAllChannels = function () {
    const s = S(); const i = BB.q.integration('hub'); if (!i || !i.connected) return { ok: false };
    i.connected = false; delete s.account.tier;
    if (!(s.integrations || []).some(x => x.addon && !x.hub && x.connected)) s.account.addon = false;
    BB.log('sync', 'All channels', 'Switched off All channels. Bookings already taken stay on your calendar.', 'hub');
    BB.fx('hub.run', {}); BB.fx('billing.addon', {});
    BB.store.commit({ type: 'integration', id: 'hub' });
    return { ok: true };
  };
  // A booking from a site connected through All channels (server only). r: { ref, status, from, to, ota, guest, code, amount, currency }
  BB.act.applyHubBooking = function (pid, r) {
    const s = S(); const p = P(pid); if (!p || !r || !r.ref) return { ok: false };
    const ota = BB.otaName(r.ota); const old = s.blocks.find(k => k.sync === 'hub' && k.ref === r.ref);
    s.blocks = s.blocks.filter(k => !(k.sync === 'hub' && k.ref === r.ref));
    if (r.status === 'cancelled') {
      if (old) { BB.log('sync', 'All channels', ota + ' cancelled ' + (old.guest ? old.guest + "'s" : 'a') + ' stay at ' + p.short + ', ' + D.fmt(old.from) + '–' + D.fmt(old.to) + '. Those nights are open again everywhere.', pid, [ota, 'Your calendar']); BB.notify('Cancelled on ' + ota + ' · ' + p.short, D.fmt(old.from) + '–' + D.fmt(old.to) + ' is open again on every site.'); }
      BB.store.commit({ type: 'sync' }); return { ok: true };
    }
    if (!r.from || !r.to || r.to <= s.today) { BB.store.commit({ type: 'sync', quiet: true }); return { ok: true }; }
    const k = { propertyId: pid, from: r.from, to: r.to, note: 'Booked on ' + ota + (r.guest ? ' · ' + r.guest : ''), sync: 'hub', ref: r.ref, ota, guest: r.guest || '', code: r.code || '', amount: r.amount || null, currency: r.currency || '' };
    s.blocks.push(k);
    const clash = s.bookings.find(b => b.propertyId === pid && b.status !== 'cancelled' && b.checkIn < r.to && b.checkOut > r.from);
    if (clash) BB.notify('Possible double booking at ' + p.short, ota + ' ' + D.fmt(r.from) + '–' + D.fmt(r.to) + ' overlaps ' + clash.id + '. Check both calendars.', clash.id);
    const changed = old && (old.from !== r.from || old.to !== r.to);
    if (!old || changed) {
      BB.log('booking', ota, (changed ? 'Changed on ' : 'New booking on ') + ota + ': ' + (r.guest || 'a guest') + ', ' + D.fmt(r.from) + '–' + D.fmt(r.to) + ' at ' + p.short + (r.amount ? ' (' + (r.currency && r.currency !== 'GBP' ? r.currency + ' ' : '£') + r.amount + ')' : '') + '. Closed on every other site straight away.', pid, [ota, 'Your calendar', 'Every other site']);
      if (!old) BB.notify('New ' + ota + ' booking · ' + p.short, (r.guest || 'A guest') + ', ' + D.fmt(r.from) + '–' + D.fmt(r.to) + '. Closed everywhere else.');
    }
    const i = BB.q.integration('hub'); if (i) i.lastSync = stamp();
    BB.store.commit({ type: 'sync' });
    return { ok: true };
  };
  // Google Vacation Rentals: free. Homes show in Google Search, Maps and Travel with a link to book on the host's own site.
  BB.SYNC_EXTRA.push({ id: 'gvr', name: 'Google Vacation Rentals', group: 'Get found', connected: false, detail: 'Free listings in Google Search, Maps and Travel that send guests to book on your own site', lastSync: null });
  // What a home still needs before Google will list it (same rules as server/google-vr.js).
  BB.gvrMissing = p => { const out = []; const n = (p.photos || []).length; if (p.published === false) out.push('publish the site'); if (!(p.lat && p.lng)) out.push('add the map pin'); if (n < 5) out.push('add ' + (5 - n) + ' more photo' + (5 - n === 1 ? '' : 's')); if (!String(p.area || '').trim()) out.push('add the town or area'); if (!(+p.maxGuests > 0)) out.push('say how many it sleeps'); return out; };
  // Calendar catalogue: named sites that offer calendar links (iCal). Each one becomes its own calendar when the host adds
  // it, with its own feed back, so every site blocks every other through Bookingbooster. [id, name, region, where to find it]
  BB.ICAL_SITES = BB.ICAL_SITES || [
    // UK and Ireland
    ['sawdays', "Sawday's", 'UK', 'Accommodation, then Manage calendar, then the iCal Sync tab'],
    ['canopystars', 'Canopy & Stars', 'UK', 'Ask your Canopy & Stars contact for the calendar link'],
    ['pitchup', 'Pitchup', 'UK and Europe', 'Manager portal, then the Allocation tab. Pitchup switches on importing for you'],
    ['hipcamp', 'Hipcamp', 'UK, US, Australia', 'Calendar, then Options, then Sync external calendars (on a computer)'],
    ['campanyon', 'Campanyon', 'UK and Nordics', 'Host Dashboard, then your listing, then Calendar'],
    ['camplify', 'Camplify', 'UK and Australia', 'Listings, then the calendar, then Calendar sync'],
    ['campsitescouk', 'Campsites.co.uk', 'UK', 'Email Campsites.co.uk bookings and ask them to link your calendar'],
    ['coolstays', 'Coolstays', 'UK', 'Ask Coolstays for your calendar link'],
    ['glampsites', 'Glampsites', 'UK', 'Ask Glampsites for your calendar link'],
    ['qualityunearthed', 'Quality Unearthed', 'UK', 'Ask Quality Unearthed for your calendar link'],
    ['cottagescom', 'Cottages.com', 'UK', 'Ask your Awaze owner team whether they can link your calendar'],
    ['hoseasons', 'Hoseasons', 'UK', 'Ask your Awaze owner team whether they can link your calendar'],
    ['travelchapter', 'The Travel Chapter', 'UK', 'Ask your Travel Chapter owner team for the calendar link'],
    ['hideaway', 'Hideaway Collection', 'UK', 'Ask your Hideaway Collection owner team for the calendar link'],
    ['holidayfox', 'Holiday Fox', 'UK', 'Partner area, then iCal calendar feeds'],
    ['searchandstay', 'Search and Stay', 'UK', 'Import: your property, then the iCal and Date Block tab. Export: Calendar, then Copy iCal'],
    ['reserveapts', 'Reserve Apartments', 'UK', 'Email Reserve Apartments support and they set it up'],
    ['simplyowners', 'Simply Owners', 'UK and Ireland', 'Owner console, then Import / Export an iCal link'],
    ['lodgelovers', 'Lodge Lovers', 'UK', 'Your Listings, then iCal link, then Booking Window'],
    ['indcottages', 'Independent Cottages', 'UK', 'Ask Independent Cottages to switch calendar import on'],
    ['plumguide', 'Plum Guide', 'UK and worldwide', 'Listings, then Edit home details, then Calendar, then Import calendar'],
    ['holidaylettings', 'Holiday Lettings', 'UK', 'Calendar tab, then Import / Export calendar'],
    ['bestofwales', 'Best of Wales', 'Wales', 'Ask Best of Wales for your calendar link'],
    ['westwales', 'West Wales Holiday Cottages', 'Wales', 'Ask your West Wales Holiday Cottages contact for the calendar link'],
    ['bookalighthouse', 'Bookalighthouse.com', 'UK', 'Ask Bookalighthouse for your calendar link'],
    ['eatsretreats', 'Eats & Retreats', 'UK', 'Ask Eats & Retreats for your calendar link'],
    ['clickstay', 'Click Stay', 'UK', 'Ask Click Stay for your calendar link'],
    ['rentalhive', 'The Rental Hive', 'UK', 'Ask The Rental Hive for your calendar link'],
    ['goboony', 'Goboony', 'UK and Europe', 'Your listing calendar, then calendar sync'],
    // Europe
    ['holidu', 'Holidu', 'Europe and UK', 'Your property, then Configuration, then iCal & Synchronization'],
    ['ferienwohnungen', 'Ferienwohnungen.de', 'Germany', 'Your property, then Configuration, then iCal & Synchronization'],
    ['casasrurales', 'Casasrurales.net', 'Spain', 'Your property, then Configuration, then iCal & Synchronization'],
    ['clubrural', 'Clubrural', 'Spain', 'Your property, then Configuration, then iCal & Synchronization'],
    ['chambreshotes', 'Chambres-hotes.fr', 'France', 'Your property, then Configuration, then iCal & Synchronization'],
    ['atraveo', 'Atraveo', 'Germany and Europe', 'Owner Portal, then Bookings, then Calendar, then Actions'],
    ['edomizil', 'e-domizil', 'Germany and Switzerland', 'Owner portal (shared with Atraveo), then Calendar'],
    ['fewodirekt', 'FeWo-direkt', 'Germany', 'Calendar, then Import / Export (same dashboard as Vrbo)'],
    ['abritel', 'Abritel', 'France', 'Calendar, then Import / Export (same dashboard as Vrbo)'],
    ['clevacances', 'Clévacances', 'France', 'My availabilities tab'],
    ['gitescom', 'Gîtes.com', 'France', 'Owner area, then Synchronise your availability via iCal'],
    ['spainholiday', 'Spain-Holiday.com', 'Spain', 'Owner area, then calendar, then iCal sync'],
    ['bedandbreakfasteu', 'Bedandbreakfast.eu', 'Europe', 'Your account, then Synchronising with other platforms'],
    ['amivac', 'Amivac', 'France', 'Your listing calendar, then iCal'],
    ['magicstay', 'MagicStay', 'France', 'Your listing calendar, then iCal'],
    ['adriago', 'Adriago', 'Croatia', 'Your listing calendar, then iCal'],
    ['handiscover', 'Handiscover', 'Europe', 'Your listing calendar, then iCal'],
    ['homelike', 'Homelike', 'Germany', 'Your listing calendar, then iCal'],
    ['wunderflats', 'Wunderflats', 'Germany', 'Your listing, then Synchronise your booking calendar'],
    ['uniplaces', 'Uniplaces', 'Portugal and Europe', 'Your listing, then Sync your listing calendar with iCal'],
    // Worldwide
    ['expedia', 'Expedia', 'Worldwide', 'Through your Vrbo dashboard: Calendar, then Import / Export'],
    ['stayz', 'Stayz', 'Australia', 'Calendar, then Reservations, then the Import / Export arrows'],
    ['bookabach', 'Bookabach', 'New Zealand', 'Calendars & Reservations, then Import / Export'],
    ['holidayhouses', 'Holiday Houses', 'New Zealand', 'Your listing calendar, then iCal'],
    ['tripadvisor', 'Tripadvisor Rentals', 'Worldwide', 'Calendar tab, then Import / Export calendar'],
    ['agoda', 'Agoda Homes', 'Asia and worldwide', 'Calendar, then Calendar connections (homes with one unit)'],
    ['houfy', 'Houfy', 'US and worldwide', 'Manage Listings, then Calendar, then Import / Export'],
    ['misterbnb', 'Misterb&b', 'Worldwide', 'Your listing calendar, then calendar sync'],
    ['tripvillas', 'Tripvillas', 'Asia and worldwide', 'Your listing calendar, then iCal'],
    ['glampinghub', 'Glamping Hub', 'Worldwide', 'Your listing calendar, then iCal links'],
    ['thedyrt', 'The Dyrt', 'US', 'Your listing, then Import and export calendars'],
    ['dubizzle', 'Dubizzle Holiday Homes', 'UAE', 'Your listing, then Manage your calendar with iCalendar'],
    ['dtravel', 'Dtravel', 'Worldwide', 'Your listing, then Calendar syncing using iCal'],
    // Your own calendars
    ['gcal', 'Google Calendar', 'Anywhere', 'Settings, then your calendar, then Secret address in iCal format'],
    ['outlook', 'Outlook', 'Anywhere', 'Calendar settings, then Shared calendars, then Publish a calendar (ICS link)'],
    ['icloud', 'Apple Calendar (iCloud)', 'Anywhere', 'Share the calendar as a Public Calendar and copy the link'],
    // Other booking systems and website plugins
    ['wixhotels', 'Wix Hotels', 'Anywhere', 'Wix Hotels, then Sync with an external calendar, then Find your iCal URL'],
    ['motopress', 'MotoPress Hotel Booking', 'Anywhere', 'WordPress, then Accommodation, then Sync Calendars'],
    ['wpbooking', 'WP Booking System', 'Anywhere', 'WordPress, then your calendar, then iCalendar Import / Export'],
    ['hbook', 'HBook', 'Anywhere', 'WordPress, then HBook, then iCal settings'],
    ['wprentals', 'WP Rentals', 'Anywhere', 'Your listing, then iCalendar import / export'],
    ['cozystay', 'CozyStay', 'Anywhere', 'Your room, then Connect calendar via iCal'],
    ['anytimebooking', 'Anytime Booking', 'UK', 'Channels, then 2-way iCal'],
    ['bookster', 'Bookster', 'UK', 'Marketing channels, then via iCalendar'],
    ['freetobook', 'Freetobook', 'UK', 'Each room has an iCal feed in your settings'],
    ['bedful', 'Bedful', 'UK', 'Bookings, then iCal availability'],
    ['innstyle', 'InnStyle', 'UK', 'Channels, then 2-way iCal feed'],
    ['ownerrez', 'OwnerRez', 'Anywhere', 'Channel management, then Calendar Import / Export'],
  ];
  const siteDef = id => BB.ICAL_SITES.find(x => x[0] === id);
  BB.registerSites = function () {
    BB.ICAL_SITES.forEach(([id, name]) => { if (!BB.CHANNEL[id]) BB.CHANNEL[id] = name; if (!BB.ICAL_IDS.includes(id)) { BB.ICAL_IDS.push(id); BB.SYNC_IDS.push(id); } });
  };
  BB.act.addCalendarSite = function (id) {
    const d = siteDef(id); const s = S(); if (!d) return { ok: false, error: 'Unknown site' };
    let i = s.integrations.find(x => x.id === id);
    if (!i) { i = { id, name: d[1], group: 'Add-ons', addon: true, ical: true, site: true, connected: false, where: d[3] || '', detail: 'Paste your ' + d[1] + ' calendar link (iCal). Dates booked there are blocked on your sites, and your Bookingbooster link pasted into ' + d[1] + ' closes the dates booked everywhere else.', lastSync: null }; s.integrations.push(i); }
    i.shown = true; BB.store.commit({ type: 'integration', id }); return { ok: true };
  };
  BB.ensureChannels = function (s) {
    if (!s || !Array.isArray(s.integrations)) return;
    BB.SYNC_EXTRA.forEach(x => { if (!s.integrations.some(i => i.id === x.id)) s.integrations.push(Object.assign({}, x)); });
  };
  try { BB.registerSites(); BB.ensureChannels(S()); } catch (_) {}

  // Pick which listing in the channel manager is which home. The listings come from the server when the host connects.
  BB.act.mapChannelListing = function (id, pid, listingId) {
    const i = BB.q.integration(id); if (!i || !i.api || !BB.q.property(pid)) return { ok: false };
    listingId = listingId == null ? '' : String(listingId);
    if (listingId && !(i.listings || []).some(l => String(l.id) === listingId)) return { ok: false, error: 'That listing is not in your ' + i.name + ' account.' };
    i.map = i.map || {};
    if (listingId) i.map[pid] = listingId; else { delete i.map[pid]; S().blocks = S().blocks.filter(k => !(k.sync === id && k.propertyId === pid)); }
    const l = (i.listings || []).find(x => String(x.id) === listingId);
    BB.log('sync', i.name, listingId ? P(pid).short + ' is now linked to "' + (l ? l.name : listingId) + '" in ' + i.name + '.' : P(pid).short + ' is no longer linked to ' + i.name + '.', id);
    if (listingId) BB.fx('channels.sync', { id });
    BB.store.commit({ type: 'integration', id });
    return { ok: true };
  };

  // When a direct booking is made, changed or cancelled on a home linked to a channel manager API, tell the server
  // to update the channel manager straight away (not just on the next scheduled check).
  const directPrint = () => {
    const s = S(); const homes = new Set();
    (s.integrations || []).forEach(i => { if (i.api && i.connected && i.map) Object.keys(i.map).forEach(pid => homes.add(pid)); });
    if (!homes.size) return '';
    return s.bookings.filter(b => homes.has(b.propertyId) && b.status !== 'cancelled' && b.checkOut >= s.today).map(b => b.id + ':' + b.propertyId + ':' + b.checkIn + ':' + b.checkOut).sort().join(',')
      + '|' + s.blocks.filter(k => homes.has(k.propertyId) && !k.sync && k.to >= s.today).map(k => k.propertyId + ':' + k.from + ':' + k.to).sort().join(',');
  };
  // All channels: open nights (and prices, on the All channels plan) for every home, so a change reaches every site in minutes.
  const hubPrint = () => {
    const s = S(); const i = (s.integrations || []).find(x => x.id === 'hub'); if (!i || !i.connected) return '';
    return s.properties.map(p => p.id + ':' + [...BB.q.blocked(p.id)].filter(n => n >= s.today).sort().join(',') + (s.account.tier === 'all' ? ':' + p.nightly + '/' + p.weekend + '/' + p.minNights : '')).join('|');
  };
  const commit0 = BB.store.commit;
  BB.store.commit = function (meta) {
    const s = S();
    if (s && s.live) { const fp = directPrint(); if (fp && fp !== s.directPrint) { s.directPrint = fp; BB.fx('channels.push', {}); } else if (!fp && s.directPrint) s.directPrint = ''; }
    if (s && s.live) { const hp = hubPrint(); if (hp && hp !== s.hubPrint) { s.hubPrint = hp; BB.fx('hub.push', {}); } else if (!hp && s.hubPrint) s.hubPrint = ''; }
    return commit0.call(BB.store, meta);
  };
})();
