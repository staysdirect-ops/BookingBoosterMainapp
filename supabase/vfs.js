// A read-only stand-in for node:fs inside the Supabase function. The files the server reads at run time
// (web/src, email templates, icons) are embedded in the bundle by build.js; anything else falls through to the real fs.
'use strict';
const real = require('node:fs');
const FILES = require('bb-embedded-files'); // { '/app/web/src/app.js': { t: 'text' } | { b: 'base64' } }
const cache = new Map();
const norm = p => String(p).replace(/\/+$/, '');
function data(p) {
  const k = norm(p), f = FILES[k]; if (!f) return null;
  if (!cache.has(k)) cache.set(k, f.t != null ? Buffer.from(f.t, 'utf8') : Buffer.from(f.b, 'base64'));
  return cache.get(k);
}
const isDir = p => { const k = norm(p) + '/'; return Object.keys(FILES).some(f => f.startsWith(k)); };
const enoent = p => Object.assign(new Error('ENOENT: no such file, ' + p), { code: 'ENOENT' });
module.exports = Object.assign({}, real, {
  existsSync: p => !!data(p) || isDir(p) || (!String(p).startsWith('/app/') && real.existsSync(p)),
  readFileSync(p, enc) {
    const d = data(p); if (!d) { if (String(p).startsWith('/app/')) throw enoent(p); return real.readFileSync(p, enc); }
    const e = typeof enc === 'string' ? enc : enc && enc.encoding; return e ? d.toString(e) : d;
  },
  statSync(p) {
    const d = data(p); if (d) return { isFile: () => true, isDirectory: () => false, size: d.length, mtimeMs: 0 };
    if (isDir(p)) return { isFile: () => false, isDirectory: () => true, size: 0, mtimeMs: 0 };
    if (String(p).startsWith('/app/')) throw enoent(p); return real.statSync(p);
  },
  readdirSync(p) {
    const k = norm(p) + '/'; const names = new Set();
    for (const f of Object.keys(FILES)) if (f.startsWith(k)) names.add(f.slice(k.length).split('/')[0]);
    if (names.size || String(p).startsWith('/app/')) return [...names].sort(); return real.readdirSync(p);
  },
});
