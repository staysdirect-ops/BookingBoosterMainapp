/* Bookingbooster prototype: shared data store, business rules and the connection layer.
   Every surface (website, host console, host mobile, property site, guest app) reads and writes this one store.
   Actions log events; automations and integrations react to events. State persists per viewer in localStorage
   and syncs between open tabs with BroadcastChannel. */
(function () {
  const BB = (window.BB = window.BB || {});
  // BOOT: when the server hands us state (the real app, or the server-side engine), we never touch localStorage.
  const BOOT = window.__BB_BOOT__ || null;
  BB.BOOT = BOOT;
  const KEY = 'bb-proto-v3-uk';

  /* ---------- date helpers (ISO yyyy-mm-dd, UTC) ---------- */
  const D = {
    parse: s => new Date(s + 'T00:00:00Z'),
    iso: d => d.toISOString().slice(0, 10),
    add: (s, n) => { const d = D.parse(s); d.setUTCDate(d.getUTCDate() + n); return D.iso(d); },
    diff: (a, b) => Math.round((D.parse(b) - D.parse(a)) / 864e5),
    dow: s => D.parse(s).getUTCDay(),
    nights: (a, b) => { const out = []; for (let x = a; x < b; x = D.add(x, 1)) out.push(x); return out; },
    fmt: (s, o) => D.parse(s).toLocaleDateString('en-GB', Object.assign({ timeZone: 'UTC', month: 'short', day: 'numeric' }, o || {})).replace(/^(\w+), /, '$1 '),
    month: s => s.slice(0, 7),
  };
  BB.D = D;

  /* ---------- deterministic randomness for seed data ---------- */
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  /* ---------- seed ---------- */
  const TODAY = '2026-11-14';
  const PLATFORM_FEE = { direct: 0, airbnb: 0.155, vrbo: 0.08, booking: 0.15 };
  BB.PLATFORM_FEE = PLATFORM_FEE;
  BB.CHANNEL = { direct: 'Direct', airbnb: 'Airbnb', vrbo: 'Vrbo', booking: 'Booking.com', cm: 'Channel manager' };
  // Calendar sync (optional add-on) reads the dates booked elsewhere from a calendar link (iCal) and blocks them. Dates only: no guest names, prices or messages.
  BB.SYNC_IDS = ['cm', 'airbnb', 'vrbo', 'booking'];
  BB.bookedOn = id => id === 'cm' ? 'Booked via your channel manager' : 'Booked on ' + BB.CHANNEL[id];
  // How a booking found the host. Direct bookings are the product; 'sync' means it came in through the optional calendar sync add-on.
  BB.SOURCE = { website: 'Booking site', google: 'Google search', ai: 'AI answer', email: 'Guest email', campaign: 'Campaign', referral: 'Referral', 'guest-app': 'Guest app', console: 'Added by host', mobile: 'Host app', sync: 'Calendar sync' };
  BB.sourceLabel = b => b.channel !== 'direct' ? BB.bookedOn(b.channel) : (BB.SOURCE[b.source] || 'Booking site');

  function seed() {
    const R = rng(20261114);
    const pick = a => a[Math.floor(R() * a.length)];
    const properties = [
      { id: 'laurel', name: 'Larch Fell Cabin', short: 'Larch Fell', theme: 'cabin', domain: 'larchfellcabin.co.uk', nightly: 165, weekend: 25, cleaning: 75, petFee: 35, petsAllowed: true, maxGuests: 4, bedrooms: 2, baths: 1, minNights: 2,
        address: 'Larch Fell, Troutbeck, Windermere LA23 1PL', area: 'Lake District, Cumbria', lockPrefix: '48', wifi: { ssid: 'LarchFell-Guest', pw: 'fellwalker27' },
        headline: 'Your fell-side hideaway, hot tub included.', sub: '2 bedrooms · sleeps 4 · 10 minutes from Windermere',
        about: 'A larch-clad cabin on two quiet acres above the Troutbeck valley. Mornings on the deck, evenings in the hot tub, and a beck-side footpath straight from the back gate.',
        amenities: ['Private hot tub', 'Wood burner', 'Fast Wi-Fi, 300 Mbps', 'Dogs welcome', 'Parking for 2', 'Self check-in'],
        rules: ['Quiet hours are 10pm to 8am. The hot tub closes at 10pm.', 'No parties or events, and no more than 4 guests overnight.', 'One well-behaved dog is welcome (£35 pet fee).'],
        parking: 'Two spaces on the gravel by the log store', checkinTime: '4pm', checkoutTime: '10am', rating: 4.97, reviews: 212, published: true, color: '#2F5D46' },
      { id: 'lakeside', name: 'Tidewater Cottage', short: 'Tidewater', theme: 'lake', domain: 'tidewatercottage.co.uk', nightly: 210, weekend: 35, cleaning: 90, petFee: 0, petsAllowed: false, maxGuests: 6, bedrooms: 3, baths: 2, minNights: 2,
        address: '4 Harbour Steps, St Ives, Cornwall TR26 1LP', area: 'St Ives, Cornwall', lockPrefix: '31', wifi: { ssid: 'Tidewater', pw: 'harbourlights22' },
        headline: 'Wake up to the harbour, kayaks at the door.', sub: '3 bedrooms · sleeps 6 · two minutes to Porthminster Beach',
        about: "A whitewashed fisherman's cottage on the harbour steps. Two kayaks and a paddleboard live in the boat store, and the terrace looks straight across the bay at sunset.",
        amenities: ['Sea-view terrace', 'Two kayaks', 'Fire pit', 'Fast Wi-Fi, 200 Mbps', 'Parking permits for 2', 'Self check-in'],
        rules: ['Quiet hours are 10pm to 8am.', 'No parties or events, and no more than 6 guests overnight.', 'Sorry, no pets at this home.'],
        parking: 'Two permits for the Barnoon car park', checkinTime: '4pm', checkoutTime: '10am', rating: 4.93, reviews: 148, published: true, color: '#0F6E8C' },
      { id: 'loft', name: 'The Loft on Pulteney', short: 'The Loft', theme: 'city', domain: 'loftonpulteney.co.uk', nightly: 135, weekend: 25, cleaning: 55, petFee: 0, petsAllowed: false, maxGuests: 2, bedrooms: 1, baths: 1, minNights: 1,
        address: '12 Argyle Street, Bath BA2 4BQ', area: 'Central Bath', lockPrefix: '75', wifi: { ssid: 'Loft12', pw: 'sashwindows' },
        headline: 'Georgian light, a king bed and the best coffee on the street.', sub: '1 bedroom · sleeps 2 · walk everywhere in Bath',
        about: 'A top-floor loft above a bakery, a minute from Pulteney Bridge. Tall sash windows, a king bed and a roll-top bath. The Roman Baths, the Circus and the best pubs in town are all a short walk.',
        amenities: ['King bed', 'Roll-top bath', 'Fast Wi-Fi, 500 Mbps', 'Washer-dryer', 'Parking permit', 'Self check-in'],
        rules: ['Quiet hours are 10pm to 8am.', 'No parties or events, and no more than 2 guests overnight.', 'Sorry, no pets at this home.'],
        parking: 'Permit for the Manvers Street car park, on the kitchen counter', checkinTime: '3pm', checkoutTime: '11am', rating: 4.95, reviews: 96, published: true, color: '#E4573D' },
    ];

    const first = ['Maya', 'Tom', 'Kim', 'Priya', 'Hannah', 'Luis', 'Grace', 'Owen', 'Sofia', 'Marcus', 'Lena', 'Noah', 'Ava', 'Ethan', 'Chloe', 'Daniel', 'Isla', 'Ben', 'Zoe', 'Ryan', 'Nora', 'Sam', 'Ellie', 'Jake', 'Ruby', 'Leo', 'Mia', 'Caleb', 'Jade', 'Theo', 'Amara', 'Felix'];
    const last = ['Rodriguez', 'Becker', 'Sato', 'Nair', 'Cole', 'Ortega', 'Kim', 'Price', 'Rossi', 'Webb', 'Fischer', 'Hart', 'Lopez', 'Brooks', 'Patel', 'Young', 'Murphy', 'Green', 'Shaw', 'Ellis', 'Grant', 'Hughes', 'Reed', 'Stone', 'Wade', 'Moss', 'Lane', 'Frost', 'Bell', 'Park', 'Okafor', 'Novak'];
    const cities = ['Manchester', 'Leeds', 'London', 'Bristol', 'Birmingham', 'Edinburgh', 'Glasgow', 'Newcastle', 'Cardiff', 'Brighton', 'York', 'Nottingham'];
    const names = first.map((f, i) => [f, last[i]]);
    const more = ['Harper', 'Elijah', 'Layla', 'Mason', 'Aria', 'Lucas', 'Nina', 'Julian', 'Stella', 'Miles', 'Hazel', 'Ezra', 'Violet', 'Adam', 'Iris', 'Rowan', 'Clara', 'Silas', 'June', 'Asher', 'Eva', 'Hugo', 'Alice', 'Jonah', 'Lucy', 'Arlo', 'Maeve', 'Dev', 'Rosa', 'Kai', 'Tessa', 'Omar', 'Beth', 'Wes', 'Anya', 'Cole', 'Gemma', 'Ravi', 'Holly', 'Finn'];
    more.forEach((f, i) => names.push([f, last[(i * 7 + 3) % last.length]]));
    const guests = names.map(([f, l], i) => ({
      id: 'g' + (i + 1), name: f + ' ' + l, email: (f + '.' + l).toLowerCase() + '@' + pick(['gmail.com', 'outlook.com', 'icloud.com', 'yahoo.com']),
      phone: '07700 900' + String(100 + i).slice(-3), city: pick(cities), tags: [], subscribed: R() > 0.18, notes: '', source: 'import', createdAt: '2025-01-01',
    }));
    const G = n => guests.find(g => g.name.startsWith(n));
    Object.assign(G('Maya'), { city: 'Manchester', tags: ['Repeat', 'Family', 'Hot tub fan'], notes: 'Prefers the June week. Kids love the footpath along the beck.', subscribed: true });
    Object.assign(G('Priya'), { tags: ['Pet owner'], subscribed: true });
    Object.assign(G('Hannah'), { tags: ['Repeat'], subscribed: true });

    const bookings = [];
    let n = 2290;
    function quoteFor(p, a, b, pets) {
      const nights = D.nights(a, b);
      const nightly = nights.reduce((s, x) => s + p.nightly + ([5, 6].includes(D.dow(x)) ? p.weekend : 0), 0);
      return { nightly, cleaning: p.cleaning, pet: pets ? p.petFee : 0, discount: 0, total: nightly + p.cleaning + (pets ? p.petFee : 0) };
    }
    function add(pid, gid, a, b, channel, extra) {
      const p = properties.find(x => x.id === pid);
      const q = quoteFor(p, a, b, extra && extra.pets);
      const code = { laurel: 'LR', lakeside: 'LA', loft: 'LX' }[pid] + '-' + (n++);
      const done = b <= TODAY;
      const bk = Object.assign({
        id: code, propertyId: pid, guestId: gid, checkIn: a, checkOut: b, adults: 2, children: 0, pets: 0, channel, status: done ? 'completed' : 'confirmed',
        price: q, total: q.total, platformFee: Math.round(q.total * PLATFORM_FEE[channel]), paid: true, createdAt: D.add(a, -30 - Math.floor(R() * 40)),
        deposit: done ? 'released' : 'none', checkin: { id: done, selfie: done, guests: done, agreement: done, signature: done ? 'signed' : null, deposit: done, arrival: done ? '4–6pm' : null, done: done },
        code: p.lockPrefix + String(10 + Math.floor(R() * 89)), review: null, promo: null,
      }, extra || {});
      bk.price = q; bk.total = q.total - (bk.price.discount || 0); bk.platformFee = Math.round(bk.total * PLATFORM_FEE[channel]);
      bookings.push(bk); return bk;
    }
    // history: summer 2025 (guests who have not been back since) and Jun–Nov 2026; mostly new guests, about 1 in 4 returning
    const chans = ['direct']; // every stay is booked direct; platform channels never come in: the optional calendar sync add-on only blocks dates
    const pool = guests.slice(10); let nextNew = 0; const stayed = [];
    const nextGuest = () => { if ((stayed.length > 6 && R() < 0.24) || nextNew >= pool.length) return pick(stayed); const g = pool[nextNew++]; stayed.push(g); return g; };
    [['laurel', '2025-06-20', '2025-09-30'], ['lakeside', '2025-06-25', '2025-09-20']].forEach(([pid, from, to]) => {
      for (let d = from; d < to;) { const len = 2 + Math.floor(R() * 4); add(pid, nextGuest().id, d, D.add(d, len), chans[Math.floor(R() * chans.length)]); d = D.add(d, len + 3 + Math.floor(R() * 8)); }
    });
    properties.forEach((p, pi) => {
      let d = '2026-06-01';
      while (d < '2026-11-08') {
        const len = 2 + Math.floor(R() * 4);
        const ch = 'direct';
        const g = nextGuest();
        const pets = p.petsAllowed && R() < 0.3 ? 1 : 0; if (pets && !g.tags.includes('Pet owner')) g.tags.push('Pet owner');
        add(p.id, g.id, d, D.add(d, len), ch, { adults: 1 + Math.floor(R() * Math.min(4, p.maxGuests)), pets });
        d = D.add(d, len + Math.floor(R() * 4));
      }
    });
    // remove history that overlaps the hand-made current bookings below
    const keep = b => !(b.checkOut > '2026-11-07');
    for (let i = bookings.length - 1; i >= 0; i--) if (!keep(bookings[i])) bookings.splice(i, 1);
    // Maya's earlier stays
    add('laurel', G('Maya').id, '2025-06-14', '2025-06-20', 'direct', { adults: 2, children: 2 });
    add('laurel', G('Maya').id, '2024-06-08', '2024-06-13', 'direct', { adults: 2, children: 2 });
    add('laurel', G('Hannah').id, '2025-10-10', '2025-10-13', 'direct');
    // current and upcoming, matching the designs
    add('loft', G('Ben').id, '2026-11-11', '2026-11-14', 'direct', { status: 'completed', deposit: 'released' });
    add('laurel', G('Maya').id, '2026-11-14', '2026-11-18', 'direct', { adults: 2, children: 2, status: 'confirmed', checkin: { id: true, selfie: true, guests: true, agreement: true, signature: 'signed', deposit: true, arrival: '4–6pm', done: true }, deposit: 'held', code: '4827' });
    add('lakeside', G('Kim').id, '2026-11-10', '2026-11-14', 'direct', { status: 'confirmed', checkin: { id: true, selfie: true, guests: true, agreement: true, signature: 'signed', deposit: true, arrival: '4–6pm', done: true }, deposit: 'held' });
    add('lakeside', G('Tom').id, '2026-11-14', '2026-11-17', 'direct', { adults: 4, checkin: { id: true, selfie: true, guests: true, agreement: true, signature: 'signed', deposit: false, arrival: '6–8pm', done: false } });
    add('laurel', G('Priya').id, '2026-11-20', '2026-11-23', 'direct', { pets: 1, price: null, checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    add('laurel', G('Hannah').id, '2026-11-27', '2026-12-01', 'direct', { checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    add('loft', G('Owen').id, '2026-11-15', '2026-11-17', 'direct', { checkin: { id: true, selfie: false, guests: true, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    add('loft', G('Grace').id, '2026-11-19', '2026-11-22', 'direct', { checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    add('lakeside', G('Sofia').id, '2026-11-26', '2026-11-29', 'direct', { adults: 5, checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    add('loft', G('Lena').id, '2026-12-04', '2026-12-07', 'direct', { checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    add('lakeside', G('Marcus').id, '2026-12-18', '2026-12-23', 'direct', { adults: 6, checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false } });
    // fill the coming weeks around the hand-made stays, booked recently, so the next 30 days look like a real calendar
    const none = () => ({ id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false });
    const free = (pid, a, b) => !bookings.some(x => x.propertyId === pid && x.checkIn < b && x.checkOut > a) && !(pid === 'laurel' && a < '2026-12-11' && b > '2026-12-08');
    properties.forEach(p => {
      for (let d = '2026-11-16'; d < '2027-01-08';) {
        const len = 2 + Math.floor(R() * 3), end = D.add(d, len);
        if (R() < 0.62 && free(p.id, d, end)) {
          const ch = 'direct';
          add(p.id, nextGuest().id, d, end, ch, { createdAt: D.add(TODAY, -1 - Math.floor(R() * 27)), checkin: none(), adults: 1 + Math.floor(R() * Math.min(4, p.maxGuests)) });
          d = D.add(end, Math.floor(R() * 3));
        } else d = D.add(d, 1);
      }
    });
    // where each direct booking came from: new guests mostly find the site through Google and AI answers, returning guests through our emails
    { const seen = new Set(); bookings.slice().sort((a, b) => a.checkIn.localeCompare(b.checkIn)).forEach(b => {
      if (!b.source) b.source = seen.has(b.guestId) ? (R() < 0.6 ? 'email' : 'website') : pick(['google', 'google', 'ai', 'website', 'website', 'referral']);
      seen.add(b.guestId); }); }
    // fix Priya's quote with the pet fee
    bookings.forEach(b => { const p = properties.find(x => x.id === b.propertyId); const q = quoteFor(p, b.checkIn, b.checkOut, b.pets); b.price = q; b.total = q.total; b.platformFee = Math.round(q.total * PLATFORM_FEE[b.channel]); });
    // a few reviews on completed stays
    const quotes = {
      laurel: ['Best cabin we have stayed in. The view down the valley at sunrise is unreal.', 'Spotless, cosy, and the hot tub under the stars was magic, even in the rain.', 'Check-in was so easy, and our dog had the best time.', 'The footpath along the beck from the back gate made the trip for our kids.'],
      lakeside: ['Kayaking round the harbour at sunrise was the highlight of our year.', 'The terrace looking across the bay at sunset is something else.', 'Spotless, comfy beds, and two minutes to the beach with the kids.', 'Would book again in a heartbeat.'],
      loft: ['Perfect location, we walked everywhere in Bath.', 'The bakery downstairs ruined all other breakfasts for us.', 'Beautiful light, great bed, quiet at night despite being downtown.', 'Easy check-in and a really thoughtful host.'],
    };
    const qi = { laurel: 0, lakeside: 0, loft: 0 };
    bookings.filter(b => b.status === 'completed').forEach((b, i) => { if (i % 3 === 0) { const list = quotes[b.propertyId]; b.review = { stars: R() > 0.15 ? 5 : 4, text: list[qi[b.propertyId]++ % list.length], at: b.checkOut }; } });

    const threads = [
      { id: 't1', guestId: G('Priya').id, bookingId: bookings.find(b => b.guestId === G('Priya').id && b.checkIn >= TODAY).id, channel: 'direct', unread: 1, messages: [
        { from: 'guest', text: "Hi! Is the cabin okay for a small dog? She's a small terrier and very well behaved.", at: '2026-11-14T08:41' } ] },
      { id: 't2', guestId: G('Tom').id, bookingId: bookings.find(b => b.guestId === G('Tom').id && b.checkIn === TODAY).id, channel: 'direct', unread: 1, messages: [
        { from: 'auto', text: 'Hi Tom, your check-in is almost done. The last step is the £200 security deposit hold.', at: '2026-11-13T10:00' },
        { from: 'guest', text: 'Will do tonight. Is there parking for two cars?', at: '2026-11-14T07:55' } ] },
      { id: 't3', guestId: G('Maya').id, bookingId: bookings.find(b => b.guestId === G('Maya').id && b.checkIn === TODAY).id, channel: 'direct', unread: 0, messages: [
        { from: 'host', text: 'Welcome back, Maya! The hot tub is filled and the beck is running high after all the rain.', at: '2026-11-13T17:20' },
        { from: 'guest', text: 'Amazing, the kids are counting down. See you tomorrow!', at: '2026-11-13T17:42' } ] },
      { id: 't4', guestId: G('Owen').id, bookingId: bookings.find(b => b.guestId === G('Owen').id && b.checkIn >= TODAY).id, channel: 'direct', unread: 0, messages: [
        { from: 'guest', text: 'Could we drop bags early tomorrow, around noon?', at: '2026-11-13T21:02' },
        { from: 'host', text: "Yes, noon is fine. The door code works from midday for you.", at: '2026-11-13T21:30' } ] },
    ];

    const campaigns = [
      { id: 'c1', name: 'June week reopens', subject: 'Your June week is open again', segment: 'past', status: 'sent', sentAt: '2026-11-03', recipients: 412, opens: 239, clicks: 58, bookings: 23, revenue: 21480,
        body: { heading: 'Your June week is open again', text: 'Past guests get first pick of summer dates before they open to everyone. Book direct and keep 10% with code JUNE10.', cta: 'Pick your dates', propertyId: 'laurel', promo: 'JUNE10' } },
      { id: 'c2', name: 'Fill the gap nights', subject: '21–22 Nov just opened up', segment: 'repeat', status: 'draft', sentAt: null, recipients: 0, opens: 0, clicks: 0, bookings: 0, revenue: 0,
        body: { heading: '21–22 Nov just opened up', text: 'Two quiet nights at Larch Fell, 15% off for past guests. Use code GAP15 at checkout.', cta: 'Grab the dates', propertyId: 'laurel', promo: 'GAP15' } },
      { id: 'c3', name: 'New Year in St Ives', subject: 'New Year by the harbour?', segment: 'lapsed', status: 'scheduled', sentAt: '2026-11-20', recipients: 0, opens: 0, clicks: 0, bookings: 0, revenue: 0,
        body: { heading: 'New Year by the harbour?', text: 'Fireworks over St Ives bay from the terrace. Past guests save 10% with code BAY10.', cta: 'See dates', propertyId: 'lakeside', promo: 'BAY10' } },
    ];
    const promos = { MAYA10: 10, GAP15: 15, JUNE10: 10, BAY10: 10, WELCOME5: 5 };

    const automations = [
      { id: 'a1', name: 'Booking confirmation', trigger: 'booking.created', steps: ['Email confirmation with wallet pass', 'Text the check-in link'], on: true, runs: 318 },
      { id: 'a2', name: 'Check-in reminder', trigger: 'arrival.minus3', steps: ['Email the check-in link', 'Text a reminder if not started after 24 hours'], on: true, runs: 291 },
      { id: 'a3', name: 'Door code on check-in', trigger: 'checkin.completed', steps: ['Create a unique code on the smart lock', 'Send code, address and Wi-Fi'], on: true, runs: 276 },
      { id: 'a4', name: 'Checkout and review', trigger: 'stay.checkout', steps: ['Send the checkout list at 9am', 'Ask for a private rating', 'Offer a 10% come-back code'], on: true, runs: 254 },
      { id: 'a5', name: 'Add guests to the list', trigger: 'stay.checkout', steps: ['Add guest to the email list if they opted in', 'Tag by home, season and party type'], on: true, runs: 254 },
      { id: 'a6', name: 'Gap night offer', trigger: 'calendar.gap', steps: ['Find 1–2 night gaps in the next 14 days', 'Draft an offer to repeat guests for approval'], on: false, runs: 12 },
    ];

    const integrations = [
      { id: 'stripe', name: 'Stripe', group: 'Payments', connected: true, detail: 'Cards, Apple Pay, Google Pay and deposit holds. Payouts to Barclays ••4410', lastSync: '2026-11-14T09:00' },
      { id: 'lock', name: 'Nuki smart locks', group: 'Operations', connected: true, detail: '3 locks. A unique code for every stay', lastSync: '2026-11-14T08:58' },
      { id: 'cleaner', name: 'Turno cleaning', group: 'Operations', connected: false, detail: 'Auto-schedule a clean after every checkout', lastSync: null },
      { id: 'email', name: 'Email sending', group: 'Messaging', connected: true, detail: 'From hello@fellandharbour.co.uk, domain verified', lastSync: '2026-11-14T09:00' },
      { id: 'sms', name: 'Text messages', group: 'Messaging', connected: true, detail: 'Twilio number +44 7700 900142', lastSync: '2026-11-14T09:00' },
      { id: 'google', name: 'Google Business Profile', group: 'Get found', connected: true, detail: 'Larch Fell Cabin, Tidewater Cottage, The Loft on Pulteney', lastSync: '2026-11-14T06:00' },
      { id: 'gsc', name: 'Google Search Console', group: 'Get found', connected: true, detail: '3 sites verified', lastSync: '2026-11-14T06:00' },
      { id: 'analytics', name: 'Google Analytics', group: 'Get found', connected: false, detail: 'Visitor and conversion tracking', lastSync: null },
      { id: 'pricelabs', name: 'PriceLabs', group: 'Pricing', connected: false, detail: 'Dynamic nightly rates', lastSync: null },
      { id: 'cm', name: 'Channel manager calendar', group: 'Add-ons', addon: true, connected: false, detail: 'Optional. Paste the calendar link (iCal) from your existing channel manager. Dates booked there are blocked on your sites.', lastSync: null },
      { id: 'airbnb', name: 'Airbnb calendar', group: 'Add-ons', addon: true, connected: false, detail: 'Optional. Paste your Airbnb calendar link (iCal). Dates booked there are blocked on your sites so you never double book.', lastSync: null },
      { id: 'vrbo', name: 'Vrbo calendar', group: 'Add-ons', addon: true, connected: false, detail: 'Optional. Paste your Vrbo calendar link (iCal). Dates booked there are blocked on your sites.', lastSync: null },
      { id: 'booking', name: 'Booking.com calendar', group: 'Add-ons', addon: true, connected: false, detail: 'Optional. Paste your Booking.com calendar link (iCal). Dates booked there are blocked on your sites.', lastSync: null },
    ];

    const ai = {
      checkedAt: '2026-11-14',
      questions: [
        { q: 'cabin with hot tub in the Lake District', propertyId: 'laurel', engines: { chatgpt: true, gemini: true, perplexity: true, google: true } },
        { q: 'dog friendly cabin near Windermere', propertyId: 'laurel', engines: { chatgpt: true, gemini: false, perplexity: true, google: true } },
        { q: 'cottage with kayaks in St Ives', propertyId: 'lakeside', engines: { chatgpt: true, gemini: true, perplexity: false, google: true } },
        { q: 'harbour cottage Cornwall with sea view', propertyId: 'lakeside', engines: { chatgpt: false, gemini: true, perplexity: false, google: false } },
        { q: 'apartment in central Bath walkable', propertyId: 'loft', engines: { chatgpt: true, gemini: false, perplexity: false, google: true } },
        { q: 'romantic weekend in Bath', propertyId: 'loft', engines: { chatgpt: false, gemini: false, perplexity: false, google: false } },
        { q: 'family cabin Lake District with a stream', propertyId: 'laurel', engines: { chatgpt: true, gemini: true, perplexity: false, google: true } },
        { q: 'pet friendly stay Lake District', propertyId: 'laurel', engines: { chatgpt: false, gemini: false, perplexity: true, google: false } },
      ],
      tasks: [
        { id: 'faq-pets', text: 'Add a dog policy FAQ to Larch Fell', done: false, fixes: [1, 7] },
        { id: 'schema-loft', text: 'Add "romantic weekend" content and reviews to The Loft', done: false, fixes: [5] },
        { id: 'gbp-lake', text: 'Post harbour-view photos to the Google Business Profile', done: false, fixes: [3] },
      ],
    };

    const website = { visitors: { laurel: 1840, lakeside: 1036, loft: 328 }, fromSearch: 0.64, conversion: 0.029, faqs: { laurel: ['Is the cabin dog friendly?|Yes. One well-behaved dog is welcome for a £35 fee. The garden is fully fenced.', 'How does check-in work?|Complete the 3-minute online check-in and your door code arrives on arrival day.', 'Why book direct?|You skip the platform service fee and talk to us directly.'] } };

    return {
      v: 1, today: TODAY, clock: '09:00',
      account: { business: 'Fell & Harbour Stays', owner: 'Dana Whitfield', email: 'dana@fellandharbour.co.uk', plan: 'Growth', onboarded: true },
      properties, guests, bookings, threads, campaigns, automations, integrations, ai, website, promos,
      blocks: [{ propertyId: 'laurel', from: '2026-12-08', to: '2026-12-11', note: 'Deck repairs' }],
      events: [], notifications: [], seq: 100,
    };
  }

  /* ---------- store core ---------- */
  let state, listeners = [], chan = null;
  if (!BOOT) try { chan = new BroadcastChannel(KEY); } catch (_) {}
  function load() {
    if (BOOT && BOOT.state) return BOOT.state;
    try { const raw = localStorage.getItem(KEY); if (raw) { const s = JSON.parse(raw); if (s && s.v === 1) return s; } } catch (_) {}
    const s = seed(); seedEvents(s); return s;
  }
  function save() { if (BOOT) return; try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (_) {} }
  function emit(meta) { listeners.slice().forEach(fn => { try { fn(state, meta || {}); } catch (e) { console.error(e); } }); }
  BB.store = {
    get: () => state,
    subscribe(fn) { listeners.push(fn); return () => { listeners = listeners.filter(x => x !== fn); }; },
    commit(meta) { save(); emit(meta); if (chan) try { chan.postMessage({ t: 'sync' }); } catch (_) {} },
    reset() { state = seed(); seedEvents(state); BB.store.commit({ reset: true }); },
    // Swap in authoritative state from the server (no save, no broadcast) and repaint.
    replace(s, meta) { state = s; emit(Object.assign({ remote: true }, meta || {})); },
  };
  BB.seedDemo = () => { const s = seed(); const prev = state; seedEvents(s); state = prev; return s; };
  BB.stamp = () => stamp();
  BB.tick = n => tick(n);
  BB.notify = (t, b, r) => notify(t, b, r);
  BB.runAutomations = (t, c) => runAutomations(t, c);
  if (chan) chan.onmessage = () => { try { const raw = localStorage.getItem(KEY); if (raw) { state = JSON.parse(raw); emit({ remote: true }); } } catch (_) {} };

  /* ---------- lookups ---------- */
  const S = () => state;
  BB.q = {
    property: id => S().properties.find(p => p.id === id),
    guest: id => S().guests.find(g => g.id === id),
    booking: id => S().bookings.find(b => b.id === id),
    thread: id => S().threads.find(t => t.id === id),
    threadFor: bookingId => S().threads.find(t => t.bookingId === bookingId),
    integration: id => S().integrations.find(i => i.id === id),
    connected: id => !!(S().integrations.find(i => i.id === id) || {}).connected,
    guestBookings: gid => S().bookings.filter(b => b.guestId === gid).sort((a, b) => b.checkIn.localeCompare(a.checkIn)),
    live: () => S().bookings.filter(b => b.status !== 'cancelled'),
    arrivals: day => S().bookings.filter(b => b.status === 'confirmed' && b.checkIn === (day || S().today)),
    departures: day => S().bookings.filter(b => b.status !== 'cancelled' && b.checkOut === (day || S().today)),
    inHouse: day => S().bookings.filter(b => b.status === 'confirmed' && b.checkIn <= (day || S().today) && b.checkOut > (day || S().today)),
    upcoming: () => S().bookings.filter(b => b.status === 'confirmed' && b.checkIn >= S().today).sort((a, b) => a.checkIn.localeCompare(b.checkIn)),
    // nights blocked for a property (bookings + manual blocks)
    blocked(pid, ignoreId) {
      const set = new Set();
      S().bookings.forEach(b => { if (b.propertyId === pid && b.status !== 'cancelled' && b.id !== ignoreId) D.nights(b.checkIn, b.checkOut).forEach(x => set.add(x)); });
      S().blocks.forEach(k => { if (k.propertyId === pid) D.nights(k.from, k.to).forEach(x => set.add(x)); });
      return set;
    },
    nightOwner(pid, day) { return S().bookings.find(b => b.propertyId === pid && b.status !== 'cancelled' && b.checkIn <= day && b.checkOut > day) || null; },
    isAvailable(pid, a, b, ignoreId) { const bl = BB.q.blocked(pid, ignoreId); return D.nights(a, b).every(x => !bl.has(x)); },
    stays: gid => S().bookings.filter(b => b.guestId === gid && b.status !== 'cancelled' && b.status !== 'request'),
    lifetime: gid => BB.q.stays(gid).reduce((s, b) => s + b.total, 0),
    // segments for campaigns
    segments() {
      const today = S().today;
      // Imported guests carry lastStay (and stays) from the host's own records.
      const stayed = g => S().bookings.some(b => b.guestId === g.id && b.checkOut <= today) || (g.lastStay && g.lastStay <= today);
      const since = (g, d) => S().bookings.some(b => b.guestId === g.id && b.status !== 'cancelled' && b.status !== 'request' && b.checkOut > d) || (g.lastStay && g.lastStay > d);
      const past = S().guests.filter(g => g.subscribed && stayed(g));
      return {
        past: { label: 'All past guests', guests: past },
        repeat: { label: 'Repeat guests', guests: past.filter(g => BB.q.stays(g.id).length + (g.stays || 0) >= 2) },
        pets: { label: 'Dog owners', guests: past.filter(g => g.tags.includes('Pet owner') || S().bookings.some(b => b.guestId === g.id && b.pets)) },
        recent: { label: 'Stayed in the last 12 months', guests: past.filter(g => since(g, D.add(today, -365))) },
        lapsed: { label: 'No stay in 6+ months', guests: past.filter(g => !since(g, D.add(today, -180))) },
      };
    },
  };

  /* ---------- money and pricing ---------- */
  BB.money = (n, cents) => (n < 0 ? '−' : '') + '£' + Math.abs(n).toLocaleString('en-GB', { minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 });
  BB.quote = function (pid, a, b, opts) {
    opts = opts || {};
    const p = BB.q.property(pid); if (!p || !a || !b || b <= a) return null;
    const nights = D.nights(a, b);
    const lines = nights.map(x => p.nightly + ([5, 6].includes(D.dow(x)) ? p.weekend : 0));
    const nightly = lines.reduce((s, x) => s + x, 0);
    const pet = opts.pets && p.petsAllowed ? p.petFee : 0;
    const code = (opts.promo || '').trim().toUpperCase();
    const pct = S().promos[code] || 0;
    const discount = Math.round(nightly * pct / 100);
    const total = nightly + p.cleaning + pet - discount;
    const guests = (opts.adults || 2) + (opts.children || 0);
    const problems = [];
    if (nights.length < p.minNights) problems.push('Minimum stay is ' + p.minNights + ' nights.');
    if (guests > p.maxGuests) problems.push('This home sleeps ' + p.maxGuests + '.');
    if (opts.pets && !p.petsAllowed) problems.push('Pets are not allowed at this home.');
    if (!BB.q.isAvailable(pid, a, b, opts.ignoreId)) problems.push('Some of those nights are already booked.');
    const airbnb = Math.round(total * 1.142); // what the same stay costs a guest on Airbnb with the guest service fee
    return { nights: nights.length, avg: Math.round(nightly / nights.length), nightly, cleaning: p.cleaning, pet, promo: pct ? code : null, promoPct: pct, discount, total, airbnb, guestSaves: airbnb - total, hostSaves: Math.round(total * PLATFORM_FEE.airbnb), problems, ok: problems.length === 0, deposit: 200 };
  };

  /* ---------- events, notifications, automations ---------- */
  function stamp() { return S().today + 'T' + S().clock; }
  function tick(min) { const [h, m] = S().clock.split(':').map(Number); const t = Math.min(23 * 60 + 59, h * 60 + m + (min || 1)); S().clock = String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
  // kind: booking | payment | sync | message | email | sms | lock | checkin | campaign | site | system | ai
  function log(kind, source, text, ref, flow) {
    const e = { id: 'e' + (++S().seq), at: stamp(), kind, source, text, ref: ref || null, flow: flow || null };
    S().events.unshift(e); if (S().events.length > 300) S().events.length = 300;
    return e;
  }
  function notify(title, body, ref) { S().notifications.unshift({ id: 'n' + (++S().seq), at: stamp(), title, body, ref: ref || null, read: false }); if (S().notifications.length > 60) S().notifications.length = 60; }
  BB.log = log;
  const fx = (t, d) => { if (BB.fx) BB.fx(t, d); };
  function seedEvents(s) {
    const prev = state; state = s;
    s.clock = '08:40'; log('site', 'Website', 'Your 3 sites had 214 visitors overnight. 61% came from Google and AI answers, and 9 started a booking.', null);
    s.clock = '08:41'; log('message', 'Website chat', 'Priya Nair asked about bringing a dog to Larch Fell.', 't1');
    s.clock = '08:42'; log('ai', 'Assistant', 'Drafted a reply to Priya from your pet policy.', 't1');
    s.clock = '08:50'; log('ai', 'AI visibility', 'Perplexity now recommends Larch Fell Cabin for "dog friendly cabin near Windermere".', null);
    s.clock = '08:58'; log('lock', 'Nuki lock', 'Door code 4827 is active at Larch Fell for Maya Rodriguez from 4pm.', s.bookings.find(b => b.code === '4827').id);
    s.clock = '09:00'; s.notifications = [];
    notify('Maya checked in', 'ID, agreement and deposit done. Door code sent.', s.bookings.find(b => b.code === '4827').id);
    notify('Tom Becker: deposit pending', 'Check-in is waiting on the £200 hold.', s.bookings.find(b => b.guestId === 'g2' && b.checkIn === TODAY) ? s.bookings.find(b => b.guestId === 'g2' && b.checkIn === TODAY).id : null);
    state = prev || s;
  }
  function runAutomations(trigger, ctx) {
    S().automations.filter(a => a.on && a.trigger === trigger).forEach(a => {
      a.runs++;
      if (trigger === 'booking.created') {
        const g = BB.q.guest(ctx.guestId), p = BB.q.property(ctx.propertyId);
        if (BB.q.connected('email')) log('email', 'Automation: ' + a.name, 'Emailed ' + g.name + ' the confirmation' + (S().live ? '' : ' and wallet pass') + ' for ' + p.short + '.', ctx.id, ['Booking', 'Automation', 'Email']);
        if (BB.q.connected('sms')) log('sms', 'Automation: ' + a.name, 'Texted ' + g.name.split(' ')[0] + ' the check-in link.', ctx.id, ['Booking', 'Automation', 'Text']);
        if (BB.q.connected('email')) fx('email.guest', { guestId: ctx.guestId, bookingId: ctx.id, propertyId: ctx.propertyId, template: 'confirmation' });
        if (BB.q.connected('sms')) fx('sms.guest', { guestId: ctx.guestId, bookingId: ctx.id, propertyId: ctx.propertyId, template: 'checkin-link' });
      }
      if (trigger === 'checkin.completed') {
        const g = BB.q.guest(ctx.guestId), p = BB.q.property(ctx.propertyId);
        if (BB.q.connected('lock')) log('lock', 'Nuki lock', 'Created door code ' + ctx.code + ' at ' + p.short + ', active ' + D.fmt(ctx.checkIn) + ' ' + p.checkinTime + ' to ' + D.fmt(ctx.checkOut) + ' ' + p.checkoutTime + '.', ctx.id, ['Check-in', 'Automation', 'Smart lock']);
        else log('lock', 'Automation: ' + a.name, 'Smart lock is not connected, so the code ' + ctx.code + ' needs setting by hand.', ctx.id);
        if (BB.q.connected('sms')) log('sms', 'Automation: ' + a.name, 'Texted ' + g.name.split(' ')[0] + ' the code, address and Wi-Fi.', ctx.id, ['Check-in', 'Automation', 'Text']);
        if (BB.q.connected('lock')) fx('lock.code', { bookingId: ctx.id, propertyId: ctx.propertyId, code: ctx.code });
        fx(BB.q.connected('sms') ? 'sms.guest' : 'email.guest', { guestId: ctx.guestId, bookingId: ctx.id, propertyId: ctx.propertyId, template: 'door-code' });
      }
      if (trigger === 'stay.checkout') {
        const g = BB.q.guest(ctx.guestId);
        if (a.id === 'a4') fx('email.guest', { guestId: ctx.guestId, bookingId: ctx.id, propertyId: ctx.propertyId, template: 'checkout-review', code: g.name.split(' ')[0].toUpperCase() + '10' });
        if (a.id === 'a4') log('email', 'Automation: ' + a.name, 'Sent ' + g.name + ' the checkout list, a rating request and come-back code ' + g.name.split(' ')[0].toUpperCase() + '10.', ctx.id, ['Checkout', 'Automation', 'Email']);
        if (a.id === 'a5') { if (g.subscribed) log('campaign', 'Automation: ' + a.name, g.name + ' is on your guest list, tagged ' + BB.q.property(ctx.propertyId).short + '.', ctx.id); }
        S().promos[g.name.split(' ')[0].toUpperCase() + '10'] = 10;
      }
      if (trigger === 'arrival.minus3') {
        const g = BB.q.guest(ctx.guestId);
        if (BB.q.connected('email')) fx('email.guest', { guestId: ctx.guestId, bookingId: ctx.id, propertyId: ctx.propertyId, template: 'checkin-reminder' });
        if (BB.q.connected('email')) log('email', 'Automation: ' + a.name, 'Reminded ' + g.name + ' to check in before ' + D.fmt(ctx.checkIn) + '.', ctx.id, ['Schedule', 'Automation', 'Email']);
      }
    });
  }

  /* ---------- actions ---------- */
  const A = (BB.act = {});
  function findOrCreateGuest(info, source) {
    const email = (info.email || '').trim().toLowerCase();
    let g = email && S().guests.find(x => x.email.toLowerCase() === email);
    if (!g && info.name) g = S().guests.find(x => x.name.toLowerCase() === info.name.trim().toLowerCase());
    if (g) { if (info.phone) g.phone = info.phone; return { g, isNew: false }; }
    g = { id: 'g' + (++S().seq), name: (info.name || 'Guest').trim(), email: email || 'guest@example.com', phone: info.phone || '', city: info.city || '', tags: info.pets ? ['Pet owner'] : [], subscribed: info.subscribe !== false, notes: '', source: source, createdAt: S().today };
    S().guests.push(g); return { g, isNew: true };
  }
  // Create a booking from any surface. channel: direct | airbnb | vrbo | booking. Returns {ok, booking, error}
  A.createBooking = function (input) {
    const p = BB.q.property(input.propertyId);
    const q = BB.quote(input.propertyId, input.checkIn, input.checkOut, input);
    if (!q) return { ok: false, error: 'Pick your dates.' };
    if (!q.ok) return { ok: false, error: q.problems[0] };
    const channel = input.channel || 'direct';
    if (channel === 'direct' && !BB.q.connected('stripe') && input.pay !== 'manual') return { ok: false, error: 'Online payments are paused because Stripe is disconnected. The host can take this booking as a request.' };
    const { g, isNew } = findOrCreateGuest(input, input.source || (channel === 'direct' ? 'website' : channel));
    const prefix = { laurel: 'LR', lakeside: 'LA', loft: 'LX' }[p.id] || p.name.replace(/[^A-Z]/g, '').slice(0, 2) || 'BB';
    let bid = prefix + '-' + (2300 + S().bookings.length); while (BB.q.booking(bid)) bid = prefix + '-' + (+bid.split('-')[1] + 1);
    const pending = !!input.pending && channel === 'direct';
    const request = !pending && !!input.request && S().live && channel === 'direct';
    const b = {
      id: bid, propertyId: p.id, guestId: g.id, checkIn: input.checkIn, checkOut: input.checkOut,
      adults: input.adults || 2, children: input.children || 0, pets: input.pets ? 1 : 0, channel, status: pending ? 'pending' : request ? 'request' : 'confirmed',
      price: { nightly: q.nightly, cleaning: q.cleaning, pet: q.pet, discount: q.discount }, total: q.total, platformFee: Math.round(q.total * PLATFORM_FEE[channel]),
      paid: !pending && !request && (channel !== 'direct' || input.pay !== 'manual'), createdAt: S().today, deposit: 'none', promo: q.promo,
      checkin: { id: false, selfie: false, guests: false, agreement: false, signature: null, deposit: false, arrival: null, done: false },
      code: p.lockPrefix + String(10 + ((S().seq * 37) % 89)), review: null, source: input.source || 'website',
    };
    if (input.extras) b.extras = input.extras;
    S().bookings.push(b); tick(1);
    if (pending) {
      b.holdUntil = Date.now() + 30 * 60e3;
      log('booking', p.domain, g.name + ' is paying for ' + p.short + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + ' (' + BB.money(b.total) + '). The dates are held for 30 minutes.', b.id, ['Booking site', 'Stripe']);
      if (isNew) log('campaign', 'Guest list', g.name + ' added as a new guest' + (g.subscribed ? ' and subscribed to emails.' : '.'), g.id);
      let t0 = BB.q.threadFor(b.id); if (!t0) { t0 = { id: 't' + (++S().seq), guestId: g.id, bookingId: b.id, channel, unread: 0, messages: [] }; S().threads.push(t0); }
      BB.store.commit({ type: 'booking', id: b.id });
      return { ok: true, booking: b, guest: g, pending: true };
    }
    if (request) {
      log('booking', p.domain, 'Booking request from ' + g.name + ': ' + p.short + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + ', ' + BB.money(b.total) + '. The dates are held until you accept or decline.', b.id, ['Booking site', 'Host console']);
      if (isNew) log('campaign', 'Guest list', g.name + ' added as a new guest' + (g.subscribed ? ' and subscribed to emails.' : '.'), g.id);
      notify('Booking request · ' + BB.money(b.total), g.name + ' asked for ' + p.short + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + '. Accept or decline it.', b.id);
      let tr = BB.q.threadFor(b.id); if (!tr) { tr = { id: 't' + (++S().seq), guestId: g.id, bookingId: b.id, channel, unread: 0, messages: [] }; S().threads.push(tr); }
      const note = 'Hi ' + g.name.split(' ')[0] + ', thanks for your request for ' + p.name + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + '. Your dates are held while ' + (String(S().account.owner || '').split(' ')[0] || 'your host') + ' checks. You will hear back soon. Nothing has been charged.';
      tr.messages.push({ from: 'auto', text: note, at: stamp() });
      fx('email.guest', { guestId: g.id, bookingId: b.id, template: 'message', subject: 'Your request for ' + p.name, text: note });
      fx('email.host', { bookingId: b.id, kind: 'request' });
      BB.store.commit({ type: 'booking', id: b.id });
      return { ok: true, booking: b, guest: g, request: true };
    }
    const src = input.source === 'console' ? 'Host console' : input.source === 'mobile' ? 'Host app' : input.source === 'guest-app' ? 'Guest app · ' + p.domain : input.source === 'campaign' ? 'Campaign · ' + p.domain : channel === 'direct' ? p.domain : BB.CHANNEL[channel];
    log('booking', src, (channel === 'direct' ? 'New direct booking: ' : 'New ' + BB.CHANNEL[channel] + ' booking: ') + g.name + ', ' + p.short + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + ', ' + BB.money(b.total) + (q.promo ? ' with code ' + q.promo : '') + '.', b.id, ['Booking site', 'Bookingbooster']);
    if (channel === 'direct' && b.paid) log('payment', 'Stripe', 'Charged ' + BB.money(b.total) + ' to ' + g.name.split(' ')[0] + "'s card. Payout lands in 2 days.", b.id, ['Bookingbooster', 'Stripe']);
    if (isNew) log('campaign', 'Guest list', g.name + ' added as a new guest' + (g.subscribed ? ' and subscribed to emails.' : '.'), g.id);
    runAutomations('booking.created', b);
    notify((channel === 'direct' ? 'New direct booking · ' : 'New ' + BB.CHANNEL[channel] + ' booking · ') + BB.money(b.total), g.name + ' booked ' + p.short + ', ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + (channel === 'direct' ? '. You saved ' + BB.money(Math.round(b.total * PLATFORM_FEE.airbnb)) + ' in fees.' : '.'), b.id);
    let t = BB.q.threadFor(b.id);
    if (!t) { t = { id: 't' + (++S().seq), guestId: g.id, bookingId: b.id, channel, unread: 0, messages: [] }; S().threads.push(t); }
    t.messages.push({ from: 'auto', text: 'Hi ' + g.name.split(' ')[0] + ', you are booked at ' + p.name + ' for ' + D.fmt(b.checkIn) + '–' + D.fmt(b.checkOut) + '. Check in online any time before you arrive.', at: stamp() });
    // campaign attribution
    if (q.promo) { const c = S().campaigns.find(c => c.body.promo === q.promo && c.status === 'sent'); if (c) { c.bookings++; c.revenue += b.total; log('campaign', 'Campaigns', 'Booking ' + b.id + ' credited to the "' + c.name + '" campaign.', c.id); } }
    BB.store.commit({ type: 'booking', id: b.id });
    return { ok: true, booking: b, guest: g };
  };
  A.cancelBooking = function (id, by) {
    const b = BB.q.booking(id); if (!b) return;
    const wasPaid = b.paid && b.channel === 'direct';
    b.status = 'cancelled'; tick(1);
    if (wasPaid) fx('payment.refund', { bookingId: id });
    log('booking', by || 'Host console', 'Cancelled ' + b.id + ' for ' + BB.q.guest(b.guestId).name + '. Refunded ' + BB.money(b.total) + '.', b.id);
    BB.store.commit({ type: 'booking', id });
  };
  // Guest check-in progress. patch keys: id, selfie, guests, agreement, signature, deposit, arrival
  A.checkin = function (id, patch) {
    const b = BB.q.booking(id); if (!b) return;
    Object.assign(b.checkin, patch); tick(1);
    const g = BB.q.guest(b.guestId);
    if (patch.id) log('checkin', 'Guest app', g.name + ' verified their ID.', b.id, ['Guest app', 'ID check']);
    if (patch.agreement) log('checkin', 'Guest app', g.name + ' signed the rental agreement.', b.id, ['Guest app', 'Agreement']);
    if (patch.deposit) { fx('payment.deposit', { bookingId: id }); b.deposit = 'held'; log('payment', 'Stripe', 'Placed a ' + BB.money(200) + ' deposit hold on ' + g.name.split(' ')[0] + "'s card, released 3 days after checkout.", b.id, ['Guest app', 'Stripe']); }
    if (patch.arrival) log('checkin', 'Guest app', g.name + ' will arrive ' + patch.arrival + '.', b.id);
    const c = b.checkin;
    if (!c.done && c.id && c.selfie && c.guests && c.agreement && c.deposit) {
      c.done = true; c.arrival = c.arrival || '4–6pm';
      log('checkin', 'Guest app', g.name + ' finished check-in for ' + BB.q.property(b.propertyId).short + '.', b.id, ['Guest app', 'Bookingbooster']);
      runAutomations('checkin.completed', b);
      notify(g.name.split(' ')[0] + ' checked in', 'ID, agreement and deposit done. Door code sent.', b.id);
    }
    BB.store.commit({ type: 'checkin', id });
  };
  A.review = function (id, stars, text, pub) {
    const b = BB.q.booking(id); if (b.review && S().live) return; // one review per stay
    b.review = { stars, text: text || '', at: S().today, public: !!pub }; tick(1);
    if (S().live) { // a real home's rating comes only from guests who chose to publish theirs
      const p = BB.q.property(b.propertyId), shown = S().bookings.filter(x => x.propertyId === p.id && x.review && x.review.public);
      p.reviews = shown.length; p.rating = shown.length ? Math.round(shown.reduce((n, x) => n + x.review.stars, 0) / shown.length * 100) / 100 : 0;
    }
    log('checkin', 'Guest app', BB.q.guest(b.guestId).name + ' rated their stay ' + stars + ' stars.', b.id);
    if (stars <= 3) notify('Private feedback from ' + BB.q.guest(b.guestId).name.split(' ')[0], '“' + (text || 'No comment') + '”', b.id);
    BB.store.commit({ type: 'review', id });
  };
  A.joinList = function (gid) { const g = BB.q.guest(gid); g.subscribed = true; log('campaign', 'Guest app', g.name + ' joined the guest list.', gid); BB.store.commit({ type: 'guest', id: gid }); };
  // Messages. from: guest | host
  A.sendMessage = function (threadId, from, text, via) {
    const t = BB.q.thread(threadId); if (!t || !text.trim()) return;
    tick(2); t.messages.push({ from, text: text.trim(), at: stamp() });
    const g = BB.q.guest(t.guestId);
    if (from === 'guest') { t.unread = (t.unread || 0) + 1; log('message', via || 'Guest app', g.name + ': “' + text.trim().slice(0, 80) + '”', threadId); notify('Message from ' + g.name.split(' ')[0], text.trim().slice(0, 90), threadId); }
    else { t.unread = 0; fx('email.guest', { guestId: t.guestId, bookingId: t.bookingId, threadId, template: 'message', text: text.trim() }); log('message', via || 'Host console', 'You replied to ' + g.name + (t.channel !== 'direct' ? ' through ' + BB.CHANNEL[t.channel] : '') + '.', threadId, [via || 'Host console', t.channel === 'direct' ? 'Guest app + email' : BB.CHANNEL[t.channel]]); }
    BB.store.commit({ type: 'message', id: threadId });
  };
  A.openThread = function (gid, bookingId) {
    let t = bookingId ? BB.q.threadFor(bookingId) : S().threads.find(x => x.guestId === gid);
    if (!t) { t = { id: 't' + (++S().seq), guestId: gid, bookingId: bookingId || null, channel: 'direct', unread: 0, messages: [] }; S().threads.push(t); BB.store.commit({}); }
    return t;
  };
  A.markRead = function (threadId) { const t = BB.q.thread(threadId); if (t && t.unread) { t.unread = 0; BB.store.commit({ quiet: true }); } };
  // Suggested reply from the property facts
  BB.suggestReply = function (threadId) {
    const t = BB.q.thread(threadId); if (!t) return '';
    const last = [...t.messages].reverse().find(m => m.from === 'guest'); if (!last) return '';
    const b = t.bookingId && BB.q.booking(t.bookingId); const p = b ? BB.q.property(b.propertyId) : S().properties[0];
    const g = BB.q.guest(t.guestId).name.split(' ')[0]; const m = last.text.toLowerCase();
    if (/dog|pet|cat/.test(m)) return p.petsAllowed ? 'Hi ' + g + ', yes! One well-behaved dog is very welcome. There is a £' + p.petFee + ' pet fee and I will leave out a bowl, a towel and some treats.' : 'Hi ' + g + ', sorry, ' + p.short + ' is not able to host pets. Larch Fell Cabin in the Lake District is dog friendly if that helps.';
    if (/park/.test(m)) return 'Hi ' + g + ', yes. Parking: ' + p.parking.charAt(0).toLowerCase() + p.parking.slice(1) + '.';
    if (/wifi|wi-fi|internet/.test(m) && p.wifi && p.wifi.ssid) return 'Hi ' + g + ', the Wi-Fi is ' + p.wifi.ssid + ' and the password is ' + p.wifi.pw + '.';
    if (/early|drop|bags|late/.test(m)) return 'Hi ' + g + ', that should work. I will set your door code to start a little earlier.';
    if (/check.?in|arriv|code/.test(m)) return 'Hi ' + g + ', check-in is from ' + p.checkinTime + '. Your door code arrives once online check-in is done.';
    return 'Hi ' + g + ', thanks for the message! Happy to help with that.';
  };
  // Campaigns
  A.saveCampaign = function (c) {
    const ex = S().campaigns.find(x => x.id === c.id);
    if (ex) Object.assign(ex, c); else { c.id = 'c' + (++S().seq); Object.assign(c, { status: 'draft', recipients: 0, opens: 0, clicks: 0, bookings: 0, revenue: 0, sentAt: null }); S().campaigns.unshift(c); }
    if (c.body && c.body.promo) S().promos[c.body.promo.toUpperCase()] = c.body.pct || S().promos[c.body.promo.toUpperCase()] || 10;
    BB.store.commit({ type: 'campaign', id: c.id }); return c.id;
  };
  A.sendCampaign = function (id, opts) {
    const c = S().campaigns.find(x => x.id === id); if (!c) return;
    const seg = BB.q.segments()[c.segment] || BB.q.segments().past;
    const real = seg.guests.length, scale = c.segment === 'past' ? 412 / Math.max(real, 1) : c.segment === 'repeat' ? 212 / Math.max(real, 1) : 1;
    if (S().live) { c.recipients = real; c.opens = 0; c.clicks = 0; c.status = 'sent'; c.sentAt = S().today; tick(1); }
    else { c.recipients = Math.max(real, Math.round(real * scale)); c.status = 'sent'; c.sentAt = S().today; tick(1);
    c.opens = Math.round(c.recipients * 0.56); c.clicks = Math.round(c.recipients * 0.13); }
    const via = (opts && opts.sms) ? 'email and text' : 'email';
    log('campaign', 'Campaigns', 'Sent "' + c.subject + '" to ' + c.recipients + ' guests by ' + via + '.', c.id, ['Campaigns', 'Email', opts && opts.sms ? 'Text' : null].filter(Boolean));
    if (!BB.q.connected('email')) log('system', 'Campaigns', 'Email sending is disconnected, so the send is queued until it is reconnected.', c.id);
    else fx('campaign.send', { id: c.id, sms: !!(opts && opts.sms) });
    notify('Campaign sent', '"' + c.subject + '" is on its way to ' + c.recipients + ' guests.', c.id);
    BB.store.commit({ type: 'campaign', id });
  };
  // Simulate guests responding to a sent campaign: creates real direct bookings using the promo code.
  A.simulateCampaign = function (id) {
    const c = S().campaigns.find(x => x.id === id); if (!c || c.status !== 'sent') return 0;
    const seg = (BB.q.segments()[c.segment] || BB.q.segments().past).guests;
    const p = BB.q.property(c.body.propertyId || 'laurel');
    let made = 0, start = D.add(S().today, 5);
    for (const g of seg) {
      if (made >= 2) break;
      for (let d = start; d < D.add(S().today, 70); d = D.add(d, 1)) {
        const end = D.add(d, Math.max(p.minNights, 2));
        if (BB.q.isAvailable(p.id, d, end)) {
          const r = A.createBooking({ propertyId: p.id, checkIn: d, checkOut: end, name: g.name, email: g.email, adults: 2, promo: c.body.promo, source: 'campaign' });
          if (r.ok) { made++; start = D.add(end, 2); }
          break;
        }
      }
    }
    c.opens = Math.min(c.recipients, c.opens + Math.round(c.recipients * 0.03)); c.clicks += made * 3;
    BB.store.commit({ type: 'campaign', id }); return made;
  };
  A.toggleAutomation = function (id) { const a = S().automations.find(x => x.id === id); a.on = !a.on; log('system', 'Automations', '"' + a.name + '" turned ' + (a.on ? 'on' : 'off') + '.', id); BB.store.commit({ type: 'automation' }); };
  // Integrations
  A.toggleIntegration = function (id) {
    const i = BB.q.integration(id); i.connected = !i.connected; i.lastSync = i.connected ? stamp() : i.lastSync; tick(1);
    if (i.addon) {
      if (!i.connected) S().blocks = S().blocks.filter(k => k.sync !== id); // dates read from that calendar are no longer blocked
      log('sync', i.name, i.connected ? 'Calendar sync on for your ' + i.name + '. Dates booked there will be blocked on your sites.' : 'Calendar sync off for your ' + i.name + '. Its dates are no longer blocked on your sites.', id);
    } else log('sync', i.name, i.connected ? 'Connected ' + i.name + '.' : 'Disconnected ' + i.name + '. Anything that depends on it pauses.', id);
    BB.store.commit({ type: 'integration', id });
  };
  // Calendar sync add-on: read a channel manager, Airbnb, Vrbo or Booking.com calendar link (iCal).
  // The first check after a while finds dates booked there and blocks them as "Booked on Airbnb". It sees dates only, never guests, prices or messages.
  // Returns the new block {propertyId, from, to, note, sync} or null when nothing changed.
  A.syncChannel = function (id) {
    const i = BB.q.integration(id); if (!i || !i.connected) return null;
    if (S().live) { i.lastSync = stamp(); log('sync', i.name, 'Checking your calendar links now.', id); fx('ical.sync', { id }); BB.store.commit({ type: 'sync' }); return null; }
    i.lastSync = stamp(); tick(1);
    const plan = { cm: ['laurel', 2], airbnb: ['loft', 3], vrbo: ['lakeside', 3], booking: ['loft', 2] }[id];
    let made = null;
    if (plan && !S().blocks.some(k => k.sync === id)) {
      const p = BB.q.property(plan[0]);
      for (let d = D.add(S().today, 9); d < D.add(S().today, 60); d = D.add(d, 1)) {
        const end = D.add(d, plan[1]);
        if (BB.q.isAvailable(p.id, d, end)) {
          made = { propertyId: p.id, from: d, to: end, note: BB.bookedOn(id), sync: id };
          S().blocks.push(made);
          log('sync', i.name, BB.bookedOn(id) + ': ' + D.fmt(d) + '–' + D.fmt(end) + ' at ' + p.short + '. Those nights are now blocked on ' + p.domain + ' so you never double book.', p.id, [i.name, 'Your calendar', p.domain]);
          break;
        }
      }
    }
    if (!made) log('sync', i.name, 'Calendar checked. No new dates.', id);
    BB.store.commit({ type: 'sync' });
    return made;
  };
  A.block = function (pid, from, to, note) { S().blocks.push({ propertyId: pid, from, to, note: note || 'Blocked' }); log('sync', 'Host console', 'Blocked ' + D.fmt(from) + '–' + D.fmt(to) + ' at ' + BB.q.property(pid).short + ' on your booking sites.', pid); BB.store.commit({ type: 'calendar' }); };
  A.unblock = function (pid, day) { S().blocks = S().blocks.filter(k => !(k.propertyId === pid && k.from <= day && k.to > day)); BB.store.commit({ type: 'calendar' }); };
  // Website and properties
  A.updateProperty = function (pid, patch, quiet) {
    const p = BB.q.property(pid); Object.assign(p, patch); tick(1);
    if (!quiet) log('site', 'Website editor', 'Published changes to ' + p.domain + ' (' + Object.keys(patch).join(', ') + ').', pid, ['Website editor', p.domain]);
    BB.store.commit({ type: 'property', id: pid });
  };
  A.addProperty = function (data) {
    const id = (data.name || 'home').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) + '-' + (++S().seq);
    const blank = S().live ? { wifi: { ssid: '', pw: '' }, address: '', entry: '', amenities: [], parking: '' } : {}; // live homes start empty, the host fills in real details
    const p = Object.assign({ id, short: data.name.split(' ').slice(0, 2).join(' '), theme: 'cabin', nightly: 145, weekend: 25, cleaning: 65, petFee: 0, petsAllowed: false, maxGuests: 4, bedrooms: 2, baths: 1, minNights: 2, lockPrefix: '66', wifi: { ssid: 'Guest', pw: 'welcome123' }, amenities: ['Fast Wi-Fi', 'Self check-in', 'Free parking'], rules: ['Quiet hours are 10 pm to 8 am.', 'No parties or events.'], parking: 'Driveway', checkinTime: '4 pm', checkoutTime: '11 am', rating: 4.9, reviews: 0, published: true, color: '#3355FF', headline: 'Book direct and save.', sub: '', about: '', area: '' }, blank, data, { id });
    S().properties.push(p); S().website.visitors[id] = 0;
    if (S().live) { S().account.onboarded = true; if (BB.aiQuestionsFor) S().ai.questions.push(...BB.aiQuestionsFor(p)); fx('property.added', { propertyId: id }); }
    log('site', 'Onboarding', 'Imported ' + p.name + ' with photos, ' + p.reviews + ' reviews and house rules.', id, ['Listing link', 'Bookingbooster']);
    log('site', 'Website builder', p.domain + ' is live with booking, check-in and SEO pages.', id, ['Bookingbooster', p.domain]);
    BB.store.commit({ type: 'property', id }); return p;
  };
  A.completeAiTask = function (taskId) {
    const t = S().ai.tasks.find(x => x.id === taskId); if (!t || t.done) return; t.done = true; tick(1);
    t.fixes.forEach(i => { const q = S().ai.questions[i]; if (q) { const k = Object.keys(q.engines).find(e => !q.engines[e]); if (k) q.engines[k] = true; } });
    log('ai', 'AI visibility', 'Done: ' + t.text + '. Re-checking answers in ChatGPT, Gemini, Perplexity and Google.', taskId, ['Website', 'AI answers']);
    BB.store.commit({ type: 'ai' });
  };
  BB.aiScore = function () { const qs = S().ai.questions; let hit = 0, all = 0; qs.forEach(q => Object.values(q.engines).forEach(v => { all++; if (v) hit++; })); return { score: Math.round(100 * hit / all), mentioned: qs.filter(q => q.engines.chatgpt || q.engines.gemini).length, total: qs.length }; };
  // Time: move the demo clock to the next morning, run arrivals, departures and scheduled automations.
  A.nextDay = function () {
    const s = S(); const today = s.today;
      s.today = D.add(today, 1); s.clock = '09:00';
    s.bookings.forEach(b => {
      if (b.status === 'confirmed' && b.checkOut <= s.today) { b.status = 'completed'; log('booking', 'Bookingbooster', BB.q.guest(b.guestId).name + ' checked out of ' + BB.q.property(b.propertyId).short + '.', b.id); runAutomations('stay.checkout', b); if (b.deposit === 'held') b.deposit = 'releasing'; if (BB.q.connected('cleaner')) log('system', 'Turno', 'Scheduled a clean at ' + BB.q.property(b.propertyId).short + ' for 11 am.', b.id); }
    });
    s.bookings.filter(b => b.status === 'confirmed' && b.checkIn === D.add(s.today, 3) && !b.checkin.done).forEach(b => runAutomations('arrival.minus3', b));
    s.bookings.filter(b => b.status === 'confirmed' && b.checkIn === s.today).forEach(b => notify(BB.q.guest(b.guestId).name.split(' ')[0] + ' arrives today', BB.q.property(b.propertyId).short + (b.checkin.done ? ' · checked in, code active from ' + BB.q.property(b.propertyId).checkinTime : ' · check-in not finished'), b.id));
    s.campaigns.filter(c => c.status === 'scheduled' && c.sentAt <= s.today).forEach(c => A.sendCampaign(c.id));
    if (!s.live) log('system', 'Demo clock', 'Moved to ' + D.fmt(s.today, { weekday: 'long', month: 'long' }) + '.', null);
    BB.store.commit({ type: 'clock' });
  };
  A.readNotifications = function () { S().notifications.forEach(n => n.read = true); BB.store.commit({ quiet: true }); };
  A.updateGuest = function (gid, patch) { Object.assign(BB.q.guest(gid), patch); BB.store.commit({ type: 'guest', id: gid }); };

  /* ---------- metrics used by dashboards ---------- */
  BB.metrics = function (opts) {
    const s = S(); const today = s.today; const from30 = D.add(today, -30);
    const live = s.bookings.filter(b => b.status !== 'cancelled' && b.status !== 'request');
    // revenue earned per night, so stays that cross a month boundary split properly
    const byMonth = {};
    const firstStay = {}; live.slice().sort((a, b) => a.checkIn.localeCompare(b.checkIn)).forEach(b => { if (!firstStay[b.guestId]) firstStay[b.guestId] = b.id; });
    const isReturning = b => firstStay[b.guestId] !== b.id;
    live.forEach(b => { const per = b.total / D.diff(b.checkIn, b.checkOut); D.nights(b.checkIn, b.checkOut).forEach(n => { const m = D.month(n); byMonth[m] = byMonth[m] || { direct: 0, platforms: 0, newGuests: 0, returning: 0 }; byMonth[m][b.channel === 'direct' ? 'direct' : 'platforms'] += per; byMonth[m][isReturning(b) ? 'returning' : 'newGuests'] += per; }); });
    const rev30 = live.filter(b => b.createdAt > from30 || (b.checkIn > from30 && b.checkIn <= today)).reduce((x, b) => x + b.total, 0);
    const year = live.filter(b => b.checkIn >= (s.live ? today.slice(0, 4) : '2026') + '-01-01');
    const directYear = year.filter(b => b.channel === 'direct');
    const recent = live.filter(b => b.checkIn > D.add(today, -180));
    const share = recent.length ? recent.filter(b => b.channel === 'direct').reduce((x, b) => x + b.total, 0) / recent.reduce((x, b) => x + b.total, 0) : 0;
    const saved = directYear.reduce((x, b) => x + Math.round(b.total * PLATFORM_FEE.airbnb), 0);
    const nextNights = D.nights(today, D.add(today, 30));
    let booked = 0; s.properties.forEach(p => { const bl = BB.q.blocked(p.id); nextNights.forEach(n => { if (bl.has(n)) booked++; }); });
    const occ = booked / (nextNights.length * s.properties.length);
    const months = Object.keys(byMonth).filter(m => m >= (s.live ? D.month(D.add(today, -150)) : '2026-06') && m <= D.month(D.add(today, 45))).sort();
    const recentDirect = recent.filter(b => b.channel === 'direct');
    const returningShare = recentDirect.length ? recentDirect.filter(isReturning).length / recentDirect.length : 0;
    const directYearRevenue = directYear.reduce((x, b) => x + b.total, 0);
    const visitors = Object.values(s.website.visitors || {}).reduce((x, v) => x + v, 0);
    return { rev30: Math.round(rev30), share, saved, occ, byMonth, months, directYearCount: directYear.length, directYearRevenue, returningShare, isReturning, visitors, conversion: s.website.conversion };
  };

  state = load();
})();
