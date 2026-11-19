// The team admin's page frame. It uses the host console's own stylesheet and markup (dark sidebar, top bar, cards,
// tiles, tables, buttons and fields from web/src/core.css and app.css), so /admin looks and behaves like /app.
'use strict';
const pages = require('./pages');
const esc = pages.esc;

const I = {
  dash: '<path d="M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-4H4zM14 8h6V4h-6z"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2 20c1-4 4-6 7-6s6 2 7 6M16 4.5a3.5 3.5 0 010 7M18 14c2 .8 3.5 3 4 6"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  home: '<path d="M3 11l9-7 9 7v9H3z"/>',
  card: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  out: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  spark: '<path d="M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z"/>',
  down: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  doc: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
};
const icon = (k, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (I[k] || I.spark) + '</svg>';
const MARK = '<svg class="mark" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#2747F5"/><path d="M22 54 L50 28 L78 54" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 74 L50 57 L68 74" fill="none" stroke="#FFC42E" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const NAV = [
  ['Team', [['overview', '/admin', 'dash', 'Overview'], ['leads', '/admin/leads', 'users', 'Leads'], ['hosts', '/admin/hosts', 'home', 'Users'], ['partners', '/admin/affiliates', 'share', 'Partners']]],
  ['Marketing', [['flows', '/admin/flows', 'spark', 'Sales flows'], ['campaigns', '/admin/campaigns', 'mail', 'Email campaigns'], ['emails', '/admin/emails', 'doc', 'Email templates'], ['social', '/admin/social', 'share', 'Social posts']]],
  ['Settings', [['settings', '/admin/settings', 'gear', 'Stripe, links and backups']]],
];

// Bits the console has no component for: form layouts, notices and small tables inside cards.
const CSS = `
.x-app a.a-nav,.x-app a.a-tab,.x-app a.a-biz,.x-app a.a-side-foot{text-decoration:none}
.x-app .adm-note{display:flex;gap:10px;align-items:center;border-radius:12px;padding:11px 14px;font-weight:600;font-size:14px;margin-bottom:16px;background:var(--good-soft);color:var(--good)}
.x-app .adm-note.bad{background:var(--bad-soft);color:var(--bad)}
.x-app .adm-note .ic{width:16px;height:16px}
.x-app .adm-form{display:grid;gap:14px}
.x-app .adm-form .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.x-app .adm-two{display:grid;gap:14px}@container xapp (min-width:700px){.x-app .adm-two{grid-template-columns:1fr 1fr}}
.x-app .adm-help{font-size:12.5px;color:var(--muted);line-height:1.5}.x-app .adm-help code{font:500 11.5px var(--mono);background:var(--surface-2);border:1px solid var(--line);border-radius:5px;padding:1px 5px}
.x-app .field textarea.tall{min-height:280px;line-height:1.55}
.x-app details.adm-x>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px;font-weight:600;font-size:13px;color:var(--primary)}
.x-app details.adm-x>summary::-webkit-details-marker{display:none}
.x-app details.adm-x[open]>summary{margin-bottom:10px}
.x-app details.adm-x .adm-form{gap:8px;min-width:240px}
.x-app details.adm-x .field input{padding:8px 10px;font-size:13.5px}
.x-app details.a-card>summary{cursor:pointer;list-style:none}.x-app details.a-card>summary::-webkit-details-marker{display:none}
.x-app details.a-card>summary h3::after{content:' +';color:var(--muted);font-weight:500}.x-app details.a-card[open]>summary h3::after{content:''}
.x-app details.a-card[open]>summary{margin-bottom:14px}
.x-app .a-tbl td{vertical-align:top}.x-app .a-tbl td small,.x-app .adm-sub{display:block;color:var(--muted);font-size:12.5px;margin-top:2px}
.x-app .a-tbl td.wrap{max-width:360px;font-size:13px;color:var(--muted)}
.x-app .a-tbl td form{margin:0}
.x-app .adm-inline{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap}.x-app .adm-inline form{display:inline}
.x-app .adm-list{display:grid;gap:0}.x-app .adm-list>div{display:flex;justify-content:space-between;align-items:center;gap:14px;padding:12px 0;border-bottom:1px solid var(--line)}.x-app .adm-list>div:last-child{border-bottom:0}
.x-app .adm-list .pill{flex:none}.x-app .adm-list b{font-weight:600}.x-app .adm-list small{display:block;color:var(--muted);font-size:12.5px}
.x-app .adm-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:16px;margin-bottom:16px}
.x-app .adm-stack{display:grid;gap:16px;align-content:start}
.x-app .adm-cols{display:grid;gap:16px;align-items:start}@container xapp (min-width:1100px){.x-app .adm-cols{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.x-app .adm-sticky{position:sticky;top:84px}}
.x-app .adm-frame{width:100%;height:860px;border:1px solid var(--line);border-radius:12px;background:#fff}
.x-app .a-top .adm-title{font:600 14px var(--font-body);color:var(--muted)}@container xapp (max-width:1020px){.x-app .a-top .adm-title{display:none}}
.x-app .a-tbl .adm-inline{flex-wrap:nowrap}.x-app .a-tbl td.num{white-space:nowrap}
.x-app .a-grid.adm-top{align-items:start}
.x-app .adm-mails{display:grid;gap:2px;margin:0 -8px}
.x-app a.adm-mail{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:9px 10px;border-radius:10px;color:inherit;text-decoration:none}
.x-app a.adm-mail:hover{background:var(--surface-2)}.x-app a.adm-mail.on{background:var(--primary-soft,var(--surface-2));box-shadow:inset 3px 0 0 var(--primary)}
.x-app a.adm-mail b{font-weight:600;font-size:14px}.x-app a.adm-mail small{display:block;color:var(--muted);font-size:12.5px;margin-top:1px}.x-app a.adm-mail .pill{flex:none}
.x-app .adm-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center}.x-app .adm-chips a.chip{text-decoration:none;color:inherit}.x-app .adm-chips a.chip.on{background:var(--primary);color:var(--primary-ink);border-color:var(--primary)}
.x-app .adm-cal{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}
.x-app .adm-cal-h{font:600 11px var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:2px 4px}
.x-app .adm-cal-d{min-height:104px;border:1px solid var(--line);border-radius:10px;padding:6px;display:flex;flex-direction:column;gap:3px;background:var(--surface);min-width:0}
.x-app .adm-cal-d.off{border:0;background:none}.x-app .adm-cal-d.past{background:var(--surface-2)}.x-app .adm-cal-d.today{border-color:var(--primary);box-shadow:inset 0 0 0 1px var(--primary)}
.x-app .adm-cal-d>b{font:600 12px var(--mono);color:var(--muted)}.x-app .adm-cal-d.today>b{color:var(--primary)}
.x-app a.adm-cal-p{display:block;font-size:11.5px;line-height:1.3;padding:3px 6px;border-radius:6px;text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--fg);background:var(--info-soft,#E7EEFF);border-left:3px solid var(--info,#2747F5)}
.x-app a.adm-cal-p i{font-style:normal;font-family:var(--mono);opacity:.75;margin-right:4px}
.x-app a.adm-cal-p.published{background:var(--good-soft);border-left-color:var(--good)}.x-app a.adm-cal-p.error{background:var(--bad-soft);border-left-color:var(--bad)}.x-app a.adm-cal-p.partial{background:var(--warn-soft,#FFF4D6);border-left-color:var(--warn,#B7791F)}
.x-app .adm-cal-s{font-size:11px;color:var(--muted)}
.x-app .adm-key{display:inline-block;width:10px;height:10px;border-radius:3px;margin:0 5px 0 10px;vertical-align:-1px;background:var(--info,#2747F5)}.x-app .adm-key:first-child{margin-left:0}
.x-app .adm-key.published{background:var(--good)}.x-app .adm-key.error{background:var(--bad)}.x-app .adm-key.partial{background:var(--warn,#B7791F)}
.x-app img.adm-thumb{width:56px;height:70px;object-fit:cover;border-radius:8px;border:1px solid var(--line);display:block;background:var(--surface-2)}
@container xapp (max-width:700px){.x-app .adm-cal{gap:2px}.x-app .adm-cal-d{min-height:54px;padding:4px}.x-app a.adm-cal-p{font-size:0;padding:0;height:6px;border-left-width:0}.x-app a.adm-cal-p i{display:none}.x-app .adm-cal-s{display:none}}
.x-app .a-tools .btn.adm-write{white-space:nowrap}@container xapp (max-width:560px){.x-app .a-tools .btn.adm-host{display:none}}
`;

function shell(o) {
  const a = pages.assets();
  const nav = (cls, tag) => NAV.map(([g, items], gi) => (tag === 'strip' ? (gi ? '<span class="a-strip-sep" aria-hidden="true"></span>' : '') : '<div class="a-grp"><p>' + esc(g) + '</p>') +
    items.map(([k, href, ic, label]) => '<a class="' + cls + '" href="' + href + '"' + (k === o.active ? ' aria-current="page"' : '') + '>' + icon(ic) + '<span>' + esc(label) + '</span>' + (k === 'leads' && o.waiting ? '<i class="a-badge num">' + o.waiting + '</i>' : '') + '</a>').join('') +
    (tag === 'strip' ? '' : '</div>')).join('');
  const who = String(o.email || ''), initials = (who.split('@')[0].replace(/[^a-z]/gi, ' ').trim().split(/\s+/).map(x => x[0]).join('').slice(0, 2) || 'BB').toUpperCase();
  const note = (o.note ? '<div class="adm-note" role="status">' + icon('check') + esc(o.note) + '</div>' : '') + (o.err ? '<div class="adm-note bad" role="alert">' + icon('x') + esc(o.err) + '</div>' : '');
  const head = o.heading === false ? '' : '<div class="a-vh"><div>' + (o.back ? '<p style="margin:0 0 6px"><a href="' + o.back[0] + '" class="adm-help" style="text-decoration:none">← ' + esc(o.back[1]) + '</a></p>' : '') +
    '<h2 class="disp">' + esc(o.heading || o.title) + '</h2>' + (o.sub ? '<p>' + o.sub + '</p>' : '') + '</div>' + (o.actions ? '<div class="a-acts">' + o.actions + '</div>' : '') + '</div>';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>' + esc(o.title) + ' · Bookingbooster team</title><meta name="robots" content="noindex">' +
    '<link rel="icon" href="/assets/mark.svg" type="image/svg+xml">' + pages.FONTS + '<link rel="stylesheet" href="/assets/app.' + a.hash.css + '.css"><style>body{margin:0}' + CSS + '</style></head>' +
    '<body class="prod prod-host"><main class="surface s-app"><div class="surface-root" style="--a-top:0px"><div class="x-app"><div class="a-frame">' +
    '<aside class="a-side" aria-label="Team navigation"><div class="a-side-top"><a href="/admin" style="color:inherit;text-decoration:none"><span class="lockup">' + MARK + 'bookingbooster</span></a></div>' +
    '<a class="a-biz" href="/admin"><i></i><span><b>Bookingbooster team</b><em>Team admin</em></span></a><nav class="a-navs">' + nav('a-nav') + '</nav>' +
    '<a class="a-side-foot" href="/app"><span class="a-pulse"></span><span><b>Open the host console</b><em>' + esc(who) + '</em></span></a></aside>' +
    '<div class="a-main"><header class="a-top"><a class="a-mbrand" href="/admin" style="text-decoration:none">' + MARK + '<span>Team</span></a><span class="adm-title">Team admin</span>' +
    '<div class="a-tools">' + (o.tools || '') + (o.active === 'write' ? '' : '<a class="btn primary sm adm-write" href="/admin/campaigns/write">' + icon('pen') + '<span>Write an email</span></a>') + '<a class="btn sm adm-host" href="/app">' + icon('out') + '<span>Host console</span></a><span class="a-me" title="' + esc(who) + '"><span class="avatar sm" style="--h:226">' + esc(initials) + '</span></span></div></header>' +
    '<nav class="a-strip" aria-label="Team navigation">' + nav('a-tab', 'strip') + '</nav>' +
    '<main class="a-body"><div class="a-view a-v-admin">' + head + note + o.body + '</div></main></div></div></div></div></main></body></html>';
}

// small builders shared by the admin pages
const field = (name, value, label, o) => {
  o = o || {};
  const attrs = (o.type ? ' type="' + o.type + '"' : '') + (o.ph ? ' placeholder="' + esc(o.ph) + '"' : '') + (o.req ? ' required' : '') + (o.extra || '');
  const ctl = o.area ? '<textarea name="' + name + '" class="' + (o.tall ? 'tall' : '') + '"' + attrs + '>' + esc(value || '') + '</textarea>'
    : o.options ? '<select name="' + name + '">' + o.options.map(([v, l]) => '<option value="' + esc(v) + '"' + (v === value ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
    : '<input name="' + name + '" value="' + esc(value == null ? '' : value) + '"' + attrs + '>';
  return '<label class="field"><span>' + esc(label) + '</span>' + ctl + (o.help ? '<small class="adm-help">' + o.help + '</small>' : '') + '</label>';
};
const kpi = (label, value, em, small, hi) => '<div class="a-kpi' + (hi ? ' hi' : '') + '"><span>' + esc(label) + '</span><b class="num">' + value + '</b>' + (em ? '<em class="up">' + em + '</em>' : '<em></em>') + (small ? '<small>' + small + '</small>' : '') + '</div>';
const card = (title, meta, body, cls) => '<section class="a-card ' + (cls || '') + '"><div class="a-card-h"><h3>' + esc(title) + '</h3>' + (meta ? '<div class="a-card-m">' + meta + '</div>' : '') + '</div>' + body + '</section>';
const table = (heads, rows, empty) => '<div class="tblwrap"><table class="tbl a-tbl"><thead><tr>' + heads.map(h => '<th' + (h[0] === '>' ? ' class="r">' + esc(h.slice(1)) : '>' + esc(h)) + '</th>').join('') + '</tr></thead><tbody>' +
  (rows.length ? rows.join('') : '<tr><td colspan="' + heads.length + '"><div class="a-empty"><p>' + esc(empty || 'Nothing here yet.') + '</p></div></td></tr>') + '</tbody></table></div>';
const pill = (cls, text) => '<span class="pill ' + cls + '">' + esc(text) + '</span>';

module.exports = { shell, icon, field, kpi, card, table, pill };
