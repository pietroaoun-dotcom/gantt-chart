// Export (JSON, CSV) and import (replace or merge) of the plan.
import { TYPE_LABEL, duration, facilityOf, normalize, ownerOf, taskStatus, STATUS_LABEL, uid, type Plan, type Project, type Task, type TaskType } from "./model";

function download(name: string, content: string, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const stamp = () => { const n = new Date(), p = (v: number) => String(v).padStart(2, "0"); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; };

export function exportJSON(plan: Plan, version: number) {
  download(`holdal-gantt_${stamp()}.json`, JSON.stringify({ format: "gantt-backup", exportedAt: new Date().toISOString(), version, data: plan }, null, 1), "application/json");
}

const CSV_HEAD = ["Project", "Stage", "Facility", "Task", "Type", "Owner", "Start", "End", "Days", "Progress %", "Status", "Deadline", "Budget", "Notes"];
export function exportCSV(plan: Plan) {
  const rows: (string | number)[][] = [CSV_HEAD];
  for (const p of plan.projects) for (const t of p.tasks)
    rows.push([p.name, p.status, facilityOf(p, t), t.name, TYPE_LABEL[t.type], ownerOf(p, t), t.start, t.end, duration(t), t.progress, STATUS_LABEL[taskStatus(plan, p, t).status], t.deadline || p.deadline, t.budget, t.notes]);
  const cell = (v: string | number) => { const s = String(v ?? ""); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  download(`holdal-gantt_${stamp()}.csv`, "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"), "text/csv;charset=utf-8");
}

/* ---------- import ---------- */
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cur = "", q = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cur); cur = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else cur += c;
  }
  row.push(cur);
  if (row.some((x) => x !== "")) rows.push(row);
  return rows;
}

const TYPE_FROM: Record<string, TaskType> = { work: "w", source: "src", sourcing: "src", buffer: "buf", milestone: "ms" };

/** Reads a backup (.json) or a task sheet (.csv) and returns it as a plan. Ids are matched to
 *  the current plan by name for CSV, so a merge updates rows instead of duplicating them. */
export function readImport(name: string, text: string, current: Plan): Plan {
  if (/\.csv$/i.test(name) || !text.trim().startsWith("{")) {
    const rows = parseCSV(text);
    if (rows.length < 2) throw new Error("The file has no task rows");
    const head = rows[0].map((h) => h.trim().toLowerCase());
    const col = (n: string) => head.indexOf(n);
    if (col("project") < 0 || col("task") < 0) throw new Error("The sheet needs at least a Project column and a Task column");
    const get = (r: string[], n: string) => (col(n) >= 0 ? (r[col(n)] ?? "").trim() : "");
    const projects: Project[] = [];
    for (const r of rows.slice(1)) {
      const pname = get(r, "project"), tname = get(r, "task");
      if (!pname || !tname) continue;
      let p = projects.find((x) => x.name === pname);
      if (!p) {
        const old = current.projects.find((x) => x.name === pname);
        p = { ...(old ? { ...old, tasks: [] } : { id: uid(), name: pname, status: "", owner: "", text: "", ask: "", askDue: "", deadline: "", color: projects.length % 8, facility: "", tasks: [] }) };
        if (get(r, "stage")) p.status = get(r, "stage");
        projects.push(p);
      }
      const oldP = current.projects.find((x) => x.id === p!.id);
      const oldT = oldP?.tasks.find((x) => x.name === tname);
      const typeKey = get(r, "type").toLowerCase().split(/[ (]/)[0];
      const fac = get(r, "facility");
      const t: Task = {
        ...(oldT ?? { id: uid(), notes: "", budget: "", owner: "", facility: "", deadline: "", risk: false, progress: 0, type: "w" as TaskType, start: "", end: "", name: tname }),
        name: tname,
        start: get(r, "start") || oldT?.start || "",
        end: get(r, "end") || oldT?.end || "",
        type: TYPE_FROM[typeKey] ?? oldT?.type ?? "w",
        owner: col("owner") >= 0 ? get(r, "owner") : oldT?.owner ?? "",
        progress: col("progress %") >= 0 ? +get(r, "progress %") || 0 : oldT?.progress ?? 0,
        budget: col("budget") >= 0 ? get(r, "budget") : oldT?.budget ?? "",
        notes: col("notes") >= 0 ? get(r, "notes") : oldT?.notes ?? "",
      };
      if (fac) { if (!p.facility) p.facility = fac; else if (fac !== p.facility) t.facility = fac; }
      p.tasks.push(t);
    }
    if (!projects.length) throw new Error("No rows with both a project and a task were found");
    return normalize({ ...current, projects });
  }
  let j: unknown;
  try { j = JSON.parse(text); } catch { throw new Error("The file is not valid JSON"); }
  const obj = j as { data?: { projects?: unknown }; projects?: unknown };
  const data = obj && obj.data && Array.isArray(obj.data.projects) ? obj.data : obj;
  if (!data || !Array.isArray((data as { projects?: unknown }).projects)) throw new Error("This file is not a Gantt backup");
  return normalize(data);
}

export interface ImportDiff { added: number; changed: number; unchanged: number; missing: number; projectsAdded: number }
export function diffImport(current: Plan, incoming: Plan): ImportDiff {
  const cur = new Map<string, string>();
  current.projects.forEach((p) => p.tasks.forEach((t) => cur.set(t.id, JSON.stringify(t))));
  const seen = new Set<string>();
  let added = 0, changed = 0, unchanged = 0;
  incoming.projects.forEach((p) => p.tasks.forEach((t) => {
    seen.add(t.id);
    const old = cur.get(t.id);
    if (old == null) added++; else if (old !== JSON.stringify(t)) changed++; else unchanged++;
  }));
  const curP = new Set(current.projects.map((p) => p.id));
  return { added, changed, unchanged, missing: [...cur.keys()].filter((id) => !seen.has(id)).length, projectsAdded: incoming.projects.filter((p) => !curP.has(p.id)).length };
}

/** Merge: tasks in the file are added or updated; nothing in the current plan is removed. */
export function mergeImport(current: Plan, incoming: Plan): Plan {
  const out = normalize(current);
  for (const ip of incoming.projects) {
    const p = out.projects.find((x) => x.id === ip.id);
    if (!p) { out.projects.push(ip); continue; }
    const { tasks, ...fields } = ip;
    Object.assign(p, fields);
    for (const it of tasks) {
      const i = p.tasks.findIndex((x) => x.id === it.id);
      if (i >= 0) p.tasks[i] = it; else p.tasks.push(it);
    }
  }
  return normalize(out);
}
