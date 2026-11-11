// Task and project details: slides in from the right on desktop, full height sheet on phones.
// Nothing changes in the plan until Save; Cancel and Escape close without saving.
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Ctx, Sel } from "../lib/ctx";
import {
  DAY, budgetOf, duration, fmtDate, iso, money, newProject, newTask, parseDate, plural, progressOf, projectStatus, span, taskStatus, uid,
  type Plan, type Project, type Task, type TaskType,
} from "../lib/model";
import { Field, Icon, Meter, StatusChip } from "./ui";

const STAGES = ["Not started", "Quotation pending", "Quotation received", "Comparing offers", "Approved", "In progress", "On hold", "Done"];

function find(plan: Plan, sel: Sel): { p?: Project; t?: Task } {
  if (sel.kind === "project") return { p: plan.projects.find((x) => x.id === sel.id) };
  if (sel.kind === "newTask") return { p: plan.projects.find((x) => x.id === sel.projectId) };
  if (sel.kind === "task") for (const p of plan.projects) { const t = p.tasks.find((x) => x.id === sel.id); if (t) return { p, t }; }
  return {};
}

export default function DetailPanel({ ctx, sel }: { ctx: Ctx; sel: Sel }) {
  const { p, t } = find(ctx.plan, sel);
  const ref = useRef<HTMLDivElement>(null);
  const close = () => ctx.open(null);

  useEffect(() => {
    const el = ref.current;
    const prev = document.activeElement as HTMLElement | null;
    (el?.querySelector("[data-autofocus]") as HTMLElement | null)?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector("dialog[open]")) { e.preventDefault(); ctx.open(null); } };
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); prev?.focus?.(); };
  }, [sel.kind, "id" in sel ? sel.id : "", ctx.open]); // eslint-disable-line react-hooks/exhaustive-deps

  // The item was deleted elsewhere (undo, or someone else's save): nothing to show
  const missing = (sel.kind === "task" && !t) || (sel.kind === "project" && !p) || (sel.kind === "newTask" && !p);
  useEffect(() => { if (missing) ctx.open(null); }, [missing, ctx]);
  if (missing) return null;

  const isTask = sel.kind === "task" || sel.kind === "newTask";
  const title = sel.kind === "newTask" ? "New task" : sel.kind === "newProject" ? "New project" : isTask ? "Task details" : "Project details";
  return (
    <>
      <div className="scrim" onClick={close} aria-hidden="true" />
      <div ref={ref} className="panel" role="dialog" aria-modal="true" aria-labelledby="panel-title">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            {isTask && p && <span className="muted truncate text-xs">{p.name || "Untitled project"}</span>}
            <h2 id="panel-title" className="display m-0 text-xl font-semibold">{title}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={close} aria-label="Close without saving"><Icon name="x" size={18} /></button>
        </div>
        {isTask
          ? <TaskForm key={sel.kind === "task" ? sel.id : "new"} ctx={ctx} project={p!} task={t} />
          : <ProjectForm key={sel.kind === "project" ? sel.id : "new"} ctx={ctx} project={p} />}
      </div>
    </>
  );
}

/* ---------- task ---------- */
function TaskForm({ ctx, project, task }: { ctx: Ctx; project: Project; task?: Task }) {
  const { plan, store } = ctx;
  const base = task ?? newTask(project.tasks[project.tasks.length - 1]);
  const [f, setF] = useState(() => ({
    name: base.name, projectId: project.id, facility: base.facility, owner: base.owner, start: base.start, end: base.end,
    progress: String(base.progress), status: base.risk ? "risk" : "auto", deadline: base.deadline, notes: base.notes,
    milestone: base.type === "ms", kind: (base.type === "ms" ? "w" : base.type) as TaskType, budget: base.budget,
  }));
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const s = parseDate(f.start), e = parseDate(f.milestone ? f.start : f.end), pr = Number(f.progress);
  const errors = {
    name: f.name.trim() ? "" : "Give the task a name.",
    start: s == null ? "Choose a start date." : "",
    end: f.milestone ? "" : e == null ? "Choose an end date." : s != null && e < s ? "The end date must be on or after the start date." : "",
    progress: f.progress.trim() === "" || !Number.isFinite(pr) || pr < 0 || pr > 100 ? "Progress is a number from 0 to 100." : "",
    deadline: f.deadline && parseDate(f.deadline) == null ? "This date is not valid." : "",
    budget: f.budget && (!Number.isFinite(Number(f.budget)) || Number(f.budget) < 0) ? "Budget is a number, zero or more." : "",
  };
  const invalid = Object.values(errors).some(Boolean);
  const show = (k: keyof typeof errors) => (tried || (k === "end" && !!f.end && !!f.start) || (k === "progress" && f.progress !== "") ? errors[k] : "");

  function submit(ev: FormEvent) {
    ev.preventDefault();
    setTried(true);
    if (invalid) return;
    const next: Task = {
      ...base, name: f.name.trim(), facility: f.facility.trim(), owner: f.owner.trim(), start: f.start, end: f.milestone ? f.start : f.end,
      progress: Math.round(pr), risk: f.status === "risk", deadline: f.deadline, notes: f.notes, type: f.milestone ? "ms" : f.kind, budget: f.budget.trim(),
    };
    store.update((d) => {
      for (const p of d.projects) p.tasks = p.tasks.filter((x) => x.id !== next.id || p.id === f.projectId);
      const p = d.projects.find((x) => x.id === f.projectId); if (!p) return;
      const i = p.tasks.findIndex((x) => x.id === next.id);
      if (i >= 0) p.tasks[i] = next; else p.tasks.push(next);
    });
    ctx.toast(task ? "Task saved." : "Task added.");
    ctx.open(null);
  }
  function remove() {
    if (!task) return;
    store.update((d) => { for (const p of d.projects) p.tasks = p.tasks.filter((x) => x.id !== task.id); });
    ctx.toast(`Deleted "${task.name || "task"}".`, { label: "Undo", fn: store.undo });
    ctx.open(null);
  }
  function duplicate() {
    if (!task) return;
    const copy: Task = { ...task, id: uid(), name: task.name + " (copy)" };
    store.update((d) => { const p = d.projects.find((x) => x.id === project.id); if (!p) return; const i = p.tasks.findIndex((x) => x.id === task.id); p.tasks.splice(i + 1, 0, copy); });
    ctx.open({ kind: "task", id: copy.id });
  }
  const st = task ? taskStatus(plan, project, task, ctx.now) : null;
  const days = s != null && e != null && e >= s ? Math.round((e - s) / DAY) + 1 : 0;

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {st && task && task.type !== "buf" && (
          <div className="tile flex flex-wrap items-center gap-2.5 px-3.5 py-3">
            <StatusChip status={st.status} />
            <span className="text-[13px] text-white/80">{st.reason}</span>
          </div>
        )}
        <Field label="Name" error={show("name")}>
          <input className="field" data-autofocus value={f.name} onChange={(ev) => set("name", ev.target.value)} aria-invalid={!!show("name")} placeholder="What needs to be done" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Project">
            <select className="field" value={f.projectId} onChange={(ev) => set("projectId", ev.target.value)}>
              {plan.projects.map((p) => <option key={p.id} value={p.id}>{p.name || "Untitled project"}</option>)}
            </select>
          </Field>
          <Field label="Facility" hint={f.facility ? undefined : `Same as the project${project.facility ? ` (${project.facility})` : ""}`}>
            <input className="field" list="facility-list" value={f.facility} onChange={(ev) => set("facility", ev.target.value)} placeholder="Same as the project" />
          </Field>
        </div>
        <label className="flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" checked={f.milestone} onChange={(ev) => set("milestone", ev.target.checked)} />
          This is a milestone (one date, shown as a diamond)
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={f.milestone ? "Date" : "Start"} error={show("start")}>
            <input type="date" className="field num" value={f.start} aria-invalid={!!show("start")}
              onChange={(ev) => {
                // Moving the start keeps the task's length
                const ns = parseDate(ev.target.value), os = parseDate(f.start), oe = parseDate(f.end);
                setF((x) => ({ ...x, start: ev.target.value, end: ns != null && os != null && oe != null && oe >= os ? iso(ns + (oe - os)) : x.end }));
              }} />
          </Field>
          {!f.milestone && (
            <Field label="End" error={show("end")} hint={days ? plural(days, "day") : undefined}>
              <input type="date" className="field num" value={f.end} min={f.start || undefined} aria-invalid={!!show("end")} onChange={(ev) => set("end", ev.target.value)} />
            </Field>
          )}
        </div>
        {!f.milestone && (
          <Field label="Kind of bar">
            <select className="field" value={f.kind} onChange={(ev) => set("kind", ev.target.value as TaskType)}>
              <option value="w">Work</option>
              <option value="src">Source: supplier, quotes or an earlier phase (striped)</option>
              <option value="buf">Buffer: spare time after the work (dashed)</option>
            </select>
          </Field>
        )}
        {(f.milestone || f.kind !== "buf") && (
          <Field label={f.milestone ? "Reached" : "Progress"} error={show("progress")}>
            {f.milestone ? (
              <label className="flex min-h-11 items-center gap-2.5 text-sm font-normal">
                <input type="checkbox" checked={pr >= 100} onChange={(ev) => set("progress", ev.target.checked ? "100" : "0")} />
                This milestone has been reached
              </label>
            ) : (
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100} step={5} value={Number.isFinite(pr) ? Math.max(0, Math.min(100, pr)) : 0} onChange={(ev) => set("progress", ev.target.value)} aria-label="Progress slider" />
                <div className="relative w-24 flex-none">
                  <input className="field num" inputMode="numeric" value={f.progress} onChange={(ev) => set("progress", ev.target.value)} aria-label="Progress in percent" aria-invalid={!!show("progress")} style={{ paddingRight: 28 }} />
                  <span className="absolute top-3 right-3 text-sm text-white/60">%</span>
                </div>
              </div>
            )}
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Owner" hint={f.owner ? undefined : project.owner ? `Same as the project (${project.owner})` : undefined}>
            <input className="field" list="owner-list" value={f.owner} onChange={(ev) => set("owner", ev.target.value)} placeholder="Who is responsible" />
          </Field>
          <Field label="Status">
            <select className="field" value={f.status} onChange={(ev) => set("status", ev.target.value)}>
              <option value="auto">Automatic, from dates and progress</option>
              <option value="risk">Mark as at risk</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deadline" error={show("deadline")} hint="Optional. Shown as a red dashed line.">
            <input type="date" className="field num" value={f.deadline} onChange={(ev) => set("deadline", ev.target.value)} />
          </Field>
          <Field label={`Budget${plan.currency ? ` (${plan.currency})` : ""}`} error={show("budget")}>
            <input className="field num" inputMode="decimal" value={f.budget} onChange={(ev) => set("budget", ev.target.value)} placeholder="0" aria-invalid={!!show("budget")} />
          </Field>
        </div>
        <Field label="Notes">
          <textarea className="field" rows={5} value={f.notes} onChange={(ev) => set("notes", ev.target.value)} placeholder="Supplier, scope, offers, risks" />
        </Field>
        {task && (
          <div className="flex flex-wrap gap-2.5 border-t border-white/10 pt-4">
            <button type="button" className="btn btn-sm" onClick={duplicate}><Icon name="copy" size={15} />Duplicate</button>
            {confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2.5 text-[13px]">
                Delete this task?
                <button type="button" className="btn btn-sm btn-danger" onClick={remove}>Yes, delete it</button>
                <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
              </span>
            ) : <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={15} />Delete</button>}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/10 px-5 py-4">
        {tried && invalid && <span className="err-text mr-auto" role="alert">Fix the marked fields, then save.</span>}
        <button type="button" className="btn" onClick={() => ctx.open(null)}>Cancel</button>
        <button type="submit" className="btn btn-primary">{task ? "Save" : "Add task"}</button>
      </div>
    </form>
  );
}

/* ---------- project ---------- */
function ProjectForm({ ctx, project }: { ctx: Ctx; project?: Project }) {
  const { plan, store } = ctx;
  const base = project ?? newProject(plan);
  const [f, setF] = useState(() => ({ name: base.name, facility: base.facility, owner: base.owner, status: base.status, deadline: base.deadline, text: base.text, ask: base.ask, askDue: base.askDue }));
  const [tried, setTried] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: string) => setF((x) => ({ ...x, [k]: v }));
  const errors = {
    name: f.name.trim() ? "" : "Give the project a name.",
    deadline: f.deadline && parseDate(f.deadline) == null ? "This date is not valid." : "",
    askDue: f.askDue && parseDate(f.askDue) == null ? "This date is not valid." : "",
  };
  const invalid = Object.values(errors).some(Boolean);

  function submit(ev: FormEvent) {
    ev.preventDefault();
    setTried(true);
    if (invalid) return;
    const fields = { name: f.name.trim(), facility: f.facility.trim(), owner: f.owner.trim(), status: f.status.trim(), deadline: f.deadline, text: f.text, ask: f.ask, askDue: f.askDue };
    store.update((d) => {
      const p = d.projects.find((x) => x.id === base.id);
      if (p) Object.assign(p, fields); else d.projects.push({ ...base, ...fields });
    });
    if (project) { ctx.toast("Project saved."); ctx.open(null); }
    else { ctx.toast("Project added. Now add its first task."); ctx.open({ kind: "newTask", projectId: base.id }); }
  }
  function remove() {
    if (!project) return;
    store.update((d) => { d.projects = d.projects.filter((x) => x.id !== project.id); });
    ctx.toast(`Deleted "${project.name || "project"}" and its ${plural(project.tasks.length, "task")}.`, { label: "Undo", fn: store.undo });
    ctx.open(null);
  }
  function move(dir: -1 | 1) {
    if (!project) return;
    store.update((d) => { const i = d.projects.findIndex((x) => x.id === project.id), j = i + dir; if (i < 0 || j < 0 || j >= d.projects.length) return; [d.projects[i], d.projects[j]] = [d.projects[j], d.projects[i]]; });
  }
  const st = project ? projectStatus(plan, project, ctx.now) : null;
  const sp = project ? span(project.tasks) : null;

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
        {project && st && (
          <div className="tile flex flex-col gap-2.5 px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <StatusChip status={st.status} />
              <span className="text-[13px] text-white/80">{st.reason}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1"><Meter value={progressOf(project.tasks)} /></div>
              <span className="num text-[13px] font-semibold">{Math.round(progressOf(project.tasks))}%</span>
            </div>
            <span className="num text-xs text-white/70">
              {sp ? `${fmtDate(sp[0])} to ${fmtDate(sp[1])}` : "No dates yet"}{budgetOf(project.tasks) ? ` · Budget ${money(plan, budgetOf(project.tasks))}` : ""}
            </span>
          </div>
        )}
        <Field label="Name" error={tried ? errors.name : ""}>
          <input className="field" data-autofocus value={f.name} onChange={(ev) => set("name", ev.target.value)} aria-invalid={tried && !!errors.name} placeholder="Project name" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Facility" hint="Pick one or type a new one.">
            <input className="field" list="facility-list" value={f.facility} onChange={(ev) => set("facility", ev.target.value)} placeholder="For example 4th floor" />
          </Field>
          <Field label="Owner">
            <input className="field" list="owner-list" value={f.owner} onChange={(ev) => set("owner", ev.target.value)} placeholder="Who leads it" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stage" hint="Where the project stands, in your words.">
            <input className="field" list="stage-list" value={f.status} onChange={(ev) => set("status", ev.target.value)} placeholder="For example In progress" />
          </Field>
          <Field label="Deadline" error={tried ? errors.deadline : ""} hint={f.deadline ? undefined : plan.deadline ? `Empty uses the plan deadline, ${fmtDate(plan.deadline)}.` : "Optional."}>
            <input type="date" className="field num" value={f.deadline} onChange={(ev) => set("deadline", ev.target.value)} />
          </Field>
        </div>
        <Field label="Summary">
          <textarea className="field" rows={3} value={f.text} onChange={(ev) => set("text", ev.target.value)} placeholder="What the project is and who does it" />
        </Field>
        <Field label="Decision needed">
          <textarea className="field" rows={3} value={f.ask} onChange={(ev) => set("ask", ev.target.value)} placeholder="What has to be decided, and by whom" />
        </Field>
        <Field label="Decision due" error={tried ? errors.askDue : ""}>
          <input type="date" className="field num" value={f.askDue} onChange={(ev) => set("askDue", ev.target.value)} />
        </Field>

        {project && (
          <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="display text-base font-semibold">Tasks</span>
              <button type="button" className="btn btn-sm" onClick={() => ctx.open({ kind: "newTask", projectId: project.id })}><Icon name="plus" size={15} />Add task</button>
            </div>
            {!project.tasks.length && <span className="text-[13px] text-white/70">No tasks yet. Add one to put this project on the timeline.</span>}
            {project.tasks.map((t) => {
              const ts = taskStatus(plan, project, t, ctx.now);
              return (
                <button key={t.id} type="button" className="rowbtn" onClick={() => ctx.open({ kind: "task", id: t.id })}>
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-[13.5px] font-semibold">{t.name || "Untitled task"}</span>
                    <span className="num text-xs text-white/65">{t.type === "ms" ? fmtDate(t.start) : `${fmtDate(t.start)} to ${fmtDate(t.end)} · ${plural(duration(t), "day")}`}</span>
                  </span>
                  {t.type !== "buf" && <span className="num text-xs font-semibold text-white/80">{t.progress}%</span>}
                  {t.type !== "buf" ? <StatusChip status={ts.status} title={ts.reason} /> : <span className="chip chip-plain">Buffer</span>}
                </button>
              );
            })}
            <div className="mt-2 flex flex-wrap gap-2.5">
              <button type="button" className="btn btn-sm" onClick={() => move(-1)} aria-label="Move project up in the list"><Icon name="up" size={15} />Move up</button>
              <button type="button" className="btn btn-sm" onClick={() => move(1)} aria-label="Move project down in the list"><Icon name="down" size={15} />Move down</button>
              {confirmDelete ? (
                <span className="flex flex-wrap items-center gap-2.5 text-[13px]">
                  Delete the project and its {plural(project.tasks.length, "task")}?
                  <button type="button" className="btn btn-sm btn-danger" onClick={remove}>Yes, delete it</button>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirmDelete(false)}>Keep it</button>
                </span>
              ) : <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirmDelete(true)}><Icon name="trash" size={15} />Delete project</button>}
            </div>
          </div>
        )}
        <datalist id="stage-list">{STAGES.map((s) => <option key={s} value={s} />)}</datalist>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-white/10 px-5 py-4">
        {tried && invalid && <span className="err-text mr-auto" role="alert">Fix the marked fields, then save.</span>}
        <button type="button" className="btn" onClick={() => ctx.open(null)}>Cancel</button>
        <button type="submit" className="btn btn-primary">{project ? "Save" : "Add project"}</button>
      </div>
    </form>
  );
}
