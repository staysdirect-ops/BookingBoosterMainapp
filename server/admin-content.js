// Team admin pages for what goes out to the world: /admin/emails (every email the system sends, rendered as it goes out)
// and /admin/social (Bookingbooster's own social posts and content schedule, from Metricool). Team only: index.js checks
// ADMIN_EMAILS before calling this. Uses the team admin frame (server/admin-shell.js).
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const PART = JSON.parse(fs.readFileSync(path.join(__dirname, 'emails', 'host-partials.json'), 'utf8'));

module.exports = function ({ cfg, msg, leads, campaigns, social, ui, E, send, email }) {
  const html = { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' };
  const CSP = "default-src 'none'; img-src * data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com";
  const page = async (res, o, status) => send(res, status || 200, ui.shell(Object.assign({ email: await email() }, o)), html['content-type'], { 'cache-control': 'no-store' });

  /* ---------- every email, with sample details ---------- */
  const B = cfg.baseUrl, img = f => B + '/email-img/' + f;
  const fill = (t, v) => t.replace(/\{\{([a-z_]+)\}\}/g, (m, k) => E(v[k]));
  const rows = (list, row) => list.map((x, i) => row(x).split('[[BORDER]]').join(i < list.length - 1 ? 'border-bottom:1px solid #E3E7F5;' : '')).join('');
  const checklist = [['Your home’s details', 'Name, description and what the home offers, in Website & SEO.', true], ['Photos, 10 or more', 'Your best landscape shots. The first one is the cover.', true],
    ['House rules and check-in details', 'Address, how guests get in, Wi-Fi and house rules.', true], ['Payouts', 'Connect Stripe with your UK bank account in Connections.', false],
    ['Your own domain', 'Already own one? Add it under Your web address.', false, true], ['Past guest list', 'A CSV of guests who agreed to hear from you.', false, true]];
  const SAMPLE = {
    first_name: 'Hannah', email: 'hannah@example.co.uk', property_name: 'Fellside Barn', property_initials: 'FB', property_town: 'Keswick', host_name: 'Sarah Lees', host_phone: '07700 900123', host_email: 'stay@fellsidebarn.co.uk',
    property_hero_image: img('hero-cabin.jpg'), booking_ref: 'FB-2741', check_in_date: 'Fri 12 December', check_out_date: 'Mon 15 December', check_in_time: '4pm', check_out_time: '10am', nights: '3', nights_total: '£555', nightly_rate: '£185',
    cleaning_fee: '£60', pet_fee: '£25', deposit_amount: '£150', total_paid: '£640', saved_amount: '£96', card_last4: '4242', card_brand: 'Visa', guest_summary: '2 adults, 1 dog', days_to_arrival: '3', steps_done: '2',
    door_code: '4821', door_code_digit_1: '4', door_code_digit_2: '8', door_code_digit_3: '2', door_code_digit_4: '1', address_line1: 'Fellside Barn, Borrowdale Road', address_line2: 'Keswick CA12 5UY', what3words: 'filled.count.soap',
    parking_note: 'Two spaces in front of the barn.', wifi_name: 'Fellside-Guest', wifi_password: 'herdwick2024', deposit_release_date: 'Thu 18 December', offer_percent: '10', promo_code: 'HANNAH10', offer_expiry: '31 January',
    compare_direct_total: '£555', compare_platform_total: '£651', compare_saving: '£96', last_stay_month: 'August', calendar_month: 'December', gap_1_dates: 'Mon 8 to Thu 11 Dec', gap_1_nights: '3', gap_1_price: '£420', gap_1_was: '£555',
    gap_2_dates: 'Sun 4 to Wed 7 Jan', gap_2_nights: '3', gap_2_price: '£390', gap_2_was: '£520', gap_discount: '25%', season_name: 'Winter', winter_rate: '£150', next_release_month: 'January',
    plan_name: 'Growth', plan_price: '£200 a month', go_live_date: 'today', setup_lead_name: 'The Bookingbooster team', setup_lead_initials: 'BB', pages_live: '6', site_domain: 'fellsidebarn.co.uk',
    booked_at: '15 November, 09:42', booking_total: '£640', guest_count: '2', guest_fee_saved: '£96', guest_first_name: 'Tom', guest_full_name: 'Tom Ashworth', fee_kept: '£99', direct_bookings_total: '1', fees_kept_total: '£99',
    items_received: checklist.filter(x => x[2]).length, progress_pct: 50, checklist_due_date: '29 November', checklist_rows: rows(checklist, ([title, desc, done, opt]) => fill(PART.o02_row, { title, desc }).replace('[[ICON]]', done ? PART.icon_done : PART.icon_todo).replace('[[BADGE]]', done ? PART.badge_done : opt ? PART.badge_opt : '')),
    automations_on: '4', gap_nights: '23', guest_list_count: '146', automation_intro: 'Here is what is still switched off on Fellside Barn:',
    automation_block: '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' + rows([['Gap night offers', 'Spot empty nights. Offer them to past guests first.'], ['Come back next year', 'Ask last year’s guests before the dates go on the platforms.']], ([name, desc]) => fill(PART.o05_row, { name, desc })) + '</table>',
    amount_due: '£200.00', decline_reason: 'Your bank declined the payment', failed_date: '14 November', next_retry_date: '17 November', login_code: '482 913', request_device: 'Chrome on a Mac', request_location: 'Manchester, UK', request_time: '15 November, 09:42',
    week_range: '10 to 16 Nov', direct_revenue: '£1,240', direct_revenue_change: '+22%', bookings_week: '4', bookings_direct: '2', direct_share: '50%', direct_share_4w: '38%', fees_kept_week: '£192', fees_kept_ytd: '£2,310',
    site_visits: '312', site_visits_change: '+18%', headline_insight: 'Two direct bookings came from past guests this week.', ai_score: '62', ai_score_change: '+4', ai_next_fix: 'Add your dog policy to the About page.', ai_questions: '8',
    ai_chatgpt: '3 of 8', ai_gemini: '2 of 8', ai_perplexity: '4 of 8', ai_google: '3 of 8', term_1: 'Search engines', term_1_clicks: '186', term_1_pct: '100', term_1_fill: '100', term_2: 'AI assistants', term_2_clicks: '64', term_2_pct: '34', term_2_fill: '34', term_3: 'Past guest emails', term_3_clicks: '41', term_3_pct: '22', term_3_fill: '22',
  };
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].forEach((d, i) => { SAMPLE[d + '_direct_px'] = [18, 30, 12, 26, 44, 52, 20][i]; SAMPLE[d + '_platform_px'] = [30, 22, 36, 28, 40, 34, 26][i]; });
  // the template's own fields, with sample values; links the sample has no value for go nowhere
  const sampleVars = (file, subject) => {
    const v = Object.assign({ company_address: cfg.company.address, company_number: cfg.company.number, vat_number: cfg.company.vat }, SAMPLE, { subject });
    const src = fs.readFileSync(path.join(__dirname, 'emails', file + '.html'), 'utf8');
    for (const [, k] of src.matchAll(/\{\{\{?\s*([a-z0-9_]+)\s*\}\}/g)) if (v[k] == null && /_url$/.test(k)) v[k] = '#';
    return v;
  };

  // [file, who it goes to, subject as it is sent, when it is sent, sent automatically?]
  const FILES = [
    ['host-o01-welcome', 'host', 'Welcome to Bookingbooster', 'Straight after a host signs up', true],
    ['host-o02-setup-checklist', 'host', 'Day 2: the 15-minute checklist for Fellside Barn', 'Day 2 after sign-up, unless setup is already done', true],
    ['host-o03-site-live', 'host', 'Fellside Barn is live', 'When the host publishes their site', true],
    ['host-o05-week3-tips', 'host', 'Week 3: turn 146 past guests into direct bookings', 'Week 3 after sign-up', true],
    ['host-t04-weekly-report', 'host', 'Your week: £1,240 direct, £192 in fees kept', 'Monday mornings, unless the host turned it off', true],
    ['host-t02-payment-failed', 'host', 'Action needed: your Bookingbooster payment did not go through', 'When a subscription payment fails', true],
    ['host-o04-first-direct-booking', 'host', 'Your first direct booking', 'Designed, not switched on yet', false],
    ['host-t03-magic-link', 'host', 'Your sign-in link', 'Designed, not switched on yet', false],
    ['guest-t01-booking-confirmed', 'guest', 'Booked: Fellside Barn, 12 Dec to 15 Dec', 'When a guest books on a host’s site', true],
    ['guest-t02-checkin-reminder', 'guest', 'Finish check-in for Fellside Barn', 'Before arrival, if online check-in is not finished', true],
    ['guest-t03-arrival-door-code', 'guest', 'Your door code for Fellside Barn', 'On arrival day, once check-in is done', true],
    ['guest-t05-review-request', 'guest', 'How was your stay at Fellside Barn?', 'After checkout', true],
    ['guest-t04-checkout', 'guest', 'Checking out of Fellside Barn', 'Designed, not switched on yet', false],
    ['guest-t06-deposit-released', 'guest', 'Your deposit has been released', 'Designed, not switched on yet', false],
    ['guest-m01-come-back', 'guest-m', 'Come back to Fellside Barn', 'Guest marketing design, not sent automatically', false],
    ['guest-m02-gap-nights', 'guest-m', 'Gap nights at Fellside Barn', 'Guest marketing design, not sent automatically', false],
    ['guest-m03-seasonal', 'guest-m', 'Winter at Fellside Barn', 'Guest marketing design, not sent automatically', false],
    ['guest-m04-join-list', 'guest-m', 'Be first to hear when new dates open', 'Guest marketing design, not sent automatically', false],
  ];
  const NAMES = { 'host-o05-week3-tips': 'Week 3 tips', 'host-t04-weekly-report': 'Monday report', 'guest-t02-checkin-reminder': 'Check-in reminder', 'guest-t03-arrival-door-code': 'Door code on arrival', 'host-t03-magic-link': 'Sign-in link', 'guest-m01-come-back': 'Come back offer', 'guest-m04-join-list': 'Join the dates list' };
  const titleOf = f => NAMES[f] || f.replace(/^(host|guest)-[a-z]\d+-/, '').replace(/-/g, ' ').replace(/^./, c => c.toUpperCase());

  async function catalogue() {
    const out = [];
    for (const [key, sq] of Object.entries(leads.series || {})) for (const st of sq.steps) out.push({ id: 'lead.' + key + '.' + st.key, group: 'lead', name: sq.name + ' · ' + st.key, subject: ((await leads.sample(key, st.key)) || {}).subject, series: sq.name, step: st.key, when: whenLead(key, st.key), live: true });
    for (const d of campaigns.designs || []) out.push({ id: 'camp.' + d.key, group: 'camp', name: d.name, subject: d.subject, when: d.when, live: false, campaign: d.key });
    for (const [f, group, subject, when, live] of FILES) out.push({ id: 'tpl.' + f, group, name: titleOf(f), subject, when, live, file: f });
    return out;
  }
  const whenLead = (seq, k) => (k === 'E1' ? 'Straight after the form' : 'Later in the series, timed from the form');
  const GROUPS = [
    ['lead', 'To leads: automatic follow-up after a website form', 'Each website form starts its own series. They send by themselves; see Leads for who is in which.'],
    ['camp', 'To hosts and leads: designed marketing campaigns', 'Ready-made campaigns. Open one in Email campaigns to fill in the details and send it.'],
    ['host', 'To hosts: onboarding and account emails', 'Sent to each host about their own account.'],
    ['guest', 'To guests: from each host’s booking site', 'Sent in the host’s name to their guests.'],
    ['guest-m', 'To guests: marketing designs', 'Designs for hosts’ guest campaigns.'],
  ];

  async function render(id) {
    let m;
    if ((m = id.match(/^lead\.([a-z]+)\.([A-Za-z0-9]+)$/))) { const r = await leads.sample(m[1], m[2]); return r && { subject: r.subject, html: r.html }; }
    if ((m = id.match(/^camp\.([a-z0-9-]+)$/))) { const r = await campaigns.preview(m[1]); return r && { subject: r.subject, html: r.html }; }
    if ((m = id.match(/^tpl\.([a-z0-9-]+)$/))) { const f = FILES.find(x => x[0] === m[1]); if (!f) return null; return { subject: f[2], html: msg.template(f[0], sampleVars(f[0], f[2])) }; }
    return null;
  }

  async function emailsPage(res, sel) {
    const all = await catalogue(), cur = all.find(x => x.id === sel) || all[0];
    const r = cur && await render(cur.id);
    if (cur && !cur.subject && r) cur.subject = r.subject;
    const live = all.filter(x => x.live).length;
    const item = x => '<a href="/admin/emails?t=' + encodeURIComponent(x.id) + '#preview" class="adm-mail' + (x === cur ? ' on' : '') + '"' + (x === cur ? ' aria-current="true"' : '') + '><span><b>' + E(x.name) + '</b><small>' + E(x.group === 'lead' ? x.subject || x.when : x.when) + '</small></span>' + (x.live ? ui.pill('good', 'Live') : x.group === 'camp' ? ui.pill('info', 'Campaign') : ui.pill('muted', 'Design')) + '</a>';
    const lists = GROUPS.map(([g, title, about]) => { const xs = all.filter(x => x.group === g); return xs.length ? ui.card(title, xs.length + '', '<p class="adm-help" style="margin:0 0 8px">' + E(about) + '</p><div class="adm-mails">' + xs.map(item).join('') + '</div>') : ''; }).join('');
    const use = !cur ? '' : cur.campaign ? '<a class="btn primary sm" href="/admin/campaigns/' + E(cur.campaign) + '">' + ui.icon('mail') + 'Open in Email campaigns</a>'
      : '<a class="btn primary sm" href="/admin/campaigns/write">' + ui.icon('plus') + 'Write a marketing email</a>';
    const prev = cur ? '<div class="adm-sticky" id="preview">' + ui.card(cur.name, '<a href="/admin/emails/' + encodeURIComponent(cur.id) + '/preview" target="_blank">Open full size</a>',
      '<div class="adm-list" style="margin-bottom:12px"><div><span><small>Subject</small><b>' + E((r && r.subject) || cur.subject || '') + '</b></span></div><div><span><small>When it goes out</small><b>' + E(cur.when) + '</b></span>' + (cur.live ? ui.pill('good', 'Sending automatically') : '') + '</div></div>' +
      '<p class="adm-help" style="margin:0 0 10px">Rendered by the same code that sends it, with sample details' + (cur.group === 'camp' ? ' or the first person in its audience' : '') + '.</p>' +
      '<iframe class="adm-frame" title="Email preview" src="/admin/emails/' + encodeURIComponent(cur.id) + '/preview" sandbox></iframe><div class="row" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">' + use + '</div>') + '</div>' : '';
    return page(res, { title: 'Email templates', active: 'emails',
      sub: 'Every email the system sends, exactly as it goes out. <b>' + live + '</b> send by themselves; the rest are designs and campaigns you send when you choose.',
      actions: '<a class="btn primary sm" href="/admin/campaigns/write">' + ui.icon('plus') + 'Write a marketing email</a>',
      body: '<div class="adm-cols"><div class="adm-stack">' + lists + '</div>' + prev + '</div>' });
  }

  /* ---------- social posts ---------- */
  const NET = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', linkedin: 'LinkedIn', twitter: 'X' };
  const ST = { published: ['good', 'Published'], pending: ['info', 'Scheduled'], error: ['bad', 'Failed'] };
  const KIND = { story: 'Story', reel: 'Reel', post: 'Post', short: 'Short' };
  const ms = p => Date.parse(p.at + 'Z');
  const ukDay = t => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const ukTime = t => new Date(t).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' });
  const longDay = t => new Date(t).toLocaleDateString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short' });
  const stateOf = p => (p.draft ? 'draft' : p.nets.some(n => n[1] === 'error') ? 'error' : p.nets.every(n => n[1] === 'published') ? 'published' : p.nets.some(n => n[1] === 'published') ? 'partial' : 'pending');
  const statePill = s => s === 'draft' ? ui.pill('muted', 'Draft') : s === 'partial' ? ui.pill('warn', 'Partly published') : ui.pill(ST[s][0], ST[s][1]);
  const netPills = p => p.nets.map(([n, s, u]) => { const c = (ST[s] || ['muted'])[0]; const t = (NET[n] || n) + (s === 'error' ? ' failed' : ''); return u ? '<a class="pill ' + c + '" href="' + E(u) + '" target="_blank" rel="noopener">' + E(t) + '</a>' : ui.pill(c, t); }).join(' ');
  const label = p => (p.text ? p.text.split('\n')[0] : p.title || KIND[p.kind] || 'Post');

  async function socialPage(res, q) {
    const data = await social.posts(), now = Date.now(), all = data.posts.filter(p => p.at);
    const net = NET[q.get('net')] ? q.get('net') : '', show = ['upcoming', 'published', 'problems', 'all'].includes(q.get('show')) ? q.get('show') : 'upcoming';
    const stories = q.get('stories') === '1';
    const ps = all.filter(p => (!net || p.nets.some(n => n[0] === net)));
    const feed = ps.filter(p => stories || p.kind !== 'story');
    const next7 = ps.filter(p => ms(p) >= now && ms(p) < now + 7 * 864e5).length, last30 = ps.filter(p => ms(p) < now && ms(p) >= now - 30 * 864e5 && stateOf(p) !== 'pending').length;
    const problems = ps.filter(p => p.nets.some(n => n[1] === 'error'));
    const lastAt = all.length ? ms(all[all.length - 1]) : 0;

    // month calendar, Monday first
    const mq = /^\d{4}-\d{2}$/.test(q.get('m') || '') ? q.get('m') : ukDay(now).slice(0, 7);
    const [y, mo] = mq.split('-').map(Number), first = new Date(Date.UTC(y, mo - 1, 1)), days = new Date(Date.UTC(y, mo, 0)).getUTCDate(), lead = (first.getUTCDay() + 6) % 7;
    const shift = n => { const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
    const qs = o => '/admin/social?' + new URLSearchParams(Object.assign({ m: mq, show, net, stories: stories ? '1' : '' }, o)).toString().replace(/(^|&)[a-z]+=(?=&|$)/g, '');
    const byDay = {}; ps.forEach(p => { (byDay[ukDay(ms(p))] = byDay[ukDay(ms(p))] || []).push(p); });
    const today = ukDay(now);
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<div class="adm-cal-d off"></div>';
    for (let d = 1; d <= days; d++) {
      const key = mq + '-' + String(d).padStart(2, '0'), list = byDay[key] || [], main = list.filter(p => p.kind !== 'story'), st = list.length - main.length;
      cells += '<div class="adm-cal-d' + (key === today ? ' today' : '') + (key < today ? ' past' : '') + '"><b>' + d + '</b>' +
        main.map(p => { const s = stateOf(p); return '<a class="adm-cal-p ' + s + '" href="' + qs({ show: 'all' }) + '#p' + p.id + '" title="' + E(label(p)) + '"><i>' + ukTime(ms(p)) + '</i>' + E(KIND[p.kind] || 'Post') + '</a>'; }).join('') +
        (st ? '<span class="adm-cal-s">+' + st + ' stor' + (st === 1 ? 'y' : 'ies') + '</span>' : '') + '</div>';
    }
    const monthName = first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    const cal = ui.card('Content calendar', '<span class="adm-inline"><a class="btn sm ghost" href="' + qs({ m: shift(-1) }) + '" aria-label="Previous month">←</a><b>' + E(monthName) + '</b><a class="btn sm ghost" href="' + qs({ m: shift(1) }) + '" aria-label="Next month">→</a></span>',
      '<div class="adm-cal"><div class="adm-cal-h">Mon</div><div class="adm-cal-h">Tue</div><div class="adm-cal-h">Wed</div><div class="adm-cal-h">Thu</div><div class="adm-cal-h">Fri</div><div class="adm-cal-h">Sat</div><div class="adm-cal-h">Sun</div>' + cells + '</div>' +
      '<p class="adm-help" style="margin:10px 0 0"><span class="adm-key published"></span>Published <span class="adm-key pending"></span>Scheduled <span class="adm-key error"></span>Failed on a network <span class="adm-key partial"></span>Partly published. Times are UK time. Stories are counted under each day.</p>');

    let list = show === 'upcoming' ? feed.filter(p => ms(p) >= now) : show === 'published' ? feed.filter(p => ms(p) < now).reverse() : show === 'problems' ? problems.slice().reverse() : feed.slice().reverse();
    const total = list.length; list = list.slice(0, 60);
    const row = p => '<tr id="p' + p.id + '"><td style="width:72px">' + (p.thumb ? '<img class="adm-thumb" src="' + E(p.thumb) + '" alt="" loading="lazy">' : '') + '</td>' +
      '<td class="num"><b>' + E(longDay(ms(p))) + '</b><small>' + ukTime(ms(p)) + ' · ' + E(KIND[p.kind] || 'Post') + (p.media > 1 ? ' · ' + p.media + ' images' : p.video ? ' · video' : '') + '</small></td>' +
      '<td class="wrap" style="max-width:420px;color:var(--fg)">' + (p.text ? E(p.text.length > 220 ? p.text.slice(0, 220) + '…' : p.text).replace(/\n/g, '<br>') : '<span class="adm-help">' + E(p.title || 'No caption (' + (KIND[p.kind] || 'post').toLowerCase() + ')') + '</span>') + '</td>' +
      '<td>' + statePill(stateOf(p)) + '<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">' + netPills(p) + '</div></td></tr>';
    const tab = (k, t, n) => '<a class="chip' + (show === k ? ' on' : '') + '" href="' + qs({ show: k }) + '"' + (show === k ? ' aria-current="true"' : '') + '>' + E(t) + (n != null ? ' · ' + n : '') + '</a>';
    const nets = ['', 'facebook', 'instagram', 'tiktok', 'youtube'].map(n => '<a class="chip' + (net === n ? ' on' : '') + '" href="' + qs({ net: n }) + '">' + (n ? NET[n] : 'All networks') + '</a>').join('');
    const listCard = '<section class="a-card a-flush" style="margin-top:16px" id="list"><div class="a-card-h" style="padding:18px 20px 0;flex-wrap:wrap;gap:8px"><h3>Posts</h3><div class="adm-chips">' +
      tab('upcoming', 'Coming up', feed.filter(p => ms(p) >= now).length) + tab('published', 'Published', feed.filter(p => ms(p) < now).length) + tab('problems', 'Failed', problems.length) + tab('all', 'All') +
      '<a class="chip' + (stories ? ' on' : '') + '" href="' + qs({ stories: stories ? '' : '1' }) + '">' + (stories ? 'Hide stories' : 'Show stories') + '</a></div></div>' +
      '<div class="adm-chips" style="padding:10px 20px 0">' + nets + '</div>' +
      ui.table(['', 'When', 'Post', 'Where'], list.map(row), show === 'upcoming' ? 'Nothing scheduled. Add posts in Metricool and they show up here.' : 'No posts here.') +
      (total > list.length ? '<p class="adm-help" style="padding:12px 20px;margin:0">Showing ' + list.length + ' of ' + total + '.</p>' : '') + '</section>';

    const src = social.live() ? 'Live from Metricool.' : 'From Metricool, copied ' + E(longDay(Date.parse(data.as_of))) + ' at ' + ukTime(Date.parse(data.as_of)) + '. Set METRICOOL_TOKEN, METRICOOL_USER_ID and METRICOOL_BLOG_ID on the server to keep it live.';
    const warn = lastAt && lastAt < now + 7 * 864e5 ? '<div class="adm-note bad" role="status">' + ui.icon('x') + 'The schedule runs out on ' + E(longDay(lastAt)) + '. Add more posts in Metricool to keep the feeds going.</div>' : '';
    return page(res, { title: 'Social posts', active: 'social',
      sub: 'Bookingbooster’s own Facebook, Instagram, TikTok and YouTube: what is scheduled and what has gone out. ' + src,
      actions: '<a class="btn sm" href="https://app.metricool.com/planner" target="_blank" rel="noopener">' + ui.icon('out') + 'Open Metricool</a>',
      body: warn + '<div class="adm-kpis">' + ui.kpi('Scheduled, next 7 days', next7, '', 'posts and stories', true) + ui.kpi('Published, last 30 days', last30) + ui.kpi('Failed on a network', problems.length, '', problems.length ? '<a href="' + qs({ show: 'problems' }) + '#list">See which</a>' : 'none') +
        ui.kpi('Scheduled until', lastAt ? E(longDay(lastAt)) : '–') + '</div>' + cal + listCard });
  }

  return async function (req, res, p, m, u) {
    if (p === '/admin/social') return await socialPage(res, u.searchParams);
    if (p === '/admin/emails') return await emailsPage(res, u.searchParams.get('t'));
    const mm = p.match(/^\/admin\/emails\/([a-z0-9.-]+)\/preview$/i);
    if (mm) { const r = await render(mm[1]); if (r) return send(res, 200, r.html, 'text/html; charset=utf-8', { 'cache-control': 'no-store', 'content-security-policy': CSP }); }
    return page(res, { title: 'Not found', active: 'emails', sub: 'That page does not exist. <a href="/admin/emails">Back to email templates</a>', body: '' }, 404);
  };
};
