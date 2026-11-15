// A printable invoice for one booking, for guests who pay by bank transfer. The guest opens it from their trip link
// (signed), the host from the console. "Print or save as PDF" uses the browser's own print dialog.
'use strict';

const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = n => (n < 0 ? '−' : '') + '£' + Math.abs(Number(n) || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = iso => iso ? new Date(String(iso).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' }) : '';
const nights = (a, b) => Math.round((new Date(b) - new Date(a)) / 864e5);

function lines(b) {
  const pr = b.price || {}, n = nights(b.checkIn, b.checkOut), out = [];
  out.push([n + ' night' + (n === 1 ? '' : 's') + ', ' + fmt(b.checkIn) + ' to ' + fmt(b.checkOut), pr.nightly || 0]);
  if (pr.cleaning) out.push(['Cleaning', pr.cleaning]);
  if (pr.pet) out.push(['Pet fee', pr.pet]);
  if (pr.discount) out.push(['Discount' + (b.promo ? ' (code ' + b.promo + ')' : ''), -pr.discount]);
  (b.extras || []).forEach(x => out.push([x.name, x.price]));
  return out;
}

// Plain text version of the bank details, for emails.
function bankText(k, b) {
  const rows = [['Account name', k.holder], ['Bank', k.bankName], ['Sort code', k.sortCode], ['Account number', k.account], ['IBAN', k.iban], ['BIC / SWIFT', k.bic], ['Reference', b.id], ['Amount', money(b.total)]];
  return rows.filter(r => r[1]).map(r => r[0] + ': ' + r[1]).join('\n');
}

function render({ s, b, p, g, host }) {
  const a = s.account || {}, k = a.bank || {}, inv = b.invoice || { no: 'INV-' + b.id, issued: b.createdAt, due: b.checkIn };
  const paid = !!b.paid, cancelled = b.status === 'cancelled';
  const overdue = !paid && !cancelled && inv.due < s.today;
  const stamp = cancelled ? ['void', 'Cancelled'] : paid ? ['paid', 'Paid' + (b.paidAt ? ' ' + fmt(b.paidAt) : '')] : overdue ? ['due', 'Overdue'] : ['due', 'Due ' + fmt(inv.due)];
  const bankRows = [['Account name', k.holder], ['Bank', k.bankName], ['Sort code', k.sortCode], ['Account number', k.account], ['IBAN', k.iban], ['BIC / SWIFT', k.bic]].filter(r => r[1]);
  const color = /^#[0-9a-f]{3,8}$/i.test(p.color || '') ? p.color : '#2F5D46';
  return '<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">' +
    '<title>Invoice ' + E(inv.no) + ' · ' + E(a.business) + '</title><style>' +
    ':root{--ink:#1E2621;--muted:#5F6B64;--line:#E4E0D8;--bg:#F5F1EA;--brand:' + color + '}' +
    '*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}' +
    '.w{max-width:760px;margin:24px auto;padding:0 16px}.sheet{background:#fff;border-radius:14px;padding:40px;box-shadow:0 1px 3px rgba(0,0,0,.06)}' +
    '.top{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;border-bottom:3px solid var(--brand);padding-bottom:20px}' +
    'h1{margin:0;font-size:28px;letter-spacing:-.01em}h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 6px}' +
    '.biz b{font-size:18px}.muted{color:var(--muted)}.meta{text-align:right}.meta div{white-space:nowrap}' +
    '.tag{display:inline-block;margin-top:8px;padding:4px 12px;border-radius:999px;font-weight:700;font-size:13px}.tag.paid{background:#E3F2E8;color:#1F6B3A}.tag.due{background:#FFF1D6;color:#8A5A00}.tag.void{background:#F4E1E1;color:#8A2B2B}' +
    '.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin:24px 0}' +
    'table{width:100%;border-collapse:collapse}td,th{padding:10px 0;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:600}.r{text-align:right;font-variant-numeric:tabular-nums}' +
    'tr.tot td{border-bottom:0;font-weight:700;font-size:18px;padding-top:14px}' +
    '.bank{margin-top:28px;background:#FAF8F4;border:1px solid var(--line);border-radius:12px;padding:20px}.bank dl{display:grid;grid-template-columns:max-content 1fr;gap:6px 18px;margin:10px 0 0}.bank dt{color:var(--muted)}.bank dd{margin:0;font-weight:600;font-variant-numeric:tabular-nums}' +
    '.ref{background:#fff;border:1px dashed var(--brand);border-radius:8px;padding:2px 8px}' +
    '.acts{display:flex;gap:10px;justify-content:flex-end;margin-bottom:12px}.btn{font:inherit;font-weight:600;border:0;border-radius:999px;padding:10px 18px;background:var(--brand);color:#fff;cursor:pointer;text-decoration:none}.btn.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}' +
    'footer{margin-top:28px;font-size:13px;color:var(--muted)}' +
    '@media (max-width:560px){.sheet{padding:22px}.cols{grid-template-columns:1fr}.meta{text-align:left}}' +
    '@media print{body{background:#fff}.w{margin:0;max-width:none;padding:0}.sheet{box-shadow:none;padding:0}.acts{display:none}}' +
    '</style></head><body><div class="w">' +
    '<div class="acts">' + (host ? '<a class="btn ghost" href="/app">Back to console</a>' : '') + '<button class="btn" onclick="window.print()">Print or save as PDF</button></div>' +
    '<div class="sheet"><div class="top"><div class="biz"><h1>Invoice</h1><p><b>' + E(a.business) + '</b><br>' + (a.address ? E(a.address) + '<br>' : '') + (a.email ? E(a.replyTo || a.email) : '') + (a.phone ? '<br>' + E(a.phone) : '') + '</p></div>' +
    '<div class="meta"><div><span class="muted">Invoice</span> <b>' + E(inv.no) + '</b></div><div><span class="muted">Issued</span> ' + E(fmt(inv.issued)) + '</div><div><span class="muted">Due</span> ' + E(fmt(inv.due)) + '</div><div><span class="muted">Booking</span> ' + E(b.id) + '</div><span class="tag ' + stamp[0] + '">' + E(stamp[1]) + '</span></div></div>' +
    '<div class="cols"><div><h2>Bill to</h2><b>' + E(g.name) + '</b><br>' + E(g.email) + (g.phone ? '<br>' + E(g.phone) : '') + '</div>' +
    '<div><h2>Stay</h2><b>' + E(p.name) + '</b><br>' + E(p.area || '') + '<br>' + E(b.adults) + ' adult' + (b.adults === 1 ? '' : 's') + (b.children ? ', ' + E(b.children) + ' child' + (b.children === 1 ? '' : 'ren') : '') + (b.pets ? ', 1 dog' : '') + '</div></div>' +
    '<table><thead><tr><th>Description</th><th class="r">Amount</th></tr></thead><tbody>' +
    lines(b).map(l => '<tr><td>' + E(l[0]) + '</td><td class="r">' + money(l[1]) + '</td></tr>').join('') +
    '<tr class="tot"><td>' + (paid ? 'Total paid' : 'Total due') + '</td><td class="r">' + money(b.total) + '</td></tr></tbody></table>' +
    (cancelled ? '<p class="muted">This booking was cancelled, so nothing is owed on this invoice.</p>' : paid ? '<p class="muted">Thank you. This invoice was paid in full' + (b.payBy === 'transfer' ? ' by bank transfer' : '') + '.</p>' :
      '<div class="bank"><h2>Pay by bank transfer</h2><p style="margin:0">Please send <b>' + money(b.total) + '</b> by <b>' + E(fmt(inv.due)) + '</b> and use <span class="ref">' + E(b.id) + '</span> as the payment reference so it can be matched to your booking.</p>' +
      (bankRows.length ? '<dl>' + bankRows.map(r => '<dt>' + E(r[0]) + '</dt><dd>' + E(r[1]) + '</dd>').join('') + '<dt>Reference</dt><dd>' + E(b.id) + '</dd></dl>' : '<p>Bank details are on their way from ' + E(String(a.owner || 'your host').split(' ')[0]) + '.</p>') +
      (k.note ? '<p class="muted" style="margin-bottom:0">' + E(k.note) + '</p>' : '') + '</div>') +
    '<footer>' + E(a.business) + ' · Questions about this invoice? Reply to your booking email' + (a.email ? ' or write to ' + E(a.replyTo || a.email) : '') + '.</footer>' +
    '</div></div></body></html>';
}

module.exports = { render, bankText, money, fmt };
