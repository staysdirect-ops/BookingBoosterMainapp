// Accounts, sessions, signed guest links and a small rate limiter.
'use strict';
const crypto = require('crypto');

module.exports = function (db, cfg) {
  const now = () => Date.now();
  const q = {
    userByEmail: db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)'),
    user: db.prepare('SELECT * FROM users WHERE id = ?'),
    addUser: db.prepare('INSERT INTO users (id, email, name, pass, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    setPass: db.prepare('UPDATE users SET pass = ? WHERE id = ?'),
    addSession: db.prepare('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'),
    session: db.prepare('SELECT s.*, u.email, u.name, u.workspace_id FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?'),
    delSession: db.prepare('DELETE FROM sessions WHERE token = ?'),
    delUserSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    addReset: db.prepare('INSERT INTO resets (token, user_id, expires_at) VALUES (?, ?, ?)'),
    // Taking a token deletes it in the same statement, so a link or code can only ever be used once.
    takeReset: db.prepare('DELETE FROM resets WHERE token = ? AND expires_at > ? RETURNING user_id'),
    delMagic: db.prepare("DELETE FROM resets WHERE user_id = ? AND (token LIKE 'ml:%' OR token LIKE 'mc:%')"),
    sweepResets: db.prepare('DELETE FROM resets WHERE expires_at <= ?'),
    failMagic: db.prepare("INSERT INTO kv (k, v) VALUES (?, '1') ON CONFLICT (k) DO UPDATE SET v = (coalesce(nullif(kv.v, ''), '0')::int + 1)::text RETURNING v"),
    delKv: db.prepare('DELETE FROM kv WHERE k = ?'),
    setVerified: db.prepare('UPDATE users SET verified = 1 WHERE id = ?'),
    setEmail: db.prepare('UPDATE users SET email = ?, name = ? WHERE id = ?'),
    delUser: db.prepare('DELETE FROM users WHERE id = ?'),
  };
  const hashPass = pw => { const salt = crypto.randomBytes(16); const h = crypto.scryptSync(pw, salt, 64); return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex'); };
  const checkPass = (pw, stored) => { const [, salt, h] = String(stored).split('$'); if (!salt) return false; const a = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64); const b = Buffer.from(h, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  const hash = s => crypto.createHash('sha256').update(s).digest('hex');

  async function createUser({ email, name, password, workspaceId }) {
    const id = 'u_' + crypto.randomBytes(9).toString('base64url');
    await q.addUser.run(id, email.trim().toLowerCase(), name || '', hashPass(password), workspaceId, now());
    return id;
  }
  async function login(email, password) {
    const u = await q.userByEmail.get(String(email || '').trim().toLowerCase());
    if (!u || !checkPass(String(password || ''), u.pass)) return null;
    return u;
  }
  async function startSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    await q.addSession.run(hash(token), userId, now(), now() + 30 * 864e5);
    return token;
  }
  async function session(token) { if (!token) return null; return (await q.session.get(hash(token), now())) || null; }
  async function endSession(token) { if (token) await q.delSession.run(hash(token)); }
  async function startReset(email) {
    const u = await q.userByEmail.get(String(email || '').trim().toLowerCase()); if (!u) return null;
    const token = crypto.randomBytes(24).toString('base64url'); await q.addReset.run(hash(token), u.id, now() + 3600e3);
    return { token, user: u };
  }
  async function finishReset(token, password) {
    const r = await q.takeReset.get(hash(String(token || '')), now()); if (!r) return null;
    await q.setPass.run(hashPass(password), r.user_id); await q.delUserSessions.run(r.user_id);
    return q.user.get(r.user_id);
  }

  // Passwordless sign-in: an emailed link plus a 6-digit code for when the email is opened on another device.
  // Both live in the resets table (prefixed ml: and mc:, so they never match a password reset), work for
  // 15 minutes, and either one used signs in and voids the other. Five wrong codes void both.
  const MAGIC_TTL = 15 * 60e3, MAGIC_TRIES = 5;
  const codeKey = (userId, code) => 'mc:' + crypto.createHmac('sha256', cfg.secret).update(userId + ':' + code).digest('hex');
  const failKey = userId => 'magicfail:' + userId;
  async function startMagic(email) {
    const u = await q.userByEmail.get(String(email || '').trim().toLowerCase()); if (!u) return null;
    await q.sweepResets.run(now()); await q.delMagic.run(u.id); await q.delKv.run(failKey(u.id));
    const token = crypto.randomBytes(32).toString('base64url'), code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    await q.addReset.run('ml:' + hash(token), u.id, now() + MAGIC_TTL);
    await q.addReset.run(codeKey(u.id, code), u.id, now() + MAGIC_TTL);
    return { token, code, user: u };
  }
  async function signedIn(userId) {
    await q.delMagic.run(userId); await q.delKv.run(failKey(userId)); await q.setVerified.run(userId);
    return q.user.get(userId);
  }
  async function finishMagicLink(token) {
    const r = await q.takeReset.get('ml:' + hash(String(token || '')), now());
    return r ? signedIn(r.user_id) : null;
  }
  async function finishMagicCode(email, code) {
    const u = await q.userByEmail.get(String(email || '').trim().toLowerCase()); if (!u) return null;
    code = String(code || '').replace(/\D/g, ''); if (code.length !== 6) return null;
    const r = await q.takeReset.get(codeKey(u.id, code), now());
    if (r) return signedIn(u.id);
    const f = await q.failMagic.get(failKey(u.id));
    if (+(f && f.v) >= MAGIC_TRIES) await q.delMagic.run(u.id);
    return null;
  }

  // Account page: change password (signs out other devices) and update the sign-in email.
  async function changePassword(userId, current, next) {
    const u = await q.user.get(userId); if (!u || !checkPass(String(current || ''), u.pass)) return false;
    await q.setPass.run(hashPass(next), userId); await q.delUserSessions.run(userId); return true;
  }
  const checkUserPass = async (userId, pw) => { const u = await q.user.get(userId); return !!u && checkPass(String(pw || ''), u.pass); };
  function setEmail(userId, email, name) { return q.setEmail.run(String(email).trim().toLowerCase(), name || '', userId); }
  async function deleteUser(userId) { await q.delUserSessions.run(userId); await q.delUser.run(userId); }

  // Signed tokens for links we send to guests (trip app, unsubscribe, calendar feeds). No table needed.
  const sign = (...parts) => crypto.createHmac('sha256', cfg.secret).update(parts.join('|')).digest('base64url').slice(0, 22);
  const verify = (tok, ...parts) => { const good = sign(...parts); return typeof tok === 'string' && tok.length === good.length && crypto.timingSafeEqual(Buffer.from(tok), Buffer.from(good)); };

  // In-memory rate limiter: key -> timestamps
  const hits = new Map();
  function limit(key, max, perMs) {
    const t = now(); const list = (hits.get(key) || []).filter(x => t - x < perMs);
    if (list.length >= max) { hits.set(key, list); return false; }
    list.push(t); hits.set(key, list); return true;
  }
  const sweep = setInterval(() => { const t = now(); for (const [k, v] of hits) if (!v.some(x => t - x < 3600e3)) hits.delete(k); }, 600e3); if (sweep.unref) sweep.unref();

  return { startMagic, finishMagicLink, finishMagicCode, changePassword, checkUserPass, setEmail, deleteUser, createUser, login, startSession, session, endSession, startReset, finishReset, sign, verify, limit, user: id => q.user.get(id), userByEmail: e => q.userByEmail.get(String(e || '').trim().toLowerCase()) };
};
