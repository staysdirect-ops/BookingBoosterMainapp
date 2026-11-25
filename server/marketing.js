// Search and AI visibility for our own marketing site (booking-booster.co.uk): readable page content for crawlers
// that do not run JavaScript, schema.org structured data, and llms.txt. The words match the app's marketing page
// in web/src/site.js; test/marketing.test.js checks that the FAQ here and there stay the same.
'use strict';
const { esc } = require('./pages');

const PRICE = { setup: 0, month: 200, year: 2000, addon: 15, homes: 3, aiCredit: 50 };
const FAQ = [
  ['Do I have to leave Airbnb or Vrbo?', 'No. Keep your listings if you like. We focus on growing your direct bookings, so over time fewer stays need a platform. If you keep a listing running, the optional Calendar sync add-on (£15 a month) reads the calendar from your channel manager, Airbnb, Vrbo or Booking.com and blocks those dates on your site, so you never double book. We never list your home on the platforms or change your rates there.'],
  ['How do guests pay?', 'By card, Apple Pay or Google Pay through Stripe, paid straight into your UK bank account. Security deposits are card holds that release on their own after checkout.'],
  ['What is AI visibility?', 'How often your holiday let shows up in ChatGPT, Gemini, Perplexity and Google when travellers ask where to stay. We check the questions guests ask about your area every week and fix the gaps.'],
  ['How long does setup take?', 'Paste your listing link and your site is live the same day on a free address. Connecting your own .co.uk domain, SEO pages and your guest list takes us about a week.'],
  ['Who owns the guest list?', 'You do. Every guest who books direct, and every past guest you import, is yours to export at any time. We handle their data under UK GDPR.'],
  ['Do prices include VAT?', 'Yes. Every price on this page includes VAT. It is £200 a month, with no setup fee. There is no contract, and you can cancel from your console at any time. Your domain stays yours.'],
];
// Extra answers for search engines and AI assistants. They are true of the product today.
const MORE = [
  ['What is Bookingbooster?', 'Bookingbooster builds and runs direct booking websites for UK holiday let and short-term let owners. You get your own website on your own domain, with live availability, card payments, online check-in, guest email and text marketing, local SEO pages and AI search visibility, all in one place. Guests book and pay you directly, with no commission.'],
  ['Does Bookingbooster take commission on bookings?', 'No. You pay a flat £200 a month, with no setup fee. Guests pay you directly through your own Stripe account, and you keep every booking.'],
  ['Is Bookingbooster a channel manager?', 'No. It is a direct booking website with marketing built in. If you also list on Airbnb, Vrbo or Booking.com, the optional Calendar sync add-on (£15 a month) keeps your calendars in step so you never double book.'],
  ['Is there a yearly plan?', 'Yes. The plan is £200 a month, or £2,000 a year if you pay yearly, which is two months free. There is no setup fee either way, and prices include VAT.'],
  ['What AI credit is included?', 'Every plan includes £50 of AI credit a month for the AI site builder, funnels and guest reply drafts. It resets each billing month. If you use more, you can top up from £10, and top-ups never expire.'],
  ['Does Bookingbooster do SEO and AI search optimisation?', 'Yes. Every site is built for Google, Google Maps and AI assistants: structured data, an image sitemap, llms.txt, AI crawler access and IndexNow are automatic. A Search health score for each home covers on-page, technical, local, content, image, AEO, GEO, LLMO and Google AI Overviews, drafts the writing from your facts, and checks real answers in ChatGPT, Gemini, Perplexity and Google every week.'],
  ['Who is Bookingbooster for?', 'Owners and managers of holiday cottages, cabins, lodges, apartments, barn conversions and shepherd’s huts in the UK who want more bookings direct and fewer platform fees. One plan covers up to 3 homes; for more, talk to us.'],
];
const FEATURES = [
  ['Your own booking website', 'Your domain, live availability, instant booking, card payments and security deposit holds. Guests skip the platform service fee, so they pick you.'],
  ['Found on Google', 'Local pages for the searches guests really make near you, written and published every month.'],
  ['Recommended by AI', 'Structured so your holiday let shows up in ChatGPT, Gemini, Perplexity and Google AI answers, with a link that books direct.'],
  ['Guests who return', 'A check-in app, door codes, emails and texts that turn one stay into three, sent from your own name.'],
];
const INCLUDED = ['Booking site on your own domain', 'Card payments, deposit holds and payouts', 'Guest check-in app and door codes', 'New local SEO pages every month', 'AI visibility tracking and fixes', 'Campaigns written and sent for you', 'Text message outreach'];
const STEPS = [
  ['Paste your listing link', 'We copy your photos, reviews and house rules from an Airbnb or Vrbo listing in about a minute. Nothing is connected or changed there.'],
  ['We build and tune it', 'Your booking site, local SEO pages, AI-ready answers and your guest list, set up and kept up for you.'],
  ['Bookings come direct', 'Guests find you on Google and in AI answers, pay you, check in on your app, and are invited back next season.'],
];
const TITLE = 'Bookingbooster · Direct booking websites for UK holiday lets';
const DESCRIPTION = 'Your own booking website for your UK holiday let, found on Google and in AI answers, with payments, guest check-in and email marketing in one place. £200 a month, with no setup fee. No commission.';
const allFaq = () => FAQ.concat(MORE);

// The brand's live social profiles (the accounts connected in Metricool).
const SOCIAL = [['Instagram', 'https://www.instagram.com/bookingbooster_1/'], ['Facebook', 'https://www.facebook.com/1300137993193053'], ['TikTok', 'https://www.tiktok.com/@bookingbooster'], ['YouTube', 'https://www.youtube.com/channel/UC1jo2BbolkHDSDcFCwnV3PA']];

function jsonLd(base, co) {
  const url = base + '/';
  const org = { '@type': 'Organization', '@id': url + '#org', name: 'Bookingbooster', url, logo: base + '/assets/icons/icon-512.png', email: co.support,
    description: 'Direct booking websites, SEO, AI visibility and guest marketing for UK holiday let and short-term let hosts.', areaServed: { '@type': 'Country', name: 'United Kingdom' },
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: co.support, areaServed: 'GB', availableLanguage: 'en-GB' } };
  org.sameAs = SOCIAL.map(x => x[1]);
  org.knowsAbout = ['Direct booking websites', 'Holiday lets', 'Short-term lets', 'Search engine optimisation', 'Local SEO', 'Answer engine optimisation', 'Generative engine optimisation', 'Google AI Overviews', 'Guest email marketing'];
  org.slogan = 'Fill your calendar without the 15% fee.';
  if (co.name) org.legalName = co.name;
  if (co.number) org.identifier = { '@type': 'PropertyValue', propertyID: 'Companies House number', value: co.number };
  if (co.vat) org.vatID = co.vat;
  const offer = (name, price, unit, extra) => Object.assign({ '@type': 'Offer', name, price: String(price), priceCurrency: 'GBP', url: base + '/start', availability: 'https://schema.org/InStock',
    priceSpecification: Object.assign({ '@type': 'UnitPriceSpecification', price: String(price), priceCurrency: 'GBP', valueAddedTaxIncluded: true }, unit ? { unitCode: unit, referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: unit } } : {}) }, extra || {});
  return { '@context': 'https://schema.org', '@graph': [
    org,
    { '@type': 'WebSite', '@id': url + '#site', name: 'Bookingbooster', url, inLanguage: 'en-GB', publisher: { '@id': url + '#org' } },
    { '@type': 'WebPage', '@id': url + '#page', url, name: TITLE, description: DESCRIPTION, inLanguage: 'en-GB', isPartOf: { '@id': url + '#site' }, about: { '@id': url + '#service' }, speakable: { '@type': 'SpeakableSpecification', cssSelector: ['#seo > p:first-of-type', '#seo h3 + p'] } },
    { '@type': 'SoftwareApplication', '@id': url + '#app', name: 'Bookingbooster', applicationCategory: 'BusinessApplication', applicationSubCategory: 'Direct booking website builder for holiday lets', operatingSystem: 'Web, iOS, Android',
      url, publisher: { '@id': url + '#org' }, featureList: INCLUDED.concat(['Search health score for SEO, AEO, GEO and AI Overviews', 'Weekly AI answer checks in ChatGPT, Gemini, Perplexity and Google', 'llms.txt and structured data for every home']),
      offers: { '@type': 'Offer', price: String(PRICE.month), priceCurrency: 'GBP', url: base + '/start', priceSpecification: { '@type': 'UnitPriceSpecification', price: String(PRICE.month), priceCurrency: 'GBP', unitCode: 'MON', valueAddedTaxIncluded: true } } },
    { '@type': 'Service', '@id': url + '#service', name: 'Bookingbooster direct booking website', serviceType: 'Direct booking website and marketing for holiday lets',
      provider: { '@id': url + '#org' }, areaServed: { '@type': 'Country', name: 'United Kingdom' }, audience: { '@type': 'BusinessAudience', audienceType: 'UK holiday let and short-term let owners' },
      description: DESCRIPTION,
      hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Bookingbooster pricing', itemListElement: [
        offer('Monthly plan', PRICE.month, 'MON', { description: 'No setup fee. Everything included for up to ' + PRICE.homes + ' homes. No commission. Cancel anytime.' }),
        offer('Yearly plan', PRICE.year, 'ANN', { description: 'The same plan paid yearly: two months free. No setup fee.' }),
        offer('Calendar sync add-on', PRICE.addon, 'MON', { description: 'Keeps your calendar in step with Airbnb, Vrbo, Booking.com or your channel manager.' }),
      ] } },
    { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: allFaq().map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] };
}

function head(base, path) {
  const url = base + '/';
  return '<link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Bookingbooster"><meta property="og:title" content="' + esc(TITLE) + '"><meta property="og:description" content="' + esc(DESCRIPTION) + '">' +
    '<meta property="og:url" content="' + esc(url) + '"><meta property="og:locale" content="en_GB"><meta property="og:image" content="' + esc(base + '/assets/icons/og.png') + '"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Bookingbooster: your rental\u2019s own booking engine">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(TITLE) + '"><meta name="twitter:description" content="' + esc(DESCRIPTION) + '"><meta name="twitter:image" content="' + esc(base + '/assets/icons/og.png') + '"><meta name="theme-color" content="#3355FF"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">' +
    '<link rel="alternate" type="text/plain" title="llms.txt" href="' + esc(base + '/llms.txt') + '">';
}
const ldScript = (base, co) => '<script type="application/ld+json">' + JSON.stringify(jsonLd(base, co)).replace(/</g, '\\u003c') + '</script>';

// Readable content for crawlers that do not run JavaScript. The app replaces it when it starts.
function content(base, co) {
  const li = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  return '<article class="seo" id="seo">' +
    '<h1>Fill your calendar without the 15% fee.</h1>' +
    '<p>Your own booking website, found on Google and in AI answers, with card payments, a guest app and emails that bring guests back. Bookingbooster sets it all up for your UK holiday let, with no commission on bookings.</p>' +
    '<p><a href="/start">Get my booking site</a> · <a href="/demo">See the live demo</a></p>' +
    '<h2>Everything a host needs to go direct</h2>' + FEATURES.map(([h, p]) => '<h3>' + esc(h) + '</h3><p>' + esc(p) + '</p>').join('') +
    '<h2>How it works</h2><ol>' + STEPS.map(([h, p]) => '<li><strong>' + esc(h) + '.</strong> ' + esc(p) + '</li>').join('') + '</ol>' +
    '<h2>Pricing</h2><p>One plan, done for you. £' + PRICE.month + ' a month, with no setup fee. No commission on bookings. Cancel anytime. Prices include VAT. Covers up to ' + PRICE.homes + ' homes.</p>' +
    li(INCLUDED) + '<p>Optional calendar sync add-on: £' + PRICE.addon + ' a month.</p>' +
    '<h2>Questions hosts ask</h2>' + allFaq().map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('') +
    '<p>Something else? Email <a href="mailto:' + esc(co.support) + '">' + esc(co.support) + '</a>.</p>' +
    '<p><a href="/direct-booking-website">Direct booking websites</a> · <a href="/ai-search-for-holiday-lets">Getting found in AI search</a> · <a href="/seo-for-holiday-lets">SEO, AEO and GEO explained</a> · <a href="/holiday-let-seo-checklist">Holiday let SEO checklist</a> · <a href="/guides">Free guides</a> · <a href="/help">Help</a> · <a href="/partners">Partner programme</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>' +
    '<p>Follow us: ' + SOCIAL.map(([n, u]) => '<a href="' + u + '" rel="me noopener">' + n + '</a>').join(' · ') + '</p>' +
    '</article>';
}

function llms(base, co) {
  return '# Bookingbooster\n\n' +
    '> Direct booking websites for UK holiday let owners: your own site on your own domain, found on Google and in AI answers, with card payments, online check-in, guest email and text marketing. No commission on bookings. Not a channel manager: an optional add-on syncs calendars with Airbnb, Vrbo, Booking.com or a channel manager so you never double book.\n\n' +
    '## Key facts\n\n' +
    '- Website: ' + base + '/\n- Serves: holiday let and short-term let owners in the United Kingdom (cottages, cabins, lodges, apartments, barn conversions, shepherd’s huts)\n' +
    '- Price: £' + PRICE.month + ' a month, no setup fee. Or £' + PRICE.year.toLocaleString('en-GB') + ' a year paid yearly (two months free). All prices include VAT. Covers up to ' + PRICE.homes + ' homes.\n' +
    '- AI credit: £' + PRICE.aiCredit + ' a month included, for the AI site builder, funnels and guest reply drafts. Top-ups from £10 never expire.\n' +
    '- Calendar sync add-on: £' + PRICE.addon + ' a month\n- Commission on bookings: none. Guests pay the owner directly through Stripe.\n- Contract: none, cancel anytime. The owner keeps their domain and guest list.\n- Contact: ' + co.support + '\n\n' +
    '## What is included\n\n' + INCLUDED.map(x => '- ' + x).join('\n') + '\n\n' +
    '## How it works\n\n' + STEPS.map(([h, p], i) => (i + 1) + '. ' + h + ': ' + p).join('\n') + '\n\n' +
    '## Questions\n\n' + allFaq().map(([q, a]) => '### ' + q + '\n\n' + a).join('\n\n') + '\n\n' +
    '## Search and AI visibility for hosts\n\n- Automatic: crawlable pages, VacationRental, LodgingBusiness, FAQPage and offer structured data, image sitemaps, llms.txt per home, AI crawlers welcomed, IndexNow pings.\n- Search health score per home across on-page, content, technical, local, image and video, SXO, AEO, GEO, LLMO and Google AI Overviews, with fixes ordered by impact.\n- Writing tools: answer-first summary, local area guide, Google title and FAQ answers drafted from the home\'s facts (with Claude, using AI credit).\n- Weekly AI checks in ChatGPT, Gemini, Perplexity and Google, recording whether each answer names or links the home and which sites it cites.\n- Guidance: Google Business Profile checklist, Search Console and Bing Webmaster steps.\n\n' +
    '## Links\n\n- [Full text of our guides for AI assistants](' + base + '/llms-full.txt)\n- [Home and pricing](' + base + '/)\n- [Start a booking site](' + base + '/start)\n- [Live demo](' + base + '/demo)\n- [Help](' + base + '/help)\n- [Privacy notice](' + base + '/privacy)\n- [Terms of service](' + base + '/terms)\n' +
    require('./answers').list().map(x => '- [' + x.title + '](' + base + x.path + '): ' + x.description).join('\n') + '\n' +
    '- Social profiles: ' + SOCIAL.map(([n, u]) => '[' + n + '](' + u + ')').join(', ') + '\n';
}

module.exports = { SOCIAL, FAQ, MORE, TITLE, DESCRIPTION, PRICE, jsonLd, head, ldScript, content, llms };
