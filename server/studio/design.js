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

// Font pairings. Each direction has its own, and hosts (or Claude) can swap in any other pairing to make the
// same direction feel different. disp: how the display face is set (weight, tracking, leading, case, scale).
const FONTS = {
  cormorant: { name: 'Cormorant & Jost', display: 'Cormorant Garamond', text: 'Jost', feel: 'Light, literary serif', href: 'family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@400;500;600', disp: { weight: 500, track: '-0.015em', lead: 0.98, case: 'none', scale: 1.08 } },
  fraunces: { name: 'Fraunces & Hanken', display: 'Fraunces', text: 'Hanken Grotesk', feel: 'Soft modern serif', href: 'family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=Hanken+Grotesk:wght@400;500;600', disp: { weight: 380, track: '-0.03em', lead: 0.96, case: 'none', scale: 1 } },
  dmserif: { name: 'DM Serif & DM Sans', display: 'DM Serif Display', text: 'DM Sans', feel: 'Confident classic serif', href: 'family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400..600', disp: { weight: 400, track: '-0.02em', lead: 1.0, case: 'none', scale: 0.96 } },
  bodoni: { name: 'Bodoni & Karla', display: 'Bodoni Moda', text: 'Karla', feel: 'High-contrast fashion serif', href: 'family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Karla:wght@400;500;600', disp: { weight: 500, track: '-0.02em', lead: 1.0, case: 'none', scale: 0.95 } },
  italiana: { name: 'Italiana & Manrope', display: 'Italiana', text: 'Manrope', feel: 'Thin, wide and luxurious', href: 'family=Italiana&family=Manrope:wght@400;500;600', disp: { weight: 400, track: '0.02em', lead: 1.02, case: 'uppercase', scale: 0.9 } },
  syne: { name: 'Syne & Figtree', display: 'Syne', text: 'Figtree', feel: 'Wide, graphic grotesque', href: 'family=Syne:wght@500..800&family=Figtree:wght@400;500;600', disp: { weight: 700, track: '-0.04em', lead: 0.92, case: 'none', scale: 0.92 } },
  young: { name: 'Young Serif & Work Sans', display: 'Young Serif', text: 'Work Sans', feel: 'Rounded old-style serif', href: 'family=Young+Serif&family=Work+Sans:wght@400;500;600', disp: { weight: 400, track: '-0.02em', lead: 1.02, case: 'none', scale: 0.92 } },
  gloock: { name: 'Gloock & Outfit', display: 'Gloock', text: 'Outfit', feel: 'Chunky editorial serif', href: 'family=Gloock&family=Outfit:wght@400;500;600', disp: { weight: 400, track: '-0.025em', lead: 0.98, case: 'none', scale: 0.98 } },
  instrument: { name: 'Instrument Serif & Inter Tight', display: 'Instrument Serif', text: 'Inter Tight', feel: 'Slim, modern Scandinavian serif', href: 'family=Instrument+Serif:ital@0;1&family=Inter+Tight:wght@400;500;600', disp: { weight: 400, track: '-0.025em', lead: 0.96, case: 'none', scale: 1.1 } },
  playfair: { name: 'Playfair & Mulish', display: 'Playfair Display', text: 'Mulish', feel: 'Glamorous Riviera serif', href: 'family=Playfair+Display:ital,wght@0,400..700;1,400..600&family=Mulish:wght@400;500;600', disp: { weight: 500, track: '-0.02em', lead: 1.02, case: 'none', scale: 0.92 } },
  bricolage: { name: 'Bricolage & Instrument Sans', display: 'Bricolage Grotesque', text: 'Instrument Sans', feel: 'Characterful, friendly grotesque', href: 'family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Instrument+Sans:wght@400;500;600', disp: { weight: 650, track: '-0.035em', lead: 0.94, case: 'none', scale: 0.94 } },
  caslon: { name: 'Libre Caslon & Franklin', display: 'Libre Caslon Display', text: 'Libre Franklin', feel: 'Country-house traditional', href: 'family=Libre+Caslon+Display&family=Libre+Franklin:wght@400;500;600', disp: { weight: 400, track: '-0.01em', lead: 1.04, case: 'none', scale: 1.02 } },
  marcellus: { name: 'Marcellus & Nunito Sans', display: 'Marcellus', text: 'Nunito Sans', feel: 'Carved, calm and classical', href: 'family=Marcellus&family=Nunito+Sans:opsz,wght@6..12,400..600', disp: { weight: 400, track: '0.01em', lead: 1.06, case: 'none', scale: 0.9 } },
  newsreader: { name: 'Newsreader & Inter', display: 'Newsreader', text: 'Inter', feel: 'Bookish, warm text serif', href: 'family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500&family=Inter:wght@400;500;600', disp: { weight: 380, track: '-0.03em', lead: 0.98, case: 'none', scale: 1.02 } },
  space: { name: 'Space Grotesk & Plex Sans', display: 'Space Grotesk', text: 'IBM Plex Sans', feel: 'Technical and crisp', href: 'family=Space+Grotesk:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600', disp: { weight: 600, track: '-0.04em', lead: 0.94, case: 'none', scale: 0.92 } },
  abril: { name: 'Abril Fatface & Lato', display: 'Abril Fatface', text: 'Lato', feel: 'Retro poster', href: 'family=Abril+Fatface&family=Lato:wght@400;700', disp: { weight: 400, track: '-0.01em', lead: 1.0, case: 'none', scale: 0.9 } },
  unbounded: { name: 'Unbounded & Onest', display: 'Unbounded', text: 'Onest', feel: 'Bold, rounded and playful', href: 'family=Unbounded:wght@400..700&family=Onest:wght@400;500;600', disp: { weight: 500, track: '-0.03em', lead: 1.0, case: 'none', scale: 0.78 } },
};

// Colour palettes. Every one is checked for WCAG contrast in the tests. A direction brings its own; any of these
// can be swapped in. dark: a dark page with light text.
const PALETTES = {
  linen: { name: 'Bone & terracotta', pal: { bg: '#F4EFE6', bg2: '#EBE4D7', ink: '#1E1B16', muted: '#5E574C', line: '#D8CFBF', accent: '#A4502E', accentInk: '#FFFFFF', deep: '#2A251F', deepInk: '#F4EFE6' } },
  fell: { name: 'Moss & slate', pal: { bg: '#EEF0EA', bg2: '#E2E6DD', ink: '#17201A', muted: '#4F5A52', line: '#CDD3C8', accent: '#9C5B2E', accentInk: '#FFFFFF', deep: '#1D2A22', deepInk: '#EEF0EA' } },
  harbour: { name: 'Whitewash & sea', pal: { bg: '#F7F6F2', bg2: '#E9EEF0', ink: '#0D2836', muted: '#4A5E69', line: '#D3DDE1', accent: '#0F6E8C', accentInk: '#FFFFFF', deep: '#0D2836', deepInk: '#F7F6F2' } },
  georgian: { name: 'Honey stone & bronze', pal: { bg: '#F3ECE0', bg2: '#E8DECD', ink: '#241C14', muted: '#5F5345', line: '#D6C8B2', accent: '#8A5A2B', accentInk: '#FFFFFF', deep: '#241C14', deepInk: '#F3ECE0' } },
  nocturne: { name: 'Night & brass', dark: true, pal: { bg: '#121110', bg2: '#1B1A18', ink: '#EDE6DA', muted: '#A39B8E', line: '#33302B', accent: '#C9A46B', accentInk: '#121110', deep: '#EDE6DA', deepInk: '#121110' } },
  modernist: { name: 'Concrete & signal', pal: { bg: '#F1F1EE', bg2: '#E4E4E0', ink: '#111111', muted: '#55554F', line: '#CFCFC9', accent: '#C03A12', accentInk: '#FFFFFF', deep: '#111111', deepInk: '#F1F1EE' } },
  meadow: { name: 'Oat & olive', pal: { bg: '#F5F0E4', bg2: '#EAE3D2', ink: '#2B281D', muted: '#5E5948', line: '#D9D0BB', accent: '#5E6E2E', accentInk: '#FFFFFF', deep: '#2F3322', deepInk: '#F5F0E4' } },
  sunlit: { name: 'Cream & tomato', pal: { bg: '#FFF8EE', bg2: '#FBEBD7', ink: '#221E1A', muted: '#5D554C', line: '#EAD9C2', accent: '#C2461C', accentInk: '#FFFFFF', deep: '#1F4F52', deepInk: '#FFF8EE' } },
  birch: { name: 'Birch & lingonberry', pal: { bg: '#F6F5F1', bg2: '#ECEAE3', ink: '#1C1D1F', muted: '#55585C', line: '#D9D7CF', accent: '#B23A3A', accentInk: '#FFFFFF', deep: '#22262A', deepInk: '#F6F5F1' } },
  riviera: { name: 'Riviera navy & coral', pal: { bg: '#FBF7F0', bg2: '#F1E9DC', ink: '#14233A', muted: '#4E5868', line: '#E2D8C6', accent: '#B8432A', accentInk: '#FFFFFF', deep: '#14233A', deepInk: '#FBF7F0' } },
  cobalt: { name: 'Chalk & cobalt', pal: { bg: '#F5F3EF', bg2: '#E9E6F2', ink: '#16151C', muted: '#555360', line: '#DAD7E3', accent: '#3B4FD8', accentInk: '#FFFFFF', deep: '#1B1A2E', deepInk: '#F5F3EF' } },
  heritage: { name: 'Racing green & claret', pal: { bg: '#F4F0E6', bg2: '#E9E2D2', ink: '#1B2620', muted: '#535B54', line: '#D6CDBA', accent: '#7A2631', accentInk: '#FFFFFF', deep: '#1F3A2E', deepInk: '#F4F0E6' } },
  sage: { name: 'Sage & deep teal', pal: { bg: '#F1F3EE', bg2: '#E1E8DF', ink: '#1A2622', muted: '#4F5D57', line: '#CED8CF', accent: '#2F6B62', accentInk: '#FFFFFF', deep: '#24413A', deepInk: '#F1F3EE' } },
  blush: { name: 'Blush & berry', pal: { bg: '#FBF4F1', bg2: '#F4E4DE', ink: '#2A1E1C', muted: '#66524D', line: '#EBD5CD', accent: '#A23E48', accentInk: '#FFFFFF', deep: '#3B2422', deepInk: '#FBF4F1' } },
  ochre: { name: 'Ochre & umber', pal: { bg: '#F7F1E3', bg2: '#EFE3C8', ink: '#262017', muted: '#5D5443', line: '#E0D3B4', accent: '#94570A', accentInk: '#FFFFFF', deep: '#3A2E1A', deepInk: '#F7F1E3' } },
  mono: { name: 'Paper & ink', pal: { bg: '#FFFFFF', bg2: '#F2F2F0', ink: '#0A0A0A', muted: '#575757', line: '#DEDEDB', accent: '#0A0A0A', accentInk: '#FFFFFF', deep: '#0A0A0A', deepInk: '#FFFFFF' } },
  ember: { name: 'Ember & amber', dark: true, pal: { bg: '#17120F', bg2: '#211A16', ink: '#F1E6D8', muted: '#B3A391', line: '#3A2F27', accent: '#E0A458', accentInk: '#17120F', deep: '#F1E6D8', deepInk: '#17120F' } },
  midnight: { name: 'Midnight & ice', dark: true, pal: { bg: '#0F1724', bg2: '#162033', ink: '#E8EDF4', muted: '#9AA7B8', line: '#2A3549', accent: '#7FB3D5', accentInk: '#0F1724', deep: '#E8EDF4', deepInk: '#0F1724' } },
  pine: { name: 'Pine & gold', dark: true, pal: { bg: '#121A15', bg2: '#19241D', ink: '#E7EDE6', muted: '#9DAA9F', line: '#2C3A31', accent: '#C7B37A', accentInk: '#121A15', deep: '#E7EDE6', deepInk: '#121A15' } },
};

// The finer style controls. '' always means "what the art direction does".
const STYLE = {
  corners: { sharp: { name: 'Sharp', radius: 0, button: 0, image: 0 }, soft: { name: 'Soft', radius: 6, button: 6, image: 6 }, round: { name: 'Rounded', radius: 14, button: 999, image: 16 }, pebble: { name: 'Pebble', radius: 26, button: 999, image: 30 } },
  buttons: { solid: 'Solid', outline: 'Outline', link: 'Underlined link' },
  spacing: { compact: 'Compact', regular: 'Regular', airy: 'Airy' },
  scale: { quiet: 'Quiet', regular: 'Regular', loud: 'Loud' },
  headings: { sentence: 'Sentence case', upper: 'Capitals', italic: 'Italic' },
  texture: { none: 'None', paper: 'Paper', grain: 'Film grain' },
  nav: { classic: 'Classic', centered: 'Centred', minimal: 'Minimal' },
  images: { plain: 'Plain', framed: 'Print border', shadow: 'Soft shadow' },
  bands: { soft: 'Soft tints', flat: 'Flat with rules', bold: 'Bold colour bands' },
};
const STYLE_KEYS = ['font', 'palette'].concat(Object.keys(STYLE));

// Art directions. Each is a complete, tested look: fonts, palette, shape and the layouts it suits best.
const DIRECTIONS = {
  linen: {
    name: 'Linen & Ink', mood: 'Quiet editorial. Big light serif headlines, bone paper, terracotta accent. Like a good travel magazine.',
    suits: ['cottage', 'townhouse', 'barn', 'any'], font: 'cormorant', palette: 'linen',
    fonts: { display: 'Cormorant Garamond', text: 'Jost', href: 'family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@400;500;600' },
    disp: { weight: 500, track: '-0.015em', lead: 0.98, italic: true, case: 'none', scale: 1.08 },
    pal: { bg: '#F4EFE6', bg2: '#EBE4D7', ink: '#1E1B16', muted: '#5E574C', line: '#D8CFBF', accent: '#A4502E', accentInk: '#FFFFFF', deep: '#2A251F', deepInk: '#F4EFE6' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['editorial', 'split', 'cinematic'], texture: 'paper', alts: { fonts: ['newsreader', 'playfair'], palettes: ['blush', 'ochre'] },
  },
  fell: {
    name: 'Fell & Slate', mood: 'Northern and grounded. Soft modern serif, moss and slate, warm wood accent. For cabins, lodges and fells.',
    suits: ['cabin', 'lodge', 'hut', 'any'], font: 'fraunces', palette: 'fell',
    fonts: { display: 'Fraunces', text: 'Hanken Grotesk', href: 'family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..600&family=Hanken+Grotesk:wght@400;500;600' },
    disp: { weight: 380, track: '-0.03em', lead: 0.96, italic: true, case: 'none', scale: 1 },
    pal: { bg: '#EEF0EA', bg2: '#E2E6DD', ink: '#17201A', muted: '#4F5A52', line: '#CDD3C8', accent: '#9C5B2E', accentInk: '#FFFFFF', deep: '#1D2A22', deepInk: '#EEF0EA' },
    shape: { radius: 4, button: 999, image: 4 }, heroes: ['cinematic', 'mosaic', 'split'], texture: 'grain', alts: { fonts: ['instrument', 'newsreader'], palettes: ['sage', 'pine'] },
  },
  harbour: {
    name: 'Harbour Light', mood: 'Coastal and bright. Confident serif, whitewash and deep sea blue, a sand note. For seaside cottages and harbour flats.',
    suits: ['beach', 'cottage', 'apartment', 'any'], font: 'dmserif', palette: 'harbour',
    fonts: { display: 'DM Serif Display', text: 'DM Sans', href: 'family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,400..600' },
    disp: { weight: 400, track: '-0.02em', lead: 1.0, italic: true, case: 'none', scale: 0.96 },
    pal: { bg: '#F7F6F2', bg2: '#E9EEF0', ink: '#0D2836', muted: '#4A5E69', line: '#D3DDE1', accent: '#0F6E8C', accentInk: '#FFFFFF', deep: '#0D2836', deepInk: '#F7F6F2' },
    shape: { radius: 14, button: 999, image: 14 }, heroes: ['split', 'cinematic', 'mosaic'], texture: 'none', alts: { fonts: ['playfair', 'instrument'], palettes: ['riviera', 'birch'] },
  },
  georgian: {
    name: 'Bath Stone', mood: 'Elegant and urban. High-contrast didone headlines, honey stone and ink, a bronze accent. For townhouses and city stays.',
    suits: ['townhouse', 'apartment', 'any'], font: 'bodoni', palette: 'georgian',
    fonts: { display: 'Bodoni Moda', text: 'Karla', href: 'family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Karla:wght@400;500;600' },
    disp: { weight: 500, track: '-0.02em', lead: 1.0, italic: true, case: 'none', scale: 0.95 },
    pal: { bg: '#F3ECE0', bg2: '#E8DECD', ink: '#241C14', muted: '#5F5345', line: '#D6C8B2', accent: '#8A5A2B', accentInk: '#FFFFFF', deep: '#241C14', deepInk: '#F3ECE0' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['editorial', 'split', 'cinematic'], texture: 'paper', alts: { fonts: ['caslon', 'playfair'], palettes: ['heritage', 'mono'] },
  },
  nocturne: {
    name: 'Nocturne', mood: 'Dark and luxurious. Thin, wide display type on near-black, brass accent, photographs that glow. For design-led and luxury stays.',
    suits: ['luxury', 'cabin', 'apartment', 'any'], font: 'italiana', palette: 'nocturne',
    fonts: { display: 'Italiana', text: 'Manrope', href: 'family=Italiana&family=Manrope:wght@400;500;600' },
    disp: { weight: 400, track: '0.02em', lead: 1.02, italic: false, case: 'uppercase', scale: 0.9 },
    pal: { bg: '#121110', bg2: '#1B1A18', ink: '#EDE6DA', muted: '#A39B8E', line: '#33302B', accent: '#C9A46B', accentInk: '#121110', deep: '#EDE6DA', deepInk: '#121110' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['cinematic', 'editorial', 'mosaic'], texture: 'grain', alts: { fonts: ['bodoni', 'marcellus'], palettes: ['midnight', 'pine'] }, dark: true,
  },
  modernist: {
    name: 'Modernist', mood: 'Architectural and graphic. Wide grotesque headlines, concrete grey, one hot accent. For contemporary builds and design homes.',
    suits: ['modern', 'apartment', 'any'], font: 'syne', palette: 'modernist',
    fonts: { display: 'Syne', text: 'Figtree', href: 'family=Syne:wght@500..800&family=Figtree:wght@400;500;600' },
    disp: { weight: 700, track: '-0.04em', lead: 0.92, italic: false, case: 'none', scale: 0.92 },
    pal: { bg: '#F1F1EE', bg2: '#E4E4E0', ink: '#111111', muted: '#55554F', line: '#CFCFC9', accent: '#C03A12', accentInk: '#FFFFFF', deep: '#111111', deepInk: '#F1F1EE' },
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['mosaic', 'editorial', 'cinematic'], texture: 'none', alts: { fonts: ['space', 'unbounded'], palettes: ['mono', 'cobalt'] },
  },
  meadow: {
    name: 'Meadow', mood: 'Warm and rustic. Rounded old-style serif, oat and olive, honest and generous. For barns, farm stays and shepherd’s huts.',
    suits: ['barn', 'farm', 'hut', 'cottage', 'any'], font: 'young', palette: 'meadow',
    fonts: { display: 'Young Serif', text: 'Work Sans', href: 'family=Young+Serif&family=Work+Sans:wght@400;500;600' },
    disp: { weight: 400, track: '-0.02em', lead: 1.02, italic: false, case: 'none', scale: 0.92 },
    pal: { bg: '#F5F0E4', bg2: '#EAE3D2', ink: '#2B281D', muted: '#5E5948', line: '#D9D0BB', accent: '#5E6E2E', accentInk: '#FFFFFF', deep: '#2F3322', deepInk: '#F5F0E4' },
    shape: { radius: 10, button: 999, image: 10 }, heroes: ['split', 'mosaic', 'cinematic'], texture: 'paper', alts: { fonts: ['caslon', 'gloock'], palettes: ['ochre', 'sage'] },
  },
  sunlit: {
    name: 'Sunlit', mood: 'Bright and joyful. Chunky editorial serif, cream and tomato with a teal counterpoint. For family stays, seaside and summer.',
    suits: ['beach', 'family', 'cottage', 'any'], font: 'gloock', palette: 'sunlit',
    fonts: { display: 'Gloock', text: 'Outfit', href: 'family=Gloock&family=Outfit:wght@400;500;600' },
    disp: { weight: 400, track: '-0.025em', lead: 0.98, italic: false, case: 'none', scale: 0.98 },
    pal: { bg: '#FFF8EE', bg2: '#FBEBD7', ink: '#221E1A', muted: '#5D554C', line: '#EAD9C2', accent: '#C2461C', accentInk: '#FFFFFF', deep: '#1F4F52', deepInk: '#FFF8EE' },
    shape: { radius: 18, button: 999, image: 18 }, heroes: ['split', 'mosaic', 'cinematic'], texture: 'none', alts: { fonts: ['abril', 'bricolage'], palettes: ['riviera', 'ochre'] },
  },  nordic: {
    name: 'Nordic', mood: 'Scandinavian calm. A slim modern serif, birch white and charcoal, a lingonberry accent, lots of air. For lodges, cabins and minimalist homes.',
    suits: ['cabin', 'lodge', 'modern', 'any'], font: 'instrument', palette: 'birch',
    shape: { radius: 6, button: 6, image: 6 }, heroes: ['centered', 'framed', 'split'], texture: 'none', alts: { fonts: ['newsreader', 'space'], palettes: ['sage', 'mono'] },
  },
  riviera: {
    name: 'Riviera', mood: 'Glamorous and sunny. A Playfair serif, warm white with navy and coral. For sea-view apartments and smart coastal homes.',
    suits: ['beach', 'apartment', 'luxury', 'any'], font: 'playfair', palette: 'riviera',
    shape: { radius: 0, button: 999, image: 0 }, heroes: ['arch', 'framed', 'editorial'], texture: 'none', alts: { fonts: ['bodoni', 'marcellus'], palettes: ['harbour', 'blush'] },
  },
  atelier: {
    name: 'Atelier', mood: 'Playful and contemporary. A friendly characterful grotesque, chalk and cobalt, rounded shapes. For design-led homes, city flats and younger guests.',
    suits: ['modern', 'apartment', 'family', 'any'], font: 'bricolage', palette: 'cobalt',
    shape: { radius: 22, button: 999, image: 26 }, heroes: ['framed', 'mosaic', 'centered'], texture: 'none', alts: { fonts: ['unbounded', 'space'], palettes: ['blush', 'ochre'] },
  },
  manor: {
    name: 'Country House', mood: 'Traditional and grand. Caslon headlines, cream and racing green, a claret accent. For manors, rectories, farmhouses and big group houses.',
    suits: ['farm', 'townhouse', 'luxury', 'any'], font: 'caslon', palette: 'heritage',
    shape: { radius: 0, button: 0, image: 0 }, heroes: ['editorial', 'centered', 'arch'], texture: 'paper', alts: { fonts: ['cormorant', 'newsreader'], palettes: ['georgian', 'pine'] },
  },
  saltmarsh: {
    name: 'Salt & Sage', mood: 'Soft and restorative. A carved classical face, sage and sand, deep teal. For spa breaks, wellness retreats and estuary cottages.',
    suits: ['beach', 'cottage', 'luxury', 'any'], font: 'marcellus', palette: 'sage',
    shape: { radius: 10, button: 999, image: 18 }, heroes: ['arch', 'split', 'centered'], texture: 'paper', alts: { fonts: ['instrument', 'cormorant'], palettes: ['birch', 'harbour'] },
  },
  ember: {
    name: 'Ember', mood: 'Dark, warm and cosy. A bookish serif on deep brown, amber light. For cabins with hot tubs, winter breaks and romantic hideaways.',
    suits: ['cabin', 'lodge', 'luxury', 'hut', 'any'], font: 'newsreader', palette: 'ember',
    shape: { radius: 4, button: 4, image: 4 }, heroes: ['cinematic', 'framed', 'centered'], texture: 'grain', alts: { fonts: ['fraunces', 'cormorant'], palettes: ['pine', 'midnight'] },
  },
};

// Fill in the font and palette details for directions that name a pairing and palette instead of spelling them out.
for (const d of Object.values(DIRECTIONS)) {
  const f = FONTS[d.font], pl = PALETTES[d.palette];
  if (!d.fonts) d.fonts = { display: f.display, text: f.text, href: f.href };
  if (!d.disp) d.disp = Object.assign({ italic: true }, f.disp);
  if (!d.pal) d.pal = pl.pal;
  if (pl.dark) d.dark = true;
}

// Which layouts exist for each section. The AI picks from these; anything else is ignored.
const SECTIONS = {
  hero: ['cinematic', 'split', 'editorial', 'mosaic', 'centered', 'framed', 'arch', 'type'],
  facts: ['ruled', 'tiles', 'inline'],
  story: ['lede', 'pull', 'photo'],
  highlights: ['numbered', 'panels', 'cards'],
  gallery: ['grid', 'strip', 'masonry'],
  amenities: ['columns', 'tiles'],
  reviews: ['wall', 'feature', 'band', 'cards'],
  area: ['itinerary', 'cards'],
  host: ['note', 'centered'],
  book: ['panel', 'centered'],
  faq: ['accordion', 'columns', 'centered'],
  closing: ['banner', 'split', 'minimal'],
};
// Plain-English names for the layouts, shown in the console.
const VARIANT_NAMES = {
  cinematic: 'Cinematic', split: 'Split', editorial: 'Editorial', mosaic: 'Mosaic', centered: 'Centred', framed: 'Framed', arch: 'Arch', type: 'Type-led',
  ruled: 'Ruled row', tiles: 'Tiles', inline: 'One line', lede: 'Lede', pull: 'Pull quote', photo: 'With photo', numbered: 'Numbered', panels: 'Photo panels', cards: 'Cards',
  grid: 'Grid', strip: 'Scrolling strip', masonry: 'Masonry', columns: 'Columns', wall: 'Wall', feature: 'Featured quote', band: 'Colour band', itinerary: 'Itinerary',
  note: 'Note', panel: 'Dark panel', accordion: 'Accordion', banner: 'Photo banner', minimal: 'Minimal',
};
// Page templates: a whole-page layout in one click. Each sets the layout of every section (and can move the
// gallery up). Hosts can still change any single section afterwards.
const TEMPLATES = {
  classic: { name: 'Classic', note: 'Balanced and familiar', v: { hero: 'split', facts: 'ruled', story: 'lede', highlights: 'numbered', gallery: 'grid', amenities: 'columns', reviews: 'wall', area: 'itinerary', host: 'note', book: 'panel', faq: 'accordion', closing: 'banner' } },
  magazine: { name: 'Magazine', note: 'Huge type, long-read feel', v: { hero: 'editorial', facts: 'inline', story: 'pull', highlights: 'panels', gallery: 'strip', amenities: 'columns', reviews: 'feature', area: 'itinerary', host: 'note', book: 'panel', faq: 'columns', closing: 'split' } },
  showcase: { name: 'Photo showcase', note: 'Photos first, then the story', gallery: 2, v: { hero: 'mosaic', facts: 'tiles', story: 'photo', highlights: 'cards', gallery: 'masonry', amenities: 'tiles', reviews: 'cards', area: 'cards', host: 'centered', book: 'centered', faq: 'accordion', closing: 'banner' } },
  minimal: { name: 'Minimal', note: 'Quiet, centred, lots of air', v: { hero: 'centered', facts: 'inline', story: 'lede', highlights: 'numbered', gallery: 'grid', amenities: 'tiles', reviews: 'feature', area: 'itinerary', host: 'centered', book: 'centered', faq: 'centered', closing: 'minimal' } },
  bold: { name: 'Bold', note: 'Full-bleed and high contrast', v: { hero: 'cinematic', facts: 'tiles', story: 'pull', highlights: 'cards', gallery: 'masonry', amenities: 'tiles', reviews: 'band', area: 'cards', host: 'centered', book: 'panel', faq: 'accordion', closing: 'banner' } },
  boutique: { name: 'Boutique', note: 'Framed photos, soft and refined', v: { hero: 'arch', facts: 'ruled', story: 'photo', highlights: 'panels', gallery: 'strip', amenities: 'columns', reviews: 'band', area: 'cards', host: 'note', book: 'centered', faq: 'centered', closing: 'split' } },
  cosy: { name: 'Cosy', note: 'Framed hero, warm and friendly', v: { hero: 'framed', facts: 'tiles', story: 'lede', highlights: 'cards', gallery: 'grid', amenities: 'columns', reviews: 'cards', area: 'itinerary', host: 'centered', book: 'panel', faq: 'accordion', closing: 'minimal' } },
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
function palette(dir, accent, palKey) {
  const d0 = DIRECTIONS[dir] || DIRECTIONS.linen; const pre = palKey && PALETTES[palKey];
  const d = pre ? { pal: pre.pal, dark: !!pre.dark } : d0; const p = Object.assign({}, d.pal);
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

// A small, stable hash, so the same home always gets the same "random" choices.
function seed(str) { let h = 0x811c9dc5; for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; } return h; }

// Clean a style object from anywhere (the AI, the console): unknown keys and values are dropped.
function cleanStyle(x) {
  const o = {}; x = x || {};
  if (FONTS[x.font]) o.font = x.font;
  if (PALETTES[x.palette]) o.palette = x.palette;
  for (const k of Object.keys(STYLE)) if (STYLE[k][x[k]]) o[k] = x[k];
  return o;
}

// Everything the renderer needs to draw a spec: the direction with the host's style choices applied on top.
function look(spec) {
  spec = spec || {};
  const dir = DIRECTIONS[spec.direction] ? spec.direction : 'linen', d = DIRECTIONS[dir], st = cleanStyle(spec.style);
  const font = FONTS[st.font] ? Object.assign({ italic: true }, FONTS[st.font], { disp: Object.assign({ italic: true }, FONTS[st.font].disp) }) : { display: d.fonts.display, text: d.fonts.text, href: d.fonts.href, disp: d.disp };
  const disp = Object.assign({}, font.disp);
  if (st.headings === 'sentence') disp.case = 'none';
  if (st.headings === 'upper') { disp.case = 'uppercase'; disp.scale = disp.scale * 0.82; disp.track = '0.01em'; }
  disp.scale = +(disp.scale * ({ quiet: 0.86, loud: 1.14 }[st.scale] || 1)).toFixed(3);
  const palKey = st.palette || null; const dark = palKey ? !!PALETTES[palKey].dark : !!d.dark;
  const shape = st.corners ? STYLE.corners[st.corners] : d.shape;
  return {
    dir, d, style: st, fonts: { display: font.display, text: font.text, href: font.href }, disp, italicHead: st.headings === 'italic',
    pal: palette(dir, spec.accent, palKey), dark, shape, texture: st.texture || d.texture,
    spacing: { compact: 0.7, airy: 1.3 }[st.spacing] || 1, buttons: st.buttons || 'solid', nav: st.nav || 'classic', images: st.images || 'plain', bands: st.bands || 'soft',
  };
}

// A style that is different from the looks already used, from the direction's own alternatives first.
// used: [{direction, style}] of the host's other homes. n: how many times they have asked for another look.
function varyStyle(dir, key, used, n) {
  const d = DIRECTIONS[dir] || DIRECTIONS.linen; const h = seed(key + ':' + (n || 0));
  const pick = (arr, salt) => arr[(h >>> salt) % arr.length];
  const same = (used || []).filter(u => u && u.direction === dir);
  const style = {};
  // the first home in a direction keeps its signature fonts and colours; the next ones get the alternates
  if (same.length || n) {
    const fonts = [d.font].concat(d.alts.fonts).filter(f => !same.some(u => ((u.style || {}).font || d.font) === f));
    const pals = [d.palette].concat(d.alts.palettes).filter(p => !same.some(u => ((u.style || {}).palette || d.palette) === p));
    const f = fonts.length ? pick(fonts, 3) : pick(d.alts.fonts, 3), p = pals.length ? pick(pals, 7) : pick(d.alts.palettes, 7);
    if (f !== d.font) style.font = f; if (p !== d.palette) style.palette = p;
  }
  style.spacing = pick(['regular', 'airy', 'regular', 'compact'], 11);
  style.nav = pick(['classic', 'centered', 'classic', 'minimal'], 13);
  style.images = pick(['plain', 'plain', 'framed', 'shadow'], 17);
  style.bands = pick(['soft', 'flat', 'soft', 'bold'], 19);
  if (h % 5 === 0) style.buttons = 'outline';
  return cleanStyle(style);
}

// Design QA: the checks every generated site has to pass before it can be published. Returns [{ok, label, fix}].
function qa(spec, facts) {
  const p = palette(spec.direction, spec.accent, (spec.style || {}).palette); const c = spec.copy || {};
  const words = s => String(s || '').trim().split(/\s+/).filter(Boolean).length;
  const all = JSON.stringify(c).toLowerCase();
  const found = CLICHES.filter(x => all.includes(x));
  const types = (spec.sections || []).map(s => s.type);
  const imgHero = ['cinematic', 'split', 'mosaic', 'editorial', 'centered', 'framed', 'arch'].includes((spec.sections.find(s => s.type === 'hero') || {}).variant);
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

module.exports = { PRINCIPLES, CLICHES, DIRECTIONS, FONTS, PALETTES, STYLE, STYLE_KEYS, SECTIONS, VARIANT_NAMES, TEMPLATES, ORDER, REQUIRED, palette, contrast, mix, hexOk, qa, look, cleanStyle, varyStyle, seed };
