import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { readFileSync } from "node:fs";

// Local stand-in for api/gantt.js (same contract, kept in memory), so `vite` can be tested
// without touching the shared plan. Seeded from dev/seed.json, a snapshot of the live plan.
function devApi(): Plugin {
  type Doc = { data: unknown; version: number; savedBy: string | null; savedAt: string | null };
  let doc: Doc | null = null;
  const hist: Doc[] = [];
  try {
    doc = JSON.parse(readFileSync(new URL("./dev/seed.json", import.meta.url), "utf8").replace(/^﻿/, "")).doc;
    if (doc) hist.push(doc);
  } catch { /* no seed: start empty */ }
  return {
    name: "dev-api",
    configureServer(server) {
      server.middlewares.use("/api/gantt", (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify(body));
        };
        const q = new URL(req.url ?? "/", "http://x").searchParams;
        if (req.method === "GET") {
          if (q.get("history")) return send(200, { items: hist.map(({ version, savedBy, savedAt }) => ({ version, savedBy, savedAt })) });
          if (q.get("version")) {
            const d = hist.find((h) => h.version === Number(q.get("version")));
            return d ? send(200, { doc: d }) : send(404, { error: "Version not found" });
          }
          return send(200, { configured: true, doc });
        }
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          const b = JSON.parse(raw || "{}");
          const cur = doc ? doc.version : 0;
          if (Number(b.baseVersion || 0) !== cur) return send(409, { error: "conflict", doc });
          const next: Doc = { data: b.data, version: cur + 1, savedBy: String(b.savedBy || "Someone"), savedAt: new Date().toISOString() };
          const merge = b.coalesce && doc && hist[0]?.version === doc.version && doc.savedBy === next.savedBy && Date.now() - Date.parse(doc.savedAt ?? "") < 600000;
          if (merge) hist[0] = next; else hist.unshift(next);
          doc = next;
          send(200, { ok: true, version: next.version, savedBy: next.savedBy, savedAt: next.savedAt });
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devApi()],
});
