// Starts the real server on a spare port with a throwaway data folder, and keeps one host session cookie.
'use strict';
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// Starts the server. Normally plain Node. With BB_DENO=1 it runs the Supabase function under Deno instead,
// on a fresh Postgres (PGlite over a socket), behind a pass-through that does what supabase/20i/index.php does.
function spawnServer({ port, base, data, env }) {
  const cwd = path.join(__dirname, '..');
  const full = Object.assign({}, process.env, { PORT: String(port), BASE_URL: base, DATA_DIR: data, TEST_SQL: '1', STRIPE_SECRET_KEY: '', RESEND_API_KEY: '', POSTMARK_TOKEN: '', TWILIO_ACCOUNT_SID: '' }, env);
  if (!process.env.BB_DENO) {
    const proc = spawn(process.execPath, ['server/index.js'], { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: full });
    proc.stderr.on('data', d => process.stderr.write(d)); if (process.env.BB_LOG) proc.stdout.on('data', d => process.stderr.write(d));
    return { stop: () => proc.kill() };
  }
  const http = require('node:http');
  const pgPort = port + 20000 > 65000 ? port - 15000 : port + 20000, fnPort = pgPort + 1, key = 'local-proxy-key';
  const bin = n => path.join(cwd, 'node_modules', '.bin', n);
  const pg = spawn(bin('pglite-server'), ['--port=' + pgPort, '--max-connections=1'], { stdio: 'ignore' });
  let fn = null, front = null;
  const ready = (async () => {
    let postgres = require('postgres'); postgres = postgres.default || postgres;
    for (let i = 0; ; i++) { try { const sql = postgres('postgres://postgres:postgres@127.0.0.1:' + pgPort + '/postgres', { prepare: false, max: 1, onnotice: () => {} }); await sql.unsafe(require('../server/schema')); await sql.end(); break; } catch (e) { if (i > 40) throw e; await new Promise(r => setTimeout(r, 250)); } }
    fn = spawn('deno', ['run', '-A', '--node-modules-dir=none', 'supabase/functions/bb/index.ts'], { cwd, stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, full, { DATABASE_URL: 'postgres://postgres:postgres@127.0.0.1:' + pgPort + '/postgres', PG_MAX: '1', PROXY_KEY: key, BB_LOCAL_PORT: String(fnPort), APP_SECRET: 'test-secret' }) });
    fn.stderr.on('data', d => process.stderr.write(d)); if (process.env.BB_LOG) fn.stdout.on('data', d => process.stderr.write(d));
    front = http.createServer((q, s) => {
      const chunks = []; q.on('data', c => chunks.push(c)); q.on('end', async () => {
        const h = Object.assign({}, q.headers); for (const k of Object.keys(h)) if (k.startsWith('x-bb-')) delete h[k];
        Object.assign(h, { 'x-bb-proxy': key, 'x-bb-host': q.headers.host, 'x-bb-ip': '127.0.0.1', 'x-bb-proto': 'http' }); delete h.host; delete h['content-length'];
        try {
          const r = await fetch('http://127.0.0.1:' + fnPort + '/bb' + q.url, { method: q.method, headers: h, body: ['GET', 'HEAD'].includes(q.method) ? undefined : Buffer.concat(chunks), redirect: 'manual' });
          const out = {}; r.headers.forEach((v, k) => { if (!['content-length', 'content-encoding', 'transfer-encoding', 'x-bb-type', 'set-cookie'].includes(k)) out[k] = v; });
          if (r.headers.get('x-bb-type')) out['content-type'] = r.headers.get('x-bb-type');
          const cookies = r.headers.getSetCookie(); if (cookies.length) out['set-cookie'] = cookies;
          s.writeHead(r.status, out); s.end(Buffer.from(await r.arrayBuffer()));
        } catch (e) { s.writeHead(502); s.end(String(e.message)); }
      });
    }).listen(port);
  })().catch(e => process.stderr.write('deno start failed: ' + e.message + '\n'));
  return { ready, stop: () => { try { front && front.close(); } catch (_) {} fn && fn.kill(); pg.kill(); } };
}

const start = module.exports = async function start(env = {}) {
  const port = 20000 + Math.floor(Math.random() * 20000);
  const base = 'http://localhost:' + port;
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bb-test-'));
  const srv = spawnServer({ port, base, data, env }); await srv.ready;
  let cookie = '';
  async function call(p, opts = {}) {
    const r = await fetch(base + p, Object.assign({ redirect: 'manual', headers: Object.assign({ 'content-type': 'application/json', cookie }, opts.headers || {}) }, opts.body !== undefined ? { method: 'POST', body: typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body) } : {}, opts.method ? { method: opts.method } : {}));
    const set = r.headers.get('set-cookie'); if (set && /bb_s=/.test(set)) cookie = set.split(';')[0];
    const type = r.headers.get('content-type') || ''; const body = type.includes('json') ? await r.json() : await r.text();
    return { status: r.status, body, headers: r.headers };
  }
  const until = async (fn, ms = 5000) => { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await new Promise(r => setTimeout(r, 150)); } };
  await until(async () => { try { return (await fetch(base + '/healthz')).ok; } catch (_) { return false; } }, 30000);
  const act = (name, ...args) => call('/api/act', { body: { name, args } });
  async function signup(extra = {}) {
    return call('/api/signup', { body: Object.assign({ plan: 'Growth', account: { name: 'Test Host', business: 'Test Stays', email: 'host@example.co.uk', password: 'correcthorse1' },
      property: { name: 'Gull Cottage', theme: 'lake', nightly: 140, maxGuests: 4, bedrooms: 2, area: 'Whitby, North Yorkshire' } }, extra) });
  }
  async function home() { const boot = (await call('/api/state')).body; const p = boot.state.properties[0]; const url = boot.siteUrls[p.id]; return { p, url, slug: new URL(url).pathname.split('/')[2], state: boot.state }; }
  // Runs SQL on the test server's database (Postgres syntax, ? for each argument).
  const sql = async (q, ...args) => { const r = await fetch(base + '/test/sql', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ q, args }) }); const j = await r.json(); if (!r.ok) throw new Error(j.error || 'SQL failed'); return j.rows; };
  const dateIn = n => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  function stop() { srv.stop(); fs.rmSync(data, { recursive: true, force: true }); }
  return { base, port, data, call, act, until, signup, home, dateIn, stop, sql, get cookie() { return cookie; } };
};

module.exports.spawnServer = spawnServer;
