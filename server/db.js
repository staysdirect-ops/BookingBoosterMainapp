// Postgres storage. In production this is Supabase (DATABASE_URL, or SUPABASE_DB_URL inside Supabase).
// Without one, an embedded Postgres (PGlite) keeps the data in DATA_DIR/pg, for local runs and tests.
// Queries keep the small prepare(sql).get/all/run shape the rest of the server uses, but every call returns a promise.
'use strict';
const SCHEMA = require('./schema');

// Primary keys for INSERT OR REPLACE (SQLite) -> ON CONFLICT ... DO UPDATE (Postgres)
const PK = { payments: ['id'], kv: ['k'], secrets: ['workspace_id', 'name'], lead_seq: ['lead_id'], lead_optout: ['email'], domains: ['host'] };
const SERIAL = new Set(['outbox', 'leads']);

function translate(sql) {
  let s = sql.trim();
  // lower() both sides wherever SQLite compared without case
  s = s.replace(/([a-z_]+(?:\.[a-z_]+)?)\s*=\s*\?\s+COLLATE NOCASE/gi, 'lower($1) = lower(?)');
  let m;
  if ((m = s.match(/^INSERT OR IGNORE INTO\s+([a-z_]+)/i))) s = s.replace(/^INSERT OR IGNORE INTO/i, 'INSERT INTO') + ' ON CONFLICT DO NOTHING';
  else if ((m = s.match(/^INSERT OR REPLACE INTO\s+([a-z_]+)\s*\(([^)]*)\)/i))) {
    const table = m[1], cols = m[2].split(',').map(c => c.trim()), pk = PK[table];
    if (!pk) throw new Error('No primary key known for ' + table);
    const upd = cols.filter(c => !pk.includes(c)).map(c => c + ' = excluded.' + c).join(', ');
    s = s.replace(/^INSERT OR REPLACE INTO/i, 'INSERT INTO') + ' ON CONFLICT (' + pk.join(', ') + ') DO ' + (upd ? 'UPDATE SET ' + upd : 'NOTHING');
  }
  const ins = s.match(/^INSERT INTO\s+([a-z_]+)/i);
  if (ins && SERIAL.has(ins[1]) && !/RETURNING/i.test(s)) s += ' RETURNING id';
  let i = 0; s = s.replace(/\?/g, () => '$' + (++i));
  return s;
}

function wrap(driver) {
  const cache = new Map();
  const db = {
    driver,
    prepare(sql) {
      let text = cache.get(sql); if (!text) cache.set(sql, text = translate(sql));
      const q = (args) => driver.query(text, args.map(a => (a === undefined ? null : a)));
      return {
        async get(...a) { const r = await q(a); return r.rows[0]; },
        async all(...a) { const r = await q(a); return r.rows; },
        async run(...a) { const r = await q(a); return { changes: r.rowCount, lastInsertRowid: r.rows[0] && r.rows[0].id != null ? Number(r.rows[0].id) : undefined }; },
      };
    },
    exec: sql => driver.exec(sql),
    // Run fn(db) inside one transaction (all or nothing).
    tx: fn => driver.tx ? driver.tx(d => fn(wrap(d))) : fn(db),
    close: () => driver.close && driver.close(),
    ready: null,
  };
  return db;
}

// Embedded Postgres for local runs and tests (Node only).
function pglite(dir) {
  const { PGlite } = require('@electric-sql/pglite');
  const pg = new PGlite(dir || undefined);
  const driver = {
    query: async (text, params) => { const r = await pg.query(text, params); return { rows: r.rows, rowCount: r.affectedRows != null ? r.affectedRows : r.rows.length }; },
    exec: sql => pg.exec(sql),
    close: () => pg.close(),
    raw: pg,
  };
  return driver;
}

// postgres.js client (Supabase). `postgres` is the module's default export, passed in so Node and Deno can each load it.
function pgjs(postgres, url) {
  if (typeof postgres !== 'function' && postgres.default) postgres = postgres.default;
  const sql = postgres(url, { prepare: false, max: +(process.env.PG_MAX || 3), idle_timeout: 20, types: { bigint: { to: 20, from: [20], serialize: x => String(x), parse: x => Number(x) } } });
  const mk = s => ({
    query: async (text, params) => { const r = await s.unsafe(text, params); return { rows: Array.from(r), rowCount: r.count }; },
    exec: text => s.unsafe(text),
  });
  return Object.assign(mk(sql), { tx: fn => sql.begin(t => fn(mk(t))), close: () => sql.end() });
}

function open(opts) {
  const driver = opts.driver || pglite(opts.dir);
  const db = wrap(driver);
  db.ready = opts.migrate === false ? Promise.resolve() : Promise.resolve(driver.exec(SCHEMA));
  return db;
}

module.exports = { open, pglite, pgjs, translate };
