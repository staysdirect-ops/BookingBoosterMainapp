// Bulk lead import: the team uploads a CSV of prospects (scraped directories, the Stays Direct list, contractor stops)
// into the leads table. Every import carries a required source tag, an optional consent date per row, and a has_email
// flag per lead. Duplicates are removed by email first, then by phone, against the file itself and the leads already stored.
//
// Imported leads are stored only. They are never enrolled in a follow-up series (no lead_seq row), so neither the lead
// sequence engine nor the team campaigns (which only reach leads with a lead_seq row) will email them.
'use strict';

const SOURCES = ['scraped', 'stays-direct', 'contractor-stop'];
const MAX_ROWS = 20000;
const REASONS = {
  no_contact: 'No email or phone',
  invalid_email: 'Email address is not valid',
  invalid_phone: 'Phone number is not a valid UK number',
  invalid_consent_date: 'Consent date is not a real past date',
  duplicate_email: 'Email already imported or already a lead',
  duplicate_phone: 'Phone already imported or already a lead',
  opted_out: 'Email has unsubscribed before',
};

// RFC 4180 CSV: quoted fields, doubled quotes, commas and line breaks inside quotes, CRLF or LF, optional BOM.
function parseCsv(text) {
  const s = String(text || '').replace(/^﻿/, ''); const rows = []; let row = [], f = '', q = false, i = 0;
  while (i < s.length) {
    const c = s[i];
    if (q) {
      if (c === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += c; i++; continue;
    }
    if (c === '"' && f === '') { q = true; i++; continue; }
    if (c === ',') { row.push(f); f = ''; i++; continue; }
    if (c === '\r' || c === '\n') { row.push(f); rows.push(row); row = []; f = ''; i += c === '\r' && s[i + 1] === '\n' ? 2 : 1; continue; }
    f += c; i++;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return rows.filter(r => r.some(x => String(x).trim() !== ''));
}

// Which column is which. Headers are matched loosely: "Business email (to find)" is the email, "Public phone" the phone.
const norm = h => String(h || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
function columns(headers) {
  const H = headers.map(norm), find = (...tests) => { for (const t of tests) { const i = H.findIndex(t); if (i >= 0) return i; } return -1; };
  return {
    email: find(h => /^(e ?mail|email address|business email|contact email)$/.test(h), h => /\be ?mail\b/.test(h)),
    phone: find(h => /^(phone|telephone|tel|mobile|phone number|public phone)$/.test(h), h => /\b(phone|telephone|tel|mobile)\b/.test(h)),
    name: find(h => /^(name|contact name|contact|full name|host name|owner)$/.test(h), h => /\bcontact name\b/.test(h)),
    business: find(h => /^(business|business name|company|property|property name|business property name)$/.test(h), h => /\b(business|property)\b/.test(h) && /\bname\b/.test(h)),
    consent: find(h => /\bconsent\b/.test(h) || /\bopt ?in\b/.test(h)),
  };
}

const EMAIL = /^[^@\s,;<>"]+@[^@\s,;<>"]+\.[a-z]{2,}$/i;
function cleanEmail(v) { const e = String(v || '').trim().replace(/^mailto:/i, '').toLowerCase(); return e ? (EMAIL.test(e) && e.length <= 160 ? e : false) : ''; }

// UK numbers, stored as +44 followed by 9 or 10 digits. Returns '' when empty, false when it cannot be a UK number.
function cleanPhone(v) {
  let d = String(v || '').trim(); if (!d) return '';
  d = d.replace(/\s*(ext|x)\.?\s*\d+$/i, '').replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1); else if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '44' + d.slice(1);
  if (!/^44[1-37-9]\d{8,9}$/.test(d)) return false;
  return '+' + d;
}

// Consent dates: 2026-03-14, 14/03/2026 (UK day first), 14-03-2026 or 14.03.2026. Returns YYYY-MM-DD, '' when empty, false when wrong.
function cleanConsent(v, now) {
  const s = String(v || '').trim(); if (!s) return '';
  let y, m, d, x;
  if ((x = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/))) [y, m, d] = [+x[1], +x[2], +x[3]];
  else if ((x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, m, y] = [+x[1], +x[2], +x[3]];
  else return false;
  const t = Date.UTC(y, m - 1, d), dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d || y < 2000 || t > (now || Date.now())) return false;
  return dt.toISOString().slice(0, 10);
}

module.exports = function ({ db }) {
  const INS = 'INSERT INTO leads (kind, email, name, data, created_at, phone, source, consent_at, has_email, import_batch) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)';
  const q = {
    email: db.prepare('SELECT 1 FROM leads WHERE lower(email) = lower(?) LIMIT 1'),
    phone: db.prepare('SELECT 1 FROM leads WHERE phone = ? LIMIT 1'),
    optedOut: db.prepare('SELECT 1 FROM lead_optout WHERE email = lower(?)'),
  };

  // Checks every row and, unless dryRun, stores the good ones in one transaction.
  // Returns { batch, source, total, loaded, rejected, reasons: { code: n }, has_email, no_email, with_consent, rejects: [{ row, reason, detail }] }.
  async function importCsv(text, opts = {}) {
    const source = String(opts.source || '').trim().toLowerCase();
    if (!SOURCES.includes(source)) return { error: 'Choose a source: ' + SOURCES.join(', ') + '.' };
    const rows = parseCsv(text);
    if (rows.length < 2) return { error: 'The file has no rows under the header line.' };
    if (rows.length - 1 > MAX_ROWS) return { error: 'The file has more than ' + MAX_ROWS + ' rows. Split it and import each part.' };
    const headers = rows[0].map(h => String(h).trim()), col = columns(headers);
    if (col.email < 0 && col.phone < 0) return { error: 'The header line needs an email or phone column.' };
    const now = opts.now || Date.now(), batch = opts.batch || 'imp_' + now.toString(36) + Math.random().toString(36).slice(2, 6);
    const seenEmail = new Set(), seenPhone = new Set(), good = [], rejects = [];
    const reject = (row, reason, detail) => rejects.push({ row, reason, detail: detail || '' });
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i], cell = k => (col[k] >= 0 ? String(r[col[k]] == null ? '' : r[col[k]]).trim() : ''), line = i + 1;
      const email = cleanEmail(cell('email')), phone = cleanPhone(cell('phone')), consent = cleanConsent(cell('consent'), now);
      if (email === false) { reject(line, 'invalid_email', cell('email')); continue; }
      if (!email && phone === false) { reject(line, 'invalid_phone', cell('phone')); continue; }
      if (!email && !phone) { reject(line, 'no_contact'); continue; }
      if (consent === false) { reject(line, 'invalid_consent_date', cell('consent')); continue; }
      // email first: a row with an email is a duplicate only by its email; a row without one is checked by phone
      if (email) {
        if (seenEmail.has(email) || await q.email.get(email)) { reject(line, 'duplicate_email', email); continue; }
        if (await q.optedOut.get(email)) { reject(line, 'opted_out', email); continue; }
      } else if (seenPhone.has(phone) || await q.phone.get(phone)) { reject(line, 'duplicate_phone', phone); continue; }
      if (email) seenEmail.add(email);
      if (phone) seenPhone.add(phone);
      const data = { import_row: line };
      headers.forEach((h, j) => { if (!h || [col.email, col.phone, col.name, col.consent].includes(j)) return; const v = String(r[j] == null ? '' : r[j]).trim(); if (v) data[h.slice(0, 80)] = v.slice(0, 2000); });
      if (phone === false) data.phone_as_given = cell('phone'); // kept for the team to fix; the lead still loads on its email
      const name = (cell('name') || cell('business')).slice(0, 120);
      good.push([ 'import', email || null, name, JSON.stringify(data), now, phone || null, source, consent || null, email ? 1 : 0, batch ]);
    }
    if (!opts.dryRun && good.length) await db.tx(async t => { const ins = t.prepare(INS); for (const g of good) await ins.run(...g); });
    const reasons = {}; rejects.forEach(x => reasons[x.reason] = (reasons[x.reason] || 0) + 1);
    return { batch, source, dryRun: !!opts.dryRun, total: rows.length - 1, loaded: good.length, rejected: rejects.length, reasons,
      has_email: good.filter(g => g[8]).length, no_email: good.filter(g => !g[8]).length, with_consent: good.filter(g => g[7]).length, columns: Object.fromEntries(Object.entries(col).map(([k, v]) => [k, v >= 0 ? headers[v] : null])), rejects };
  }

  return { importCsv, SOURCES, REASONS };
};
Object.assign(module.exports, { parseCsv, columns, cleanEmail, cleanPhone, cleanConsent, SOURCES, REASONS });

// Pulls the file and fields out of a multipart/form-data upload from the team admin's import form.
module.exports.multipart = function (buf, contentType) {
  const m = String(contentType || '').match(/boundary=(?:"([^"]+)"|([^;]+))/i); if (!m) return null;
  const sep = '--' + (m[1] || m[2]).trim(), s = buf.toString('latin1'), out = {};
  for (const part of s.split(sep).slice(1)) {
    if (part.startsWith('--')) break;
    const end = part.indexOf('\r\n\r\n'); if (end < 0) continue;
    const head = part.slice(0, end), name = (head.match(/name="([^"]*)"/i) || [])[1]; if (!name) continue;
    out[name] = Buffer.from(part.slice(end + 4).replace(/\r\n$/, ''), 'latin1').toString('utf8');
  }
  return out;
};
