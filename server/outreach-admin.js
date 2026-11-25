// The team's outreach list, /admin/outreach: the hosts imported from a CSV (kind 'import' in leads), so the team can
// see who to phone this week, work through them and note how each call went. Team only: index.js checks ADMIN_EMAILS
// before calling this. Nothing here sends an email or enrols anyone in a series; it only reads and updates the rows.
'use strict';

const STATUSES = ['Not contacted', 'Called, no answer', 'Left a message', 'Call back later', 'Spoke, interested', 'Spoke, not interested', 'Do not contact'];
const PRI = { A: 0, B: 1, C: 2 };
const PAGE = 100;

// The outreach week a moment belongs to, as the date of its Monday (UK). On Saturday and Sunday the team is
// planning the week ahead, so the weekend belongs to the coming Monday.
function weekOf(ms) {
  const d = new Date(new Date(ms).toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const dow = d.getDay(), shift = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  d.setDate(d.getDate() + shift);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const ukDay = ms => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
const weekLabel = w => new Date(w + 'T12:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });
const safeUrl = v => (/^https?:\/\/[^\s"<>]+$/i.test(String(v || '')) ? String(v) : '');

module.exports = function ({ db, E, ui, email, send, redirect, formBody, now }) {
  now = now || (() => Date.now());
  const page = async (res, o) => send(res, 200, ui.shell(Object.assign({ email: await email(), active: 'outreach' }, o)), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });

  async function load() {
    const rows = await db.prepare("SELECT id, name, phone, email, source, data, created_at FROM leads WHERE kind = 'import' ORDER BY id").all();
    return rows.map(r => { let d = {}; try { d = JSON.parse(r.data || '{}') || {}; } catch (_) {} return Object.assign(r, { d, status: STATUSES.includes(d['Outreach status']) ? d['Outreach status'] : 'Not contacted' }); });
  }
  const order = (a, b) => ((PRI[a.d.Priority] ?? 9) - (PRI[b.d.Priority] ?? 9)) || ((+a.d.import_row || 0) - (+b.d.import_row || 0)) || (a.id - b.id);
  async function save(r) { await db.prepare("UPDATE leads SET data = ? WHERE id = ? AND kind = 'import'").run(JSON.stringify(r.d), r.id); }

  const CSS = '<style>.x-app .or-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}.x-app .or-tabs a{text-decoration:none}' +
    '.x-app .or-filters{display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin:0 0 16px}.x-app .or-filters .field{min-width:150px;margin:0}.x-app .or-filters .field input,.x-app .or-filters .field select{padding:8px 10px;font-size:13.5px}' +
    '.x-app .or-st{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.x-app .or-st select,.x-app .or-st input{font:inherit;font-size:13px;padding:6px 8px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:inherit;max-width:190px}' +
    '.x-app .or-tel{font:600 14px var(--mono);white-space:nowrap}.x-app .or-pager{display:flex;gap:8px;justify-content:space-between;align-items:center;padding:14px 20px}' +
    '.x-app .or-rules{font-size:13.5px;line-height:1.55;margin:0;padding-left:18px}.x-app .or-rules li{margin:0 0 4px}</style>';

  function row(r, back, inWeek) {
    const d = r.d, site = safeUrl(d.Website), src = safeUrl(d['Source URL']);
    const tel = r.phone ? '<a class="or-tel" href="tel:' + E(r.phone) + '">' + E(r.phone.replace(/^\+44/, '0')) + '</a>' : (r.email ? E(r.email) : '');
    const opts = STATUSES.map(s => '<option' + (s === r.status ? ' selected' : '') + '>' + E(s) + '</option>').join('');
    const statusPill = r.status === 'Spoke, interested' ? 'good' : r.status === 'Do not contact' || r.status === 'Spoke, not interested' ? 'bad' : r.status === 'Not contacted' ? 'muted' : 'info';
    const form = '<form method="post" action="/admin/outreach/status" class="or-st"><input type="hidden" name="id" value="' + r.id + '"><input type="hidden" name="back" value="' + E(back) + '">' +
      '<select name="status" aria-label="Call result">' + opts + '</select><input name="note" placeholder="Note" value="' + E(d.Response || '') + '" aria-label="Note"><button class="btn sm">Save</button></form>' +
      (inWeek ? '<form method="post" action="/admin/outreach/week/remove" style="margin-top:6px"><input type="hidden" name="id" value="' + r.id + '"><input type="hidden" name="back" value="' + E(back) + '"><button class="btn sm ghost">Take off this week</button></form>' : '');
    return '<tr><td><b>' + E(r.name || d['Business / property name'] || '') + '</b><small>' + E(d['Accommodation type'] || '') +
      (site ? ' · <a href="' + E(site) + '" target="_blank" rel="noopener">Website</a>' : ' · No website') + (src ? ' · <a href="' + E(src) + '" target="_blank" rel="noopener">Listing</a>' : '') + '</small></td>' +
      '<td>' + E(d.Town || '') + '<small>' + E([d.County, d.Region].filter(Boolean).join(' · ')) + '</small></td>' +
      '<td>' + tel + (d.Notes && !/^Postcode /.test(d.Notes) ? '<small>' + E(d.Notes) + '</small>' : '') + '</td>' +
      '<td>' + ui.pill(d.Priority === 'A' ? 'good' : d.Priority === 'B' ? 'info' : 'muted', 'Priority ' + (d.Priority || '?')) + '</td>' +
      '<td class="wrap">' + E(d['Pitch angle'] || '') + (/sole trader/i.test(d['Entity type (PECR)'] || '') ? '<small>Sole trader: phone only, no cold email</small>' : '') + '</td>' +
      '<td style="min-width:250px">' + ui.pill(statusPill, r.status) + (d['Date contacted'] ? '<small>Last update ' + E(d['Date contacted']) + '</small>' : '') + '<div style="margin-top:6px">' + form + '</div></td></tr>';
  }
  const HEADS = ['Host', 'Where', 'Phone', 'Priority', 'What to pitch', 'Call result'];

  async function list(res, u, note, err) {
    const all = await load(), wk = weekOf(now()), q = u.searchParams;
    const view = q.get('view') === 'all' ? 'all' : 'week';
    const week = all.filter(r => r.d.week === wk).sort(order);
    const open = all.filter(r => r.status === 'Not contacted' && !r.d.week && r.d.skipped !== wk);
    const done = week.filter(r => r.status !== 'Not contacted').length;
    const kpis = '<div class="adm-kpis">' + ui.kpi('This week', week.length, '', done + ' called or updated') + ui.kpi('Hosts on the list', all.length, '', all.filter(r => r.d.Priority === 'A').length + ' are priority A') +
      ui.kpi('Not picked yet', open.length, '', 'waiting for a later week') + ui.kpi('Interested', all.filter(r => r.status === 'Spoke, interested').length, '', 'said yes to hearing more', true) + '</div>';
    const rules = ui.card('Before you call', '', '<ul class="or-rules"><li>Phone first. Check each number against the TPS do-not-call register before you ring it.</li>' +
      '<li>Most of these hosts are sole traders, so no cold emails unless Companies House shows a limited company.</li>' +
      '<li>If someone asks not to be contacted, set <b>Do not contact</b>. Nothing on this page sends emails or texts.</li></ul>');
    const pick = (label, cls) => '<form method="post" action="/admin/outreach/week" class="adm-inline"><input type="hidden" name="back" value="/admin/outreach"><select name="count" aria-label="How many">' +
      [25, 50, 100].map(n => '<option' + (n === 50 ? ' selected' : '') + '>' + n + '</option>').join('') + '</select><button class="btn ' + (cls || 'sm') + '">' + label + '</button></form>';
    const tabs = '<div class="or-tabs"><a class="btn sm' + (view === 'week' ? ' primary' : '') + '" href="/admin/outreach">This week (' + week.length + ')</a><a class="btn sm' + (view === 'all' ? ' primary' : '') + '" href="/admin/outreach?view=all">All hosts (' + all.length + ')</a></div>';
    let body;
    if (view === 'week') {
      const back = '/admin/outreach';
      body = week.length
        ? ui.card('Week of ' + weekLabel(wk), '<div class="adm-inline">' + (open.length ? pick('Add more') : '') + '</div>', '<p class="adm-help" style="margin:0 0 12px">Priority A first. Update the call result after each call.</p></section><section class="a-card a-flush">' + ui.table(HEADS, week.map(r => row(r, back, true))))
        : ui.card('Week of ' + weekLabel(wk), '', '<div class="a-empty"><p>No hosts are picked for this week yet.' + (open.length ? ' Pick the next hosts from the list, priority A first.' : ' Everyone on the list has been picked already.') + '</p>' + (open.length ? pick('Pick hosts for this week', 'primary') : '') + '</div>');
    } else {
      const f = { pri: q.get('pri') || '', region: q.get('region') || '', status: q.get('status') || '', q: (q.get('q') || '').trim().toLowerCase() };
      let rows = all.filter(r => (!f.pri || r.d.Priority === f.pri) && (!f.region || r.d.Region === f.region) && (!f.status || r.status === f.status) &&
        (!f.q || [r.name, r.d.Town, r.d.County, r.phone].join(' ').toLowerCase().includes(f.q))).sort(order);
      const n = rows.length, pg = Math.max(1, Math.min(Math.ceil(n / PAGE) || 1, parseInt(q.get('page'), 10) || 1));
      rows = rows.slice((pg - 1) * PAGE, pg * PAGE);
      const qs = o => '/admin/outreach?' + new URLSearchParams(Object.assign({ view: 'all' }, Object.fromEntries(Object.entries(Object.assign({}, f, { q: q.get('q') || '' }, o)).filter(([, v]) => v)))).toString();
      const back = qs({ page: pg > 1 ? pg : '' });
      const regions = [...new Set(all.map(r => r.d.Region).filter(Boolean))].sort();
      const sel = (name, label, values, cur) => '<label class="field"><span>' + label + '</span><select name="' + name + '"><option value="">All</option>' + values.map(v => '<option' + (v === cur ? ' selected' : '') + '>' + E(v) + '</option>').join('') + '</select></label>';
      const filters = '<form method="get" action="/admin/outreach" class="or-filters"><input type="hidden" name="view" value="all">' + sel('pri', 'Priority', ['A', 'B', 'C'], f.pri) + sel('region', 'Region', regions, f.region) + sel('status', 'Call result', STATUSES, f.status) +
        '<label class="field"><span>Search</span><input name="q" value="' + E(q.get('q') || '') + '" placeholder="Name, town or phone"></label><button class="btn sm">Filter</button>' + (f.pri || f.region || f.status || f.q ? '<a class="btn sm ghost" href="/admin/outreach?view=all">Clear</a>' : '') + '</form>';
      const pager = n > PAGE ? '<div class="or-pager"><span class="adm-help">' + ((pg - 1) * PAGE + 1) + '–' + Math.min(pg * PAGE, n) + ' of ' + n + '</span><span class="adm-inline">' +
        (pg > 1 ? '<a class="btn sm" href="' + E(qs({ page: pg - 1 })) + '">Previous</a>' : '') + (pg * PAGE < n ? '<a class="btn sm" href="' + E(qs({ page: pg + 1 })) + '">Next</a>' : '') + '</span></div>' : '';
      body = filters + '<section class="a-card a-flush">' + ui.table(HEADS, rows.map(r => row(r, back, false)), 'No hosts match. Hosts arrive here when the team imports a CSV on the Leads page.') + pager + '</section>';
    }
    return page(res, { title: 'Outreach', heading: 'Outreach list', sub: 'The hosts to phone, from the imported lists. Pick a batch for each week and record how each call went. Nothing here sends emails.', note, err,
      body: CSS + kpis + tabs + body + '<div style="margin-top:16px">' + rules + '</div>' });
  }

  const backTo = v => (/^\/admin\/outreach(\?[^\s"<>]*)?$/.test(String(v || '')) ? String(v) : '/admin/outreach');

  return async function (req, res, p, m, u) {
    if (p === '/admin/outreach' && m === 'GET') return list(res, u);
    if (m !== 'POST') return false;
    const f = await formBody(req);
    if (p === '/admin/outreach/status') {
      const r = (await load()).find(x => x.id === +f.id); if (!r) return redirect(res, backTo(f.back));
      const st = STATUSES.includes(f.status) ? f.status : r.status, note = String(f.note || '').trim().slice(0, 500);
      if (st !== r.status || note !== (r.d.Response || '')) {
        r.d['Outreach status'] = st; if (note) r.d.Response = note; else delete r.d.Response;
        r.d['Date contacted'] = ukDay(now()); await save(r);
      }
      return redirect(res, backTo(f.back));
    }
    if (p === '/admin/outreach/week') {
      const n = Math.max(1, Math.min(200, parseInt(f.count, 10) || 50)), wk = weekOf(now());
      const pickable = (await load()).filter(r => r.status === 'Not contacted' && !r.d.week && r.d.skipped !== wk).sort(order).slice(0, n);
      for (const r of pickable) { r.d.week = wk; await save(r); }
      return redirect(res, '/admin/outreach');
    }
    if (p === '/admin/outreach/week/remove') {
      const r = (await load()).find(x => x.id === +f.id); if (r && r.d.week) { r.d.skipped = r.d.week; delete r.d.week; await save(r); } // back in the pool, but not picked again this week
      return redirect(res, backTo(f.back));
    }
    return false;
  };
};
module.exports.weekOf = weekOf;
module.exports.STATUSES = STATUSES;
