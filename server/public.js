// What a guest's browser is allowed to see. Property sites get availability, prices and published reviews;
// a trip link gets that one booking and its messages. Nothing else from the host's workspace leaves the server.
'use strict';

// FNV-1a: promo codes are sent hashed so the page can check a code without listing them all.
function fnv(str) { let h = 0x811c9dc5; for (const c of String(str)) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); }

const PRIVATE_PROPERTY_KEYS = ['wifi', 'lockPrefix', 'entry'];
function propPublic(p, full) {
  const o = Object.assign({}, p);
  if (!full) { PRIVATE_PROPERTY_KEYS.forEach(k => delete o[k]); o.address = o.area || ''; }
  return o;
}
function base(s) {
  return {
    v: 1, live: !!s.live, demo: !!s.demo, today: s.today, clock: s.clock,
    account: { business: s.account.business, owner: String(s.account.owner || '').split(' ')[0] },
    guests: [], threads: [], campaigns: [], automations: [], events: [], notifications: [], seq: s.seq,
    integrations: s.integrations.filter(i => ['stripe', 'lock', 'email', 'sms'].includes(i.id)).map(i => ({ id: i.id, name: i.name, connected: i.connected })),
    ai: { questions: [], tasks: [] },
    website: { faqs: s.website.faqs || {}, visitors: {}, fromSearch: 0, conversion: 0 },
    promosHashed: Object.fromEntries(Object.entries(s.promos || {}).map(([k, v]) => [fnv(k), v])), promos: {},
  };
}
// Bookings reduced to dates (so the calendar shows them as taken) plus published reviews with first name and initial.
// Live homes show only reviews the guest chose to publish, whatever the stars. The demo keeps its sample reviews.
const isPublic = (s, b) => !!b.review && (s.live ? !!b.review.public : !!b.review.text && b.review.stars >= 4);
function availability(s, pidFilter) {
  const out = [], guests = [];
  let n = 0;
  for (const b of s.bookings) {
    if (pidFilter && !pidFilter.includes(b.propertyId)) continue;
    const reviewed = isPublic(s, b);
    const future = b.status !== 'cancelled' && b.checkOut > s.today;
    if (!reviewed && !future) continue;
    const id = 'x' + (++n);
    let gid = null;
    if (reviewed) { const g = s.guests.find(x => x.id === b.guestId); const parts = String(g ? g.name : 'Guest').split(' '); gid = 'rg' + n; guests.push({ id: gid, name: parts[0] + (parts[1] ? ' ' + parts[1][0] + '.' : ''), email: '', phone: '', tags: [], subscribed: false }); }
    out.push({ id, propertyId: b.propertyId, guestId: gid, checkIn: b.checkIn, checkOut: b.checkOut, status: future ? 'confirmed' : 'completed', channel: 'direct', total: 0, price: {}, checkin: {}, review: reviewed ? b.review : null });
  }
  return { bookings: out, guests };
}
function blocks(s, pids) { return s.blocks.filter(k => !pids || pids.includes(k.propertyId)).map(k => ({ propertyId: k.propertyId, from: k.from, to: k.to, note: 'Unavailable' })); }

function siteState(s, pid) {
  const props = s.properties.filter(p => p.published !== false);
  const o = base(s);
  o.properties = props.map(p => propPublic(p));
  const av = availability(s, props.map(p => p.id));
  o.bookings = av.bookings; o.guests = av.guests; o.blocks = blocks(s, props.map(p => p.id));
  o.focus = pid;
  return o;
}
function tripState(s, bookingId) {
  const b = s.bookings.find(x => x.id === bookingId); if (!b) return null;
  const o = siteState(s, b.propertyId);
  const full = JSON.parse(JSON.stringify(b));
  if (!(b.checkin && b.checkin.done)) full.code = null; // the door code is only shown once check-in is finished
  o.bookings = o.bookings.filter(x => !(x.propertyId === b.propertyId && x.checkIn === b.checkIn && x.checkOut === b.checkOut));
  o.bookings.push(full);
  // the guest's own other stays (for "book again" and history)
  s.bookings.filter(x => x.guestId === b.guestId && x.id !== b.id).forEach(x => { o.bookings = o.bookings.filter(y => !(y.propertyId === x.propertyId && y.checkIn === x.checkIn)); o.bookings.push(JSON.parse(JSON.stringify(Object.assign({}, x, { code: null })))); });
  const g = s.guests.find(x => x.id === b.guestId); if (g) o.guests.push(Object.assign({}, g, { notes: '' }));
  const t = s.threads.find(x => x.bookingId === b.id); if (t) o.threads = [JSON.parse(JSON.stringify(Object.assign({}, t, { messages: t.messages.filter(m => m.from !== 'note') })))];
  const p = s.properties.find(x => x.id === b.propertyId);
  o.properties = o.properties.map(x => x.id === b.propertyId ? propPublic(p, !!(b.checkin && b.checkin.done) || b.checkIn <= s.today) : x);
  o.trip = b.id;
  return o;
}
module.exports = { siteState, tripState, fnv };
