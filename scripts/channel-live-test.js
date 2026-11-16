// Live check of a channel manager connection against a real (test) account.
// Connects, lists listings, closes two nights about 300 days out on one listing, checks they read back as taken,
// opens them again and checks they are free. Touches nothing else. Use a test or spare listing.
//
//   CM=beds24   BEDS24_INVITE_CODE=...                         LISTING=<room id>   node scripts/channel-live-test.js
//   CM=smoobu   SMOOBU_API_KEY=... SMOOBU_API_SECRET=...       LISTING=<apartment id> node scripts/channel-live-test.js
//   CM=hostaway HOSTAWAY_ACCOUNT_ID=... HOSTAWAY_API_KEY=...   LISTING=<listing id>  node scripts/channel-live-test.js
//   CM=guesty   GUESTY_CLIENT_ID=... GUESTY_CLIENT_SECRET=...  LISTING=<listing id>  node scripts/channel-live-test.js
//   CM=lodgify  LODGIFY_API_KEY=...                            (read only: lists listings and upcoming bookings)
// Without LISTING it only connects and prints the listings.
'use strict';
const { ADAPTERS } = require('../server/channels');
const ical = require('../server/ical');

const E = process.env;
const INPUT = {
  beds24: { inviteCode: E.BEDS24_INVITE_CODE, refreshToken: E.BEDS24_REFRESH_TOKEN },
  smoobu: { apiKey: E.SMOOBU_API_KEY, apiSecret: E.SMOOBU_API_SECRET },
  hostaway: { accountId: E.HOSTAWAY_ACCOUNT_ID, apiKey: E.HOSTAWAY_API_KEY },
  guesty: { clientId: E.GUESTY_CLIENT_ID, clientSecret: E.GUESTY_CLIENT_SECRET },
  lodgify: { apiKey: E.LODGIFY_API_KEY },
};
const step = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) process.exitCode = 1; };

(async () => {
  const id = E.CM; const A = ADAPTERS[id];
  if (!A) { console.error('Set CM to one of: ' + Object.keys(ADAPTERS).join(', ')); process.exit(2); }
  const r = await A.connect(INPUT[id]);
  step(true, 'connected to ' + A.name + ', ' + r.listings.length + ' listings');
  r.listings.forEach(l => console.log('     ' + l.id + '  ' + l.name));
  if (id === 'beds24' && r.creds.refreshToken && !E.BEDS24_REFRESH_TOKEN) console.log('     (refresh token for later runs: BEDS24_REFRESH_TOKEN=' + r.creds.refreshToken + ')');
  const lid = E.LISTING; if (!lid) return;
  const ctx = { creds: r.creds, save: async () => {} };
  const today = new Date().toISOString().slice(0, 10);
  const from = ical.addDay(today, +(E.DAYS_AHEAD || 300)), to = ical.addDay(from, 2);
  const taken = async () => { const g = await A.busy(ctx, lid, ical.addDay(from, -3), ical.addDay(to, 3)); const n = g.nights || g.ranges.flatMap(x => ical.nightsOf(x.from, x.to)); return ical.nightsOf(from, to).filter(d => n.includes(d)); };
  const before = await taken();
  step(true, 'read the calendar, ' + before.length + ' of the 2 test nights already taken');
  if (before.length) { step(false, 'pick a listing or DAYS_AHEAD where ' + from + ' to ' + to + ' are free'); return; }
  if (!A.block) { step(true, A.name + ' is read only here, so no write test'); return; }
  const ref = await A.block(ctx, lid, from, to, 'Bookingbooster live test');
  step(true, 'closed ' + from + ' to ' + to + ' (ref ' + ref + ')');
  await new Promise(res => setTimeout(res, 3000));
  const mid = await taken(); step(mid.length === 2, 'both nights read back as taken (' + mid.join(', ') + ')');
  await A.unblock(ctx, lid, { ref, from, to, lid });
  await new Promise(res => setTimeout(res, 3000));
  const after = await taken(); step(after.length === 0, 'opened again, ' + after.length + ' nights still taken');
})().catch(e => { step(false, (ADAPTERS[E.CM] || {}).name + ' ' + e.message); });
