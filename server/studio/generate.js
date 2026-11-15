// The AI art director. Claude reads the home's facts (and looks at its photos when they are public), picks an art
// direction from the design system, lays out the sections and writes every word. The answer is a small JSON spec,
// checked against the design rules (design.qa) and sent back once for a fix when a rule fails.
// Without an API key the same spec is built by rules, so the builder always works.
'use strict';
const D = require('./design');
const { facts } = require('./render');

const VIBES = { calm: 'calm and restful', luxe: 'luxurious and design-led', family: 'warm, joyful and family-friendly', rustic: 'rustic, honest and cosy', coastal: 'bright and coastal', urban: 'elegant and urban', adventurous: 'outdoorsy and adventurous', romantic: 'romantic, for couples' };
const VIBE_DIR = { calm: 'linen', luxe: 'nocturne', family: 'sunlit', rustic: 'meadow', coastal: 'harbour', urban: 'georgian', adventurous: 'fell', romantic: 'linen' };

/* ---------- picking a direction by rules ---------- */
function guessDirection(f, brief) {
  if (brief && D.DIRECTIONS[brief.direction]) return brief.direction;
  if (brief && VIBE_DIR[brief.vibe]) return VIBE_DIR[brief.vibe];
  const t = (f.name + ' ' + f.about + ' ' + f.area + ' ' + f.amenities.join(' ')).toLowerCase();
  if (/barn|farm|shepherd|hut|meadow|orchard/.test(t)) return 'meadow';
  if (/sea|beach|harbour|coast|bay|cove|surf/.test(t)) return 'harbour';
  if (/contemporary|modern|architect|glass|concrete/.test(t)) return 'modernist';
  if (/spa|sauna|luxury|boutique/.test(t)) return 'nocturne';
  return { cabin: 'fell', lake: 'harbour', city: 'georgian' }[f.theme] || 'linen';
}
function heroFor(dir, n) {
  const order = (D.DIRECTIONS[dir] || D.DIRECTIONS.linen).heroes;
  if (!n) return 'type';
  return order.find(h => h !== 'mosaic' || n >= 3) || 'split';
}

/* ---------- rules-only copy (no API key) ---------- */
const PERKS = [
  [/hot tub|jacuzzi/i, 'The hot tub', 'Under the stars at the end of the day, with nobody else’s timetable but yours.'],
  [/wood ?burner|log burner|fire/i, 'A proper fire', 'Logs in the basket, a wood burner that draws well, and long evenings in front of it.'],
  [/dog/i, 'Dogs welcome', 'Bring the dog. Walks start at the door and there is room for muddy paws.'],
  [/sea view|sea|beach/i, 'The sea, close by', 'Wake to the light on the water and be on the sand before breakfast.'],
  [/garden|terrace|deck/i, 'Outdoor space', 'Coffee outside in the morning, a glass of something as the light goes.'],
  [/wi-?fi/i, 'Fast Wi-Fi', 'Good enough for a video call, a film, or a day of working away.'],
  [/parking/i, 'Easy parking', 'Pull up right outside. No circling, no permits.'],
  [/self check-?in/i, 'Arrive when you like', 'Self check-in from the afternoon, with clear directions sent before you travel.'],
  [/kitchen/i, 'A kitchen you can cook in', 'Proper pans, sharp knives and space to make dinner an event.'],
];
function rulesCopy(f, dir) {
  const words = String(f.headline || '').replace(/[.!]+$/, '').split(/\s+/).filter(Boolean);
  let h = words.length && words.length <= 9 ? words.join(' ') : (f.kind[0].toUpperCase() + f.kind.slice(1) + ' stays in ' + f.town);
  const hw = h.split(' '); if (hw.length > 2) hw[hw.length - 1] = '*' + hw[hw.length - 1] + '*'; h = hw.join(' ');
  const about = String(f.about || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const story = about.length > 2 ? [about.slice(0, Math.ceil(about.length / 2)).join(' '), about.slice(Math.ceil(about.length / 2)).join(' ')] : [f.about].filter(Boolean);
  const hl = []; for (const [re, t, x] of PERKS) { if (hl.length >= 3) break; if (f.amenities.some(a => re.test(a))) hl.push({ eyebrow: 'Included', title: t, text: x }); }
  if (hl.length < 3) hl.push({ eyebrow: 'Space', title: 'Room for ' + f.maxGuests, text: f.bedrooms + ' bedroom' + (f.bedrooms === 1 ? '' : 's') + ' and ' + f.baths + ' bathroom' + (f.baths === 1 ? '' : 's') + ', set up for sleeping well.' });
  if (hl.length < 3) hl.push({ eyebrow: 'Direct', title: 'Talk to the owner', text: 'Questions go straight to ' + (f.owner || 'your host') + ', not a call centre.' });
  const trunc = (s, n) => s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
  return {
    wordmark: f.short || f.name, tagline: f.town + ' · ' + f.kind, headline: h, subhead: f.sub ? f.sub.replace(/ · /g, ', ') + '.' : (about[0] || ''), cta: 'Check dates',
    storyEyebrow: 'The stay', storyTitle: f.name, story, pull: about[0] || f.headline,
    highlightsEyebrow: 'Why guests come back', highlightsTitle: 'The *good* bits', highlights: hl.slice(0, 3),
    galleryEyebrow: 'Look around', galleryTitle: 'Inside and *out*', amenitiesEyebrow: 'The details', amenitiesTitle: 'Everything you need',
    reviewsEyebrow: 'Guests say', reviewsTitle: 'In their *words*', areaEyebrow: 'Around ' + f.town, areaTitle: 'Days out, picked by your host', areaIntro: '',
    hostEyebrow: 'Your host', hostNote: f.hostNote, bookEyebrow: 'Book direct', bookTitle: 'Pick your *dates*', bookText: 'Book here with ' + (f.owner || 'your host') + ' and pay no platform booking fee. You get an instant answer and talk to your host directly.',
    faqEyebrow: 'Good to know', faqTitle: 'Questions guests ask', closing: 'Your dates are *waiting*', footerLine: 'Book direct with your host. No platform fees.',
    seoTitle: trunc(f.name + ' · ' + f.kind[0].toUpperCase() + f.kind.slice(1) + ' in ' + f.town + ' · Book direct', 62),
    seoDescription: trunc((f.headline ? f.headline + ' ' : '') + 'Sleeps ' + f.maxGuests + ' in ' + f.town + '. Book direct from £' + f.nightly + ' a night with no platform fees.', 160),
  };
}
function layoutFor(f, dir, hero) {
  const n = f.photos.length;
  const secs = [{ type: 'hero', variant: hero }, { type: 'facts', variant: 'ruled' }, { type: 'story', variant: dir === 'linen' || dir === 'georgian' ? 'pull' : 'lede' }, { type: 'highlights', variant: n >= 4 ? 'panels' : 'numbered' }];
  if (n >= 6) secs.push({ type: 'gallery', variant: dir === 'nocturne' || dir === 'modernist' ? 'strip' : 'grid' });
  if (f.amenities.length) secs.push({ type: 'amenities', variant: 'columns' });
  if (f.reviews.length || (f.rating && f.reviewCount)) secs.push({ type: 'reviews', variant: f.reviews.length >= 3 ? 'wall' : 'feature' });
  if (f.guide.length) secs.push({ type: 'area', variant: 'itinerary' });
  secs.push({ type: 'host', variant: 'note' }, { type: 'book', variant: 'panel' }, { type: 'faq', variant: 'accordion' }, { type: 'closing', variant: 'banner' });
  return secs;
}

/* ---------- normalising whatever comes back ---------- */
const str = (v, n) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, n);
function normalize(raw, f, fallback) {
  const r = raw || {}; const out = { v: 1 };
  out.direction = D.DIRECTIONS[r.direction] ? r.direction : fallback.direction;
  out.accent = D.hexOk(r.accent) ? r.accent.toUpperCase() : null;
  const seen = new Set(); let secs = [];
  for (const s of Array.isArray(r.sections) ? r.sections : []) {
    if (!s || !D.SECTIONS[s.type] || seen.has(s.type)) continue; seen.add(s.type);
    secs.push({ type: s.type, variant: D.SECTIONS[s.type].includes(s.variant) ? s.variant : D.SECTIONS[s.type][0] });
  }
  if (!secs.length) secs = fallback.sections.slice();
  secs = secs.filter(s => s.type !== 'hero'); const hv = D.SECTIONS.hero.includes(r.heroVariant) ? r.heroVariant : ((r.sections || []).find(s => s && s.type === 'hero') || {}).variant;
  secs.unshift({ type: 'hero', variant: D.SECTIONS.hero.includes(hv) ? hv : fallback.sections[0].variant });
  for (const t of D.REQUIRED) if (!secs.some(s => s.type === t)) secs.push({ type: t, variant: D.SECTIONS[t][0] });
  // closing banner always last when present; booking always before the FAQ
  const cl = secs.findIndex(s => s.type === 'closing'); if (cl >= 0) secs.push(secs.splice(cl, 1)[0]);
  const bi = secs.findIndex(s => s.type === 'book'), fi = secs.findIndex(s => s.type === 'faq'); if (fi >= 0 && bi > fi) secs.splice(fi, 0, secs.splice(bi, 1)[0]);
  // sections that have nothing to show are dropped, so the page never has empty blocks
  secs = secs.filter(s => !(s.type === 'gallery' && f.photos.length < 4) && !(s.type === 'area' && !f.guide.length) && !(s.type === 'amenities' && !f.amenities.length) && !(s.type === 'reviews' && !f.reviews.length && !(f.rating && f.reviewCount)));
  if (!f.photos.length) secs[0].variant = 'type';
  out.sections = secs.slice(0, 12);
  const c = r.copy || {}, fb = fallback.copy, k = {};
  const S = (key, n) => { k[key] = str(c[key], n) || fb[key] || ''; };
  [['wordmark', 40], ['tagline', 60], ['headline', 90], ['subhead', 240], ['cta', 28], ['storyEyebrow', 40], ['storyTitle', 90], ['pull', 220], ['highlightsEyebrow', 40], ['highlightsTitle', 80], ['galleryEyebrow', 40], ['galleryTitle', 80],
    ['amenitiesEyebrow', 40], ['amenitiesTitle', 80], ['reviewsEyebrow', 40], ['reviewsTitle', 80], ['areaEyebrow', 50], ['areaTitle', 80], ['areaIntro', 300], ['hostEyebrow', 40], ['hostNote', 260], ['bookEyebrow', 40], ['bookTitle', 80], ['bookText', 300],
    ['faqEyebrow', 40], ['faqTitle', 80], ['closing', 90], ['footerLine', 120], ['seoTitle', 62], ['seoDescription', 160]].forEach(([key, n]) => S(key, n));
  k.headline = k.headline.replace(/\\n/g, '\n');
  k.story = (Array.isArray(c.story) ? c.story : []).map(x => str(x, 900)).filter(Boolean).slice(0, 4); if (!k.story.length) k.story = fb.story;
  k.highlights = (Array.isArray(c.highlights) ? c.highlights : []).map(h => ({ eyebrow: str(h && h.eyebrow, 30), title: str(h && h.title, 70), text: str(h && h.text, 260) })).filter(h => h.title && h.text).slice(0, 4);
  if (k.highlights.length < 3) k.highlights = fb.highlights;
  // the host's own note is theirs: the AI may only polish one that exists
  if (!f.hostNote) k.hostNote = '';
  out.copy = k;
  out.rationale = str(r.rationale, 600);
  return out;
}

/* ---------- the Claude request ---------- */
function schema() {
  const s = { type: 'string' };
  const copyKeys = ['wordmark', 'tagline', 'headline', 'subhead', 'cta', 'storyEyebrow', 'storyTitle', 'pull', 'highlightsEyebrow', 'highlightsTitle', 'galleryEyebrow', 'galleryTitle', 'amenitiesEyebrow', 'amenitiesTitle', 'reviewsEyebrow', 'reviewsTitle',
    'areaEyebrow', 'areaTitle', 'areaIntro', 'hostEyebrow', 'hostNote', 'bookEyebrow', 'bookTitle', 'bookText', 'faqEyebrow', 'faqTitle', 'closing', 'footerLine', 'seoTitle', 'seoDescription'];
  const copy = { type: 'object', additionalProperties: false, required: copyKeys.concat(['story', 'highlights']), properties: Object.assign(Object.fromEntries(copyKeys.map(k => [k, s])), {
    story: { type: 'array', items: s },
    highlights: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['eyebrow', 'title', 'text'], properties: { eyebrow: s, title: s, text: s } } },
  }) };
  return { type: 'object', additionalProperties: false, required: ['rationale', 'direction', 'accent', 'heroVariant', 'sections', 'copy'], properties: {
    rationale: s, direction: { type: 'string', enum: Object.keys(D.DIRECTIONS) }, accent: s, heroVariant: { type: 'string', enum: D.SECTIONS.hero },
    sections: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'variant'], properties: { type: { type: 'string', enum: Object.keys(D.SECTIONS) }, variant: s } } },
    copy,
  } };
}
const SYSTEM = () => 'You are the art director and copywriter at a small, award-winning studio that builds direct-booking websites for UK holiday lets. Clients pay £10,000 for a site from you, and every page must look and read like it. ' +
  'You do not write code. You choose from a tested design system and write the words; the studio\'s renderer builds the page.\n\n' +
  'Design principles you work to:\n' + D.PRINCIPLES.map((x, i) => (i + 1) + '. ' + x).join('\n') + '\n\n' +
  'Art directions (pick exactly one, the one that fits this home and the host\'s brief best; do not default to the first):\n' + Object.entries(D.DIRECTIONS).map(([k, d]) => '- ' + k + ': ' + d.name + ' — ' + d.mood + ' Fonts: ' + d.fonts.display + ' with ' + d.fonts.text + '. Default accent ' + d.pal.accent + ' on ' + d.pal.bg + '.').join('\n') + '\n\n' +
  'Sections and their layouts (type: variants): ' + Object.entries(D.SECTIONS).map(([k, v]) => k + ': ' + v.join('/')).join('; ') + '. ' +
  'hero must be first. Include book and faq. Use 8 to 12 sections. Vary rhythm. Only include gallery with 6+ photos, panels highlights with 4+ photos, mosaic hero with 3+ photos, area only if the host gave an area guide, reviews only if there are reviews or a rating. With no photos the hero must be "type".\n\n' +
  'accent: a hex colour (#RRGGBB) that suits the photos and the place, or an empty string to keep the direction\'s accent. It must read on the direction\'s background.\n\n' +
  'Copy rules: UK English. Sentence case. Concrete and sensory, from the facts only. Never invent prices, distances, awards, ratings, reviews, amenities or features that are not in the facts. ' +
  'headline: under nine words, one promise; you may put a line break as \\n (max 3 lines) and wrap one word in *asterisks* to set it in italic accent. Titles may also use *one* emphasised word. ' +
  'subhead: one or two sentences. story: two or three short paragraphs about the stay. pull: one line worth quoting. highlights: exactly three, each a real feature from the facts. ' +
  'hostNote: only polish the host\'s own note if one is given, otherwise empty. seoTitle under 60 characters including the home name and town; seoDescription 140 to 155 characters with a reason to book direct. ' +
  'Banned words and phrases: ' + D.CLICHES.join(', ') + '.\n\n' +
  'rationale: two sentences on why this direction and layout suit this home.';

function userPrompt(f, brief, previous, avoid) {
  const fx = {
    name: f.name, area: f.area, kind: f.kind, sleeps: f.maxGuests, bedrooms: f.bedrooms, bathrooms: f.baths, fromPerNight: '£' + f.nightly, cleaning: '£' + f.cleaning, minimumNights: f.minNights,
    dogs: f.pets ? 'welcome' + (f.petFee ? ', £' + f.petFee + ' per stay' : '') : 'not allowed', checkIn: f.checkin, checkout: f.checkout, parking: f.parking,
    hostHeadline: f.headline, hostSubheading: f.sub, about: f.about, hostNote: f.hostNote, amenities: f.amenities, houseRules: f.rules, areaGuide: f.guide,
    rating: f.rating && f.reviewCount ? f.rating + ' from ' + f.reviewCount + ' reviews' : 'none yet', guestReviews: f.reviews.slice(0, 6).map(r => r.stars + '★ ' + r.text),
    photos: f.photos.length + ' photos' + (f.photos.length ? ': ' + f.photos.slice(0, 12).map(p => p.cap || 'untitled').join('; ') : ''), host: f.owner + ' at ' + f.business,
  };
  const b = brief || {};
  return 'The home:\n' + JSON.stringify(fx, null, 1) + '\n\nThe host\'s brief:\n' +
    '- Feel: ' + (VIBES[b.vibe] || 'your call') + '\n- Guests they want: ' + (str(b.audience, 200) || 'not said') + '\n' + (b.direction && D.DIRECTIONS[b.direction] ? '- They chose the direction: ' + b.direction + '\n' : '') +
    (b.notes ? '- Notes from the host: ' + str(b.notes, 600) + '\n' : '') +
    (avoid && avoid.length ? '- Try a different direction from: ' + avoid.join(', ') + '\n' : '') +
    (previous ? '\nTheir current site spec (revise it; keep what works):\n' + JSON.stringify({ direction: previous.direction, accent: previous.accent, sections: previous.sections, copy: previous.copy }) + '\n' : '') +
    (b.instruction ? '\nWhat the host asked you to change: ' + str(b.instruction, 600) + '\n' : '') +
    '\nReturn the site spec.';
}

module.exports = function (cfg) {
  const key = cfg.ai.anthropic, base = cfg.ai.anthropicBase || 'https://api.anthropic.com', model = cfg.ai.studioModel || 'claude-opus-5-5';
  const enabled = !!key;

  async function ask(system, content, sch) {
    const body = { model, max_tokens: 16000, system, messages: [{ role: 'user', content }], output_config: { effort: cfg.ai.studioEffort || 'medium', format: { type: 'json_schema', schema: sch || schema() } }, fallbacks: 'default' };
    const r = await fetch(base + '/v1/messages', { method: 'POST', signal: AbortSignal.timeout(140000),
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Claude answered ' + r.status + ' ' + t.slice(0, 160)); }
    const j = await r.json();
    if (j.stop_reason === 'refusal') throw new Error('Claude declined this request');
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    try { return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch (e) { throw new Error('Claude did not return a usable design'); }
  }

  // s: workspace state, p: home, brief: {vibe, audience, notes, direction, instruction}, opts: {previous, avoid, samplePhotos}
  async function design(s, p, brief, opts) {
    opts = opts || {};
    const f = facts(s, p, opts);
    const dir = guessDirection(f, brief && !brief.instruction ? brief : null);
    const fallback = { direction: dir, sections: layoutFor(f, dir, heroFor(dir, f.photos.length)), copy: rulesCopy(f, dir) };
    if (!enabled) {
      const spec = normalize(Object.assign({}, fallback, opts.previous && brief && brief.instruction ? { direction: opts.previous.direction } : {}), f, fallback);
      if (opts.avoid && opts.avoid.length) { const keys = Object.keys(D.DIRECTIONS).filter(k => !opts.avoid.includes(k)); spec.direction = keys[(opts.avoid.length * 3) % keys.length]; spec.sections = layoutFor(f, spec.direction, heroFor(spec.direction, f.photos.length)); }
      spec.by = 'rules'; spec.qa = D.qa(spec, f); return spec;
    }
    const content = [];
    // Claude looks at up to four of the host's photos (public addresses only) to choose the direction and accent
    f.photos.filter(x => /^https:\/\//.test(x.url)).slice(0, 4).forEach(x => content.push({ type: 'image', source: { type: 'url', url: x.url } }));
    content.push({ type: 'text', text: userPrompt(f, brief, opts.previous, opts.avoid) });
    let spec = normalize(await ask(SYSTEM(), content), f, fallback);
    let checks = D.qa(spec, f);
    const fixable = checks.filter(x => !x.ok && x.fix && !/photo/i.test(x.label));
    if (fixable.length) { // one review round: send the failed checks back and ask for a corrected spec
      content[content.length - 1] = { type: 'text', text: userPrompt(f, brief, spec, opts.avoid) + '\n\nYour last version failed these design checks. Fix them and keep everything else: ' + fixable.map(x => x.label + ' (' + x.fix + ')').join('; ') };
      try { spec = normalize(await ask(SYSTEM(), content), f, fallback); checks = D.qa(spec, f); } catch (_) { /* keep the first version */ }
    }
    spec.by = 'ai'; spec.qa = checks; return spec;
  }
  return { enabled, design, ask, guessDirection, facts, normalize, SYSTEM };
};
module.exports.VIBES = VIBES;
module.exports.rulesCopy = rulesCopy;
module.exports.layoutFor = layoutFor;
module.exports.guessDirection = guessDirection;
module.exports.heroFor = heroFor;
