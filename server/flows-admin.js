// The team's sales flows page, /admin/flows (logic in server/flows.js). Team only: index.js checks ADMIN_EMAILS
// before calling this. One card per flow with its on/off switch, its numbers and every step, plus the team's
// to-do list from the flows and the walkthrough calls that still need marking.
'use strict';

module.exports = function ({ flows, E, ui, email, send, redirect, formBody }) {
  const day = ms => new Date(ms).toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const short = ms => new Date(ms).toLocaleDateString('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short' });
  const page = async (res, o) => send(res, 200, ui.shell(Object.assign({ email: await email(), active: 'flows' }, o)), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
  const CSS = '<style>.x-app .fl-card{margin-top:16px}.x-app .fl-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:10px;margin:4px 0 16px}' +
    '.x-app .fl-stats>div{background:var(--surface-2);border-radius:12px;padding:10px 12px}.x-app .fl-stats span{display:block;font-size:12px;color:var(--muted)}.x-app .fl-stats b{font:700 22px/1.2 var(--font-display);letter-spacing:-.02em}' +
    '.x-app .fl-steps{display:grid;gap:0;counter-reset:st}.x-app .fl-steps>div{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--line)}.x-app .fl-steps>div:last-child{border-bottom:0}' +
    '.x-app .fl-steps i{flex:none;width:26px;height:26px;border-radius:8px;display:grid;place-items:center;font:600 11px var(--mono);font-style:normal;background:var(--primary-soft,#E7EEFF);color:var(--primary)}.x-app .fl-steps i.al{background:var(--warn-soft);color:var(--warn)}' +
    '.x-app .fl-steps span{flex:1;min-width:0;font-size:14px}.x-app .fl-steps em{font-style:normal;font-size:12.5px;color:var(--muted);white-space:nowrap}.x-app .fl-steps a{font-size:12.5px;font-weight:600;white-space:nowrap}' +
    '.x-app .fl-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.x-app .fl-head h3{margin:0;font-size:18px}.x-app .fl-head p{margin:6px 0 0;max-width:720px}' +
    '.x-app .fl-sw{display:inline-flex;align-items:center;gap:10px}.x-app .fl-sw button{position:relative;width:46px;height:26px;border-radius:999px;border:0;background:var(--line);cursor:pointer;padding:0}' +
    '.x-app .fl-sw button::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:left .15s}' +
    '.x-app .fl-sw button[aria-pressed=true]{background:var(--good)}.x-app .fl-sw button[aria-pressed=true]::after{left:23px}' +
    '.x-app .fl-two{display:grid;gap:16px}@container xapp (min-width:900px){.x-app .fl-two{grid-template-columns:minmax(0,1.2fr) minmax(0,1fr)}}' +
    '.x-app .fl-todo>div{align-items:flex-start}.x-app .fl-todo form{margin:0}</style>';

  async function main(res, note, err) {
    const list = await flows.overview(), al = (await flows.alerts()).filter(a => !a.done && !a.good), calls = await flows.openCalls();
    const unmarked = calls.filter(c => !c.outcome);
    const tot = k => list.reduce((a, f) => a + f[k], 0);
    const entered = tot('entered'), won = tot('won');
    const kpis = '<div class="adm-kpis">' + ui.kpi('People reached by the flows', entered, '', tot('recent') + ' in the last 30 days') + ui.kpi('Reached the goal', won, '', entered ? Math.round(100 * won / entered) + '% of people reached' : 'no one yet') +
      ui.kpi('Emails sent', tot('emails'), '', 'by the five flows') + ui.kpi('Team to-dos', al.length + unmarked.length, '', 'from the flows, still open', true) + '</div>';

    const todo = al.slice(0, 20).map(a => '<div><span><b>' + E(a.text) + '</b><small>' + E(day(a.at)) + ' · ' + E((list.find(f => f.id === a.flow) || {}).name || a.flow) + (a.link ? ' · <a href="' + E(a.link) + '">Open</a>' : '') + '</small></span>' +
      '<form method="post" action="/admin/flows/alerts/done"><input type="hidden" name="id" value="' + E(a.id) + '"><button class="btn sm ghost">' + ui.icon('check') + 'Done</button></form></div>').join('');
    const callRows = calls.slice(0, 12).map(c => '<div><span><b>' + E(c.name || c.email) + '</b><small>' + E(c.email) + ' · call ' + E(day(c.call_at)) + '</small></span>' +
      (c.outcome ? ui.pill(c.outcome === 'attended' ? 'good' : 'warn', c.outcome === 'attended' ? 'Attended' : 'No-show') :
        '<span class="adm-inline"><form method="post" action="/admin/flows/calls/' + c.id + '/attended"><button class="btn sm">Attended</button></form><form method="post" action="/admin/flows/calls/' + c.id + '/noshow"><button class="btn sm ghost">No-show</button></form></span>') + '</div>').join('');
    const team = '<div class="fl-two">' +
      ui.card('Team to-dos from the flows', al.length ? al.length + ' open' : 'all clear', '<div class="adm-list fl-todo">' + (todo || '<div><span><small>Nothing to do. When someone gets stuck, stops paying or asks to cancel, it shows up here and in your inbox.</small></span></div>') + '</div>') +
      ui.card('Walkthrough calls, last 14 days', unmarked.length ? unmarked.length + ' to mark' : '', '<p class="adm-help" style="margin:0 0 8px">Mark each call so the right emails go out: no-shows get a rebook email, people who came get the follow-ups. Unmarked calls count as attended after a day.</p><div class="adm-list">' + (callRows || '<div><span><small>No calls in the last 14 days.</small></span></div>') + '</div>') + '</div>';

    const cards = list.map(f => {
      const sw = '<form method="post" action="/admin/flows/' + f.id + '/toggle" class="fl-sw"><input type="hidden" name="on" value="' + (f.on ? '0' : '1') + '">' + ui.pill(f.on ? 'good' : 'muted', f.on ? 'On' : 'Off') +
        '<button aria-pressed="' + f.on + '" aria-label="' + (f.on ? 'Switch off ' : 'Switch on ') + E(f.name) + '" title="' + (f.on ? 'Switch off' : 'Switch on') + '"></button></form>';
      const stats = '<div class="fl-stats"><div><span>People reached</span><b>' + f.entered + '</b></div><div><span>' + E(f.goalLabel) + '</span><b>' + (f.rate == null ? '–' : f.rate + '%') + '</b></div>' +
        '<div><span>Emails sent</span><b>' + f.emails + '</b></div><div><span>Team alerts</span><b>' + f.alerts + '</b></div></div>';
      const steps = '<div class="fl-steps">' + f.steps.map(x => '<div><i class="' + (x.alert ? 'al' : '') + '">' + E(x.key) + '</i><span>' + E(x.label) + (x.alert ? ' <small class="adm-help">· to the team</small>' : '') + '</span><em>' + x.sent + ' sent</em>' +
        (x.alert ? '' : '<a href="/admin/flows/preview/' + f.id + '/' + x.key + '" target="_blank" rel="noopener">Preview</a>') + '</div>').join('') + '</div>';
      const people = f.people.length ? '<p class="adm-help" style="margin:14px 0 4px"><b>Latest people</b></p><div class="adm-list">' + f.people.map(p => '<div><span><b>' + E(p.email) + '</b><small>Joined ' + E(short(p.in)) + (p.last ? ' · last ' + E(p.last[0]) + ' ' + E(short(p.last[1])) : '') + '</small></span>' +
        (p.goal ? ui.pill('good', 'Goal reached') : p.outcome === 'noshow' ? ui.pill('warn', 'No-show') : ui.pill('info', 'In the flow')) + '</div>').join('') + '</div>' : '';
      return '<section class="a-card fl-card" id="' + f.id + '"><div class="fl-head"><div><h3>' + E(f.name) + '</h3><p class="adm-help">' + E(f.about) + '</p></div>' + sw + '</div>' + stats + steps + people +
        (f.on ? '' : '<p class="adm-help" style="margin:12px 0 0">Off: nothing from this flow is sent. When you switch it back on, it only picks up people from that moment.</p>') + '</section>';
    }).join('');
    return page(res, { title: 'Sales flows', note, err, sub: 'Five automatic flows that follow every lead and host through the points where people usually drop off. They use our own email sending, stop for anyone who unsubscribes, and tell the team when a person needs a human.',
      actions: '<a class="btn sm" href="/admin/leads">' + ui.icon('users') + 'Leads</a><a class="btn sm" href="/admin/hosts">' + ui.icon('home') + 'Users</a>',
      body: CSS + kpis + team + cards });
  }

  return async function (req, res, p, m) {
    let mm;
    if (p === '/admin/flows' && m === 'GET') return main(res);
    if ((mm = p.match(/^\/admin\/flows\/preview\/([a-z_]+)\/([A-Z0-9]+)$/)) && m === 'GET') {
      const r = flows.sample(mm[1], mm[2]); if (!r) return send(res, 404, 'Not found', 'text/plain');
      return send(res, 200, r.html, 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
    }
    if (m !== 'POST') return send(res, 404, 'Not found', 'text/plain');
    const f = await formBody(req);
    if ((mm = p.match(/^\/admin\/flows\/([a-z_]+)\/toggle$/))) {
      const on = f.on === '1'; if (!await flows.toggle(mm[1], on)) return main(res, '', 'No such flow.');
      return main(res, (flows.FLOWS.find(x => x.id === mm[1]) || {}).name + (on ? ' is on. It picks up people from now.' : ' is off. Nothing from it will be sent.'));
    }
    if ((mm = p.match(/^\/admin\/flows\/calls\/(\d+)\/(attended|noshow)$/))) { await flows.markCall(+mm[1], mm[2]); return main(res, mm[2] === 'noshow' ? 'Marked as a no-show. The rebook email is on its way.' : 'Marked as attended. The follow-ups will go out.'); }
    if (p === '/admin/flows/alerts/done') { await flows.doneAlert(String(f.id || '')); return redirect(res, '/admin/flows'); }
    return send(res, 404, 'Not found', 'text/plain');
  };
};
