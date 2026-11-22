// Sign-in by email: the magic link and code (host-t03-magic-link) and the password reset email (host-t01-password-reset).
// Tokens, expiry and single use are in auth.js. This file sends the emails and serves the pages:
//   GET  /login/email   ask for an email address
//   POST /login/email   send the link and code, then show the code form
//   POST /login/code    sign in with the 6-digit code
//   GET  /login/link    the emailed link: a page with a button, so email scanners that open links do not use it up
//   POST /login/link    sign in with the link
'use strict';

module.exports = function ({ cfg, auth, msg, log }) {
  const E = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // What the email shows under "Request details", so the host can spot a request that was not theirs.
  function device(ua) {
    ua = String(ua || '');
    const browser = /Edg\//.test(ua) ? 'Edge' : /OPR\/|Opera/.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
      : /Chrome\/|CriOS\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X|Macintosh/.test(ua) ? 'Mac' : /CrOS/.test(ua) ? 'Chromebook' : /Linux/.test(ua) ? 'Linux' : '';
    return browser && os ? browser + ' on ' + os : browser || os || 'Unknown device';
  }
  function location(req) {
    const cc = String(req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country'] || req.headers['x-country-code'] || '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc) || cc === 'XX' || cc === 'T1') return 'Not available';
    try { return new Intl.DisplayNames(['en-GB'], { type: 'region' }).of(cc) || cc; } catch (_) { return cc; }
  }
  function when(ms) {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' }).formatToParts(new Date(ms));
    const g = k => (f.find(x => x.type === k) || {}).value || '';
    return g('weekday') + ' ' + g('day') + ' ' + g('month') + ', ' + g('hour') + ':' + g('minute') + ' ' + g('timeZoneName');
  }
  function common(user, req) {
    return {
      first_name: String(user.name || '').trim().split(/\s+/)[0] || 'there', email: user.email,
      request_time: when(Date.now()), request_device: req ? device(req.headers['user-agent']) : 'Bookingbooster team', request_location: req ? location(req) : 'Not available',
      security_url: cfg.baseUrl + '/forgot', site_url: cfg.baseUrl, help_url: cfg.baseUrl + '/help', account_url: cfg.baseUrl + '/app/account', privacy_url: cfg.baseUrl + '/privacy',
      preferences_url: cfg.baseUrl + '/app/account#emails', unsubscribe_url: cfg.baseUrl + '/app/account#emails',
      company_address: cfg.company.address, company_number: cfg.company.number, vat_number: cfg.company.vat,
    };
  }

  // team: true when the Bookingbooster team sent it from the admin console (no device or place to show).
  function sendReset(r, req, team) {
    const link = cfg.baseUrl + '/reset?t=' + r.token, subject = 'Reset your Bookingbooster password';
    const v = Object.assign(common(r.user, team ? null : req), { reset_url: link,
      reset_intro: team ? 'The Bookingbooster team sent you this link to set a new password for' : 'Someone, hopefully you, asked to reset the password for' });
    const text = (team ? 'The Bookingbooster team sent you a link to set a new password.' : 'Reset your Bookingbooster password.') + ' It works once, for one hour: ' + link + '\n\nIf you did not ask for this, ignore this email and your password stays the same.';
    return msg.sendEmail({ workspaceId: r.user.workspace_id, to: r.user.email, subject, text, html: msg.template('host-t01-password-reset', v), meta: Object.assign({ template: 'reset' }, team ? { team: true } : {}) });
  }
  function sendMagic(r, req) {
    const link = cfg.baseUrl + '/login/link?t=' + r.token, code = r.code.slice(0, 3) + ' ' + r.code.slice(3), subject = 'Your Bookingbooster sign-in link';
    const v = Object.assign(common(r.user, req), { magic_link_url: link, login_code: code });
    const text = 'Sign in to Bookingbooster: ' + link + '\n\nOr enter this code: ' + code + '\n\nThe link and code work once and expire in 15 minutes. If you did not ask for this, ignore this email; nobody can sign in without it.';
    return msg.sendEmail({ workspaceId: r.user.workspace_id, to: r.user.email, subject, text, html: msg.template('host-t03-magic-link', v), meta: { template: 'magic-link' } });
  }

  const emailForm = (h, o) => h.authPage('Sign in with email', '<h1>Sign in with email</h1><p>We will email you a link and a code. No password needed.</p>' + (o && o.err ? '<p class="err" role="alert">' + E(o.err) + '</p>' : '') +
    '<form method="post" action="/login/email"><label>Email<input name="email" type="email" autocomplete="email" required value="' + E(o && o.email) + '"></label><button type="submit">Email me a sign-in link</button></form>' +
    '<div class="links"><a href="/login">Sign in with a password</a><a href="/start">Create an account</a></div>');
  const codeForm = (h, email, err) => h.authPage('Check your email', '<h1>Check your email</h1><p>If there is an account for <b>' + E(email) + '</b>, a sign-in link is on its way. Tap it, or enter the 6-digit code from the email here. Both work once, for 15 minutes.</p>' +
    (err ? '<p class="err" role="alert">' + E(err) + '</p>' : '') +
    '<form method="post" action="/login/code"><input type="hidden" name="email" value="' + E(email) + '"><label>Code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9 ]{6,7}" maxlength="7" required></label><button type="submit">Sign in</button></form>' +
    '<div class="links"><a href="/login/email">Send a new link</a><a href="/login">Sign in with a password</a></div>');
  const expired = h => h.authPage('Link expired', '<h1>That link has expired.</h1><p>Sign-in links work once, for 15 minutes.</p><p><a href="/login/email">Send a new one</a></p>');

  // h: helpers from index.js (authPage, formBody, send, redirect, signIn, ip). Returns true when it handled the request.
  async function route(req, res, p, m, u, h) {
    if (p === '/login/email' && m === 'GET') { h.send(res, 200, emailForm(h)); return true; }
    if (p === '/login/email' && m === 'POST') {
      const f = await h.formBody(req), email = String(f.email || '').trim().toLowerCase().slice(0, 200);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { h.send(res, 400, emailForm(h, { err: 'Enter the email address you sign in with.', email })); return true; }
      if (!auth.limit('magic:' + h.ip(req), 10, 3600e3)) { h.send(res, 429, emailForm(h, { err: 'Too many sign-in emails from here. Wait an hour, or sign in with your password.', email })); return true; }
      // The same answer whether or not the account exists, so this page cannot be used to find out who has one.
      if (auth.limit('magic-to:' + email, 3, 900e3)) {
        const r = await auth.startMagic(email);
        if (r) { await sendMagic(r, req).catch(e => log('signin', 'magic link email failed', e.message)); }
      }
      h.send(res, 200, codeForm(h, email)); return true;
    }
    if (p === '/login/code' && m === 'POST') {
      const f = await h.formBody(req), email = String(f.email || '').trim().toLowerCase().slice(0, 200);
      if (!auth.limit('magic-code:' + h.ip(req), 20, 900e3)) { h.send(res, 429, codeForm(h, email, 'Too many tries. Wait 15 minutes, then ask for a new code.')); return true; }
      const user = await auth.finishMagicCode(email, f.code);
      if (!user) { h.send(res, 401, codeForm(h, email, 'That code is not right or has expired. After five wrong tries you will need a new one.')); return true; }
      await h.signIn(res, user); return true;
    }
    if (p === '/login/link' && m === 'GET') {
      const t = u.searchParams.get('t') || '';
      h.send(res, 200, h.authPage('Sign in', '<h1>Sign in to Bookingbooster</h1><p>Tap the button to finish signing in on this device.</p><form method="post" action="/login/link"><input type="hidden" name="t" value="' + E(t) + '"><button type="submit">Sign in</button></form>'));
      return true;
    }
    if (p === '/login/link' && m === 'POST') {
      const f = await h.formBody(req);
      if (!auth.limit('magic-link:' + h.ip(req), 30, 900e3)) { h.send(res, 429, expired(h)); return true; }
      const user = await auth.finishMagicLink(f.t);
      if (!user) { h.send(res, 400, expired(h)); return true; }
      await h.signIn(res, user); return true;
    }
    return false;
  }

  return { route, sendReset, sendMagic, device };
};
