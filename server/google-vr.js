// Google Vacation Rentals: free listings in Google Search, Maps and Travel, where the booking link goes straight to the
// host's own Bookingbooster site. Bookingbooster is the partner; each host only switches it on in Connections.
//
//   listings  XML listing feed (Google's local feed format, one <listing> per home) zipped, which Google fetches daily
//   pos       Point of Sale file: the landing page template Google sends guests to, with their dates and party size
//   landing   /go/vr/<listing id>?checkin=...&checkout=...&guests=... sends the guest to the right home with dates set
//
// Google only lists a home with a name, an address, a map pin, a website, how many it sleeps and at least 5 photos, so
// homes missing any of those are left out and the host is told what to add. Prices follow later through ARI, once
// Google's technical account manager gives us the push endpoint (see docs/channel-applications.md).
'use strict';
const zlib = require('zlib');
const crypto = require('crypto');

const x = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const MIN_PHOTOS = 5;

// Our amenity wording -> Google's attribute names (vr-attributes).
const AMENITY = [
  [/hot tub|jacuzzi/i, 'hot_tub'], [/air.?con/i, 'ac'], [/beach/i, 'beach_access'], [/cot|crib/i, 'crib'], [/lift|elevator/i, 'elevator'],
  [/gym/i, 'gym_fitness_equipment'], [/heating|log burner|wood ?burner|fire/i, 'heating'], [/iron/i, 'ironing_board'], [/kitchen/i, 'kitchen'],
  [/microwave/i, 'microwave'], [/bbq|barbecue|grill/i, 'outdoor_grill'], [/oven|hob|stove/i, 'oven_stove'], [/patio|terrace|garden|deck/i, 'patio'],
  [/\btv\b|television|smart tv/i, 'tv'], [/washer|washing machine|dryer/i, 'washer_dryer'], [/wheelchair|step.?free|accessible/i, 'wheelchair_accessible'],
  [/self check-?in|key ?safe|smart lock/i, 'self_checkin_checkout'], [/child|family|kids/i, 'child_friendly'],
];
const pool = list => list.some(a => /indoor pool/i.test(a)) ? 'indoor' : list.some(a => /pool/i.test(a)) ? 'outdoor' : null;
const time24 = t => { const m = String(t || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i); if (!m) return null; let h = +m[1]; if (m[3] && /pm/i.test(m[3]) && h < 12) h += 12; if (m[3] && /am/i.test(m[3]) && h === 12) h = 0; return String(h).padStart(2, '0') + ':' + (m[2] || '00'); };

// What a home still needs before Google will list it. Empty when it is ready.
function missing(p, site) {
  const out = [];
  if (p.published === false) out.push('publish the site');
  if (!(p.lat && p.lng)) out.push('add the map pin');
  if (((p.photos || []).length) < MIN_PHOTOS) out.push('add ' + (MIN_PHOTOS - (p.photos || []).length) + ' more photo' + (MIN_PHOTOS - (p.photos || []).length === 1 ? '' : 's'));
  if (!String(p.area || '').trim()) out.push('add the town or area');
  if (!(+p.maxGuests > 0)) out.push('say how many it sleeps');
  if (!site) out.push('a web address');
  return out;
}
const listingId = (w, p) => w.slug + '--' + p.id;
function parseId(id) { const m = String(id || '').match(/^([a-z0-9-]+?)--([A-Za-z0-9_-]+)$/); return m ? { slug: m[1], pid: m[2] } : null; }

// Town and county only: the exact address stays private until a guest books.
function listing(w, p, site) {
  const area = String(p.area || '').split(',').map(s => s.trim()).filter(Boolean);
  const am = p.amenities || [];
  const attr = [['website', site], ['capacity', Math.max(+p.maxGuests || 1, +p.bedrooms || 0)], ['number_of_bedrooms', p.bedrooms], ['number_of_bathrooms', p.baths],
    ['description', String(p.about || p.headline || '').slice(0, 5000)], ['category', 'vacation_rental'], ['room_type', 'ENTIRE_PLACE'], ['instant_bookable', 'true'],
    ['min_night_stay', p.minNights], ['pets_allowed', p.petsAllowed ? 'true' : 'false'], ['check_in_time', time24(p.checkinTime)], ['check_out_time', time24(p.checkoutTime)],
    ['rating', p.rating && p.reviews ? p.rating : null], ['rating_num', p.rating && p.reviews ? p.reviews : null], ['rating_scale', p.rating && p.reviews ? 5 : null],
    ['pool_type', pool(am)], ['internet_type', am.some(a => /wi-?fi|internet|broadband/i.test(a)) ? 'wifi' : null], ['parking_type', p.parking || am.some(a => /parking|driveway/i.test(a)) ? 'free' : null]];
  for (const [re, name] of AMENITY) if (am.some(a => re.test(a))) attr.push([name, 'true']);
  const photos = (p.photos || []).slice(0, 30);
  return '<listing><id>' + x(listingId(w, p)) + '</id><name>' + x(p.name) + '</name>' +
    '<address format="simple"><component name="city">' + x(area[0] || '') + '</component>' + (area[1] ? '<component name="province">' + x(area.slice(1).join(', ')) + '</component>' : '') + '</address>' +
    '<country>GB</country><latitude>' + (+p.lat).toFixed(6) + '</latitude><longitude>' + (+p.lng).toFixed(6) + '</longitude><category>vacation rental</category>' +
    '<content><attributes>' + attr.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => k === 'website' ? '<website>' + x(v) + '</website>' : '<client_attr name="' + k + '">' + x(v) + '</client_attr>').join('') + '</attributes>' +
    photos.map(ph => '<image type="photo" url="' + x(ph.url) + '"' + (ph.cap ? '><title>' + x(ph.cap) + '</title></image>' : '/>')).join('') + '</content></listing>';
}

function feedXml(items) { return '<?xml version="1.0" encoding="UTF-8"?>\n<listings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="http://www.gstatic.com/localfeed/local_feed.xsd"><language>en</language>' + items.join('') + '</listings>\n'; }

function posXml(base, partner) {
  const u = base + '/go/vr/(PARTNER-HOTEL-ID)?checkin=(CHECKINYEAR)-(CHECKINMONTH)-(CHECKINDAY)&checkout=(CHECKOUTYEAR)-(CHECKOUTMONTH)-(CHECKOUTDAY)&guests=(NUM-GUESTS)';
  return '<?xml version="1.0" encoding="UTF-8"?>\n<PointsOfSale partner="' + x(partner) + '"><PointOfSale id="bookingbooster"><DisplayNames display_text="Book direct with the owner" display_language="en"/><URL>' + x(u) + '</URL></PointOfSale></PointsOfSale>\n';
}

// A one-file ZIP (Google fetches the feed as a ZIP). Deflate, with the CRC and sizes Google's fetcher checks.
const CRC = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
const crc32 = b => { let c = -1; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function zip(name, text) {
  const data = Buffer.from(text, 'utf8'), comp = zlib.deflateRawSync(data), nm = Buffer.from(name), crc = crc32(data);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(8, 8); local.writeUInt32LE(0, 10);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26); local.writeUInt16LE(0, 28);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0, 8); central.writeUInt16LE(8, 10); central.writeUInt32LE(0, 12);
  central.writeUInt32LE(crc, 16); central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nm.length, 28); central.fill(0, 30, 42); central.writeUInt32LE(0, 42);
  const cdOff = local.length + nm.length + comp.length, cd = Buffer.concat([central, nm]);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(cdOff, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([local, nm, comp, cd, end]);
}

module.exports = function ({ cfg, ws, urls }) {
  const key = () => crypto.createHmac('sha256', String(cfg.secret || 'bb')).update('google-vr-feed').digest('hex').slice(0, 24);
  const feedUrl = () => cfg.baseUrl + '/feeds/google-vr/' + key() + '/listings.zip';
  // Every home whose host switched it on and that Google will accept.
  async function entries() {
    const out = [];
    for (const id of await ws.liveIds()) {
      const w = await ws.open(id); if (!w) continue;
      const i = w.state.integrations.find(v => v.id === 'gvr'); if (!i || !i.connected) continue;
      for (const p of w.state.properties) { const site = urls.site(w, p); if (!missing(p, site).length) out.push(listing(w, p, site)); }
    }
    return out;
  }
  async function feedZip() { return zip('listings.xml', feedXml(await entries())); }
  async function landing(id, q) {
    const r = parseId(id); if (!r) return null;
    const row = await ws.bySlug(r.slug); const w = row && await ws.open(row.id); if (!w) return null;
    const p = w.state.properties.find(v => v.id === r.pid); if (!p) return null;
    const ok = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
    const u = new URL(urls.site(w, p));
    if (ok(q.get('checkin')) && ok(q.get('checkout'))) { u.searchParams.set('checkin', q.get('checkin')); u.searchParams.set('checkout', q.get('checkout')); }
    if (/^\d{1,2}$/.test(q.get('guests') || '')) u.searchParams.set('guests', q.get('guests'));
    u.searchParams.set('utm_source', 'google'); u.searchParams.set('utm_medium', 'vacation_rentals');
    return u.toString();
  }
  return { key, feedUrl, entries, feedZip, pos: () => posXml(cfg.baseUrl, (cfg.googleVr && cfg.googleVr.partner) || 'bookingbooster'), landing };
};
Object.assign(module.exports, { missing, listing, feedXml, posXml, zip, listingId, parseId, crc32 });
