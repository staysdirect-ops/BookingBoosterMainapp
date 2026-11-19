// Where things are, worked out here with no outside service: UK postcode districts ("ME15") to a rough centre point,
// and miles between two points. outcodes.json holds the centre of every UK postcode district (about 3,000), derived
// from the ONS Postcode Directory. Contains OS data © Crown copyright and database right. Contains Royal Mail data
// © Royal Mail copyright and database right. Source: Office for National Statistics, Open Government Licence v3.0.
'use strict';
const OC = require('./outcodes.json');

const PC = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;   // a full postcode: ME15 6AA
const OUT = /^\s*([A-Z]{1,2}\d[A-Z\d]?)\s*$/i;             // a district on its own: ME15

// The district of the first full postcode in the text, or the text itself when it is just a district.
// (A bare "M20" inside an address is more likely a motorway than Manchester, so those are not guessed.)
function outcode(text) {
  const t = String(text || ''), m = t.match(PC) || t.match(OUT), k = m ? m[1].toUpperCase() : '';
  return OC[k] ? k : '';
}
function point(text) { const k = outcode(text); return k ? { lat: OC[k][0], lng: OC[k][1], postcode: k } : null; }

// miles along the ground
function miles(a, b) {
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Where a home is: its own map pin if it has one, else its postcode, else a district named in its area.
function locate(p) {
  const town = String(p.area || '').split(',')[0].trim();
  if (+p.lat && +p.lng) return { lat: +p.lat, lng: +p.lng, place: town };
  const q = point(p.address) || point(p.area) || point(p.postcode);
  return q ? Object.assign(q, { place: town || q.postcode }) : null;
}

module.exports = { outcode, point, miles, locate, PC };
