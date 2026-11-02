// Carries out what the booking rules ask for: guest emails and texts, door codes, refunds, payment links,
// campaign sends, calendar sync and AI checks. Only live workspaces touch the outside world; the demo never does.
'use strict';
const ical = require('./ical');

module.exports = function (ctx) {
  const { cfg, ws, msg, stripe, ai, auth, urls, db, log } = ctx;
  const money = n => '£' + Number(n || 0).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0 });
  const fmt = (iso, o) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, o || {}));
  const first = n => String(n || '').split(' ')[0];
  const initials = n => String(n || '').split(/\s+/).map(x => x[0] || '').join('').slice(0, 2).toUpperCase();
  const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

  function vars(w, b, p, g) {
    const s = w.state; const acc = s.account;
    const v = {
      first_name: first(g && g.name), property_name: p.name, property_initials: initials(p.name), property_town: String(p.area || '').split(',')[0], property_url: urls.site(w, p),
      host_name: first(acc.owner), host_email: acc.replyTo || acc.email, host_phone: acc.phone || '', company_address: acc.address || p.area, house_guide_url: b ? urls.trip(w, b, 'guide') : urls.site(w, p),
      property_hero_image: cfg.baseUrl + '/email-img/' + ({ lake: 'hero-dusk.jpg', city: 'hero-autumn.jpg' }[p.theme] || 'hero-cabin.jpg'),
      unsubscribe_url: g ? urls.unsub(w, g) : '', preferences_url: g ? urls.unsub(w, g) : '',
    };
    if (b) Object.assign(v, {
      booking_ref: b.id, check_in_date: fmt(b.checkIn), check_out_date: fmt(b.checkOut), check_in_time: p.checkinTime, check_out_time: p.checkoutTime,
      nights: nights(b.checkIn, b.checkOut), nightly_rate: money(Math.round((b.price.nightly || 0) / Math.max(1, nights(b.checkIn, b.checkOut)))), nights_total: money(b.price.nightly || 0),
      cleaning_fee: money(b.price.cleaning || 0), pet_fee: money(b.price.pet || 0), total_paid: money(b.total), saved_amount: money(Math.round(b.total * 0.142)), deposit_amount: money(200),
      card_last4: (b.payment && b.payment.last4) || '••••', guest_summary: b.adults + ' adult' + (b.adults === 1 ? '' : 's') + (b.children ? ', ' + b.children + ' child' + (b.children === 1 ? '' : 'ren') : '') + (b.pets ? ', 1 dog' : ''),
      checkin_url: urls.trip(w, b, 'checkin'), review_url: urls.trip(w, b, 'checkout'), guestbook_url: urls.trip(w, b, 'checkout'), late_checkout_url: urls.trip(w, b, 'messages'),
      calendar_ics_url: '', calendar_google_url: 'https://calendar.google.com/calendar/render?' + new URLSearchParams({ action: 'TEMPLATE', text: 'Stay at ' + p.name, dates: b.checkIn.replace(/-/g, '') + '/' + b.checkOut.replace(/-/g, ''), details: urls.trip(w, b) }),
      days_to_arrival: Math.max(0, nights(s.today, b.checkIn)), steps_done: [b.checkin.id && b.checkin.selfie, b.checkin.agreement, b.checkin.deposit].filter(Boolean).length,
      door_code: b.code, door_code_digit_1: String(b.code)[0], door_code_digit_2: String(b.code)[1], door_code_digit_3: String(b.code)[2], door_code_digit_4: String(b.code)[3],
      address_line1: String(p.address || '').split(',')[0], address_line2: String(p.address || '').split(',').slice(1).join(',').trim(), maps_url: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(p.address || p.area),
      wifi_name: p.wifi && p.wifi.ssid, wifi_password: p.wifi && p.wifi.pw, parking_note: p.parking, offer_percent: '10', promo_code: first(g && g.name).toUpperCase() + '10',
    });
    return v;
  }
  const TPL = {
    confirmation: ['guest-t01-booking-confirmed', (p, b) => 'Booked: ' + p.name + ', ' + fmt(b.checkIn, { weekday: undefined, year: undefined }) + ' to ' + fmt(b.checkOut, { weekday: undefined, year: undefined })],
    'checkin-reminder': ['guest-t02-checkin-reminder', p => 'Finish check-in for ' + p.name],
    'door-code': ['guest-t03-arrival-door-code', p => 'Your door code for ' + p.name],
    'checkout-review': ['guest-t05-review-request', p => 'How was your stay at ' + p.name + '?'],
  };
  const TEXT = {
    'checkin-link': (v, b, p) => 'Hi ' + v.first_name + ', you are booked at ' + p.name + ' for ' + v.check_in_date + '. Check in online here: ' + v.checkin_url,
    'checkin-reminder': (v, b, p) => 'Hi ' + v.first_name + ', please finish online check-in for ' + p.name + ' so we can send your door code: ' + v.checkin_url,
    'door-code': (v, b, p) => 'Hi ' + v.first_name + ', your door code for ' + p.name + ' is ' + b.code + ', from ' + p.checkinTime + ' on ' + v.check_in_date + '. Address: ' + p.address + '. Wi-Fi ' + v.wifi_name + ' / ' + v.wifi_password,
    confirmation: (v, b, p) => 'Hi ' + v.first_name + ', you are booked at ' + p.name + ', ' + v.check_in_date + ' to ' + v.check_out_date + '. Total paid ' + v.total_paid + '. Your trip: ' + v.checkin_url,
    'checkout-review': (v, b, p) => 'Thanks for staying at ' + p.name + ', ' + v.first_name + '. How was it? ' + v.review_url + ' Come back with code ' + v.promo_code + ' for 10% off.',
  };
  const fromFor = w => '"' + w.state.account.business.replace(/"/g, '') + '" <bookings@' + cfg.email.guestFromDomain + '>';

  async function guestEmail(w, d) {
    const s = w.state; const g = s.guests.find(x => x.id === d.guestId); if (!g || /@example\.(com|org)$/.test(g.email)) return;
    const b = d.bookingId && s.bookings.find(x => x.id === d.bookingId);
    const p = s.properties.find(x => x.id === (d.propertyId || (b && b.propertyId))) || s.properties[0]; if (!p) return;
    const v = vars(w, b, p, g);
    let subject, html, text;
    if (TPL[d.template] && b) { const [file, subj] = TPL[d.template]; subject = subj(p, b); html = msg.template(file, v); text = (TEXT[d.template] || (() => subject))(v, b, p); }
    else if (d.template === 'message' || d.template === 'offer') {
      subject = d.subject || 'New message from ' + v.host_name + ' at ' + p.name; text = d.text + '\n\nReply here: ' + (b ? urls.trip(w, b, 'messages') : v.property_url);
      html = simple(p, v, d.text, b ? { label: 'Reply', url: urls.trip(w, b, 'messages') } : { label: 'Book direct', url: v.property_url });
    } else return;
    await msg.sendEmail({ workspaceId: w.id, to: g.email, subject, text, html, from: fromFor(w), replyTo: s.account.email, meta: { template: d.template, bookingId: d.bookingId }, unsubscribeUrl: d.template === 'offer' ? v.unsubscribe_url : undefined });
  }
  function simple(p, v, body, cta, foot) {
    const e = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return '<!doctype html><html><body style="margin:0;background:#F5F1EA;font-family:Helvetica,Arial,sans-serif;color:#1E2621"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px"><table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fff;border-radius:16px;overflow:hidden">' +
      '<tr><td style="padding:24px 32px;background:' + e(p.color || '#2F5D46') + ';color:#fff;font-size:18px;font-weight:bold">' + e(p.name) + '</td></tr>' +
      '<tr><td style="padding:28px 32px;font-size:16px;line-height:24px">' + e(body).replace(/\n/g, '<br>') + '</td></tr>' +
      (cta ? '<tr><td style="padding:0 32px 28px"><a href="' + e(cta.url) + '" style="display:inline-block;background:' + e(p.color || '#2F5D46') + ';color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:999px">' + e(cta.label) + '</a></td></tr>' : '') +
      '<tr><td style="padding:18px 32px;border-top:1px solid #eee;font-size:12px;color:#777">' + e(v.host_name) + ' · ' + e(p.name) + ', ' + e(v.property_town) + (foot ? '<br>' + foot : '') + '</td></tr></table></td></tr></table></body></html>';
  }
  async function guestSms(w, d) {
    const s = w.state; const g = s.guests.find(x => x.id === d.guestId); const b = s.bookings.find(x => x.id === d.bookingId); if (!g || !b || !g.phone) return;
    const p = s.properties.find(x => x.id === b.propertyId); const f = TEXT[d.template]; if (!f) return;
    await msg.sendSms({ workspaceId: w.id, to: g.phone, text: f(vars(w, b, p, g), b, p), meta: { template: d.template, bookingId: b.id } });
  }
  async function campaign(w, d) {
    const s = w.state; const c = s.campaigns.find(x => x.id === d.id); if (!c) return;
    const seg = (await ws.withWs(w.id, BB => { const all = BB.q.segments(); return JSON.parse(JSON.stringify((all[c.segment] || all.past).guests)); }, { quiet: true })) || [];
    const p = s.properties.find(x => x.id === c.body.propertyId) || s.properties[0]; if (!p) return;
    let sent = 0;
    for (const g of seg) {
      const v = vars(w, null, p, g);
      const body = 'Hi ' + first(g.name) + ',\n\n' + c.body.text;
      const html = simple(p, v, body, { label: c.body.cta || 'Book direct', url: urls.track(w, 'c', c, g) }, 'You get this because you stayed with us and joined our guest list. <a href="' + v.unsubscribe_url + '">Unsubscribe</a>');
      const tracked = html.replace('</body>', '<img src="' + urls.track(w, 'o', c, g) + '" width="1" height="1" alt="" style="display:block;border:0"></body>');
      const r = await msg.sendEmail({ workspaceId: w.id, to: g.email, subject: c.subject, text: body + '\n\n' + urls.track(w, 'c', c, g) + '\n\nUnsubscribe: ' + v.unsubscribe_url, html: tracked, from: fromFor(w), replyTo: s.account.email, meta: { campaign: c.id, broadcast: true }, unsubscribeUrl: v.unsubscribe_url });
      if (r.ok) sent++;
      if (d.sms && g.phone && g.smsOptIn) await msg.sendSms({ workspaceId: w.id, to: g.phone, text: c.subject + ': ' + v.property_url + ' Reply STOP to opt out.', meta: { campaign: c.id } });
    }
    await ws.withWs(w.id, BB => { const x = BB.store.get().campaigns.find(y => y.id === c.id); if (x) x.recipients = sent; BB.log('campaign', 'Campaigns', 'Delivered "' + c.subject + '" to ' + sent + ' guest' + (sent === 1 ? '' : 's') + '.', c.id); BB.store.commit({}); });
  }

  async function calendars(w, id) {
    const s = w.state; const ids = id ? [id] : ['cm', 'airbnb', 'vrbo', 'booking'];
    for (const iid of ids) {
      const i = s.integrations.find(x => x.id === iid); if (!i || !i.connected || !i.links) continue;
      for (const [pid, url] of Object.entries(i.links)) {
        try { const ranges = ical.parse(await ical.fetchCalendar(url)); await ws.withWs(w.id, BB => BB.act.applyCalendar(iid, pid, ranges), { quiet: true }); }
        catch (e) { await ws.withWs(w.id, BB => { const ii = BB.q.integration(iid); ii.error = e.message; BB.log('sync', ii.name, 'Could not read the calendar link for ' + (BB.q.property(pid) || {}).short + ': ' + e.message, iid); BB.store.commit({}); }); }
      }
    }
  }
  async function aiCheck(w) {
    const s = w.state; if (!ai.available().length) return;
    const { results } = await ai.check(s.ai.questions, s.properties);
    if (results.length) await ws.withWs(w.id, BB => BB.act.applyAiResults(results));
  }
  const payQ = db.prepare("SELECT * FROM payments WHERE workspace_id = ? AND booking_id = ? AND kind = 'booking' AND status = 'paid' ORDER BY created_at DESC LIMIT 1");
  async function refund(w, d) {
    const p = await payQ.get(w.id, d.bookingId); if (!p || !stripe.enabled || !p.provider_ref) return;
    try { await stripe.refund(p.provider_ref); await ws.withWs(w.id, BB => { BB.log('payment', 'Stripe', 'Refund for ' + d.bookingId + ' sent to the guest’s card.', d.bookingId); BB.store.commit({}); }); }
    catch (e) { await ws.withWs(w.id, BB => { BB.notify('Refund needs attention', d.bookingId + ': ' + e.message, d.bookingId); BB.store.commit({}); }); }
  }
  async function paymentLink(w, d) {
    const s = w.state; const b = s.bookings.find(x => x.id === d.bookingId); if (!b) return; const g = s.guests.find(x => x.id === b.guestId); const p = s.properties.find(x => x.id === b.propertyId);
    const url = await ctx.payUrl(w, b).catch(e => { log('payment link', e.message); return null; });
    if (!url) return;
    await msg.sendEmail({ workspaceId: w.id, to: g.email, subject: 'Pay for your stay at ' + p.name, text: 'Hi ' + first(g.name) + ', here is a secure link to pay ' + money(b.total) + ' for ' + p.name + ': ' + url, html: simple(p, vars(w, b, p, g), 'Hi ' + first(g.name) + ', here is a secure link to pay ' + money(b.total) + ' for your stay at ' + p.name + ', ' + fmt(b.checkIn) + ' to ' + fmt(b.checkOut) + '.', { label: 'Pay ' + money(b.total), url }), from: fromFor(w), replyTo: s.account.email, meta: { bookingId: b.id, template: 'payment-link' } });
  }
  async function lockCode(w, d) {
    const s = w.state; const p = s.properties.find(x => x.id === d.propertyId); const b = s.bookings.find(x => x.id === d.bookingId);
    const token = (ctx.secrets && await ctx.secrets.get(w.id, 'nuki')) || cfg.nuki.token;
    if (!token || !p || !p.nukiId || !b) return;
    const t = (iso, hm) => iso + 'T' + hm + ':00Z';
    const hour = x => { const m = String(x).match(/(\d+)(?::(\d+))?\s*(am|pm)/i); if (!m) return '15:00'; let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12; return String(h).padStart(2, '0') + ':' + (m[2] || '00'); };
    const r = await fetch('https://api.nuki.io/smartlock/' + encodeURIComponent(p.nukiId) + '/auth', { method: 'PUT', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Guest ' + b.id, type: 13, code: +b.code, allowedFromDate: t(b.checkIn, hour(p.checkinTime)), allowedUntilDate: t(b.checkOut, hour(p.checkoutTime)), allowedWeekDays: 127, allowedFromTime: 0, allowedUntilTime: 0 }) });
    if (!r.ok) await ws.withWs(w.id, BB => { BB.notify('Door code not set at ' + p.short, 'The Nuki lock answered ' + r.status + '. Set code ' + b.code + ' by hand.', b.id); BB.store.commit({}); });
  }
  // Tells the host about something that needs them (a booking request) by email, with a link to the booking.
  async function hostAlert(w, d) {
    const s = w.state; const b = s.bookings.find(x => x.id === d.bookingId); if (!b) return;
    const g = s.guests.find(x => x.id === b.guestId) || { name: 'A guest' }; const p = s.properties.find(x => x.id === b.propertyId); if (!p) return;
    const url = cfg.baseUrl + '/app';
    const text = g.name + ' asked to book ' + p.name + ', ' + fmt(b.checkIn) + ' to ' + fmt(b.checkOut) + ', ' + b.adults + ' adult' + (b.adults === 1 ? '' : 's') + (b.children ? ' and ' + b.children + ' children' : '') + (b.pets ? ' and a dog' : '') + ', ' + money(b.total) + '. The dates are held until you accept or decline.';
    await msg.sendEmail({ workspaceId: w.id, to: s.account.email, subject: 'Booking request: ' + p.name + ', ' + fmt(b.checkIn), text: text + '\n\nOpen your console: ' + url, html: simple(p, vars(w, b, p, g), text, { label: 'Accept or decline', url }), meta: { template: 'host-request', bookingId: b.id } });
  }
  async function hostEmail(w, d) {
    const s = w.state; const p = s.properties.find(x => x.id === d.propertyId); if (!p) return;
    const v = { first_name: first(s.account.owner), property_name: p.name, site_domain: p.domain, site_url: urls.site(w, p), pages_live: '6', account_url: cfg.baseUrl + '/app', website_editor_url: cfg.baseUrl + '/app', share_kit_url: cfg.baseUrl + '/app', help_url: cfg.baseUrl + '/help', company_address: cfg.company.address, company_number: cfg.company.number, vat_number: cfg.company.vat, privacy_url: cfg.baseUrl + '/privacy', unsubscribe_url: cfg.baseUrl + '/app', preferences_url: cfg.baseUrl + '/app' };
    await msg.sendEmail({ workspaceId: w.id, to: s.account.email, subject: p.name + ' is live', text: p.name + ' is live at ' + v.site_url + '. Open your console: ' + v.account_url, html: msg.template('host-o03-site-live', v), meta: { template: 'site-live' } });
  }

  async function run(w, list) {
    if (w.kind !== 'live') return;
    for (const f of list) {
      try {
        const d = f.data || {};
        if (f.type === 'email.guest') await guestEmail(w, d);
        else if (f.type === 'sms.guest') await guestSms(w, d);
        else if (f.type === 'campaign.send') await campaign(w, d);
        else if (f.type === 'ical.sync') await calendars(w, d.id);
        else if (f.type === 'ai.check') await aiCheck(w);
        else if (f.type === 'payment.refund') await refund(w, d);
        else if (f.type === 'payment.link') await paymentLink(w, d);
        else if (f.type === 'lock.code') await lockCode(w, d);
        else if (f.type === 'email.host') await hostAlert(w, d);
        else if (f.type === 'property.added') { await hostEmail(w, d); await ws.withWs(w.id, () => {}); }
      } catch (e) { log('effect ' + f.type + ' failed:', e.message); }
    }
  }
  return Object.assign(run, { calendars, aiCheck });
};
