// Sales automation flows: the five points where a lead or a host usually drops off, each with its own emails,
// alerts to the team, an on/off switch and numbers in /admin/flows.
//
//   lead_call  Lead to call        the 5-email nurture has run, no call booked: two nudges to book one
//   call_paid  Call to paid        no-show: rebook emails. Had the call, not signed up: follow-ups, then a team alert
//   signup     Unfinished sign-up  signed up, plan not paid: reminders at 1 hour, 1 day and 3 days
//   onboard    First 30 days       emails follow what the host has actually set up; the team hears about stuck hosts
//   retain     Keep and win back   failed-payment reminders, quiet-host warning, pause instead of cancel, 30-day win-back
//
// Each step says when it is due: a time in ms, or false (not for this person, or not yet).
// A step is sent once per person. A step more than 2 days late (the flow was off, or the server was) is skipped,
// so switching a flow on never sends a pile of old emails. Every email goes through messaging.sendEmail (outbox).
// Lead emails stop for good after an unsubscribe; host emails follow the host's email choices (hostprefs).
//
// Everything lives in the kv table, so no schema change is needed:
//   flows:settings          { <flow>: { on, since } }
//   flowst:<flow>:<subject> one person in one flow: { in, sent: { step: at }, skipped: { step: at }, goal, outcome }
//   flowobs:<wid>           what the flows saw last for a host: billing status and since when, cancel requests
//   flowseen:<wid>          when the host last opened their console
//   flows:alerts            the team's to-do list from the flows (newest first, last 200)
//   flows:last              when the flows last ran (they run every 5 minutes from the background job)
'use strict';

const DAY = 864e5, HOUR = 36e5, LATE = 2 * DAY, EVERY = 5 * 6e4;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const first = n => (String(n || '').trim().split(/\s+/)[0] || 'there');

module.exports = function ({ db, cfg, msg, auth, ws, leads, hostMail, stripe, log }) {
  const q = {
    kvGet: db.prepare('SELECT v FROM kv WHERE k = ?'),
    kvSet: db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = excluded.v'),
    kvLike: db.prepare('SELECT k, v FROM kv WHERE k LIKE ?'),
    leads: db.prepare("SELECT l.id, l.email, l.name, l.created_at, s.seq, s.status, s.vars FROM leads l JOIN lead_seq s ON s.lead_id = l.id WHERE s.seq IN ('fee', 'audit', 'webinar', 'call') AND l.created_at > ? ORDER BY l.created_at"),
    optedOut: db.prepare('SELECT 1 FROM lead_optout WHERE email = lower(?)'),
    user: db.prepare("SELECT w.id, w.billing_status FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE lower(u.email) = lower(?) AND w.kind = 'live'"),
    calls: db.prepare("SELECT s.vars FROM lead_seq s JOIN leads l ON l.id = s.lead_id WHERE s.seq = 'call' AND lower(l.email) = lower(?)"),
    hosts: db.prepare("SELECT id, billing_status, stripe_customer, created_at, last_seen FROM workspaces WHERE kind = 'live'"),
    login: db.prepare('SELECT max(s.created_at) AS at FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.workspace_id = ?'),
  };
  const get = async k => { const r = await q.kvGet.get(k); try { return r ? JSON.parse(r.v) : null; } catch (_) { return null; } };
  const put = (k, v) => q.kvSet.run(k, JSON.stringify(v));
  const app = p => cfg.baseUrl + p;
  const bookCall = () => leads.settings().book_call_url || app('/demo');
  const paid = st => st === 'active' || st === 'past_due';

  /* ---------- the emails ---------- */
  // One layout for every flow email: logo, heading, short paragraphs, one button, sign-off, unsubscribe line.
  function layout(m, v) {
    const fill = s => String(typeof s === 'function' ? s(v) : s || '').replace(/\{([a-z_]+)\}/g, (x, k) => (v[k] == null ? x : esc(String(v[k]))));
    const plain = h => h.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    const blocks = [].concat(typeof m.body === 'function' ? m.body(v) : m.body).filter(Boolean);
    const P = b => (b.list ? '<ul style="margin:0 0 16px;padding-left:20px">' + b.list.map(x => '<li style="margin:0 0 6px">' + fill(x) + '</li>').join('') + '</ul>' : '<p style="margin:0 0 16px">' + fill(b) + '</p>');
    const cta = m.cta && (typeof m.cta === 'function' ? m.cta(v) : m.cta);
    const subject = plain(fill(m.subject));
    const why = v._host ? 'You are getting this because you have a Bookingbooster account.' : 'You are getting this because you asked for it on our website.';
    const unsub = v.unsubscribe_url ? ' <a href="' + esc(v.unsubscribe_url) + '" style="color:#8A90A6">' + (v._host ? 'Email settings' : 'Unsubscribe in one click') + '</a>' : '';
    const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(subject) + '</title></head><body style="margin:0;background:#F4F5F9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#141A33">' +
      '<div style="display:none;max-height:0;overflow:hidden">' + fill(m.preview) + '</div>' +
      '<div style="max-width:560px;margin:0 auto;padding:24px 16px"><p style="margin:0 0 16px"><img src="' + esc(app('/email-img/brand/logo.png')) + '" alt="bookingbooster" height="28" style="height:28px;border:0"></p>' +
      '<div style="background:#fff;border-radius:16px;padding:28px 24px;font-size:16px;line-height:1.55">' +
      '<p style="margin:0 0 16px">Hi ' + esc(v.first_name) + ',</p>' + blocks.map(P).join('') +
      (cta && cta.href ? '<p style="margin:8px 0 24px"><a href="' + esc(cta.href) + '" style="display:inline-block;background:#3355FF;color:#fff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">' + fill(cta.label) + '</a></p>' : '') +
      '<p style="margin:0 0 4px">' + esc(m.signoff || 'Thanks,') + '</p><p style="margin:0">' + esc(cfg.leads.signoff) + '</p></div>' +
      '<div style="padding:16px 8px"><p style="margin:0;color:#8A90A6;font-size:12px;line-height:1.5">' + esc(cfg.company.name) + ' · United Kingdom · ' + why + unsub + '</p></div></div></body></html>';
    const text = ['Hi ' + v.first_name + ','].concat(blocks.map(b => (b.list ? b.list.map(x => '- ' + plain(fill(x))).join('\n') : plain(fill(b)))),
      cta && cta.href ? [plain(fill(cta.label)) + ': ' + cta.href] : [], [(m.signoff || 'Thanks,') + '\n' + cfg.leads.signoff], v.unsubscribe_url ? ['Email settings: ' + v.unsubscribe_url] : []).join('\n\n');
    return { subject, html, text };
  }

  /* ---------- the five flows ---------- */
  // s (the subject): { id, kind: 'lead'|'host', email, name, at (when they entered), st (their state in this flow), ... }
  const FLOWS = [
    {
      id: 'lead_call', name: 'Lead to call', icon: 'users',
      about: 'Leads from the fee check, AI audit and live demo get their 5-email series first. If they still have not booked a call, two short nudges ask for 15 minutes.',
      goalLabel: 'Booked a call or signed up',
      steps: [
        { key: 'N1', label: 'Day 12: book a call nudge', when: s => s.at + 12 * DAY,
          subject: '15 minutes on your numbers, {first_name}?', preview: 'A quick call to turn what you read into a plan for your home.',
          body: ['You have had our guides and tips for a couple of weeks now. Reading is the easy part. Putting it into practice on your own home is where most hosts get stuck.',
            'So here is an offer: a free 15-minute call where we look at your listing, your fees and your calendar together, and you leave with three things to do next. No slides, no hard sell.'],
          cta: () => ({ label: 'Pick a time for the call', href: bookCall() }) },
        { key: 'N2', label: 'Day 19: last nudge', when: s => s.at + 19 * DAY,
          subject: 'Last one from me about the call', preview: 'Still happy to look at your home with you. After this, just the monthly tips.',
          body: ['I will not keep asking, promise. If a direct booking site is on your list for this year, a 15-minute call is the fastest way to know what it would take for your home and what it would earn.',
            'If now is not the right time, no problem at all. You will keep getting one useful tip a month.'],
          cta: () => ({ label: 'Book the 15-minute call', href: bookCall() }) },
      ],
    },
    {
      id: 'call_paid', name: 'Call to paid', icon: 'spark',
      about: 'After a walkthrough call. No-shows get a friendly rebook email. People who had the call but have not signed up get a follow-up the next day and on day 3, then the team gets a reminder to ring them. If nobody marks the call within a day, it counts as attended.',
      goalLabel: 'Signed up (or rebooked, after a no-show)',
      steps: [
        { key: 'K0', label: '2 hours after: ask the team how it went', alert: true, when: s => (s.outcome ? false : s.call_at + 2 * HOUR),
          alertText: s => 'Mark how the walkthrough call with ' + s.email + ' went (attended or no-show), so the right follow-up goes out.' },
        { key: 'R1', label: 'No-show: rebook', when: s => (s.outcome === 'noshow' ? s.outcome_at : false),
          subject: 'Sorry we missed you, {first_name}', preview: 'No problem at all. Pick another time that suits you.',
          body: ['We were on the call at {call_time} but could not see you there. Life with holiday lets is busy, so no worries at all.',
            'The walkthrough is still yours: 15 minutes on your listing, your fees and what a direct booking site would do for your home. Pick any time that works for you.'],
          cta: () => ({ label: 'Pick a new time', href: bookCall() }) },
        { key: 'R2', label: 'No-show: second try, day 2', when: s => (s.outcome === 'noshow' ? s.outcome_at + 2 * DAY : false),
          subject: 'Still want that walkthrough?', preview: 'Two minutes to rebook, fifteen minutes on the call.',
          body: ['Just checking you saw my last email. If you would still like the walkthrough, there are times this week and next.', 'If it is not for you right now, simply ignore this and we will leave it there.'],
          cta: () => ({ label: 'Rebook the call', href: bookCall() }) },
        { key: 'F1', label: 'Attended: next-day follow-up', when: s => (s.attended ? s.call_at + DAY : false),
          subject: 'Your next step after our call', preview: 'Everything we covered, and how to get your site live in 7 days.',
          body: ['Thanks for your time on the call. A quick recap of how it works from here:',
            { list: ['Growth is £200 a month, no setup fee, cancel anytime', 'Your direct booking site goes live within 7 days', 'Guests pay you directly by card, and the money lands in your bank, not ours', 'We start on your AI search and Google fix list in week 2'] },
            'It takes about 5 minutes to start. Any questions, just reply to this email.'],
          cta: () => ({ label: 'Start my site', href: app('/start?plan=Growth') }) },
        { key: 'F2', label: 'Attended: day 3 follow-up', when: s => (s.attended ? s.call_at + 3 * DAY : false),
          subject: 'Anything holding you back?', preview: 'Questions about the price, the switch or the timing? Reply and ask.',
          body: ['Most hosts I speak to have one question left before they start. Usually one of these:',
            { list: ['<b>Will guests really book direct?</b> Your past guests already know you. They just need a place to book that is not a platform.', '<b>Do I have to leave Airbnb?</b> No. Keep your listings. Your calendar syncs both ways, so nothing double books.', '<b>What if it does not work for me?</b> Cancel anytime, no contract.'] },
            'If yours is something else, just hit reply. I read every one.'],
          cta: () => ({ label: 'Start my site', href: app('/start?plan=Growth') }) },
        { key: 'F3', label: 'Attended: day 5 team call reminder', alert: true, when: s => (s.attended ? s.call_at + 5 * DAY : false),
          alertText: s => s.email + ' had a walkthrough call 5 days ago and has not signed up. Give them a quick ring or a personal email.' },
      ],
    },
    {
      id: 'signup', name: 'Unfinished sign-up', icon: 'card',
      about: 'Hosts who made an account but have not paid for their plan yet. Reminders at 1 hour, 1 day and 3 days, and the team hears about it on day 3. Only runs while card billing (Stripe) is switched on.',
      goalLabel: 'Paid for their plan',
      steps: [
        { key: 'S1', label: '1 hour: finish setting up', when: s => s.at + HOUR,
          subject: 'Your site for {property_name} is one step away', preview: 'You are nearly there. Start your plan to open your console.',
          body: ['You started setting up {property_name} on Bookingbooster. Thank you!', 'There is one step left: start your plan, and your console opens straight away so you can add photos, connect payouts and get your booking site live.'],
          cta: () => ({ label: 'Finish and open my console', href: app('/app/pay') }) },
        { key: 'S2', label: '1 day: what you get', when: s => s.at + DAY,
          subject: 'Here is what is waiting for {property_name}', preview: 'Your own booking site, guest app, calendar sync and AI search visibility.',
          body: ['Yesterday you started your Bookingbooster account. Here is what opens up once your plan is started:',
            { list: ['Your own booking website, live within 7 days', 'Guests pay you directly, with no platform fees', 'Calendar sync with Airbnb and Booking.com, so nothing double books', 'Help to show up in Google and AI assistants like ChatGPT'] },
            'Growth is £200 a month, with no setup fee and no contract.'],
          cta: () => ({ label: 'Start my plan', href: app('/app/pay') }) },
        { key: 'S3', label: '3 days: can we help?', when: s => s.at + 3 * DAY,
          subject: 'Can we help you finish, {first_name}?', preview: 'If something stopped you, reply and tell us. We will sort it.',
          body: ['Your account for {property_name} is still waiting for its first step. If something got in the way, like a question about the price, payment or how it works with Airbnb, just reply. A real person reads every email.',
            'Or book 15 minutes and we will walk you through it.'],
          cta: () => ({ label: 'Finish my sign-up', href: app('/app/pay') }) },
        { key: 'S4', label: '3 days: tell the team', alert: true, when: s => s.at + 3 * DAY + HOUR,
          alertText: s => s.email + ' signed up 3 days ago (' + s.property_name + ') and still has not paid. Worth a personal email or call.' },
      ],
    },
    {
      id: 'onboard', name: 'First 30 days', icon: 'home',
      about: 'For paying hosts in their first month. On top of the day-2 checklist and week-3 tips, these emails follow what the host has actually set up, point at the next missing step, and alert the team if they get stuck.',
      goalLabel: 'Finished the 4 setup steps',
      steps: [
        { key: 'O1', label: 'Day 5: your next step', when: s => (s.done ? false : s.at + 5 * DAY),
          subject: 'Next up for {property_name}: {next_step}', preview: '{steps_done} of 4 setup steps done. Here is the next one.',
          body: ['You have done {steps_done} of the 4 setup steps for {property_name}. Nice work.', 'The next one is <b>{next_step}</b>: {next_help}', 'It takes most hosts about 10 minutes.'],
          cta: () => ({ label: 'Do it now', href: app('/app') }) },
        { key: 'O2', label: 'Day 10: stuck? we will help', when: s => (s.done ? false : s.at + 10 * DAY),
          subject: 'Want a hand with {next_step}?', preview: 'Book 15 minutes and we will do it with you.',
          body: ['Your site for {property_name} is nearly ready, but {left} still to do:', { list: ['{todo}'] }, 'If any of these is fiddly, book 15 minutes and we will do it with you on the call.'],
          cta: () => ({ label: 'Book a setup call', href: bookCall() }) },
        { key: 'O3', label: 'Day 12: tell the team (stuck)', alert: true, when: s => (s.done ? false : s.at + 12 * DAY),
          alertText: s => s.email + ' (' + s.property_name + ') is 12 days in and still has ' + s.todo.length + ' setup step' + (s.todo.length === 1 ? '' : 's') + ' to do: ' + s.todo.join(', ') + '.' },
        { key: 'O4', label: 'Setup done: well done', afterGoal: true, when: s => (s.done ? s.now : false),
          subject: '{property_name} is all set up', preview: 'All 4 setup steps done. Here is how to get your first direct booking.',
          body: ['All 4 setup steps for {property_name} are done. That puts you ahead of most hosts.', 'The fastest way to your first direct booking is your past guests. Import your guest list in Guests, then switch on the “come back” campaign. It does the rest.'],
          cta: () => ({ label: 'Open my guest list', href: app('/app') }) },
      ],
    },
    {
      id: 'retain', name: 'Keep and win back', icon: 'check',
      about: 'Failed payments get two more reminders before the team steps in. Hosts who have not opened their console in 14 days get a friendly check-in. Anyone who asks to cancel is offered a pause instead. Cancelled hosts get a win-back email after 30 days.',
      goalLabel: 'Kept or won back',
      steps: [
        { key: 'P1', label: 'Payment failed: day 3 reminder', repeat: s => s.status_since, when: s => (s.status === 'past_due' ? s.status_since + 3 * DAY : false),
          subject: 'Reminder: please update your card', preview: 'Your Bookingbooster payment is still not through. Your site stays live for now.',
          body: ['A quick reminder that your last Bookingbooster payment did not go through. Your booking site is still live for now.', 'It takes a minute to update your card, and Stripe will try again straight away.'],
          cta: () => ({ label: 'Update my card', href: app('/app/billing') }) },
        { key: 'P2', label: 'Payment failed: day 7, last reminder', repeat: s => s.status_since, when: s => (s.status === 'past_due' ? s.status_since + 7 * DAY : false),
          subject: 'Action needed: your site could go offline', preview: 'We still cannot take your payment. Update your card to keep your site live.',
          body: ['We have tried a few times but still cannot take your Bookingbooster payment.', 'If the plan ends, your booking site goes offline and guests cannot book direct. Update your card now to keep everything running, or reply if you need help.'],
          cta: () => ({ label: 'Update my card', href: app('/app/billing') }) },
        { key: 'P3', label: 'Payment failed: day 7, tell the team', alert: true, repeat: s => s.status_since, when: s => (s.status === 'past_due' ? s.status_since + 7 * DAY + HOUR : false),
          alertText: s => s.email + ' (' + s.property_name + ') has had a failed payment for 7 days. Contact them before the plan ends.' },
        { key: 'Q1', label: 'Quiet for 14 days: check-in', repeat: s => s.seen, when: s => (s.status === 'active' && !s.cancelling ? s.seen + 14 * DAY : false),
          subject: 'Here is what happened while you were away', preview: 'Your site kept working. A few quick wins are waiting for you.',
          body: ['It has been a couple of weeks since you looked at your Bookingbooster console, so here is a quick nudge.', 'Your booking site for {property_name} is live and working. A few minutes this week, like replying to a guest, adding photos or sending your guest list a gap-night offer, can turn into a direct booking.'],
          cta: () => ({ label: 'Open my console', href: app('/app') }) },
        { key: 'Q2', label: 'Quiet for 21 days: tell the team', alert: true, repeat: s => s.seen, when: s => (s.status === 'active' && !s.cancelling ? s.seen + 21 * DAY : false),
          alertText: s => s.email + ' (' + s.property_name + ') has not opened their console in 3 weeks. A personal check-in could save this one.' },
        { key: 'C1', label: 'Asked to cancel: offer a pause', repeat: s => (s.cancelling ? s.cancelling.at : 0), when: s => (s.cancelling && s.status === 'active' ? s.cancelling.at : false),
          subject: 'Before you go: you can pause instead', preview: 'Pause your plan for 1 to 3 months. Your site and guest list stay safe.',
          body: ['We saw that your plan is set to end. Before it does: if this is about a quiet season or a busy patch, you can <b>pause</b> instead.',
            { list: ['Pause for 1, 2 or 3 months with no charge', 'Your site, guest list and settings stay exactly as they are', 'It starts again by itself, or you can still cancel anytime'] },
            'If you are leaving for another reason, we would really like to know why. Just reply.'],
          cta: s => ({ label: 'Pause instead of cancelling', href: s.pause_url }) },
        { key: 'C2', label: 'Asked to cancel: tell the team', alert: true, repeat: s => (s.cancelling ? s.cancelling.at : 0), when: s => (s.cancelling && s.status === 'active' ? s.cancelling.at + 5 * 6e4 : false),
          alertText: s => s.email + ' (' + s.property_name + ') has asked to cancel. They were offered a pause. A personal message could keep them.' },
        { key: 'W1', label: 'Cancelled 30 days: win-back', repeat: s => s.status_since, when: s => (s.status === 'cancelled' ? s.status_since + 30 * DAY : false),
          subject: 'Your site is still here, {first_name}', preview: 'Everything is saved. Come back and pick up where you left off.',
          body: ['It has been a month since your Bookingbooster plan ended. Your site for {property_name}, your guest list and your settings are all still saved.', 'A lot has improved since you left, including better AI search visibility and faster setup. Come back any time and pick up right where you left off.'],
          cta: () => ({ label: 'Restart my plan', href: app('/app/billing') }) },
      ],
    },
  ];
  const byId = Object.fromEntries(FLOWS.map(f => [f.id, f]));

  /* ---------- settings: on/off ---------- */
  async function settings() {
    let s = await get('flows:settings');
    if (!s) s = {};
    let changed = false;
    for (const f of FLOWS) if (!s[f.id]) { s[f.id] = { on: true, since: Date.now() - 3 * DAY }; changed = true; } // new flows start on, and only pick up the last 3 days
    if (changed) await put('flows:settings', s);
    return s;
  }
  async function toggle(id, on) {
    if (!byId[id]) return false;
    const s = await settings(); const was = s[id].on;
    s[id] = { on: !!on, since: on && !was ? Date.now() : s[id].since }; // switched back on: start from now, so nothing old goes out
    await put('flows:settings', s); return true;
  }

  /* ---------- who is in each flow right now ---------- */
  async function leadSubjects(since) {
    const rows = await q.leads.all(since - 30 * DAY), out = { lead_call: [], call_paid: [] };
    const seen = new Set();
    for (const r of rows) {
      if (!r.email || ['unsubscribed', 'stopped'].includes(r.status) || await q.optedOut.get(r.email)) continue;
      const u = await q.user.get(r.email), v = JSON.parse(r.vars || '{}');
      const base = { kind: 'lead', lead: r.id, email: r.email, name: r.name, first_name: first(r.name), unsubscribe_url: app('/u/lead/' + r.id + '/' + auth.sign('lead', r.id)) };
      if (r.seq === 'call') {
        if (!v.call_at) continue;
        const later = (await q.calls.all(r.email)).some(c => { try { return JSON.parse(c.vars).call_at > v.call_at; } catch (_) { return false; } });
        out.call_paid.push(Object.assign(base, { id: 'l' + r.id, at: v.call_at, call_at: v.call_at, call_time: new Date(v.call_at).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' }),
          goal: u ? (stripe.enabled ? paid(u.billing_status) : true) : later }));
      } else {
        const key = r.email.toLowerCase(); if (seen.has(key)) continue; seen.add(key); // one nudge series per person, from their first form
        const booked = (await q.calls.all(r.email)).length > 0;
        out.lead_call.push(Object.assign(base, { id: 'l' + r.id, at: r.created_at, goal: !!u || booked }));
      }
    }
    return out;
  }
  async function hostSubjects(now) {
    const out = { signup: [], onboard: [], retain: [] };
    for (const r of await q.hosts.all()) {
      const w = await ws.open(r.id); if (!w || !w.state.account.email) continue;
      const s = w.state, p = s.properties[0], status = r.billing_status || 'trial';
      const prefs = await hostMail.prefs(r.id);
      const obs = (await get('flowobs:' + r.id)) || {};
      if (obs.status !== status) { obs.since = obs.status === undefined ? 0 : now; obs.status = status; if (status !== 'active') delete obs.cancelling; await put('flowobs:' + r.id, obs); }
      const login = await q.login.get(r.id), seenAt = await get('flowseen:' + r.id);
      const base = { kind: 'host', wid: r.id, email: s.account.email, name: s.account.owner, first_name: first(s.account.owner), property_name: (p && p.name) || s.account.business, _host: true,
        status, status_since: obs.since || r.created_at, now, seen: Math.max(r.created_at, (login && +login.at) || 0, (seenAt && seenAt.at) || 0) };
      if (stripe.enabled && status === 'trial' && prefs.setup !== false) out.signup.push(Object.assign({}, base, { id: 'w' + r.id, at: r.created_at, goal: false, unsubscribe_url: hostMail.unsubUrl(r.id, 'setup') }));
      if (paid(status) || (!stripe.enabled && status === 'trial')) {
        if (now - r.created_at < 30 * DAY && prefs.setup !== false) {
          const items = hostMail.checklist(w).filter(x => !x[3]), todo = items.filter(x => !x[2]);
          const nx = todo[0] || ['', ''];
          out.onboard.push(Object.assign({}, base, { id: 'w' + r.id, at: r.created_at, done: !todo.length, goal: !todo.length, todo: todo.map(x => x[0]), steps_done: items.length - todo.length,
            next_step: nx[0].replace(/,.*$/, '').toLowerCase(), next_help: nx[1], left: todo.length === 1 ? 'one step is' : todo.length + ' steps are', unsubscribe_url: hostMail.unsubUrl(r.id, 'setup') }));
        }
      }
      if (r.stripe_customer || paid(status) || status === 'cancelled') {
        out.retain.push(Object.assign({}, base, { id: 'w' + r.id, at: r.created_at, cancelling: obs.cancelling || null, pause_url: pauseUrl(r.id), goal: false,
          unsubscribe_url: status === 'cancelled' ? (prefs.news === false ? null : hostMail.unsubUrl(r.id, 'news')) : null, optout: status === 'cancelled' && prefs.news === false }));
      }
    }
    return out;
  }

  /* ---------- sending ---------- */
  async function teamAlert(flow, step, s, now) {
    const text = step.alertText(s);
    const list = (await get('flows:alerts')) || [];
    list.unshift({ id: flow.id + ':' + s.id + ':' + step.key + ':' + now, flow: flow.id, step: step.key, who: s.email, text, at: now, link: s.kind === 'host' ? app('/admin/hosts/' + s.wid) : app('/admin/leads') });
    await put('flows:alerts', list.slice(0, 200));
    const to = cfg.admins.length ? cfg.admins : [cfg.company.support];
    for (const a of to) await msg.sendEmail({ to: a, subject: 'Team to-do: ' + flow.name + ', ' + s.email, text: text + '\n\nOpen the flows: ' + app('/admin/flows'), meta: { flow: flow.id, step: step.key, team: true } });
  }
  async function sendStep(flow, step, s, now) {
    if (step.alert) return teamAlert(flow, step, s, now);
    const m = layout(Object.assign({}, step, { cta: step.cta ? () => step.cta(s) : null }), Object.assign({}, s, { todo: null }));
    // the onboarding list of missing steps
    const html = s.todo ? m.html.replace('<li style="margin:0 0 6px">{todo}</li>', s.todo.map(t => '<li style="margin:0 0 6px">' + esc(t) + '</li>').join('')) : m.html;
    const text = s.todo ? m.text.replace('- {todo}', s.todo.map(t => '- ' + t).join('\n')) : m.text;
    return msg.sendEmail({ workspaceId: s.wid || undefined, to: s.email, subject: m.subject, text, html, from: s.kind === 'lead' ? cfg.leads.from || undefined : undefined, replyTo: cfg.company.support,
      unsubscribeUrl: s.unsubscribe_url || undefined, meta: { flow: flow.id, step: step.key, lead: s.lead, host: s.kind === 'host' } });
  }

  // One person through one flow: send what is due, skip what is too late or was due while the flow was off,
  // and note when they reached the goal. A person is only recorded once the flow has sent them something.
  async function step(flow, s, now, since) {
    const k = 'flowst:' + flow.id + ':' + s.id;
    const st = (await get(k)) || { in: now, sent: {}, skipped: {} }, isNew = !st.saved;
    if (flow.id === 'retain') s.seen = Math.max(s.seen, since + 3 * DAY); // quiet clocks start when the flow was switched on
    Object.assign(s, { outcome: st.outcome, outcome_at: st.outcome_at, attended: st.outcome === 'attended' || (!st.outcome && !!s.call_at && now > s.call_at + DAY) });
    if (isNew && s.goal && !st.outcome && !flow.steps.some(x => x.afterGoal)) return 0;
    let n = 0, dirty = false;
    if (s.goal && !st.goal) { st.goal = now; dirty = true; }
    for (const x of flow.steps) {
      if (x.repeat) { // a new episode (another failed payment, another quiet spell, another cancel request) starts the step again
        const from = x.repeat(s) || 0;
        if (st.sent[x.key] && from > st.sent[x.key]) { delete st.sent[x.key]; dirty = true; }
        if (st.skipped[x.key] && from > st.skipped[x.key]) { delete st.skipped[x.key]; dirty = true; }
      }
      if (st.sent[x.key] || st.skipped[x.key]) continue;
      if (st.goal && !x.afterGoal) continue;
      if (s.optout && !x.alert) continue;
      const due = x.when(s); if (due === false || due == null || due > now) continue;
      if (now - due > LATE || due < since) { if (!isNew) { st.skipped[x.key] = now; dirty = true; } continue; }
      const r = await sendStep(flow, x, s, now);
      if (r && r.ok === false && !r.test) { log('flows', flow.id, s.id, x.key, r.error); break; } // provider error: try again next run
      st.sent[x.key] = now; n++; dirty = true;
    }
    if (dirty && (!isNew || n || st.outcome)) { st.saved = true; st.email = s.email; await put(k, st); }
    return n;
  }

  let running = null;
  async function run(now, force) {
    if (running) return running;
    running = (async () => {
      now = now || Date.now();
      const last = (await get('flows:last')) || {};
      if (!force && last.at && now - last.at < EVERY && now >= last.at) return 0;
      await put('flows:last', { at: now });
      await leads.loadSettings();
      const set = await settings();
      const on = FLOWS.filter(f => set[f.id].on); if (!on.length) return 0;
      const subs = Object.assign({}, on.some(f => ['lead_call', 'call_paid'].includes(f.id)) ? await leadSubjects(now) : {}, on.some(f => ['signup', 'onboard', 'retain'].includes(f.id)) ? await hostSubjects(now) : {});
      let n = 0;
      for (const f of on) for (const s of subs[f.id] || []) { try { n += await step(f, s, now, set[f.id].since); } catch (e) { log('flows', f.id, s.id, e.message); } }
      return n;
    })().finally(() => { running = null; });
    return running;
  }

  /* ---------- events from the rest of the app ---------- */
  // The host opened their console. Written at most once an hour.
  const seenMem = new Map();
  async function seen(wid, now = Date.now()) {
    if (now - (seenMem.get(wid) || 0) < HOUR) return; seenMem.set(wid, now);
    await put('flowseen:' + wid, { at: now });
  }
  // Stripe says the plan is set to end (cancel at period end): offer a pause.
  async function cancelling(wid, sub) {
    const obs = (await get('flowobs:' + wid)) || {};
    if (sub && sub.cancel_at_period_end) { if (!obs.cancelling) obs.cancelling = { at: Date.now(), sub: sub.id, ends: sub.current_period_end ? sub.current_period_end * 1000 : null }; }
    else delete obs.cancelling;
    await put('flowobs:' + wid, obs);
    if (obs.cancelling) await run(Date.now(), true);
  }

  // The team marks a walkthrough call: attended or no-show.
  async function markCall(leadId, outcome, now = Date.now()) {
    if (!['attended', 'noshow'].includes(outcome)) return false;
    const k = 'flowst:call_paid:l' + leadId, st = (await get(k)) || { in: now, sent: {}, skipped: {} };
    st.outcome = outcome; st.outcome_at = now; st.sent.K0 = st.sent.K0 || now; st.saved = true; await put(k, st);
    const list = await alerts(); let hit = false; // the "mark this call" to-do is done now
    for (const x of list) if (!x.done && x.id.startsWith('call_paid:l' + leadId + ':K0:')) { x.done = now; hit = true; }
    if (hit) await put('flows:alerts', list);
    await run(now, true); return true;
  }

  /* ---------- pause instead of cancel ---------- */
  const pauseSig = wid => auth.sign('flowpause', wid);
  function pauseUrl(wid) { return app('/u/pause/' + wid + '/' + pauseSig(wid)); }
  const pauseOk = (wid, sig) => !!wid && auth.verify(sig, 'flowpause', wid);
  // Pause collection for 1 to 3 months and take back the cancel request. Stripe keeps the subscription; nothing is charged.
  async function pause(wid, months, now = Date.now()) {
    months = Math.max(1, Math.min(3, Math.round(+months || 1)));
    const r = await ws.row(wid); if (!r || !r.stripe_customer) return { error: 'We could not find your plan. Reply to any of our emails and we will sort it.' };
    const until = now + months * 30 * DAY;
    try {
      const subs = await stripe.api('GET', '/subscriptions', { customer: r.stripe_customer, status: 'active', limit: 10 });
      const sub = (subs.data || [])[0]; if (!sub) return { error: 'There is no active plan to pause.' };
      await stripe.api('POST', '/subscriptions/' + sub.id, { cancel_at_period_end: false, pause_collection: { behavior: 'void', resumes_at: Math.floor(until / 1000) } });
    } catch (e) { log('flows pause', wid, e.message); return { error: 'We could not pause it automatically. We have told the team and they will do it for you today.', alert: true }; }
    const obs = (await get('flowobs:' + wid)) || {}; delete obs.cancelling; obs.paused = { at: now, until, months }; await put('flowobs:' + wid, obs);
    const list = (await get('flows:alerts')) || [];
    list.unshift({ id: 'retain:w' + wid + ':pause:' + now, flow: 'retain', step: 'paused', who: '', text: 'A host paused their plan for ' + months + ' month' + (months > 1 ? 's' : '') + ' instead of cancelling.', at: now, link: app('/admin/hosts/' + wid), good: true });
    await put('flows:alerts', list.slice(0, 200));
    return { ok: true, until, months };
  }
  async function pauseFailed(wid, months) {
    const w = await ws.open(wid), email = w ? w.state.account.email : wid;
    await teamAlert(byId.retain, { key: 'pause', alertText: () => email + ' asked to pause for ' + months + ' month(s) instead of cancelling, but Stripe did not accept it. Pause their subscription by hand.' }, { id: 'w' + wid, wid, kind: 'host', email }, Date.now());
  }

  /* ---------- numbers for /admin/flows ---------- */
  async function overview() {
    const set = await settings(), out = [];
    for (const f of FLOWS) {
      const rows = (await q.kvLike.all('flowst:' + f.id + ':%')).map(r => { try { return JSON.parse(r.v); } catch (_) { return null; } }).filter(Boolean);
      const perStep = f.steps.map(x => ({ key: x.key, label: x.label, alert: !!x.alert, sent: rows.filter(r => r.sent && r.sent[x.key]).length }));
      const entered = rows.length, won = rows.filter(r => r.goal).length;
      const d30 = Date.now() - 30 * DAY, recent = rows.filter(r => r.in > d30);
      out.push({ id: f.id, name: f.name, icon: f.icon, about: f.about, goalLabel: f.goalLabel, on: set[f.id].on, since: set[f.id].since, entered, won, rate: entered ? Math.round(100 * won / entered) : null,
        emails: perStep.filter(x => !x.alert).reduce((a, x) => a + x.sent, 0), alerts: perStep.filter(x => x.alert).reduce((a, x) => a + x.sent, 0), recent: recent.length, steps: perStep,
        people: rows.sort((a, b) => b.in - a.in).slice(0, 8).map(r => ({ email: r.email || '', in: r.in, goal: r.goal, outcome: r.outcome, last: Object.entries(r.sent || {}).sort((a, b) => b[1] - a[1])[0] || null })) });
    }
    return out;
  }
  // Calls that still need a mark (attended or no-show): the last 14 days.
  async function openCalls(now = Date.now()) {
    const out = [];
    for (const r of await q.leads.all(now - 30 * DAY)) {
      if (r.seq !== 'call') continue; const v = JSON.parse(r.vars || '{}'); if (!v.call_at || v.call_at > now || v.call_at < now - 14 * DAY) continue;
      const st = await get('flowst:call_paid:l' + r.id);
      out.push({ id: r.id, email: r.email, name: r.name, call_at: v.call_at, outcome: st && st.outcome || null });
    }
    return out.sort((a, b) => b.call_at - a.call_at);
  }
  async function alerts() { return (await get('flows:alerts')) || []; }
  async function doneAlert(id) { const list = await alerts(); const a = list.find(x => x.id === id); if (a) { a.done = Date.now(); await put('flows:alerts', list); } return !!a; }

  // A sample of one step, rendered for a made-up person (the admin preview).
  function sample(flowId, key) {
    const f = byId[flowId], x = f && f.steps.find(s => s.key === key); if (!x || x.alert) return null;
    const s = { id: 'sample', _host: !['lead_call', 'call_paid'].includes(flowId), email: 'hannah@example.co.uk', name: 'Hannah Lees', first_name: 'Hannah',
      property_name: 'Gull Cottage', call_time: '10:30', next_step: 'photos', next_help: 'Your best landscape shots. The first one is the cover.', steps_done: 2, left: '2 steps are', todo: ['Photos, 10 or more', 'Payouts'],
      pause_url: app('/u/pause/sample'), unsubscribe_url: app('/app/account#emails') };
    const m = layout(Object.assign({}, x, { cta: x.cta ? () => x.cta(s) : null }), Object.assign({}, s, { todo: null }));
    return { subject: m.subject, html: m.html.replace('<li style="margin:0 0 6px">{todo}</li>', s.todo.map(t => '<li style="margin:0 0 6px">' + esc(t) + '</li>').join('')) };
  }

  return { FLOWS, run, settings, toggle, overview, openCalls, alerts, doneAlert, markCall, seen, cancelling, pause, pauseOk, pauseUrl, pauseFailed, sample };
};
