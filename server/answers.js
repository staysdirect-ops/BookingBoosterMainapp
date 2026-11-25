// Answer pages for our own marketing site (booking-booster.co.uk). Each page answers one question UK holiday let hosts
// ask Google and AI assistants (ChatGPT, Perplexity, Gemini, Claude, Copilot), in plain server-rendered HTML with
// schema.org structured data, so a crawler that does not run JavaScript can read, quote and cite it.
// Every price and fact here comes from server/marketing.js, so the pages never drift from the home page or llms.txt.
'use strict';
const { esc } = require('./pages');
const mkt = require('./marketing');

const P = mkt.PRICE;
const AIRBNB_FEE = 0.155; // Airbnb's host-only fee, the same figure the savings calculator on the home page uses
const money = n => '£' + Math.round(n).toLocaleString('en-GB');
const feeOn = rev => money(rev * AIRBNB_FEE);

const GUIDES = [
  ['direct-booking-playbook.pdf', 'The direct booking playbook', 'The full plan for moving a UK holiday let from platform bookings to direct bookings, step by step.'],
  ['direct-booking-launch-checklist.pdf', 'Direct booking launch checklist', 'Everything to tick off before your booking site takes its first payment.'],
  ['direct-booking-website-must-haves.pdf', 'Direct booking website must-haves', 'The features guests expect before they trust a site enough to pay on it.'],
  ['fee-leak-worksheet.pdf', 'Fee leak worksheet', 'Work out what platform fees cost you each year, stay by stay.'],
  ['get-found-in-ai-search.pdf', 'Get found in AI search', 'How ChatGPT, Perplexity, Gemini and Google AI Overviews choose which holiday lets to recommend, and how to be one of them.'],
  ['ai-search-self-audit.pdf', 'AI search self-audit', 'A checklist to test how your holiday let shows up in AI answers today.'],
  ['guest-message-template-pack.pdf', 'Guest message template pack', 'Ready-to-send messages for every stage of a stay.'],
  ['repeat-guest-engine.pdf', 'The repeat guest engine', 'How to turn one stay into three with email and text marketing.'],
  ['repeat-guest-swipe-file.pdf', 'Repeat guest swipe file', 'Email and text examples that bring past guests back.'],
];

// Every kind of search work: name, what it is, what it means for a holiday let and what Bookingbooster does. [name, def, host, group, ours]
const TERMS = [
  ['On-page SEO', 'The words and HTML of each page: titles, descriptions, headings, keywords and internal links.', 'A title that says what and where ("Hot tub cabin in Troutbeck"), a description with the price, and words that match what guests search.', 'classic', 'Titles, descriptions and headings are written for every page. Hosts can set their own and see a Google preview.'],
  ['Off-page SEO', 'Signals from outside your site, mainly links from other websites, brand mentions and digital PR.', 'Links from your local tourism site, local blogs, "best stays" round-ups and your own listings.', 'classic', 'We show which sites AI assistants cite for your area and add every listing and mention to your structured data.'],
  ['Technical SEO', 'How easily search engines can crawl and index a site: speed, mobile, structure, sitemaps and structured data.', 'Pages that load fast on a phone, can be read without JavaScript, and say in structured data that this is a holiday rental with a price and rules.', 'classic', 'Automatic: server-rendered pages, HTTPS, canonical tags, robots.txt, image sitemaps, VacationRental and LodgingBusiness schema, and IndexNow pings.'],
  ['Local SEO', 'Showing up in the Google Maps pack and "near me" searches, driven by your Google Business Profile, reviews and local citations.', 'A verified Google Business Profile in the right category, a map pin, steady reviews, and the same name and address everywhere.', 'classic', 'Map pin, address and reviews go into the schema. A guided Google Business Profile checklist covers the rest.'],
  ['Content SEO', 'Planning and writing content around what people actually search for.', 'An about text that answers who it suits and what is nearby, plus a local area guide for "things to do near" searches.', 'classic', 'Keyword ideas built from your home, and an area guide and summary drafted from your facts for you to approve.'],
  ['Image and video SEO', 'Ranking in Google Images, YouTube and video results.', 'Photos with descriptive captions, which become alt text, and a short walkthrough video on YouTube.', 'classic', 'Captions become alt text and image sitemap entries. A YouTube link adds video structured data.'],
  ['SXO (search experience optimisation)', 'SEO combined with conversion work, so visitors who land from search actually book.', 'The price up front, instant booking, real reviews and a note from the host on the page a searcher lands on.', 'classic', 'Live prices, instant card booking, guest reviews and a host note are on every page.'],
  ['AEO (answer engine optimisation)', 'Being the direct answer: featured snippets, People Also Ask, voice answers and AI Overviews. In practice, clear questions and answers plus structured data.', 'An answer-first summary of the home and short answers to the questions guests ask, starting with yes or no.', 'ai', 'An answer-first summary, FAQ ideas with answers drafted from your facts, FAQPage and speakable structured data.'],
  ['GEO (generative engine optimisation)', 'Being named and cited inside answers written by AI assistants such as ChatGPT, Perplexity, Gemini, Claude and Copilot.', 'Facts an assistant can check and quote, a page it is allowed to read, and a link it can give that books with you.', 'ai', 'llms.txt for every home, AI crawlers welcomed in robots.txt, and weekly checks of real answers with the sites they cite.'],
  ['LLMO (large language model optimisation)', 'Helping AI models recognise your business as one consistent entity, mostly through consistent mentions across the web.', 'The same home name, place and facts on your site, listings, Google Maps and social profiles, linked together.', 'ai', 'Your listings and profiles become sameAs links in your structured data, and we track whether answers link to your own site.'],
  ['AIO (AI Overview optimisation)', 'Showing in Google’s AI summary at the top of results. Some people use AIO loosely to mean AI optimisation in general.', 'Pages that already rank and answer the question in their first lines.', 'ai', 'Google answers are checked with each AI run, and your summary sits straight under the main heading, where AI Overviews read first.'],
  ['AI SEO', 'An umbrella label for AEO, GEO, LLMO and AIO. It is also used for doing normal SEO with AI tools, so check which one someone means.', 'Both meanings help: be the answer, and use AI to write and check faster.', 'ai', 'Both: we optimise for AI answers, and hosts can draft their SEO writing with Claude.'],
  ['Ecommerce SEO', 'Product and category pages, product schema and faceted navigation for online shops.', 'Partly applies: each home is a bookable product with a price and availability, but there are no categories or filters to manage.', 'part', 'Offer structured data with the nightly price, and a checkout on the page.'],
  ['International SEO', 'Targeting several countries or languages with hreflang tags and country domains.', 'Partly applies: most UK holiday lets serve guests in English and price in pounds, so one en-GB version is right.', 'part', 'Pages are marked en-GB with prices in pounds.'],
  ['ASO (app store optimisation)', 'Ranking apps in the App Store and Google Play.', 'Does not apply to a holiday let unless you publish your own app.', 'part', 'Our guest app installs from your own site, so there is no store listing to optimise.'],
];
const DEFS = list => '<dl>' + list.map(([n, d, h, g, o]) => '<dt id="' + n.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') + '"><strong>' + esc(n) + '</strong></dt><dd><p>' + esc(d) + '</p><p><em>For a holiday let:</em> ' + esc(h) + '</p><p><em>With Bookingbooster:</em> ' + esc(o) + '</p></dd>').join('') + '</dl>';
const CHECKLIST = [
  ['Give the home its own website on its own domain.', 'Search engines and AI assistants can read, trust and link a page you own.', 'Technical, GEO'],
  ['Claim and verify a Google Business Profile.', 'Pick "Holiday home", "Cottage" or the closest category and link your booking site.', 'Local'],
  ['Write an answer-first summary.', '40 to 60 words: what it is, where, who it sleeps, the price and the best feature, right under the main heading.', 'AEO, AIO, GEO'],
  ['Add structured data.', 'VacationRental or LodgingBusiness, FAQPage, reviews and an offer with the nightly price.', 'Technical, AEO'],
  ['Answer the questions guests ask.', 'Dogs, parking, Wi-Fi, check-in, families, accessibility. Start each answer with the answer.', 'AEO, GEO'],
  ['Publish a local area guide.', 'Walks, pubs and days out with distances, for "things to do near" searches.', 'Content, Local, AIO'],
  ['Caption every photo.', 'Captions become alt text for Google Images. Aim for 8 or more photos.', 'Image'],
  ['Link your listings and profiles.', 'Airbnb, Vrbo, Google Maps, Instagram: the same name everywhere, linked with sameAs.', 'LLMO, Local, Off-page'],
  ['Publish llms.txt and welcome AI crawlers.', 'A plain-text fact sheet for assistants, and a robots.txt that lets GPTBot, ClaudeBot and PerplexityBot in.', 'GEO'],
  ['Submit your sitemap and ping IndexNow.', 'Google Search Console for Google, IndexNow for Bing, whose results feed ChatGPT search and Copilot.', 'Technical'],
  ['Collect reviews steadily.', 'Ask every guest. Reviews feed local rankings and give models text about you.', 'Local, LLMO'],
  ['Get mentioned locally.', 'Your tourism board, local blogs and press. These are the sites AI answers cite.', 'Off-page, LLMO'],
  ['Check AI answers every week.', 'Ask ChatGPT, Perplexity, Gemini and Google the questions guests ask, and note who they name and cite.', 'GEO, AIO'],
];

const PRICE_LINE = '£' + P.month + ' a month, or £' + P.year.toLocaleString('en-GB') + ' a year, with no setup fee and no commission on bookings. Prices include VAT and cover up to ' + P.homes + ' homes. Every plan includes £' + P.aiCredit + ' of AI credit a month.';

const PAGES = {
  '/direct-booking-website': {
    title: 'Direct booking website for UK holiday lets · Bookingbooster',
    h1: 'A direct booking website for your UK holiday let',
    description: 'What a direct booking website is, what it costs, and how UK holiday let owners use one to take bookings without paying 15% or more to Airbnb or Vrbo. ' + PRICE_LINE,
    lead: 'A direct booking website is your own website, on your own domain, where guests check live availability and pay you directly. There is no platform in the middle, so there is no platform fee on the stay. Bookingbooster builds and runs one for UK holiday let owners, with SEO, AI search visibility and guest marketing included.',
    sections: [
      ['What you get', '<ul>' + ['Your own booking site on your own .co.uk domain, with live availability and instant booking', 'Card, Apple Pay and Google Pay payments through your own Stripe account, paid into your UK bank', 'Security deposits taken as card holds that release on their own after checkout', 'A guest check-in app with door codes', 'Local SEO pages written for the searches guests make near you, added every month', 'AI search visibility: structured data, llms.txt and answers that ChatGPT, Perplexity, Gemini and Google AI Overviews can read and cite', 'Email and text campaigns to past guests, written and sent for you', 'An optional calendar sync add-on (£' + P.addon + ' a month) so you never double book with Airbnb, Vrbo or Booking.com'].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'],
      ['What it costs', '<p>' + esc(PRICE_LINE) + '</p><p>Platform fees, by comparison, grow with every booking. At Airbnb’s host-only fee of 15.5%, a holiday let taking £30,000 a year through Airbnb pays about ' + feeOn(30000) + ' in fees, and one taking £60,000 pays about ' + feeOn(60000) + '. The plan costs £' + P.year.toLocaleString('en-GB') + ' a year on annual billing, whatever you take.</p>' +
        '<table><tr><th align="left">Yearly bookings</th><th align="left">Airbnb fee at 15.5%</th><th align="left">Bookingbooster, annual plan</th></tr>' +
        [20000, 30000, 60000, 100000].map(r => '<tr><td>' + money(r) + '</td><td>' + feeOn(r) + '</td><td>' + money(P.year) + '</td></tr>').join('') + '</table>' +
        '<p><small>Estimates. Most hosts keep some platform listings, so the saving depends on how many stays move direct.</small></p>'],
      ['Who it is for', '<p>Owners and managers of holiday cottages, cabins, lodges, apartments, barn conversions and shepherd’s huts in England, Scotland, Wales and Northern Ireland who want more bookings direct and fewer platform fees. One plan covers up to ' + P.homes + ' homes.</p>'],
      ['How it works', '<ol><li><strong>Paste your listing link.</strong> We copy your photos, reviews and house rules from Airbnb or Vrbo. Nothing there is changed.</li><li><strong>We build and tune it.</strong> Your site is live the same day on a free address. Your own domain, SEO pages and guest list take about a week.</li><li><strong>Bookings come direct.</strong> Guests find you on Google and in AI answers, pay you, and are invited back next season.</li></ol>'],
    ],
    faq: [
      ['Is a direct booking website worth it for one holiday let?', 'Usually, yes, once a home takes more than about £13,000 a year through Airbnb: at the 15.5% host-only fee that is roughly £2,000 in fees, more than a year of Bookingbooster on annual billing (£1,970). Every direct stay after that is money you keep.'],
      ['Do I have to leave Airbnb to take direct bookings?', 'No. Most hosts keep their listings and move repeat guests and search traffic to their own site over time. The calendar sync add-on blocks dates booked on the platforms so you never double book.'],
      ['Does Bookingbooster take commission?', 'No. ' + PRICE_LINE + ' Guests pay you directly through your own Stripe account.'],
      ['How long does it take to set up?', 'Your site can be live the same day on a free address. Connecting your own domain, local SEO pages and importing your guest list takes about a week.'],
    ],
  },
  '/ai-search-for-holiday-lets': {
    title: 'How to get your holiday let recommended by ChatGPT and AI search · Bookingbooster',
    h1: 'How to get your holiday let recommended in ChatGPT, Perplexity and Google AI answers',
    description: 'How AI assistants choose which UK holiday lets to recommend, and the steps that make your own booking site the one they cite. A guide for holiday let owners from Bookingbooster.',
    lead: 'More travellers now ask ChatGPT, Perplexity, Gemini, Claude, Copilot or Google’s AI Overviews where to stay, instead of scrolling a listings site. These assistants recommend places they can read, check and link to. A holiday let that only exists inside Airbnb is hard for them to cite. A holiday let with its own clear, fast, well-structured website is easy.',
    sections: [
      ['What AI assistants look for', '<ul>' + ['A page they can read without running JavaScript, that says plainly what the place is, where it is, who it sleeps and what it costs', 'Structured data (schema.org VacationRental, FAQPage and Organization) that confirms those facts in a machine-readable form', 'Answers to the exact questions travellers ask, such as “dog friendly cottage near Keswick with a hot tub”', 'The same name, address and details on Google Business Profile, social profiles and listings sites, so the facts agree', 'Recent reviews from real guests', 'A robots.txt that lets AI crawlers such as GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and Google-Extended in, and an llms.txt that sums the place up'].map(x => '<li>' + esc(x) + '</li>').join('') + '</ul>'],
      ['Steps you can take this week', '<ol><li><strong>Check where you stand.</strong> Ask ChatGPT, Perplexity and Gemini the questions a guest would ask about your area, and note who they recommend and which sites they cite.</li><li><strong>Give your home its own website.</strong> On your own domain, with the facts written out in full, not only in photos.</li><li><strong>Answer the questions guests ask.</strong> Pets, parking, hot tub, distance to the beach or pub, check-in times, minimum stay. One clear answer each.</li><li><strong>Claim your Google Business Profile</strong> and keep its name, address and website the same as your site.</li><li><strong>Ask happy guests for reviews</strong> and publish them on your site.</li><li><strong>Let AI crawlers in.</strong> Check your robots.txt does not block them, and add an llms.txt.</li></ol>'],
      ['What Bookingbooster does for you', '<p>Every Bookingbooster site is built this way from day one: crawlable pages, VacationRental and FAQ structured data, an llms.txt for each home, a robots.txt that welcomes AI crawlers and a sitemap. Each week we check the questions guests ask about your area across AI assistants, show you where you appear, and fix the gaps. ' + esc(PRICE_LINE) + '</p>'],
    ],
    faq: [
      ['What is AEO or AI search optimisation?', 'AEO (answer engine optimisation) is making your website easy for AI assistants such as ChatGPT, Perplexity, Gemini and Google AI Overviews to read, trust and cite, so they recommend you when someone asks a question you can answer. For a holiday let, that means clear facts, structured data, answers to guest questions and consistent details across the web.'],
      ['Can ChatGPT recommend my Airbnb listing?', 'Sometimes, but it often cannot read or link to platform listings reliably, and when it does the guest books through the platform and you pay the fee. A direct booking website gives the assistant a page it can read and a link that books with you.'],
      ['Does my holiday let need an llms.txt file?', 'It helps. llms.txt is a short plain-text summary of a site written for AI assistants. It does not replace good pages or structured data, but it gives assistants the key facts in one place. Every Bookingbooster site has one.'],
      ['How long does it take to show up in AI answers?', 'It varies. Assistants that search the web live, such as ChatGPT search and Perplexity, can find a new, well-structured page within days or weeks of it being indexed. Answers built from training data change more slowly.'],
    ],
  },
  '/seo-for-holiday-lets': {
    title: 'SEO, AEO, GEO and AI search for holiday lets, explained · Bookingbooster',
    h1: 'SEO, AEO, GEO and AI search for holiday lets: every type explained',
    description: 'Plain-English definitions of every kind of search optimisation, from on-page and local SEO to AEO, GEO, LLMO and Google AI Overviews, and what each one means for a UK holiday let.',
    lead: 'Search optimisation now means more than ranking on Google. Guests find holiday lets through Google results, Google Maps, AI Overviews and assistants such as ChatGPT, Perplexity, Gemini, Claude and Copilot. Each needs slightly different work. Here is every type in plain English, what it means for a holiday let, and what Bookingbooster does for you.',
    sections: [
      ['Classic search', DEFS(TERMS.filter(t => t[3] === 'classic'))],
      ['AI-era search', DEFS(TERMS.filter(t => t[3] === 'ai'))],
      ['Types that only partly apply to holiday lets', DEFS(TERMS.filter(t => t[3] === 'part'))],
    ],
    faq: [
      ['What is the difference between SEO, AEO and GEO?', 'SEO gets your pages ranked in search results. AEO (answer engine optimisation) gets your content quoted as the direct answer, in featured snippets, voice answers and AI Overviews. GEO (generative engine optimisation) gets you named and linked inside answers written by chatbots such as ChatGPT, Perplexity, Gemini and Claude. Good SEO is the base for both.'],
      ['Which type of SEO matters most for a holiday let?', 'Local SEO and AEO. Guests search by place ("cottage with hot tub in the Lake District") and increasingly ask AI assistants. A Google Business Profile, a fast site with clear facts and structured data, and answers to the questions guests ask cover most of what matters.'],
      ['What is LLMO?', 'LLMO (large language model optimisation) is helping AI models recognise your business as a real, consistent entity. For a holiday let that means the same name, place and facts on your website, your listings, Google Maps and social profiles, linked together, plus mentions on local and travel sites.'],
      ['Do I need to do all of this myself?', 'No. With Bookingbooster the technical work (structured data, sitemaps, llms.txt, crawler access, IndexNow) is automatic. The Search health screen scores each home across every type above, drafts the writing from your facts, and gives you a short checklist for the parts only you can do, such as your Google Business Profile.'],
    ],
  },
  '/holiday-let-seo-checklist': {
    title: 'Holiday let SEO and AI search checklist · Bookingbooster',
    h1: 'The holiday let SEO and AI search checklist',
    description: 'A step-by-step checklist to get a UK holiday let found on Google, Google Maps and in AI answers from ChatGPT, Perplexity, Gemini and Google AI Overviews.',
    lead: 'Work through these steps in order. The first ones matter most. Each one says which kind of search it helps, so you know why it is there.',
    sections: [['The checklist', '<ol>' + CHECKLIST.map(([h, why, tags]) => '<li><strong>' + esc(h) + '</strong> ' + esc(why) + ' <em>(' + esc(tags) + ')</em></li>').join('') + '</ol>'],
      ['Check your score', '<p>Every Bookingbooster host gets a Search health score for each home. It runs these checks for you, orders the fixes by how much each one adds, and drafts the writing from your own facts. It also asks ChatGPT, Gemini, Perplexity and Google the questions guests ask about your area each week, and shows which sites they cite.</p>']],
    faq: [
      ['How long does holiday let SEO take to work?', 'Technical fixes and a Google Business Profile can show in weeks. Rankings for competitive searches and mentions in AI answers usually take two to six months of steady work: good pages, reviews and links from local sites.'],
      ['Should my holiday let have its own website if it is on Airbnb?', 'Yes, if you want to be found directly. AI assistants and Google can cite and link your own site, and a guest who books there pays no platform fee. Keep your listings and link them to your site so search engines know they are the same home.'],
    ],
  },
  '/guides': {
    title: 'Free guides for UK holiday let hosts · Bookingbooster',
    h1: 'Free guides for UK holiday let hosts',
    description: 'Free PDF guides on direct bookings, platform fees, guest marketing and getting found in AI search, for UK holiday let and short-term let owners.',
    lead: 'Practical guides from Bookingbooster for owners of UK holiday lets who want more direct bookings and fewer platform fees. Free to download, no sign-up needed.',
    sections: [['The guides', '<ul>' + GUIDES.map(([f, t, d]) => '<li><a href="/guides/' + f + '"><strong>' + esc(t) + '</strong></a> (PDF). ' + esc(d) + '</li>').join('') + '</ul>']],
    faq: [],
  },
};

function jsonLd(base, path, pg) {
  const url = base + path, home = base + '/';
  const graph = [
    { '@type': 'WebPage', '@id': url + '#page', url, name: pg.h1, description: pg.description, inLanguage: 'en-GB', isPartOf: { '@id': home + '#site' }, publisher: { '@id': home + '#org' }, about: { '@id': home + '#service' } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Bookingbooster', item: home }, { '@type': 'ListItem', position: 2, name: pg.h1, item: url }] },
    { '@type': 'Organization', '@id': home + '#org', name: 'Bookingbooster', url: home, logo: base + '/assets/icons/icon-512.png', sameAs: mkt.SOCIAL.map(x => x[1]) },
  ];
  if (pg.faq.length) graph.push({ '@type': 'FAQPage', '@id': url + '#faq', mainEntity: pg.faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
  if (path === '/seo-for-holiday-lets') graph.push({ '@type': 'DefinedTermSet', '@id': url + '#terms', name: 'Search optimisation for holiday lets', hasDefinedTerm: TERMS.map(([n, d]) => ({ '@type': 'DefinedTerm', name: n, description: d, url: url + '#' + n.toLowerCase().replace(/[^a-z]+/g, '-').replace(/^-|-$/g, '') })) });
  if (path === '/holiday-let-seo-checklist') graph.push({ '@type': 'ItemList', '@id': url + '#steps', name: pg.h1, itemListOrder: 'https://schema.org/ItemListOrderAscending', itemListElement: CHECKLIST.map(([h, why], i) => ({ '@type': 'ListItem', position: i + 1, name: h, description: why })) });
  graph[0].speakable = { '@type': 'SpeakableSpecification', cssSelector: ['article > p:first-of-type'] };
  if (path === '/guides') graph.push({ '@type': 'ItemList', name: pg.h1, itemListElement: GUIDES.map(([f, t], i) => ({ '@type': 'ListItem', position: i + 1, name: t, url: base + '/guides/' + f })) });
  return { '@context': 'https://schema.org', '@graph': graph };
}

const NAV = [['/', 'Home and pricing'], ['/direct-booking-website', 'Direct booking websites'], ['/ai-search-for-holiday-lets', 'Getting found in AI search'], ['/seo-for-holiday-lets', 'SEO, AEO and GEO explained'], ['/holiday-let-seo-checklist', 'SEO checklist'], ['/guides', 'Free guides']];

function render(base, path) {
  const pg = PAGES[path]; if (!pg) return null;
  const head = '<meta name="description" content="' + esc(pg.description) + '"><link rel="canonical" href="' + esc(base + path) + '">' +
    '<meta property="og:type" content="article"><meta property="og:site_name" content="Bookingbooster"><meta property="og:title" content="' + esc(pg.h1) + '"><meta property="og:description" content="' + esc(pg.description) + '"><meta property="og:url" content="' + esc(base + path) + '"><meta property="og:locale" content="en_GB"><meta property="og:image" content="' + esc(base + '/assets/icons/og.png?v=2') + '"><meta property="og:image:type" content="image/png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Bookingbooster: fill your calendar without the 15% fee">' +
    '<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="' + esc(pg.h1) + '"><meta name="twitter:description" content="' + esc(pg.description) + '"><meta name="twitter:image" content="' + esc(base + '/assets/icons/og.png?v=2') + '">' +
    '<link rel="alternate" type="text/plain" title="llms.txt" href="' + esc(base + '/llms.txt') + '">' +
    '<script type="application/ld+json">' + JSON.stringify(jsonLd(base, path, pg)).replace(/</g, '\\u003c') + '</script>';
  const body = '<article><h1>' + esc(pg.h1) + '</h1><p>' + esc(pg.lead) + '</p>' +
    pg.sections.map(([h, html]) => '<h2>' + esc(h) + '</h2>' + html).join('') +
    (pg.faq.length ? '<h2>Questions</h2>' + pg.faq.map(([q, a]) => '<h3>' + esc(q) + '</h3><p>' + esc(a) + '</p>').join('') : '') +
    '<p><a href="/start"><strong>Get my booking site</strong></a> · <a href="/demo">See the live demo</a></p>' +
    '<nav aria-label="More from Bookingbooster"><p>' + NAV.filter(([u]) => u !== path).map(([u, t]) => '<a href="' + u + '">' + esc(t) + '</a>').join(' · ') + '</p></nav></article>';
  return { title: pg.title, head, body };
}

// The full text of every answer page, for /llms-full.txt.
function fullText(base) {
  const strip = h => String(h).replace(/<\/(p|li|dt|dd|tr|h\d)>/g, '\n').replace(/<br>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();
  return Object.entries(PAGES).map(([path, pg]) => '# ' + pg.h1 + '\n\nSource: ' + base + path + '\n\n' + pg.lead + '\n\n' + pg.sections.map(([h, html]) => '## ' + h + '\n\n' + strip(html)).join('\n\n') +
    (pg.faq.length ? '\n\n## Questions\n\n' + pg.faq.map(([q, a]) => '### ' + q + '\n\n' + a).join('\n\n') : '')).join('\n\n---\n\n') + '\n';
}
// For llms.txt and the sitemap.
const list = () => Object.entries(PAGES).map(([path, pg]) => ({ path, title: pg.h1, description: pg.description }));

module.exports = { PAGES, GUIDES, TERMS, CHECKLIST, render, list, fullText };
