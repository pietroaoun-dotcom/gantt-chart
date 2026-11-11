// Landing page: the whole plan in one screen.
import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { Ctx } from "../lib/ctx";
import {
  DAY, STATUS_COLOR, STATUS_LABEL, STATUS_ORDER, UNASSIGNED, addMonths, allTasks, budgetOf, counted, daysText, facilityOf, fmtDate, markers, money, monthName, monthStart,
  parseDate, plural, progressOf, projectStatus, span, type Status,
} from "../lib/model";
import { Card, Chip, Empty, Icon, Meter, Ring, StatusChip } from "../components/ui";

const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

export default function Overview({ ctx }: { ctx: Ctx }) {
  const { plan, now } = ctx;
  const d = useMemo(() => {
    const tasks = allTasks(plan, now).filter((r) => counted(r.t));
    const projects = plan.projects.map((p) => ({ p, st: projectStatus(plan, p, now), sp: span(p.tasks), pr: progressOf(p.tasks), budget: budgetOf(p.tasks) }));
    const count = (s: Status) => projects.filter((x) => x.st.status === s).length;
    const byEnd = (a: { e: number | null }, b: { e: number | null }) => (a.e ?? 0) - (b.e ?? 0);
    const late = tasks.filter((r) => r.st.status === "late").sort(byEnd);
    const risk = tasks.filter((r) => r.st.status === "risk").sort(byEnd);
    const m0 = monthStart(now), m1 = addMonths(now, 1);
    const thisMonth = tasks.filter((r) => r.e != null && r.e >= m0 && r.e < m1 && r.st.status !== "complete").sort(byEnd);
    const decisions = plan.projects.filter((p) => p.ask.trim()).map((p) => ({ p, due: parseDate(p.askDue) })).sort((a, b) => (a.due ?? Infinity) - (b.due ?? Infinity));
    const next = markers(plan).filter((m) => !m.done && m.date >= now).slice(0, 6);
    const fac = new Map<string, { n: number; late: number }>();
    for (const x of projects) { const k = facilityOf(x.p); const v = fac.get(k) ?? { n: 0, late: 0 }; v.n++; if (x.st.status === "late") v.late++; fac.set(k, v); }
    const all = plan.projects.flatMap((p) => p.tasks);
    return {
      tasks, projects, count, late, risk, thisMonth, decisions, next,
      fac: [...fac.entries()].sort((a, b) => b[1].n - a[1].n),
      progress: progressOf(all), budget: budgetOf(all), priced: projects.filter((x) => x.budget > 0).length, sp: span(all),
      done: tasks.filter((r) => r.st.status === "complete").length,
    };
  }, [plan, now]);

  if (!plan.projects.length) {
    return (
      <Empty title="The plan is empty" action={<button className="btn btn-primary" onClick={() => ctx.open({ kind: "newProject" })}>Add the first project</button>}>
        Add a project and its tasks, or import a backup from the menu in the header. This page then shows progress, what is late and what comes next.
      </Empty>
    );
  }
  const n = plan.projects.length;
  const dl = parseDate(plan.deadline);
  const attention = [...d.late, ...d.risk];
  const openTasks = d.tasks.length - d.done;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      {/* headline numbers */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <Kpi label="Projects" value={n} chip={<Chip tone="plain">{plural(d.tasks.length, "task")}</Chip>} sub={`${d.count("complete")} complete, ${n - d.count("complete")} open`} />
        <div className="glass flex items-center gap-4 p-[22px]">
          <Ring size={92} r={38} stroke={9} progress={d.progress / 100} color="#58D68D" label={`${Math.round(d.progress)}% of the plan is complete`}>
            <span className="display num text-xl font-bold">{Math.round(d.progress)}%</span>
          </Ring>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[13px] text-white/75">Overall progress</span>
            <span className="num text-sm font-semibold">{d.done} of {plural(d.tasks.length, "task")} done</span>
            <span className="text-xs text-white/65">Weighted by task length</span>
          </div>
        </div>
        <Kpi label="Needs attention" value={d.late.length} unit={d.late.length === 1 ? "late task" : "late tasks"} tone={d.late.length ? "bad" : "good"}
          chip={d.risk.length ? <Chip tone="warn">{d.risk.length} at risk</Chip> : <Chip tone="good">None at risk</Chip>}
          sub={openTasks ? `${pct(d.late.length, openTasks)}% of open tasks are late` : "Nothing open"} />
        <Kpi label="Budget" value={money(plan, d.budget)} chip={<Chip tone="plain">{d.priced} of {n} priced</Chip>} sub={d.priced < n ? `${plural(n - d.priced, "project")} without a price yet` : "Every project has a price"} />
        {dl != null && (
          <Kpi label={plan.deadlineLabel || "Deadline"} value={Math.abs(Math.round((dl - now) / DAY))} unit={dl >= now ? "days to go" : "days ago"} tone={dl >= now ? undefined : "bad"}
            chip={<Chip tone="plain">{fmtDate(dl)}</Chip>} sub={d.sp ? `Last task ends ${fmtDate(d.sp[1])}` : ""} />
        )}
      </div>

      {/* status split */}
      <Card id="ov-status" title="Where the projects stand" sub="Each project takes the status of its most urgent task"
        right={<button className="btn btn-sm" onClick={() => ctx.go("timeline")}>Open the timeline<Icon name="arrow" size={15} /></button>}>
        <div className="flex h-3.5 w-full overflow-hidden rounded-full bg-white/10" role="img"
          aria-label={STATUS_ORDER.map((s) => `${STATUS_LABEL[s]}: ${d.count(s)}`).join(", ")}>
          {STATUS_ORDER.map((s) => d.count(s) > 0 && <span key={s} className="anim-w" style={{ width: pct(d.count(s), n) + "%", background: STATUS_COLOR[s], opacity: s === "complete" ? 0.55 : 1, borderRight: "2px solid #0e1d19" }} />)}
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {STATUS_ORDER.map((s) => (
            <button key={s} type="button" className="rowbtn flex-col !items-start !gap-1.5" onClick={() => { ctx.setFilters({ facility: "", owner: "", status: s }); ctx.go("projects"); }}
              aria-label={`${STATUS_LABEL[s]}: ${plural(d.count(s), "project")}. Show them in the project list.`}>
              <StatusChip status={s} />
              <span className="flex items-baseline gap-2"><span className="display num text-2xl font-semibold">{d.count(s)}</span><span className="num text-xs text-white/65">{pct(d.count(s), n)}%</span></span>
            </button>
          ))}
        </div>
      </Card>

      {/* the plan at a glance */}
      <Glance ctx={ctx} rows={d.projects} />

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 380px), 1fr))" }}>
        <Card id="ov-attn" title="Needs attention" sub={attention.length ? `${plural(d.late.length, "late task")}, ${d.risk.length} at risk` : "Late and at risk tasks appear here"}>
          {!attention.length && <Empty title="Nothing is late or at risk">Tasks show up here when they pass their end date or are due within a week.</Empty>}
          <List>
            {attention.slice(0, 6).map((r) => (
              <Item key={r.t.id} onClick={() => ctx.open({ kind: "task", id: r.t.id })} title={r.t.name} sub={`${r.p.name} · ${r.st.reason}`} right={<StatusChip status={r.st.status} />} />
            ))}
          </List>
          {attention.length > 6 && <More onClick={() => { ctx.setFilters({ facility: "", owner: "", status: "late" }); ctx.go("projects"); }}>Show all {attention.length} in the project list</More>}
        </Card>

        <Card id="ov-month" title={`Finishing in ${monthName(now)}`} sub={d.thisMonth.length ? `${plural(d.thisMonth.length, "open task")}, ${pct(d.thisMonth.length, openTasks)}% of everything open` : "Open tasks that end this month"}>
          {!d.thisMonth.length && <Empty title="Nothing ends this month">Tasks with an end date in this month appear here until they are complete.</Empty>}
          <List>
            {d.thisMonth.slice(0, 6).map((r) => (
              <Item key={r.t.id} onClick={() => ctx.open({ kind: "task", id: r.t.id })} title={r.t.name} sub={`${r.p.name} · ends ${fmtDate(r.e)}`}
                right={<span className="flex w-24 flex-none items-center gap-2"><span className="flex-1"><Meter value={r.t.progress} /></span><span className="num w-8 text-right text-xs font-semibold">{r.t.progress}%</span></span>} />
            ))}
          </List>
          {d.thisMonth.length > 6 && <More onClick={() => ctx.go("reports")}>Show all {d.thisMonth.length} in reports</More>}
        </Card>

        <Card id="ov-dec" title="Decisions waiting" sub={d.decisions.length ? plural(d.decisions.length, "project") + " need a decision" : "Projects with an open decision"}>
          {!d.decisions.length && <Empty title="No decisions waiting">Write what has to be decided in a project's details and it appears here.</Empty>}
          <List>
            {d.decisions.slice(0, 5).map(({ p, due }) => (
              <Item key={p.id} onClick={() => ctx.open({ kind: "project", id: p.id })} title={p.name} sub={p.ask} wrap
                right={due != null ? <Chip tone={due < now ? "bad" : due - now <= 7 * DAY ? "warn" : "plain"}>{due < now ? `Due ${fmtDate(due)}` : daysText(Math.round((due - now) / DAY))}</Chip> : undefined} />
            ))}
          </List>
          {d.decisions.length > 5 && <More onClick={() => ctx.go("projects")}>Show all {d.decisions.length} projects</More>}
        </Card>

        <Card id="ov-next" title="Next milestones and deadlines" sub="The next dates that matter"
          right={<button className="btn btn-sm" onClick={() => ctx.go("milestones")}>See all</button>}>
          {!d.next.length && <Empty title="No dates ahead">Add a milestone or a deadline to a task or project and it appears here.</Empty>}
          <List>
            {d.next.map((m, i) => (
              <Item key={i} onClick={() => ctx.open(m.task ? { kind: "task", id: m.task.id } : { kind: "project", id: m.project.id })} title={m.title} sub={`${m.kind} · ${fmtDate(m.date)}`} wrap
                right={<Chip tone={m.date - now <= 7 * DAY ? "warn" : "plain"}>{daysText(Math.round((m.date - now) / DAY))}</Chip>} />
            ))}
          </List>
        </Card>

        <Card id="ov-fac" title="By facility" sub="Projects in each area"
          right={<button className="btn btn-sm" onClick={() => ctx.go("facilities")}>See all</button>}>
          <div className="flex flex-col gap-2.5">
            {d.fac.slice(0, 8).map(([name, v]) => (
              <button key={name} type="button" className="rowbtn" onClick={() => { if (name !== UNASSIGNED) ctx.setFilters({ status: "", owner: "", facility: name }); ctx.go("timeline"); }}
                aria-label={`${name}: ${plural(v.n, "project")}${v.late ? `, ${v.late} late` : ""}. Show in the timeline.`}>
                <span className="w-32 flex-none truncate text-[13.5px] font-semibold">{name}</span>
                <span className="flex-1"><Meter value={pct(v.n, d.fac[0][1].n)} color="#7CC4FF" label={`${v.n} projects`} /></span>
                <span className="num w-6 text-right text-[13px] font-semibold">{v.n}</span>
                {v.late > 0 && <Chip tone="bad">{v.late} late</Chip>}
              </button>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, unit, chip, sub, tone }: { label: string; value: ReactNode; unit?: string; chip?: ReactNode; sub?: string; tone?: "bad" | "good" }) {
  return (
    <div className="glass flex min-w-0 flex-col gap-2 p-[22px]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[13px] text-white/75">{label}</span>
        {chip}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="display num text-4xl leading-none font-semibold" style={{ color: tone === "bad" ? "#FFB9A6" : undefined }}>{value}</span>
        {unit && <span className="text-[13px] text-white/75">{unit}</span>}
      </div>
      {sub && <span className="num text-xs text-white/68">{sub}</span>}
    </div>
  );
}
const List = ({ children }: { children: ReactNode }) => <div className="flex flex-col gap-2">{children}</div>;
function Item({ title, sub, right, onClick, wrap }: { title: string; sub: string; right?: ReactNode; onClick: () => void; wrap?: boolean }) {
  return (
    <button type="button" className="rowbtn" onClick={onClick}>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-[13.5px] font-semibold">{title || "Untitled"}</span>
        <span className={"num text-xs text-white/68 " + (wrap ? "line-clamp-2" : "truncate")}>{sub}</span>
      </span>
      {right}
    </button>
  );
}
const More = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <div><button type="button" className="btn btn-sm" onClick={onClick}>{children}</button></div>
);

/* One thin bar per project on a month scale: the shape of the whole plan without the detail. */
function Glance({ ctx, rows }: { ctx: Ctx; rows: { p: import("../lib/model").Project; st: import("../lib/model").StatusInfo; sp: [number, number] | null; pr: number }[] }) {
  const { now, plan } = ctx;
  const dated = rows.filter((r) => r.sp);
  if (!dated.length) return null;
  const dl = parseDate(plan.deadline);
  const a = monthStart(Math.min(now, ...dated.map((r) => r.sp![0])));
  const b = addMonths(Math.max(now, dl ?? 0, ...dated.map((r) => r.sp![1])), 1);
  const X = (t: number) => ((t - a) / (b - a)) * 100;
  const months: number[] = [];
  for (let t = a; t < b; t = addMonths(t, 1)) months.push(t);
  const sorted = [...dated].sort((x, y) => x.sp![0] - y.sp![0] || x.sp![1] - y.sp![1]);
  return (
    <Card id="ov-glance" solid title="The plan at a glance" sub={`${fmtDate(a)} to ${fmtDate(b - DAY)}. One bar per project, green shows progress.`}
      right={<button className="btn btn-sm" onClick={() => ctx.go("timeline")}>Open the timeline<Icon name="arrow" size={15} /></button>}>
      <div className="grid items-center gap-x-3 gap-y-1" style={{ gridTemplateColumns: "minmax(96px, 30%) 1fr" }}>
        <span />
        <div className="relative h-6 border-b border-white/10">
          {months.map((m) => <span key={m} className="num absolute top-0 border-l border-white/15 pl-1.5 text-[11px] text-white/65" style={{ left: X(m) + "%" }}>{months.length > 9 && new Date(m).getUTCMonth() % 2 ? "" : monthName(m)}</span>)}
        </div>
        {sorted.map((r) => (
          <button key={r.p.id} type="button" className="col-span-2 grid items-center gap-x-3 rounded-lg border-0 bg-transparent px-0 py-[5px] text-left hover:bg-white/5"
            style={{ gridTemplateColumns: "minmax(96px, 30%) 1fr" }} onClick={() => ctx.open({ kind: "project", id: r.p.id })}
            aria-label={`${r.p.name}: ${fmtDate(r.sp![0])} to ${fmtDate(r.sp![1])}, ${Math.round(r.pr)}% complete, ${STATUS_LABEL[r.st.status]}`}>
            <span className="flex min-w-0 items-center gap-2">
              <span aria-hidden="true" className="h-2 w-2 flex-none rounded-full" style={{ background: STATUS_COLOR[r.st.status] }} />
              <span className="truncate text-[12.5px] text-white/85">{r.p.name}</span>
            </span>
            <span className="relative block h-3">
              {months.map((m) => <i key={m} className="absolute top-[-5px] bottom-[-5px] border-l border-white/5" style={{ left: X(m) + "%" }} />)}
              <span className="absolute top-0 bottom-0 overflow-hidden rounded-full" title={`${STATUS_LABEL[r.st.status]}: ${r.st.reason}`}
                style={{ left: X(r.sp![0]) + "%", width: Math.max(0.8, X(r.sp![1] + DAY) - X(r.sp![0])) + "%", background: `color-mix(in srgb, ${STATUS_COLOR[r.st.status]} 38%, transparent)`, border: `1px solid ${STATUS_COLOR[r.st.status]}` } as CSSProperties}>
                <i className="absolute inset-y-0 left-0 bg-accent" style={{ width: r.pr + "%" }} />
              </span>
              <i className="absolute top-[-5px] bottom-[-5px] w-0.5 bg-accent" style={{ left: X(now) + "%" }} />
              {dl != null && <i className="absolute top-[-5px] bottom-[-5px]" style={{ left: X(dl + DAY) + "%", borderLeft: "2px dashed rgba(240,138,108,.7)" }} />}
            </span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-white/70">
        {STATUS_ORDER.filter((s) => s !== "complete").map((s) => <span key={s} className="flex items-center gap-1.5"><i className="lg" style={{ "--sc": STATUS_COLOR[s] } as CSSProperties} />{STATUS_LABEL[s]}</span>)}
        <span className="flex items-center gap-1.5"><i className="inline-block h-3 w-0.5 bg-accent" />Today</span>
        {dl != null && <span className="flex items-center gap-1.5"><i className="inline-block h-3" style={{ borderLeft: "2px dashed #F08A6C" }} />{plan.deadlineLabel || "Deadline"}, {fmtDate(dl)}</span>}
      </div>
    </Card>
  );
}
