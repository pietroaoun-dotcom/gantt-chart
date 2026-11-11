// What every page receives, and the shared search and filter logic.
import { facilityOf, ownerOf, projectStatus, taskStatus, type Plan, type Project, type StatusInfo, type Task } from "./model";
import type { Store } from "./store";

export type Page = "overview" | "timeline" | "projects" | "milestones" | "facilities" | "reports" | "settings";
export interface Filters { facility: string; status: string; owner: string }
export const NO_FILTERS: Filters = { facility: "", status: "", owner: "" };

export type Sel =
  | { kind: "task"; id: string }
  | { kind: "project"; id: string }
  | { kind: "newTask"; projectId: string }
  | { kind: "newProject" };

export interface Ctx {
  store: Store;
  plan: Plan;
  now: number;
  page: Page;
  query: string;
  setQuery: (q: string) => void;
  filters: Filters;
  setFilters: (f: Filters) => void;
  sel: Sel | null;
  open: (s: Sel | null) => void;
  go: (p: Page) => void;
  toast: (msg: string, action?: { label: string; fn: () => void }) => void;
}

export interface VisibleProject { p: Project; pst: StatusInfo; tasks: { t: Task; st: StatusInfo }[]; hidden: number }

const has = (s: string, q: string) => s.toLowerCase().includes(q);

/** Projects and tasks that pass the search box and the three filters. */
export function visibleProjects(plan: Plan, now: number, query: string, f: Filters): VisibleProject[] {
  const q = query.trim().toLowerCase();
  const out: VisibleProject[] = [];
  for (const p of plan.projects) {
    const pst = projectStatus(plan, p, now);
    const pq = !q || has(p.name, q) || has(p.owner, q) || has(p.facility, q) || has(p.status, q);
    const rows = p.tasks.map((t) => ({ t, st: taskStatus(plan, p, t, now) }));
    const pass = rows.filter(({ t, st }) =>
      (pq || has(t.name, q) || has(t.owner, q) || has(t.notes, q) || has(t.facility, q)) &&
      (!f.facility || facilityOf(p, t) === f.facility) &&
      (!f.status || st.status === f.status) &&
      (!f.owner || ownerOf(p, t) === f.owner));
    const self = pq && (!f.facility || p.facility === f.facility) && (!f.status || pst.status === f.status) && (!f.owner || p.owner === f.owner);
    // Shown when any task passes, or when the project itself matches (for example an empty project)
    if (!pass.length && !self) continue;
    const tasks = pass.length ? pass : rows;
    out.push({ p, pst, tasks, hidden: p.tasks.length - tasks.length });
  }
  return out;
}

export const filtersOn = (q: string, f: Filters) => !!(q.trim() || f.facility || f.status || f.owner);
export function owners(plan: Plan): string[] {
  const s = new Set<string>();
  plan.projects.forEach((p) => { if (p.owner) s.add(p.owner); p.tasks.forEach((t) => t.owner && s.add(t.owner)); });
  return [...s].sort();
}
