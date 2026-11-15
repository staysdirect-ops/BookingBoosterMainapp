// The Studio design system: the art directions, type pairings, palettes and rules that every AI-built site and
// funnel page is made from. The AI chooses and writes inside this system; it never writes raw HTML or CSS, so
// every page it makes keeps agency-grade typography, spacing, contrast and motion.
'use strict';

// The design principles the AI art director works to. They are sent with every generation request and shown
// to hosts in the console, so both sides know what "good" means here.
const PRINCIPLES = [
  'Commit to one clear aesthetic direction and carry it through every section. A site should feel designed for this home, not assembled from a template.',
  'Typography leads. A characterful display face for headlines, a calm, readable text face for everything else, with strong contrast in size between them.',
  'One dominant colour with a single sharp accent beats an even spread of colours. Accent is for actions and small moments, never for big blocks of text.',
  'Generous negative space. Let photographs and headlines breathe; never crowd the first screen with badges, banners and buttons.',
  'Vary the rhythm: alternate wide and narrow, light and deep, image-led and type-led sections so the page has pace.',
  'Write like a person who knows the place: concrete, sensory, specific. No clichés (nestled, hidden gem, boasts, oasis, perfect getaway, home away from home).',
  'Short headlines (under nine words) that make one promise. Body copy in short paragraphs. Every section earns its place.',
  'One clear action everywhere: check dates and book direct. Remind guests that booking here skips the platform fee.',
  'Motion is restrained and purposeful: one orchestrated reveal on load and gentle reveals as sections arrive. Nothing bounces, and reduced-motion is respected.',
  'Accessible by default: real text contrast (WCAG AA), visible focus, readable sizes on phones, alt text on every photo.',
  'Only state facts the host gave. Never invent prices, distances, awards, reviews or amenities.',
];

// Words that make holiday-let copy read as generic AI or estate-agent filler.
const CLICHES = ['nestled', 'hidden gem', 'boasts', 'oasis', 'perfect getaway', 'home away from home', 'look no further', 'unwind and relax', 'tranquil haven', 'something for everyone', 'whether you', 'ideal base', 'stunning', 'breathtaking', 'idyllic', 'escape the hustle', 'hustle and bustle', 'elevate', 'unparalleled', 'world-class', 'luxurious retreat', 'a true haven', 'in the heart of'];

// Art directions. Each is a complete, tested look: fonts, palette, shape and the layouts it suits best.
const DIRECTIONS = {
  linen: {
    name: 'Linen & Ink', mood: 'Quiet editorial. Big light serif headlines, bone paper, terracotta accent. Like a good travel magazine.',
    suits: ['cottage', 'townhouse', 'barn', 'any'],
    fonts: { display: 'Cormorant Garamond', text: 'Jost', href: 'family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@400;500;600' },
    disp: { weight: 500, track: '-0.015em', lead: 0.98, italic: true, case: 'none', scale: 1.08 },
    pal: { bg: '#F4EFE6', bg2: '#EBE4D7', ink: '#1E1B16', muted: '#5E574C', line: '#D8CFBF', accent: '#A4502E', accentInk: '#FFFFFF', deep: '#2A251F', deepInk: '#F4EFE6' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['editorial', 'split', 'cinematic'], texture: 'paper',
  },
  fell: {
    name: 'Fell & Slate', mood: 'Northern and grounded. Soft modern serif, moss and slate, warm wood accent. For cabins, lodges and fells.',
    suits: ['cabin', 'lodge', 'hut', 'any'],
    fonts: { display: 'Fraunces', text: 'Hanken Grotesk', href: 'family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=Hanken+Grotesk:wght@400;500;600' },
    disp: { weight: 380, track: '-0.03em', lead: 0.96, italic: true, case: 'none', scale: 1 },
    pal: { bg: '#EEF0EA', bg2: '#E2E6DD', ink: '#17201A', muted: '#4F5A52', line: '#CDD3C8', accent: '#9C5B2E', accentInk: '#FFFFFF', deep: '#1D2A22', deepInk: '#EEF0EA' },
    shape: { radius: 4, button: 999, image: 4 }, heroes: ['cinematic', 'mosaic', 'split'], texture: 'grain',
  },
  harbour: {
    name: 'Harbour Light', mood: 'Coastal and bright. Confident serif, whitewash and deep sea blue, a sand note. For seaside cottages and harbour flats.',
    suits: ['beach', 'cottage', 'apartment', 'any'],
    fonts: { display: 'DM Serif Display', text: 'DM Sans', href: 'family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400..600' },
    disp: { weight: 400, track: '-0.02em', lead: 1.0, italic: true, case: 'none', scale: 0.96 },
    pal: { bg: '#F7F6F2', bg2: '#E9EEF0', ink: '#0D2836', muted: '#4A5E69', line: '#D3DDE1', accent: '#0F6E8C', accentInk: '#FFFFFF', deep: '#0D2836', deepInk: '#F7F6F2' },
    shape: { radius: 14, button: 999, image: 14 }, heroes: ['split', 'cinematic', 'mosaic'], texture: 'none',
  },
  georgian: {
    name: 'Bath Stone', mood: 'Elegant and urban. High-contrast didone headlines, honey stone and ink, a bronze accent. For townhouses and city stays.',
    suits: ['townhouse', 'apartment', 'any'],
    fonts: { display: 'Bodoni Moda', text: 'Karla', href: 'family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Karla:wght@400;500;600' },
    disp: { weight: 500, track: '-0.02em', lead: 1.0, italic: true, case: 'none', scale: 0.95 },
    pal: { bg: '#F3ECE0', bg2: '#E8DECD', ink: '#241C14', muted: '#5F5345', line: '#D6C8B2', accent: '#8A5A2B', accentInk: '#FFFFFF', deep: '#241C14', deepInk: '#F3ECE0' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['editorial', 'split', 'cinematic'], texture: 'paper',
  },
  nocturne: {
    name: 'Nocturne', mood: 'Dark and luxurious. Thin, wide display type on near-black, brass accent, photographs that glow. For design-led and luxury stays.',
    suits: ['luxury', 'cabin', 'apartment', 'any'],
    fonts: { display: 'Italiana', text: 'Manrope', href: 'family=Italiana&family=Manrope:wght@400;500;600' },
    disp: { weight: 400, track: '0.02em', lead: 1.02, italic: false, case: 'uppercase', scale: 0.9 },
    pal: { bg: '#121110', bg2: '#1B1A18', ink: '#EDE6DA', muted: '#A39B8E', line: '#33302B', accent: '#C9A46B', accentInk: '#121110', deep: '#EDE6DA', deepInk: '#121110' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['cinematic', 'editorial', 'mosaic'], texture: 'grain', dark: true,
  },
  modernist: {
    name: 'Modernist', mood: 'Architectural and graphic. Wide grotesque headlines, concrete grey, one hot accent. For contemporary builds and design homes.',
    suits: ['modern', 'apartment', 'any'],
    fonts: { display: 'Syne', text: 'Figtree', href: 'family=Syne:wght@500..800&family=Figtree:wght@400;500;600' },
    disp: { weight: 700, track: '-0.04em', lead: 0.92, italic: false, case: 'none', scale: 0.92 },
    pal: { bg: '#F1F1EE', bg2: '#E4E4E0', ink: '#111111', muted: '#55554F', line: '#CFCFC9', accent: '#C03A12', accentInk: '#FFFFFF', deep: '#111111', deepInk: '#F1F1EE' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['mosaic', 'editorial', 'cinematic'], texture: 'none',
  },
  meadow: {
    name: 'Meadow', mood: 'Warm and rustic. Rounded old-style serif, oat and olive, honest and generous. For barns, farm stays and shepherd’s huts.',
    suits: ['barn', 'farm', 'hut', 'cottage', 'any'],
    fonts: { display: 'Young Serif', text: 'Work Sans', href: 'family=Young+Serif&family=Work+Sans:wght@400;500;600' },
    disp: { weight: 400, track: '-0.02em', lead: 1.02, italic: false, case: 'none', scale: 0.92 },
    pal: { bg: '#F5F0E4', bg2: '#EAE3D2', ink: '#2B281D', muted: '#5E5948', line: '#D9D0BB', accent: '#5E6E2E', accentInk: '#FFFFFF', deep: '#2F3322', deepInk: '#F5F0E4' },
    shape: { radius: 10, button: 999, image: 10 }, heroes: ['split', 'mosaic', 'cinematic'], texture: 'paper',
  },
  sunlit: {
    name: 'Sunlit', mood: 'Bright and joyful. Chunky editorial serif, cream and tomato with a teal counterpoint. For family stays, seaside and summer.',
    suits: ['beach', 'family', 'cottage', 'any'],
    fonts: { display: 'Gloock', text: 'Outfit', href: 'family=Gloock&family=Outfit:wght@400;500;600' },
    disp: { weight: 400, track: '-0.025em', lead: 0.98, italic: false, case: 'none', scale: 0.98 },
    pal: { bg: '#FFF8EE', bg2: '#FBEBD7', ink: '#221E1A', muted: '#5D554C', line: '#EAD9C2', accent: '#C2461C', accentInk: '#FFFFFF', deep: '#1F4F52', deepInk: '#FFF8EE' },
    shape: { radius: 18, button: 999, image: 18 }, heroes: ['split', 'mosaic', 'cinematic'], texture: 'none',
  },
};

// Which layouts exist for each section. The AI picks from these; anything else is ignored.
const SECTIONS = {
  hero: ['cinematic', 'split', 'editorial', 'mosaic', 'type'],
  facts: ['ruled'],
  story: ['lede', 'pull'],
  highlights: ['numbered', 'panels'],
  gallery: ['grid', 'strip'],
  amenities: ['columns'],
  reviews: ['wall', 'feature'],
  area: ['itinerary'],
  host: ['note'],
  book: ['panel'],
  faq: ['accordion'],
  closing: ['banner'],
};
const ORDER = ['hero', 'facts', 'story', 'highlights', 'gallery', 'amenities', 'reviews', 'area', 'host', 'book', 'faq', 'closing'];
const REQUIRED = ['hero', 'book', 'faq'];

/* ---------- colour maths (WCAG) ---------- */
const hexOk = h => /^#[0-9a-f]{6}$/i.test(String(h || ''));
function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function lum(h) { return rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0); }
function contrast(a, b) { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
function mix(a, b, t) { const x = rgb(a), y = rgb(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); }

// The palette a site actually uses: the direction's, with the AI's accent only when it passes contrast checks.
function palette(dir, accent) {
  const d = DIRECTIONS[dir] || DIRECTIONS.linen; const p = Object.assign({}, d.pal);
  if (hexOk(accent) && contrast(accent, p.bg) >= 3.2) {
    p.accent = accent.toUpperCase();
    p.accentInk = contrast('#FFFFFF', accent) >= 4.5 ? '#FFFFFF' : contrast('#111111', accent) >= 4.5 ? '#111111' : null;
    if (!p.accentInk) Object.assign(p, { accent: d.pal.accent, accentInk: d.pal.accentInk });
  }
  // text in the accent colour (links, numerals) must pass AA on the page background; darken until it does
  let at = p.accent, guard = 0; while (contrast(at, p.bg) < 4.5 && guard++ < 20) at = mix(at, d.dark ? '#FFFFFF' : '#000000', 0.08);
  p.accentText = at;
  // on the deep colour (type-led hero, dark bands): a light enough accent for italics, and a button that stands out
  let ad = p.accent; guard = 0; while (contrast(ad, p.deep) < 4.5 && guard++ < 30) ad = mix(ad, p.deepInk, 0.08);
  p.accentDeep = ad;
  const strong = contrast(p.accent, p.deep) >= 3;
  p.deepBtn = strong ? p.accent : p.deepInk; p.deepBtnInk = strong ? p.accentInk : p.deep;
  return p;
}

// Design QA: the checks every generated site has to pass before it can be published. Returns [{ok, label, fix}].
function qa(spec, facts) {
  const p = palette(spec.direction, spec.accent); const c = spec.copy || {};
  const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
  const all = JSON.stringify(c).toLowerCase();
  const found = CLICHES.filter(x => all.includes(x));
  const types = (spec.sections || []).map(s => s.type);
  const imgHero = ['cinematic', 'split', 'mosaic', 'editorial'].includes((spec.sections.find(s => s.type === 'hero') || {}).variant);
  return [
    { ok: contrast(p.ink, p.bg) >= 7, label: 'Body text contrast is AAA (' + contrast(p.ink, p.bg).toFixed(1) + ':1)' },
    { ok: contrast(p.accentInk, p.accent) >= 4.5, label: 'Buttons pass WCAG AA contrast (' + contrast(p.accentInk, p.accent).toFixed(1) + ':1)' },
    { ok: contrast(p.muted, p.bg) >= 4.5, label: 'Secondary text passes WCAG AA' },
    { ok: words(c.headline) > 0 && words(c.headline) <= 9, label: 'Headline makes one promise in under nine words', fix: 'Shorten the headline' },
    { ok: !found.length, label: found.length ? 'Cliché words found: ' + found.join(', ') : 'No clichés or filler words', fix: 'Rewrite without them' },
    { ok: REQUIRED.every(t => types.includes(t)), label: 'Has a hero, a booking section and answers to guest questions' },
    { ok: new Set(types).size === types.length, label: 'Every section appears once' },
    { ok: types.length >= 6 && types.length <= 12, label: 'Page has pace: ' + types.length + ' sections' },
    { ok: !imgHero || (facts.photos || []).length > 0, label: imgHero ? 'Hero has a real photograph' : 'Type-led hero (add photos for an image-led design)', fix: 'Add photos in Website & SEO' },
    { ok: (facts.photos || []).length >= 6 || !types.includes('gallery'), label: types.includes('gallery') ? 'Gallery has at least 6 photos (' + (facts.photos || []).length + ')' : 'No gallery until there are enough photos', fix: 'Add more photos' },
    { ok: (facts.photos || []).every(x => x.alt || x.cap) || !(facts.photos || []).length, label: 'Every photo has alt text' },
    { ok: !!(c.seoTitle && c.seoTitle.length <= 62 && c.seoDescription && c.seoDescription.length <= 160), label: 'Search title and description fit Google’s limits' },
  ];
}

module.exports = { PRINCIPLES, CLICHES, DIRECTIONS, SECTIONS, ORDER, REQUIRED, palette, contrast, mix, hexOk, qa };
