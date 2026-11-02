// Drafts a reply to a guest message with Claude, from the home's own facts. The host always reviews and sends it.
'use strict';
module.exports = function (cfg) {
  const enabled = !!cfg.ai.anthropic;
  async function draft(s, thread) {
    if (!enabled) return null;
    const b = s.bookings.find(x => x.id === thread.bookingId);
    const p = s.properties.find(x => x.id === (b ? b.propertyId : thread.propertyId)) || s.properties[0];
    const g = s.guests.find(x => x.id === thread.guestId) || { name: 'Guest' };
    if (!p) return null;
    const checkedIn = !!(b && b.checkin && b.checkin.done);
    const facts = [
      'Home: ' + p.name + (p.area ? ', ' + p.area : ''), 'Sleeps ' + p.maxGuests + ', ' + p.bedrooms + ' bedrooms', 'Check-in from ' + p.checkinTime + ', checkout by ' + p.checkoutTime,
      'Dogs: ' + (p.petsAllowed ? 'welcome' + (p.petFee ? ' (£' + p.petFee + ' per stay)' : '') : 'not allowed'), p.parking ? 'Parking: ' + p.parking : null,
      (p.amenities || []).length ? 'Amenities: ' + p.amenities.join(', ') : null, (p.rules || []).length ? 'House rules: ' + p.rules.join(' ') : null,
      (p.guide || []).length ? 'Nearby: ' + p.guide.join('; ') : null,
      checkedIn && p.address ? 'Address: ' + p.address : null, checkedIn && p.wifi && p.wifi.ssid ? 'Wi-Fi: ' + p.wifi.ssid + ' / ' + p.wifi.pw : null, checkedIn && p.entry ? 'Getting in: ' + p.entry : null,
      b ? 'This guest booked ' + b.checkIn + ' to ' + b.checkOut + ' (' + b.status + (checkedIn ? ', online check-in done' : ', online check-in not done yet') + ')' : 'This guest has no booking yet',
      ...((s.website.faqs || {})[p.id] || []).map(x => 'FAQ: ' + x.replace('|', ' — ')),
    ].filter(Boolean).join('\n');
    const convo = thread.messages.filter(m => m.from !== 'note').slice(-10).map(m => (m.from === 'guest' ? 'Guest' : 'Host') + ': ' + String(m.text || '').slice(0, 1500)).join('\n');
    const system = 'You draft short, warm replies from a UK holiday let host (' + String(s.account.owner || '').split(' ')[0] + ' at ' + s.account.business + ') to a guest. Use UK English. ' +
      'Only state facts from the list provided. If the answer is not in the facts, say you will check and get back to them. Never invent prices, availability, codes or addresses. ' +
      'Do not share the address, Wi-Fi or entry details unless they are in the facts. Two to four sentences. No sign-off line, no emoji. Reply with the message text only.';
    const r = await fetch((cfg.ai.anthropicBase || 'https://api.anthropic.com') + '/v1/messages', { method: 'POST', signal: AbortSignal.timeout(20000),
      headers: { 'x-api-key': cfg.ai.anthropic, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.ai.anthropicModel, max_tokens: 400, system, messages: [{ role: 'user', content: 'Facts:\n' + facts + '\n\nConversation so far:\n' + convo + '\n\nDraft the host\'s next reply to ' + String(g.name).split(' ')[0] + '.' }] }) });
    if (!r.ok) throw new Error('Claude answered ' + r.status);
    const j = await r.json(); const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return text.slice(0, 1200) || null;
  }
  return { enabled, draft };
};
