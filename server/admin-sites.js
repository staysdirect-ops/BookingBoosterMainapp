// Team admin: booking sites that are not live yet (/admin/sites).
// A new home starts "building" and stays offline to guests until its site checklist (web/src/site-ready.js) is done.
// A host who gets stuck on the words hands the site to us, after doing the parts only they can do (photos, the facts
// of the home, payouts). We write and polish the words here, then publish, or send it back with a note.
// Kept light on purpose: aim for about 15 minutes a site, using the host's own facts and the AI drafts in Search health.
// Team only: index.js checks ADMIN_EMAILS before calling this.
'use strict';

module.exports = function ({ db, ws, urls, ui, E, send, redirect, formBody, email }) {
  const A = ui;
  const ago = iso => { if (!iso) return '–'; const t = Date.parse(iso.length <= 16 ? iso + ':00Z' : iso); if (!t) return E(iso); const h = (Date.now() - t) / 36e5; return h < 1 ? 'under an hour ago' : h < 48 ? Math.round(h) + ' h ago' : Math.round(h / 24) + ' days ago'; };
  const stateOf = p => (p.launch && p.launch.state) || 'live';
  const lines = v => String(v || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);

  // Every home in every live account that is not live yet, with its checklist.
  async function homes() {
    const rows = await db.prepare("SELECT id, slug, billing_status FROM workspaces WHERE kind = 'live' ORDER BY created_at DESC LIMIT 1000").all();
    const out = [];
    for (const r of rows) {
      const w = await ws.open(r.id); if (!w) continue;
      for (const p of w.state.properties || []) {
        const st = stateOf(p); if (st === 'live') continue;
        out.push({ w, r, p, st, check: w.BB.ready.check(p), business: (w.state.account || {}).business || r.slug });
      }
    }
    return out;
  }
  async function count() { return (await homes()).filter(x => x.st === 'review').length; }

  const bar = n => '<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;min-width:80px;height:8px;border-radius:99px;background:var(--line,#E3E7F5);overflow:hidden"><i style="display:block;height:100%;width:' + n + '%;background:' + (n === 100 ? 'var(--good,#1F9D63)' : 'var(--brand,#2747F5)') + '"></i></div><b class="num">' + n + '%</b></div>';
  const stepList = c => '<div class="adm-list">' + c.steps.filter(x => !x.optional).map(x => '<div><span><b>' + E(x.title) + '</b><small>' + E(x.why) + '</small></span>' +
    A.pill(x.done ? 'good' : x.who === 'host' ? 'bad' : 'warn', x.done ? 'Done' : x.who === 'host' ? 'Host only' : 'We can do this') + '</div>').join('') + '</div>';

  function reviewCard(x) {
    const { w, p, check: c } = x, faqs = (((w.state.website || {}).faqs || {})[p.id] || []).map(f => f.replace('|', ' | ')).join('\n');
    const seo = p.seo || {}, act = '/admin/sites/' + E(w.id) + '/' + encodeURIComponent(p.id);
    const note = String((p.launch || {}).note || '').trim();
    return A.card(p.name, E(x.business) + ' · asked ' + ago((p.launch || {}).requestedAt) + ' · ' + c.pct + '% done',
      (note ? '<p class="adm-help" style="margin:0 0 12px"><b>Their note:</b> ' + E(note) + '</p>' : '') +
      '<div class="adm-inline" style="margin-bottom:12px"><a class="btn sm" href="' + E(urls.site(w, p)) + '" target="_blank" rel="noopener">' + A.icon('out') + 'Preview the site</a><a class="btn sm ghost" href="/admin/hosts/' + E(w.id) + '">' + A.icon('home') + 'Their account</a></div>' +
      '<div class="adm-cols"><div>' + stepList(c) + '</div>' +
      '<form class="adm-form" method="post" action="' + act + '/save">' +
        '<small class="adm-help">Write from their facts: ' + E([p.area, (p.amenities || []).slice(0, 6).join(', ')].filter(Boolean).join(' · ')) + '. Keep it true, plain and specific.</small>' +
        A.field('headline', p.headline, 'Headline', { ph: 'A larch cabin with a hot tub above Ambleside' }) + A.field('sub', p.sub, 'Subheading', { ph: 'Sleeps 4 · dogs welcome · 10 minutes walk to the lake' }) +
        A.field('about', p.about, 'About this home, 60 words or more', { area: true }) +
        A.field('summary', seo.summary, 'Answer-first summary for AI search (80 characters or more)', { area: true }) +
        A.field('faqs', faqs, 'FAQs, one per line: question | answer (3 or more)', { area: true }) +
        A.field('hostNote', p.hostNote, 'A line from the host (optional)') +
        '<div class="row"><button class="btn sm" name="then" value="save">Save</button><button class="btn sm primary" name="then" value="publish">Save and publish</button></div></form>' +
      '<details class="adm-x" style="margin-top:10px"><summary>Send it back to the host</summary><form class="adm-form" method="post" action="' + act + '/return">' +
        A.field('note', '', 'What they need to do (emailed to them and shown in their console)', { area: true, req: true }) + '<button class="btn sm">Send back</button></form></details></div>');
  }

  async function page(res, note, err) {
    const all = await homes(), queue = all.filter(x => x.st === 'review').sort((a, b) => String((a.p.launch || {}).requestedAt).localeCompare(String((b.p.launch || {}).requestedAt)));
    const building = all.filter(x => x.st === 'building').sort((a, b) => b.check.pct - a.check.pct);
    const row = x => '<tr><td><b>' + E(x.p.name) + '</b><small><a href="/admin/hosts/' + E(x.w.id) + '">' + E(x.business) + '</a></small></td><td style="min-width:160px">' + bar(x.check.pct) + '</td>' +
      '<td class="wrap">' + E(x.check.left.map(s => s.title).join(', ') || 'Ready, waiting for them to press Go live') + '</td><td>' + (x.check.canAskTeam ? A.pill('info', 'Can hand to us') : A.pill('muted', 'Host steps left')) + '</td><td class="num">' + ago((x.p.launch || {}).since) + '</td></tr>';
    const body = '<div class="adm-kpis">' + A.kpi('Waiting for the team', queue.length, '', queue.length ? 'oldest first' : 'All clear') + A.kpi('Still building', building.length, '', 'hosts working through the checklist') +
      A.kpi('Ready to go live', building.filter(x => x.check.complete).length, '', 'all steps done, not published yet') + '</div>' +
      (queue.length ? '<div class="adm-stack">' + queue.map(reviewCard).join('') + '</div>' : '<div class="a-empty">' + A.icon('check') + '<p>No sites waiting for the team. Hosts hand theirs over from Website &amp; SEO when they get stuck.</p></div>') +
      '<section class="a-card a-flush" style="margin-top:18px"><div class="a-card-h" style="padding:18px 20px 0"><h3>Still building</h3><div class="a-card-m">' + building.length + ' homes</div></div>' +
      A.table(['Home', 'Done', 'Still to do', '', 'Started'], building.map(row), 'No sites being built right now.') + '</section>';
    return send(res, 200, A.shell({ email: await email(), title: 'Sites to finish', active: 'sites', note, err,
      sub: 'New sites stay offline until their checklist is done. Hosts hand a site to us once they have done the parts only they can do; we write and polish the words, then publish. Aim for about 15 minutes a site.', body }), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
  }

  async function post(req, res, wid, pid, what) {
    const f = await formBody(req), w = await ws.open(wid), p = w && (w.state.properties || []).find(x => x.id === pid);
    if (!p) return page(res, '', 'That site was not found.');
    if (what === 'return') {
      if (!String(f.note || '').trim()) return page(res, '', 'Add a note so the host knows what to do.');
      const r = await ws.withWs(wid, BB => BB.act.teamReturn(pid, f.note));
      return r && r.ok ? redirect(res, '/admin/sites?done=returned') : page(res, '', (r && r.error) || 'Could not send it back.');
    }
    const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
    const r = await ws.withWs(wid, BB => {
      BB.act.updateProperty(pid, { headline: clip(f.headline, 120), sub: clip(f.sub, 200), about: clip(f.about, 4000), hostNote: clip(f.hostNote, 200) }, true);
      BB.act.updateSeo(pid, { summary: clip(f.summary, 600) });
      const s = BB.store.get(); s.website.faqs = s.website.faqs || {};
      s.website.faqs[pid] = lines(f.faqs).map(l => { const i = l.indexOf('|'); return i < 0 ? '' : clip(l.slice(0, i), 200) + '|' + clip(l.slice(i + 1), 800); }).filter(l => l && !l.startsWith('|') && !l.endsWith('|')).slice(0, 20);
      BB.log('site', 'Bookingbooster team', 'Polished the words on ' + BB.q.property(pid).name + '.', pid, ['Website', 'Bookingbooster team']);
      const out = f.then === 'publish' ? BB.act.teamLaunch(pid) : { ok: true, saved: true };
      BB.store.commit({ type: 'property', id: pid });
      return out;
    });
    if (!r || !r.ok) return page(res, 'Saved.', 'Not published yet. ' + ((r && r.error) || ''));
    return redirect(res, '/admin/sites?done=' + (r.saved ? 'saved' : 'published'));
  }

  async function route(req, res, p, m, u) {
    if (p === '/admin/sites' && m === 'GET') { const d = u.searchParams.get('done'); return page(res, { saved: 'Saved.', published: 'Published. The host gets their "site is live" email.', returned: 'Sent back to the host.' }[d] || ''); }
    const mm = p.match(/^\/admin\/sites\/([A-Za-z0-9_-]+)\/([^/]+)\/(save|return)$/);
    if (mm && m === 'POST') return post(req, res, mm[1], decodeURIComponent(mm[2]), mm[3]);
    return false;
  }
  return { route, count, homes };
};
