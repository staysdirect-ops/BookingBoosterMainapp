// Search and AI visibility for host sites: crawlable page content, schema.org structured data,
// robots.txt that welcomes AI crawlers, sitemap.xml and llms.txt.
'use strict';
const { esc } = require('./pages');

const money = n => '£' + Number(n || 0).toLocaleString('en-GB');
const town = p => String(p.area || '').split(',')[0].trim();
const kind = p => ({ cabin: 'cabin', lake: 'cottage', city: 'apartment' }[p.theme] || 'holiday let');
function faqsOf(s, p) {
  const own = ((s.website.faqs || {})[p.id] || []).map(x => { const i = x.indexOf('|'); return i < 0 ? [x, ''] : [x.slice(0, i), x.slice(i + 1)]; });
  const on = id => !s.live || !!((s.integrations || []).find(i => i.id === id) || {}).connected;
  const base = [
    ['How do I book ' + p.name + ' direct?', on('stripe') ? 'Pick your dates on this site and pay securely by card, Apple Pay or Google Pay. You get an instant confirmation and talk to your host directly.' : 'Pick your dates on this site and send a booking request. Your host confirms it and sends a secure payment link, and you talk to them directly.'],
    ['Why book direct instead of through a platform?', 'Booking here skips the platform guest service fee, so the same stay usually costs less, and your host keeps more of what you pay.'],
    ['What time is check-in and checkout?', 'Check-in is from ' + p.checkinTime + ' and checkout is by ' + p.checkoutTime + '. Complete online check-in before you arrive' + (on('lock') ? ' and your door code is sent on arrival day.' : ' and your host sends arrival details.')],
    ['How many guests can stay?', p.name + ' sleeps ' + p.maxGuests + ' across ' + p.bedrooms + ' bedroom' + (p.bedrooms === 1 ? '' : 's') + '.'],
    ['Are pets allowed?', p.petsAllowed ? 'Yes. Dogs are welcome' + (p.petFee ? ' for a ' + money(p.petFee) + ' pet fee' : '') + '.' : 'Sorry, pets are not allowed at this home.'],
    ['What is the minimum stay?', 'The minimum stay is ' + p.minNights + ' night' + (p.minNights === 1 ? '' : 's') + '.'],
  ];
  const seen = new Set(own.map(f => f[0].toLowerCase()));
  return own.concat(base.filter(f => !seen.has(f[0].toLowerCase())));
}
function reviewsOf(s, p) {
  return s.bookings.filter(b => b.propertyId === p.id && b.review && b.review.text && (s.live ? b.review.public : b.review.stars >= 4))
    .sort((a, b) => b.review.at.localeCompare(a.review.at)).slice(0, 10)
    .map(b => { const g = s.guests.find(x => x.id === b.guestId); const n = String(g ? g.name : 'Guest').split(' '); return { name: n[0] + (n[1] ? ' ' + n[1][0] + '.' : ''), stars: b.review.stars, text: b.review.text, at: b.review.at }; });
}
function titleOf(p) { const t = p.name + ' · ' + kind(p)[0].toUpperCase() + kind(p).slice(1) + ' in ' + town(p) + ' · Book direct'; return t; }
function descOf(p) { return (p.headline ? p.headline + ' ' : '') + (p.sub ? p.sub.replace(/ · /g, ', ') + '. ' : '') + 'Book direct from ' + money(p.nightly) + ' a night with no platform fees.'; }

function jsonLd(s, p, url) {
  const revs = reviewsOf(s, p);
  const faqs = faqsOf(s, p);
  const rental = {
    '@type': 'VacationRental', '@id': url + '#rental', name: p.name, url, description: p.about || p.headline,
    identifier: p.id, brand: { '@type': 'Brand', name: s.account.business },
    address: { '@type': 'PostalAddress', addressLocality: town(p), addressRegion: String(p.area || '').split(',').slice(1).join(',').trim() || undefined, addressCountry: 'GB' },
    containsPlace: { '@type': 'Accommodation', additionalType: 'EntirePlace', occupancy: { '@type': 'QuantitativeValue', value: p.maxGuests }, numberOfBedrooms: p.bedrooms, numberOfBathroomsTotal: p.baths,
      amenityFeature: (p.amenities || []).map(a => ({ '@type': 'LocationFeatureSpecification', name: a, value: true })) },
    checkinTime: p.checkinTime, checkoutTime: p.checkoutTime, petsAllowed: !!p.petsAllowed, knowsLanguage: 'en-GB',
    priceRange: 'From ' + money(p.nightly) + ' a night',
  };
  if (p.lat && p.lng) rental.geo = { '@type': 'GeoCoordinates', latitude: p.lat, longitude: p.lng };
  if (p.photos && p.photos.length) rental.image = p.photos.map(x => x.url);
  if (p.reviews && p.rating) rental.aggregateRating = { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews, bestRating: 5 };
  if (revs.length) rental.review = revs.map(r => ({ '@type': 'Review', reviewRating: { '@type': 'Rating', ratingValue: r.stars, bestRating: 5 }, author: { '@type': 'Person', name: r.name }, datePublished: r.at, reviewBody: r.text }));
  return { '@context': 'https://schema.org', '@graph': [
    rental,
    { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    { '@type': 'Organization', '@id': url + '#host', name: s.account.business, url },
    { '@type': 'WebSite', '@id': url + '#site', name: p.name, url, inLanguage: 'en-GB' },
  ] };
}

function head(s, p, url) {
  const t = titleOf(p), d = descOf(p);
  return '<link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="website"><meta property="og:title" content="' + esc(t) + '"><meta property="og:description" content="' + esc(d) + '"><meta property="og:url" content="' + esc(url) + '"><meta property="og:locale" content="en_GB">' +
    (p.photos && p.photos[0] ? '<meta property="og:image" content="' + esc(p.photos[0].url) + '">' : '') +
    '<meta name="twitter:card" content="summary_large_image">' +
    '<link rel="alternate" type="text/plain" title="llms.txt" href="' + esc(url.replace(/\/$/, '') + '/llms.txt') + '">' +
    '<script type="application/ld+json">' + JSON.stringify(jsonLd(s, p, url)).replace(/</g, '\\u003c') + '</script>';
}

// Readable content for crawlers that do not run JavaScript. The app replaces it when it starts.
function content(s, p, url) {
  const revs = reviewsOf(s, p), faqs = faqsOf(s, p);
  return '<article class="seo" id="seo">' +
    '<p>' + esc(s.account.business) + ' · ' + esc(p.area) + '</p>' +
    '<h1>' + esc(p.name) + '</h1><p><strong>' + esc(p.headline) + '</strong></p><p>' + esc(p.sub) + '</p>' +
    '<p>' + esc(p.about) + '</p>' +
    '<p>From ' + money(p.nightly) + ' a night. Cleaning ' + money(p.cleaning) + '. Minimum stay ' + p.minNights + ' night' + (p.minNights === 1 ? '' : 's') + '. <a href="#book">Check dates and book direct</a>.</p>' +
    '<h2>What you get</h2><ul>' + (p.amenities || []).map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' +
    '<h2>House rules</h2><ul>' + (p.rules || []).map(a => '<li>' + esc(a) + '</li>').join('') + '<li>Check-in from ' + esc(p.checkinTime) + ', checkout by ' + esc(p.checkoutTime) + '.</li></ul>' +
    (revs.length ? '<h2>What guests say</h2>' + revs.map(r => '<blockquote><p>' + esc(r.text) + '</p><footer>' + esc(r.name) + ', ' + '★'.repeat(r.stars) + '</footer></blockquote>').join('') + (s.live ? '<p>Every review is from a guest who stayed and chose to share it, whatever their rating.</p>' : '') : '') +
    '<h2>Questions</h2>' + faqs.map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('') +
    '</article>';
}

function llms(s, p, url) {
  const faqs = faqsOf(s, p);
  return '# ' + p.name + '\n\n> ' + (p.headline || '') + ' ' + kind(p)[0].toUpperCase() + kind(p).slice(1) + ' in ' + p.area + ', run by ' + s.account.business + '. Book direct at ' + url + '\n\n' +
    '## Facts\n\n- Location: ' + p.area + ', United Kingdom\n- Sleeps: ' + p.maxGuests + '\n- Bedrooms: ' + p.bedrooms + '\n- Bathrooms: ' + p.baths + '\n- Price: from ' + money(p.nightly) + ' a night' + (p.weekend ? ' (' + money(p.nightly + p.weekend) + ' on Friday and Saturday)' : '') + ', cleaning ' + money(p.cleaning) + '\n- Minimum stay: ' + p.minNights + ' night' + (p.minNights === 1 ? '' : 's') + '\n- Pets: ' + (p.petsAllowed ? 'dogs welcome' + (p.petFee ? ', ' + money(p.petFee) + ' fee' : '') : 'not allowed') + '\n- Check-in: from ' + p.checkinTime + ', checkout by ' + p.checkoutTime + '\n' + (p.rating && p.reviews ? '- Guest rating: ' + p.rating + ' out of 5 from ' + p.reviews + ' reviews\n' : '') +
    '\n## About\n\n' + (p.about || '') + '\n\n## Amenities\n\n' + (p.amenities || []).map(a => '- ' + a).join('\n') + '\n\n## House rules\n\n' + (p.rules || []).map(a => '- ' + a).join('\n') +
    '\n\n## Questions guests ask\n\n' + faqs.map(([q, a]) => '### ' + q + '\n\n' + a).join('\n\n') +
    '\n\n## Booking\n\n- [Check availability and book direct](' + url + '): live calendar, instant confirmation, card, Apple Pay or Google Pay.\n';
}

function robots(sitemapUrl) {
  return ['User-agent: *', 'Allow: /', 'Disallow: /app', 'Disallow: /trip/', 'Disallow: /api/', '', '# AI search and assistants are welcome to read and cite this site',
    ...['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended', 'Bingbot'].map(b => 'User-agent: ' + b + '\nAllow: /'), '', 'Sitemap: ' + sitemapUrl, ''].join('\n');
}
function sitemap(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => '  <url><loc>' + esc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
}
module.exports = { head, content, llms, robots, sitemap, jsonLd, titleOf, descOf, faqsOf };
