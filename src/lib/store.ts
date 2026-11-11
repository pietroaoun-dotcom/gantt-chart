// Plan state: loads the shared plan, keeps every change in this browser straight away, and
// sends it to the shared server a moment later (with a check for someone else saving first).
import { useEffect, useMemo, useReducer, useRef } from "react";
import { normalize, type Plan } from "./model";

const API = "/api/gantt";
const DRAFT = "gantt:draft";
const LOCAL = "gantt:local";
const NAME = "gantt-user"; // same key as the previous version, so names carry over
const POLL_MS = 20000;

export const ls = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* storage full or blocked */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

export interface Doc { data: unknown; version: number; savedBy: string | null; savedAt: string | null }
export interface Meta { version: number; savedBy: string | null; savedAt: string | null }
export type Mode = "loading" | "shared" | "local";
export type SaveState = "idle" | "pending" | "saving" | "saved" | "error" | "conflict" | "needsName";
export interface HistoryItem { version: number; savedBy: string | null; savedAt: string | null }

export interface Store {
  plan: Plan | null;
  mode: Mode;
  meta: Meta;
  save: SaveState;
  error: string;
  loadError: string;
  conflict: Doc | null;
  name: string;
  notice: string;
  canUndo: boolean;
  canRedo: boolean;
  update: (mut: (draft: Plan) => void) => void;
  replace: (plan: Plan) => void;
  undo: () => void;
  redo: () => void;
  retry: () => void;
  reload: () => void;
  resolve: (keep: "mine" | "theirs") => void;
  setName: (n: string) => void;
  clearNotice: () => void;
  history: () => Promise<HistoryItem[]>;
  restore: (version: number) => Promise<void>;
}

interface Inner {
  plan: Plan | null; mode: Mode; meta: Meta; save: SaveState; error: string; loadError: string; conflict: Doc | null;
  name: string; notice: string; savedSnap: string; undo: string[]; redo: string[]; timer: number; busy: boolean;
}

export function usePlan(): Store {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const r = useRef<Inner>({
    plan: null, mode: "loading", meta: { version: 0, savedBy: null, savedAt: null }, save: "idle", error: "", loadError: "", conflict: null,
    name: ls.get(NAME) ?? "", notice: "", savedSnap: "", undo: [], redo: [], timer: 0, busy: false,
  }).current;

  const api = useMemo(() => {
    const snap = () => JSON.stringify(r.plan);
    const dirty = () => r.plan != null && snap() !== r.savedSnap;

    function persist() {
      if (!r.plan) return;
      if (r.mode === "local") { ls.set(LOCAL, snap()); return; }
      if (dirty()) ls.set(DRAFT, JSON.stringify({ data: r.plan, baseVersion: r.meta.version, at: Date.now() }));
      else ls.del(DRAFT);
    }
    function loadDoc(doc: Doc) {
      r.plan = normalize(doc.data);
      r.savedSnap = snap();
      r.meta = { version: +doc.version || 0, savedBy: doc.savedBy ?? null, savedAt: doc.savedAt ?? null };
      r.undo = []; r.redo = []; r.conflict = null; r.save = "saved";
      ls.del(DRAFT);
    }
    function schedule() {
      persist();
      if (r.mode !== "shared") { r.save = "saved"; force(); return; }
      if (r.conflict) { r.save = "conflict"; force(); return; }
      if (!dirty()) { r.save = "saved"; force(); return; }
      if (!r.name) { r.save = "needsName"; force(); return; }
      r.save = "pending";
      clearTimeout(r.timer);
      r.timer = window.setTimeout(saveNow, 1200);
      force();
    }
    async function saveNow() {
      if (r.mode !== "shared" || !r.plan || r.conflict) return;
      if (r.busy) { clearTimeout(r.timer); r.timer = window.setTimeout(saveNow, 600); return; }
      if (!dirty()) { r.save = "saved"; force(); return; }
      if (!r.name) { r.save = "needsName"; force(); return; }
      const sent = snap();
      r.busy = true; r.save = "saving"; r.error = ""; force();
      try {
        const res = await fetch(API, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: JSON.parse(sent), baseVersion: r.meta.version, savedBy: r.name, coalesce: true }),
        });
        const j = await res.json().catch(() => ({}));
        if (res.status === 409) { r.conflict = j.doc ?? null; r.save = "conflict"; }
        else if (!res.ok) throw new Error(j.error || `The server replied ${res.status}`);
        else {
          r.meta = { version: j.version, savedBy: j.savedBy, savedAt: j.savedAt };
          r.savedSnap = sent;
          r.save = "saved";
        }
      } catch (e) {
        r.save = "error";
        r.error = e instanceof Error ? e.message : String(e);
      }
      r.busy = false;
      persist();
      if (r.save === "saved" && dirty()) schedule(); else force();
    }
    async function load() {
      r.loadError = ""; r.mode = "loading"; force();
      try {
        const res = await fetch(API, { cache: "no-store" });
        const j = await res.json().catch(() => ({}));
        if (res.status === 503 || j.configured === false) throw new Error("offline-store");
        if (!res.ok) throw new Error(j.error || `The server replied ${res.status}`);
        r.mode = "shared";
        if (j.doc) loadDoc(j.doc as Doc);
        else { r.plan = normalize({ projects: [] }); r.savedSnap = snap(); r.save = "saved"; }
        // Unsaved work left in this browser from an earlier visit
        let d: { data: unknown; baseVersion: number } | null = null;
        try { d = JSON.parse(ls.get(DRAFT) ?? "null"); } catch { /* ignore */ }
        if (d && d.data) {
          const mine = normalize(d.data);
          if (JSON.stringify(mine) !== r.savedSnap) {
            if (d.baseVersion === r.meta.version) { r.plan = mine; schedule(); }
            else { r.conflict = (j.doc as Doc) ?? null; r.plan = mine; r.save = "conflict"; }
          } else ls.del(DRAFT);
        }
      } catch (e) {
        // No shared storage (or no connection): work in this browser only
        r.mode = "local";
        let local: unknown = null;
        try { local = JSON.parse(ls.get(LOCAL) ?? "null"); } catch { /* ignore */ }
        r.plan = normalize(local ?? { projects: [] });
        r.savedSnap = snap(); r.save = "saved";
        const msg = e instanceof Error ? e.message : String(e);
        r.loadError = msg === "offline-store" ? "" : msg;
      }
      force();
    }
    async function poll() {
      if (r.mode !== "shared" || document.hidden || r.busy || r.conflict) return;
      try {
        const res = await fetch(API, { cache: "no-store" });
        if (!res.ok) return;
        const doc = (await res.json()).doc as Doc | null;
        if (!doc || +doc.version === r.meta.version) return;
        if (!dirty()) { loadDoc(doc); r.notice = `Updated with changes from ${doc.savedBy || "someone"}.`; }
        else { r.conflict = doc; r.save = "conflict"; clearTimeout(r.timer); }
        force();
      } catch { /* try again on the next tick */ }
    }
    function commit(next: Plan) {
      if (!r.plan) return;
      const before = snap();
      const n = normalize(next);
      if (JSON.stringify(n) === before) return;
      r.undo.push(before); if (r.undo.length > 100) r.undo.shift();
      r.redo = [];
      r.plan = n;
      schedule();
    }
    const fetchJson = async (url: string) => {
      const res = await fetch(url, { cache: "no-store" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `The server replied ${res.status}`);
      return j;
    };
    return {
      load, poll,
      update(mut: (d: Plan) => void) { if (!r.plan) return; const next = JSON.parse(snap()) as Plan; mut(next); commit(next); },
      replace(plan: Plan) { commit(plan); },
      undo() { if (!r.undo.length || !r.plan) return; r.redo.push(snap()); r.plan = JSON.parse(r.undo.pop()!); schedule(); },
      redo() { if (!r.redo.length || !r.plan) return; r.undo.push(snap()); r.plan = JSON.parse(r.redo.pop()!); schedule(); },
      retry() { void saveNow(); },
      reload() { void load(); },
      resolve(keep: "mine" | "theirs") {
        const c = r.conflict; if (!c) return;
        if (keep === "theirs") { loadDoc(c); r.notice = "Loaded the latest saved version."; force(); }
        else { r.meta = { ...r.meta, version: +c.version || 0 }; r.conflict = null; schedule(); }
      },
      setName(n: string) { r.name = n.trim().slice(0, 60); if (r.name) ls.set(NAME, r.name); else ls.del(NAME); schedule(); },
      clearNotice() { r.notice = ""; force(); },
      async history() { return (await fetchJson(API + "?history=1")).items as HistoryItem[]; },
      async restore(version: number) { const j = await fetchJson(`${API}?version=${version}`); commit(normalize(j.doc.data)); },
      pending: () => r.save === "pending" || r.save === "saving",
    };
  }, [r]);

  useEffect(() => {
    void api.load();
    const t = window.setInterval(api.poll, POLL_MS);
    const vis = () => { if (!document.hidden) void api.poll(); };
    const leave = (e: BeforeUnloadEvent) => { if (api.pending()) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("beforeunload", leave);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); window.removeEventListener("beforeunload", leave); };
  }, [api]);

  return {
    plan: r.plan, mode: r.mode, meta: r.meta, save: r.save, error: r.error, loadError: r.loadError, conflict: r.conflict,
    name: r.name, notice: r.notice, canUndo: r.undo.length > 0, canRedo: r.redo.length > 0,
    update: api.update, replace: api.replace, undo: api.undo, redo: api.redo, retry: api.retry, reload: api.reload,
    resolve: api.resolve, setName: api.setName, clearNotice: api.clearNotice, history: api.history, restore: api.restore,
  };
}
