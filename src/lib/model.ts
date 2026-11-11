// Data model, dates and status rules for the plan. The stored shape stays compatible with the
// previous single-file Gantt (same field names; new fields are optional and filled by normalize).

export type TaskType = "w" | "src" | "buf" | "ms";
export const TYPE_LABEL: Record<TaskType, string> = { w: "Work", src: "Source (supplier or earlier phase)", buf: "Buffer", ms: "Milestone" };

export interface Task {
  id: string;
  name: string;
  start: string; // YYYY-MM-DD
  end: string;
  type: TaskType;
  owner: string;
  progress: number; // 0 to 100
  budget: string;
  notes: string;
  facility: string; // empty = same as the project
  deadline: string; // empty = none of its own
  risk: boolean; // marked at risk by hand
}

export interface Project {
  id: string;
  name: string;
  status: string; // free text stage, for example "Quotation received"
  owner: string;
  text: string;
  ask: string; // decision needed
  askDue: string;
  deadline: string; // empty = plan deadline
  color: number;
  facility: string;
  tasks: Task[];
}

export interface Plan {
  title: string;
  subtitle: string;
  deadline: string;
  deadlineLabel: string;
  currency: string;
  facilities: string[];
  projects: Project[];
}

export const DAY = 864e5;
export const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- dates (all UTC midnight, weeks start on Monday) ---------- */
export function parseDate(s: string | undefined | null): number | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(s + "T00:00:00Z");
  if (isNaN(t)) return null;
  const y = new Date(t).getUTCFullYear();
  return y >= 2000 && y <= 2100 ? t : null;
}
export const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export function today(): number {
  const n = new Date();
  return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate());
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** The one date format used everywhere: 3 Nov 2026 */
export function fmtDate(t: number | string | null | undefined): string {
  const v = typeof t === "string" ? parseDate(t) : t;
  if (v == null) return "No date";
  const d = new Date(v);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
export const fmtDayMonth = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`; };
export const fmtMonth = (t: number, long = false) => { const d = new Date(t); return `${(long ? MONTHS_LONG : MONTHS)[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
export const monthName = (t: number) => MONTHS[new Date(t).getUTCMonth()];
export const monthStart = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
export const addMonths = (t: number, n: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1); };
export const monday = (t: number) => t - ((new Date(t).getUTCDay() + 6) % 7) * DAY;
export const yearStart = (t: number) => Date.UTC(new Date(t).getUTCFullYear(), 0, 1);
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
export function daysText(d: number): string {
  if (d === 0) return "Today";
  if (d === 1) return "Tomorrow";
  if (d === -1) return "Yesterday";
  return d > 0 ? `In ${d} days` : `${-d} days ago`;
}

/* ---------- normalise ---------- */
const str = (v: unknown) => (v == null ? "" : String(v));
export function normalize(input: unknown): Plan {
  const d = (input && typeof input === "object" ? JSON.parse(JSON.stringify(input)) : {}) as Partial<Plan> & Record<string, unknown>;
  d.title = str(d.title) || "Facility projects";
  d.subtitle = str(d.subtitle);
  d.deadline = parseDate(str(d.deadline)) != null ? str(d.deadline) : "";
  d.deadlineLabel = str(d.deadlineLabel) || "Deadline";
  d.currency = d.currency == null ? "$" : str(d.currency);
  d.projects = Array.isArray(d.projects) ? d.projects : [];
  d.projects.forEach((p, i) => {
    p.id = p.id || uid();
    p.name = str(p.name); p.status = str(p.status); p.owner = str(p.owner); p.text = str(p.text);
    p.ask = str(p.ask); p.askDue = str(p.askDue); p.deadline = str(p.deadline); p.facility = str(p.facility);
    if (p.color == null || isNaN(+p.color)) p.color = i % 8;
    p.tasks = Array.isArray(p.tasks) ? p.tasks : [];
    p.tasks.forEach((t) => {
      t.id = t.id || uid();
      t.name = str(t.name); t.start = str(t.start); t.end = str(t.end) || t.start;
      t.type = (["w", "src", "buf", "ms"] as string[]).includes(t.type) ? t.type : "w";
      t.owner = str(t.owner); t.notes = str(t.notes); t.facility = str(t.facility); t.deadline = str(t.deadline);
      t.progress = Math.max(0, Math.min(100, Math.round(+t.progress || 0)));
      t.budget = t.budget == null || (t.budget as unknown) === 0 ? "" : str(t.budget);
      t.risk = !!t.risk;
      if (t.type === "ms") t.end = t.start;
    });
  });
  const used = new Set<string>();
  d.projects.forEach((p) => { if (p.facility) used.add(p.facility); p.tasks.forEach((t) => t.facility && used.add(t.facility)); });
  const list = (Array.isArray(d.facilities) ? d.facilities : []).map(str).filter(Boolean);
  used.forEach((f) => { if (!list.includes(f)) list.push(f); });
  d.facilities = list;
  return d as Plan;
}

/* ---------- derived values ---------- */
export const UNASSIGNED = "Not set";
export const facilityOf = (p: Project, t?: Task) => (t && t.facility) || p.facility || UNASSIGNED;
export const ownerOf = (p: Project, t?: Task) => (t && t.owner) || p.owner || "";
export const duration = (t: Task) => { const s = parseDate(t.start), e = parseDate(t.end); return s == null || e == null || e < s ? 0 : Math.round((e - s) / DAY) + 1; };
export function span(tasks: Task[]): [number, number] | null {
  let a = Infinity, b = -Infinity;
  for (const t of tasks) { const s = parseDate(t.start), e = parseDate(t.end); if (s != null && e != null && e >= s) { a = Math.min(a, s); b = Math.max(b, e); } }
  return a === Infinity ? null : [a, b];
}
export const counted = (t: Task) => t.type !== "buf";
export function progressOf(tasks: Task[]): number {
  let w = 0, d = 0;
  for (const t of tasks) { if (t.type === "buf" || t.type === "ms") continue; const n = Math.max(1, duration(t)); w += n; d += n * t.progress; }
  return w ? d / w : 0;
}
export const budgetOf = (tasks: Task[]) => tasks.reduce((x, t) => x + (+t.budget || 0), 0);
export const money = (plan: Plan, v: number) => (plan.currency || "") + Math.round(v).toLocaleString("en-US");
export const projectDeadline = (plan: Plan, p: Project) => parseDate(p.deadline) ?? parseDate(plan.deadline);

/* ---------- status ---------- */
export type Status = "late" | "risk" | "track" | "upcoming" | "complete";
export type Tone = "good" | "bad" | "warn" | "plain";
export const STATUS_LABEL: Record<Status, string> = { late: "Late", risk: "At risk", track: "On track", upcoming: "Not started", complete: "Complete" };
export const STATUS_TONE: Record<Status, Tone> = { late: "bad", risk: "warn", track: "good", upcoming: "plain", complete: "good" };
export const STATUS_ORDER: Status[] = ["late", "risk", "track", "upcoming", "complete"];
export const STATUS_COLOR: Record<Status, string> = { late: "#F08A6C", risk: "#FFD08A", track: "#7CC4FF", upcoming: "rgba(255,255,255,0.55)", complete: "#7CC4FF" };

export interface StatusInfo { status: Status; reason: string }

export function taskStatus(plan: Plan, p: Project, t: Task, now = today()): StatusInfo {
  const s = parseDate(t.start), e = parseDate(t.end);
  if (s == null || e == null) return { status: "upcoming", reason: "No dates yet" };
  if (t.progress >= 100) return { status: "complete", reason: "Done" };
  if (t.type === "ms") {
    if (s < now) return { status: "late", reason: `Was due ${daysText(Math.round((s - now) / DAY)).toLowerCase()}` };
    return { status: s - now <= 7 * DAY ? "track" : "upcoming", reason: daysText(Math.round((s - now) / DAY)) };
  }
  const dl = parseDate(t.deadline) ?? projectDeadline(plan, p);
  if (dl != null && e > dl) return { status: "late", reason: `Ends ${plural(Math.round((e - dl) / DAY), "day")} after the deadline` };
  if (e < now) return { status: "late", reason: `Ended ${plural(Math.round((now - e) / DAY), "day")} ago at ${t.progress}%` };
  if (t.risk) return { status: "risk", reason: "Marked at risk" };
  if (s > now) return { status: "upcoming", reason: `Starts ${daysText(Math.round((s - now) / DAY)).toLowerCase()}` };
  const left = Math.round((e - now) / DAY);
  if (left <= 7) return { status: "risk", reason: left === 0 ? `Ends today at ${t.progress}%` : `Ends in ${plural(left, "day")} at ${t.progress}%` };
  const expected = ((now - s + DAY) / (e - s + DAY)) * 100;
  if (expected - t.progress >= 30) return { status: "risk", reason: `Behind schedule, ${t.progress}% done` };
  return { status: "track", reason: `${plural(left, "day")} left` };
}

export function projectStatus(plan: Plan, p: Project, now = today()): StatusInfo {
  const list = p.tasks.filter(counted).map((t) => taskStatus(plan, p, t, now).status);
  if (!list.length) return { status: "upcoming", reason: "No tasks yet" };
  const n = (s: Status) => list.filter((x) => x === s).length;
  if (n("complete") === list.length) return { status: "complete", reason: "All tasks done" };
  if (n("late")) return { status: "late", reason: `${plural(n("late"), "late task")}` };
  if (n("risk")) return { status: "risk", reason: `${plural(n("risk"), "task")} at risk` };
  if (n("track") || n("complete")) return { status: "track", reason: `${n("complete")} of ${list.length} tasks done` };
  return { status: "upcoming", reason: "Not started" };
}

/* ---------- flat views used by several pages ---------- */
export interface TaskRow { p: Project; t: Task; st: StatusInfo; s: number | null; e: number | null }
export function allTasks(plan: Plan, now = today()): TaskRow[] {
  const out: TaskRow[] = [];
  for (const p of plan.projects) for (const t of p.tasks) out.push({ p, t, st: taskStatus(plan, p, t, now), s: parseDate(t.start), e: parseDate(t.end) });
  return out;
}

export interface Marker { kind: "Milestone" | "Deadline" | "Decision"; date: number; title: string; project: Project; task?: Task; done: boolean }
export function markers(plan: Plan): Marker[] {
  const out: Marker[] = [];
  for (const p of plan.projects) {
    const pdone = p.tasks.filter(counted).length > 0 && p.tasks.filter(counted).every((t) => t.progress >= 100);
    const own = parseDate(p.deadline);
    if (own != null) out.push({ kind: "Deadline", date: own, title: `${p.name}: project deadline`, project: p, done: pdone });
    const due = parseDate(p.askDue);
    if (due != null && p.ask) out.push({ kind: "Decision", date: due, title: p.ask, project: p, done: false });
    for (const t of p.tasks) {
      const s = parseDate(t.start);
      if (t.type === "ms" && s != null) out.push({ kind: "Milestone", date: s, title: t.name, project: p, task: t, done: t.progress >= 100 });
      const td = parseDate(t.deadline);
      if (td != null) out.push({ kind: "Deadline", date: td, title: `${t.name}: deadline`, project: p, task: t, done: t.progress >= 100 });
    }
  }
  const pd = parseDate(plan.deadline);
  if (pd != null && plan.projects.length) out.push({ kind: "Deadline", date: pd, title: `${plan.deadlineLabel || "Deadline"} for the whole plan`, project: plan.projects[0], done: false });
  return out.sort((a, b) => a.date - b.date);
}

export function newTask(after?: Task): Task {
  const e = after ? parseDate(after.end) : null;
  const s = e != null ? e + DAY : today();
  return { id: uid(), name: "", start: iso(s), end: iso(s + 13 * DAY), type: "w", owner: "", progress: 0, budget: "", notes: "", facility: "", deadline: "", risk: false };
}
export function newProject(plan: Plan): Project {
  return { id: uid(), name: "", status: "Not started", owner: "", text: "", ask: "", askDue: "", deadline: "", color: plan.projects.length % 8, facility: "", tasks: [] };
}
