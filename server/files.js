// Stored files: guests' ID photos (uploads/<workspace>/...) and hosts' photos (media/<workspace>/<home>/...).
// On Supabase they live in a private Storage bucket; locally they are files under DATA_DIR.
// Every call returns a promise. Keys use forward slashes, for example "media/w_1/p_2/ab12.jpg".
'use strict';

function disk(root) {
  const fs = require('fs'), path = require('path');
  const full = k => { const f = path.normalize(path.join(root, k)); if (!f.startsWith(path.resolve(root) + path.sep)) throw new Error('Bad file key'); return f; };
  return {
    async put(k, buf) { const f = full(k); fs.mkdirSync(path.dirname(f), { recursive: true, mode: 0o700 }); fs.writeFileSync(f, buf, { mode: 0o600 }); },
    async get(k) { const f = full(k); try { return fs.statSync(f).isFile() ? fs.readFileSync(f) : null; } catch (_) { return null; } },
    async list(prefix) { const d = full(prefix.replace(/\/$/, '')); try { return fs.readdirSync(d).map(n => prefix.replace(/\/?$/, '/') + n); } catch (_) { return []; } },
    async del(k) { fs.rmSync(full(k), { force: true }); },
    async delPrefix(prefix) { fs.rmSync(full(prefix.replace(/\/$/, '')), { recursive: true, force: true }); },
  };
}

// Supabase Storage over its REST API, with the service role key (never sent to browsers).
function supabase(url, key, bucket) {
  const base = url.replace(/\/$/, '') + '/storage/v1';
  const h = extra => Object.assign(/^sb_/.test(key) ? { apikey: key } : { authorization: 'Bearer ' + key, apikey: key }, extra || {});
  const enc = k => k.split('/').map(encodeURIComponent).join('/');
  async function call(method, p, body, headers) {
    const r = await fetch(base + p, { method, headers: h(headers), body });
    if (!r.ok && r.status !== 404 && r.status !== 400) throw new Error('Storage ' + method + ' ' + r.status + ': ' + (await r.text()).slice(0, 200));
    return r;
  }
  async function list(prefix) {
    const dir = prefix.replace(/\/$/, ''), out = [];
    for (let offset = 0; ; offset += 1000) {
      const r = await call('POST', '/object/list/' + bucket, JSON.stringify({ prefix: dir + '/', limit: 1000, offset }), { 'content-type': 'application/json' });
      const rows = r.ok ? await r.json() : [];
      for (const x of rows) out.push(dir + '/' + x.name + (x.id ? '' : '/'));
      if (rows.length < 1000) return out;
    }
  }
  return {
    async put(k, buf, type) { await call('POST', '/object/' + bucket + '/' + enc(k), buf, { 'content-type': type || 'application/octet-stream', 'x-upsert': 'true' }); },
    async get(k) { const r = await call('GET', '/object/authenticated/' + bucket + '/' + enc(k)); return r.ok ? Buffer.from(await r.arrayBuffer()) : null; },
    list: async prefix => (await list(prefix)).filter(k => !k.endsWith('/')),
    async del(k) { await call('DELETE', '/object/' + bucket, JSON.stringify({ prefixes: [k] }), { 'content-type': 'application/json' }); },
    async delPrefix(prefix) {
      const walk = async p => { let keys = []; for (const k of await list(p)) keys = keys.concat(k.endsWith('/') ? await walk(k) : [k]); return keys; };
      const keys = await walk(prefix);
      for (let i = 0; i < keys.length; i += 500) await call('DELETE', '/object/' + bucket, JSON.stringify({ prefixes: keys.slice(i, i + 500) }), { 'content-type': 'application/json' });
    },
  };
}

module.exports = cfg => cfg.storage && cfg.storage.url ? supabase(cfg.storage.url, cfg.storage.key, cfg.storage.bucket) : disk(cfg.dataDir);
