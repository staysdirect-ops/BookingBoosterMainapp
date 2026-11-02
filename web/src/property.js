/* Bookingbooster prototype: property website template. The direct booking site Bookingbooster builds for each home
   (for example laurelridgecabin.com). Everything comes from the property record, so console edits show here at once.
   Views inside the instance: site (home page), checkout, done (confirmation or request sent). */
(function () {
  const BB = window.BB, D = BB.D, esc = BB.esc, money = BB.money, S = () => BB.store.get();

  /* ---------- small helpers ---------- */
  const THEMES = ['cabin', 'lake', 'city'];
  const ACCENT = { cabin: '#2F5D46', lake: '#0F6E8C', city: '#E4573D' };
  const themeOf = p => THEMES.includes(p.theme) ? p.theme : (p.theme === 'coast' ? 'lake' : (p.theme === 'loft' ? 'city' : 'cabin'));
  const monogram = name => { const w = String(name || 'Home').split(/\s+/).filter(x => x && !/^(the|on|at|of|and|&)$/i.test(x)); return ((w[0] || 'H')[0] + ((w[1] || '')[0] || '')).toUpperCase(); };
  const inkFor = hex => { const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '')); if (!m) return '#fff'; const n = parseInt(m[1], 16); const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.62 ? '#141414' : '#ffffff'; };
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const firstName = s => String(s || '').split(' ')[0];
  const nightsBetween = (a, b) => (a && b ? D.diff(a, b) : 0);

  // Fill in anything a freshly onboarded home might be missing.
  function view(p) {
    const theme = themeOf(p);
    const area = p.area || (p.address ? p.address.split(',').slice(1).join(',').trim() : '') || 'the area';
    const beds = p.bedrooms || 1, sleeps = p.maxGuests || 2;
    return Object.assign({}, p, {
      theme, area,
      short: p.short || String(p.name || 'Home').split(' ').slice(0, 2).join(' '),
      domain: p.domain || (S().live && typeof location !== 'undefined' ? location.host : '') || String(p.name || 'home').toLowerCase().replace(/[^a-z0-9]+/g, '') + '.co.uk',
      headline: p.headline || 'Book direct and save.',
      sub: p.sub || [plural(beds, 'bedroom'), 'sleeps ' + sleeps, area].filter(Boolean).join(' · '),
      about: p.about || ('A ' + beds + '-bedroom home in ' + area + ' for up to ' + sleeps + ' guests. Book here to skip the platform fees and talk to your host directly.'),
      amenities: (p.amenities && p.amenities.length) ? p.amenities : (S().live ? [] : ['Fast Wi-Fi', 'Self check-in', 'Free parking']),
      rules: (p.rules && p.rules.length) ? p.rules : ['Quiet hours are 10 pm to 8 am.', 'No parties or events.'],
      address: p.address || area,
      checkinTime: p.checkinTime || '4 pm', checkoutTime: p.checkoutTime || '11 am',
      minNights: p.minNights || 1, maxGuests: sleeps, bedrooms: beds, baths: p.baths || 1,
      rating: p.reviews ? (p.rating || 0) : 0, reviews: p.reviews || 0,
      accent: /^#[0-9a-f]{6}$/i.test(p.color || '') ? p.color : ACCENT[theme],
      parking: p.parking || 'On site',
    });
  }

  /* ---------- illustrated scenes, drawn from CSS shapes ---------- */
  const R = (l, b, w, h, bg, x) => '<i style="left:' + l + '%;bottom:' + b + '%;width:' + w + '%;height:' + h + '%;background:' + bg + ';' + (x || '') + '"></i>';
  const C = (l, b, w, bg, x) => '<i style="left:' + l + '%;bottom:' + b + '%;width:' + w + '%;aspect-ratio:1;border-radius:50%;background:' + bg + ';' + (x || '') + '"></i>';
  const P = (l, b, w, h, bg, clip, x) => R(l, b, w, h, bg, 'clip-path:' + clip + ';' + (x || ''));
  const TRI = 'polygon(50% 0,100% 100%,0 100%)';
  const T = (l, b, w, h, c) => P(l, b, w, h, c || '#1E3328', TRI);
  const STARS = 'radial-gradient(circle at 8% 22%,#fff 0 1px,transparent 1.6px),radial-gradient(circle at 23% 9%,#fff 0 1px,transparent 1.6px),radial-gradient(circle at 37% 30%,#fff 0 .8px,transparent 1.4px),radial-gradient(circle at 52% 14%,#fff 0 1.2px,transparent 1.8px),radial-gradient(circle at 63% 35%,#fff 0 .8px,transparent 1.4px),radial-gradient(circle at 86% 18%,#fff 0 1px,transparent 1.6px),radial-gradient(circle at 93% 40%,#fff 0 .8px,transparent 1.4px),radial-gradient(circle at 15% 45%,#fff 0 .8px,transparent 1.4px),radial-gradient(circle at 45% 48%,#fff 0 .7px,transparent 1.3px),radial-gradient(circle at 77% 6%,#fff 0 .9px,transparent 1.5px)';

  // Lake District, Cornish harbour and Bath helpers
  const FELL = (b, h, c, clip) => P(0, b, 100, h, c, clip);
  const WALL = (l, b, w, h) => R(l, b, w, h, '#8E8B80', 'border-radius:3px 3px 0 0;background-image:repeating-linear-gradient(90deg,#9C998D 0 7px,#7F7C72 7px 9px),linear-gradient(#A7A397,#7F7C72)');
  const LARCH = (l, b, w, h, c) => T(l, b, w, h, c || '#C9993D') + R(l + w / 2 - .4, b - 2, .8, 3, '#4A3527');
  const COTT = (l, b, w, h, roof, win) => R(l, b, w, h, '#F4F1EA') + P(l - .6, b + h - .2, w + 1.2, h * .55, roof || '#4C5562', 'polygon(12% 0,88% 0,100% 100%,0 100%)') +
    R(l + w * .2, b + h * .3, w * .2, h * .3, win || '#5C7C8C') + R(l + w * .6, b + h * .3, w * .2, h * .3, win || '#5C7C8C');
  const BOAT = (l, b, w, hull, sail) => P(l, b, w, w * .5, hull, 'polygon(0 0,100% 0,82% 100%,18% 100%)') + R(l + w * .48, b + w * .5 - .2, .5, w * 1.4, '#3A3A3A') + (sail ? P(l + w * .52, b + w * .6, w * .4, w * 1.1, sail, 'polygon(0 0,100% 100%,0 100%)') : '');
  const STONE = '#D9B97E';
  const TERR = (l, b, w, h, base, glass) => R(l, b, w, h, base, 'background-image:repeating-linear-gradient(0deg,' + base + ' 0 12px,transparent 12px 38px),repeating-linear-gradient(90deg,' + base + ' 0 14px,' + glass + ' 14px 26px)');
  const SASH = (l, b, w, h, glass) => R(l, b, w, h, '#DCE8EC', 'border:5px solid #F7F2E8;box-sizing:border-box;background-image:linear-gradient(90deg,transparent calc(50% - 1.5px),#F7F2E8 calc(50% - 1.5px) calc(50% + 1.5px),transparent calc(50% + 1.5px)),repeating-linear-gradient(0deg,transparent 0 calc(33.3% - 2px),#F7F2E8 calc(33.3% - 2px) 33.3%),' + glass);
  const SEA = 'linear-gradient(#3F8FA6,#1E5E73)', RIPPLE = 'repeating-linear-gradient(180deg,rgba(255,255,255,.18) 0 2px,transparent 2px 13px)';
  const ROUNDFELLS = 'polygon(0 100%,0 55%,8% 38%,18% 30%,28% 42%,38% 22%,48% 10%,58% 24%,66% 40%,76% 28%,86% 18%,94% 30%,100% 40%,100% 100%)';
  const NEARFELLS = 'polygon(0 100%,0 40%,12% 25%,26% 35%,40% 60%,54% 45%,66% 30%,80% 42%,92% 58%,100% 50%,100% 100%)';

  const SCENES = {
    cabin: [
      ['Larch Fell above the Troutbeck valley', 'linear-gradient(180deg,#A9C4D3 0%,#E7E3D3 60%)', () =>
        C(72, 66, 8, '#FFE9B8', 'box-shadow:0 0 60px 20px rgba(255,233,184,.5)') +
        FELL(40, 30, '#8C9B95', ROUNDFELLS) + R(20, 39, 46, 3, 'linear-gradient(90deg,transparent,#B9D0D8 15%,#B9D0D8 85%,transparent)', 'border-radius:50%') +
        FELL(30, 26, '#7D8C62', NEARFELLS) +
        R(0, 0, 100, 33, 'linear-gradient(#6E8752,#4E6640)') + WALL(0, 26, 100, 1.6) + WALL(0, 14, 34, 1.8) + WALL(70, 14, 30, 1.8) +
        LARCH(3, 16, 7, 30) + LARCH(9, 15, 8, 38, '#B8862F') + LARCH(16, 18, 5, 24, '#5E7A3E') + LARCH(80, 15, 8, 36) + LARCH(87, 14, 9, 42, '#B8862F') + LARCH(94, 18, 5, 26, '#5E7A3E') +
        R(58, 33, 2.6, 7, '#3A2A20') + R(39, 12, 26, 17, '#5A4232', 'background-image:repeating-linear-gradient(90deg,#5A4232 0 9px,#4C382A 9px 10px)') +
        P(36, 27, 32, 15, '#3B3F44', TRI) + R(44, 15, 6, 7, '#FFD27A', 'box-shadow:0 0 22px 4px rgba(255,196,90,.7)') + R(54, 12, 4, 10, '#2A1E16') + R(36, 10, 32, 2.4, '#3A2A20')],
      ['Sitting room and wood burner', 'linear-gradient(#ECE2D0,#E2D4BC)', () =>
        R(14, 36, 42, 50, 'linear-gradient(180deg,#A9C4D3,#E7E3D3 52%,#6E8752 52%)') + P(14, 56, 42, 16, '#8C9B95', 'polygon(0 100%,0 60%,20% 30%,40% 50%,62% 10%,84% 40%,100% 30%,100% 100%)') +
        R(14, 36, 42, 50, 'transparent', 'border:6px solid #5A4232;box-sizing:border-box') + R(34.6, 36, .9, 50, '#5A4232') + R(14, 60, 42, .9, '#5A4232') +
        R(74, 50, 2.4, 50, '#26262A') + R(67, 22, 16, 28, '#26262A', 'border-radius:4px 4px 2px 2px') + R(69.5, 26, 11, 15, '#141416', 'border-radius:3px') +
        P(72, 26, 6, 10, 'linear-gradient(#FFE29A,#E8743A)', 'polygon(50% 0,75% 45%,100% 100%,0 100%,25% 45%)', 'filter:drop-shadow(0 0 10px #FFB65A)') +
        R(64, 18, 22, 4, '#7F7C72') + R(86, 22, 8, 14, '#8A6A4E', 'background-image:repeating-linear-gradient(0deg,#8A6A4E 0 5px,#6E5440 5px 7px)') +
        R(0, 0, 100, 22, 'linear-gradient(#9A7350,#7E5C40)') + R(14, 4, 44, 10, '#C98A3D', 'border-radius:50%;opacity:.7') +
        R(10, 22, 46, 12, '#3D5A48', 'border-radius:12px 12px 4px 4px') + R(8, 16, 50, 9, '#476B55', 'border-radius:8px') + R(16, 24, 9, 6, '#E8D5B0', 'border-radius:6px')],
      ['Hot tub on the deck at dusk', 'linear-gradient(180deg,#2C3550 0%,#8B6C83 40%,#E9A97A 62%)', () =>
        C(16, 72, 4, '#F4F0E0') + FELL(28, 26, '#3D4256', ROUNDFELLS) +
        LARCH(2, 28, 8, 34, '#1E2A22') + LARCH(9, 28, 10, 44, '#1A241D') + LARCH(78, 28, 10, 42, '#1A241D') + LARCH(88, 28, 9, 32, '#1E2A22') +
        R(0, 28, 100, 2, '#3A2A20') + R(6, 30, 1.2, 10, '#3A2A20') + R(24, 30, 1.2, 10, '#3A2A20') + R(74, 30, 1.2, 10, '#3A2A20') + R(92, 30, 1.2, 10, '#3A2A20') + R(0, 39, 100, 1.4, '#3A2A20') +
        R(0, 0, 100, 29, 'repeating-linear-gradient(90deg,#7A5A40 0 9%,#694C36 9% 10%)') +
        R(22, 12, 56, 22, '#4A3527', 'border-radius:50%') + R(26, 19, 48, 12, 'linear-gradient(#8FD3DE,#4E9AAB)', 'border-radius:50%;box-shadow:0 0 30px rgba(143,211,222,.6)') +
        C(34, 32, 9, 'rgba(255,255,255,.28)', 'filter:blur(6px)') + C(46, 38, 11, 'rgba(255,255,255,.22)', 'filter:blur(8px)') + C(57, 33, 8, 'rgba(255,255,255,.25)', 'filter:blur(6px)')],
      ['Clear skies over the fells', 'linear-gradient(180deg,#121933 0%,#2E3B66 70%)', () =>
        R(0, 30, 100, 70, 'transparent', 'background-image:' + STARS) + C(74, 68, 7, '#F4F0E0', 'box-shadow:0 0 40px 10px rgba(244,240,224,.25)') +
        FELL(28, 32, '#262F4C', ROUNDFELLS) + R(0, 0, 100, 30, 'linear-gradient(#1A2620,#0E1612)') + WALL(0, 24, 100, 1.4) +
        LARCH(6, 16, 8, 38, '#0B130E') + LARCH(84, 16, 9, 42, '#0B130E') +
        R(35, 12, 30, 19, '#2A2019') + P(32, 29, 36, 16, '#16181C', TRI) + R(40, 16, 6, 8, '#FFD27A', 'box-shadow:0 0 26px 8px rgba(255,196,90,.55)') + R(54, 16, 6, 8, '#FFD27A', 'box-shadow:0 0 26px 8px rgba(255,196,90,.55)') +
        R(30, 0, 40, 12, 'radial-gradient(ellipse at 50% 0,rgba(255,196,90,.3),transparent 70%)')],
      ['The beck path from the back gate', 'linear-gradient(180deg,#D3E0D6 0%,#F0ECDF 55%)', () =>
        FELL(36, 24, '#A3AE9A', ROUNDFELLS) + LARCH(-2, 30, 12, 40, '#D3A75A') + LARCH(10, 30, 10, 34, '#C9993D') + LARCH(64, 30, 12, 42, '#D3A75A') + LARCH(78, 30, 10, 32, '#C9993D') +
        R(0, 0, 100, 34, 'linear-gradient(#7E9563,#5A7346)') + P(56, 0, 44, 34, 'linear-gradient(#A9CFD8,#5E9AAB)', 'polygon(36% 0,46% 0,100% 70%,100% 100%,55% 100%)') +
        C(78, 10, 4, '#9C998D') + C(86, 20, 3, '#8E8B80') + P(22, 0, 34, 34, '#C9B28A', 'polygon(55% 0,62% 0,100% 100%,0 100%)') + WALL(0, 22, 40, 2.4) +
        LARCH(2, 4, 12, 58, '#B8862F') + LARCH(12, 0, 14, 72, '#4E6B3A') + LARCH(82, 2, 14, 66, '#B8862F')],
    ],
    lake: [
      ['Tidewater from across the harbour', 'linear-gradient(180deg,#9CCBDD 0%,#E8F1F2 56%)', () =>
        C(78, 66, 7, '#FFF4D8', 'box-shadow:0 0 50px 16px rgba(255,244,216,.6)') +
        P(0, 40, 100, 30, '#7E9F86', 'polygon(0 100%,0 30%,18% 12%,40% 0,60% 14%,78% 30%,100% 44%,100% 100%)') +
        COTT(6, 50, 9, 8, '#46505C') + COTT(17, 54, 8, 7, '#3F4955') + COTT(27, 51, 10, 9, '#46505C') + COTT(40, 56, 8, 7, '#3F4955') + COTT(50, 52, 9, 8, '#46505C') +
        COTT(14, 42, 10, 9, '#3F4955', '#E9C46A') + COTT(30, 42, 11, 10, '#46505C') + COTT(46, 42, 9, 8, '#3F4955') + COTT(60, 44, 8, 7, '#46505C') +
        R(0, 0, 100, 42, SEA) + R(0, 0, 100, 42, RIPPLE) + R(76, 6, 9, 34, 'linear-gradient(rgba(255,244,216,.5),transparent)') +
        R(62, 24, 38, 7, '#A39E92', 'border-radius:6px 0 0 6px;background-image:repeating-linear-gradient(90deg,#ADA89B 0 10px,#948F84 10px 12px)') + R(90, 31, 3.4, 10, '#F4F1EA') + P(89.6, 40.6, 4.2, 3, '#4C5562', TRI) +
        BOAT(18, 16, 9, '#E0875E', '#F7F2E8') + BOAT(36, 10, 7, '#1F4E63') + BOAT(50, 18, 6, '#F4F1EA', '#F2C14E')],
      ['Sitting room with the sea view', 'linear-gradient(#F5F2EC,#EDE7DD)', () =>
        R(18, 32, 48, 52, 'linear-gradient(180deg,#BFDDE8 0 52%,#3F8FA6 52%,#1E5E73)') + P(18, 58, 30, 8, '#7E9F86', 'polygon(0 100%,0 40%,40% 0,100% 60%,100% 100%)') + BOAT(46, 46, 6, '#E0875E', '#F7F2E8') +
        R(18, 32, 48, 52, 'transparent', 'border:7px solid #FFFFFF;box-sizing:border-box;box-shadow:0 0 0 1px #DDD5C8') + R(41.5, 32, 1.2, 52, '#FFFFFF') +
        R(0, 0, 100, 20, 'linear-gradient(#CDBA9F,#B8A385)') + R(14, 4, 52, 9, '#E9DECD', 'border-radius:50%') +
        R(22, 14, 40, 9, '#E0875E', 'border-radius:10px 10px 3px 3px') + R(20, 10, 44, 7, '#CF774E', 'border-radius:6px') + R(28, 20, 9, 6, '#F7F2E8', 'border-radius:5px') +
        R(74, 60, 18, 1.6, '#8A6A4E') + R(76, 62, 3, 7, '#1F4E63', 'border-radius:2px') + R(80, 62, 4, 5, '#E9C46A', 'border-radius:50% 50% 2px 2px') + R(76, 10, 6, 12, '#3A3330', 'border-radius:3px') + C(73, 20, 12, '#3E7A5E')],
      ['Kayaks by the harbour steps', 'linear-gradient(180deg,#CBE5EE 0%,#E9F3F5 30%)', () =>
        P(0, 64, 60, 14, '#7E9F86', 'polygon(0 100%,0 30%,40% 0,80% 40%,100% 100%)') + R(0, 0, 100, 66, SEA) + R(0, 0, 100, 66, RIPPLE) +
        R(0, 0, 100, 24, 'linear-gradient(#E9D7B4,#D9C399)') + P(0, 0, 42, 46, '#A39E92', 'polygon(0 0,60% 0,100% 100%,0 100%)', 'background-image:repeating-linear-gradient(0deg,#ADA89B 0 14px,#8F8A7F 14px 16px)') +
        R(46, 14, 16, 5, '#E0875E', 'border-radius:50%;transform:rotate(-8deg)') + R(48.5, 15.6, 11, 1.6, '#8A3F22', 'border-radius:50%;transform:rotate(-8deg)') +
        R(66, 10, 15, 4.4, '#F2C14E', 'border-radius:50%;transform:rotate(6deg)') + R(68.5, 11.4, 10, 1.4, '#8A6A1C', 'border-radius:50%;transform:rotate(6deg)') +
        BOAT(70, 40, 8, '#F4F1EA', '#E0875E') + BOAT(30, 50, 5, '#1F4E63')],
      ['Sunset over the bay to Godrevy', 'linear-gradient(180deg,#6C7FA6 0%,#F4A97F 45%,#FBD9B4 58%)', () =>
        C(42, 30, 16, '#FFE3B0', 'box-shadow:0 0 80px 30px rgba(255,210,150,.6)') +
        P(0, 40, 30, 12, '#4E5E6A', 'polygon(0 100%,0 10%,50% 0,100% 100%)') + P(70, 40, 12, 4, '#4E5E6A', 'polygon(0 100%,30% 0,70% 0,100% 100%)') + R(75, 44, 1.6, 5, '#F4F1EA') +
        R(0, 0, 100, 41, 'linear-gradient(#D89A80,#2F6E80)') + R(44, 6, 12, 34, 'repeating-linear-gradient(180deg,rgba(255,227,176,.75) 0 3px,transparent 3px 10px)') +
        BOAT(20, 18, 7, '#2A2A32', '#3A3A44') + R(0, 0, 100, 10, 'linear-gradient(transparent,rgba(20,40,50,.35))')],
      ['Fire pit on the terrace', 'linear-gradient(180deg,#2B3A55 0%,#8C6F7E 45%,#D79A7E 60%)', () =>
        R(0, 36, 100, 12, 'linear-gradient(#5E7F94,#355A70)') + P(0, 46, 40, 10, '#3B4A5A', 'polygon(0 100%,0 20%,60% 0,100% 100%)') +
        R(0, 0, 100, 37, 'linear-gradient(#5A5650,#3E3B37)', 'background-image:repeating-linear-gradient(90deg,#5A5650 0 14%,#4E4A45 14% 14.6%)') + R(0, 34, 100, 3, '#F4F1EA') +
        R(28, 4, 44, 30, 'radial-gradient(ellipse at 50% 70%,rgba(255,170,90,.45),transparent 65%)') +
        R(42, 12, 16, 5, '#2F2F2F', 'border-radius:50%') + P(45.5, 15, 9, 13, 'linear-gradient(#FFE29A,#E8743A)', 'polygon(50% 0,70% 40%,85% 20%,100% 100%,0 100%,15% 25%,30% 45%)', 'filter:drop-shadow(0 0 12px #FFA24A)') +
        R(18, 10, 12, 14, '#E0875E', 'border-radius:4px 4px 0 0;transform:skewX(-8deg)') + R(16, 6, 16, 5, '#C9744C', 'border-radius:2px') +
        R(70, 10, 12, 14, '#F2C14E', 'border-radius:4px 4px 0 0;transform:skewX(8deg)') + R(68, 6, 16, 5, '#D4A63A', 'border-radius:2px')],
    ],
    city: [
      ['Pulteney Bridge and the weir', 'linear-gradient(180deg,#B9D6E6 0%,#F4EFE4 62%)', () =>
        P(0, 50, 100, 14, '#93A88A', 'polygon(0 100%,0 40%,25% 10%,50% 30%,75% 0,100% 30%,100% 100%)') +
        TERR(0, 40, 30, 22, '#E2C690', '#7D8A92') + R(0, 61, 30, 2, '#CFAF73') + TERR(70, 40, 30, 24, '#E2C690', '#7D8A92') + R(70, 63, 30, 2, '#CFAF73') +
        R(0, 22, 100, 19, 'linear-gradient(#C9B07C,#A89062)') + C(1, 24, 7, '#6F8A5A') + C(6, 26, 6, '#5E7A4C') + C(12, 23, 7, '#6F8A5A') + C(80, 24, 7, '#6F8A5A') + C(86, 26, 6, '#5E7A4C') + C(92, 23, 7, '#6F8A5A') +
        TERR(22, 34, 56, 22, STONE, '#6E7F8C') + R(21, 55, 58, 2.6, '#C8A66A') + P(44, 57, 12, 6, '#C8A66A', TRI) + R(28, 57, 3, 5, '#C8A66A') + R(69, 57, 3, 5, '#C8A66A') +
        R(22, 22, 56, 13, STONE) + R(27, 22, 12, 9, 'linear-gradient(#5E8FA2,#3F7186)', 'border-radius:50% 50% 0 0/80% 80% 0 0') + R(44, 22, 12, 9, 'linear-gradient(#5E8FA2,#3F7186)', 'border-radius:50% 50% 0 0/80% 80% 0 0') + R(61, 22, 12, 9, 'linear-gradient(#5E8FA2,#3F7186)', 'border-radius:50% 50% 0 0/80% 80% 0 0') +
        R(0, 0, 100, 23, 'linear-gradient(#5E8FA2,#2F6176)') + P(0, 4, 100, 10, 'repeating-linear-gradient(90deg,rgba(255,255,255,.7) 0 2%,rgba(255,255,255,.25) 2% 4%)', 'polygon(0 30%,50% 100%,100% 30%,100% 60%,50% 130%,0 60%)') +
        R(0, 0, 100, 23, RIPPLE)],
      ['Bedroom with tall sash windows', 'linear-gradient(#EFE6D6,#E6DAC5)', () =>
        SASH(54, 30, 24, 60, 'linear-gradient(#CFE2EA,#F4EFE4)') + R(52, 28, 28, 2.6, '#F7F2E8') +
        R(0, 0, 100, 14, 'linear-gradient(#8A6A4E,#6F5440)') + R(8, 14, 40, 24, '#3E4A5A', 'border-radius:6px 6px 0 0') + R(6, 8, 46, 14, '#F7F3EC', 'border-radius:4px') +
        R(24, 8, 28, 14, '#E4573D', 'border-radius:4px 2px 2px 4px') + R(10, 20, 15, 6, '#FFFFFF', 'border-radius:8px') + R(27, 20, 15, 6, '#FFFFFF', 'border-radius:8px') +
        R(84, 14, 10, 18, '#7A5A40', 'border-radius:2px') + R(86, 32, 6, 6, '#E9C46A', 'border-radius:50% 50% 2px 2px;box-shadow:0 0 24px 8px rgba(233,196,106,.4)') + R(0, 92, 100, 2, '#F7F2E8')],
      ['The roll-top bath', 'linear-gradient(#F3EEE7,#E9E2D8)', () =>
        R(0, 30, 100, 70, '#F3EEE7', 'background-image:repeating-linear-gradient(0deg,transparent 0 22px,#E0D8CC 22px 23px),repeating-linear-gradient(90deg,transparent 0 22px,#E0D8CC 22px 23px)') +
        SASH(62, 46, 18, 42, 'linear-gradient(#CFE2EA,#F4EFE4)') + R(0, 0, 100, 31, 'repeating-conic-gradient(#2A2A2A 0 25%,#F4F1EC 0 50%) 0 0/28px 28px') +
        R(16, 20, 50, 22, '#FFFFFF', 'border-radius:8px 8px 45% 45%/8px 8px 70% 70%;box-shadow:inset 0 -10px 0 rgba(0,0,0,.05)') + R(14, 40, 54, 3, '#FFFFFF', 'border-radius:4px') +
        R(20, 15, 3, 6, '#C9A45C', 'border-radius:0 0 40% 40%') + R(59, 15, 3, 6, '#C9A45C', 'border-radius:0 0 40% 40%') + R(18, 43, 2, 9, '#C9A45C') + R(16, 51, 6, 2, '#C9A45C') +
        R(74, 31, 8, 14, '#5E7A3E', 'border-radius:40% 40% 4px 4px') + R(74, 31, 8, 6, '#B5694A', 'border-radius:2px')],
      ['Lamplight on the terrace', 'linear-gradient(180deg,#141A30 0%,#33304A 70%)', () =>
        R(0, 40, 100, 60, 'transparent', 'background-image:' + STARS + ';opacity:.6') + C(80, 76, 5, '#F4F0E0') +
        TERR(0, 10, 100, 58, '#4A4236', '#F2C873') + R(0, 67, 100, 3, '#3A332A') + R(10, 70, 3, 5, '#3A332A') + R(46, 70, 3, 5, '#3A332A') + R(84, 70, 3, 5, '#3A332A') +
        R(0, 0, 100, 11, '#1C1B22') + R(0, 10, 100, 1.4, '#5A5248') +
        R(22, 11, .8, 26, '#0F0E12') + C(20.6, 35, 4, '#FFE8B0', 'box-shadow:0 0 40px 14px rgba(255,220,150,.45)') + R(70, 11, .8, 26, '#0F0E12') + C(68.6, 35, 4, '#FFE8B0', 'box-shadow:0 0 40px 14px rgba(255,220,150,.45)')],
      ['Rooftops towards the Abbey', 'linear-gradient(180deg,#BFDDEB 0%,#F4F1E8 70%)', () =>
        P(0, 40, 100, 20, '#9DB08F', 'polygon(0 100%,0 40%,30% 10%,60% 30%,85% 0,100% 20%,100% 100%)') +
        R(56, 30, 12, 46, STONE) + R(55, 74, 14, 2, '#C8A66A') + R(55, 76, 2, 5, STONE) + R(61, 76, 2, 5, STONE) + R(67, 76, 2, 5, STONE) + R(59, 50, 6, 16, '#6E7F8C', 'border-radius:50% 50% 0 0/20% 20% 0 0') +
        R(0, 0, 100, 38, '#D3B67F') + TERR(2, 0, 24, 46, '#E2C690', '#7D8A92') + P(1, 45, 26, 5, '#5A6470', 'polygon(4% 100%,96% 100%,90% 0,10% 0)') +
        TERR(28, 0, 22, 40, STONE, '#6E7F8C') + TERR(72, 0, 26, 44, '#E2C690', '#7D8A92') + P(71, 43, 28, 5, '#5A6470', 'polygon(4% 100%,96% 100%,90% 0,10% 0)') +
        R(10, 50, 2.4, 6, '#B79A63') + R(80, 48, 2.4, 6, '#B79A63') + R(36, 40, 2.4, 6, '#B79A63') +
        R(0, 0, 100, 100, 'transparent', 'box-shadow:inset 0 0 0 10px #F7F2E8') + R(49.5, 0, 1, 100, '#F7F2E8')],
    ],
  };
  // The host's own photos when there are any, otherwise the illustrated scenes.
  const photosOf = p => (p.photos || []).filter(x => x && x.url);
  function pic(p, i, extra) {
    const ph = photosOf(p); if (!ph.length) return art(p.theme, i, extra);
    const x = ph[i % ph.length];
    return '<div class="p-art p-photo ' + (extra || '') + '"><img src="' + esc(x.url) + '" alt="' + esc(x.cap || p.name) + '"' + (i ? ' loading="lazy"' : '') + ' decoding="async"></div>';
  }
  const capsOf = (p, th) => { const ph = photosOf(p); return ph.length ? ph.map((x, i) => x.cap || (i ? 'Photo ' + (i + 1) : p.name)) : SCENES[th].map(x => x[0]); };
  function art(theme, i, extra) {
    const s = (SCENES[theme] || SCENES.cabin)[i % 5];
    return '<div class="p-art ' + (extra || '') + '" role="img" aria-label="' + esc(s[0]) + '" style="background:' + s[1] + '">' + s[2]() + '</div>';
  }

  /* ---------- extra icons for amenities ---------- */
  const XI = {
    tub: '<path d="M3 12h18v3a5 5 0 01-5 5H8a5 5 0 01-5-5zM6 12V6a2 2 0 014 0M9 4c0 1-1 1-1 2M14 4c0 1-1 1-1 2M18 4c0 1-1 1-1 2"/>',
    flame: '<path d="M12 3c3 4 6 6 6 11a6 6 0 01-12 0c0-3 2-5 3-7 1 2 2 3 3 3 0-3 0-5 0-7z"/>',
    boat: '<path d="M3 15c3 0 5-2 9-2s6 2 9 2l-2 4H5zM12 13V4l5 7"/>',
    bed: '<path d="M3 18V7M3 13h18v5M21 18v-3M7 13v-3h5a3 3 0 013 3"/>',
    cup: '<path d="M5 9h11v6a5 5 0 01-5 5h-1a5 5 0 01-5-5zM16 11h2a2 2 0 010 4h-2M8 3c0 2 2 2 2 4M12 3c0 2 2 2 2 4"/>',
    wash: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4.5"/><path d="M7 6h2"/>',
    fire: '<path d="M4 20l16-4M20 20L4 16M12 3c2 3 4 4 4 7a4 4 0 01-8 0c0-2 1-3 2-4 .5 1 1 1.5 2 1.5 0-2 0-3 0-4.5z"/>',
  };
  const xicon = k => '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + XI[k] + '</svg>';
  function amenIcon(a) {
    const s = a.toLowerCase();
    if (/hot tub|spa|jacuzzi|roll-top|bath\b/.test(s)) return xicon('tub');
    if (/fireplace|stove|burner/.test(s)) return xicon('flame');
    if (/fire pit/.test(s)) return xicon('fire');
    if (/kayak|boat|paddle/.test(s)) return xicon('boat');
    if (/bed/.test(s)) return xicon('bed');
    if (/espresso|coffee/.test(s)) return xicon('cup');
    if (/wash|dryer|laundry/.test(s)) return xicon('wash');
    if (/wi-?fi|internet/.test(s)) return BB.icon('wifi');
    if (/park|garage/.test(s)) return BB.icon('car');
    if (/dog|pet/.test(s)) return BB.icon('dog');
    if (/check-in|lock|keyless/.test(s)) return BB.icon('key');
    if (/view|sea|terrace|fell/.test(s)) return BB.icon('image');
    return BB.icon('check');
  }

  /* ---------- per-home content that is not in the record ---------- */
  const GUIDE = {
    laurel: [['Windermere', '10 min drive', 'Lake cruises from Bowness, and the best ice cream on the pier.', 'pin'], ['Troutbeck village', '5 min walk', 'Two proper pubs, the Queens Head and the Mortal Man.', 'heart'], ['Ambleside', '15 min drive', 'Outdoor shops, cafes and the start of the Fairfield Horseshoe.', 'car'], ['Wansfell Pike', 'From the back gate', 'A steep two-hour walk with views down the length of Windermere.', 'home']],
    lakeside: [['Porthminster Beach', '2 min walk', 'Golden sand, calm water and a beach cafe that does a great breakfast.', 'heart'], ['Tate St Ives', '6 min walk', 'Modern art above Porthmeor Beach, with a rooftop cafe.', 'pin'], ['The harbour', 'Right outside', 'Fishing boats, pasty shops and boat trips to Seal Island.', 'car'], ['Barbara Hepworth Museum', '5 min walk', 'Her studio and sculpture garden, kept as she left it.', 'home']],
    loft: [['Pulteney Bridge', '1 min walk', 'One of four bridges in the world with shops along both sides.', 'pin'], ['Roman Baths', '6 min walk', 'Go early or late to beat the queues. Book ahead in summer.', 'heart'], ['Royal Crescent', '15 min walk', 'The finest Georgian terrace in the country, with a lawn for picnics.', 'car'], ['Thermae Bath Spa', '8 min walk', 'A rooftop pool with views over the city, open until 9.30pm.', 'home']],
  };
  const AREA = { laurel: 'Troutbeck and Windermere', lakeside: 'St Ives', loft: 'Bath' };
  const GUIDE_THEME = {
    cabin: [['Fell walks', 'Close by', 'Ask us for our favourite routes and viewpoints.', 'heart'], ['Nearest village', '10 min drive', 'A shop, a pub and a cafe.', 'pin'], ['Scenic drives', 'From the door', 'Lanes and passes with lay-bys for photos.', 'car'], ['Farm shop', 'Weekends', 'Local cheese, bread and cakes.', 'home']],
    lake: [['The beach', 'Short walk', 'Swim, paddle or just sit and watch the boats.', 'heart'], ['Harbour town', 'Close by', 'Pasties, galleries and boat trips.', 'pin'], ['Coast path', 'From the door', 'Cliff-top walks with big sea views.', 'car'], ['Sunset spots', 'Everywhere', 'The terrace is hard to beat.', 'home']],
    city: [['Coffee and bakeries', '2 min walk', 'Breakfast without moving the car.', 'heart'], ['Restaurants and pubs', '5 min walk', 'Dinner, drinks and live music nearby.', 'pin'], ['Museums and galleries', '10 min walk', 'A full afternoon of culture in town.', 'home'], ['Parks', 'Close by', 'Green space for a morning run.', 'car']],
  };
  const STRIP_NAMES = { site: '', checkout: '/book', done: '/booking/' };

  function defaultFaqs(p, host) {
    return [
      [p.petsAllowed ? 'Can I bring my dog?' : 'Can I bring a pet?', p.petsAllowed ? 'Yes. One well-behaved dog is welcome for a ' + money(p.petFee || 0) + ' fee per stay. Add your dog in the guest picker when you book.' : 'Sorry, ' + p.short + ' cannot host pets. Assistance dogs are always welcome.'],
      ['What time is check-in and checkout?', 'Check-in is from ' + p.checkinTime + ' and checkout is by ' + p.checkoutTime + '. Message ' + host + ' if you need a little flexibility and we will do our best.'],
      ['How does check-in work?', (S().live ? 'After you book, you get a link to check in online in a few minutes: ID and the house rules' + (BB.q.connected('stripe') ? ', plus a refundable deposit hold' : '') + '. ' + ((S().integrations.find(i => i.id === 'lock') || {}).connected ? 'Your door code arrives on arrival day.' : 'Your host sends arrival details before you come.') : 'After you book, you get a link to check in online in about 3 minutes: ID, the rental agreement and a refundable deposit hold. Your door code arrives on arrival day.')],
      ['Is there parking?', 'Yes. ' + p.parking + '.'],
      ['Why book direct?', 'You skip the platform service fee, get the same secure card checkout, and talk to ' + host + ' directly before and during your stay.'],
    ];
  }

  function defaultSel(pid) {
    const p = BB.q.property(pid); if (!p) return { a: null, b: null };
    const n = Math.max(p.minNights || 1, 3), t = BB.store.get().today;
    for (let d = D.add(t, 7); d < D.add(t, 150); d = D.add(d, 1)) if (BB.q.isAvailable(pid, d, D.add(d, n))) return { a: d, b: D.add(d, n) };
    return { a: null, b: null };
  }
  function fresh(pid) {
    const sel = defaultSel(pid);
    return { pid, view: 'site', sel, calOpen: false, calMsg: null, calMonth: D.month(sel.a || BB.store.get().today), guestsOpen: false,
      adults: 2, children: 0, pets: 0, promo: '', promoDraft: '', promoOpen: false, promoMsg: null,
      lb: null, faq: 0, navOpen: false, sheet: false, moreReviews: false,
      errors: {}, payErr: null, paying: false, bookingId: null, request: false, method: 'card' };
  }

  /* ---------- custom action: booking request when card payments are paused ---------- */

  /* ---------- rendering pieces ---------- */
  function quoteOf(inst) {
    const st = inst.st; if (!st.sel.a || !st.sel.b) return null;
    return BB.quote(st.pid, st.sel.a, st.sel.b, { adults: st.adults, children: st.children, pets: st.pets, promo: st.promo });
  }
  const ID = (inst, k) => 'p-' + k + '-' + inst.uid;
  const sh = (n, eb, title) => '<header class="p-sh"><p class="p-eb"><span class="p-n">' + n + '</span>' + eb + '</p><h2>' + title + '</h2></header>';
  const stars = n => '<span class="p-stars" aria-label="' + n + ' out of 5 stars">' + '★★★★★'.slice(0, n) + '<span>' + '★★★★★'.slice(n) + '</span></span>';

  function strip(inst, p) {
    const s = BB.store.get(), st = inst.st;
    const path = st.view === 'checkout' ? '/book' : st.view === 'done' ? '/booking/' + (st.bookingId || '') : '/';
    return '<div class="p-strip" role="region" aria-label="Prototype controls"><div class="p-strip-in">' +
      '<span class="p-tag">Guest view</span>' +
      '<div class="p-url" title="This is the host’s own website">' + BB.icon('lock') + '<span class="p-url-t"><span class="p-url-s">https://</span>' + esc(p.domain) + '<span class="p-url-s">' + esc(path) + '</span></span></div>' +
      '<label class="p-switch"><span class="sr">Show property</span><select id="' + ID(inst, 'pick') + '" data-x="pick">' + s.properties.map(x => '<option value="' + esc(x.id) + '"' + (x.id === st.pid ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      (st.view === 'checkout' ? '<button class="p-sbtn" data-x="sample">' + BB.icon('user') + '<span>Fill sample guest</span></button>' : '') +
      '<button class="p-sbtn" data-x="edit">' + BB.icon('edit') + '<span>Edit this site in the console</span></button>' +
      '</div></div>';
  }

  // Live homes only show the places the host has written up (one per line: place | how far | tip).
  const hostGuide = p => (p.guide || []).map(l => String(l).split('|').map(x => x.trim())).filter(g => g[0]).slice(0, 8).map((g, i) => [g[0], g[1] || '', g[2] || '', ['pin', 'heart', 'car', 'home'][i % 4]]);
  function nav(inst, p) {
    const links = [['gallery', 'Gallery'], ['about', 'The home'], ['reviews', 'Reviews'], ['area', 'Area guide'], ['faq', 'FAQs']].filter(l => !(S().live && l[0] === 'area' && !hostGuide(p).length));
    return '<nav class="p-nav" aria-label="' + esc(p.name) + '"><div class="p-w p-nav-in">' +
      '<button class="p-brand" data-x="home"><span class="p-mono" aria-hidden="true">' + esc(monogram(p.name)) + '</span><span class="p-brand-t">' + esc(p.name) + '</span></button>' +
      '<ul class="p-links' + (inst.st.navOpen ? ' open' : '') + '">' + links.map(([k, t]) => '<li><button data-x="jump" data-to="' + k + '">' + t + '</button></li>').join('') +
        '<li class="p-links-cta"><button class="p-btn" data-x="bookcta">Book direct</button></li></ul>' +
      '<button class="p-btn p-nav-cta" data-x="bookcta">Book direct</button>' +
      '<button class="p-menu" data-x="menu" aria-expanded="' + !!inst.st.navOpen + '" aria-label="Menu">' + BB.icon(inst.st.navOpen ? 'x' : 'menu') + '</button>' +
      '</div></nav>';
  }

  function calendar(inst, p, mode) {
    const st = inst.st, bl = BB.q.blocked(st.pid), today = BB.store.get().today;
    const m0 = st.calMonth < D.month(today) ? D.month(today) : st.calMonth, m1 = BB.addMonth(m0, 1);
    const n = nightsBetween(st.sel.a, st.sel.b);
    const head = st.sel.a && st.sel.b ? plural(n, 'night') + ' · ' + D.fmt(st.sel.a) + ' – ' + D.fmt(st.sel.b) : st.sel.a ? 'Now pick your checkout date' : 'Pick your check-in date';
    return '<div class="p-cal p-cal-' + mode + '" role="dialog" aria-label="Choose dates">' +
      '<div class="p-cal-h"><div><b>' + head + '</b><span>Minimum stay ' + plural(p.minNights, 'night') + ' · booked nights are crossed out</span></div>' +
      '<div class="p-cal-nav"><button class="p-ib" data-x="mon" data-d="-1" aria-label="Previous month"' + (m0 <= D.month(today) ? ' disabled' : '') + '>' + BB.icon('back') + '</button><button class="p-ib" data-x="mon" data-d="1" aria-label="Next month">' + BB.icon('arrow') + '</button></div></div>' +
      (st.calMsg ? '<p class="p-calmsg" role="alert">' + BB.icon('x') + esc(st.calMsg) + '</p>' : '') +
      '<div class="p-months">' + [m0, m1].map(m => '<div class="p-month"><p>' + BB.monthName(m) + '</p>' + BB.monthGrid(m, st.sel, bl) + '</div>').join('') + '</div>' +
      '<div class="p-cal-f"><button class="p-link" data-x="clear">Clear dates</button><button class="p-btn sm" data-x="calclose">' + (st.sel.a && st.sel.b ? 'Done' : 'Close') + '</button></div></div>';
  }

  function stepper(key, label, sub, val, min, max) {
    return '<div class="p-step"><div><b>' + label + '</b><span>' + sub + '</span></div><div class="p-step-c">' +
      '<button class="p-ib" data-x="step" data-k="' + key + '" data-d="-1" aria-label="Fewer ' + label.toLowerCase() + '"' + (val <= min ? ' disabled' : '') + '>−</button><b class="num">' + val + '</b>' +
      '<button class="p-ib" data-x="step" data-k="' + key + '" data-d="1" aria-label="More ' + label.toLowerCase() + '"' + (val >= max ? ' disabled' : '') + '>+</button></div></div>';
  }

  function guestLabel(st) {
    const g = st.adults + st.children;
    return plural(g, 'guest') + (st.pets ? ', 1 dog' : '');
  }

  function lines(q, p, compact) {
    if (!q) return '';
    return '<div class="p-lines">' +
      '<div><span>' + money(q.avg) + ' × ' + plural(q.nights, 'night') + '</span><span class="num">' + money(q.nightly) + '</span></div>' +
      '<div><span>Cleaning</span><span class="num">' + money(q.cleaning) + '</span></div>' +
      (q.pet ? '<div><span>Pet fee</span><span class="num">' + money(q.pet) + '</span></div>' : '') +
      (q.discount ? '<div class="p-disc"><span>Code ' + esc(q.promo) + ' · ' + q.promoPct + '% off nights</span><span class="num">−' + money(q.discount) + '</span></div>' : '') +
      '<div><span>Service fee</span><span class="num p-zero">' + money(0) + '</span></div>' +
      '<div class="p-tot"><span>Total</span><span class="num">' + money(q.total) + '</span></div>' +
      (compact ? '' : '<div class="p-save">' + BB.icon('tag') + '<span>The same stay costs <s class="num">' + money(q.airbnb) + '</s> on Airbnb. You save <b class="num">' + money(q.guestSaves) + '</b> by booking direct.</span></div>') +
      '</div>';
  }

  function widget(inst, p, mode) {
    const st = inst.st, q = quoteOf(inst);
    return '<div class="p-widget p-widget-' + mode + '">' +
      '<div class="p-wtop"><div class="p-price"><b class="num">' + money(q ? q.avg : p.nightly) + '</b><span>' + (q ? 'avg / night' : '/ night') + '</span></div>' +
      (p.rating ? '<span class="p-wrate">★ ' + p.rating.toFixed(2) + ' <span>· ' + p.reviews + '</span></span>' : '<span class="p-wrate">New home</span>') + '</div>' +
      '<div class="p-flds">' +
        '<button class="p-fld" data-x="cal" aria-expanded="' + !!st.calOpen + '"><small>Check-in</small><span>' + (st.sel.a ? D.fmt(st.sel.a, { weekday: 'short' }) : 'Add date') + '</span></button>' +
        '<button class="p-fld" data-x="cal" aria-expanded="' + !!st.calOpen + '"><small>Checkout</small><span>' + (st.sel.b ? D.fmt(st.sel.b, { weekday: 'short' }) : 'Add date') + '</span></button>' +
        '<button class="p-fld full" data-x="guests" aria-expanded="' + !!st.guestsOpen + '"><small>Guests</small><span>' + guestLabel(st) + '</span>' + BB.icon('chev') + '</button>' +
      '</div>' +
      (st.calOpen ? calendar(inst, p, mode) : '') +
      (st.guestsOpen ? '<div class="p-gpop">' +
        stepper('adults', 'Adults', 'Ages 13 and up', st.adults, 1, p.maxGuests - st.children) +
        stepper('children', 'Children', 'Ages 2 to 12', st.children, 0, p.maxGuests - st.adults) +
        (p.petsAllowed ? stepper('pets', 'Dog', 'One well-behaved dog, ' + money(p.petFee || 0) + ' per stay', st.pets, 0, 1) : '<div class="p-step off"><div><b>Pets</b><span>This home cannot host pets</span></div></div>') +
        '<p class="p-gnote">Sleeps ' + p.maxGuests + '. Infants under 2 stay free.</p><button class="p-btn sm" data-x="guests">Done</button></div>' : '') +
      (q && q.problems.length ? '<div class="p-prob" role="alert">' + q.problems.map(x => '<p>' + BB.icon('x') + esc(x) + '</p>').join('') + '</div>' : '') +
      '<button class="p-btn p-reserve" data-x="reserve"' + (q && !q.ok ? ' disabled' : '') + '>' + (q ? 'Reserve' : 'Check availability') + '</button>' +
      (q ? '<p class="p-nocharge">You will not be charged yet</p>' : '') +
      lines(q, p) +
      (st.promo ? '<div class="p-promo-on">' + BB.icon('tag') + '<span><b>' + esc(st.promo) + '</b> applied</span><button class="p-link" data-x="promooff">Remove</button></div>'
        : st.promoOpen ? '<form class="p-promo" data-x="promoform"><label class="sr" for="' + ID(inst, 'promo-' + mode) + '">Promo code</label><input id="' + ID(inst, 'promo-' + mode) + '" data-f="promoDraft" value="' + esc(st.promoDraft) + '" placeholder="Promo code" autocomplete="off" spellcheck="false"><button class="p-btn sm ghost" type="submit">Apply</button></form>' +
          (st.promoMsg ? '<p class="p-promomsg">' + esc(st.promoMsg) + '</p>' : '')
        : '<button class="p-link p-promo-open" data-x="promoopen">Have a promo code?</button>') +
      '</div>';
  }

  function reviewsOf(pid) {
    return BB.store.get().bookings.filter(b => b.propertyId === pid && b.review && b.review.text).sort((a, b) => b.review.at.localeCompare(a.review.at));
  }

  function siteView(inst, p) {
    const s = BB.store.get(), st = inst.st, th = p.theme;
    const host = firstName(s.account.owner) || 'your host';
    const revs = reviewsOf(p.id), shown = st.moreReviews ? revs.slice(0, 12) : revs.slice(0, 6);
    const faqs = (s.website.faqs && s.website.faqs[p.id] && s.website.faqs[p.id].length) ? s.website.faqs[p.id].map(x => { const i = x.indexOf('|'); return i < 0 ? [x, ''] : [x.slice(0, i), x.slice(i + 1)]; }) : defaultFaqs(p, host);
    const guide = S().live ? hostGuide(p) : (GUIDE[p.id] || GUIDE_THEME[th]);
    const sampleA = D.add(s.today, 21), sq = BB.quote(p.id, sampleA, D.add(sampleA, 3), { adults: 2 });
    const caps = capsOf(p, th);

    const hero = '<section class="p-hero p-w"><div class="p-hero-art">' + pic(p, 0) + '</div>' +
      '<div class="p-hero-cap">' + (p.rating ? '<span class="p-rating">★ ' + p.rating.toFixed(2) + ' · ' + p.reviews + ' reviews</span>' : '') +
      '<h1>' + esc(p.headline) + '</h1><p>' + esc(p.sub) + '</p>' +
      '<div class="p-hero-acts"><button class="p-btn" data-x="bookcta">Check your dates</button><button class="p-btn ghost" data-x="lb" data-i="0">' + BB.icon('image') + 'See the photos</button></div></div></section>';

    const gallery = '<section class="p-sec" id="' + ID(inst, 'gallery') + '">' + sh('01', 'Gallery', 'Take a look around') +
      '<div class="p-gal p-gal-n' + Math.min(5, caps.length) + '">' + caps.slice(0, 5).map((c, i) => '<button class="p-tile" data-x="lb" data-i="' + i + '" aria-label="Open photo: ' + esc(c) + '">' + pic(p, i) + '<span class="p-tcap">' + esc(c) + '</span></button>').join('') +
      '<button class="p-galall" data-x="lb" data-i="0">' + BB.icon('image') + (caps.length === 1 ? 'Open photo' : 'Show all ' + caps.length + ' photos') + '</button></div></section>';

    const about = '<section class="p-sec" id="' + ID(inst, 'about') + '">' + sh('02', 'The home', 'About ' + esc(p.name)) +
      '<div class="p-facts">' + [[p.bedrooms, p.bedrooms === 1 ? 'Bedroom' : 'Bedrooms'], [p.baths, p.baths === 1 ? 'Bath' : 'Baths'], [p.maxGuests, 'Guests'], [p.minNights, p.minNights === 1 ? 'Night min' : 'Nights min']].map(([n, l]) => '<div><b class="num">' + n + '</b><span>' + l + '</span></div>').join('') + '</div>' +
      '<p class="p-about">' + esc(p.about) + '</p>' +
      (p.amenities.length ? '<h3 class="p-h3">What this home offers</h3><ul class="p-amen">' + p.amenities.map(a => '<li><i>' + amenIcon(a) + '</i>' + esc(a) + '</li>').join('') + '</ul>' : '') +
      '<div class="p-host"><div class="p-face" aria-hidden="true"><i></i></div><div class="p-host-b"><p class="p-eb">Your host</p><b>Hosted by ' + esc(host) + '</b>' +
        (s.live ? '<span>' + esc(s.account.business) + '</span><q>' + esc(p.hostNote || 'Message ' + host + ' any time before or during your stay.') + '</q></div>' + (p.reviews ? '<div class="p-host-k">' + (p.rating ? '<div><b class="num">' + p.rating.toFixed(2) + '</b><span>Rating</span></div>' : '') + '<div><b class="num">' + p.reviews + '</b><span>Reviews</span></div></div>' : '') + '</div>' :
        '<span>' + esc(s.account.business) + ' · replies in under an hour</span>' +
        '<q>We live close by and look after ' + esc(p.short) + ' ourselves. Message us any time before or during your stay.</q></div>' +
        '<div class="p-host-k">' + (p.rating ? '<div><b class="num">' + p.rating.toFixed(2) + '</b><span>Rating</span></div>' : '') + '<div><b class="num">' + p.reviews + '</b><span>Reviews</span></div><div><b class="num">1 hr</b><span>Reply time</span></div></div></div>') +
      '</section>';

    const reviews = '<section class="p-sec" id="' + ID(inst, 'reviews') + '">' + sh('03', 'Reviews', 'What guests say') +
      '<div class="p-revhead"><b class="num">' + (p.rating ? p.rating.toFixed(2) : 'New') + '</b><div>' + (p.rating ? stars(Math.round(p.rating)) : '') + '<span>' + (p.reviews ? p.reviews + ' reviews from past guests' : 'No reviews yet. Be the first to stay.') + '</span></div></div>' +
      (shown.length ? '<div class="p-revs">' + shown.map(b => { const g = BB.q.guest(b.guestId) || { name: 'Guest' }; const n = g.name.split(' '); return '<figure class="p-rev">' + stars(b.review.stars) + '<blockquote>“' + esc(b.review.text) + '”</blockquote><figcaption>' + BB.avatar(g.name, 'sm') + '<span><b>' + esc(n[0] + (n[1] ? ' ' + n[1][0] + '.' : '')) + '</b>' + D.fmt(b.review.at, { month: 'long', year: 'numeric', day: undefined }) + ' · ' + plural(nightsBetween(b.checkIn, b.checkOut), 'night') + '</span></figcaption></figure>'; }).join('') + '</div>' +
        (revs.length > 6 ? '<button class="p-btn ghost p-more" data-x="morerev">' + (st.moreReviews ? 'Show fewer reviews' : 'Show more reviews') + '</button>' : '')
        : '<p class="p-empty">Reviews from guests who book here will show up on this page.</p>') +
      (S().live && p.reviews ? '<p class="p-fine">Every review is from a guest who stayed here and chose to share it, whatever their rating. Guests who rate their stay get a code for 10% off their next one.</p>' : '') +
      '</section>';

    const area = !guide.length ? '' : '<section class="p-sec" id="' + ID(inst, 'area') + '">' + sh('04', 'Area guide', 'Around ' + esc(AREA[p.id] || p.area.split(',')[0])) +
      '<div class="p-guide">' + guide.map(g => '<div class="p-gi"><i>' + BB.icon(g[3]) + '</i><div><b>' + esc(g[0]) + '</b><em>' + esc(g[1]) + '</em><p>' + esc(g[2]) + '</p></div></div>').join('') + '</div></section>';

    const faq = '<section class="p-sec" id="' + ID(inst, 'faq') + '">' + sh('05', 'Good to know', 'Questions guests ask') +
      '<div class="p-faqgrid"><div class="p-faqs">' + faqs.map((f, i) => '<div class="p-faq' + (st.faq === i ? ' open' : '') + '"><button data-x="faq" data-i="' + i + '" aria-expanded="' + (st.faq === i) + '"><span>' + esc(f[0]) + '</span><i aria-hidden="true"></i></button>' + (st.faq === i ? '<p>' + esc(f[1]) + '</p>' : '') + '</div>').join('') + '</div>' +
      '<aside class="p-rules"><h3 class="p-h3">House rules</h3><ul>' +
        '<li>' + BB.icon('clock') + 'Check-in from ' + esc(p.checkinTime) + ', checkout by ' + esc(p.checkoutTime) + '</li>' +
        p.rules.map(r => '<li>' + BB.icon('check') + esc(r) + '</li>').join('') + '</ul></aside></div></section>';

    const loc = '<section class="p-sec" id="' + ID(inst, 'loc') + '">' + sh('06', 'Location', 'Where you will stay') +
      '<div class="p-loc"><div class="p-map" aria-hidden="true"><i class="r1"></i><i class="r2"></i><i class="r3"></i><i class="w"></i><i class="pk"></i><span class="p-pin">' + BB.icon('home') + '</span></div>' +
      '<div class="p-loc-b"><b>' + esc(p.address) + '</b><span>' + esc(p.area) + '</span><p>' + BB.icon('car') + 'Parking: ' + esc(p.parking) + '</p><p>' + BB.icon('key') + 'Self check-in with a door code from ' + esc(p.checkinTime) + '</p>' +
      '<button class="p-btn ghost sm" data-x="copyaddr">' + BB.icon('pin') + 'Copy address</button></div></div></section>';

    const direct = sq ? '<section class="p-direct"><div class="p-w p-direct-in"><div class="p-direct-t"><p class="p-eb">Why book direct</p><h2>Skip the platform fee. Keep ' + money(sq.guestSaves) + ' on a 3-night stay.</h2>' +
      '<ul><li>' + BB.icon('tag') + '<span><b>No service fee.</b> Airbnb adds about 14% to your total. We don’t.</span></li><li>' + BB.icon('sms') + '<span><b>Talk to ' + esc(host) + ' directly.</b> Questions answered by the people who own the home.</span></li><li>' + BB.icon('lock') + '<span><b>Secure checkout.</b> Cards, Apple Pay and Google Pay through Stripe.</span></li></ul></div>' +
      '<div class="p-cmp"><p class="p-eb">Sample stay · ' + D.fmt(sampleA) + ' – ' + D.fmt(D.add(sampleA, 3)) + ', 2 guests</p>' +
      '<div class="p-cmp-r"><span>On Airbnb</span><s class="num">' + money(sq.airbnb) + '</s></div>' +
      '<div class="p-cmp-r p-cmp-me"><span>Here, direct</span><b class="num">' + money(sq.total) + '</b></div>' +
      '<div class="p-cmp-bar"><i style="width:' + Math.round(100 * sq.total / sq.airbnb) + '%"></i></div>' +
      '<div class="p-cmp-save"><span>Platform fee you skip</span><b class="num">' + money(sq.guestSaves) + '</b></div>' +
      '<button class="p-btn" data-x="bookcta">Check your dates</button></div></div></section>' : '';

    return hero + '<div class="p-w p-main"><div class="p-col">' + gallery + about + reviews + area + faq + loc + '</div>' +
      '<aside class="p-aside" id="' + ID(inst, 'book') + '">' + widget(inst, p, 'side') + '</aside></div>' + direct;
  }

  function summary(inst, p, q, b) {
    const st = inst.st;
    const a = b ? b.checkIn : st.sel.a, z = b ? b.checkOut : st.sel.b;
    const ad = b ? b.adults : st.adults, ch = b ? b.children : st.children, pe = b ? b.pets : st.pets;
    return '<div class="p-sum"><div class="p-sum-art">' + pic(p, 0) + '</div><div class="p-sum-b">' +
      '<p class="p-eb">' + esc(p.area) + '</p><h3>' + esc(p.name) + '</h3>' +
      '<div class="p-sum-d"><div><small>Check-in</small><b>' + D.fmt(a, { weekday: 'short' }) + '</b><span>from ' + esc(p.checkinTime) + '</span></div><div><small>Checkout</small><b>' + D.fmt(z, { weekday: 'short' }) + '</b><span>by ' + esc(p.checkoutTime) + '</span></div></div>' +
      '<p class="p-sum-g">' + BB.icon('users') + plural(ad + ch, 'guest') + (ch ? ' (' + plural(ch, 'child').replace('childs', 'children') + ')' : '') + (pe ? ', 1 dog' : '') + ' · ' + plural(nightsBetween(a, z), 'night') + '</p>' +
      (q ? lines(q, p) : '') + '</div></div>';
  }

  function checkoutView(inst, p) {
    const st = inst.st, q = quoteOf(inst), f = inst.form, e = st.errors;
    if (!q) return '<div class="p-w p-co"><p class="p-empty">Pick your dates first.</p><button class="p-btn" data-x="home">Back to ' + esc(p.short) + '</button></div>';
    const stripe = BB.q.connected('stripe');
    const fld = (k, label, type, ac, ph) => '<label class="p-field' + (e[k] ? ' bad' : '') + '"><span>' + label + '</span><input id="' + ID(inst, 'f-' + k) + '" data-f="' + k + '" type="' + type + '" autocomplete="' + ac + '" value="' + esc(f[k] || '') + '"' + (ph ? ' placeholder="' + esc(ph) + '"' : '') + '>' + (e[k] ? '<em>' + esc(e[k]) + '</em>' : '') + '</label>';
    return '<div class="p-w p-co"><button class="p-back" data-x="home">' + BB.icon('back') + 'Back to ' + esc(p.short) + '</button>' +
      '<h1 class="p-co-h">' + (REALSITE() && !BB.BOOT.stripe ? 'Request to book' : 'Confirm and pay') + '</h1>' +
      '<div class="p-co-grid"><form class="p-co-form" data-x="payform" novalidate>' +
        '<section class="p-card"><h3><span class="p-num">1</span>Your details</h3><div class="p-fgrid">' +
          fld('name', 'Full name', 'text', 'name', 'Jordan Avery') + fld('email', 'Email', 'email', 'email', 'you@example.com') + fld('phone', 'Mobile phone', 'tel', 'tel', 'For your check-in link and door code') +
        '</div><label class="p-check"><input type="checkbox" id="' + ID(inst, 'f-optin') + '" data-f="optin"' + (f.optin ? ' checked' : '') + '><span>Send me early access to open dates and returning-guest offers from ' + esc(p.short) + '. Unsubscribe any time.</span></label></section>' +
        (REALSITE() ? realPay(inst, p, q, stripe) :
        '<section class="p-card"><h3><span class="p-num">2</span>Payment</h3>' +
          '<div class="p-wallets"><button type="button" class="p-wal apple" data-x="wallet" data-m="Apple Pay"' + (st.paying ? ' disabled' : '') + '>Apple Pay</button><button type="button" class="p-wal google" data-x="wallet" data-m="Google Pay"' + (st.paying ? ' disabled' : '') + '><b>G</b>oogle Pay</button></div>' +
          '<p class="p-or"><span>or pay by card</span></p>' +
          '<div class="p-fgrid p-fgc">' + fld('card', 'Card number', 'text', 'cc-number') + fld('exp', 'Expiry', 'text', 'cc-exp') + fld('cvc', 'CVC', 'text', 'cc-csc') + fld('zip', 'Postcode', 'text', 'postal-code') + '</div>' +
          '<p class="p-fine">' + BB.icon('lock') + 'Secured by Stripe. A refundable ' + money(q.deposit) + ' deposit hold is placed during online check-in, not now.</p>' +
          (st.payErr ? '<div class="p-err" role="alert"><b>' + BB.icon('x') + 'Payment did not go through</b><p>' + esc(st.payErr) + '</p>' +
            (!stripe ? '<p>You can still send ' + esc(p.short) + ' a booking request. Your dates are held and the host sends a secure payment link to confirm.</p><button type="button" class="p-btn" data-x="request">Send a booking request instead</button>'
              : '<button type="button" class="p-btn ghost" data-x="changedates">Change dates</button>') + '</div>' : '') +
          '<button type="submit" class="p-btn p-pay"' + (st.paying || !q.ok ? ' disabled' : '') + '>' + (st.paying ? '<i class="p-spin"></i>Processing payment' : BB.icon('lock') + 'Pay ' + money(q.total)) + '</button>' +
          '<p class="p-fine">By paying you agree to the house rules and the rental agreement you sign at check-in.</p>' +
        '</section>') + '</form>' +
        '<aside class="p-co-side">' + summary(inst, p, q) + '</aside></div></div>';
  }

  const REALSITE = () => !!(BB.BOOT && BB.BOOT.mode === 'site');
  // Real booking sites: card details are taken on Stripe's own page, or the guest sends a request when the host has not connected Stripe yet.
  function realPay(inst, p, q) {
    const st = inst.st, host = firstName(BB.store.get().account.owner) || 'your host';
    const err = st.payErr ? '<div class="p-err" role="alert"><b>' + BB.icon('x') + 'That did not go through</b><p>' + esc(st.payErr) + '</p></div>' : '';
    if (BB.BOOT.stripe) return '<section class="p-card"><h3><span class="p-num">2</span>Payment</h3>' +
      '<p class="p-lead-s">You pay on Stripe’s secure page by card, Apple Pay or Google Pay. Your dates are held for 30 minutes while you pay.</p>' +
      '<p class="p-fine">' + BB.icon('lock') + 'Secured by Stripe. A refundable ' + money(q.deposit) + ' damage deposit card check happens during online check-in, not now.</p>' + err +
      '<button type="submit" class="p-btn p-pay"' + (st.paying || !q.ok ? ' disabled' : '') + '>' + (st.paying ? '<i class="p-spin"></i>Opening secure payment' : BB.icon('lock') + 'Pay ' + money(q.total) + ' securely') + '</button>' +
      '<p class="p-fine">By paying you agree to the house rules and the rental agreement you sign at check-in.</p></section>';
    return '<section class="p-card"><h3><span class="p-num">2</span>No payment today</h3>' +
      '<p class="p-lead-s">Send ' + esc(host) + ' your request. Your dates are held, and ' + esc(host) + ' sends you a secure payment link to confirm.</p>' + err +
      '<button type="button" class="p-btn p-pay" data-x="request"' + (st.paying || !q.ok ? ' disabled' : '') + '>' + (st.paying ? '<i class="p-spin"></i>Sending' : BB.icon('send') + 'Send booking request') + '</button>' +
      '<p class="p-fine">Nothing is charged until you accept the payment link.</p></section>';
  }
  function doneView(inst, p) {
    const st = inst.st, b = BB.q.booking(st.bookingId);
    if (!b) return '<div class="p-w p-co"><p class="p-empty">That booking could not be found.</p><button class="p-btn" data-x="home">Back to ' + esc(p.short) + '</button></div>';
    const g = BB.q.guest(b.guestId) || { name: 'Guest', email: '' };
    const req = st.request || !b.paid;
    const host = firstName(BB.store.get().account.owner);
    const q = { avg: Math.round(b.price.nightly / Math.max(1, nightsBetween(b.checkIn, b.checkOut))), nights: nightsBetween(b.checkIn, b.checkOut), nightly: b.price.nightly, cleaning: b.price.cleaning, pet: b.price.pet || 0, discount: b.price.discount || 0, promo: b.promo, promoPct: b.promo ? (BB.store.get().promos[b.promo] || 0) : 0, total: b.total, airbnb: Math.round(b.total * 1.142) };
    q.guestSaves = q.airbnb - q.total;
    const lockLive = !S().live || BB.q.connected('lock');
    const steps = req && S().live ? [
      ['Now', 'Request sent to ' + host, 'Nothing was charged. ' + host + ' has been told and will accept or decline your request.'],
      ['Next', host + ' confirms', BB.q.connected('stripe') ? 'If ' + host + ' accepts, you get a secure link to pay by card, Apple Pay or Google Pay.' : host + ' gets in touch about payment once your stay is confirmed.'],
      ['Before you arrive', 'Online check-in', 'Add an ID photo and agree to the house rules in a few minutes.'],
      [D.fmt(b.checkIn, { weekday: 'short' }), lockLive ? 'Door code on arrival day' : 'Arrival details', lockLive ? 'Your code works from ' + p.checkinTime + '.' : host + ' sends how to get in before you arrive.'],
    ] : req ? [
      ['Now', 'Request sent to ' + host, 'No card was charged. ' + host + ' gets a notification and replies within the hour.'],
      ['Within 1 hour', 'Secure payment link', 'Pay by card, Apple Pay or Google Pay to confirm ' + b.id + '.'],
      ['After payment', 'Check-in link', 'Verify your ID, sign the agreement and place the deposit hold in about 3 minutes.'],
      [D.fmt(b.checkIn, { weekday: 'short' }), 'Door code on arrival day', 'Your code works from ' + p.checkinTime + '. Self check-in, no keys to collect.'],
    ] : [
      ['Now', 'Confirmation email', (BB.q.connected('email') ? 'Sent to ' + g.email + (S().live ? ' with your booking details.' : ' with your receipt and a wallet pass.') : 'Your host emails your receipt shortly.')],
      ['Today', 'Check-in link', (BB.q.connected('sms') && g.phone ? 'Texted to ' + g.phone + '. ' : 'In your confirmation email. ') + (S().live ? 'Add an ID photo and agree to the house rules in a few minutes.' : 'Verify your ID, sign the agreement and place the deposit hold in about 3 minutes.')],
      [D.fmt(D.add(b.checkIn, -3)), 'Reminder', 'A nudge to finish check-in if you have not yet, plus directions and parking.'],
      [D.fmt(b.checkIn, { weekday: 'short' }), lockLive ? 'Door code on arrival day' : 'Arrival details', lockLive ? 'Your code arrives once check-in is done and works from ' + p.checkinTime + '.' : 'Shown in your guest app once check-in is done.'],
    ];
    return '<div class="p-w p-co p-done"><div class="p-done-h"><span class="p-tick' + (req ? ' req' : '') + '">' + BB.icon(req ? 'send' : 'check') + '</span>' +
      '<p class="p-eb">' + (req ? 'Request ' : 'Booking ') + esc(b.id) + '</p><h1 class="p-co-h">' + (req ? 'Request sent. Your dates are held.' : 'You are booked, ' + esc(firstName(g.name)) + '.') + '</h1>' +
      '<p class="p-lead">' + esc(p.name) + ' · ' + D.fmt(b.checkIn, { weekday: 'long', month: 'long' }) + ' to ' + D.fmt(b.checkOut, { weekday: 'long', month: 'long' }) + '</p></div>' +
      '<div class="p-co-grid"><div class="p-done-main">' +
        '<div class="p-card p-sync"><div class="p-sync-i">' + BB.icon('cal') + '</div><div><b>Your dates are now closed to other guests</b>' +
          '<p>' + (S().live ? 'Your dates are held on ' + esc(host) + '’s calendar, so nobody else can book them while ' + (req ? 'your request is open.' : 'you are booked.') : 'The moment you booked, ' + esc(p.domain) + ' and ' + esc(host) + '’s calendar were updated, so nobody else can take these nights.') + '</p>' +
          '<div class="p-chans">' + [p.domain, host + '’s calendar'].map(c => '<span>' + BB.icon('check') + esc(c) + '</span>').join('') + '</div></div></div>' +
        '<div class="p-card"><h3>What happens next</h3><ol class="p-tl">' + steps.map((x, i) => '<li class="' + (i === 0 ? 'on' : '') + '"><span class="p-tl-w">' + esc(x[0]) + '</span><div><b>' + esc(x[1]) + '</b><p>' + esc(x[2]) + '</p></div></li>').join('') + '</ol></div>' +
        '<div class="p-done-acts"><button class="p-btn" data-x="guestapp">' + BB.icon('phone') + 'Open the guest app</button>' + (REALSITE() ? '' : '<button class="p-btn ghost" data-x="console">' + BB.icon('dash') + 'See it in the host console</button>') + '</div>' +
        '<button class="p-link" data-x="again">Back to ' + esc(p.short) + '</button>' +
      '</div><aside class="p-co-side">' + summary(inst, p, q, b) + '</aside></div></div>';
  }

  function lightbox(inst, p) {
    const i = inst.st.lb, caps = capsOf(p, p.theme);
    return '<div class="p-lb" role="dialog" aria-modal="true" aria-label="Photos">' +
      '<div class="p-lb-top"><span class="num">' + (i + 1) + ' / ' + caps.length + '</span><button class="p-lb-x" data-x="lbclose" aria-label="Close photos">' + BB.icon('x') + '</button></div>' +
      '<div class="p-lb-stage"><button class="p-lb-n prev" data-x="lbstep" data-d="-1" aria-label="Previous photo">' + BB.icon('back') + '</button>' +
      '<figure><div class="p-lb-img">' + pic(p, i) + '</div><figcaption>' + esc(caps[i]) + '</figcaption></figure>' +
      '<button class="p-lb-n next" data-x="lbstep" data-d="1" aria-label="Next photo">' + BB.icon('arrow') + '</button></div>' +
      '<div class="p-lb-th">' + caps.map((c, k) => '<button data-x="lbgo" data-i="' + k + '" aria-label="' + esc(c) + '" aria-current="' + (k === i) + '">' + pic(p, k) + '</button>').join('') + '</div></div>';
  }

  function mobileBar(inst, p) {
    const st = inst.st, q = quoteOf(inst);
    return '<div class="p-mbar"><div><b class="num">' + money(q ? q.total : p.nightly) + '</b><span>' + (q ? 'total · ' + D.fmt(st.sel.a) + ' – ' + D.fmt(st.sel.b) : '/ night · add dates') + '</span></div>' +
      '<button class="p-btn" data-x="sheet">Reserve</button></div>';
  }
  function sheet(inst, p) {
    return '<div class="p-sheet" role="dialog" aria-modal="true" aria-label="Book ' + esc(p.name) + '"><div class="p-sheet-h"><b>' + esc(p.name) + '</b><button class="p-ib" data-x="sheetclose" aria-label="Close">' + BB.icon('x') + '</button></div>' +
      '<div class="p-sheet-b" id="' + ID(inst, 'sheet') + '">' + widget(inst, p, 'sheet') + '</div></div>';
  }

  function footer(p) {
    return '<footer class="p-foot"><div class="p-w p-foot-in"><div><b class="p-foot-n"><span class="p-mono" aria-hidden="true">' + esc(monogram(p.name)) + '</span>' + esc(p.name) + '</b><span>' + esc(p.address) + '</span></div>' +
      '<span class="p-foot-c">© ' + BB.store.get().today.slice(0, 4) + ' ' + esc(p.name) + '</span>' +
      '<span class="p-pw">' + BB.MARK + 'Powered by <b>bookingbooster</b></span></div></footer>';
  }

  /* ---------- actions ---------- */
  const isMobile = () => window.matchMedia('(max-width: 900px)').matches;
  function scrollToSec(inst, key) {
    const go = () => { const el = inst.root.querySelector('#' + ID(inst, key)); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
    if (inst.st.view !== 'site') { inst.set({ view: 'site', navOpen: false }); setTimeout(go, 30); } else { if (inst.st.navOpen) inst.set({ navOpen: false }); go(); }
  }
  function openBooking(inst) {
    if (inst.st.view !== 'site') inst.set({ view: 'site' });
    if (isMobile()) { inst.set({ sheet: true, navOpen: false, calOpen: !(inst.st.sel.a && inst.st.sel.b) }); return; }
    inst.set({ navOpen: false, calOpen: true, guestsOpen: false });
    const el = inst.root.querySelector('#' + ID(inst, 'book')); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function validate(inst) {
    const f = inst.form, e = {};
    if (!String(f.name || '').trim() || String(f.name).trim().length < 2) e.name = 'Enter your full name.';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(f.email || '').trim())) e.email = 'Enter an email so we can send your confirmation.';
    if (!(BB.BOOT && BB.BOOT.stripe) && String(f.card || '').replace(/\D/g, '').length < 15) e.card = 'Enter a card number.';
    return e;
  }
  function pay(inst, method) {
    const st = inst.st; if (st.paying) return;
    const e = validate(inst);
    if (method !== 'card') delete e.card;
    if (Object.keys(e).length) { inst.set({ errors: e, payErr: null }); const el = inst.root.querySelector('.p-field.bad input'); if (el) el.focus(); return; }
    inst.set({ errors: {}, payErr: null, paying: true, method });
    if (BB.api && BB.BOOT.mode === 'site') return serverBook(inst, 'pay');
    setTimeout(() => {
      if (!inst.alive) return;
      const f = inst.form, r = BB.act.createBooking(input(inst));
      if (r.ok) { inst.st.paying = false; inst.set({ view: 'done', bookingId: r.booking.id, request: false }); window.scrollTo({ top: 0 }); BB.toast('Booked. Confirmation sent to ' + f.email.trim(), 'good'); }
      else inst.set({ paying: false, payErr: r.error });
    }, 650);
  }
  // Real site: the server takes the booking. It answers with a Stripe checkout link, a request, or a confirmed test booking.
  function serverBook(inst, kind) {
    const f = inst.form;
    BB.api.book(input(inst), kind).then(j => {
      if (!inst.alive) return;
      if (!j.ok) return inst.set({ paying: false, payErr: j.error || 'That did not go through. Try again.' });
      BB.BOOT.trips = BB.BOOT.trips || {}; BB.BOOT.trips[j.bookingId] = j.tripUrl;
      if (j.checkoutUrl) { location.href = j.checkoutUrl; return; }
      inst.st.paying = false; inst.set({ view: 'done', bookingId: j.bookingId, request: !!j.request }); window.scrollTo({ top: 0 });
      BB.toast(j.request ? 'Request sent to ' + firstName(BB.store.get().account.owner) : 'Booked. Confirmation sent to ' + f.email.trim(), 'good');
    }).catch(e => { if (inst.alive) inst.set({ paying: false, payErr: e.message }); });
  }
  function input(inst) {
    const st = inst.st, f = inst.form;
    return { propertyId: st.pid, checkIn: st.sel.a, checkOut: st.sel.b, name: String(f.name).trim(), email: String(f.email).trim(), phone: String(f.phone || '').trim(), adults: st.adults, children: st.children, pets: st.pets, promo: st.promo, channel: 'direct', source: 'website', subscribe: !!f.optin };
  }

  /* ---------- surface ---------- */
  BB.define('property', {
    create(root, opts, inst) {
      inst.uid = Math.random().toString(36).slice(2, 7);
      const s = BB.store.get();
      const pid = BB.q.property(opts.propertyId) ? opts.propertyId : (BB.q.property('laurel') ? 'laurel' : s.properties[0].id);
      inst.st = fresh(pid);
      inst.form = { name: '', email: '', phone: '', optin: true, card: '4242 4242 4242 4242', exp: '12 / 28', cvc: '123', zip: 'BA1 1LT' };

      root.addEventListener('click', ev => {
        const st = inst.st;
        const t = ev.target.closest('[data-x]');
        // close popovers when clicking elsewhere
        if (st.calOpen && !ev.target.closest('.p-cal') && !(t && ['cal', 'mon', 'clear', 'calclose'].includes(t.dataset.x))) { st.calOpen = false; st.calMsg = null; if (!t) inst.render(); }
        if (st.guestsOpen && !ev.target.closest('.p-gpop') && !(t && ['guests', 'step'].includes(t.dataset.x))) { st.guestsOpen = false; if (!t) inst.render(); }
        if (!t || !root.contains(t)) return;
        const x = t.dataset.x, p = BB.q.property(st.pid);
        if (x === 'pick' || x === 'promoform' || x === 'payform') return;
        if (ev.target.closest('form') && t.tagName === 'BUTTON' && t.type === 'submit') return;
        switch (x) {
          case 'edit': BB.go('app', { view: 'website', id: st.pid }); break;
          case 'sample': Object.assign(inst.form, { name: 'Jordan Avery', email: 'jordan.avery@gmail.com', phone: '07700 900188' }); inst.set({ errors: {} }); break;
          case 'home': inst.set({ view: 'site', navOpen: false, payErr: null }); window.scrollTo({ top: 0 }); break;
          case 'menu': inst.set({ navOpen: !st.navOpen }); break;
          case 'jump': scrollToSec(inst, t.dataset.to); break;
          case 'bookcta': openBooking(inst); break;
          case 'cal': inst.set({ calOpen: !st.calOpen, guestsOpen: false, calMsg: null, calMonth: D.month(st.sel.a || BB.store.get().today) }); break;
          case 'calclose': inst.set({ calOpen: false, calMsg: null }); break;
          case 'clear': inst.set({ sel: { a: null, b: null }, calMsg: null }); break;
          case 'mon': inst.set({ calMonth: BB.addMonth(st.calMonth, +t.dataset.d) }); break;
          case 'guests': inst.set({ guestsOpen: !st.guestsOpen, calOpen: false }); break;
          case 'step': { const k = t.dataset.k; const v = Math.max(0, st[k] + +t.dataset.d); inst.set({ [k]: k === 'adults' ? Math.max(1, v) : v }); break; }
          case 'promoopen': inst.set({ promoOpen: true, promoMsg: null }); setTimeout(() => { const el = root.querySelector('.p-promo input'); if (el && el.offsetParent) el.focus(); }, 0); break;
          case 'promooff': inst.set({ promo: '', promoDraft: '', promoOpen: false, promoMsg: null }); break;
          case 'reserve': {
            const q = quoteOf(inst);
            if (!q) { inst.set({ calOpen: true, guestsOpen: false }); break; }
            if (!q.ok) break;
            inst.set({ view: 'checkout', sheet: false, calOpen: false, guestsOpen: false, payErr: null, errors: {} }); window.scrollTo({ top: 0 }); break;
          }
          case 'sheet': inst.set({ sheet: true }); break;
          case 'sheetclose': inst.set({ sheet: false, calOpen: false, guestsOpen: false }); break;
          case 'lb': inst.set({ lb: +t.dataset.i || 0 }); break;
          case 'lbgo': inst.set({ lb: +t.dataset.i }); break;
          case 'lbstep': { const n = capsOf(p, p.theme).length; inst.set({ lb: (st.lb + +t.dataset.d + n) % n }); break; }
          case 'lbclose': inst.set({ lb: null }); break;
          case 'faq': { const i = +t.dataset.i; inst.set({ faq: st.faq === i ? -1 : i }); break; }
          case 'morerev': inst.set({ moreReviews: !st.moreReviews }); break;
          case 'copyaddr': BB.copy(p.address, t); break;
          case 'wallet': pay(inst, t.dataset.m); break;
          case 'request': {
            const e = validate(inst); delete e.card;
            if (Object.keys(e).length) { inst.set({ errors: e }); break; }
            if (BB.api && BB.BOOT.mode === 'site') { inst.set({ paying: true, errors: {}, payErr: null }); serverBook(inst, 'request'); break; }
            const r = BB.act.requestPropertyBooking(input(inst));
            if (r.ok) { inst.set({ view: 'done', bookingId: r.booking.id, request: true, payErr: null }); window.scrollTo({ top: 0 }); BB.toast('Request sent to ' + firstName(BB.store.get().account.owner), 'good'); }
            else inst.set({ payErr: r.error });
            break;
          }
          case 'changedates': inst.set({ view: 'site', payErr: null }); openBooking(inst); break;
          case 'guestapp': BB.go('guest', { bookingId: st.bookingId, propertyId: st.pid }); break;
          case 'console': BB.go('app', { view: 'booking', id: st.bookingId }); break;
          case 'again': Object.assign(inst.st, fresh(st.pid)); inst.render(); window.scrollTo({ top: 0 }); break;
        }
      });
      // calendar days (rendered by BB.monthGrid with data-day)
      BB.on(root, 'click', '[data-day]', el => {
        const st = inst.st, d = el.dataset.day, p = BB.q.property(st.pid);
        const bl = BB.q.blocked(st.pid), prev = st.sel;
        let next = BB.pickRange(prev, d, bl), msg = null;
        if (prev.a && !prev.b && d > prev.a && !next.b) {
          const hit = D.nights(prev.a, d).find(n => bl.has(n));
          if (bl.has(d)) { msg = D.fmt(prev.a) + ' to ' + D.fmt(d) + ' includes a booked night (' + D.fmt(hit) + '). Pick a checkout on or before ' + D.fmt(hit) + '.'; next = { a: prev.a, b: null }; }
          else { msg = D.fmt(prev.a) + ' to ' + D.fmt(d) + ' includes a booked night (' + D.fmt(hit) + '), so your stay now starts ' + D.fmt(d) + '. Pick a checkout.'; next = { a: d, b: null }; }
        } else if (next.b && D.diff(next.a, next.b) < (p.minNights || 1)) {
          msg = 'The minimum stay is ' + plural(p.minNights, 'night') + '. Pick a later checkout.';
          next = { a: next.a, b: null };
        }
        inst.set({ sel: next, calMsg: msg, calOpen: !next.b });
      });
      root.addEventListener('input', ev => {
        const el = ev.target; if (!el.dataset || !el.dataset.f) return;
        const k = el.dataset.f;
        if (k === 'promoDraft') { inst.st.promoDraft = el.value; return; }
        if (k === 'optin') return;
        inst.form[k] = el.value;
        if (inst.st.errors[k]) { delete inst.st.errors[k]; el.closest('.p-field').classList.remove('bad'); const em = el.parentNode.querySelector('em'); if (em) em.remove(); }
      });
      root.addEventListener('change', ev => {
        const el = ev.target;
        if (el.dataset.x === 'pick') { BB.go('property', { propertyId: el.value }); return; }
        if (el.dataset.f === 'optin') inst.form.optin = el.checked;
      });
      root.addEventListener('submit', ev => {
        ev.preventDefault();
        const f = ev.target;
        if (f.dataset.x === 'promoform') {
          const code = String(inst.st.promoDraft || '').trim().toUpperCase();
          if (!code) return inst.set({ promoMsg: 'Enter a code.' });
          if (BB.store.get().promos[code]) inst.set({ promo: code, promoOpen: false, promoMsg: null });
          else inst.set({ promoMsg: 'That code is not valid for this home.' });
        }
        if (f.dataset.x === 'payform') pay(inst, 'card');
      });
      inst._key = ev => {
        if (!inst.alive || !document.body.contains(root)) return;
        const st = inst.st;
        if (ev.key === 'Escape') { if (st.lb != null) inst.set({ lb: null }); else if (st.calOpen || st.guestsOpen) inst.set({ calOpen: false, guestsOpen: false }); else if (st.sheet) inst.set({ sheet: false }); else if (st.navOpen) inst.set({ navOpen: false }); }
        if (st.lb != null && (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft')) { const pp = BB.q.property(st.pid), n = pp ? capsOf(pp, pp.theme).length : 5; inst.set({ lb: (st.lb + (ev.key === 'ArrowRight' ? 1 : -1) + n) % n }); }
      };
      document.addEventListener('keydown', inst._key);
    },
    route(inst, opts) {
      const pid = opts && BB.q.property(opts.propertyId) ? opts.propertyId : inst.st.pid;
      Object.assign(inst.st, fresh(pid));
      inst.render();
    },
    destroy(inst) { document.removeEventListener('keydown', inst._key); document.body.classList.remove('p-lock'); },
    render(inst) {
      const s = BB.store.get();
      let raw = BB.q.property(inst.st.pid);
      if (!raw) { inst.st = Object.assign(inst.st, fresh(s.properties[0].id)); raw = s.properties[0]; }
      const p = view(raw), st = inst.st;
      if (!p.petsAllowed && st.pets) st.pets = 0;
      const body = st.view === 'checkout' ? checkoutView(inst, p) : st.view === 'done' ? doneView(inst, p) : siteView(inst, p);
      const style = '--p-acc:' + p.accent + ';--p-acc-ink:' + inkFor(p.accent) + ';--g-acc:' + p.accent;
      return '<div class="x-property" data-theme="' + p.theme + '" data-view="' + st.view + '">' + strip(inst, p) +
        '<div class="p-site" style="' + style + '">' + nav(inst, p) + '<main class="p-body">' + body + '</main>' + footer(p) +
        (st.view === 'site' ? mobileBar(inst, p) : '') + (st.sheet && st.view === 'site' ? sheet(inst, p) : '') + (st.lb != null ? lightbox(inst, p) : '') + '</div></div>';
    },
    after(inst) {
      const bar = document.getElementById('bbBar');
      const h = bar ? bar.offsetHeight : 0;
      const el = inst.root.querySelector('.x-property'); if (el) el.style.setProperty('--p-top', h + 'px');
      document.body.classList.toggle('p-lock', !!(inst.st.sheet || inst.st.lb != null));
    },
  });
})();
