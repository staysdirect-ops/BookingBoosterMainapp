// Workspace store: keeps a warm rules sandbox per workspace, saves every change to SQLite,
// pushes live updates to open browsers (server-sent events) and hands side effects to effects.js.
'use strict';
const crypto = require('crypto');
const { Workspace, seedDemo, seedBlank, londonNow } = require('./engine');

module.exports = function (db, cfg) {
  const cache = new Map();          // id -> Workspace
  const streams = new Map();        // id -> Set(res)
  let onEffects = () => {};
  const now = () => Date.now();
  const id = p => p + '_' + crypto.randomBytes(9).toString('base64url');

  const q = {
    get: db.prepare('SELECT * FROM workspaces WHERE id = ?'),
    bySlug: db.prepare('SELECT * FROM workspaces WHERE slug = ?'),
    insert: db.prepare('INSERT INTO workspaces (id, kind, state, version, slug, plan, created_at, updated_at, last_seen) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?)'),
    save: db.prepare('UPDATE workspaces SET state = ?, version = version + 1, updated_at = ?, last_seen = ? WHERE id = ? AND version = ?'),
    reset: db.prepare('UPDATE workspaces SET state = ?, version = version + 1, updated_at = ?, last_seen = ? WHERE id = ?'),
    ver: db.prepare('SELECT version FROM workspaces WHERE id = ?'),
    seen: db.prepare('UPDATE workspaces SET last_seen = ? WHERE id = ?'),
    del: db.prepare('DELETE FROM workspaces WHERE id = ?'),
    delDomains: db.prepare('DELETE FROM domains WHERE workspace_id = ?'),
    addHost: db.prepare('INSERT OR IGNORE INTO domains (host, workspace_id, property_id, verified) VALUES (?, ?, ?, ?)'),
    claimHost: db.prepare('UPDATE domains SET workspace_id = ?, property_id = ?, verified = ? WHERE host = ?'),
    unverify: db.prepare('UPDATE domains SET verified = 0 WHERE host = ?'),
    unverified: db.prepare("SELECT * FROM domains WHERE verified = 0"),
    delHost: db.prepare('DELETE FROM domains WHERE host = ?'),
    moveHost: db.prepare('UPDATE domains SET property_id = ? WHERE host = ?'),
    domain: db.prepare('SELECT * FROM domains WHERE host = ?'),
    live: db.prepare("SELECT id FROM workspaces WHERE kind = 'live'"),
    oldDemos: db.prepare("SELECT id FROM workspaces WHERE kind = 'demo' AND last_seen < ?"),
    set: db.prepare('UPDATE workspaces SET plan = COALESCE(?, plan), stripe_account = COALESCE(?, stripe_account), billing_status = COALESCE(?, billing_status), stripe_customer = COALESCE(?, stripe_customer) WHERE id = ?'),
    verify: db.prepare('UPDATE domains SET verified = 1 WHERE host = ? AND verified = 0'),
    domainsFor: db.prepare('SELECT * FROM domains WHERE workspace_id = ?'),
  };

  const row = wid => q.get.get(wid);
  // Several server instances can share the database, so a cached workspace is only reused while its version still matches.
  async function open(wid) {
    const r = await row(wid); if (!r) { cache.delete(wid); return null; }
    const doms = await q.domainsFor.all(wid);
    let w = cache.get(wid);
    if (w && w.version === r.version) { w.row = r; w.domains = doms; return w; }
    w = new Workspace(wid, JSON.parse(r.state)); w.kind = r.kind; w.slug = r.slug; w.version = r.version; w.row = r; w.domains = doms;
    cache.set(wid, w);
    if (cache.size > 300) { const k = cache.keys().next().value; if (k !== wid) cache.delete(k); }
    return w;
  }
  async function version(wid) { const r = await q.ver.get(wid); return r ? r.version : 0; }

  // Saves only if nobody else saved in between; otherwise throws so the caller can reload and retry.
  async function persist(w, meta) {
    const t = now();
    const r = await q.save.run(w.json(), t, t, w.id, w.version);
    if (!r.changes) { cache.delete(w.id); const e = new Error('Changed elsewhere'); e.conflict = true; throw e; }
    w.version += 1;
    if (w.kind === 'live') await syncDomains(w);
    const fx = w.drainEffects();
    broadcast(w.id, { v: w.version, meta: meta || {} });
    if (fx.length) pending.push(Promise.resolve().then(() => onEffects(w, fx)).catch(() => {}));
    return w.version;
  }
  async function syncDomains(w) {
    const want = new Map();
    for (const p of w.state.properties) {
      const host = String(p.domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
      if (host && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) && !isOurs(host)) want.set(host, p.id);
      if (cfg.sitesDomain) want.set(siteSub(w, p) + '.' + cfg.sitesDomain, p.id);
    }
    for (const d of await q.domainsFor.all(w.id)) if (!want.has(d.host)) await q.delHost.run(d.host);
    for (const [host, pid] of want) { const ex = await q.domain.get(host); if (!ex) await q.addHost.run(host, w.id, pid, isOurs(host) ? 1 : 0); else if (ex.workspace_id === w.id && ex.property_id !== pid) await q.moveHost.run(pid, host); }
    w.domains = await q.domainsFor.all(w.id);
  }
  // Free site addresses are ours, so they are live straight away. A host's own domain waits for its DNS check.
  const isOurs = host => !!cfg.sitesDomain && (host === cfg.sitesDomain || host.endsWith('.' + cfg.sitesDomain));
  const siteSub = (w, p) => (w.slug + '-' + p.id).replace(/[^a-z0-9-]/g, '-').slice(0, 60);

  // Run one action and save. Throws on unknown action; returns { result, version }.
  async function act(wid, name, args, meta) {
    for (let attempt = 0; ; attempt++) {
      const w = await open(wid); if (!w) { const e = new Error('Workspace not found'); e.status = 404; throw e; }
      try {
        const result = w.run(name, args);
        const v = await persist(w, Object.assign({ action: name }, meta || {}));
        return { result, version: v, w };
      } catch (e) { if (!e.conflict || attempt >= 3) throw e; }
    }
  }
  // Run code with direct access to the sandbox (used by webhooks and the scheduler).
  async function withWs(wid, fn, meta) {
    for (let attempt = 0; ; attempt++) {
      const w = await open(wid); if (!w) return null;
      try {
        w.catchUp();
        const r = fn(w.BB, w);
        await persist(w, meta);
        return r;
      } catch (e) { if (!e.conflict || attempt >= 3) throw e; }
    }
  }
  // Save a workspace that was rolled forward by catchUp() while reading (for example on a page view).
  async function saveIfRolled(w) { try { return await persist(w); } catch (e) { if (!e.conflict) throw e; } }

  async function slugFor(name) {
    const base = String(name || 'host').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'host';
    let s = base, n = 1; while (await q.bySlug.get(s)) s = base + '-' + (++n);
    return s;
  }
  async function createLive(o) {
    const wid = id('ws'); const t = londonNow();
    const state = seedBlank(Object.assign({}, o, t));
    await q.insert.run(wid, 'live', JSON.stringify(state), await slugFor(o.business), o.plan || 'Growth', now(), now(), now());
    return wid;
  }
  async function createDemo() {
    const wid = id('demo');
    await q.insert.run(wid, 'demo', JSON.stringify(seedDemo()), null, null, now(), now(), now());
    return wid;
  }
  async function resetDemo(wid) {
    const r = await row(wid); if (!r || r.kind !== 'demo') return false;
    cache.delete(wid); await q.reset.run(JSON.stringify(seedDemo()), now(), now(), wid);
    broadcast(wid, { v: await version(wid), meta: { reset: true } }); return true;
  }
  const touch = wid => q.seen.run(now(), wid);
  async function remove(wid) { cache.delete(wid); await q.del.run(wid); }
  async function cleanupDemos(days) { for (const r of await q.oldDemos.all(now() - days * 864e5)) { cache.delete(r.id); await q.del.run(r.id); } }
  // Side effects started by saves (emails, payments links). Callers that must finish before replying await this.
  const pending = [];
  async function settle() { while (pending.length) await pending.shift(); }
  // Work that may finish after the reply (emails). Serverless hosts keep the function alive until settle() resolves.
  const defer = (pr, label) => { pending.push(Promise.resolve(pr).catch(e => console.log('deferred', label || '', e && e.message))); };

  // ---------- server-sent events ----------
  function subscribe(wid, res) {
    let set = streams.get(wid); if (!set) streams.set(wid, set = new Set());
    set.add(res); res.on('close', () => set.delete(res));
  }
  function broadcast(wid, data) {
    const set = streams.get(wid); if (!set) return;
    const msg = 'data: ' + JSON.stringify(data) + '\n\n';
    for (const res of set) { try { res.write(msg); } catch (_) {} }
  }
  if (!cfg.serverless) { const t = setInterval(() => { for (const set of streams.values()) for (const res of set) { try { res.write(': ping\n\n'); } catch (_) {} } }, 25000); if (t.unref) t.unref(); }

  return {
    open, row, act, withWs, saveIfRolled, settle, defer, remove, persist, version, createLive, createDemo, resetDemo, touch, cleanupDemos, subscribe, broadcast, siteSub,
    domain: host => q.domain.get(String(host || '').toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')),
    bySlug: s => q.bySlug.get(s),
    liveIds: async () => (await q.live.all()).map(r => r.id),
    setMeta: (wid, m) => q.set.run(m.plan || null, m.stripe_account || null, m.billing_status || null, m.stripe_customer || null, wid),
    verifyDomain: host => q.verify.run(host),
    unverifyDomain: host => q.unverify.run(host),
    claimDomain: async (host, wid, pid) => { if (await q.domain.get(host)) await q.claimHost.run(wid, pid, 1, host); else await q.addHost.run(host, wid, pid, 1); },
    dropDomain: host => q.delHost.run(host),
    unverifiedDomains: () => q.unverified.all(),
    isOurs,
    domainsFor: wid => q.domainsFor.all(wid),
    onEffects: fn => { onEffects = fn; },
  };
};
