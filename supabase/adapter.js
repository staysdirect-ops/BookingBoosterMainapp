// Turns a web Request into the small Node-style req/res the server's router uses, and back into a Response.
// Requests reach the function through the PHP pass-through on 20i (see supabase/20i/index.php), which adds:
//   x-bb-proxy  the shared key, so only our own pass-through can set the next three
//   x-bb-host   the address the visitor typed (booking-booster.co.uk, or a host's own domain)
//   x-bb-ip     the visitor's IP, for rate limits
//   x-bb-proto  http or https
'use strict';
const { Readable } = require('node:stream');
const crypto = require('node:crypto');

module.exports = function (app, { proxyKey, prefix }) {
  let key = null; // the key comes from the PROXY_KEY secret, or from the database (kv 'config:proxy_key')
  const getKey = async () => key != null ? key : (key = String((typeof proxyKey === 'function' ? await proxyKey() : proxyKey) || ''));
  const okKey = (k, want) => !!want && !!k && k.length === want.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(want));
  return async function serve(request, waitUntil) {
    const u = new URL(request.url);
    let path = u.pathname; if (prefix && (path === prefix || path.startsWith(prefix + '/'))) path = path.slice(prefix.length) || '/';
    const headers = {}; request.headers.forEach((v, k) => { headers[k] = v; });
    const trusted = okKey(headers['x-bb-proxy'], await getKey());
    if (!trusted) return new Response('Not found', { status: 404 });
    headers.host = headers['x-bb-host'] || headers.host;
    const ip = headers['x-bb-ip'] || '';
    headers['x-forwarded-for'] = ip; delete headers['fly-client-ip'];
    for (const k of ['x-bb-proxy', 'x-bb-host', 'x-bb-ip', 'x-bb-proto']) delete headers[k];
    const buf = request.method === 'GET' || request.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await request.arrayBuffer());
    const req = Readable.from(buf.length ? [buf] : []);
    Object.assign(req, { method: request.method, url: path + u.search, headers, socket: { remoteAddress: ip } });

    let status = 200, out = {}; const chunks = []; let done;
    const finished = new Promise(r => { done = r; });
    const res = {
      headersSent: false, statusCode: 200,
      setHeader(k, v) { out[k.toLowerCase()] = v; },
      writeHead(s, h) { status = s; for (const [k, v] of Object.entries(h || {})) out[k.toLowerCase()] = v; this.headersSent = true; return this; },
      write(c) { if (c != null) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c))); return true; },
      end(c) { if (c != null) this.write(c); this.headersSent = true; done(); },
      on() { return this; }, once() { return this; }, emit() {}, removeListener() {},
    };
    const run = app.handle(req, res);
    await Promise.race([finished, run.then(() => finished)]);
    // Finish emails and other follow-up work after the reply has gone.
    const later = run.then(() => app.ws.settle()).catch(e => console.log('after reply', e && e.message));
    if (waitUntil) waitUntil(later); else await later;

    const h = new Headers();
    for (const [k, v] of Object.entries(out)) { if (Array.isArray(v)) v.forEach(x => h.append(k, String(x))); else if (v != null) h.set(k, String(v)); }
    // Supabase rewrites text/html on its own domain, so the real type travels in its own header for the pass-through.
    if (h.has('content-type')) h.set('x-bb-type', h.get('content-type'));
    const body = request.method === 'HEAD' || status === 204 || status === 304 ? null : Buffer.concat(chunks);
    return new Response(body, { status, headers: h });
  };
};
