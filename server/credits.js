// AI credit. Every host plan includes a monthly AI allowance (£50 by default). Each AI action a host starts (reply drafts,
// the site builder, funnels) is charged at what the AI provider bills for it: tokens × the model's price, turned into
// pounds, times an optional markup. The allowance is used first and resets each billing month; top-ups bought through
// Stripe (£10 to £20,000) are used after it and never expire. When nothing is left, AI actions stop until the host tops up.
//
// Amounts are kept as whole units of 1/10,000 of a pound (0.01p), so a reply draft that costs a third of a penny still adds up.
'use strict';

const UNIT = 10000; // units per pound
const TOPUP_MIN = 10, TOPUP_MAX = 20000, TOPUP_PRESETS = [10, 25, 50, 100, 250, 500, 1000];

// US dollars per million tokens: [input, output, cache read]. Cache writes are billed at 1.25 × input.
// Unknown models are priced as the dearest one listed, so nothing is ever undercharged.
const PRICES = {
  'claude-fable-5-2': [8, 40, 0.2], 'claude-fable-5-1': [10, 50, 1], 'claude-fable-5': [10, 50, 1],
  'claude-opus-5-5': [4, 20, 0.2], 'claude-opus-5': [5, 25, 0.5], 'claude-opus-4-8': [5, 25, 0.5], 'claude-opus-4-7': [5, 25, 0.5], 'claude-opus-4-6': [5, 25, 0.5],
  'claude-sonnet-5-5': [2, 10, 0.1], 'claude-sonnet-5': [2, 10, 0.2], 'claude-sonnet-4-6': [3, 15, 0.3],
  'claude-haiku-5-5': [0.1, 0.5, 0.01], 'claude-haiku-4-5': [1, 5, 0.1],
};
const DEAREST = [10, 50, 1];
const priceOf = model => PRICES[String(model || '').replace(/-\d{8}$/, '')] || DEAREST;

const FEATURES = { reply: 'Reply drafts', studio: 'Site builder', funnel: 'Funnels', other: 'AI' };

module.exports = function ({ cfg, db, log }) {
  const C = cfg.credits;
  const q = {
    get: db.prepare('SELECT * FROM ai_credit WHERE workspace_id = ?'),
    ins: db.prepare('INSERT OR IGNORE INTO ai_credit (workspace_id, anchor, period, allowance, allowance_left, topup_left, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?)'),
    roll: db.prepare('UPDATE ai_credit SET period = ?, allowance = ?, allowance_left = ?, updated_at = ? WHERE workspace_id = ? AND period <> ?'),
    restart: db.prepare('UPDATE ai_credit SET anchor = ?, period = ?, allowance = ?, allowance_left = ?, updated_at = ? WHERE workspace_id = ?'),
    // The allowance pays first; whatever it cannot cover comes off the top-ups, which may dip below zero on the last action.
    spend: db.prepare('UPDATE ai_credit SET allowance_left = allowance_left - least(greatest(allowance_left, 0), ?), topup_left = topup_left - (? - least(greatest(allowance_left, 0), ?)), updated_at = ? WHERE workspace_id = ?'),
    ledger: db.prepare('INSERT INTO ai_ledger (workspace_id, kind, amount, feature, model, tokens_in, tokens_out, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'),
    hasRef: db.prepare('SELECT id FROM ai_ledger WHERE ref = ?'),
    recent: db.prepare('SELECT kind, amount, feature, model, tokens_in, tokens_out, created_at FROM ai_ledger WHERE workspace_id = ? ORDER BY created_at DESC, id DESC LIMIT ?'),
    usedSince: db.prepare("SELECT feature, count(*) AS n, coalesce(sum(amount), 0) AS total FROM ai_ledger WHERE workspace_id = ? AND kind = 'use' AND created_at >= ? GROUP BY feature"),
    ws: db.prepare('SELECT kind, billing_status, created_at FROM workspaces WHERE id = ?'),
  };

  // The billing month: counted from the day the plan started (the anchor), like Stripe counts it.
  function monthStart(anchor, n) {
    const a = new Date(+anchor), y = a.getUTCFullYear(), m = a.getUTCMonth() + n;
    const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(a.getUTCDate(), last), a.getUTCHours(), a.getUTCMinutes(), a.getUTCSeconds());
  }
  function periodOf(anchor, now) {
    const a = new Date(+anchor), t = new Date(now);
    let n = (t.getUTCFullYear() - a.getUTCFullYear()) * 12 + t.getUTCMonth() - a.getUTCMonth();
    if (monthStart(anchor, n) > now) n--;
    n = Math.max(0, n);
    return { n, start: monthStart(anchor, n), end: monthStart(anchor, n + 1) };
  }
  // How much the plan includes this month, by billing status. Paid plans get the full allowance; a host who has not
  // paid yet gets a small starter amount so they can try the AI; a cancelled plan gets none (top-ups still work).
  async function allowanceFor(wid) {
    const r = await q.ws.get(wid); if (!r) return 0;
    if (r.kind !== 'live') return C.demo;
    if (!cfg.stripe.key) return C.monthly; // card billing off (local runs, self-hosting): treat as paid
    const st = r.billing_status;
    if (st === 'active' || st === 'past_due') return C.monthly;
    if (st === 'cancelled') return 0;
    return C.unpaid;
  }
  const units = pounds => Math.round(Number(pounds) * UNIT);
  const num = v => Number(v || 0);

  // The workspace's row, rolled over to the current billing month.
  async function load(wid, now) {
    now = now || Date.now();
    let r = await q.get.get(wid);
    if (!r) {
      const w = await q.ws.get(wid); const anchor = num(w && w.created_at) || now;
      const a = units(await allowanceFor(wid));
      await q.ins.run(wid, anchor, String(periodOf(anchor, now).n), a, a, now);
      r = await q.get.get(wid);
    }
    const p = periodOf(num(r.anchor), now);
    if (String(p.n) !== String(r.period)) {
      const a = units(await allowanceFor(wid));
      await q.roll.run(String(p.n), a, a, now, wid, String(p.n));
      r = await q.get.get(wid);
    }
    return { row: r, period: p };
  }

  async function summary(wid, now) {
    const { row, period } = await load(wid, now);
    const allowance = num(row.allowance), allowanceLeft = num(row.allowance_left), topup = num(row.topup_left);
    const used = await q.usedSince.all(wid, period.start);
    const byFeature = used.map(u => ({ feature: u.feature, name: FEATURES[u.feature] || u.feature, count: num(u.n), pounds: num(u.total) / UNIT }));
    const balance = Math.max(0, allowanceLeft) + topup;
    return {
      balance: Math.max(0, balance) / UNIT, included: allowance / UNIT, includedLeft: Math.max(0, allowanceLeft) / UNIT, topup: topup / UNIT,
      usedThisMonth: byFeature.reduce((a, x) => a + x.pounds, 0), byFeature, resetsAt: period.end, periodStart: period.start,
      empty: balance <= 0, low: balance > 0 && balance < units(C.lowWarning), markup: C.markup,
    };
  }

  // Pounds, for display: £12.34, or 0.4p for tiny amounts.
  const money = p => { p = Number(p) || 0; if (p !== 0 && Math.abs(p) < 0.01) return (p * 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '') + 'p'; return (p < 0 ? '-£' : '£') + Math.abs(p).toFixed(2); };

  // Called before any AI action: throws a 402 with a clear message when the balance has run out.
  async function check(wid) {
    if (!C.enabled) return;
    const s = await summary(wid);
    if (s.empty) {
      const e = new Error('Your AI credit has run out. Top up from £' + TOPUP_MIN + ' in Plan and billing to keep using the AI tools' + (s.included ? ' (your £' + s.included.toFixed(0) + ' monthly allowance comes back on ' + new Date(s.resetsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Europe/London' }) + ')' : '') + '.');
      e.status = 402; e.code = 'ai_credit'; e.topupUrl = '/app/billing#ai-credit';
      throw e;
    }
  }

  // What an API call cost, in units. usage is the Messages API usage object.
  function cost(model, usage) {
    const u = usage || {}, [pin, pout, pread] = priceOf(model);
    const dollars = (num(u.input_tokens) * pin + num(u.cache_creation_input_tokens) * pin * 1.25 + num(u.cache_read_input_tokens) * pread + num(u.output_tokens) * pout) / 1e6;
    return Math.max(0, Math.ceil(dollars * C.usdToGbp * C.markup * UNIT - 1e-6));
  }

  // Records what an AI call used and takes it off the balance. Returns the amount charged, in pounds.
  async function charge(wid, feature, model, usage) {
    if (!C.enabled || !wid) return 0;
    const amount = cost(model, usage); if (!amount) return 0;
    const now = Date.now(); await load(wid, now);
    await q.spend.run(amount, amount, amount, now, wid);
    const u = usage || {};
    await q.ledger.run(wid, 'use', amount, FEATURES[feature] ? feature : 'other', String(model || ''), num(u.input_tokens) + num(u.cache_creation_input_tokens) + num(u.cache_read_input_tokens), num(u.output_tokens), null, now);
    return amount / UNIT;
  }
  // A ready-made callback for code that reports usage as (model, usage).
  const meter = (wid, feature) => (model, usage) => charge(wid, feature, model, usage).catch(e => log && log('credits', e.message));

  // Adds paid credit. ref (the Stripe session id) makes it safe to call twice for the same payment.
  async function topup(wid, pounds, ref, kind) {
    const amount = units(pounds); if (!(amount > 0)) return false;
    if (ref && await q.hasRef.get(ref)) return false;
    const now = Date.now(); await load(wid, now);
    return db.tx(async d => {
      if (ref && await d.prepare('SELECT id FROM ai_ledger WHERE ref = ?').get(ref)) return false;
      await d.prepare('INSERT INTO ai_ledger (workspace_id, kind, amount, feature, model, tokens_in, tokens_out, ref, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(wid, kind || 'topup', amount, null, null, null, null, ref || null, now);
      await d.prepare('UPDATE ai_credit SET topup_left = topup_left + ?, updated_at = ? WHERE workspace_id = ?').run(amount, now, wid);
      return true;
    });
  }

  // The plan was just paid: the billing month now starts today, with a full allowance.
  async function planStarted(wid) {
    const now = Date.now(); await load(wid, now);
    const a = units(await allowanceFor(wid));
    await q.restart.run(now, '0', a, a, now, wid);
  }

  async function recent(wid, n) {
    return (await q.recent.all(wid, n || 20)).map(r => ({ kind: r.kind, pounds: num(r.amount) / UNIT, feature: r.feature, name: FEATURES[r.feature] || (r.kind === 'topup' ? 'Top-up' : r.kind === 'grant' ? 'Added by our team' : 'AI'), model: r.model, tokensIn: num(r.tokens_in), tokensOut: num(r.tokens_out), at: num(r.created_at) }));
  }

  // Top-up amounts: whole pounds from £10 to £20,000.
  function topupAmount(v) {
    const n = Number(String(v == null ? '' : v).replace(/[£,\s]/g, ''));
    if (!Number.isFinite(n) || n !== Math.floor(n)) return null;
    return n >= TOPUP_MIN && n <= TOPUP_MAX ? n : null;
  }

  return { enabled: C.enabled, check, charge, meter, cost, topup, planStarted, summary, recent, topupAmount, money, UNIT, TOPUP_MIN, TOPUP_MAX, TOPUP_PRESETS, FEATURES, PRICES, periodOf };
};
module.exports.PRICES = PRICES;
