// The team's email campaign pages in /admin/campaigns (logic in server/campaigns.js). Team only: index.js checks
// ADMIN_EMAILS before calling this. Plain server-rendered forms, like the rest of /admin.
'use strict';

const CSS = '<style>' +
  'select,textarea{font:inherit;padding:12px 14px;border-radius:10px;border:1px solid #D6D5CF;background:#fff;color:inherit;width:100%}textarea{min-height:260px;line-height:1.5;resize:vertical}' +
  '.cm-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:18px 0}.cm-tile{background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px}.cm-tile b{display:block;font:600 26px/1.1 "Bricolage Grotesque",sans-serif;color:var(--ink)}.cm-tile small{color:var(--mut)}' +
  '.cm-badge{display:inline-block;font-size:12px;font-weight:700;padding:3px 9px;border-radius:99px;background:#EEF1FF;color:#2747F5}.cm-badge.sent{background:#E6F4EC;color:#12805C}.cm-badge.warn{background:#FFF3E0;color:#B4540A}.cm-badge.live{background:#FFF6D6;color:#8A6100}.cm-badge.off{background:#F0F0F0;color:#666}' +
  '.cm-table{width:100%;border-collapse:collapse;font-size:13px}.cm-table th{text-align:left;color:var(--mut);font-weight:600}.cm-table tr+tr{border-top:1px solid #E4E7F0}.cm-table td{vertical-align:top}' +
  '.cm-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.cm-row form,.wide td .cm-row form{margin:0;display:inline}.cm-table td .cm-row{flex-wrap:nowrap}.cm-row button{padding:8px 14px;font-size:14px}button.sec{background:transparent;color:var(--p);border:1px solid var(--line)}button.danger{background:#C62828}' +
  '.cm-grid{display:grid;gap:18px}@media(min-width:1000px){.cm-grid{grid-template-columns:minmax(0,1fr) minmax(0,1fr);align-items:start}.cm-grid .cm-sticky{position:sticky;top:12px}}' +
  '.cm-help{font-size:13px;color:var(--mut)}.cm-help code{background:#F1F2F6;border-radius:5px;padding:1px 5px;font-size:12px}h2{font:600 20px "Bricolage Grotesque",sans-serif;margin:28px 0 0}' +
  '.cm-two{display:grid;gap:14px}@media(min-width:640px){.cm-two{grid-template-columns:1fr 1fr}}</style>';

module.exports = function ({ campaigns, leads, cfg, E, authPage, send, redirect, formBody, me }) {
  const html = (res, body) => send(res, 200, body, 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
  const day = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : '–');
  const sentCount = s => Object.keys(s.sent || {}).length;
  const failedCount = s => Object.keys(s.failed || {}).length;
  const field = (n, v, label, o) => { o = o || {}; return '<label>' + E(label) + (o.area ? '<textarea name="' + n + '"' + (o.ph ? ' placeholder="' + E(o.ph) + '"' : '') + '>' + E(v || '') + '</textarea>' : '<input name="' + n + '" value="' + E(v || '') + '"' + (o.type ? ' type="' + o.type + '"' : '') + (o.ph ? ' placeholder="' + E(o.ph) + '"' : '') + (o.req ? ' required' : '') + ' style="width:100%">') + (o.help ? '<small class="cm-help">' + o.help + '</small>' : '') + '</label>'; };
  const audSelect = (cur, counts) => '<label>Who gets it<select name="audience">' + Object.entries(campaigns.AUDIENCES).map(([k, a]) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + E(a.label) + (counts ? ' (' + counts[k] + ')' : '') + '</option>').join('') + '</select></label>';

  function badge(o) {
    const s = o.s;
    if (s.status === 'sent') return '<span class="cm-badge sent">Sent ' + E(day(s.sent_at)) + '</span>';
    if (s.status === 'sending') return '<span class="cm-badge live">Sending · ' + sentCount(s) + ' so far</span>';
    if (s.status === 'scheduled') return '<span class="cm-badge live">Scheduled ' + E(day(s.scheduled_at)) + '</span>';
    if (s.status === 'stopped') return '<span class="cm-badge off">Stopped · ' + sentCount(s) + ' sent</span>';
    return o.blocked.length ? '<span class="cm-badge warn">Draft · needs details</span>' : '<span class="cm-badge">Draft · ready</span>';
  }
  const tiles = list => '<div class="cm-tiles">' + list.map(([n, l]) => '<div class="cm-tile"><b>' + n + '</b><small>' + E(l) + '</small></div>').join('') + '</div>';

  /* ---------- the list ---------- */
  async function listPage(note, err) {
    const all = await campaigns.overview(), counts = await campaigns.audienceCounts();
    const done = all.filter(o => ['sent', 'stopped', 'sending'].includes(o.s.status));
    const totSent = done.reduce((a, o) => a + sentCount(o.s), 0), totOpen = done.reduce((a, o) => a + o.stats.opens, 0), totClick = done.reduce((a, o) => a + o.stats.clicks, 0), totUnsub = done.reduce((a, o) => a + o.stats.unsubs, 0);
    const row = o => {
      const s = o.s, n = sentCount(s), st = o.stats;
      return '<tr><td><a href="/admin/campaigns/' + s.id + '"><b>' + E(s.name) + '</b></a>' + (s.kind === 'designed' ? ' <small class="cm-help">· designed</small>' : '') + '<br><small class="cm-help">' + E(s.subject || 'No subject yet') + '</small></td>' +
        '<td><small>' + E(o.audienceLabel) + '</small></td><td>' + badge(o) + '</td>' +
        '<td>' + (n ? '<b>' + n + '</b> sent' : '<b>' + o.count + '</b> <small class="cm-help">can get it</small>') + '</td>' +
        '<td>' + (st && n ? pct(st.opens, n) + ' <small class="cm-help">opened</small><br>' + pct(st.clicks, n) + ' <small class="cm-help">clicked</small>' + (st.unsubs ? '<br>' + st.unsubs + ' <small class="cm-help">unsubscribed</small>' : '') : '<small class="cm-help">–</small>') + '</td>' +
        '<td><div class="cm-row"><a href="/admin/campaigns/' + s.id + '">Open</a><form method="post" action="/admin/campaigns/' + s.id + '/duplicate"><button class="sec">Copy</button></form></div></td></tr>';
    };
    const table = (title, list, empty) => '<h2>' + title + '</h2><div class="card" style="overflow:auto">' + (list.length ? '<table class="cm-table"><tr><th>Campaign</th><th>Audience</th><th>Status</th><th>People</th><th>Results</th><th></th></tr>' + list.map(row).join('') + '</table>' : '<p style="margin:0">' + empty + '</p>') + '</div>';
    const byNew = (a, b) => (b.s.sent_at || b.s.scheduled_at || b.s.updated_at || 0) - (a.s.sent_at || a.s.scheduled_at || a.s.updated_at || 0);
    const active = all.filter(o => ['scheduled', 'sending'].includes(o.s.status)), drafts = all.filter(o => ['draft', 'cancelled'].includes(o.s.status)).sort((a, b) => (a.s.kind === 'designed') - (b.s.kind === 'designed') || byNew(a, b)), sent = all.filter(o => ['sent', 'stopped'].includes(o.s.status)).sort(byNew);
    const auto = Object.values(leads.series || {}).map(sq => '<tr><td><b>' + E(sq.name) + '</b></td><td><small>' + sq.steps.map(st => E(st.key) + (typeof st.subject === 'function' ? '' : ': ' + E(st.subject))).join('<br>') + '</small></td></tr>').join('');
    return authPage('Email campaigns', CSS + '<p><a href="/admin">← Leads and accounts</a></p><h1>Email campaigns</h1>' + (note ? '<p class="ok">' + E(note) + '</p>' : '') + (err ? '<p class="err">' + E(err) + '</p>' : '') +
      '<p>Write an email, pick who gets it, send yourself a test, then send it now or schedule it. <b>Nothing goes out until you confirm the number of people.</b> Anyone who unsubscribed is always left out, and every email has a one-click unsubscribe.</p>' +
      tiles([[done.length, 'campaigns sent'], [totSent.toLocaleString('en-GB'), 'emails delivered'], [pct(totOpen, totSent), 'opened (unique)'], [pct(totClick, totSent), 'clicked a link'], [totUnsub, 'unsubscribed from a campaign']]) +
      '<details class="card"' + (all.some(o => o.s.kind === 'custom') ? '' : ' open') + '><summary><b>New campaign</b></summary><form method="post" action="/admin/campaigns/new">' + field('name', '', 'Name (only the team sees this)', { ph: 'e.g. December newsletter', req: true }) + audSelect('leads:all', counts) +
      '<button>Create draft</button><p class="cm-help" style="margin:0">Or press <b>Copy</b> on any campaign below to start from it, including the five designed ones.</p></form></details>' +
      (active.length ? table('Scheduled and sending', active, '') : '') + table('Drafts', drafts, 'No drafts.') + table('Sent', sent, 'Nothing sent yet.') +
      '<h2>Audiences</h2><div class="card" style="overflow:auto"><table class="cm-table"><tr><th>Audience</th><th>Who</th><th>Can get emails now</th></tr>' + Object.entries(campaigns.AUDIENCES).map(([k, a]) => '<tr><td><b>' + E(a.label) + '</b></td><td><small>' + E(a.about) + '</small></td><td><b>' + counts[k] + '</b></td></tr>').join('') + '</table>' +
      '<p class="cm-help" style="margin:10px 0 0">Leads come from the website forms. Contact-form enquiries are never included, because they did not ask for emails. Hosts can turn off “News and offers” in their account page or with the link in each email.</p></div>' +
      '<details class="card"><summary><b>Automatic emails already running</b></summary><p class="cm-help">These send by themselves from each lead form (see Leads) and to hosts after sign-up (welcome, day-2 checklist, site live, week-3 tips, Monday report, payment failed).</p><table class="cm-table">' + auto + '</table></details>', true);
  }

  /* ---------- one campaign ---------- */
  async function editPage(id, note, err) {
    const o = (await campaigns.overview()).find(x => x.s.id === id); if (!o) return null;
    const { s, d } = o, ed = campaigns.editable(s), n = sentCount(s), st = o.stats, counts = d ? null : await campaigns.audienceCounts();
    const skipped = Object.entries(o.skipped).map(([r, k]) => k + ' ' + r).join(' · ');
    const head = '<p><a href="/admin/campaigns">← Email campaigns</a></p><h1>' + E(s.name) + '</h1>' + (note ? '<p class="ok">' + E(note) + '</p>' : '') + (err ? '<p class="err" role="alert">' + E(err) + '</p>' : '') +
      '<p>' + badge(o) + ' ' + (d ? E(d.about) : '') + '</p><p class="cm-help"><b>Who:</b> ' + E(o.audienceLabel) + ' · <b>' + o.count + '</b> ' + (n ? 'more ' : '') + 'can get it now' + (skipped ? ' · left out: ' + E(skipped) : '') + (d ? '<br><b>When:</b> ' + E(d.when) : '') + '</p>';

    let results = '';
    if (n || ['sending', 'sent', 'stopped'].includes(s.status)) {
      results = tiles([[n, 'delivered'], [pct(st.opens, n), st.opens + ' opened'], [pct(st.clicks, n), st.clicks + ' clicked'], [st.unsubs, 'unsubscribed'], [failedCount(s), 'failed']]) +
        (st.links.length ? '<div class="card"><b>Links clicked</b> <small class="cm-help">(people, once each)</small><table class="cm-table" style="margin-top:8px">' + st.links.map(([u, k]) => '<tr><td style="word-break:break-all"><small>' + E(u) + '</small></td><td><b>' + k + '</b></td></tr>').join('') + '</table></div>' : '') +
        '<p class="cm-help">Opens are a guide only: some email apps load images for privacy and count as an open, others block them. Clicks are exact.</p>';
    }
    const actions = [];
    if (s.status === 'sending') actions.push('<form method="post" action="/admin/campaigns/' + id + '/cancel"><button class="danger">Stop sending</button></form>');
    if (s.status === 'scheduled') actions.push('<form method="post" action="/admin/campaigns/' + id + '/cancel"><button class="sec">Cancel the schedule</button></form>');
    if (failedCount(s) && ['sent', 'stopped'].includes(s.status)) actions.push('<form method="post" action="/admin/campaigns/' + id + '/retry"><button>Retry ' + failedCount(s) + ' failed</button></form>');
    actions.push('<form method="post" action="/admin/campaigns/' + id + '/duplicate"><button class="sec">Make a copy</button></form>');
    if (s.kind === 'custom' && ed) actions.push('<form method="post" action="/admin/campaigns/' + id + '/delete"><button class="sec">Delete draft</button></form>');
    const actionRow = '<div class="cm-row" style="margin:12px 0">' + actions.join('') + '</div>';

    let form = '', sendBox = '';
    if (ed) {
      const fields = d ? d.needs.map(([k, label, , type]) => field(k, s.settings[k], label, { type })).join('')
        : audSelect(s.audience, counts) + field('heading', s.heading, 'Heading (optional)', { ph: 'Fill January without the Airbnb discount' }) +
          field('body', s.body, 'Email', { area: true, help: 'Blank line for a new paragraph. Lines starting with <code>-</code> make a list. <code>**bold**</code>, <code>[words](https://link)</code>. Personal fields: <code>{{first_name}}</code> <code>{{name}}</code> <code>{{email}}</code> <code>{{property_name}}</code>. Links: <code>{{demo_url}}</code> <code>{{signup_url}}</code> <code>{{book_call_url}}</code>. The sign-off and unsubscribe link are added for you.' }) +
          '<div class="cm-two">' + field('button_label', s.button_label, 'Button text (optional)', { ph: 'Try the demo' }) + field('button_url', s.button_url, 'Button link', { ph: 'https://booking-booster.co.uk/demo' }) + '</div>';
      form = '<form method="post" action="/admin/campaigns/' + id + '/save" class="card" style="margin-top:0">' + field('name', s.name, 'Name (only the team sees this)') + field('subject', s.subject, 'Subject', { help: 'Personal fields work here too, like <code>{{first_name}}</code>.' }) +
        field('preview', s.preview, 'Preview line (shown after the subject in the inbox)') + fields +
        '<div class="cm-row"><button>Save draft</button><button formaction="/admin/campaigns/' + id + '/test" class="sec">Save and send me a test</button></div>' + (s.tests ? '<p class="cm-help" style="margin:0">' + s.tests + ' test' + (s.tests === 1 ? '' : 's') + ' sent' + (s.last_test_to ? ', last to ' + E(s.last_test_to) : '') + '.</p>' : '') + '</form>';
      const why = o.blocked.length ? E(o.blocked.join(' ')) : !s.tests ? 'Send yourself a test first.' : !o.count ? 'Nobody in this audience can get it right now.' : '';
      sendBox = '<div class="card"><b>Send</b>' + (why ? '<p class="cm-help" style="margin:8px 0 0">' + why + '</p>' :
        '<p class="cm-help" style="margin:8px 0 0">This goes to <b>' + o.count + '</b> people and cannot be undone. Type <b>' + o.count + '</b> to confirm, then send now or pick a time.</p>' +
        '<form method="post" action="/admin/campaigns/' + id + '/send">' + field('confirm', '', 'Type ' + o.count + ' to confirm', { req: true }) +
        '<div class="cm-two">' + field('day', '', 'Day (UK)', { type: 'date' }) + field('time', '09:30', 'Time (UK)', { type: 'time' }) + '</div>' +
        '<div class="cm-row"><button>Send now to ' + o.count + ' people</button><button formaction="/admin/campaigns/' + id + '/schedule" class="sec">Schedule for that time</button></div></form>') + '</div>';
    } else if (s.status === 'scheduled') {
      sendBox = '<div class="card"><b>Scheduled for ' + E(day(s.scheduled_at)) + '</b><p class="cm-help" style="margin:8px 0 0">About ' + (s.planned || o.count) + ' people. Anyone who unsubscribes before then is left out. Cancel the schedule to make changes.</p></div>';
    }
    const preview = '<div class="card cm-sticky" style="margin-top:0"><b>Preview</b> <small class="cm-help">(' + (o.count ? 'with the first person’s details' : 'with sample details') + ', <a href="/admin/campaigns/' + id + '/preview" target="_blank">open full size</a>)</small>' +
      '<iframe title="Email preview" src="/admin/campaigns/' + id + '/preview" style="width:100%;height:860px;border:1px solid #E4E7F0;border-radius:8px;margin-top:8px;background:#fff" sandbox></iframe></div>';
    return authPage(s.name, CSS + head + results + actionRow + '<div class="cm-grid"><div>' + form + sendBox + '</div>' + preview + '</div>', true);
  }

  return async function (req, res, p, m, u) {
    if (p === '/admin/campaigns') return html(res, await listPage(u.searchParams.get('note'), u.searchParams.get('err')));
    if (p === '/admin/campaigns/new' && m === 'POST') { const f = await formBody(req); const s = await campaigns.create(f); return redirect(res, '/admin/campaigns/' + s.id + '?note=' + encodeURIComponent('Draft created. Write it, send yourself a test, then send or schedule it.')); }
    const mm = p.match(/^\/admin\/campaigns\/([a-z0-9-]+)(?:\/(preview|save|test|send|schedule|cancel|retry|duplicate|delete))?$/);
    const s = mm && await campaigns.load(mm[1]); if (!s) return send(res, 404, authPage('Not found', '<h1>Not found</h1><p><a href="/admin/campaigns">Email campaigns</a></p>'), 'text/html; charset=utf-8');
    const id = s.id, act = mm[2];
    if (act === 'preview') return send(res, 200, (await campaigns.preview(id)).html, 'text/html; charset=utf-8', { 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; img-src * data:; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com" });
    if (m !== 'POST' || !act) return html(res, await editPage(id, u.searchParams.get('note'), u.searchParams.get('err')));
    const f = await formBody(req); let note = '', err = '';
    if (act === 'save') { await campaigns.update(id, f); note = 'Saved. Still a draft: nothing has been sent.'; }
    if (act === 'test') { const who = await me(req); await campaigns.update(id, f); const r = await campaigns.sendTest(id, who.email); r.ok ? note = 'Test sent to ' + who.email + '. Nobody else got it.' : err = r.error; }
    if (act === 'send') { const r = await campaigns.send(id, f.confirm); r.ok ? note = 'Sent to ' + r.sent + (r.failed ? ', ' + r.failed + ' failed' : '') + (r.left ? '. The other ' + r.left + ' are going out in the background over the next few minutes' : '') + '.' : err = r.error; }
    if (act === 'schedule') {
      const at = f.day && /^\d{4}-\d{2}-\d{2}$/.test(f.day) && /^\d{2}:\d{2}$/.test(f.time || '') ? leads.ukAt(f.day, f.time) : 0;
      const r = at ? await campaigns.schedule(id, at, f.confirm) : { error: 'Pick a day and time to schedule it.' }; r.ok ? note = 'Scheduled for ' + day(r.at) + ' (UK), to about ' + r.count + ' people.' : err = r.error;
    }
    if (act === 'cancel') { const r = await campaigns.cancel(id); r.ok ? note = r.note : err = r.error; }
    if (act === 'retry') { const r = await campaigns.retry(id); r.ok ? note = 'Retried: ' + r.sent + ' sent' + (r.failed ? ', ' + r.failed + ' failed again' : '') + '.' : err = r.error; }
    if (act === 'duplicate') { const c = await campaigns.duplicate(id); return redirect(res, '/admin/campaigns/' + c.id + '?note=' + encodeURIComponent('Copied as a new draft.')); }
    if (act === 'delete') { const r = await campaigns.remove(id); if (r.ok) return redirect(res, '/admin/campaigns?note=' + encodeURIComponent('Draft deleted.')); err = r.error; }
    return html(res, await editPage(id, note, err));
  };
};
