// /api/gantt.js — Vercel serverless function: shared storage for the Gantt chart.
//
// Storage: a Redis database from the Vercel Marketplace (Upstash), connected to this project.
//   Vercel dashboard -> project -> Storage -> Create Database -> Upstash for Redis -> Connect.
//   That adds KV_REST_API_URL / KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL / _TOKEN) automatically.
//   Redeploy once afterwards so the function picks them up.
//
// Optional: set an EDIT_KEY environment variable to require that key for saving.
//
// GET  /api/gantt              -> { configured, doc: { data, version, savedBy, savedAt } | null }
// GET  /api/gantt?history=1    -> { items: [{ version, savedBy, savedAt }] }   (newest first)
// GET  /api/gantt?version=N    -> { doc }
// POST /api/gantt { data, baseVersion, savedBy }
//      -> 200 { ok, version, savedBy, savedAt }
//      -> 409 { error: "conflict", doc }  when someone else saved since baseVersion

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const DOC = 'gantt:doc';
const HIST = 'gantt:history';
const LEGACY = 'gantt-data'; // key used by the first version of this function
const KEEP = 50;             // saved versions kept in history
const MAX_BYTES = 1_000_000;

async function redis(commands) {
  const r = await fetch(URL_.replace(/\/$/, '') + '/pipeline', {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commands),
  });
  if (!r.ok) throw new Error(`Storage error ${r.status}`);
  const out = await r.json();
  return out.map(x => { if (x.error) throw new Error(x.error); return x.result; });
}

const parse = s => {
  if (s == null) return null;
  if (typeof s === 'object') return s;
  try { return JSON.parse(s); } catch { return null; }
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Edit-Key');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (!URL_ || !TOKEN) {
    return res.status(503).json({
      configured: false,
      error: 'Shared storage is not connected. In Vercel, add an Upstash Redis database to this project and redeploy.',
    });
  }

  try {
    if (req.method === 'GET') {
      const q = req.query || {};

      if (q.history) {
        const [items] = await redis([['LRANGE', HIST, 0, KEEP - 1]]);
        return res.status(200).json({
          items: (items || []).map(parse).filter(Boolean)
            .map(({ version, savedBy, savedAt }) => ({ version, savedBy, savedAt })),
        });
      }

      if (q.version) {
        const want = Number(q.version);
        const [items] = await redis([['LRANGE', HIST, 0, KEEP - 1]]);
        const doc = (items || []).map(parse).find(d => d && d.version === want);
        if (!doc) return res.status(404).json({ error: 'Version not found' });
        return res.status(200).json({ doc });
      }

      const [rawDoc, rawLegacy] = await redis([['GET', DOC], ['GET', LEGACY]]);
      let doc = parse(rawDoc);
      if (!doc) {
        const legacy = parse(rawLegacy);
        if (legacy && Array.isArray(legacy.projects)) doc = { data: legacy, version: 0, savedBy: null, savedAt: null };
      }
      return res.status(200).json({ configured: true, doc });
    }

    if (req.method === 'POST') {
      if (process.env.EDIT_KEY && req.headers['x-edit-key'] !== process.env.EDIT_KEY) {
        return res.status(401).json({ error: 'This chart needs an edit key to save.' });
      }
      let body = req.body;
      if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
      }
      const data = body && body.data;
      if (!data || !Array.isArray(data.projects)) {
        return res.status(400).json({ error: 'Expected { data: { projects: [...] } }' });
      }

      const [rawCur] = await redis([['GET', DOC]]);
      const cur = parse(rawCur);
      const curVersion = cur ? Number(cur.version) || 0 : 0;
      if (Number(body.baseVersion || 0) !== curVersion) {
        return res.status(409).json({ error: 'conflict', doc: cur });
      }

      const doc = {
        data,
        version: curVersion + 1,
        savedBy: String(body.savedBy || 'Someone').trim().slice(0, 60) || 'Someone',
        savedAt: new Date().toISOString(),
      };
      const s = JSON.stringify(doc);
      if (s.length > MAX_BYTES) return res.status(413).json({ error: 'Chart is too large to save' });

      await redis([['SET', DOC, s], ['LPUSH', HIST, s], ['LTRIM', HIST, 0, KEEP - 1]]);
      return res.status(200).json({ ok: true, version: doc.version, savedBy: doc.savedBy, savedAt: doc.savedAt });
    }

    res.setHeader('Allow', 'GET, POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: e.message || 'Server error' });
  }
}
