// A host's own web address (for example larchcabin.co.uk). The host adds two DNS records:
//   1. one pointing the address at us: a CNAME to the target, or A records to our IP addresses
//   2. a TXT record at _bookingbooster.<address> that proves the address belongs to this account
// Only then does the address go live, so nobody can put their site on someone else's domain.
'use strict';
const dns = require('node:dns').promises;
const tls = require('node:tls');

// Cloudflare's proxy ("orange cloud") hides the records behind its own addresses, so we can neither see them nor issue the certificate.
const CF = [[104, 16, 31], [172, 64, 71], [188, 114, 114], [162, 158, 159], [141, 101, 101], [108, 162, 162], [190, 93, 93], [197, 234, 234], [198, 41, 41], [173, 245, 245], [103, 21, 22], [103, 22, 22], [103, 31, 31], [131, 0, 0]];
const cloudflare = ip => { const [a, b] = String(ip).split('.').map(Number); return CF.some(([x, lo, hi]) => a === x && b >= lo && b <= hi); };

module.exports = function ({ cfg, auth, log }) {
  const mainHost = new URL(cfg.baseUrl).hostname;
  const target = (cfg.domains.target || mainHost).toLowerCase();
  // tests only: cfg.domains.fakeDns is { name: { cname: [], a: [], txt: [] } }
  const ours = [mainHost.replace(/^app\./, ''), target.split('.').length > 2 ? target.replace(/^[^.]+\./, '') : target, cfg.sitesDomain].filter(Boolean);
  const strip = h => String(h || '').toLowerCase().replace(/\.$/, '');
  const look = async (kind, name) => {
    const fake = cfg.domains.fakeDns;
    if (fake) return ((fake[name] || {})[kind] || []).map(x => kind === 'txt' ? x : strip(x));
    try {
      if (kind === 'cname') return (await dns.resolveCname(name)).map(strip);
      if (kind === 'a') return await dns.resolve4(name);
      if (kind === 'txt') return (await dns.resolveTxt(name)).map(parts => parts.join(''));
    } catch (_) { return []; }
  };

  // Turn whatever the host typed into a bare address: "https://www.Larch.co.uk/book" -> "larch.co.uk"
  function clean(v) {
    const h = String(v || '').trim().toLowerCase().replace(/^[a-z]+:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/^www\./, '').replace(/\.$/, '');
    return h;
  }
  function problem(h) {
    if (!h) return null;
    if (h.length > 80 || !/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(h)) return 'That does not look like a web address. Type it like larchcabin.co.uk.';
    if (ours.some(o => h === o || h.endsWith('.' + o))) return 'That is one of our addresses. Use a domain you own, like larchcabin.co.uk.';
    return null;
  }
  const txtName = h => '_bookingbooster.' + h;
  const txtValue = (wid, h) => 'bb-verify=' + auth.sign('domain', wid, h).replace(/[^A-Za-z0-9]/g, '').slice(0, 32);

  let targetIps = null, ipsAt = 0;
  async function ourIps() {
    if (cfg.domains.ips.length) return cfg.domains.ips;
    if (!targetIps || Date.now() - ipsAt > 3600e3) { targetIps = await look('a', target); ipsAt = Date.now(); }
    return targetIps;
  }
  async function points(name) {
    const cn = await look('cname', name);
    if (cn.some(c => c === target)) return { ok: true, seen: 'CNAME ' + cn.join(', ') };
    const a = await look('a', name), ips = await ourIps();
    if (a.length && ips.length && a.every(x => ips.includes(x))) return { ok: true, seen: 'A ' + a.join(', ') };
    return { ok: false, seen: cn.length ? 'CNAME ' + cn.join(', ') : a.length ? 'A ' + a.join(', ') : '', proxied: a.length > 0 && a.every(cloudflare) };
  }

  // What the host needs to add, and what we can see right now.
  async function check(wid, h) {
    const [apex, www, txt, ips] = await Promise.all([points(h), points('www.' + h), look('txt', txtName(h)), ourIps()]);
    const want = txtValue(wid, h); const proved = txt.some(t => t.trim() === want);
    return {
      domain: h, live: (apex.ok || www.ok) && proved, apex, www, proved, proxied: !!(apex.proxied || www.proxied),
      records: [
        { type: 'TXT', name: '_bookingbooster', value: want, ok: proved, why: 'Proves the address is yours' },
        { type: 'CNAME', name: 'www', value: target, ok: www.ok, seen: www.ok ? '' : www.seen, why: 'Sends www.' + h + ' to your booking site' },
        ips.length ? { type: 'A', name: '@', value: ips.join(', '), ok: apex.ok, seen: apex.ok ? '' : apex.seen, why: 'Sends ' + h + ' to your booking site' } : null,
      ].filter(Boolean),
    };
  }

  // Fly.io issues a certificate per address. Elsewhere a proxy such as Caddy asks /tls/ask instead.
  async function certify(h) {
    if (!cfg.domains.flyToken || !cfg.domains.flyApp) return;
    for (const hostname of [h, 'www.' + h]) {
      try {
        const r = await fetch('https://api.fly.io/graphql', { method: 'POST', headers: { authorization: 'Bearer ' + cfg.domains.flyToken, 'content-type': 'application/json' }, signal: AbortSignal.timeout(15000),
          body: JSON.stringify({ query: 'mutation($appId: ID!, $hostname: String!) { addCertificate(appId: $appId, hostname: $hostname) { certificate { id } } }', variables: { appId: cfg.domains.flyApp, hostname } }) });
        const j = await r.json().catch(() => ({}));
        if (j.errors && !/already/i.test(JSON.stringify(j.errors))) log('domains', 'fly certificate', hostname, JSON.stringify(j.errors).slice(0, 200));
      } catch (e) { log('domains', 'fly certificate', hostname, e.message); }
    }
  }

  // Is the padlock in place? We open a secure connection to the address and check its certificate is valid for it.
  // Connecting also nudges an on-demand proxy such as Caddy to issue the certificate if it has not yet.
  // Returns true, false, or null when it cannot be checked here (tests).
  function https(h) {
    if (cfg.domains.fakeDns) return Promise.resolve(cfg.domains.fakeDns.https ? !!cfg.domains.fakeDns.https[h] : null);
    return new Promise(res => {
      let done = false; const end = v => { if (done) return; done = true; try { s.destroy(); } catch (_) {} res(v); };
      const s = tls.connect({ host: h, port: 443, servername: h, timeout: 8000 }, () => end(s.authorized));
      s.on('error', () => end(false)); s.on('timeout', () => end(false));
    });
  }

  // For the sign-up flow, before an account exists: where the host's records should point.
  async function targets() { let ips = []; try { ips = await ourIps(); } catch (_) {} return { target, ips }; }

  return { clean, problem, check, certify, https, targets, target, txtName, txtValue };
};
