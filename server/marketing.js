// Search and AI visibility for our own marketing site (booking-booster.co.uk): readable page content for crawlers
// that do not run JavaScript, schema.org structured data, and llms.txt. The words match the app's marketing page
// in web/src/site.js; test/marketing.test.js checks that the FAQ here and there stay the same.
'use strict';
const { esc } = require('./pages');

const PRICE = { setup: 997, month: 200, year: 2000, addon: 15, homes: 3 };
const FAQ = [
  ['Do I have to leave Airbnb or Vrbo?', 'No. Keep your listings if you like. We focus on growing your direct bookings, so over time fewer stays need a platform. If you keep a listing running, the optional Calendar sync add-on (£15 a month) reads the calendar from your channel manager, Airbnb, Vrbo or Booking.com and blocks those dates on your site, so you never double book. We never list your home on the platforms or change your rates there.'],
  ['How do guests pay?', 'By card, Apple Pay or Google Pay through Stripe, paid straight into your UK bank account. Security deposits are card holds that release on their own after checkout.'],
  ['What is AI visibility?', 'How often your holiday let shows up in ChatGPT, Gemini, Perplexity and Google when travellers ask where to stay. We check the questions guests ask about your area every week and fix the gaps.'],
  ['How long does setup take?', 'Paste your listing link and your site is live the same day on a free address. Connecting your own .co.uk domain, SEO pages and your guest list takes us about a week.'],
  ['Who owns the guest list?', 'You do. Every guest who books direct, and every past guest you import, is yours to export at any time. We handle their data under UK GDPR.'],
  ['Do prices include VAT?', 'Yes. Every price on this page includes VAT. There is a one-off £997 setup fee, your first month is free, then it is £200 a month. There is no contract, and you can cancel from your console at any time. Your domain stays yours.'],
];
// Extra answers for search engines and AI assistants. They are true of the product today.
const MORE = [
  ['What is Bookingbooster?', 'Bookingbooster builds and runs direct booking websites for UK holiday let and short-term let owners. You get your own website on your own domain, with live availability, card payments, online check-in, guest email and text marketing, local SEO pages and AI search visibility, all in one place. Guests book and pay you directly, with no commission.'],
  ['Does Bookingbooster take commission on bookings?', 'No. You pay a flat £200 a month after a one-off £997 setup fee, and your first month is free. Guests pay you directly through your own Stripe account, and you keep every booking.'],
  ['Is Bookingbooster a channel manager?', 'No. It is a direct booking website with marketing built in. If you also list on Airbnb, Vrbo or Booking.com, the optional Calendar sync add-on (£15 a month) keeps your calendars in step so you never double book.'],
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
const DESCRIPTION = 'Your own booking website for your UK holiday let, found on Google and in AI answers, with payments, guest check-in and email marketing in one place. £997 setup, first month free, then £200 a month. No commission.';
const allFaq = () => FAQ.concat(MORE);

function jsonLd(base, co) {
  const url = base + '/';
  const org = { '@type': 'Organization', '@id': url + '#org', name: 'Bookingbooster', url, logo: base + '/assets/icons/icon-512.png', email: co.support,
    description: 'Direct booking websites, SEO, AI visibility and guest marketing for UK holiday let and short-term let hosts.', areaServed: { '@type': 'Country', name: 'United Kingdom' },
    contactPoint: { '@type': 'ContactPoint', contactType: 'customer support', email: co.support, areaServed: 'GB', availableLanguage: 'en-GB' } };
  if (co.name) org.legalName = co.name;
  if (co.number) org.identifier = { '@type': 'PropertyValue', propertyID: 'Companies House number', value: co.number };
  if (co.vat) org.vatID = co.vat;
  const offer = (name, price, unit, extra) => Object.assign({ '@type': 'Offer', name, price: String(price), priceCurrency: 'GBP', url: base + '/start', availability: 'https://schema.org/InStock',
    priceSpecification: Object.assign({ '@type': 'UnitPriceSpecification', price: String(price), priceCurrency: 'GBP', valueAddedTaxIncluded: true }, unit ? { unitCode: unit, referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: unit } } : {}) }, extra || {});
  return { '@context': 'https://schema.org', '@graph': [
    org,
    { '@type': 'WebSite', '@id': url + '#site', name: 'Bookingbooster', url, inLanguage: 'en-GB', publisher: { '@id': url + '#org' } },
    { '@type': 'WebPage', '@id': url + '#page', url, name: TITLE, description: DESCRIPTION, inLanguage: 'en-GB', isPartOf: { '@id': url + '#site' }, about: { '@id': url + '#service' } },
    { '@type': 'Service', '@id': url + '#service', name: 'Bookingbooster direct booking website', serviceType: 'Direct booking website and marketing for holiday lets',
      provider: { '@id': url + '#org' }, areaServed: { '@type': 'Country', name: 'United Kingdom' }, audience: { '@type': 'BusinessAudience', audienceType: 'UK holiday let and short-term let owners' },
      description: DESCRIPTION,
      hasOfferCatalog: { '@type': 'OfferCatalog', name: 'Bookingbooster pricing', itemListElement: [
        offer('One-off setup fee', PRICE.setup, null, { description: 'Paid once when you start. Your first month is then free.' }),
        offer('Monthly plan', PRICE.month, 'MON', { description: 'Everything included for up to ' + PRICE.homes + ' homes. No commission. Cancel anytime.' }),
        offer('Calendar sync add-on', PRICE.addon, 'MON', { description: 'Keeps your calendar in step with Airbnb, Vrbo, Booking.com or your channel manager.' }),
      ] } },
    { '@type': 'FAQPage', '@id': url + '#faq', mainEntity: allFaq().map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ] };
}

function head(base, path) {
  const url = base + '/';
  return '<link rel="canonical" href="' + esc(url) + '">' +
    '<meta property="og:type" content="website"><meta property="og:site_name" content="Bookingbooster"><meta property="og:title" content="' + esc(TITLE) + '"><meta property="og:description" content="' + esc(DESCRIPTION) + '">' +
    '<meta property="og:url" content="' + esc(url) + '"><meta property="og:locale" content="en_GB"><meta property="og:image" content="' + esc(base + '/assets/icons/icon-512.png') + '">' +
    '<meta name="twitter:card" content="summary"><meta name="theme-color" content="#3355FF"><link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">' +
    '<link rel="alternate" type="text/plain" title="llms.txt" href="' + esc(base + '/llms.txt') + '">';
}
const ldScript = (base, co) => '<script type="application/ld+json">' + JSON.stringify(jsonLd(base, co)).replace(/</g, '\\u003c') + '</script>';

// Readable content for crawlers that do not run JavaScript. The app replaces it when it starts.
function content(base, co) {
  const li = a => '<ul>' + a.map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>';
  return '<article class="seo" id="seo">' +
    '<h1>More direct bookings. Less platform fees.</h1>' +
    '<p>Own your bookings, your guests and your website. Bookingbooster gets your UK holiday let found on Google and in AI answers, brings past guests back, and you stop paying 15% or more on every stay.</p>' +
    '<p><a href="/start">Get my booking site</a> · <a href="/demo">See the live demo</a></p>' +
    '<h2>Everything a host needs to go direct</h2>' + FEATURES.map(([h, p]) => '<h3>' + esc(h) + '</h3><p>' + esc(p) + '</p>').join('') +
    '<h2>How it works</h2><ol>' + STEPS.map(([h, p]) => '<li><strong>' + esc(h) + '.</strong> ' + esc(p) + '</li>').join('') + '</ol>' +
    '<h2>Pricing</h2><p>One plan, done for you. A one-off £' + PRICE.setup + ' setup fee, your first month free, then £' + PRICE.month + ' a month. No commission on bookings. Cancel anytime. Prices include VAT. Covers up to ' + PRICE.homes + ' homes.</p>' +
    li(INCLUDED) + '<p>Optional calendar sync add-on: £' + PRICE.addon + ' a month.</p>' +
    '<h2>Questions hosts ask</h2>' + allFaq().map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('') +
    '<p>Something else? Email <a href="mailto:' + esc(co.support) + '">' + esc(co.support) + '</a>.</p>' +
    '<p><a href="/help">Help</a> · <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></p>' +
    '</article>';
}

function llms(base, co) {
  return '# Bookingbooster\n\n' +
    '> Direct booking websites for UK holiday let owners: your own site on your own domain, found on Google and in AI answers, with card payments, online check-in, guest email and text marketing. No commission on bookings. Not a channel manager: an optional add-on syncs calendars with Airbnb, Vrbo, Booking.com or a channel manager so you never double book.\n\n' +
    '## Key facts\n\n' +
    '- Website: ' + base + '/\n- Serves: holiday let and short-term let owners in the United Kingdom (cottages, cabins, lodges, apartments, barn conversions, shepherd’s huts)\n' +
    '- Price: £' + PRICE.setup + ' one-off setup fee, first month free, then £' + PRICE.month + ' a month. All prices include VAT. Covers up to ' + PRICE.homes + ' homes.\n' +
    '- Calendar sync add-on: £' + PRICE.addon + ' a month\n- Commission on bookings: none. Guests pay the owner directly through Stripe.\n- Contract: none, cancel anytime. The owner keeps their domain and guest list.\n- Contact: ' + co.support + '\n\n' +
    '## What is included\n\n' + INCLUDED.map(x => '- ' + x).join('\n') + '\n\n' +
    '## How it works\n\n' + STEPS.map(([h, p], i) => (i + 1) + '. ' + h + ': ' + p).join('\n') + '\n\n' +
    '## Questions\n\n' + allFaq().map(([q, a]) => '### ' + q + '\n\n' + a).join('\n\n') + '\n\n' +
    '## Links\n\n- [Home and pricing](' + base + '/)\n- [Start a booking site](' + base + '/start)\n- [Live demo](' + base + '/demo)\n- [Help](' + base + '/help)\n- [Privacy notice](' + base + '/privacy)\n- [Terms of service](' + base + '/terms)\n';
}

module.exports = { FAQ, MORE, TITLE, DESCRIPTION, PRICE, jsonLd, head, ldScript, content, llms };
