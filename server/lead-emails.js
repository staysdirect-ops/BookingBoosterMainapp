// Follow-up emails for people who fill in a form on the marketing sites and funnels.
// The copy comes from marketing/funnels/*/emails.html. Each step says when it is due:
//   a time in ms (send at or after it), null (wait: a person on the team still has to do something),
//   or false (skip this step for this lead).
// Links only appear when there is a real place for them to go.
'use strict';

const first = n => (String(n || '').trim().split(/\s+/)[0] || 'there');
const pounds = n => '£' + Math.round(n).toLocaleString('en-GB');

module.exports = function (t) {
  // t: { dayAt(base, n, hh), when(ms), date(ms), time(ms), link(name), guide(file), app(path), signoff }
  const growth = { label: 'Start Growth', href: t.app('/start?plan=Growth') };
  const tour = { label: 'Take the 2-minute tour', href: t.app('/demo') };
  const playbook = { label: 'Open the playbook', href: t.guide('direct-booking-playbook.pdf') };
  const sessionLine = v => t.date(v.session_at) + ', ' + t.time(v.session_at) + ' UK time';
  const bookCall = () => t.link('bookCall');

  const seqs = {
    /* ---------- Funnel 1: fee leak calculator ---------- */
    fee: {
      name: 'Fee leak',
      vars(d, lead) {
        const rate = +d.rate || 0, nights = +d.nights || 0, homes = +d.homes || 1, fee = +d.fee || 15.5;
        return { rate, nights, homes, fee, fee_leak: rate && nights ? pounds(rate * nights * 12 * homes * fee / 100) : '' };
      },
      steps: [
        { key: 'E1', when: c => c.start,
          subject: 'Your fee leak result (and the playbook)', preview: 'Your number, plus the 30-minute read on winning it back.',
          body: v => (v.fee_leak ? ['Here is your result from the Fee Leak Calculator:', '<b>Estimated platform fees: ' + v.fee_leak + ' a year.</b>',
            'Based on ' + pounds(v.rate) + ' a night, ' + v.nights + ' nights a month, ' + v.homes + (v.homes === 1 ? ' home' : ' homes') + '. Estimate only.',
            'Most hosts we speak to guess half that. Seeing it in pounds is the first step.'] : [])
            .concat(['The Direct Booking Playbook is ready for you. It covers the four things that move bookings direct: your own site, Google, AI search and your past guests.']),
          cta: () => playbook, after: ['Tomorrow we will send you the three places direct bookings actually come from. Short email, promise.'] },
        { key: 'E2', when: c => t.dayAt(c.start, 1),
          subject: 'Where direct bookings actually come from', preview: 'Hint: it is not a fancy website on its own.',
          body: () => ['Direct bookings come from three places. In this order:',
            { list: ['<b>Past guests.</b> They already trust you. A good email at the right time does more than any ad.',
              '<b>Google.</b> People search ‘dog friendly cottage near Padstow’, not your brand. Local pages win those searches.',
              '<b>AI answers.</b> More travellers now ask ChatGPT or Google’s AI Overview where to stay. If your site is not clear and well reviewed, you are not in the answer.'] },
            'A website on its own does none of this. It is the place the three sources send people to.'],
          cta: () => ({ label: 'Read chapter 2 of the playbook', href: playbook.href }), ai: true },
        { key: 'E3', when: c => t.dayAt(c.start, 3),
          subject: 'What your guest sees when they book direct', preview: 'Your site, their phone, the door code. Two minutes.',
          body: () => ['Picture a guest who stayed last summer. In January they get an email from you: ‘Your June week is open again’.',
            'They tap through to your own site. Live dates, your reviews, a secure card payment. They book. A deposit is held on their card. A week before arrival they check in on their phone and get the door code on the day.',
            'No platform fee on either side. That is what Bookingbooster runs for you.'],
          cta: () => tour, after: ['Everything in the tour uses our demo account, so the names and numbers are sample data.'] },
        { key: 'E4', when: c => t.dayAt(c.start, 5),
          subject: 'Do I have to leave Airbnb?', preview: 'No. Here is how hosts use both.',
          body: () => ['The question we hear most: ‘Do I have to leave Airbnb?’',
            'No. Platforms are good at finding first-time guests. Keep them for that. The aim is to make the second booking, and the Google search, come to you direct.',
            'Three things make that work:',
            { list: ['Your own site on your own domain, so returning guests know where to go.',
              'Past-guest emails, sent with consent and a clear unsubscribe, as UK GDPR and PECR expect.',
              'A fair direct price. Guests skip the platform’s service fee, so you can charge a little less and still keep more.'] }],
          cta: () => ({ label: 'See how Growth works', href: t.app('/pricing') }) },
        { key: 'E5', when: c => t.dayAt(c.start, 7),
          subject: 'Your direct booking site, live in 7 days', preview: 'Growth: we build it, get it found and fill it. £997 setup, first month free, then £200 a month.',
          body: v => [(v.fee_leak ? 'If your fee leak was ' + v.fee_leak + ' a year, here is the simplest way to win part of it back.' : 'Here is the simplest way to win back part of what platform fees cost you.'),
            'Growth: a one-off £997 setup fee, first month free, then £200 a month. We build your booking site on your own domain and set up payments, deposits and check-in. Then every month we write new local SEO pages, fix your AI visibility gaps and write and send your guest campaigns.',
            { list: ['Setup done for you', 'Cancel anytime', 'Up to 3 homes', 'Set up for you in a week'] }],
          cta: () => growth },
        { key: 'E6', when: c => t.dayAt(c.start, 9),
          subject: 'Last note on fees this year', preview: 'Then we will stop. Promise.',
          body: () => ['Last one in this series. After this you will just get a short monthly tip, unless you unsubscribe.',
            'Every month a booking goes through a platform, around 15% of it goes with it. Not a disaster. But it compounds, and the guest you paid to win is a guest you can reach again for free.',
            'If you want your own site, Google pages and guest campaigns done for you, Growth is ready when you are.'],
          cta: () => ({ label: 'Start Growth for £200 a month', href: growth.href }), after: ['Either way, thanks for reading.'] },
      ].concat(TIPS.map((tip, i) => ({ key: 'N' + (i + 1), when: c => t.dayAt(c.sent.E6 || c.start, 30 * (i + 1)),
        subject: 'One direct booking tip for {month}', preview: 'Short, practical, two minutes.',
        body: () => ['This month’s tip: ' + tip.text].concat(tip.more || []), cta: () => ({ label: 'See how Bookingbooster does it', href: t.app('/demo') }) }))),
    },

    /* ---------- Funnel 2: free AI visibility audit ---------- */
    audit: {
      name: 'AI audit',
      vars: d => ({ town: d.town || 'your area', url: d.url || '', type: d.type || '' }),
      steps: [
        { key: 'E1', when: c => c.start,
          subject: 'Got it. Your audit for {town} is underway', preview: 'Here is what we are checking, and when you will have it.',
          body: () => ['Thanks for requesting your AI visibility and Google audit. We are checking:',
            { list: ['8 questions guests ask about stays in {town}, on ChatGPT, Gemini, Perplexity and Google', 'Your website and Google Business Profile, if you have them', 'The details AI engines look for: pet policy, parking, views, reviews'] },
            'You will have it within 2 working days.'],
          cta: () => t.link('sampleReport') ? { label: 'See a sample report', href: t.link('sampleReport') } : { label: 'Try the free self-audit while you wait', href: t.guide('ai-search-self-audit.pdf') }, ai: true },
        // E2 waits until someone on the team enters the audit result in /admin.
        { key: 'E2', when: c => (c.v.audit_url && c.v.score !== undefined ? c.v.audit_ready_at : null),
          subject: 'Your audit: {score}/100 in {town}', preview: 'You show up in {mentions} of 8 guest questions. Here is what to fix first.',
          body: () => ['Your audit is ready.', '<b>Visibility score: {score}/100.</b>', 'Mentioned in {mentions} of 8 guest questions in {town}.', 'Top fix: {top_fix}.'],
          cta: v => ({ label: 'Open my audit', href: v.audit_url }),
          after: () => [bookCall() ? 'Want to go through it together? <a href="' + bookCall() + '">Book a 15-minute walkthrough</a>. We will show you the three fixes that matter most and how to do them yourself. Plans only if you ask.'
            : 'Want to go through it together? Reply to this email and we will set up a 15-minute walkthrough. We will show you the three fixes that matter most and how to do them yourself. Plans only if you ask.'] },
        // People who book a call get the call emails instead (see "call" below).
        { key: 'E3B', when: c => c.callBooked ? false : t.dayAt(c.sent.E2, 2),
          subject: 'The one fix that matters most for {town}', preview: 'It takes about a day. Here is how.',
          body: () => ['Of everything in your audit, one fix will do the most: {top_fix}.',
            'Why: AI engines and Google both look for a clear, trustworthy page that answers the guest’s question. Right now that page does not exist for your home, so they send guests elsewhere.',
            'You can do this yourself. The playbook explains how, step by step.'],
          cta: () => ({ label: 'Read the how-to', href: t.guide('get-found-in-ai-search.pdf') }),
          after: () => [bookCall() ? 'Or let us walk you through it in 15 minutes: <a href="' + bookCall() + '">book a time</a>.' : 'Or reply to this email and we will walk you through it in 15 minutes.'] },
        // Only when the team recorded a real re-run of the top question.
        { key: 'E4B', when: c => c.callBooked || !(c.v.top_question && c.v.competitor_count) ? false : t.dayAt(c.sent.E2, 5),
          subject: 'We asked ChatGPT about {town} again', preview: 'Here is who it recommended this week.',
          body: () => ['We re-ran your top question on ChatGPT this week: “{top_question}”.',
            'The answer named {competitor_count} places. Yours was not one of them. Those homes have three things in common: their own site, a clear policy page for the thing the guest asked about, and reviews that use the same words.',
            'That is fixable, and it is what we do every month on Growth.'],
          cta: () => ({ label: 'See how Growth fixes it', href: t.app('/pricing') }), ai: true },
        { key: 'E5B', when: c => c.callBooked ? false : t.dayAt(c.sent.E2, 8),
          subject: 'Want us to just do the fixes?', preview: 'Your site, Google and AI fixes, done for you. £200 a month.',
          body: () => ['Last note about your audit.',
            'If you would rather not do the fixes yourself, Growth does them for you: your own booking site in 7 days, Google Business Profile, new local pages every month and AI visibility tracking. A one-off £997 setup fee, first month free, then £200 a month, cancel anytime.'],
          cta: () => growth },
      ],
    },

    /* ---------- Funnel 2: walkthrough call booked ---------- */
    call: {
      name: 'Walkthrough call',
      vars: (d, lead) => ({ call_at: t.ukAt(d.d, d.t), phone: d.phone || '' }),
      steps: [
        { key: 'C1', when: c => (c.v.call_at ? c.start : false), invite: true,
          subject: 'Booked: your 15-minute walkthrough, {call_when}', preview: 'The calendar invite is attached.',
          body: () => ['You are booked in. See you soon.', '<b>{call_when} UK time</b>, 15 minutes.',
            'The calendar invite is attached, so you can add it in one tap. Need another time? Just reply to this email.'],
          cta: () => (t.link('meeting') ? { label: 'Join link for the call', href: t.link('meeting') } : null),
          after: () => (t.link('meeting') ? [] : ['We will email the joining link before the call.']) },
        { key: 'E3A', when: c => (c.v.call_at && c.v.call_at - 864e5 > c.start + 36e5 ? c.v.call_at - 864e5 : false),
          subject: 'Tomorrow at {call_time}: your audit walkthrough', preview: '15 minutes. Have your listing open.',
          body: () => ['Quick reminder: we are walking through your audit tomorrow at {call_time} UK time.',
            { list: ['Have your listing or website open', 'Know your rough nightly rate', 'Bring one question'] }],
          cta: () => (t.link('meeting') ? { label: 'Join the call', href: t.link('meeting') } : null), after: ['Need another time? Reply to this email.'] },
        // Sent when someone on the team adds the proposal link in /admin after the call.
        { key: 'E4A', when: c => (c.v.proposal_url ? c.v.proposal_ready_at : null),
          subject: 'Your plan, as promised', preview: 'The proposal, the 90-day plan and the price. No surprises.',
          body: () => ['Thanks for your time today. As promised, here is your proposal. It covers where you are now, what we do in the first 90 days, and what it costs.'],
          cta: v => ({ label: 'Read my proposal', href: v.proposal_url }),
          after: ['Short version: Growth is a one-off £997 setup fee, first month free, then £200 a month, cancel anytime. Your site goes live in 7 days and we start on your fix list in week 2.', 'Any questions, just reply.'] },
      ],
    },

    /* ---------- Funnel 3: live demo session ---------- */
    webinar: {
      name: 'Live demo',
      vars: d => ({ homes: d.homes || '' }),
      steps: [
        { key: 'E1', when: c => c.start,
          subject: v => (v.session_at ? 'Your seat is saved: {session_day}, {session_time}' : 'Your seat is saved'), preview: 'Add it to your calendar so it does not get buried.',
          body: v => ['You are in for the live demo: Launch your direct booking site in 7 days.',
            v.session_at ? '<b>' + sessionLine(v) + '</b>, online.' : 'We will email you the date and your joining link.',
            v.session_at && !v.join_url ? 'We will email your joining link before the session.' : '',
            'Three things to have handy: your listing link, a domain name idea, and your past-guest list (even a spreadsheet).'],
          cta: v => (v.session_at && v.join_url ? { label: 'Your joining link', href: v.join_url } : null), invite: v => !!v.session_at, signoff: 'See you there,' },
        { key: 'E2', when: c => (c.v.session_at ? (c.v.session_at - 864e5 > c.start ? t.dayAt(c.v.session_at, -1, 9) : false) : null),
          subject: 'Tomorrow: we build a booking site live', preview: 'Here is what you will see in 45 minutes.',
          body: () => ['Tomorrow at {session_time} we build a holiday let’s own booking site live. In 45 minutes you will see:',
            { list: ['A listing link become a booking site on its own domain', 'Google and AI visibility switched on', 'A guest booking, paying a deposit and checking in on their phone', 'A consent-safe email to past guests'] },
            'Bring a question. We answer them all at the end.'],
          cta: v => (v.join_url ? { label: 'Join tomorrow at {session_time}', href: v.join_url } : null) },
        { key: 'E3', when: c => (c.v.session_at ? (c.v.join_url && c.v.session_at - 36e5 > c.start ? c.v.session_at - 36e5 : false) : null),
          subject: 'Starting in 1 hour', preview: 'Your link to the live demo is inside.',
          body: () => ['We go live in one hour, at {session_time} UK time.'],
          cta: v => ({ label: 'Join the live demo', href: v.join_url }), after: ['Cannot make it? No problem. We will send you the replay.'] },
        { key: 'E4', when: c => (c.v.session_at ? (c.v.replay_url ? Math.max(c.v.session_at + 45 * 6e4 + 36e5, c.start) : (c.now > c.v.session_at + 2 * 864e5 ? false : null)) : null),
          subject: 'The replay, and your 7-day launch', preview: 'Everything from the session, done for your home.',
          body: () => ['Thanks for registering for the live demo. The full replay is ready, so you can watch it, or jump back to any part.'],
          cta: v => ({ label: 'Watch the replay', href: v.replay_url }),
          after: ['If you want us to do it for your home: the 7-day launch. Your site live in a week, payments and check-in on, Google and AI set up, and your first email to past guests sent.',
            'Growth: a one-off £997 setup fee, first month free, then £200 a month. Cancel anytime.'] },
        { key: 'E5', when: c => (c.v.session_at ? t.dayAt(c.v.session_at, 2) : null),
          subject: 'What launch week actually looks like', preview: 'About two hours of your time. Here is the day-by-day.',
          body: () => ['The question after every session: how much work is it for me? About two hours, spread over a week:',
            { list: ['Day 1: 30-minute kickoff, send links and photos', 'Day 2: review your site draft on your phone', 'Day 3: connect your bank for payouts', 'Day 4: tell us your lock or key safe', 'Day 5: approve your Google Business Profile', 'Day 6: send your guest list, approve the launch email', 'Day 7: you are live'] }],
          cta: () => ({ label: 'Start my 7-day launch', href: growth.href }) },
        { key: 'E6', when: c => (c.v.session_at ? t.dayAt(c.v.session_at, 4) : null),
          subject: 'Your questions from the live demo', preview: 'Airbnb, past guests, GDPR and the domain thing.',
          body: () => ['The four questions we got most:',
            '<b>Do I keep Airbnb?</b> Yes. Use it for first-time guests. Your site is for the second booking and for Google.',
            '<b>Can I email past guests?</b> Usually yes, under the PECR soft opt-in if they booked with you and were offered an opt-out. Every email has a one-click unsubscribe. We set it up properly.',
            '<b>I do not have a domain.</b> We help you pick one on day 1.',
            '<b>Is there a contract?</b> No. Cancel anytime. There is a one-off £997 setup fee, first month free, then £200 a month.'],
          cta: () => ({ label: 'See the 7-day launch', href: t.app('/pricing') }) },
        { key: 'E7', when: c => (c.v.session_at ? t.dayAt(c.v.session_at, 7) : null),
          subject: 'Ready when you are', preview: 'Your site could be live a week from today.',
          body: () => ['Last email about the live demo. If now is not the time, no problem.', 'When you are ready, your direct booking site can be live a week from the day you start.'],
          cta: () => ({ label: 'Start my 7-day launch', href: growth.href }), signoff: 'Thanks for watching,' },
      ],
    },

    /* ---------- Website forms: a single reply, no follow-up series ---------- */
    site: {
      name: 'Booking site request',
      vars: d => ({ listing: d.url || d.listing || '' }),
      steps: [{ key: 'A1', when: c => c.start,
        subject: 'We have your request for a booking site', preview: 'Here is what happens next.',
        body: v => ['Thanks for asking about a booking site' + (v.listing ? ' for <b>{listing}</b>' : '') + '. We will be in touch at this address about your site, and only about your site.',
          'Want to look around first? The demo shows the host console, a booking site and the guest app with sample data.'],
        cta: () => tour }],
    },
    apply: {
      name: 'Done-for-you application',
      vars: d => ({ listing: d.url || '', homes: d.homes || '' }),
      steps: [{ key: 'A1', when: c => c.start,
        subject: 'You are in. Here is what happens next', preview: 'A kickoff slot and a secure upload link are next.',
        body: () => ['Thanks for applying for the done-for-you setup. We have your listing link.',
          'Next, we email you a 15-minute kickoff slot and a secure upload link. You send photos and payout details, and we start building.',
          'Questions before then? Reply to this email and a person will answer.'],
        cta: () => null }],
    },
  };
  return seqs;
};

// Monthly tips after the fee leak series. Add more here; each is sent once, a month apart.
const TIPS = [
  { text: 'email past guests about gap nights before you drop the price on the platforms. A 10% direct offer to people who already know your place often fills the gap at a better rate than a platform discount.',
    more: ['Remember the soft opt-in rules: only to people who booked with you and were given the chance to opt out, and always with a clear unsubscribe.'] },
  { text: 'answer the questions guests ask before they book, on your own site, in plain words. Dogs, parking, the walk to the pub, whether the hot tub is private. Those answers are what Google and AI assistants quote when a traveller asks.' },
  { text: 'ask every guest for a review a day after checkout, and never offer anything in return. Reviews that mention the things people search for, like a view or a log burner, help you show up for those searches.' },
];
