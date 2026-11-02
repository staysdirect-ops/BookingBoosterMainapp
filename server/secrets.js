// Per-host credentials (for example a Nuki API token). Kept out of the workspace state the browser sees,
// encrypted at rest with a key derived from the server secret.
'use strict';
const crypto = require('crypto');
module.exports = function (db, cfg) {
  const key = crypto.createHash('sha256').update('bb-secrets:' + cfg.secret).digest();
  const q = {
    get: db.prepare('SELECT value FROM secrets WHERE workspace_id = ? AND name = ?'),
    set: db.prepare('INSERT INTO secrets (workspace_id, name, value, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (workspace_id, name) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'),
    del: db.prepare('DELETE FROM secrets WHERE workspace_id = ? AND name = ?'),
  };
  function seal(text) { const iv = crypto.randomBytes(12); const c = crypto.createCipheriv('aes-256-gcm', key, iv); const enc = Buffer.concat([c.update(String(text), 'utf8'), c.final()]); return Buffer.concat([iv, c.getAuthTag(), enc]).toString('base64'); }
  function open(b64) { const b = Buffer.from(b64, 'base64'); const d = crypto.createDecipheriv('aes-256-gcm', key, b.subarray(0, 12)); d.setAuthTag(b.subarray(12, 28)); return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8'); }
  return {
    async get(wid, name) { const r = await q.get.get(wid, name); if (!r) return null; try { return open(r.value); } catch (_) { return null; } },
    set(wid, name, value) { return q.set.run(wid, name, seal(value), Date.now()); },
    del(wid, name) { return q.del.run(wid, name); },
  };
};
