// Backups. dump() returns every table as JSON (the /admin/backup download). Locally, run() also keeps a daily
// copy in DATA_DIR/backups, newest BACKUP_KEEP kept. On Supabase, the platform's own database backups apply too.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const TABLES = ['workspaces', 'users', 'sessions', 'domains', 'outbox', 'leads', 'payments', 'secrets', 'resets', 'lead_seq', 'lead_optout', 'kv'];

module.exports = function ({ db, cfg, log }) {
  const dir = path.join(cfg.dataDir, 'backups');
  async function dump() {
    const out = { exportedAt: new Date().toISOString(), tables: {} };
    for (const t of TABLES) out.tables[t] = await db.prepare('SELECT * FROM ' + t).all();
    return out;
  }
  const list = () => fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^bookingbooster-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort() : [];
  async function run(now = Date.now()) {
    const day = new Date(now).toISOString().slice(0, 10), name = 'bookingbooster-' + day + '.json', f = path.join(dir, name);
    if (fs.existsSync(f)) return null;
    fs.mkdirSync(dir, { recursive: true });
    const tmp = f + '.part'; fs.writeFileSync(tmp, JSON.stringify(await dump()), { mode: 0o600 }); fs.renameSync(tmp, f);
    const all = list(); for (const old of all.slice(0, Math.max(0, all.length - cfg.backupKeep))) fs.rmSync(path.join(dir, old), { force: true });
    log('backup', name, Math.round(fs.statSync(f).size / 1024) + ' KB');
    return name;
  }
  const latest = () => { const all = list(); return all.length ? path.join(dir, all[all.length - 1]) : null; };
  return { run, list, latest, dump, TABLES };
};
