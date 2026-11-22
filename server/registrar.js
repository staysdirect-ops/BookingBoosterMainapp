// Buying a new domain for a host, through our 20i reseller account (the same account that hosts booking-booster.co.uk).
// One supplier does all of it: availability, registration (20i is a Nominet registrar for .uk), DNS, the free
// Let's Encrypt certificate and renewals. Fees come out of the prepaid 20i balance, never the host's card.
//
// The life of a bought domain:
//   waiting      chosen at sign-up; nothing is bought until the first plan payment has gone through
//   registering  we are asking 20i for it right now
//   active       registered, pointed at the host's site, padlock on; renewed each year while the plan is paid
//   failed       20i said no (taken in the meantime, balance too low, bad contact details); see `error`
//   lapsed       the plan stopped, so we let the registration run out instead of renewing it
// Without TWENTYI_API_KEY the module is off: search answers { live: false } and nothing is bought.
'use strict';

const DAY = 864e5;

module.exports = function ({ cfg, db, ws, stripe, domains, log }) {
  const R = cfg.registrar;
  const enabled = () => !!R.key;
  const q = {
    get: db.prepare('SELECT * FROM registrations WHERE host = ?'),
    forWs: db.prepare('SELECT * FROM registrations WHERE workspace_id = ?'),
    add: db.prepare('INSERT INTO registrations (host, workspace_id, property_id, status, years, contact, attempts, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, 0, ?, ?)'),
    waiting: db.prepare("SELECT * FROM registrations WHERE status = 'waiting' AND attempts < 6"),
    renewDue: db.prepare("SELECT * FROM registrations WHERE status = 'active' AND expires_at < ?"),
    claim: db.prepare("UPDATE registrations SET status = 'registering', attempts = attempts + 1, updated_at = ? WHERE host = ? AND status = 'waiting'"),
    set: db.prepare('UPDATE registrations SET status = ?, error = ?, updated_at = ? WHERE host = ?'),
    done: db.prepare("UPDATE registrations SET status = 'active', error = NULL, registered_at = ?, expires_at = ?, updated_at = ? WHERE host = ?"),
    renewed: db.prepare('UPDATE registrations SET expires_at = ?, renewed_at = ?, error = NULL, updated_at = ? WHERE host = ?'),
    del: db.prepare('DELETE FROM registrations WHERE host = ?'),
  };

  /* ---------- the 20i API: https://api.20i.com, bearer token is the general API key in base64 ---------- */
  async function api(method, path, body) {
    const r = await fetch((R.apiBase || 'https://api.20i.com') + path, {
      method, signal: AbortSignal.timeout(30000),
      headers: Object.assign({ authorization: 'Bearer ' + btoa(R.key), accept: 'application/json' }, body ? { 'content-type': 'application/json' } : {}),
      body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j;
    try { j = JSON.parse(text); } catch (_) { j = text.split(/\r?\n/).filter(l => l.trim()).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean); } // search can stream one result per line
    if (!r.ok) { const e = new Error('20i ' + r.status + ': ' + String((j && (j.error || j.message)) || text).slice(0, 200)); e.status = r.status; throw e; }
    return j;
  }

  /* ---------- which names we offer ---------- */
  const tldOf = h => (h.match(/\.(co\.uk|org\.uk|me\.uk|[a-z]{2,})$/) || [])[1] || '';
  function problem(h) {
    if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(\.[a-z]{2,})+$/.test(h) || h.length > 80) return 'That does not look like a domain. Type it like larchcabin.co.uk.';
    if (h.split('.').length > (/\.(co|org|me)\.uk$/.test(h) ? 3 : 2)) return 'Pick a main domain, without anything before it.';
    if (!R.tlds.includes(tldOf(h))) return 'We can register ' + R.tlds.map(t => '.' + t).join(', ') + ' domains for you. For another ending, buy it yourself and use “I already have a domain”.';
    if (domains.problem(h)) return domains.problem(h);
    return '';
  }

  // Is it free to register? 20i takes several names at once, comma separated, and answers one record per name with
  // `can`: "register" when nobody has it. Anything else (transfer, premium, unknown) counts as not available.
  async function search(names) {
    names = [...new Set(names.map(n => String(n || '').toLowerCase().trim()).filter(n => n && !problem(n)))].slice(0, 8);
    if (!names.length) return [];
    if (!enabled()) return null;
    const res = await api('GET', '/domain-search/' + encodeURIComponent(names.join(',')));
    const seen = {};
    (function walk(v, depth) {
      if (!v || depth > 6) return;
      if (Array.isArray(v)) return v.forEach(x => walk(x, depth + 1));
      if (typeof v !== 'object') return;
      const n = String(v.name || v.domain || '').toLowerCase();
      if (n && names.includes(n) && v.can !== undefined) seen[n] = v.can === 'register' && !v.premium;
      Object.values(v).forEach(x => typeof x === 'object' && walk(x, depth + 1));
    })(res, 0);
    return names.map(d => ({ d, ok: seen[d] === true }));
  }

  /* ---------- the person the domain is registered to (Nominet needs a real name and postal address) ---------- */
  function phone(v) { // registries want +CC.NUMBER
    let d = String(v || '').replace(/[^\d+]/g, '');
    if (d.startsWith('+')) { d = d.slice(1); return d.length >= 9 ? '+' + d.slice(0, 2) + '.' + d.slice(2) : ''; }
    if (d.startsWith('0')) d = d.slice(1);
    return d.length >= 9 && d.length <= 11 ? '+44.' + d : '';
  }
  function contact(acct, reg) {
    const c = { name: String(acct.name || '').trim().slice(0, 80), organisation: String(reg.organisation || '').trim().slice(0, 80), email: String(acct.email || '').trim().toLowerCase(),
      address: String(reg.address || '').trim().slice(0, 120), city: String(reg.city || '').trim().slice(0, 60), sp: String(reg.county || '').trim().slice(0, 60),
      pc: String(reg.postcode || '').trim().toUpperCase().slice(0, 10), cc: 'GB', telephone: phone(reg.phone) };
    if (c.name.length < 2) return { err: 'Enter your name.' };
    if (c.address.length < 3) return { err: 'Enter the first line of your address. The domain is registered in your name.' };
    if (c.city.length < 2) return { err: 'Enter your town or city.' };
    if (!/^[A-Z]{1,2}\d[A-Z\d]? ?\d[A-Z]{2}$/.test(c.pc)) return { err: 'Enter a UK postcode, like LA22 9AA.' };
    if (!c.telephone) return { err: 'Enter a phone number, like 07700 900123. The domain registry asks for one.' };
    return { contact: c };
  }

  // At sign-up: remember the choice. Nothing is bought until the plan is paid.
  async function order(wid, pid, h, acct, reg) {
    if (!enabled()) return { err: 'Buying domains is not switched on yet.' };
    const bad = problem(h); if (bad) return { err: bad };
    const c = contact(acct, reg || {}); if (c.err) return c;
    const mine = (await q.forWs.all(wid)).filter(r => r.status !== 'failed');
    if (mine.length >= R.perAccount) return { err: 'Your plan includes ' + R.perAccount + ' new domain. Use “I already have a domain” for more.' };
    const ex = await q.get.get(h);
    if (ex && ex.workspace_id !== wid && ex.status !== 'failed') return { err: 'Someone has just taken ' + h + '. Pick another.' };
    if (ex) await q.del.run(h);
    const t = Date.now(); await q.add.run(h, wid, pid, 'waiting', JSON.stringify(c.contact), t, t);
    return { ok: true };
  }

  async function note(wid, pid, title, text) {
    try { await ws.withWs(wid, BB => { BB.log('site', title, text, pid, ['Website', 'Domain']); BB.store.commit({}); }); } catch (e) { log('registrar', 'note', e.message); }
  }
  // Paid up (or no card billing on this server) and not cancelled.
  async function paying(wid) {
    const r = await ws.row(wid); if (!r) return false;
    if (!stripe.enabled) return r.billing_status !== 'cancelled';
    return r.billing_status === 'active';
  }

  // Point the new domain at the host's site and turn on HTTPS.
  //  - On 20i hosting (TWENTYI_PACKAGE_ID set, as booking-booster.co.uk is today): add the name to that package. 20i's
  //    own DNS then points it at the package, and the free Let's Encrypt certificate is switched on for it.
  //  - Anywhere else (Fly.io, a VPS): write A and CNAME records in the domain's 20i DNS, then ask Fly for a certificate
  //    (or let Caddy issue one on demand through /tls/ask, which now says yes because the domain row is verified).
  async function connect(h) {
    if (R.packageId) {
      await api('POST', '/package/' + encodeURIComponent(R.packageId) + '/names', { add: [h] });
      try { await api('POST', '/package/' + encodeURIComponent(R.packageId) + '/web/freeSSL', { name: h, enabled: true }); }
      catch (e) { log('registrar', 'free SSL', h, e.message); } // 20i also turns it on by itself once DNS settles
      return;
    }
    const t = await domains.targets(), recs = { CNAME: [{ host: 'www', target: t.target }] };
    if (t.ips.length) recs.A = t.ips.map(ip => ({ host: '@', ip }));
    await api('POST', '/package/' + encodeURIComponent(h) + '/domain/' + encodeURIComponent(h) + '/dns', { new: recs });
    domains.certify(h);
  }

  async function register(row) {
    const h = row.host, wid = row.workspace_id, pid = row.property_id;
    const claimed = await q.claim.run(Date.now(), h); if (!claimed.changes) return; // someone else is on it
    try {
      const s = await search([h]);
      if (!s || !s[0] || !s[0].ok) {
        await q.set.run('failed', 'No longer available', Date.now(), h);
        await ws.act(wid, 'updateProperty', [pid, { domain: '' }, true]).catch(() => {});
        await note(wid, pid, 'Domain', 'Someone else registered ' + h + ' before we could. Your site stays on its free address. Pick another domain in Website & SEO, and we will set it up for you.');
        return log('registrar', h, 'taken before we could register it');
      }
      const c = JSON.parse(row.contact);
      const ok = await api('POST', '/reseller/*/addDomain', { name: h, years: 1, contact: Object.assign({}, c, /\.uk$/.test(h) ? { extension: { type: 'IND' } } : {}),
        privacyService: R.privacy && !/\.uk$/.test(h), caRegistryAgreement: true });
      if (ok === false || (ok && ok.error)) throw new Error('20i would not register it' + (ok && ok.error ? ': ' + JSON.stringify(ok.error).slice(0, 160) : ''));
      const t = Date.now(); await q.done.run(t, t + 365 * DAY, t, h);
      log('registrar', wid, 'registered', h);
      await ws.claimDomain(h, wid, pid); // we bought it for them, so no TXT proof is needed
      try { await connect(h); } catch (e) { log('registrar', 'connect', h, e.message); await q.set.run('active', 'Registered, but pointing it failed: ' + e.message.slice(0, 200), Date.now(), h); }
      await note(wid, pid, 'Domain', 'We registered ' + h + ' in your name and pointed it at your booking site. The padlock (HTTPS) is added automatically, usually within the hour.');
    } catch (e) {
      log('registrar', h, e.message);
      const again = row.attempts + 1 < 6;
      await q.set.run(again ? 'waiting' : 'failed', e.message.slice(0, 300), Date.now(), h);
      if (!again) await note(wid, pid, 'Domain', 'We could not register ' + h + ' for you. Our team has been told and will sort it out. Your site keeps working on its free address.');
    }
  }

  // Buy every domain whose account has paid. Runs straight after a plan payment and every 10 minutes after that.
  async function due(onlyWs) {
    if (!enabled()) return;
    for (const r of await q.waiting.all()) {
      if (onlyWs && r.workspace_id !== onlyWs) continue;
      if (await paying(r.workspace_id)) await register(r);
    }
  }

  // Once a day: renew anything that runs out within 30 days, while the plan is paid. Renewal comes out of the 20i balance.
  // With DOMAIN_RENEWAL=charge the host's next plan invoice gets a line for it; the default is that the plan covers it.
  async function renewals(t = Date.now()) {
    if (!enabled()) return;
    for (const r of await q.renewDue.all(t + 30 * DAY)) {
      if (!await paying(r.workspace_id)) {
        if (r.expires_at < t) { await q.set.run('lapsed', 'Plan ended, so it was not renewed', t, r.host); log('registrar', r.host, 'lapsed'); }
        continue;
      }
      try {
        const ok = await api('POST', '/reseller/*/renewDomain', { name: r.host, years: 1, renewPrivacy: R.privacy && !/\.uk$/.test(r.host) });
        if (ok === false) throw new Error('20i would not renew it');
        await q.renewed.run(r.expires_at + 365 * DAY, t, t, r.host);
        log('registrar', r.workspace_id, 'renewed', r.host);
        if (R.renewal === 'charge' && R.renewalPrice > 0 && stripe.enabled) {
          const w = await ws.row(r.workspace_id);
          if (w && w.stripe_customer) await stripe.api('POST', '/invoiceitems', { customer: w.stripe_customer, amount: Math.round(R.renewalPrice * 100), currency: 'gbp', description: 'Domain renewal: ' + r.host + ' for one year' }, { idem: 'renew-' + r.host + '-' + r.expires_at });
        }
        await note(r.workspace_id, r.property_id, 'Domain', 'We renewed ' + r.host + ' for another year' + (R.renewal === 'charge' && R.renewalPrice > 0 ? ' (£' + R.renewalPrice + ', added to your next invoice).' : ', included in your plan.'));
      } catch (e) { log('registrar', 'renew', r.host, e.message); await q.set.run('active', 'Renewal failed: ' + e.message.slice(0, 200), t, r.host); }
    }
  }

  // What the sign-up page shows about buying a domain.
  const offer = () => ({ live: enabled(), tlds: R.tlds, renewal: R.renewal, renewalPrice: R.renewalPrice });
  const status = wid => q.forWs.all(wid);

  return { enabled, search, problem, contact, order, due, renewals, offer, status, phone };
};
