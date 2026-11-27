/* Bookingbooster: search health rules for host sites, shared by the browser and the server engine.
   BB.seo.audit(p) scores one home across every kind of search work that applies to a holiday let:
   on-page, content, technical, local, image and video, SXO, AEO, GEO, LLMO (brand and off-page) and Google AI Overviews.
   Everything here is rule-based: it reads the home's own facts and the results of real AI checks, and makes no calls.
   BB.seo.faqIdeas, BB.seo.keywords and BB.seo.draft give rule-based drafts the host edits; the server can replace a
   draft with one written by Claude (see server/seo-tools.js). */
(function () {
  const BB = window.BB; if (!BB) return;
  const S = () => BB.store.get();
  const money = n => '£' + Number(n || 0).toLocaleString('en-GB');
  const words = t => String(t || '').trim().split(/\s+/).filter(Boolean).length;
  const town = p => String(p.area || '').split(',')[0].trim();
  const county = p => String(p.area || '').split(',').slice(1).join(',').trim() || town(p);
  const kind = p => ({ cabin: 'cabin', lake: 'cottage', city: 'apartment' }[p.theme] || 'holiday let');
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
  const clip = (t, n) => String(t || '').trim().slice(0, n);

  // The SEO fields a host can edit, kept together on the home so they never collide with booking fields.
  const SEO_KEYS = { summary: 600, areaIntro: 4000, videoUrl: 300, sameAs: 12, keywords: 20, gbp: 20, metaTitle: 70, metaDescription: 170, ownSite: 120 };
  const seoOf = p => Object.assign({ summary: '', areaIntro: '', videoUrl: '', sameAs: [], keywords: [], gbp: {}, metaTitle: '', metaDescription: '' }, p.seo || {});

  // Where a link points, so we can tell listings, social profiles, maps and local press apart.
  function linkKind(u) {
    const h = String(u || '').toLowerCase();
    if (/airbnb\.|vrbo\.|booking\.com|tripadvisor\.|sykescottages|cottages\.com|holidaycottages|canopyandstars|hipcamp\.|expedia\.|holidaylettings|independentcottages|coolstays|uniquehomestays|plumguide/.test(h)) return 'listing';
    if (/instagram\.com|facebook\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.|x\.com|twitter\.com|threads\.net/.test(h)) return 'social';
    if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|g\.page|business\.google|goo\.gl\/maps/.test(h)) return 'maps';
    return 'local';
  }
  const LINK_LABEL = { listing: 'Listing', social: 'Social profile', maps: 'Google Maps', local: 'Local site or press' };

  function faqList(pid) { return ((S().website.faqs || {})[pid] || []).map(x => { const i = x.indexOf('|'); return i < 0 ? [x, ''] : [x.slice(0, i), x.slice(i + 1)]; }); }
  function siteText(p) {
    const o = seoOf(p);
    return [p.name, p.area, p.headline, p.sub, p.about, p.parking, p.entry, o.summary, o.areaIntro].concat(p.amenities || [], p.rules || [], p.guide || [], faqList(p.id).map(f => f[0] + ' ' + f[1])).join(' \n').toLowerCase();
  }
  function reviewsShown(p) {
    const s = S();
    return s.bookings.filter(b => b.propertyId === p.id && b.review && b.review.text && (s.live ? b.review.public : b.review.stars >= 4)).length;
  }
  // The same title and description the server writes into the page (server/seo.js titleOf / descOf), unless the host set their own.
  function titleOf(p) { const o = seoOf(p); if (o.metaTitle) return o.metaTitle; const k = kind(p); return p.name + ' · ' + k[0].toUpperCase() + k.slice(1) + ' in ' + town(p) + ' · Book direct'; }
  function descOf(p) { const o = seoOf(p); if (o.metaDescription) return o.metaDescription; return (p.headline ? p.headline + ' ' : '') + (p.sub ? String(p.sub).replace(/ · /g, ', ') + '. ' : '') + 'Book direct from ' + money(p.nightly) + ' a night with no platform fees.'; }

  // Topics travellers ask about, and the words on a page that answer them.
  const TOPICS = [
    ['dogs', /\bdog|\bpet/, /\bdog|\bpet/], ['hot tub', /hot tub|jacuzzi|\bspa\b/, /hot tub|jacuzzi|\bspa\b/], ['families', /family|kids|child|children/, /family|child|cot|high chair|kids/],
    ['parking', /parking|car park/, /parking|park\b|driveway|space/], ['Wi-Fi and remote work', /wi-?fi|remote work|work from/, /wi-?fi|broadband|mbps|desk/],
    ['the beach', /beach|seaside|coast|\bsea\b/, /beach|coast|\bsea\b|harbour/], ['walks', /walk|hike|hiking|trail|fell/, /walk|footpath|trail|fell|hike/],
    ['couples', /romantic|couple|honeymoon|anniversary/, /couple|romantic|for two|sleeps 2/], ['EV charging', /\bev\b|electric car|charg/, /\bev\b|charg/],
    ['accessibility', /accessible|wheelchair|step-free|mobility/, /accessible|wheelchair|step-free|ground floor/], ['a wood burner', /log burner|wood burner|fireplace|open fire/, /log burner|wood burner|fireplace|open fire/],
  ];

  /* ---------- the audit ---------- */
  const CATS = [
    ['onpage', 'On-page SEO', 'Titles, descriptions, headings and the words on each page.'],
    ['content', 'Content SEO', 'Enough useful, original writing about the home and the area.'],
    ['technical', 'Technical SEO', 'Crawling, indexing, sitemaps, schema and speed.'],
    ['local', 'Local SEO', 'Maps, Google Business Profile, address and reviews.'],
    ['media', 'Image and video SEO', 'Photos with descriptions, and a walkthrough video.'],
    ['sxo', 'Search experience (SXO)', 'Visitors who land can see the price, trust you and book.'],
    ['aeo', 'Answer engines (AEO)', 'Clear questions and answers that search and voice can quote.'],
    ['geo', 'Generative engines (GEO)', 'Being named and linked in ChatGPT, Gemini, Perplexity and Claude.'],
    ['llmo', 'Brand and off-page (LLMO)', 'The same home, named the same way, across the web.'],
    ['aio', 'Google AI Overviews (AIO)', 'Showing in the AI summary at the top of Google.'],
  ];
  function audit(p) {
    const s = S(); if (!p) return null;
    const o = seoOf(p), faqs = faqList(p.id), text = siteText(p);
    const others = s.properties.filter(x => x.id !== p.id);
    const qs = (s.ai.questions || []).filter(q => q.propertyId === p.id);
    const conn = id => BB.q.connected(id);
    const photos = p.photos || [], links = (o.sameAs || []).filter(Boolean);
    const kinds = links.map(linkKind); const has = k => kinds.includes(k);
    const checks = [];
    // status: 'ok' | 'warn' | 'fail' | 'auto' (handled by Bookingbooster). act: what the fix button does.
    const add = (cat, id, label, status, weight, detail, fix, act) => checks.push({ cat, id, label, status, weight, detail, fix: status === 'ok' || status === 'auto' ? '' : fix, act: status === 'ok' || status === 'auto' ? null : act });
    const T = titleOf(p), Dn = descOf(p);

    // On-page
    add('onpage', 'area', 'Town and county are set', town(p) && county(p) !== town(p) ? 'ok' : town(p) ? 'warn' : 'fail', 3, p.area ? 'Area: ' + p.area : 'No area set', 'Add the town and county, like "Troutbeck, Cumbria". Every title, heading and schema uses it.', { kind: 'nav', view: 'website' });
    add('onpage', 'title', 'Google title is a good length', T.length >= 30 && T.length <= 62 ? 'ok' : 'warn', 2, T.length + ' characters: "' + T + '"', T.length > 62 ? 'Google cuts titles after about 62 characters. Write a shorter one.' : 'Make the title say what and where, like "Hot tub cabin in Troutbeck".', { kind: 'meta' });
    add('onpage', 'desc', 'Description is a good length', Dn.length >= 70 && Dn.length <= 160 ? 'ok' : 'warn', 2, Dn.length + ' characters', Dn.length > 160 ? 'Google shows about 160 characters. Shorten it so the price and "book direct" are not cut off.' : 'Write a description of 70 to 160 characters with the price and what makes the home special.', { kind: 'meta' });
    add('onpage', 'headline', 'Headline is short and specific', p.headline && words(p.headline) <= 12 ? 'ok' : p.headline ? 'warn' : 'fail', 2, p.headline ? words(p.headline) + ' words' : 'No headline', 'Use one line of up to 12 words that names the best thing about the home.', { kind: 'nav', view: 'website' });
    const kw = (o.keywords || []).length ? o.keywords : [kind(p) + ' ' + town(p).toLowerCase()];
    const kwHit = kw.filter(k => String(k).toLowerCase().split(/\s+/).every(w => w.length < 3 || text.includes(w.toLowerCase())));
    add('onpage', 'keywords', 'Target searches appear on the page', kwHit.length === kw.length ? 'ok' : kwHit.length ? 'warn' : 'fail', 3, kwHit.length + ' of ' + kw.length + ' target searches are covered', 'Pick target searches below, then use their words in your headline, about text or FAQs.', { kind: 'scroll', to: 'keywords' });
    add('onpage', 'links', 'Every page links to booking', 'auto', 1, 'Each page has a "Check dates and book direct" link.', '', null);

    // Content
    const aw = words(p.about);
    add('content', 'about', 'About text is long enough', aw >= 80 ? 'ok' : aw >= 40 ? 'warn' : 'fail', 4, aw + ' words', 'Write 80 to 200 words: who it suits, what is inside, what is nearby, and one thing guests love.', { kind: 'nav', view: 'website' });
    const ai = words(o.areaIntro);
    add('content', 'areaIntro', 'Local area guide is written', ai >= 120 ? 'ok' : ai >= 40 ? 'warn' : 'fail', 4, ai ? ai + ' words' : 'Not written yet', 'Write a short guide to the area: walks, pubs, beaches and days out. Searches like "things to do near ' + (town(p) || 'here') + '" find it.', { kind: 'write', what: 'area' });
    const gl = (p.guide || []).length;
    add('content', 'guide', 'Nearby places are listed', gl >= 4 ? 'ok' : gl ? 'warn' : 'fail', 3, plural(gl, 'place'), 'List at least 4 places nearby, one per line: place | how far | your tip.', { kind: 'nav', view: 'website' });
    const am = (p.amenities || []).length;
    add('content', 'amenities', 'Amenities are complete', am >= 8 ? 'ok' : am >= 5 ? 'warn' : 'fail', 2, plural(am, 'amenity'), 'List at least 8 things the home offers. Searches and AI answers match on them, like "hot tub" or "EV charger".', { kind: 'nav', view: 'website' });
    const sim = (a, b) => { const A = new Set(String(a || '').toLowerCase().match(/[a-z]{4,}/g) || []), B = new Set(String(b || '').toLowerCase().match(/[a-z]{4,}/g) || []); if (!A.size || !B.size) return 0; let n = 0; A.forEach(w => { if (B.has(w)) n++; }); return n / Math.min(A.size, B.size); };
    const dup = others.find(x => sim(x.about, p.about) > 0.7);
    add('content', 'unique', 'Writing is original to this home', !p.about ? 'fail' : dup ? 'warn' : 'ok', 2, dup ? 'Very close to the text for ' + dup.name : 'No copies found across your homes', 'Rewrite the about text so it does not repeat another home. Search engines show only one of two similar pages.', { kind: 'nav', view: 'website' });

    // Technical
    add('technical', 'crawl', 'Pages readable without JavaScript', 'auto', 2, 'Every page is sent as plain HTML with the full text, so any crawler can read it.', '', null);
    add('technical', 'sitemap', 'Sitemap with images', 'auto', 2, 'sitemap.xml lists the page, its photos and llms.txt, and robots.txt points to it.', '', null);
    add('technical', 'schema', 'Structured data (schema.org)', 'auto', 3, 'VacationRental, LodgingBusiness, FAQPage, BreadcrumbList, reviews, nearby places and offers are added for you.', '', null);
    add('technical', 'canonical', 'Canonical address, HTTPS and mobile', 'auto', 1, 'One canonical address per home, served over HTTPS, built for phones first.', '', null);
    add('technical', 'published', 'Site is published', p.published === false ? 'fail' : 'ok', 3, p.published === false ? 'Hidden from search' : 'Live', 'Publish the site so search engines can see it.', { kind: 'nav', view: 'website' });
    add('technical', 'geo', 'Map pin (latitude and longitude)', p.lat && p.lng ? 'ok' : 'warn', 2, p.lat && p.lng ? p.lat + ', ' + p.lng : 'Not set', 'Add the map pin so maps and AI assistants place the home exactly. Paste it from Google Maps.', { kind: 'scroll', to: 'listed' });
    const gs = ((p.indexing || {}).google || {}).state;
    add('technical', 'gsc', 'Submitted to Google Search Console', conn('gsc') || gs === 'submitted' ? 'ok' : 'warn', 2, gs === 'submitted' ? 'Sitemap submitted for you' : conn('gsc') ? 'Rankings tracked' : gs === 'error' ? 'Google could not take it yet' : 'Not submitted yet', gs === 'error' ? 'We retry every day. Check that the site is published and loads.' : 'Press Submit now under Indexing. We verify the site and send the sitemap for you, no Google login needed.', { kind: 'scroll', to: 'index' });

    // Local
    add('local', 'address', 'Full address with postcode', POSTCODE.test(p.address || '') ? 'ok' : p.address ? 'warn' : 'fail', 3, p.address ? (POSTCODE.test(p.address) ? 'Postcode found' : 'No postcode') : 'No address', 'Add the full address with the postcode. Guests get it after booking; it also lets us place your map pin and keep your details the same everywhere.', { kind: 'nav', view: 'website' });
    const gbpDone = Object.values(o.gbp || {}).filter(Boolean).length;
    add('local', 'gbp', 'Google Business Profile set up', conn('google') || gbpDone >= GBP.length - 1 ? 'ok' : gbpDone >= 3 ? 'warn' : 'fail', 4, conn('google') ? 'Connected' : gbpDone + ' of ' + GBP.length + ' steps done', 'Follow the Google Business Profile checklist below. It decides whether you show in the map pack.', { kind: 'scroll', to: 'gbp' });
    add('local', 'rating', 'Strong guest rating', p.rating >= 4.7 && p.reviews >= 10 ? 'ok' : p.rating >= 4.3 ? 'warn' : 'fail', 2, p.reviews ? p.rating + ' from ' + plural(p.reviews, 'review') : 'No reviews yet', 'Ask every guest for a review. The post-stay email does it for you.', { kind: 'nav', view: 'automations' });
    add('local', 'maps', 'Google Maps link added', has('maps') ? 'ok' : 'warn', 2, has('maps') ? 'Linked' : 'Not linked', 'Paste the Google Maps link for your Business Profile under "Where this home is listed".', { kind: 'scroll', to: 'listed' });
    add('local', 'citations', 'Listed on local and travel sites', links.filter(u => ['listing', 'local'].includes(linkKind(u))).length >= 2 ? 'ok' : links.length ? 'warn' : 'fail', 2, plural(links.filter(u => ['listing', 'local'].includes(linkKind(u))).length, 'listing'), 'Add your other listings and the local tourism site. The same name, town and phone everywhere is a strong local signal.', { kind: 'scroll', to: 'listed' });

    // Image and video
    add('media', 'photos', 'Enough photos', photos.length >= 8 ? 'ok' : photos.length >= 4 ? 'warn' : 'fail', 3, plural(photos.length, 'photo'), 'Add at least 8 photos: outside, every room, the view and one nearby.', { kind: 'nav', view: 'website' });
    const capped = photos.filter(x => String(x.cap || '').trim().length >= 5).length;
    add('media', 'alt', 'Every photo has a description', photos.length && capped === photos.length ? 'ok' : capped ? 'warn' : 'fail', 2, capped + ' of ' + photos.length + ' described', 'Write a short caption on each photo, like "Hot tub on the deck at dusk". It becomes the alt text Google Images reads.', { kind: 'nav', view: 'website' });
    add('media', 'video', 'Walkthrough video linked', o.videoUrl ? 'ok' : 'warn', 1, o.videoUrl ? 'Linked' : 'No video', 'Film a 60-second walkthrough on your phone, upload it to YouTube and paste the link. It adds video schema and a video result.', { kind: 'scroll', to: 'listed' });

    // SXO
    add('sxo', 'instant', 'Guests can book and pay instantly', conn('stripe') ? 'ok' : 'warn', 3, conn('stripe') ? 'Card, Apple Pay and Google Pay' : 'Booking requests only', 'Connect Stripe so visitors who land can book on the spot instead of waiting for you.', { kind: 'nav', view: 'connections' });
    add('sxo', 'price', 'Price shown up front', p.nightly > 0 ? 'ok' : 'fail', 2, p.nightly ? 'From ' + money(p.nightly) + ' a night' : 'No nightly rate', 'Set a nightly rate so search visitors see the price before they leave.', { kind: 'nav', view: 'website' });
    add('sxo', 'proof', 'Reviews shown on the page', reviewsShown(p) >= 3 ? 'ok' : reviewsShown(p) ? 'warn' : 'fail', 2, plural(reviewsShown(p), 'review') + ' on the site', 'Reviews from direct guests appear on the page by themselves once they share them. Ask past guests for one.', { kind: 'nav', view: 'reviews' });
    add('sxo', 'host', 'A personal line from you', p.hostNote ? 'ok' : 'warn', 1, p.hostNote ? 'Shown next to your name' : 'Not written', 'Add one friendly line from you. Visitors trust a real host more than a listing.', { kind: 'nav', view: 'website' });
    add('sxo', 'minstay', 'Short stays allowed', p.minNights <= 3 ? 'ok' : 'warn', 1, 'Minimum ' + plural(p.minNights || 1, 'night'), 'A minimum of 4 or more nights turns away most weekend searches. Consider 2 or 3.', { kind: 'nav', view: 'website' });

    // AEO
    add('aeo', 'faqs', 'Questions answered in your words', faqs.length >= 6 ? 'ok' : faqs.length >= 3 ? 'warn' : 'fail', 4, plural(faqs.length, 'FAQ') + ' of your own (plus 6 we add)', 'Add the questions guests really ask. Pick from the suggestions below; each answer is drafted from your facts.', { kind: 'scroll', to: 'faqs' });
    const crisp = faqs.filter(f => f[1].length >= 30 && f[1].length <= 320).length;
    add('aeo', 'crisp', 'Answers are short and direct', !faqs.length ? 'warn' : crisp === faqs.length ? 'ok' : 'warn', 2, crisp + ' of ' + faqs.length + ' answers are 1 to 3 sentences', 'Start each answer with the answer ("Yes, dogs are welcome."), then one detail. Answer boxes quote the first sentence.', { kind: 'nav', view: 'website' });
    const sw = words(o.summary);
    add('aeo', 'summary', 'Answer-first summary', sw >= 25 && sw <= 80 ? 'ok' : sw ? 'warn' : 'fail', 4, sw ? sw + ' words' : 'Not written yet', 'Write 40 to 60 words that say what the home is, where, who it sleeps, the price and the best feature. It goes at the top of the page and in llms.txt.', { kind: 'write', what: 'summary' });
    const asked = new Set(); qs.forEach(q => TOPICS.forEach(t => { if (t[1].test(String(q.q).toLowerCase())) asked.add(t[0]); }));
    const gaps = TOPICS.filter(t => asked.has(t[0]) && !t[2].test(text)).map(t => t[0]);
    add('aeo', 'coverage', 'Tracked questions are answered on the site', !qs.length ? 'warn' : gaps.length ? 'fail' : 'ok', 3, !qs.length ? 'No questions tracked yet' : gaps.length ? 'Nothing on the site about ' + gaps.join(', ') : 'Every topic travellers ask about is covered', gaps.length ? 'Add an FAQ or amenity about ' + gaps.join(', ') + '. AI assistants cannot recommend you for what your site does not say.' : 'Track the questions travellers ask in AI visibility.', gaps.length ? { kind: 'scroll', to: 'faqs' } : { kind: 'scroll', to: 'keywords' });
    add('aeo', 'faqschema', 'FAQ schema and speakable summary', 'auto', 2, 'FAQPage schema and a speakable summary are added for every question.', '', null);

    // GEO
    add('geo', 'llms', 'llms.txt for AI assistants', 'auto', 2, 'A plain-text fact sheet at /llms.txt with prices, rules, FAQs and nearby places.', '', null);
    add('geo', 'bots', 'AI crawlers are welcome', 'auto', 2, 'robots.txt lets GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and others read the site.', '', null);
    const factsOk = [p.maxGuests, p.bedrooms, p.baths, p.nightly, p.checkinTime, p.checkoutTime, p.area].every(Boolean);
    add('geo', 'facts', 'Key facts are complete', factsOk ? 'ok' : 'fail', 3, factsOk ? 'Sleeps, rooms, price, times and area are set' : 'Some facts are missing', 'Fill in sleeps, bedrooms, bathrooms, price, check-in and checkout times and the area. AI answers quote facts, not adjectives.', { kind: 'nav', view: 'website' });
    add('geo', 'tracked', 'Traveller questions tracked', qs.length >= 5 ? 'ok' : qs.length >= 3 ? 'warn' : 'fail', 2, plural(qs.length, 'question'), 'Track at least 5 questions travellers ask. Pick from the ideas below.', { kind: 'scroll', to: 'keywords' });
    const named = qs.filter(q => Object.values(q.engines || {}).some(Boolean)).length;
    add('geo', 'named', 'Named in AI answers', !s.ai.checkedAt ? 'warn' : named >= Math.ceil(qs.length / 2) ? 'ok' : named ? 'warn' : 'fail', 4, s.ai.checkedAt ? 'Named in ' + named + ' of ' + qs.length + ' questions' : 'Not checked yet', s.ai.checkedAt ? 'Close the gaps above, add your listings and press links, then re-check. Answers usually move within 2 to 6 weeks.' : 'Run an AI check to see where you stand.', s.ai.checkedAt ? { kind: 'nav', view: 'ai' } : { kind: 'aicheck' });
    const cited = qs.filter(q => Object.values(q.cited || {}).some(Boolean)).length;
    add('geo', 'cited', 'Your site is linked, not just named', !s.ai.live ? 'warn' : cited ? 'ok' : 'fail', 2, s.ai.live ? 'Linked in ' + cited + ' of ' + qs.length + ' questions' : 'Shown after a live AI check', 'AI assistants link to pages that state facts plainly. Write the summary and FAQs, and add your listings so they can confirm the home is real.', { kind: 'nav', view: 'ai' });

    // LLMO and off-page
    add('llmo', 'profiles', 'Profiles that confirm the home is real', links.length >= 3 ? 'ok' : links.length ? 'warn' : 'fail', 3, plural(links.length, 'link'), 'Add your listings, Instagram or Facebook and Google Maps. They become sameAs links that tie every mention to this home.', { kind: 'scroll', to: 'listed' });
    add('llmo', 'social', 'A social profile', has('social') ? 'ok' : 'warn', 1, has('social') ? 'Linked' : 'None linked', 'Link one social profile where the home is named exactly as on your site.', { kind: 'scroll', to: 'listed' });
    add('llmo', 'press', 'Mentions on local sites or press', has('local') ? 'ok' : 'warn', 2, has('local') ? 'Linked' : 'None linked', 'Get listed on your local tourism site, a local blog or a "best stays" round-up, then add the link. Models learn brands from mentions like these.', { kind: 'scroll', to: 'listed' });
    add('llmo', 'name', 'One name used everywhere', p.name && p.short && p.name.toLowerCase().includes(String(p.short).toLowerCase()) ? 'ok' : 'warn', 1, '"' + p.name + '"', 'Use exactly "' + p.name + '" on every listing and profile.', null);
    add('llmo', 'volume', 'Plenty of reviews across the web', (p.reviews || 0) >= 25 ? 'ok' : (p.reviews || 0) >= 10 ? 'warn' : 'fail', 2, plural(p.reviews || 0, 'review'), 'More reviews mean more text about you for models to learn from. Ask every guest.', { kind: 'nav', view: 'automations' });

    // AIO
    const gq = qs.filter(q => q.engines && q.engines.google).length;
    add('aio', 'overview', 'Shown in Google AI answers', !s.ai.checkedAt ? 'warn' : gq ? 'ok' : 'fail', 3, s.ai.checkedAt ? 'Shown for ' + gq + ' of ' + qs.length + ' questions' : 'Not checked yet', 'AI Overviews pull from pages that already rank and answer the question in the first lines. Write the summary and area guide, and connect Search Console.', s.ai.checkedAt ? { kind: 'write', what: 'summary' } : { kind: 'aicheck' });
    add('aio', 'lead', 'Answer in the first lines', sw >= 25 ? 'ok' : 'fail', 2, sw >= 25 ? 'The summary leads the page' : 'The page opens with a headline only', 'Write the answer-first summary. It is placed straight under the main heading, where AI Overviews look.', { kind: 'write', what: 'summary' });
    add('aio', 'nearby', 'Distances to nearby places', (p.guide || []).filter(g => /\d/.test(g)).length >= 3 ? 'ok' : 'warn', 1, (p.guide || []).filter(g => /\d/.test(g)).length + ' places with a distance', 'Give how far each place is, like "Windermere | 10 minutes drive". Questions like "near Windermere" match on it.', { kind: 'nav', view: 'website' });

    const val = c => c.status === 'ok' || c.status === 'auto' ? 1 : c.status === 'warn' ? 0.5 : 0;
    const cats = CATS.map(([id, label, about]) => { const list = checks.filter(c => c.cat === id); const tot = list.reduce((a, c) => a + c.weight, 0); const got = list.reduce((a, c) => a + c.weight * val(c), 0); return { id, label, about, score: tot ? Math.round(100 * got / tot) : 100, checks: list, todo: list.filter(c => c.fix).length }; });
    const tot = checks.reduce((a, c) => a + c.weight, 0), got = checks.reduce((a, c) => a + c.weight * val(c), 0);
    const score = Math.round(100 * got / tot);
    const fixes = checks.filter(c => c.fix).map(c => Object.assign({ gain: Math.max(1, Math.round(100 * c.weight * (1 - val(c)) / tot)) }, c)).sort((a, b) => b.gain - a.gain || (a.status === 'fail' ? -1 : 1));
    return { score, grade: score >= 85 ? 'Excellent' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'Weak', cats, checks, fixes, auto: checks.filter(c => c.status === 'auto').length };
  }

  /* ---------- Google Business Profile checklist (guidance; the host ticks each step) ---------- */
  const GBP = [
    ['claim', 'Claim and verify the profile', 'At business.google.com, add the home as a business. Google verifies by video, post or phone.'],
    ['category', 'Pick the right category', 'Use "Holiday home", "Cottage", "Chalet" or "Holiday apartment rental", whichever fits. The category matters more than anything else.'],
    ['website', 'Link your booking site', 'Set the website to your own booking site, not a platform listing, so the Book button goes direct.'],
    ['photos', 'Add 10 or more photos', 'Outside, every room, the view. Add new ones each season.'],
    ['attributes', 'Fill in amenities and attributes', 'Hot tub, Wi-Fi, pets, parking, accessibility. Google matches searches on them.'],
    ['reviews', 'Ask guests for Google reviews', 'Paste your review link into the post-stay automation. Reply to every review within a week.'],
    ['posts', 'Post an update each month', 'A seasonal photo, an offer or local news keeps the profile active.'],
    ['nap', 'Same name, address and phone as your site', 'Copy them from your site exactly. Small differences split your local ranking.'],
  ];

  /* ---------- rule-based drafts ---------- */
  function faqIdeas(p) {
    const have = faqList(p.id).map(f => f[0].toLowerCase()); const am = (p.amenities || []).join(' ').toLowerCase(); const out = [];
    const add = (q, a, needs) => { if (!have.some(h => h.includes(q.toLowerCase().slice(0, 18)))) out.push({ q, a, needs: !!needs }); };
    const g = (p.guide || []).map(x => x.split('|').map(y => y.trim()));
    if (p.parking) add('Is there parking?', 'Yes. ' + String(p.parking).replace(/\.?$/, '.') + ' Parking is free for guests.');
    if (/wi-?fi|broadband|mbps/.test(am)) add('Is the Wi-Fi good enough to work?', 'Yes. ' + ((p.amenities || []).find(a => /wi-?fi|mbps/i.test(a)) || 'Fast Wi-Fi') + ' is included, so video calls and streaming work well.');
    add(p.petsAllowed ? 'Can I bring my dog?' : 'Are dogs allowed?', p.petsAllowed ? 'Yes. Dogs are welcome' + (p.petFee ? ' for a ' + money(p.petFee) + ' fee per stay' : '') + '. Let us know when you book.' : 'Sorry, no. ' + p.name + ' is pet-free, which suits guests with allergies.');
    if (/hot tub/.test(am)) add('Is the hot tub private?', 'Yes. The hot tub is private to your stay and is cleaned and refilled between guests.');
    if (/wood burner|log burner|fire/.test(am)) add('Are logs provided for the wood burner?', 'Yes. A starter basket of logs and kindling is waiting for you.', true);
    add('Is it suitable for families with a baby?', p.maxGuests >= 3 ? 'Yes. ' + p.name + ' sleeps ' + p.maxGuests + '. Ask us for a travel cot and high chair when you book.' : '', p.maxGuests >= 3);
    if (g[0]) add('How far is ' + g[0][0] + '?', g[0][0] + ' is ' + (g[0][1] || 'nearby') + ' from ' + p.name + '.' + (g[0][2] ? ' ' + g[0][2].replace(/\.?$/, '.') : ''));
    if (g[1]) add('What is there to do nearby?', 'Within a short drive: ' + g.slice(0, 4).map(x => x[0] + (x[1] ? ' (' + x[1] + ')' : '')).join(', ') + '. Our full area guide is on this page.');
    add('What is the nearest pub?', '', true);
    add('What is your cancellation policy?', '', true);
    add('Is there an EV charger?', /\bev\b|charg/.test(am) ? 'Yes. There is an EV charger on site.' : '', !/\bev\b|charg/.test(am));
    add('Is ' + p.name + ' accessible?', '', true);
    return out.slice(0, 10);
  }
  // Searches worth targeting: what travellers type into Google and ask AI assistants, built from the home's facts.
  function keywords(p) {
    const t = town(p), c = county(p), k = kind(p), am = (p.amenities || []).join(' ').toLowerCase(), txt = siteText(p); if (!t) return [];
    const g = (p.guide || []).map(x => x.split('|')[0].trim()).filter(Boolean);
    const L = [];
    const add = (q, intent, use) => { const low = q.toLowerCase(); if (!L.some(x => x.q === low)) L.push({ q: low, intent, use, onSite: low.split(/\s+/).filter(w => w.length > 3).every(w => txt.includes(w.replace(/s$/, ''))) }); };
    add(k + ' in ' + t, 'Book', 'Title and headline');
    add(k + 's in ' + c, 'Book', 'About text');
    add('self catering ' + t, 'Book', 'About text');
    if (/hot tub/.test(am)) add(k + ' with hot tub ' + c, 'Book', 'Headline or summary');
    if (p.petsAllowed) add('dog friendly ' + k + ' ' + t, 'Book', 'FAQ and summary');
    if (p.maxGuests <= 2) add('romantic ' + k + ' ' + c, 'Book', 'Summary');
    if (p.maxGuests >= 5) add('large ' + k + ' ' + c + ' sleeps ' + p.maxGuests, 'Book', 'About text');
    else if (p.maxGuests >= 3) add('family ' + k + ' ' + c, 'Book', 'FAQ');
    if (/wi-?fi|mbps/.test(am)) add(k + ' with fast wifi ' + c, 'Book', 'Amenities and FAQ');
    if (/wood burner|log burner/.test(am)) add('cosy ' + k + ' with log burner ' + c, 'Book', 'Summary');
    g.slice(0, 2).forEach(x => add(k + ' near ' + x, 'Book', 'Area guide'));
    add('last minute ' + k + ' ' + c, 'Book', 'Campaigns and gap nights');
    add('things to do in ' + t, 'Plan', 'Area guide');
    add('best walks near ' + t, 'Plan', 'Area guide');
    add('where to stay in ' + t, 'Compare', 'Summary and FAQs');
    add('best place to stay in ' + c + ' for a weekend', 'Compare', 'Summary');
    add(t + ' holiday let book direct', 'Compare', 'Title');
    return L.slice(0, 16);
  }
  // Rule-based first drafts. The server can write better ones with Claude when an API key is set.
  function draft(p, what) {
    const t = town(p), k = kind(p), am = (p.amenities || []).slice(0, 3).map(a => { a = String(a).split(',')[0].trim(); return /^[A-Z][a-z]/.test(a) ? a[0].toLowerCase() + a.slice(1) : a; });
    if (what === 'summary') return p.name + ' is a ' + p.bedrooms + '-bedroom ' + k + ' in ' + (p.area || t) + ' that sleeps ' + p.maxGuests + '. ' + (am.length ? 'Highlights: ' + (am.length > 1 ? am.slice(0, -1).join(', ') + ' and ' + am[am.length - 1] : am[0]) + '. ' : '') + (p.petsAllowed ? 'Dogs are welcome. ' : '') + 'Book direct from ' + money(p.nightly) + ' a night, with check-in from ' + p.checkinTime + ' and no platform fees.';
    if (what === 'area') { const g = (p.guide || []).map(x => x.split('|').map(y => y.trim())); if (!g.length) return ''; return 'Staying at ' + p.name + ' puts you in ' + (p.area || t) + '. ' + (g.length ? 'Here is what is close by.\n\n' + g.map(x => x[0] + (x[1] ? ' (' + x[1] + ')' : '') + (x[2] ? ': ' + x[2] : '.')).join('\n') : ''); }
    if (what === 'meta') return { title: clip(titleOf(Object.assign({}, p, { seo: {} })), 62), description: clip((p.petsAllowed ? 'Dog friendly ' : '') + k + ' in ' + t + ', sleeps ' + p.maxGuests + (am[0] ? ', ' + am[0] : '') + '. Book direct from ' + money(p.nightly) + ' a night and skip the platform fees.', 160) };
    return '';
  }

  /* ---------- actions (run in the browser and on the server) ---------- */
  function cleanSeo(patch) {
    const o = {};
    Object.keys(patch || {}).forEach(k => {
      if (!(k in SEO_KEYS)) return; const v = patch[k], n = SEO_KEYS[k];
      if (k === 'sameAs') o[k] = (Array.isArray(v) ? v : []).map(u => String(u).trim()).filter(u => /^https:\/\/[^\s<>"]+$/i.test(u)).slice(0, n);
      else if (k === 'keywords') o[k] = (Array.isArray(v) ? v : []).map(x => clip(String(x).toLowerCase().replace(/\s+/g, ' '), 80)).filter(Boolean).slice(0, n);
      else if (k === 'gbp') { o[k] = {}; GBP.forEach(([id]) => { if (v && v[id]) o[k][id] = true; }); }
      // The host's own website hosted elsewhere: a public https address, kept as its origin. Empty removes it.
      else if (k === 'ownSite') { let x = ''; try { const u = new URL(String(v || '').trim()); if (u.protocol === 'https:' && !u.port && /^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname)) x = u.origin.toLowerCase(); } catch (_) {} o[k] = x; }
      else if (k === 'videoUrl') o[k] = /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/[^\s<>"]+$/i.test(String(v || '').trim()) ? String(v).trim().slice(0, n) : '';
      else o[k] = clip(v, n);
    });
    return o;
  }
  BB.act.updateSeo = function (pid, patch) {
    const p = BB.q.property(pid); if (!p) return null;
    const o = cleanSeo(patch); if (!Object.keys(o).length) return null;
    const keys = Object.keys(o);
    if (patch && (patch.lat !== undefined || patch.lng !== undefined)) { const la = Number(patch.lat), ln = Number(patch.lng); if (la >= 49 && la <= 61 && ln >= -9 && ln <= 2.5) { p.lat = Math.round(la * 1e5) / 1e5; p.lng = Math.round(ln * 1e5) / 1e5; } }
    if ('videoUrl' in o && o.videoUrl && o.videoUrl !== seoOf(p).videoUrl) o.videoAt = S().today;
    p.seo = Object.assign(seoOf(p), o);
    const what = { summary: 'the answer-first summary', areaIntro: 'the local area guide', videoUrl: 'the walkthrough video', sameAs: 'where the home is listed', keywords: 'target searches', gbp: 'the Google Business Profile checklist', metaTitle: 'the Google title', metaDescription: 'the Google description', ownSite: 'your own website address' };
    if (!keys.every(k => k === 'gbp' || k === 'keywords')) BB.log('site', 'Search health', 'Updated ' + keys.map(k => what[k]).join(' and ') + ' for ' + p.domain + '.', pid, ['Search health', p.domain, 'AI answers']);
    BB.store.commit({ type: 'property', id: pid });
    return p.seo;
  };
  BB.act.setMapPin = function (pid, lat, lng) {
    const p = BB.q.property(pid); const la = Number(lat), ln = Number(lng); if (!p || !(la >= 49 && la <= 61 && ln >= -9 && ln <= 2.5)) return false;
    p.lat = Math.round(la * 1e5) / 1e5; p.lng = Math.round(ln * 1e5) / 1e5;
    BB.log('site', 'Search health', 'Set the map pin for ' + p.name + '.', pid); BB.store.commit({ type: 'property', id: pid }); return true;
  };
  BB.act.addFaqs = function (pid, list) {
    const p = BB.q.property(pid); if (!p) return 0; const s = S(); s.website.faqs = s.website.faqs || {};
    const cur = (s.website.faqs[pid] = s.website.faqs[pid] || []); let n = 0;
    (Array.isArray(list) ? list : []).slice(0, 12).forEach(f => { const q = clip(f && f.q, 200).replace(/\|/g, '/'), a = clip(f && f.a, 600); if (q && a && !cur.some(x => x.split('|')[0].toLowerCase() === q.toLowerCase())) { cur.push(q + '|' + a); n++; } });
    if (n) { BB.log('site', 'Search health', 'Added ' + plural(n, 'FAQ') + ' to ' + p.domain + '.', pid, ['Search health', p.domain, 'AI answers']); BB.store.commit({ type: 'property', id: pid }); }
    return n;
  };
  BB.act.trackAiQuestions = function (pid, list) {
    const s = S(); if (!BB.q.property(pid)) return 0; let n = 0;
    (Array.isArray(list) ? list : []).slice(0, 10).forEach(q => { q = clip(q, 140); if (q && !s.ai.questions.some(x => x.q.toLowerCase() === q.toLowerCase() && x.propertyId === pid) && s.ai.questions.length < 40) { s.ai.questions.push({ q, propertyId: pid, engines: { chatgpt: false, gemini: false, perplexity: false, claude: false, google: false }, pending: true }); n++; } });
    if (n) { BB.log('ai', 'AI visibility', 'Tracking ' + plural(n, 'new traveller question') + ' for ' + BB.q.property(pid).short + '.', pid); BB.store.commit({ type: 'ai' }); }
    return n;
  };

  // Results from the server's search engine submissions (Google Search Console, Bing Webmaster Tools, IndexNow). Server only.
  BB.act.setIndexing = function (pid, patch) {
    const p = BB.q.property(pid); if (!p || !patch) return;
    const was = p.indexing || {}; p.indexing = Object.assign({}, was, patch);
    if (patch.google && patch.google.state !== (was.google || {}).state) BB.log('site', 'Search health', patch.google.state === 'submitted' ? 'Submitted ' + p.domain + ' and its sitemap to Google Search Console.' : 'Google Search Console could not take ' + p.domain + ': ' + patch.google.error, pid, ['Search health', 'Google']);
    if (patch.own && patch.own.google !== 'waiting' && patch.own.bing !== 'verifying' && !patch.own.error && !((was.own || {}).google === 'submitted' || (was.own || {}).bing === 'submitted') && (patch.own.google === 'submitted' || patch.own.bing === 'submitted')) BB.log('site', 'Search health', 'Verified ' + patch.own.origin.replace(/^https:\/\//, '') + ' with ' + [patch.own.google === 'submitted' && 'Google', patch.own.bing === 'submitted' && 'Bing'].filter(Boolean).join(' and ') + ' and submitted its sitemap.', pid, ['Search health', 'Your website']);
    if (patch.bing && patch.bing.state === 'submitted' && (was.bing || {}).state !== 'submitted') BB.log('site', 'Search health', 'Submitted ' + p.domain + ' and its sitemap to Bing, which feeds ChatGPT search and Copilot.', pid, ['Search health', 'Bing']);
    BB.store.commit({ type: 'property', id: pid, quiet: true });
  };
  // Domains AI assistants cite for a home's questions, most cited first: who they recommend instead of you.
  function sources(pid) {
    const tally = {};
    (S().ai.questions || []).filter(q => !pid || q.propertyId === pid).forEach(q => Object.entries(q.sources || {}).forEach(([eng, list]) => (list || []).forEach(d => { const t = (tally[d] = tally[d] || { domain: d, n: 0, engines: {} }); t.n++; t.engines[eng] = 1; })));
    return Object.values(tally).sort((a, b) => b.n - a.n).slice(0, 10);
  }

  BB.seo = { audit, CATS, GBP, faqIdeas, keywords, draft, linkKind, LINK_LABEL, seoOf, titleOf, descOf, sources, town, kind };
})();
