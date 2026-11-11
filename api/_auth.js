// Sign-in helpers shared by the cloud functions (files starting with "_" are not routes).
// Same scheme as the Holdal Energy Monitor: accounts are created by an administrator (just a name), the person
// chooses a password at first sign-in. A session is a random token kept in Redis; the browser holds it in an
// HttpOnly cookie. Passwords are stored only as a salted PBKDF2 hash.
import { randomBytes } from 'node:crypto';

export const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
export const TOK = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
export const USERS = 'gantt:users', SESS = 'gantt:sess:', SEEN = 'gantt:seen', LOG = 'gantt:log';
export const OWNERS = ['pietro aoun'];   // always an administrator; may claim the first account while the list is empty
export const isOwner = (k) => OWNERS.indexOf(k) >= 0;
const COOKIE = 'gantt_s';
export const SESSION_S = 400 * 86400;

export async function redis(cmd) {
  const r = await fetch(URL_, { method: 'POST', headers: { Authorization: 'Bearer ' + TOK, 'Content-Type': 'application/json' }, body: JSON.stringify(cmd) });
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}
export const nameKey = (n) => String(n || '').trim().replace(/\s+/g, ' ').toLowerCase();
function tokenOf(req) {
  const m = String(req.headers.cookie || '').match(/(?:^|;\s*)gantt_s=([a-f0-9]{48})(?:;|$)/);
  return m ? m[1] : '';
}
export function setCookie(res, t) { res.setHeader('Set-Cookie', COOKIE + '=' + t + '; Path=/; Max-Age=' + SESSION_S + '; HttpOnly; Secure; SameSite=Lax'); }
export function clearCookie(res) { res.setHeader('Set-Cookie', COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'); }
export async function newSession(k) {
  const t = randomBytes(24).toString('hex');
  await redis(['SET', SESS + t, k + '|' + Date.now(), 'EX', String(SESSION_S)]);
  return t;
}
/** Who is signed in (null if nobody). renew: extend the session and note when the person was last seen. */
export async function whoAmI(req, renew) {
  const t = tokenOf(req); if (!t) return null;
  const v = await redis(['GET', SESS + t]); if (!v) return null;
  const bar = String(v).lastIndexOf('|'), k = String(v).slice(0, bar), issued = Number(String(v).slice(bar + 1)) || 0;
  const u = await redis(['HGET', USERS, k]); if (!u) return null;
  const o = JSON.parse(u);
  if (o.pwAt && issued < o.pwAt) { await redis(['DEL', SESS + t]); return null; }   // password changed or reset since
  if (renew) { await redis(['EXPIRE', SESS + t, String(SESSION_S)]); await redis(['HSET', SEEN, k, new Date().toISOString()]); }
  return { key: k, name: o.name, admin: !!o.admin || isOwner(k), token: t };
}
export async function log(action, by, extra) {
  await redis(['LPUSH', LOG, JSON.stringify(Object.assign({ at: new Date().toISOString(), action, by }, extra || {}))]);
  await redis(['LTRIM', LOG, '0', '1999']);
}
