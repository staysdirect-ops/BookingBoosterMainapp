// Email and text sending. Uses Resend or Postmark for email and Twilio for texts when their keys are set.
// Every message is written to the outbox table first, so nothing is lost and the host can see what went out.
'use strict';
const fs = require('fs');
const path = require('path');
const { esc } = require('./pages');

module.exports = function (db, cfg) {
  const ins = db.prepare('INSERT INTO outbox (workspace_id, channel, recipient, subject, body, html, status, provider, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const upd = db.prepare('UPDATE outbox SET status = ?, provider_id = ?, error = ? WHERE id = ?');
  const list = db.prepare('SELECT id, channel, recipient, subject, body, status, provider, error, created_at FROM outbox WHERE workspace_id = ? ORDER BY id DESC LIMIT ?');
  const TPL = path.join(__dirname, 'emails');
  const cache = {};
  function template(name, vars) {
    let html = cache[name] || (cache[name] = fs.readFileSync(path.join(TPL, name + '.html'), 'utf8'));
    if (!vars.what3words) html = html.replace(/<p[^>]*>what3words \/\/\/\{\{what3words\}\}<\/p>/g, '');
    html = html.replace(/(src|href)="guest-img\//g, '$1="' + cfg.baseUrl + '/email-img/').replace(/(src|href)="\.\.\/assets\//g, '$1="' + cfg.baseUrl + '/email-img/brand/');
    vars = Object.assign({ company_name: cfg.company.name }, vars, { company_number: vars.company_number || 'to be confirmed', vat_number: vars.vat_number || 'not registered' });
    html = html.replace(/\{\{\{\s*([a-z0-9_]+)\s*\}\}\}/g, (m, k) => vars[k] == null ? '' : String(vars[k])); // {{{x}}}: markup we built ourselves, already escaped
    html = html.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (m, k) => esc(vars[k] == null ? '' : vars[k]));
    return html;
  }

  async function sendEmail({ workspaceId, to, subject, text, html, from, replyTo, meta, unsubscribeUrl, attachments }) {
    // attachments: [{ filename, content (Buffer or string), type }]
    const att = (attachments || []).map(a => ({ filename: a.filename, type: a.type || 'application/octet-stream', b64: Buffer.from(a.content).toString('base64') }));
    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return { ok: false, error: 'No valid email address' };
    const provider = cfg.email.provider;
    const r = await ins.run(workspaceId || null, 'email', to, subject, text || '', html || null, provider ? 'sending' : 'test', provider || 'test-outbox', JSON.stringify(Object.assign({}, meta, att.length ? { attachments: att.map(a => a.filename) } : {})), Date.now());
    const id = Number(r.lastInsertRowid);
    if (!provider) return { ok: true, id, test: true };
    const headers = {}; if (unsubscribeUrl) { headers['List-Unsubscribe'] = '<' + unsubscribeUrl + '>'; headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click'; }
    try {
      let res, j;
      if (provider === 'resend') {
        res = await fetch((cfg.email.apiBase || 'https://api.resend.com') + '/emails', { method: 'POST', headers: { authorization: 'Bearer ' + cfg.email.resendKey, 'content-type': 'application/json' },
          body: JSON.stringify({ from: from || cfg.email.from, to: [to], subject, text, html, reply_to: replyTo || undefined, headers, attachments: att.length ? att.map(a => ({ filename: a.filename, content: a.b64, content_type: a.type })) : undefined }) });
        j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.message || 'Resend error ' + res.status);
        await upd.run('sent', j.id || null, null, id);
      } else {
        res = await fetch((cfg.email.apiBase || 'https://api.postmarkapp.com') + '/email', { method: 'POST', headers: { 'X-Postmark-Server-Token': cfg.email.postmarkToken, 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ From: from || cfg.email.from, To: to, Subject: subject, TextBody: text, HtmlBody: html, ReplyTo: replyTo || undefined, Headers: Object.entries(headers).map(([Name, Value]) => ({ Name, Value })), Attachments: att.length ? att.map(a => ({ Name: a.filename, Content: a.b64, ContentType: a.type })) : undefined, MessageStream: meta && meta.broadcast ? 'broadcast' : 'outbound' }) });
        j = await res.json().catch(() => ({}));
        if (!res.ok || j.ErrorCode) throw new Error(j.Message || 'Postmark error ' + res.status);
        await upd.run('sent', j.MessageID || null, null, id);
      }
      return { ok: true, id };
    } catch (e) { await upd.run('failed', null, String(e.message).slice(0, 300), id); return { ok: false, id, error: e.message }; }
  }

  // UK mobiles: 07… becomes +447…
  const e164 = n => { let x = String(n || '').replace(/[^\d+]/g, ''); if (x.startsWith('07')) x = '+44' + x.slice(1); else if (x.startsWith('44')) x = '+' + x; return /^\+\d{9,15}$/.test(x) ? x : null; };
  async function sendSms({ workspaceId, to, text, meta }) {
    const num = e164(to); if (!num) return { ok: false, error: 'No valid mobile number' };
    const live = cfg.sms.sid && cfg.sms.token && cfg.sms.from;
    const r = await ins.run(workspaceId || null, 'sms', num, null, text, null, live ? 'sending' : 'test', live ? 'twilio' : 'test-outbox', JSON.stringify(meta || {}), Date.now());
    const id = Number(r.lastInsertRowid);
    if (!live) return { ok: true, id, test: true };
    try {
      const res = await fetch((cfg.sms.apiBase || 'https://api.twilio.com') + '/2010-04-01/Accounts/' + cfg.sms.sid + '/Messages.json', { method: 'POST',
        headers: { authorization: 'Basic ' + Buffer.from(cfg.sms.sid + ':' + cfg.sms.token).toString('base64'), 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ To: num, From: cfg.sms.from, Body: text.slice(0, 900) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.message || 'Twilio error ' + res.status);
      await upd.run('sent', j.sid || null, null, id); return { ok: true, id };
    } catch (e) { await upd.run('failed', null, String(e.message).slice(0, 300), id); return { ok: false, id, error: e.message }; }
  }
  return { sendEmail, sendSms, template, outbox: (wid, n) => list.all(wid, n || 50), e164 };
};
