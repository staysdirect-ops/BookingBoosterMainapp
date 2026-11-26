// Search and AI visibility for host sites: crawlable page content, schema.org structured data,
// robots.txt that welcomes AI crawlers, sitemap.xml (with images), llms.txt and IndexNow keys.
// The host's SEO fields (answer-first summary, area guide, listings, video, own title) live on p.seo; see web/src/seo-rules.js.
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
const seoOf = p => p.seo || {};
const guideOf = p => (p.guide || []).map(x => String(x).split('|').map(y => y.trim())).filter(x => x[0]);
const ytId = u => { const m = String(u || '').match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/); return m ? m[1] : null; };
function titleOf(p) { if (seoOf(p).metaTitle) return seoOf(p).metaTitle; const t = p.name + ' · ' + kind(p)[0].toUpperCase() + kind(p).slice(1) + ' in ' + town(p) + ' · Book direct'; return t; }
function descOf(p) { if (seoOf(p).metaDescription) return seoOf(p).metaDescription; return (p.headline ? p.headline + ' ' : '') + (p.sub ? p.sub.replace(/ · /g, ', ') + '. ' : '') + 'Book direct from ' + money(p.nightly) + ' a night with no platform fees.'; }

function jsonLd(s, p, url) {
  const revs = reviewsOf(s, p);
  const faqs = faqsOf(s, p);
  const rental = {
    '@type': 'VacationRental', '@id': url + '#rental', name: p.name, url, description: seoOf(p).summary || p.about || p.headline,
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
  const o = seoOf(p), same = (o.sameAs || []).filter(u => /^https:\/\//.test(u));
  if (same.length) rental.sameAs = same;
  if (p.photos && p.photos.length) rental.image = p.photos.map(x => x.cap ? { '@type': 'ImageObject', url: x.url, contentUrl: x.url, caption: x.cap } : x.url);
  const yt = ytId(o.videoUrl);
  if (o.videoUrl) rental.subjectOf = { '@type': 'VideoObject', name: p.name + ' walkthrough', description: 'A video tour of ' + p.name + ', ' + (p.area || town(p)) + '.', embedUrl: yt ? 'https://www.youtube.com/embed/' + yt : o.videoUrl, contentUrl: o.videoUrl, thumbnailUrl: yt ? 'https://i.ytimg.com/vi/' + yt + '/hqdefault.jpg' : (p.photos && p.photos[0] ? p.photos[0].url : undefined), uploadDate: o.videoAt || s.today };
  const region = String(p.area || '').split(',').slice(1).join(',').trim() || undefined;
  const lodging = { '@type': 'LodgingBusiness', '@id': url + '#lodging', name: p.name, url, description: o.summary || p.headline, image: rental.image ? (p.photos[0] || {}).url : undefined,
    address: { '@type': 'PostalAddress', addressLocality: town(p), addressRegion: region, addressCountry: 'GB' }, priceRange: rental.priceRange, checkinTime: p.checkinTime, checkoutTime: p.checkoutTime, petsAllowed: !!p.petsAllowed,
    amenityFeature: rental.containsPlace.amenityFeature, parentOrganization: { '@id': url + '#host' }, sameAs: same.length ? same : undefined,
    makesOffer: p.nightly ? { '@type': 'Offer', url: url + '#book', priceCurrency: 'GBP', price: p.nightly, priceSpecification: { '@type': 'UnitPriceSpecification', price: p.nightly, priceCurrency: 'GBP', unitText: 'night' }, availability: 'https://schema.org/InStock' } : undefined };
  if (rental.geo) lodging.geo = rental.geo;
  const near = guideOf(p);
  const extra = [lodging,
    { '@type': 'WebPage', '@id': url + '#page', url, name: titleOf(p), inLanguage: 'en-GB', about: { '@id': url + '#rental' }, isPartOf: { '@id': url + '#site' }, speakable: { '@type': 'SpeakableSpecification', cssSelector: ['#summary', '#faq'] }, dateModified: s.today },
    { '@type': 'BreadcrumbList', '@id': url + '#crumbs', itemListElement: [{ '@type': 'ListItem', position: 1, name: s.account.business, item: url }, { '@type': 'ListItem', position: 2, name: p.name, item: url + '#book' }] }];
  if (near.length) extra.push({ '@type': 'ItemList', '@id': url + '#nearby', name: 'Things to do near ' + p.name, itemListElement: near.slice(0, 20).map((g, i) => ({ '@type': 'ListItem', position: i + 1, item: { '@type': 'TouristAttraction', name: g[0], description: [g[1] ? g[1] + ' from ' + p.name : '', g[2] || ''].filter(Boolean).join('. ') || undefined, address: { '@type': 'PostalAddress', addressRegion: region, addressCountry: 'GB' } } })) });
  return { '@context': 'https://schema.org', '@graph': [
    rental, ...extra,
    { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: faqs.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
    Object.assign({ '@type': 'Organization', '@id': url + '#host', name: s.account.business, url }, same.filter(u => /instagram|facebook|tiktok|youtube|x\.com|twitter/.test(u)).length ? { sameAs: same.filter(u => /instagram|facebook|tiktok|youtube|x\.com|twitter/.test(u)) } : {}),
    { '@type': 'WebSite', '@id': url + '#site', name: p.name, url, inLanguage: 'en-GB' },
  ] };
}

function head(s, p, url) {
  const t = titleOf(p), d = descOf(p);
  // Link previews need an absolute image URL; uploaded photos are stored as /media/... paths.
  const img = p.photos && p.photos[0] && p.photos[0].url ? new URL(p.photos[0].url, url).href : '';
  return '<link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="website"><meta property="og:title" content="' + esc(t) + '"><meta property="og:description" content="' + esc(d) + '"><meta property="og:url" content="' + esc(url) + '"><meta property="og:locale" content="en_GB">' +
    (img ? '<meta property="og:image" content="' + esc(img) + '"><meta name="twitter:image" content="' + esc(img) + '">' : '') +
    '<meta name="twitter:card" content="' + (img ? 'summary_large_image' : 'summary') + '"><meta name="twitter:title" content="' + esc(t) + '"><meta name="twitter:description" content="' + esc(d) + '">' +
    '<link rel="alternate" type="text/plain" title="llms.txt" href="' + esc(url.replace(/\/$/, '') + '/llms.txt') + '">' +
    '<script type="application/ld+json">' + JSON.stringify(jsonLd(s, p, url)).replace(/</g, '\\u003c') + '</script>';
}

// Readable content for crawlers that do not run JavaScript. The app replaces it when it starts.
function content(s, p, url) {
  const revs = reviewsOf(s, p), faqs = faqsOf(s, p);
  return '<article class="seo" id="seo">' +
    '<p>' + esc(s.account.business) + ' · ' + esc(p.area) + '</p>' +
    '<h1>' + esc(p.name) + '</h1>' + (seoOf(p).summary ? '<p id="summary">' + esc(seoOf(p).summary) + '</p>' : '') + '<p><strong>' + esc(p.headline) + '</strong></p><p>' + esc(p.sub) + '</p>' +
    '<p>' + esc(p.about) + '</p>' +
    '<p>From ' + money(p.nightly) + ' a night. Cleaning ' + money(p.cleaning) + '. Minimum stay ' + p.minNights + ' night' + (p.minNights === 1 ? '' : 's') + '. <a href="#book">Check dates and book direct</a>.</p>' +
    '<h2>What you get</h2><ul>' + (p.amenities || []).map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' +
    '<h2>House rules</h2><ul>' + (p.rules || []).map(a => '<li>' + esc(a) + '</li>').join('') + '<li>Check-in from ' + esc(p.checkinTime) + ', checkout by ' + esc(p.checkoutTime) + '.</li></ul>' +
    (revs.length ? '<h2>What guests say</h2>' + revs.map(r => '<blockquote><p>' + esc(r.text) + '</p><footer>' + esc(r.name) + ', ' + '★'.repeat(r.stars) + '</footer></blockquote>').join('') + (s.live ? '<p>Every review is from a guest who stayed and chose to share it, whatever their rating.</p>' : '') : '') +
    (seoOf(p).areaIntro || guideOf(p).length ? '<h2 id="area">Things to do near ' + esc(p.name) + ', ' + esc(town(p)) + '</h2>' + String(seoOf(p).areaIntro || '').split(/\n+/).filter(Boolean).map(x => '<p>' + esc(x) + '</p>').join('') +
      (guideOf(p).length ? '<ul>' + guideOf(p).map(g => '<li><strong>' + esc(g[0]) + '</strong>' + (g[1] ? ', ' + esc(g[1]) : '') + (g[2] ? '. ' + esc(g[2]) : '') + '</li>').join('') + '</ul>' : '') : '') +
    (p.photos && p.photos.length ? '<h2>Photos</h2>' + p.photos.slice(0, 12).map(x => '<figure><img src="' + esc(x.url) + '" alt="' + esc(x.cap || p.name + ', ' + town(p)) + '" loading="lazy" width="1200" height="800">' + (x.cap ? '<figcaption>' + esc(x.cap) + '</figcaption>' : '') + '</figure>').join('') : '') +
    (seoOf(p).videoUrl ? '<p><a href="' + esc(seoOf(p).videoUrl) + '">Watch a video tour of ' + esc(p.name) + '</a></p>' : '') +
    '<h2 id="faq">Questions</h2>' + faqs.map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('') +
    ((seoOf(p).sameAs || []).length ? '<h2>Find ' + esc(p.name) + ' elsewhere</h2><ul>' + seoOf(p).sameAs.map(u => '<li><a href="' + esc(u) + '" rel="noopener">' + esc(u.replace(/^https:\/\/(www\.)?/, '').split('/')[0]) + '</a></li>').join('') + '</ul>' : '') +
    '</article>';
}

function llms(s, p, url) {
  const faqs = faqsOf(s, p);
  return '# ' + p.name + '\n\n> ' + (p.headline || '') + ' ' + kind(p)[0].toUpperCase() + kind(p).slice(1) + ' in ' + p.area + ', run by ' + s.account.business + '. Book direct at ' + url + '\n\n' +
    '## Facts\n\n- Location: ' + p.area + ', United Kingdom\n- Sleeps: ' + p.maxGuests + '\n- Bedrooms: ' + p.bedrooms + '\n- Bathrooms: ' + p.baths + '\n- Price: from ' + money(p.nightly) + ' a night' + (p.weekend ? ' (' + money(p.nightly + p.weekend) + ' on Friday and Saturday)' : '') + ', cleaning ' + money(p.cleaning) + '\n- Minimum stay: ' + p.minNights + ' night' + (p.minNights === 1 ? '' : 's') + '\n- Pets: ' + (p.petsAllowed ? 'dogs welcome' + (p.petFee ? ', ' + money(p.petFee) + ' fee' : '') : 'not allowed') + '\n- Check-in: from ' + p.checkinTime + ', checkout by ' + p.checkoutTime + '\n' + (p.rating && p.reviews ? '- Guest rating: ' + p.rating + ' out of 5 from ' + p.reviews + ' reviews\n' : '') +
    (seoOf(p).summary ? '\n## In short\n\n' + seoOf(p).summary + '\n' : '') +
    '\n## About\n\n' + (p.about || '') + '\n\n## Amenities\n\n' + (p.amenities || []).map(a => '- ' + a).join('\n') + '\n\n## House rules\n\n' + (p.rules || []).map(a => '- ' + a).join('\n') +
    (guideOf(p).length || seoOf(p).areaIntro ? '\n\n## Nearby\n\n' + (seoOf(p).areaIntro ? seoOf(p).areaIntro.trim() + '\n\n' : '') + guideOf(p).map(g => '- ' + g[0] + (g[1] ? ': ' + g[1] : '') + (g[2] ? '. ' + g[2] : '')).join('\n') : '') +
    '\n\n## Questions guests ask\n\n' + faqs.map(([q, a]) => '### ' + q + '\n\n' + a).join('\n\n') +
    (reviewsOf(s, p).length ? '\n\n## What guests say\n\n' + reviewsOf(s, p).slice(0, 3).map(r => '> ' + r.text.replace(/\s+/g, ' ') + ' (' + r.name + ', ' + r.stars + ' stars)').join('\n\n') : '') +
    ((seoOf(p).sameAs || []).length || seoOf(p).videoUrl ? '\n\n## Elsewhere\n\n' + (seoOf(p).sameAs || []).map(u => '- ' + u).join('\n') + (seoOf(p).videoUrl ? '\n- Video tour: ' + seoOf(p).videoUrl : '') : '') +
    '\n\n## Booking\n\n- [Check availability and book direct](' + url + '): live calendar, instant confirmation, card, Apple Pay or Google Pay.\n';
}

// A crawler that matches a named group ignores the * group, so every group repeats the private paths.
const PRIVATE = ['Disallow: /app', 'Disallow: /trip/', 'Disallow: /api/'];
const AI_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-SearchBot', 'Claude-User', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'MistralAI-User', 'Meta-ExternalAgent', 'Amazonbot'];
function robots(sitemapUrl) {
  return ['User-agent: *', 'Allow: /', ...PRIVATE, '', '# AI search and assistants are welcome to read and cite this site',
    ...AI_BOTS.map(b => ['User-agent: ' + b, 'Allow: /', ...PRIVATE].join('\n')), '', 'Sitemap: ' + sitemapUrl, ''].join('\n');
}
function sitemap(urls) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls.map(u => '  <url><loc>' + esc(u.loc) + '</loc>' + (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') + '</url>').join('\n') + '\n</urlset>\n';
}
// Sitemap with each home's photos as image entries (Google Images), for a host domain or a /s/<host> site.
function sitemapFor(s, homes, extra) {
  const x = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n';
  return x + homes.map(([p, loc]) => '  <url><loc>' + esc(loc) + '</loc><lastmod>' + s.today + '</lastmod>' + (p.photos || []).slice(0, 20).map(ph => '<image:image><image:loc>' + esc(ph.url) + '</image:loc></image:image>').join('') + '</url>').join('\n') +
    (extra || []).map(loc => '\n  <url><loc>' + esc(loc) + '</loc></url>').join('') + '\n</urlset>\n';
}
// IndexNow (Bing, Yandex, Seznam, Naver): a stable key per workspace, served at /<key>.txt on the host's site.
function indexNowKey(secret, wid) { return require('crypto').createHmac('sha256', String(secret || 'bb')).update('indexnow:' + wid).digest('hex').slice(0, 32); }
module.exports = { head, content, llms, robots, sitemap, sitemapFor, indexNowKey, jsonLd, titleOf, descOf, faqsOf, reviewsOf };
