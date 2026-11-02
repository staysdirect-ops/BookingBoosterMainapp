// Runs the shared business rules (web/src/store.js + store-ext.js) on the server, one sandbox per workspace.
// The same code runs in the browser for instant feedback; the server's result is the one that is saved.
'use strict';
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..', 'web', 'src');
const code = ['store.js', 'store-ext.js'].map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
// The rules run inside a function whose parameters stand in for the browser globals they look for, so they see
// their own window and nothing of the server (no storage, no network). A plain function, rather than node:vm,
// because Supabase's Edge Runtime does not support vm.Script.
const SHADOW = ['localStorage', 'sessionStorage', 'BroadcastChannel', 'document', 'navigator', 'location', 'fetch', 'XMLHttpRequest', 'WebSocket', 'process', 'require', 'Deno', 'globalThis', 'self', 'global'];
const PARAMS = ['window', '__BB_BOOT__', 'console', 'Date', 'Math', 'JSON', 'Intl', 'setTimeout', 'clearTimeout'].concat(SHADOW);
const rules = new Function(...PARAMS, code + '\n//# sourceURL=bb-rules.js');

// Keys an action may never receive (prototype pollution through Object.assign patches).
function clean(v, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(v)) return v.slice(0, 500).map(x => clean(x, depth + 1));
  if (v && typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue; o[k] = clean(v[k], depth + 1); }
    return o;
  }
  if (typeof v === 'string') return v.slice(0, 20000);
  return v;
}

function sandbox(state) {
  const ctx = { console, Date, Math, JSON, Intl, setTimeout: () => 0, clearTimeout: () => {} };
  ctx.window = ctx;
  ctx.__BB_BOOT__ = { state };
  rules.call(ctx, ctx, ctx.__BB_BOOT__, console, Date, Math, JSON, Intl, ctx.setTimeout, ctx.clearTimeout, ...SHADOW.map(() => undefined));
  return ctx.BB;
}

// Fresh seeds, built with the same code.
function seedDemo() { const BB = sandbox(null); const s = BB.seedDemo(); s.demo = true; return JSON.parse(JSON.stringify(s)); }
function seedBlank(o) { const BB = sandbox(null); return JSON.parse(JSON.stringify(BB.seedBlank(o))); }

// London wall clock for live workspaces.
function londonNow() {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  const p = Object.fromEntries(f.formatToParts(new Date()).map(x => [x.type, x.value]));
  return { today: p.year + '-' + p.month + '-' + p.day, clock: (p.hour === '24' ? '00' : p.hour) + ':' + p.minute };
}

class Workspace {
  constructor(id, state) { this.id = id; this.BB = sandbox(state); }
  get state() { return this.BB.store.get(); }
  // Live workspaces follow the real calendar: roll forward day by day (checkouts, reminders, scheduled campaigns run).
  catchUp() {
    const s = this.state; if (!s.live) return false;
    const now = londonNow(); let rolled = false, guard = 0;
    while (s.today < now.today && guard++ < 400) { this.BB.act.nextDay(); rolled = true; }
    s.clock = now.clock;
    return rolled;
  }
  run(name, args) {
    const fn = this.BB.act[name];
    if (typeof fn !== 'function') { const e = new Error('Unknown action: ' + name); e.status = 400; throw e; }
    this.catchUp();
    const result = fn.apply(null, clean(args || []));
    return JSON.parse(JSON.stringify(result === undefined ? null : result, (k, v) => typeof v === 'function' ? undefined : v));
  }
  drainEffects() { const s = this.state; const fx = s._fx || []; s._fx = []; return fx; }
  json() { const s = this.state; const fx = s._fx; delete s._fx; const out = JSON.stringify(s); if (fx && fx.length) s._fx = fx; return out; }
}

module.exports = { Workspace, seedDemo, seedBlank, londonNow, clean };
