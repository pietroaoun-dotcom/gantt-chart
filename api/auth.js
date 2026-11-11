// /api/auth — accounts and sign-in for the Gantt (same rules as the Holdal Energy Monitor).
// GET  ?me                                   -> { me: { name, admin } } or 401
// POST {action:'login', name, pass}          -> { ok, me } · { setup: true, name } when the account waits for a password
//      {action:'setPassword', name, pass, pass2}   first password, or new one after an administrator reset
//      {action:'logout'}
//      administrator: {action:'users'} · {action:'addUser', name, admin} · {action:'resetUser', name}
//                     {action:'setAdmin', name, admin} · {action:'removeUser', name} · {action:'activity'}
import { randomBytes, pbkdf2Sync, timingSafeEqual } from 'node:crypto';
import { URL_, TOK, USERS, SESS, SEEN, LOG, isOwner, redis, nameKey, whoAmI, newSession, setCookie, clearCookie, log } from './_auth.js';

const NAME = /^[\p{L}][\p{L} .'\-]{1,39}$/u;
const FAIL = 'gantt:fail:';
const hash = (pass, salt) => pbkdf2Sync(String(pass), Buffer.from(salt, 'hex'), 120000, 32, 'sha256').toString('hex');
function same(a, b) { const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex'); return x.length === y.length && timingSafeEqual(x, y); }
const ipOf = (req) => String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '').split(',')[0].trim().slice(0, 64) || 'unknown';
const over = async (key, max) => (Number(await redis(['GET', key])) || 0) >= max;
const bump = async (key, ttl) => { await redis(['INCR', key]); await redis(['EXPIRE', key, String(ttl)]); };
const pub = (o, k) => ({ name: o.name, admin: !!o.admin || isOwner(k) });
async function signIn(res, k) { setCookie(res, await newSession(k)); await redis(['HSET', SEEN, k, new Date().toISOString()]); }

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOK) return res.status(503).json({ error: 'Storage is not connected.' });
  try {
    if (req.method === 'GET') {
      const me = await whoAmI(req, true);
      if (!me) { clearCookie(res); return res.status(401).json({ error: 'Please sign in.', me: null }); }
      setCookie(res, me.token);
      return res.status(200).json({ me: { name: me.name, admin: me.admin } });
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); return res.status(405).json({ error: 'Method not allowed' }); }
    let b = req.body;
    if (typeof b === 'string') { try { b = JSON.parse(b); } catch { return res.status(400).json({ error: 'The request is not valid.' }); } }
    b = b || {};

    if (b.action === 'login') {
      const k = nameKey(b.name), ipk = FAIL + 'ip:' + ipOf(req);
      if ((await over(FAIL + k, 5)) || (await over(ipk, 25))) return res.status(429).json({ error: 'Too many wrong passwords. Try again in 15 minutes.' });
      let u = k ? await redis(['HGET', USERS, k]) : null;
      // The very first account: while the list is empty, the owner's name starts it
      if (!u && isOwner(k) && !(Number(await redis(['HLEN', USERS])) || 0)) {
        const first = { name: String(b.name).trim().replace(/\s+/g, ' '), setup: true, admin: true, created: new Date().toISOString() };
        await redis(['HSET', USERS, k, JSON.stringify(first)]);
        u = JSON.stringify(first);
      }
      const o = u ? JSON.parse(u) : null;
      if (o && o.setup) return res.status(200).json({ setup: true, name: o.name });
      if (!String(b.pass || '')) return res.status(401).json({ error: 'Enter your password.' });
      if (!o || !o.salt || !same(hash(b.pass, o.salt), o.hash)) {
        await bump(FAIL + k, 900); await bump(ipk, 900);
        return res.status(401).json({ error: 'Name or password not recognised.' });
      }
      await redis(['DEL', FAIL + k]);
      await signIn(res, k);
      return res.status(200).json({ ok: true, me: pub(o, k) });
    }
    if (b.action === 'setPassword') {
      const k = nameKey(b.name), ipk = FAIL + 'set:' + ipOf(req);
      if (await over(ipk, 25)) return res.status(429).json({ error: 'Too many tries. Try again in 15 minutes.' });
      const u = k ? await redis(['HGET', USERS, k]) : null, o = u ? JSON.parse(u) : null;
      if (!o || !o.setup) { await bump(ipk, 900); return res.status(401).json({ error: 'This account already has a password. Sign in with it, or ask an administrator to reset it.' }); }
      const p = String(b.pass || '');
      if (p.length < 6) return res.status(400).json({ error: 'Choose a password of at least 6 characters.' });
      if (p !== String(b.pass2 == null ? '' : b.pass2)) return res.status(400).json({ error: 'The two passwords are not the same.' });
      const salt = randomBytes(16).toString('hex');
      Object.assign(o, { salt, hash: hash(p, salt), pwAt: Date.now() }); delete o.setup;
      await redis(['HSET', USERS, k, JSON.stringify(o)]); await redis(['DEL', FAIL + k]);
      await log('password-set', o.name);
      await signIn(res, k);
      return res.status(200).json({ ok: true, me: pub(o, k) });
    }
    const me = await whoAmI(req);
    if (b.action === 'logout') { if (me) await redis(['DEL', SESS + me.token]); clearCookie(res); return res.status(200).json({ ok: true }); }

    if (['users', 'addUser', 'resetUser', 'setAdmin', 'removeUser', 'activity'].indexOf(b.action) >= 0) {
      if (!me || !me.admin) return res.status(403).json({ error: 'Only an administrator can do this.' });
      if (b.action === 'users') {
        const all = (await redis(['HGETALL', USERS])) || [], seen = (await redis(['HGETALL', SEEN])) || [], last = {};
        for (let i = 0; i + 1 < seen.length; i += 2) last[seen[i]] = seen[i + 1];
        const users = [];
        for (let i = 0; i + 1 < all.length; i += 2) { const o = JSON.parse(all[i + 1]); users.push({ name: o.name, admin: !!o.admin || isOwner(all[i]), owner: isOwner(all[i]), waiting: !!o.setup, lastSeen: last[all[i]] || null }); }
        users.sort((a, b2) => a.name.localeCompare(b2.name));
        return res.status(200).json({ users });
      }
      if (b.action === 'activity') {
        const raw = (await redis(['LRANGE', LOG, '0', '99'])) || [];
        return res.status(200).json({ items: raw.map((s) => { try { return JSON.parse(s); } catch { return null; } }).filter(Boolean) });
      }
      const name = String(b.name || '').trim().replace(/\s+/g, ' '), k = nameKey(name);
      if (b.action === 'addUser') {
        if (!NAME.test(name)) return res.status(400).json({ error: 'Use a name of 2 to 40 letters.' });
        if (await redis(['HGET', USERS, k])) return res.status(409).json({ error: 'There is already an account with this name.' });
        await redis(['HSET', USERS, k, JSON.stringify({ name, setup: true, admin: !!b.admin, created: new Date().toISOString() })]);
        await log('user-added', me.name, { forName: name });
        return res.status(200).json({ ok: true });
      }
      const u = await redis(['HGET', USERS, k]);
      if (!u) return res.status(404).json({ error: 'No account with this name.' });
      const o = JSON.parse(u);
      if (b.action === 'resetUser') {
        delete o.salt; delete o.hash; o.setup = true; o.pwAt = Date.now();   // pwAt ends every open session
        await redis(['HSET', USERS, k, JSON.stringify(o)]); await redis(['DEL', FAIL + k]);
        await log('password-reset', me.name, { forName: o.name });
        return res.status(200).json({ ok: true });
      }
      if (isOwner(k)) return res.status(400).json({ error: 'This account cannot be changed.' });
      if (b.action === 'setAdmin') {
        o.admin = !!b.admin; await redis(['HSET', USERS, k, JSON.stringify(o)]);
        await log(o.admin ? 'admin-on' : 'admin-off', me.name, { forName: o.name });
        return res.status(200).json({ ok: true });
      }
      await redis(['HDEL', USERS, k]); await redis(['HDEL', SEEN, k]);
      await log('user-removed', me.name, { forName: o.name });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Unknown action.' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
