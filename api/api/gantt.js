// /api/gantt.js — Vercel Serverless Function
// Stores and returns the chart's JSON data using Vercel KV (a small Redis-like store).
//
// One-time setup (in the Vercel dashboard):
//   1. Open your project -> Storage tab -> Create Database -> KV -> Connect to this project.
//      Vercel adds the KV_* environment variables for you automatically.
//   2. Make sure "@vercel/kv" is listed in package.json (see package.json in this download).
//   3. Redeploy (or just push this file + package.json) so the env vars are picked up.
//
// This file needs no other configuration — Vercel automatically turns any file
// under /api into a serverless endpoint at that same path.

import { kv } from '@vercel/kv';

const KEY = 'gantt-data';

export default async function handler(req, res) {
  // Basic CORS so the page can call this from its own origin without issues.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  if (req.method === 'GET') {
    const data = await kv.get(KEY);
    // null means nothing has been saved yet — the page falls back to its built-in defaults.
    return res.status(200).json({ data: data || null });
  }

  if (req.method === 'POST') {
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return res.status(400).json({ error: 'Invalid JSON' }); }
    }
    if (!body || !Array.isArray(body.projects)) {
      return res.status(400).json({ error: 'Expected an object with a "projects" array' });
    }
    await kv.set(KEY, body);
    return res.status(200).json({ ok: true });
  }

  res.setHeader('Allow', 'GET, POST, OPTIONS');
  return res.status(405).json({ error: 'Method not allowed' });
}
