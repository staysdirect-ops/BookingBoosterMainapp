/* Bookingbooster prototype: guest app. The phone web app a guest uses from booking to checkout, in the property's own brand.
   Book (dates, guests, promo, details, pay) → confirmed → trip home → check-in (ID, agreement, deposit, arrival) → door code,
   messages with the host, stay guide with paid extras, checkout with a private rating and a come-back code. */
(function () {
  const BB = window.BB, D = BB.D, esc = BB.esc, money = BB.money;
  const S = () => BB.store.get();

  /* ---------- module actions ---------- */
  // A paid extra bought in the guest app: adds to the booking total and logs the card charge.
  // Private rating from the guest app. Rating also unlocks the guest's come-back code.

  /* ---------- property brand ---------- */
  const THEMES = {
    cabin: { acc: '#2F5D46', soft: '#E7F0EA', deep: '#1D3B2C', disp: "'Fraunces', Georgia, serif", w: 600 },
    lake: { acc: '#0F6E8C', soft: '#E3F1F5', deep: '#0A3F52', disp: "'Cormorant Garamond', Georgia, serif", w: 600 },
    city: { acc: '#E4573D', soft: '#FCEAE5', deep: '#40211B', disp: "'Outfit', 'Helvetica Neue', Arial, sans-serif", w: 600 },
  };
  const theme = p => THEMES[p.theme] || THEMES.cabin;
  const themeVars = p => { const t = theme(p); const acc = THEMES[p.theme] ? t.acc : (p.color || t.acc); return '--g-acc:' + acc + ';--g-soft:' + t.soft + ';--g-deep:' + t.deep + ';--g-disp:' + t.disp + ';--g-dw:' + t.w; };
  const art = (p, tag) => '<div class="g-photo a-' + esc(p.theme || 'cabin') + '" aria-hidden="true"><i class="s1"></i><i class="s2"></i><i class="s3"></i><i class="s4"></i><i class="s5"></i><i class="s6"></i>' + (tag ? '<span class="g-tag">' + tag + '</span>' : '') + '</div>';

  const PICKS = {
    laurel: [['Wansfell Pike', 'A short Wainwright from the back gate. Two hours up and back'], ['Ambleside', '10 minute drive. Cafés, gear shops and the lake steamers'], ['The Mortal Man', 'Our village pub. Real ales and a fire, a 5 minute walk']],
    lakeside: [['Porthminster Beach', 'Two minutes down the steps. Calmest before 9am'], ['Tate St Ives', 'Ten minute walk along the harbour front'], ['Harbour fish and chips', 'Eat them on the wall, and watch out for the gulls']],
    loft: [['Roman Baths', 'Five minute walk. Book the first slot of the day'], ['Thermae Bath Spa', 'Rooftop pool with views over the city'], ["Sally Lunn's", 'The famous Bath bun, two streets away']],
  };
  const EXTRAS = {
    cabin: [['Late checkout, 1pm', 35, 'Available for your dates'], ['Log basket', 15, 'Left by the wood burner before you arrive']],
    lake: [['Late checkout, 1pm', 35, 'Available for your dates'], ['Log basket', 15, 'Stacked by the fire pit on the terrace']],
    city: [['Late checkout, 1pm', 35, 'Available for your dates'], ['Bakery breakfast box', 15, 'Pastries and coffee at 8am']],
  };
  const CHECKOUT = {
    cabin: ['Start the dishwasher', 'Cover the hot tub', 'Let the wood burner go out'],
    lake: ['Start the dishwasher', 'Rinse the kayaks and put them in the boat store', 'Put out the fire pit'],
    city: ['Start the dishwasher', 'Leave the parking permit on the counter', 'Close the sash windows'],
  };
  function manual(a, p) {
    const m = a.toLowerCase();
    const R = [[/hot tub/, 'heart', 'Cover off, jets on the side panel. Closes at 10pm.'], [/wood burner|fireplace/, 'bolt', 'Kindling and logs are in the log store. Keep the door shut while it burns.'], [/wi-?fi/, 'wifi', 'Router is in the cupboard under the stairs if it needs a restart.'],
      [/dog|pet/, 'dog', 'Bowls and towels are in the boot room.'], [/parking|permit/, 'car', p.parking + '.'], [/self check-in/, 'key', 'Your door code works for the whole stay.'],
      [/kayak|paddle/, 'pin', 'Buoyancy aids hang in the boat store.'], [/terrace/, 'home', 'Best at sunset. Bring the cushions in if it rains.'], [/fire pit/, 'bolt', 'Logs are in the store by the gate. Put it out before bed.'],
      [/king bed/, 'home', 'Extra pillows are in the wardrobe.'], [/roll-top|bath/, 'heart', 'Bath oils and fresh towels are on the shelf.'], [/espresso|coffee/, 'spark', 'Beans are in the left cupboard.'], [/washer|dryer/, 'sync', 'Detergent pods are on the shelf above.']];
    const r = R.find(x => x[0].test(m)); return r ? [r[1], r[2]] : ['home', 'Ask your host in Messages.'];
  }

  /* ---------- helpers ---------- */
  const first = n => String(n || '').split(' ')[0];
  const nightsWord = n => n + (n === 1 ? ' night' : ' nights');
  const partyText = b => { const a = b.adults + (b.adults === 1 ? ' adult' : ' adults'); return a + (b.children ? ', ' + b.children + (b.children === 1 ? ' child' : ' children') : '') + (b.pets ? ' + dog' : ''); };
  const longDate = d => D.fmt(d, { weekday: 'short' });
  function countdown(b) {
    const t = S().today;
    if (b.status === 'cancelled') return 'Cancelled';
    if (b.status === 'completed' || b.checkOut < t) return 'Stay complete';
    if (b.checkOut === t) return 'Checkout today';
    if (b.checkIn <= t) return 'Staying now';
    const n = D.diff(t, b.checkIn);
    return n === 1 ? 'Arrival tomorrow' : 'Arrival in ' + n + ' days';
  }
  function firstOpen(b) {
    const c = b.checkin;
    if (!(c.id && c.selfie && c.guests)) return 1;
    if (!c.agreement) return 2;
    if (!c.deposit) return 3;
    return 5;
  }
  const doneCount = b => { const c = b.checkin; return [c.id && c.selfie && c.guests, c.agreement, c.deposit, c.done && c.arrival].filter(Boolean).length; };
  function priyaBooking() {
    const g = S().guests.find(x => x.name === 'Priya Nair');
    const list = g ? S().bookings.filter(b => b.guestId === g.id && b.propertyId === 'laurel' && b.status === 'confirmed' && b.checkOut > S().today).sort((a, b) => a.checkIn.localeCompare(b.checkIn)) : [];
    return list[0] || BB.q.upcoming()[0] || null;
  }
  const stepView = s => ({ checkin: 'checkin', messages: 'messages', guide: 'guide', checkout: 'checkout', trip: 'trip', book: 'book' }[s] || null);
  const ARRIVALS = ['3–4pm', '4–6pm', '6–8pm', 'Later'];
  const stayStarted = b => b.checkIn <= S().today || b.status === 'completed';

  /* ---------- state transitions ---------- */
  function newStay(inst, pid, promo) {
    const p = BB.q.property(pid) || S().properties[0];
    Object.assign(inst.st, {
      view: 'book', bid: null, pid: p.id, err: null, paying: false, request: false,
      bk: { a: null, b: null, month: D.month(S().today), adults: 2, children: 0, pets: 0, promo: promo || '' },
      form: inst.st.form || { name: 'Olivia Bennett', email: 'olivia.bennett@outlook.com', phone: '07700 900461', optin: true },
      card: { num: '4242 4242 4242 4242', exp: '12 / 28', cvc: '123', post: 'BA1 1LZ' },
    });
  }
  function openBooking(inst, bid, view) {
    const b = BB.q.booking(bid); if (!b) return false;
    const t = BB.q.threadFor(bid);
    Object.assign(inst.st, {
      bid, pid: b.propertyId, view: view || 'trip', ci: null, idImg: null, selfie: 'idle', names: null, rules: {}, strokes: [], arrPick: null,
      draft: '', dir: false, extraAsk: null, out: {}, stars: 0, comment: '', err: null,
      seen: Object.assign(inst.st.seen || {}, t ? { [t.id]: t.messages.length } : {}),
    });
    if (inst.st.view === 'checkin') inst.st.ci = firstOpen(b);
    return true;
  }
  function apply(inst, opts) {
    opts = opts || {};
    if (opts.bookingId && openBooking(inst, opts.bookingId, stepView(opts.step) || 'trip')) return;
    if (opts.propertyId || opts.step === 'book' || inst.embedded) { newStay(inst, opts.propertyId || 'laurel'); return; }
    const pb = priyaBooking();
    if (pb) openBooking(inst, pb.id, stepView(opts.step) || 'trip'); else newStay(inst, 'laurel');
  }
  function go(inst, view) {
    const st = inst.st, b = st.bid && BB.q.booking(st.bid);
    const patch = { view, err: null, dir: false, extraAsk: null };
    if (view === 'checkin' && b) patch.ci = firstOpen(b);
    if (view === 'messages' && b) { const t = BB.q.threadFor(b.id); if (t) st.seen[t.id] = t.messages.length; }
    inst.set(patch);
  }

  /* ---------- screen pieces ---------- */
  function top(inst, p, back, right) {
    return '<header class="g-top">' + (back ? '<button class="g-ib" data-g="back" aria-label="Back">' + BB.icon('back') + '</button>' : '<span class="g-ib-sp"></span>') +
      '<span class="g-brand">' + esc(p.name) + '</span>' + (right || '<span class="g-ib-sp"></span>') + '</header>';
  }
  const powered = () => '<p class="g-powered">' + BB.MARK + '<span>Powered by <b>bookingbooster</b></span></p>';
  const row = (icon, title, sub, right, attrs) => '<' + (attrs ? 'button type="button" ' + attrs : 'div') + ' class="g-row"><span class="g-ri">' + BB.icon(icon) + '</span><span class="g-rt"><b>' + title + '</b>' + (sub ? '<span>' + sub + '</span>' : '') + '</span>' + (right || '') + '</' + (attrs ? 'button' : 'div') + '>';
  const okDot = on => on ? '<span class="g-ok">' + BB.icon('check') + '</span>' : '<span class="g-pend"></span>';
  const stepper = (key, label, sub, val, min, max, disabled) => '<div class="g-stp' + (disabled ? ' off' : '') + '"><span><b>' + label + '</b><small>' + sub + '</small></span>' +
    '<span class="g-stp-c"><button type="button" data-g="step" data-k="' + key + '" data-d="-1" aria-label="Fewer ' + label.toLowerCase() + '"' + (disabled || val <= min ? ' disabled' : '') + '>−</button>' +
    '<output class="num" aria-live="polite">' + val + '</output><button type="button" data-g="step" data-k="' + key + '" data-d="1" aria-label="More ' + label.toLowerCase() + '"' + (disabled || val >= max ? ' disabled' : '') + '>+</button></span></div>';
  const check = (on, text, attrs) => '<button type="button" class="g-check" role="checkbox" aria-checked="' + !!on + '" ' + attrs + '><span class="g-box">' + BB.icon('check') + '</span><span>' + text + '</span></button>';
  const lockOn = () => !S().live || !!(S().integrations.find(i => i.id === 'lock') || {}).connected;
  function codeCard(b, p) {
    if (!lockOn() || !b.code) return '<div class="g-code"><div class="g-code-h"><span>' + BB.icon('key') + 'Getting in</span></div><p class="g-entry">' + (p.entry ? esc(p.entry) : 'Your host will send you how to get in before you arrive.') + '</p>' +
      '<small>Check-in from ' + esc(D.fmt(b.checkIn)) + ', ' + esc(p.checkinTime) + '. Checkout by ' + esc(D.fmt(b.checkOut)) + ', ' + esc(p.checkoutTime) + '.</small></div>';
    const over = b.status === 'completed' || b.checkOut < S().today;
    return '<div class="g-code' + (over ? ' over' : '') + '"><div class="g-code-h"><span>' + BB.icon('key') + 'Front door keypad</span>' + (over ? '<span class="g-live off">Expired</span>' : '<span class="g-live"><i></i>Active</span>') + '</div>' +
      '<div class="g-digits num" aria-label="Door code ' + esc(b.code.split('').join(' ')) + '">' + b.code.split('').map(d => '<span>' + esc(d) + '</span>').join('') + '</div>' +
      '<small>Works ' + esc(D.fmt(b.checkIn)) + ', ' + esc(p.checkinTime) + ' to ' + esc(D.fmt(b.checkOut)) + ', ' + esc(p.checkoutTime) + '. Enter the code, then press the lock button.</small></div>';
  }
  function wifiCard(p, inst) {
    if (!p.wifi || !p.wifi.ssid) return '';
    return '<div class="g-wifi"><span class="g-ri">' + BB.icon('wifi') + '</span><div><small>Wi-Fi · ' + esc(p.wifi.ssid) + '</small><code id="gWifi-' + inst.uid + '">' + esc(p.wifi.pw) + '</code></div><button type="button" class="g-mini" data-g="copy" data-t="' + esc(p.wifi.pw) + '" data-el="gWifi-' + inst.uid + '">Copy</button></div>';
  }

  /* ---------- A. booking flow ---------- */
  function bookView(inst, p) {
    const st = inst.st, k = st.bk; const blocked = BB.q.blocked(p.id);
    const q = k.a && k.b ? BB.quote(p.id, k.a, k.b, k) : null;
    const minM = D.month(S().today);
    const code = (k.promo || '').trim().toUpperCase(); const pct = S().promos[code];
    const body = art(p) +
      '<div class="g-ph"><h1 class="g-h">' + esc(p.name) + '</h1><p class="g-sub">' + esc(p.sub || p.area) + '</p>' +
      '<div class="g-meta"><span>' + BB.icon('star') + '<b>' + p.rating.toFixed(2) + '</b> · ' + p.reviews + ' reviews</span><span><b>' + money(p.nightly) + '</b> / night</span></div></div>' +
      '<section class="g-sec"><p class="g-step">Your dates</p>' +
      '<div class="g-cal"><div class="g-calh"><button type="button" class="g-ib" data-g="month" data-d="-1" aria-label="Previous month"' + (k.month <= minM ? ' disabled' : '') + '>' + BB.icon('back') + '</button><b>' + BB.monthName(k.month) + '</b><button type="button" class="g-ib" data-g="month" data-d="1" aria-label="Next month">' + BB.icon('arrow') + '</button></div>' +
      BB.monthGrid(k.month, { a: k.a, b: k.b }, blocked) +
      '<p class="g-calnote">' + (k.a && k.b ? esc(longDate(k.a)) + ' → ' + esc(longDate(k.b)) + ' · ' + nightsWord(D.diff(k.a, k.b)) + (k.a ? ' <button type="button" class="g-link" data-g="clear">Clear</button>' : '') : k.a ? 'Check-in ' + esc(longDate(k.a)) + '. Now tap your checkout day.' : 'Tap your check-in day. Crossed-out nights are booked.') + '</p></div></section>' +
      '<section class="g-sec"><p class="g-step">Who is coming</p><div class="g-stps">' +
      stepper('adults', 'Adults', 'Age 13 or older', k.adults, 1, p.maxGuests - k.children) +
      stepper('children', 'Children', 'Ages 2 to 12', k.children, 0, p.maxGuests - k.adults) +
      (p.petsAllowed ? stepper('pets', 'Dogs', 'One well-behaved dog, ' + money(p.petFee) + ' fee', k.pets, 0, 1) : stepper('pets', 'Pets', 'Sorry, no pets at this home', 0, 0, 0, true)) +
      '</div><p class="g-fine">Sleeps ' + p.maxGuests + '. Minimum stay ' + nightsWord(p.minNights) + '.</p></section>' +
      '<section class="g-sec"><label class="g-fld"><span>Promo code</span><input id="gPromo-' + inst.uid + '" data-f="promo" value="' + esc(k.promo) + '" placeholder="For example GAP15" autocapitalize="characters" autocomplete="off"></label>' +
      (code ? (pct ? '<p class="g-okt">' + BB.icon('check') + esc(code) + ' applied, ' + pct + '% off the nightly rate.</p>' : '<p class="g-bad">We do not recognise that code.</p>') : '') + '</section>' +
      (q ? '<section class="g-sum"><div><span>' + money(q.avg) + ' × ' + nightsWord(q.nights) + '</span><span>' + money(q.nightly) + '</span></div><div><span>Cleaning</span><span>' + money(q.cleaning) + '</span></div>' +
        (q.pet ? '<div><span>Dog fee</span><span>' + money(q.pet) + '</span></div>' : '') + (q.discount ? '<div class="g-disc"><span>Code ' + esc(q.promo) + ', ' + q.promoPct + '% off</span><span>' + money(-q.discount) + '</span></div>' : '') +
        '<div class="g-tot"><span>Total</span><span>' + money(q.total) + '</span></div>' + (q.problems.length ? '<p class="g-bad">' + esc(q.problems[0]) + '</p>' : '<p class="g-save">' + BB.icon('tag') + 'You save ' + money(q.guestSaves) + ' compared with Airbnb</p>') + '</section>' : '') +
      powered();
    const cta = !q ? '<button class="g-btn" disabled>' + (k.a ? 'Pick your checkout day' : 'Pick your dates') + '</button>' :
      q.ok ? '<button class="g-btn" data-g="to" data-v="details">Continue · ' + nightsWord(q.nights) + ' · ' + money(q.total) + '</button>' : '<button class="g-btn" disabled>' + esc(q.problems[0]) + '</button>';
    return { body, cta, back: !!inst.st.bid || null };
  }
  function detailsView(inst, p) {
    const f = inst.st.form, u = inst.uid;
    const body = '<p class="g-step">Step 2 of 3 · Your details</p><h2 class="g-h">Who is booking?</h2><p class="g-sub">We send the confirmation and your check-in link here.</p>' +
      '<form class="g-form" data-form="details" id="gDet-' + u + '" novalidate>' +
      '<label class="g-fld"><span>Full name</span><input id="gN-' + u + '" data-f="name" value="' + esc(f.name) + '" autocomplete="name" required></label>' +
      '<label class="g-fld"><span>Email</span><input id="gE-' + u + '" data-f="email" type="email" value="' + esc(f.email) + '" autocomplete="email" required></label>' +
      '<label class="g-fld"><span>Mobile phone</span><input id="gP-' + u + '" data-f="phone" type="tel" value="' + esc(f.phone) + '" autocomplete="tel"></label>' +
      '<div class="g-opt"><span><b>Email me future offers</b><small>Past-guest prices and open dates from ' + esc(p.short) + '. Unsubscribe any time.</small></span><button type="button" class="switch" role="switch" aria-checked="' + !!f.optin + '" aria-label="Email me future offers" data-g="optin"></button></div>' +
      (inst.st.err ? '<p class="g-bad">' + esc(inst.st.err) + '</p>' : '') +
      '<p class="g-fine">Sample details are filled in for the demo. Change them to anything.</p></form>' + powered();
    return { body, cta: '<button class="g-btn" type="submit" form="gDet-' + u + '">Continue to payment</button>', back: true };
  }
  function payView(inst, p) {
    const st = inst.st, k = st.bk, c = st.card, u = inst.uid;
    const q = BB.quote(p.id, k.a, k.b, k); if (!q) return bookView(inst, p);
    const cancelBy = D.add(k.a, -7);
    const stripeErr = st.err && /Stripe/.test(st.err);
    const body = '<p class="g-step">Step 3 of 3 · Review and pay</p><h2 class="g-h">' + esc(D.fmt(k.a)) + ' – ' + esc(D.fmt(k.b)) + ' · ' + nightsWord(q.nights) + '</h2>' +
      '<div class="g-cmp"><div><span>Same stay on Airbnb</span><s>' + money(q.airbnb) + '</s></div><div class="win"><span>Booking direct</span><b>' + money(q.total) + '</b></div><div class="g-cmp-s">' + BB.icon('tag') + 'You save ' + money(q.guestSaves) + '</div></div>' +
      '<div class="g-sum"><div><span>' + money(q.avg) + ' × ' + nightsWord(q.nights) + '</span><span>' + money(q.nightly) + '</span></div><div><span>Cleaning</span><span>' + money(q.cleaning) + '</span></div>' +
      (q.pet ? '<div><span>Dog fee</span><span>' + money(q.pet) + '</span></div>' : '') + (q.discount ? '<div class="g-disc"><span>Code ' + esc(q.promo) + ', ' + q.promoPct + '% off</span><span>' + money(-q.discount) + '</span></div>' : '') +
      '<div class="g-tot"><span>Total, charged today</span><span>' + money(q.total) + '</span></div></div>' +
      '<p class="g-fine">' + esc(partyText(k)) + ' · ' + (cancelBy > S().today ? 'Free cancellation until ' + esc(D.fmt(cancelBy)) + '.' : 'Cancel within 24 hours for a full refund.') + '</p>' +
      '<button type="button" class="g-apple" data-g="pay" data-m="Apple Pay"' + (st.paying ? ' disabled' : '') + '>' + BB.icon('lock') + 'Pay with Apple Pay</button>' +
      '<div class="g-or"><span>or pay by card</span></div>' +
      '<div class="g-cardf"><label class="g-fld"><span>Card number</span><span class="g-cardn"><input id="gCn-' + u + '" data-f="cnum" inputmode="numeric" value="' + esc(c.num) + '" autocomplete="cc-number"><i class="g-visa">VISA</i></span></label>' +
      '<div class="g-two"><label class="g-fld"><span>Expiry</span><input id="gCe-' + u + '" data-f="cexp" value="' + esc(c.exp) + '" autocomplete="cc-exp"></label><label class="g-fld"><span>CVC</span><input id="gCc-' + u + '" data-f="ccvc" inputmode="numeric" value="' + esc(c.cvc) + '" autocomplete="cc-csc"></label><label class="g-fld"><span>Postcode</span><input id="gCp-' + u + '" data-f="cpost" value="' + esc(c.post || '') + '" autocomplete="postal-code" autocapitalize="characters"></label></div>' +
      '<p class="g-fine">' + BB.icon('lock') + 'Test card ending 4242. Payments are processed by Stripe.</p></div>' +
      (st.err ? '<div class="g-alert" role="alert"><b>' + (stripeErr ? 'Card payments are paused' : 'We could not book that') + '</b><p>' + esc(st.err) + '</p>' +
        (stripeErr ? '<button type="button" class="g-btn sm" data-g="request">Send a booking request instead</button><small>No charge now. ' + esc(first(S().account.owner)) + ' confirms and sends a payment link.</small>' : '<button type="button" class="g-btn sm ghost" data-g="to" data-v="book">Change dates</button>') + '</div>' : '') +
      powered();
    const cta = '<button class="g-btn" data-g="pay" data-m="card"' + (st.paying ? ' disabled' : '') + '>' + (st.paying ? '<span class="g-spin"></span>Processing payment' : 'Pay ' + money(q.total)) + '</button>';
    return { body, cta, back: true };
  }
  function doneView(inst, p) {
    const b = BB.q.booking(inst.st.bid); if (!b) return bookView(inst, p);
    const g = BB.q.guest(b.guestId); const req = inst.st.request;
    const body = '<div class="g-conf"><div class="g-tick">' + BB.icon('check') + '</div><h2 class="g-h">' + (req ? 'Request sent, ' : 'You’re booked, ') + esc(first(g.name)) + '!</h2>' +
      '<p class="g-sub">' + (req ? 'No charge yet. ' + esc(first(S().account.owner)) + ' will confirm and send a payment link to ' : 'Confirmation #' + esc(b.id) + ' sent to ') + esc(g.email) + '.</p></div>' +
      '<div class="g-pass"><div class="g-pass-h"><span>' + esc(p.name) + '</span><span class="num">#' + esc(b.id) + '</span></div><b>' + esc(longDate(b.checkIn)) + ' → ' + esc(longDate(b.checkOut)) + '</b>' +
      '<div class="g-pass-r"><span><small>Check-in</small>from ' + esc(p.checkinTime) + '</span><span><small>Guests</small>' + esc(partyText(b)) + '</span><span><small>Paid</small>' + (b.paid ? money(b.total) : 'Pending') + '</span></div>' +
      '<div class="g-bars" aria-hidden="true"></div></div>' +
      '<div class="g-list">' + row('cal', 'Add to Apple Wallet', 'Dates, address and code in one pass', '', 'data-g="wallet"') +
      row('check', 'Check in early', 'About 3 minutes, any time before arrival', BB.icon('chev'), 'data-g="tab" data-v="checkin"') + '</div>' + powered();
    return { body, cta: '<button class="g-btn" data-g="tab" data-v="checkin">Start check-in</button><button class="g-btn ghost" data-g="tab" data-v="trip">Go to my trip</button>' };
  }

  /* ---------- B. trip home ---------- */
  function tripView(inst, p, b) {
    const g = BB.q.guest(b.guestId), c = b.checkin, st = inst.st, n = doneCount(b);
    const started = stayStarted(b), cancelled = b.status === 'cancelled';
    const body = art(p, countdown(b)) +
      '<div class="g-ph"><p class="g-sub">' + (b.status === 'completed' ? 'Thanks for staying, ' + esc(first(g.name)) : started ? 'Welcome, ' + esc(first(g.name)) + '. You’re staying at' : 'Hi ' + esc(first(g.name)) + ', you’re going to') + '</p><h1 class="g-h">' + esc(p.name) + '</h1></div>' +
      '<div class="g-kv"><div><small>Check-in</small><b>' + esc(longDate(b.checkIn)) + '</b><span>from ' + esc(p.checkinTime) + '</span></div><div><small>Checkout</small><b>' + esc(longDate(b.checkOut)) + '</b><span>by ' + esc(p.checkoutTime) + '</span></div>' +
      '<div><small>Guests</small><b>' + esc(partyText(b)) + '</b></div><div><small>Booking</small><b class="num">#' + esc(b.id) + '</b><span>' + esc(BB.sourceLabel ? BB.sourceLabel(b) : 'Direct') + '</span></div></div>' +
      (b.status === 'request' ? '<div class="g-alert g-req"><b>Request sent</b><p>' + esc(first(S().account.owner || '') || 'Your host') + ' will accept or decline it soon. Your dates are held and nothing has been charged. Online check-in opens once your stay is confirmed.</p></div>' :
      cancelled ? '<div class="g-alert"><b>' + (b.declined ? 'This request was declined' : 'This booking was cancelled') + '</b><p>' + (b.declined ? 'Nothing was charged. Check your messages for a note from your host.' : b.paid ? money(b.total) + ' was refunded to your card.' : 'Nothing was charged.') + '</p></div>' :
        (c.done ? codeCard(b, p) :
          '<div class="g-ci"><div class="g-ci-h"><span><b>Online check-in</b><small>' + (n ? n + ' of 4 steps done' : 'About 3 minutes') + '</small></span><span class="g-prog s">' + [0, 1, 2, 3].map(i => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span></div>' +
          '<div class="g-locked">' + BB.icon('lock') + '<span>' + (lockOn() ? 'Your door code unlocks here when check-in is done. It works from ' : 'How to get in unlocks here when check-in is done. Check-in is from ') + esc(p.checkinTime) + ' on ' + esc(D.fmt(b.checkIn)) + '.</span></div>' +
          '<button class="g-btn" data-g="tab" data-v="checkin">' + (n ? 'Continue check-in' : 'Start check-in') + '</button></div>')) +
      '<div class="g-quick">' +
      [['key', c.done ? 'Check-in' : 'Check in', 'data-g="tab" data-v="checkin"'], ['sms', 'Message host', 'data-g="tab" data-v="messages"'], ['pin', 'Directions', 'data-g="dir" aria-expanded="' + !!st.dir + '"'], ['home', 'House guide', 'data-g="tab" data-v="guide"']]
        .map(([i, t, a]) => '<button type="button" ' + a + '><span>' + BB.icon(i) + '</span>' + t + '</button>').join('') + '</div>' +
      (st.dir ? '<div class="g-dir"><div class="g-map" aria-hidden="true"><i></i><b></b></div><div class="g-dir-b"><div><small>Address</small><b id="gAddr-' + inst.uid + '">' + esc(p.address) + '</b></div><button type="button" class="g-mini" data-g="copy" data-t="' + esc(p.address) + '" data-el="gAddr-' + inst.uid + '">Copy</button></div>' +
        '<p class="g-fine">' + BB.icon('car') + 'Parking: ' + esc(p.parking) + '.</p></div>' : '') +
      (started && !cancelled ? '<div class="g-list">' + row('star', b.review ? 'You rated this stay ' + b.review.stars + ' stars' : 'Checkout and rating', b.review ? 'See your come-back code' : 'Checklist, private rating and a come-back code', BB.icon('chev'), 'data-g="tab" data-v="checkout"') + '</div>' : '') +
      (b.extras && b.extras.length ? '<p class="g-fine">Extras: ' + b.extras.map(x => esc(x.name) + ' ' + money(x.price)).join(', ') + '</p>' : '') +
      '<button type="button" class="g-link c" data-g="newstay" data-pid="' + esc(p.id) + '">Book another stay at ' + esc(p.short) + '</button>' + powered();
    return { body };
  }

  /* ---------- C. check-in ---------- */
  function realId(inst, p, b, prog, party) {
    const st = inst.st, c = b.checkin, g = BB.q.guest(b.guestId);
    const box = c.id ? '<div class="g-idc done">' + BB.icon('id') + '<span><b>ID received</b><small>Your host has it. Nothing more to do here.</small></span>' + okDot(true) + '</div>' :
      st.upload === 'sending' ? '<div class="g-idc has">' + (st.idImg ? '<img src="' + st.idImg + '" alt="Your ID photo">' : '') + '<span class="g-idok"><span class="g-spin d"></span>Uploading securely…</span></div>' :
      '<div class="g-idc"><label class="g-up" for="gFile-' + inst.uid + '">' + BB.icon('camera') + '<b>Photo of your ID</b><small>Passport photo page or UK driving licence</small></label><input type="file" accept="image/*" capture="environment" id="gFile-' + inst.uid + '" data-g-file class="g-file">' + (st.upErr ? '<p class="g-err" role="alert">' + esc(st.upErr) + '</p>' : '') + '</div>';
    const names = c.guests && !st.editNames ? row('users', 'Guest names', party + ' of ' + party + ' added', okDot(true)) :
      '<div class="g-names"><p class="g-lab">' + BB.icon('users') + 'Guest names <span>' + st.names.filter(x => x.trim()).length + ' of ' + party + '</span></p>' +
      st.names.map((nm, i) => '<label class="g-fld"><span class="sr">Guest ' + (i + 1) + '</span><input id="gNm-' + inst.uid + '-' + i + '" data-f="gname" data-i="' + i + '" value="' + esc(nm) + '" placeholder="' + (i ? 'Guest ' + (i + 1) + ' full name' : 'Lead guest') + '"' + (i === 0 ? ' readonly' : '') + '></label>').join('') +
      (st.names.length < party ? '<button type="button" class="g-link" data-g="addname">' + BB.icon('plus') + 'Add a guest</button>' : '') + '</div>';
    const can = c.id && (st.names[0] || '').trim();
    return { body: prog + '<p class="g-step">Step 1 of 4 · Who is staying</p><h2 class="g-h">Add your ID</h2><p class="g-sub">Only the lead guest does this. Only ' + esc(first(S().account.owner) || 'your host') + ' can see the photo, and it is deleted 30 days after checkout.</p>' + box + names + powered(),
      cta: '<button class="g-btn" data-g="ci1"' + (can ? '' : ' disabled') + '>' + (can ? 'Continue' : 'Add your ID to continue') + '</button>', back: true };
  }
  function checkinView(inst, p, b) {
    const st = inst.st, c = b.checkin, g = BB.q.guest(b.guestId);
    if (b.status === 'cancelled') return { body: '<div class="g-alert"><b>This booking was cancelled</b><p>There is nothing to check in.</p></div>' };
    if (st.ci == null) st.ci = firstOpen(b);
    const ci = st.ci; const prog = '<div class="g-prog" aria-label="Step ' + Math.min(ci, 4) + ' of 4">' + [1, 2, 3, 4].map(i => '<i class="' + (i < ci || (i === ci && ci === 5) ? 'on' : i === ci ? 'cur' : '') + '"></i>').join('') + '</div>';
    const party = b.adults + b.children;
    if (ci === 1) {
      if (!st.names) st.names = [g.name];
      if (REAL()) return realId(inst, p, b, prog, party);
      const idDone = c.id || !!st.idImg, selfieDone = c.selfie || st.selfie === 'ok', guestsDone = c.guests || (st.names[0] || '').trim();
      const idBox = c.id && !st.idImg ? '<div class="g-idc done">' + BB.icon('id') + '<span><b>ID verified</b><small>Checked on file. Nothing more to do here.</small></span>' + okDot(true) + '</div>' :
        st.idImg ? '<div class="g-idc has">' + (st.idImg === 'sample' ? '<div class="g-idsample" aria-label="Sample UK driving licence"><i class="pic"></i><span><b>' + esc(g.name.toUpperCase()) + '</b><em></em><em></em><em class="s"></em></span></div>' : '<img src="' + st.idImg + '" alt="Your ID photo">') +
          '<span class="g-idok">' + BB.icon('check') + 'Readable. Name matches the booking.</span><button type="button" class="g-link" data-g="idclear">Retake</button></div>' :
        '<div class="g-idc"><label class="g-up" for="gFile-' + inst.uid + '">' + BB.icon('camera') + '<b>Photo of your ID</b><small>Passport photo page or UK driving licence</small></label><input type="file" accept="image/*" id="gFile-' + inst.uid + '" data-g-file class="g-file">' +
          '<button type="button" class="g-link" data-g="sampleid">Use sample ID</button></div>';
      const selfie = selfieDone ? row('user', 'Selfie match', 'Matched to your ID', okDot(true)) :
        st.selfie === 'matching' ? '<div class="g-row g-match"><span class="g-face"><i></i></span><span class="g-rt"><b>Matching your face</b><span>Hold still for a moment</span></span><span class="g-spin d"></span></div>' :
        row('user', 'Selfie match', idDone ? 'Takes about 2 seconds' : 'Add your ID first', '<span class="g-mini' + (idDone ? '' : ' off') + '">Take selfie</span>', 'data-g="selfie"' + (idDone ? '' : ' disabled'));
      const names = c.guests && !st.editNames ? row('users', 'Guest names', party + ' of ' + party + ' added', okDot(true)) :
        '<div class="g-names"><p class="g-lab">' + BB.icon('users') + 'Guest names <span>' + st.names.filter(x => x.trim()).length + ' of ' + party + '</span></p>' +
        st.names.map((nm, i) => '<label class="g-fld"><span class="sr">Guest ' + (i + 1) + '</span><input id="gNm-' + inst.uid + '-' + i + '" data-f="gname" data-i="' + i + '" value="' + esc(nm) + '" placeholder="' + (i ? 'Guest ' + (i + 1) + ' full name' : 'Lead guest') + '"' + (i === 0 ? ' readonly' : '') + '></label>').join('') +
        (st.names.length < party ? '<button type="button" class="g-link" data-g="addname">' + BB.icon('plus') + 'Add a guest</button>' : '') + '</div>';
      const can = idDone && selfieDone && guestsDone;
      return { body: prog + '<p class="g-step">Step 1 of 4 · Who is staying</p><h2 class="g-h">Verify your ID</h2><p class="g-sub">Only the lead guest does this. We check your passport or UK driving licence automatically and never share it.</p>' + idBox + '<div class="g-list">' + selfie + '</div>' + names + powered(),
        cta: '<button class="g-btn" data-g="ci1"' + (can ? '' : ' disabled') + '>' + (can ? 'Continue' : !idDone ? 'Add your ID to continue' : !selfieDone ? 'Take a selfie to continue' : 'Add the lead guest name') + '</button>', back: true };
    }
    if (ci === 2) {
      const rules = p.rules || []; const allOk = c.agreement || rules.every((_, i) => st.rules[i]); const signed = c.agreement || st.strokes.length > 0;
      const body = prog + '<p class="g-step">Step 2 of 4 · House rules</p><h2 class="g-h">Agree and sign</h2>' +
        '<div class="g-list">' + rules.map((r, i) => check(c.agreement || st.rules[i], esc(r), 'data-g="rule" data-i="' + i + '"' + (c.agreement ? ' disabled' : ''))).join('') + '</div>' +
        (c.agreement ? '<div class="g-idc done">' + BB.icon('pen') + '<span><b>Rental agreement signed</b><small>A copy is in your email.</small></span>' + okDot(true) + '</div>' :
          '<div class="g-sig"><canvas id="gSig-' + inst.uid + '" data-sig aria-label="Signature pad. Draw your signature."></canvas>' + (st.strokes.length ? '' : '<span class="g-sig-ph">' + BB.icon('pen') + 'Sign here with your finger</span>') +
          '<span class="g-sig-l">' + esc(g.name) + '</span><button type="button" class="g-link g-sig-x" data-g="sigclear"' + (st.strokes.length ? '' : ' hidden') + '>Clear</button></div>' +
          '<p class="g-fine">By signing you agree to the rental agreement for ' + esc(p.name) + ', ' + esc(D.fmt(b.checkIn)) + '–' + esc(D.fmt(b.checkOut)) + '.</p>') + powered();
      return { body, cta: '<button class="g-btn" data-g="ci2"' + (allOk && signed ? '' : ' disabled') + '>' + (c.agreement ? 'Continue' : !allOk ? 'Tick each rule to continue' : !signed ? 'Sign to continue' : 'Sign and continue') + '</button>', back: true };
    }
    if (ci === 3 && REAL()) {
      const on = BB.BOOT.stripe;
      const body = prog + '<p class="g-step">Step 3 of 4 · Damage deposit</p><h2 class="g-h">' + (on ? 'A card on file, not a charge' : 'No deposit needed') + '</h2>' +
        (on ? '<p class="g-sub">Stripe saves your card securely. Nothing is charged unless something is damaged, up to ' + money(200) + ', and your host has to tell you first.</p>' : '<p class="g-sub">' + esc(first(S().account.owner) || 'Your host') + ' does not take card deposits for this stay. Carry on to the next step.</p>') +
        (c.deposit ? '<div class="g-idc done">' + BB.icon('card') + '<span><b>' + (on ? 'Card saved' : 'All set') + '</b><small>' + (on ? 'Removed after checkout.' : 'Nothing to do here.') + '</small></span>' + okDot(true) + '</div>' : '') + (st.depErr ? '<p class="g-err" role="alert">' + esc(st.depErr) + '</p>' : '') + powered();
      return { body, cta: '<button class="g-btn" data-g="ci3"' + (st.depBusy ? ' disabled' : '') + '>' + (c.deposit ? 'Continue' : on ? (st.depBusy ? 'Opening Stripe…' : 'Add a card with Stripe') : 'Continue') + '</button>', back: true };
    }
    if (ci === 3) {
      const body = prog + '<p class="g-step">Step 3 of 4 · Security deposit</p><h2 class="g-h">A card hold, not a charge</h2><p class="g-sub">Instead of a cash deposit we place a temporary hold on your card. Nothing leaves your account unless something is damaged.</p>' +
        '<div class="g-hold"><div><small>Hold amount</small><b class="num">' + money(200) + '</b></div><div class="g-hold-c"><i class="g-visa">VISA</i><span>•••• 4242</span></div></div>' +
        '<ol class="g-tl"><li><b>Today</b><span>' + money(200) + ' hold placed. Your bank shows it as pending.</span></li><li><b>' + esc(D.fmt(b.checkOut)) + '</b><span>Checkout. ' + esc(first(S().account.owner)) + ' checks the home.</span></li><li><b>' + esc(D.fmt(D.add(b.checkOut, 3))) + '</b><span>The hold is released automatically.</span></li></ol>' +
        (c.deposit ? '<div class="g-idc done">' + BB.icon('card') + '<span><b>Hold in place</b><small>Released 3 days after checkout.</small></span>' + okDot(true) + '</div>' : '') + powered();
      return { body, cta: '<button class="g-btn" data-g="ci3">' + (c.deposit ? 'Continue' : 'Authorise ' + money(200) + ' hold') + '</button>', back: true };
    }
    if (ci === 4) {
      const pick = st.arrPick || c.arrival;
      const body = prog + '<p class="g-step">Step 4 of 4 · Arrival</p><h2 class="g-h">When will you get there?</h2><p class="g-sub">Check-in is from ' + esc(p.checkinTime) + '. This helps ' + esc(first(S().account.owner)) + ' have everything ready.</p>' +
        '<div class="g-chips" role="radiogroup" aria-label="Arrival time">' + ARRIVALS.map(a => '<button type="button" role="radio" aria-checked="' + (pick === a) + '" data-g="arr" data-a="' + esc(a) + '">' + esc(a) + '</button>').join('') + '</div>' +
        row('car', 'Parking', esc(p.parking)) + powered();
      return { body, cta: '<button class="g-btn" data-g="ci4"' + (pick ? '' : ' disabled') + '>' + (pick ? 'Confirm ' + esc(pick) + ' and finish' : 'Pick an arrival time') + '</button>', back: true };
    }
    // 5: done
    const body = '<div class="g-conf sm"><div class="g-tick">' + BB.icon('check') + '</div><p class="g-step">You’re checked in</p><h2 class="g-h">' + (lockOn() && b.code ? 'Your door code' : 'How to get in') + '</h2></div>' + codeCard(b, p) +
      '<div class="g-list">' + row('pin', esc(p.address), 'Tap Copy to paste it into Maps', '<button type="button" class="g-mini" data-g="copy" data-t="' + esc(p.address) + '">Copy</button>') + (p.parking ? row('car', 'Parking', esc(p.parking)) : '') + '</div>' +
      wifiCard(p, inst) +
      '<p class="g-step">Arrival time</p><div class="g-chips" role="radiogroup" aria-label="Arrival time">' + ARRIVALS.map(a => '<button type="button" role="radio" aria-checked="' + (c.arrival === a) + '" data-g="arrset" data-a="' + esc(a) + '">' + esc(a) + '</button>').join('') + '</div>' + powered();
    return { body, cta: '<button class="g-btn ghost" data-g="tab" data-v="messages">Message your host</button>' };
  }

  /* ---------- D. messages ---------- */
  function msgView(inst, p, b) {
    const t = BB.q.threadFor(b.id); const host = S().account.owner; const g = BB.q.guest(b.guestId);
    const msgs = t ? t.messages : [];
    let lastDay = '';
    const list = msgs.map(m => {
      const day = m.at.split('T')[0]; const sep = day !== lastDay ? '<p class="g-day">' + (day === S().today ? 'Today' : esc(D.fmt(day, { weekday: 'short' }))) + '</p>' : ''; lastDay = day;
      const who = m.from === 'guest' ? 'me' : m.from === 'auto' ? 'auto' : 'host';
      return sep + '<div class="g-msg ' + who + '">' + (who === 'auto' ? '<small>' + BB.icon('bolt') + 'Automatic message</small>' : '') + '<p>' + esc(m.text) + '</p><time>' + esc(m.at.split('T')[1]) + '</time></div>';
    }).join('');
    const body = '<div class="g-host">' + BB.avatar(host) + '<span><b>' + esc(host) + '</b><small>Your host · usually replies within 10 minutes</small></span></div>' +
      '<div class="g-thread" aria-live="polite">' + (list || '<p class="g-empty">Ask ' + esc(first(host)) + ' anything about your stay. Replies also arrive by text.</p>') + '</div>';
    const quick = ['What is the Wi-Fi password?', 'Can we check in early?', 'Is there parking for two cars?'];
    const cta = '<div class="g-qr" id="gQr-' + inst.uid + '">' + quick.map(q => '<button type="button" data-g="quick" data-t="' + esc(q) + '">' + esc(q) + '</button>').join('') + '</div>' +
      '<form class="g-comp" data-form="msg"><label class="sr" for="gMsg-' + inst.uid + '">Message ' + esc(first(host)) + '</label><input id="gMsg-' + inst.uid + '" data-f="draft" value="' + esc(inst.st.draft || '') + '" placeholder="Message ' + esc(first(host)) + '" autocomplete="off"><button class="g-send" aria-label="Send">' + BB.icon('send') + '</button></form>';
    return { body, cta, ctaCls: 'msg', bodyCls: 'chat', msgCount: msgs.length, g };
  }

  /* ---------- E. guide ---------- */
  function guideView(inst, p, b) {
    const extras = EXTRAS[p.theme] || EXTRAS.cabin; const bought = b.extras || []; const ask = inst.st.extraAsk;
    const body = '<p class="g-step">' + esc(p.short) + '</p><h2 class="g-h">Your stay guide</h2>' + wifiCard(p, inst) +
      '<p class="g-step">House manual</p><div class="g-tiles">' + (p.amenities || []).map(a => { const [ic, t] = manual(a, p); return '<div class="g-tile"><span class="g-ri">' + BB.icon(ic) + '</span><b>' + esc(a) + '</b><span>' + esc(t) + '</span></div>'; }).join('') + '</div>' +
      '<p class="g-step">Host picks nearby</p><div class="g-list">' + (PICKS[p.id] || [['Ask your host', 'Message for local tips']]).map(x => row('pin', esc(x[0]), esc(x[1]))).join('') + '</div>' +
      '<p class="g-step">Add to your stay</p><div class="g-list">' + extras.map(([n, pr, sub]) => {
        const has = bought.some(x => x.name === n);
        if (has) return '<div class="g-ext done"><span class="g-rt"><b>' + esc(n) + '</b><span>Added · ' + money(pr) + ' charged to •••• 4242</span></span>' + okDot(true) + '</div>';
        if (ask === n) return '<div class="g-ext ask"><span class="g-rt"><b>' + esc(n) + '</b><span>' + money(pr) + ' goes on your card ending 4242.</span></span><span class="g-ext-a"><button type="button" class="g-mini ghost" data-g="extra-no">Cancel</button><button type="button" class="g-mini" data-g="extra-buy" data-n="' + esc(n) + '" data-p="' + pr + '">Add for ' + money(pr) + '</button></span></div>';
        return '<button type="button" class="g-ext" data-g="extra" data-n="' + esc(n) + '"><span class="g-rt"><b>' + esc(n) + '</b><span>' + esc(sub) + '</span></span><span class="g-price">' + money(pr) + '</span></button>';
      }).join('') + '</div>' + powered();
    return { body };
  }

  /* ---------- F. checkout ---------- */
  function checkoutView(inst, p, b) {
    const st = inst.st, g = BB.q.guest(b.guestId); const code = first(g.name).toUpperCase().replace(/[^A-Z]/g, '') + '10'; const hasCode = !!S().promos[code];
    const items = (CHECKOUT[p.theme] || CHECKOUT.cabin).concat(['Lock the door. Your code stops at ' + p.checkoutTime]);
    const stars = b.review ? b.review.stars : st.stars;
    const body = '<p class="g-step">' + (b.checkOut === S().today ? 'Checkout today by ' + esc(p.checkoutTime) : 'Checkout ' + esc(longDate(b.checkOut)) + ', ' + esc(p.checkoutTime)) + '</p><h2 class="g-h">Before you go</h2>' +
      '<div class="g-list">' + items.map((x, i) => check(st.out[i], esc(x), 'data-g="out" data-i="' + i + '"')).join('') + '</div>' +
      '<div class="g-rate"><p class="g-step">How was your stay?</p><div class="g-stars" role="radiogroup" aria-label="Rating">' + [1, 2, 3, 4, 5].map(i => '<button type="button" role="radio" aria-checked="' + (stars === i) + '" aria-label="' + i + ' star' + (i > 1 ? 's' : '') + '" class="' + (i <= stars ? 'on' : '') + '" data-g="star" data-i="' + i + '"' + (b.review ? ' disabled' : '') + '>' + BB.icon('star') + '</button>').join('') + '</div>' +
      (b.review ? '<p class="g-okt c">' + BB.icon('check') + (b.review.public ? 'Thanks. Your review is on the ' + esc(p.name) + ' website with your first name.' : 'Thanks. Your rating went privately to ' + esc(first(S().account.owner)) + '.') + '</p>' + (b.review.text ? '<p class="g-quote">“' + esc(b.review.text) + '”</p>' : '') :
        stars ? '<label class="g-fld"><span>Anything ' + esc(first(S().account.owner)) + ' should know? Optional.</span><textarea id="gCm-' + inst.uid + '" data-f="comment" rows="3" placeholder="' + (stars >= 4 ? 'What did you love?' : 'What could be better?') + '">' + esc(st.comment) + '</textarea></label>' +
        '<div class="g-list">' + check(st.pub, 'Show my rating and comment on the ' + esc(p.name) + ' website, with my first name and initial. Leave this unticked to keep it private.', 'data-g="pub"') + '</div><button type="button" class="g-btn" data-g="rate">Send ' + stars + '-star rating</button>' : '<p class="g-fine c">Tap a star. Your host sees your rating, and you choose whether it goes on the website.</p>') + '</div>' +
      '<div class="g-offer"><b>Come back and save 10%</b>' + (hasCode ? '<small>Book your next stay direct with this code. Valid for 12 months.</small><div class="g-codebox"><span id="gCb-' + inst.uid + '">' + esc(code) + '</span><button type="button" class="g-mini inv" data-g="copy" data-t="' + esc(code) + '" data-el="gCb-' + inst.uid + '">Copy</button></div><button type="button" class="g-btn inv" data-g="again" data-code="' + esc(code) + '">Book again with ' + esc(code) + '</button>' :
        '<small>Rate your stay to unlock a 10% code for your next direct booking.</small><div class="g-codebox lock">' + BB.icon('lock') + 'Unlocks after your rating</div>') + '</div>' + powered();
    const cta = g.subscribed ? '<p class="g-joined">' + BB.icon('check') + 'You’re on the guest list for ' + esc(p.short) + '</p>' : '<button class="g-btn" data-g="join">Join the guest list</button>';
    return { body, cta };
  }

  /* ---------- side panel (standalone only) ---------- */
  function side(inst) {
    const s = S(); const t = s.today;
    const list = s.bookings.filter(b => b.status !== 'cancelled' && b.checkOut >= t).sort((a, b) => a.checkIn.localeCompare(b.checkIn)).slice(0, 10);
    return '<aside class="g-side"><p class="eyebrow">Guest app</p><h1 class="disp">From “book direct” to the door code</h1>' +
      '<p class="muted">A web app guests open from their confirmation email or text. No download. It carries the property’s own brand, and everything a guest does here lands in the host console and activity feed at once.</p>' +
      '<ul class="g-feat">' + [['cal', 'Books direct with live prices and the saving against Airbnb'], ['id', 'Checks in: ID and selfie, signed agreement, deposit hold'], ['key', 'Gets the smart-lock code the moment check-in is done'], ['sms', 'Messages the host, buys extras, rates the stay']].map(([i, x]) => '<li>' + BB.icon(i) + '<span>' + x + '</span></li>').join('') + '</ul>' +
      '<div class="g-demo"><div class="g-demo-h"><b>Demo as</b><span class="muted">Upcoming and current stays</span></div><div class="g-demo-l" id="gDemo-' + inst.uid + '">' +
      list.map(b => { const g = BB.q.guest(b.guestId), p = BB.q.property(b.propertyId); return '<button type="button" data-g="demo" data-id="' + esc(b.id) + '" aria-pressed="' + (inst.st.bid === b.id) + '">' + BB.avatar(g.name, 'sm') + '<span class="g-dt"><b>' + esc(g.name) + '</b><span>' + esc(p.short) + ' · ' + esc(BB.dates(b)) + '</span></span>' + BB.statusPill(b) + '</button>'; }).join('') + '</div>' +
      '<div class="g-demo-h"><b>Book a new stay</b></div><div class="g-demo-p">' + s.properties.map(p => '<button type="button" class="btn sm" data-g="newstay" data-pid="' + esc(p.id) + '" aria-pressed="' + (!inst.st.bid && inst.st.pid === p.id) + '"><i style="background:' + esc(theme(p).acc) + '"></i>' + esc(p.short) + '</button>').join('') + '</div></div>' +
      '<button type="button" class="btn ghost sm" data-g="live">' + BB.icon('bolt') + 'See it next to the host console</button></aside>';
  }

  const REAL = () => !!(BB.BOOT && BB.BOOT.mode === 'trip');
  // Shrink a photo before upload so phones on weak signal can send it.
  function shrink(dataUrl, max, cb) { const im = new Image(); im.onload = () => { const k = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); cb(c.toDataURL('image/jpeg', 0.82)); }; im.onerror = () => cb(null); im.src = dataUrl; }

  /* ---------- surface ---------- */
  BB.define('guest', {
    create(root, opts, inst) {
      inst.uid = Math.random().toString(36).slice(2, 7);
      inst.embedded = !!opts.embedded; inst.timers = [];
      inst.st.seen = {};
      apply(inst, opts);
      const st = inst.st;
      const later = (fn, ms) => { const id = setTimeout(() => { if (inst.alive) fn(); }, ms); inst.timers.push(id); };
      const bk = () => BB.q.booking(st.bid);

      BB.on(root, 'click', '[data-g]', (el, ev) => {
        const a = el.dataset.g; const b = bk();
        if (a === 'back') {
          if (st.view === 'details') return inst.set({ view: 'book', err: null });
          if (st.view === 'pay') return inst.set({ view: 'details', err: null });
          if (st.view === 'book') return st.bid ? go(inst, 'trip') : null;
          if (st.view === 'checkin' && st.ci > 1 && st.ci < 5) return inst.set({ ci: st.ci - 1 });
          return go(inst, 'trip');
        }
        if (a === 'tab') return go(inst, el.dataset.v);
        if (a === 'to') return inst.set({ view: el.dataset.v, err: null });
        if (a === 'month') { st.bk.month = BB.addMonth(st.bk.month, +el.dataset.d); return inst.render(); }
        if (a === 'clear') { st.bk.a = st.bk.b = null; return inst.render(); }
        if (a === 'step') { const k = el.dataset.k; st.bk[k] = Math.max(0, st.bk[k] + +el.dataset.d); return inst.render(); }
        if (a === 'optin') { st.form.optin = !st.form.optin; return inst.render(); }
        if (a === 'pay') return pay(inst, false, el.dataset.m);
        if (a === 'request') return pay(inst, true);
        if (a === 'wallet') return BB.toast('Pass added to Apple Wallet');
        if (a === 'newstay') { newStay(inst, el.dataset.pid); return inst.render(); }
        if (a === 'again') { const pid = b ? b.propertyId : st.pid; const g = b && BB.q.guest(b.guestId); if (g) st.form = { name: g.name, email: g.email, phone: g.phone, optin: true }; newStay(inst, pid, el.dataset.code); return inst.render(); }
        if (a === 'demo') { openBooking(inst, el.dataset.id, 'trip'); return inst.render(); }
        if (a === 'live') return BB.go('live', { bookingId: st.bid || undefined, propertyId: st.bid ? undefined : st.pid });
        if (a === 'dir') return inst.set({ dir: !st.dir });
        if (a === 'copy') { const t = el.dataset.el && root.querySelector('#' + CSS.escape(el.dataset.el)); return BB.copy(el.dataset.t, t); }
        if (!b) return;
        // check-in
        if (a === 'sampleid') return inst.set({ idImg: 'sample' });
        if (a === 'idclear') return inst.set({ idImg: null, selfie: b.checkin.selfie ? 'ok' : 'idle' });
        if (a === 'selfie') { if (el.disabled || st.selfie === 'matching') return; inst.set({ selfie: 'matching' }); return later(() => inst.set({ selfie: 'ok' }), 1500); }
        if (a === 'addname') { st.names.push(''); inst.render(); const i = root.querySelector('#gNm-' + inst.uid + '-' + (st.names.length - 1)); if (i) i.focus(); return; }
        if (a === 'ci1' && REAL()) { if (!b.checkin.guests) BB.act.checkin(b.id, { guests: true }); return inst.set({ ci: 2 }); }
        if (a === 'ci1') { if (!(b.checkin.id && b.checkin.selfie && b.checkin.guests)) BB.act.checkin(b.id, { id: true, selfie: true, guests: true }); return inst.set({ ci: 2 }); }
        if (a === 'rule') { st.rules[el.dataset.i] = !st.rules[el.dataset.i]; return inst.render(); }
        if (a === 'sigclear') return inst.set({ strokes: [] });
        if (a === 'ci2') { if (!b.checkin.agreement) BB.act.checkin(b.id, { agreement: true, signature: 'signed' }); return inst.set({ ci: 3 }); }
        if (a === 'ci3' && REAL() && !b.checkin.deposit) {
          inst.set({ depBusy: true, depErr: null });
          BB.api.deposit(b.id).then(j => { if (j.checkoutUrl) { location.href = j.checkoutUrl; return; } inst.set({ depBusy: false, ci: 4 }); }).catch(e => inst.set({ depBusy: false, depErr: e.message }));
          return;
        }
        if (a === 'ci3') { if (!b.checkin.deposit) BB.act.checkin(b.id, { deposit: true }); return inst.set({ ci: 4 }); }
        if (a === 'arr') return inst.set({ arrPick: el.dataset.a });
        if (a === 'ci4') { const pick = st.arrPick || b.checkin.arrival; if (pick) BB.act.checkin(b.id, { arrival: pick }); return inst.set({ ci: 5 }); }
        if (a === 'arrset') { if (b.checkin.arrival !== el.dataset.a) BB.act.checkin(b.id, { arrival: el.dataset.a }); return; }
        // messages
        if (a === 'quick') return send(inst, el.dataset.t);
        // guide
        if (a === 'extra') return inst.set({ extraAsk: el.dataset.n });
        if (a === 'extra-no') return inst.set({ extraAsk: null });
        if (a === 'extra-buy') { st.extraAsk = null; BB.act.buyExtra(b.id, el.dataset.n, +el.dataset.p); BB.toast(el.dataset.n + ' added to your stay', 'good'); return; }
        // checkout
        if (a === 'out') { st.out[el.dataset.i] = !st.out[el.dataset.i]; return inst.render(); }
        if (a === 'star') return inst.set({ stars: +el.dataset.i });
        if (a === 'pub') return inst.set({ pub: !st.pub });
        if (a === 'rate') { if (st.stars) BB.act.rateStay(b.id, st.stars, (st.comment || '').trim(), !!st.pub); return; }
        if (a === 'join') { BB.act.joinList(b.guestId); BB.toast('You’re on the guest list', 'good'); return; }
      });
      BB.on(root, 'click', '[data-day]', el => {
        if (st.view !== 'book') return;
        const r = BB.pickRange({ a: st.bk.a, b: st.bk.b }, el.dataset.day, BB.q.blocked(st.pid));
        st.bk.a = r.a; st.bk.b = r.b; inst.render();
      });
      BB.on(root, 'input', '[data-f]', el => {
        const f = el.dataset.f, v = el.value;
        if (f === 'promo') { st.bk.promo = v; return inst.render(); }
        if (f === 'name' || f === 'email' || f === 'phone') st.form[f] = v;
        else if (f === 'cnum') st.card.num = v; else if (f === 'cexp') st.card.exp = v; else if (f === 'ccvc') st.card.cvc = v; else if (f === 'cpost') st.card.post = v;
        else if (f === 'draft') st.draft = v;
        else if (f === 'comment') st.comment = v;
        else if (f === 'gname') { st.names[+el.dataset.i] = v; const lab = root.querySelector('.g-names .g-lab span'); if (lab) lab.textContent = st.names.filter(x => x.trim()).length + ' of ' + (bk().adults + bk().children); }
      });
      BB.on(root, 'change', '[data-g-file]', el => {
        const file = el.files && el.files[0]; if (!file) return;
        const r = new FileReader();
        r.onload = () => {
          if (!inst.alive) return;
          if (!REAL()) return inst.set({ idImg: r.result });
          shrink(r.result, 1600, small => {
            if (!small) return inst.set({ upErr: 'That file is not a photo we can read. Try another.' });
            inst.set({ idImg: small, upload: 'sending', upErr: null });
            BB.api.call(BB.BOOT.idUrl, { image: small }).then(() => { BB.api.refetch(); inst.set({ upload: null }); })
              .catch(e => inst.set({ upload: null, idImg: null, upErr: e.message }));
          });
        };
        r.readAsDataURL(file);
      });
      root.addEventListener('submit', ev => {
        const form = ev.target.closest('[data-form]'); if (!form) return; ev.preventDefault();
        if (form.dataset.form === 'details') {
          const f = st.form;
          if (!f.name.trim()) return inst.set({ err: 'Add the name of the lead guest.' });
          if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return inst.set({ err: 'That email does not look right.' });
          return inst.set({ view: 'pay', err: null });
        }
        if (form.dataset.form === 'msg') send(inst, st.draft || '');
      });
      // signature pad: strokes stored as 0..1 points so repaints can redraw them
      let drawing = null;
      const pt = (cv, ev) => { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height]; };
      root.addEventListener('pointerdown', ev => {
        const cv = ev.target.closest('[data-sig]'); if (!cv) return; ev.preventDefault();
        try { cv.setPointerCapture(ev.pointerId); } catch (_) {}
        drawing = { cv, s: [pt(cv, ev)] }; st.strokes.push(drawing.s);
        const ph = root.querySelector('.g-sig-ph'); if (ph) ph.hidden = true;
      });
      root.addEventListener('pointermove', ev => {
        if (!drawing) return; const p = pt(drawing.cv, ev); drawing.s.push(p); drawStroke(drawing.cv, drawing.s, drawing.s.length - 2);
      });
      const end = () => { if (!drawing) return; drawing = null; inst.render(); };
      root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
    },
    route(inst, opts) { apply(inst, opts); inst.render(); },
    destroy(inst) { (inst.timers || []).forEach(clearTimeout); },
    render(inst) {
      const st = inst.st;
      let b = st.bid ? BB.q.booking(st.bid) : null;
      if (st.bid && !b) { newStay(inst, st.pid || 'laurel'); b = null; } // booking vanished (demo reset)
      const p = BB.q.property(b ? b.propertyId : st.pid) || S().properties[0];
      const v = st.view;
      const V = v === 'book' ? bookView(inst, p) : v === 'details' ? detailsView(inst, p) : v === 'pay' ? payView(inst, p) : v === 'done' ? doneView(inst, p) :
        !b ? bookView(inst, p) : v === 'checkin' ? checkinView(inst, p, b) : v === 'messages' ? msgView(inst, p, b) : v === 'guide' ? guideView(inst, p, b) : v === 'checkout' ? checkoutView(inst, p, b) : tripView(inst, p, b);
      const key = (st.bid || st.pid) + ':' + v + ':' + (v === 'checkin' ? st.ci : '');
      inst._changed = key !== inst._key; inst._key = key;
      inst._msgCount = V.msgCount;
      const tabs = b && ['trip', 'checkin', 'messages', 'guide', 'checkout'].includes(v);
      const t = b && BB.q.threadFor(b.id); const newMsgs = t && v !== 'messages' && t.messages.length > (st.seen[t.id] || 0) && t.messages[t.messages.length - 1].from !== 'guest';
      if (t && v === 'messages') st.seen[t.id] = t.messages.length;
      const right = b && v === 'trip' ? '<span class="g-me" title="' + esc(BB.q.guest(b.guestId).name) + '">' + esc(first(BB.q.guest(b.guestId).name)[0]) + '</span>' : null;
      const screen = BB.sbar() + top(inst, p, V.back || (b && v !== 'trip' && v !== 'done' && !tabs) || (tabs && v === 'checkin' && st.ci > 1 && st.ci < 5) || v === 'checkout', right) +
        '<main class="g-body ' + (V.bodyCls || '') + '" id="gBody-' + inst.uid + '"><div class="g-in' + (inst._changed ? ' g-anim' : '') + '">' + V.body + '</div></main>' +
        (V.cta ? '<div class="g-cta ' + (V.ctaCls || '') + '">' + V.cta + '</div>' : '') +
        (tabs ? '<nav class="g-tabs" aria-label="Trip">' + [['trip', 'home', 'Trip'], ['checkin', 'key', 'Check-in'], ['messages', 'sms', 'Messages'], ['guide', 'list', 'Guide']].map(([k, i, l]) =>
          '<button type="button" data-g="tab" data-v="' + k + '" aria-current="' + (v === k || (k === 'trip' && v === 'checkout') ? 'page' : 'false') + '">' + BB.icon(i) + '<span>' + l + '</span>' + (k === 'messages' && newMsgs ? '<i class="g-dot" aria-label="New message"></i>' : k === 'checkin' && !b.checkin.done && b.status === 'confirmed' ? '<i class="g-dot w"></i>' : '') + '</button>').join('') + '</nav>' : '');
      const phone = '<div class="g-app" style="' + themeVars(p) + '">' + BB.phone(screen, 'fluid') + '</div>';
      return '<div class="x-guest' + (inst.embedded ? ' emb' : '') + '">' + (inst.embedded ? phone : '<div class="g-wrap">' + side(inst) + '<div class="g-stage">' + phone + '</div></div>') + '</div>';
    },
    after(inst) {
      const body = inst.root.querySelector('#gBody-' + inst.uid);
      if (body && inst._changed) body.scrollTop = 0;
      if (body && inst.st.view === 'messages' && (inst._changed || inst._msgCount !== inst._lastMsgs)) body.scrollTop = body.scrollHeight;
      inst._lastMsgs = inst._msgCount;
      if (inst._changed) { const l = inst.root.querySelector('.g-demo-l'), on = l && l.querySelector('[aria-pressed="true"]'); if (on && (on.offsetTop < l.scrollTop || on.offsetTop + on.offsetHeight > l.scrollTop + l.clientHeight)) l.scrollTop = on.offsetTop - l.offsetTop - 8; }
      const cv = inst.root.querySelector('[data-sig]');
      if (cv) { const r = cv.getBoundingClientRect(), dpr = window.devicePixelRatio || 1; cv.width = Math.max(1, Math.round(r.width * dpr)); cv.height = Math.max(1, Math.round(r.height * dpr)); inst.st.strokes.forEach(s => drawStroke(cv, s, 0)); }
    },
  });

  function drawStroke(cv, s, from) {
    const ctx = cv.getContext('2d'); const w = cv.width, h = cv.height, dpr = window.devicePixelRatio || 1;
    ctx.strokeStyle = '#14161C'; ctx.lineWidth = 2.4 * dpr; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); const st = Math.max(0, from);
    ctx.moveTo(s[st][0] * w, s[st][1] * h);
    if (s.length === 1) ctx.lineTo(s[0][0] * w + 0.1, s[0][1] * h);
    for (let i = st + 1; i < s.length; i++) ctx.lineTo(s[i][0] * w, s[i][1] * h);
    ctx.stroke();
  }

  function send(inst, text) {
    const b = BB.q.booking(inst.st.bid); if (!b || !text.trim()) return;
    const t = BB.q.threadFor(b.id) || BB.act.openThread(b.guestId, b.id);
    inst.st.draft = '';
    BB.act.sendMessage(t.id, 'guest', text, 'Guest app');
  }

  function pay(inst, request, method) {
    const st = inst.st; if (st.paying) return;
    const k = st.bk, f = st.form;
    const input = { propertyId: st.pid, checkIn: k.a, checkOut: k.b, name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim(), adults: k.adults, children: k.children, pets: k.pets, promo: k.promo, subscribe: !!f.optin, source: 'guest-app' };
    if (request) input.pay = 'manual';
    inst.set({ paying: true, err: null });
    if (BB.api && (BB.BOOT.mode === 'trip' || BB.BOOT.mode === 'site')) {
      BB.api.book(input, request ? 'request' : 'pay').then(j => {
        if (!inst.alive) return;
        if (!j.ok) return inst.set({ paying: false, err: j.error || 'That did not go through. Try again.' });
        if (j.checkoutUrl) { location.href = j.checkoutUrl; return; }
        location.href = j.tripUrl + (j.tripUrl.indexOf('?') < 0 ? '?' : '&') + 'done=1';
      }).catch(e => { if (inst.alive) inst.set({ paying: false, err: e.message }); });
      return;
    }
    const id = setTimeout(() => {
      if (!inst.alive) return;
      const r = request ? BB.act.requestGuestBooking(input) : BB.act.createBooking(input);
      if (!r.ok) return inst.set({ paying: false, err: r.error });
      if (!request && method === 'Apple Pay') BB.toast('Paid with Apple Pay', 'good');
      st.paying = false;
      openBooking(inst, r.booking.id, 'done'); st.request = !!request;
      inst.render();
    }, request ? 400 : 900);
    inst.timers.push(id);
  }
})();
