import { useMemo } from "react";
import type { Ctx } from "../lib/ctx";
import {
  DAY, STATUS_ORDER, addMonths, allTasks, budgetOf, counted, duration, facilityOf, fmtDate, fmtMonth, money, monthStart, parseDate, plural, progressOf,
  projectStatus, type Status, type Task,
} from "../lib/model";
import { exportCSV, exportJSON } from "../lib/io";
import { Card, Empty, Icon, Meter, StatusChip } from "../components/ui";

const share = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");

export default function Reports({ ctx }: { ctx: Ctx }) {
  const { plan, now } = ctx;
  const d = useMemo(() => {
    const tasks = allTasks(plan, now).filter((r) => counted(r.t));
    const pst = plan.projects.map((p) => projectStatus(plan, p, now).status);
    const status = STATUS_ORDER.map((s) => ({ s, projects: pst.filter((x) => x === s).length, tasks: tasks.filter((r) => r.st.status === s).length }));
    const fac = new Map<string, { projects: Set<string>; tasks: Task[]; late: number; risk: number }>();
    for (const r of tasks) {
      const k = facilityOf(r.p, r.t);
      const g = fac.get(k) ?? { projects: new Set<string>(), tasks: [], late: 0, risk: 0 };
      g.projects.add(r.p.id); g.tasks.push(r.t);
      if (r.st.status === "late") g.late++; if (r.st.status === "risk") g.risk++;
      fac.set(k, g);
    }
    const overdue = tasks.filter((r) => r.st.status === "late").sort((a, b) => (a.e ?? 0) - (b.e ?? 0));
    const m0 = monthStart(now), m1 = addMonths(now, 1);
    const month = tasks.filter((r) => r.e != null && r.e >= m0 && r.e < m1).sort((a, b) => (a.e ?? 0) - (b.e ?? 0));
    // Budget by month: each task's budget spread evenly over its days
    const months = new Map<number, number>();
    const perProject: { name: string; total: number; by: Map<number, number> }[] = [];
    for (const p of plan.projects) {
      const by = new Map<number, number>();
      for (const t of p.tasks) {
        const b = +t.budget || 0, s = parseDate(t.start), n = duration(t);
        if (!b || s == null || !n) continue;
        for (let i = 0; i < n; i++) { const k = monthStart(s + i * DAY); by.set(k, (by.get(k) ?? 0) + b / n); months.set(k, (months.get(k) ?? 0) + b / n); }
      }
      if (by.size) perProject.push({ name: p.name, total: budgetOf(p.tasks), by });
    }
    const keys = [...months.keys()].sort((a, b) => a - b);
    return { tasks, status, fac: [...fac.entries()].sort((a, b) => b[1].tasks.length - a[1].tasks.length), overdue, month, months, keys, perProject, total: budgetOf(plan.projects.flatMap((p) => p.tasks)) };
  }, [plan, now]);

  if (!plan.projects.length) return <Empty title="Nothing to report yet">Reports fill in once the plan has projects and tasks.</Empty>;
  const nP = plan.projects.length, nT = d.tasks.length;
  const openMonth = d.month.filter((r) => r.st.status !== "complete").length;

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="glass flex flex-wrap items-center gap-2.5 p-2.5" style={{ borderRadius: 22 }}>
        <span className="px-2 text-[13px] text-white/75">Figures as of {fmtDate(now)}</span>
        <div className="ml-auto flex flex-wrap gap-2.5">
          <button type="button" className="btn" style={{ borderRadius: 999 }} onClick={() => exportCSV(plan)}><Icon name="transfer" size={16} />Download CSV</button>
          <button type="button" className="btn" style={{ borderRadius: 999 }} onClick={() => exportJSON(plan, ctx.store.meta.version)}><Icon name="transfer" size={16} />Download JSON</button>
        </div>
      </div>

      <div className="grid gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
        <Card id="rp-status" title="By status" sub={`${plural(nP, "project")}, ${plural(nT, "task")}`}>
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="tbl num">
              <thead><tr><th>Status</th><th className="r">Projects</th><th className="r">Share</th><th className="r">Tasks</th><th className="r">Share</th></tr></thead>
              <tbody>
                {d.status.map((x) => (
                  <tr key={x.s}><td><StatusChip status={x.s as Status} /></td><td className="r">{x.projects}</td><td className="r text-white/75">{share(x.projects, nP)}</td><td className="r">{x.tasks}</td><td className="r text-white/75">{share(x.tasks, nT)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>Total</td><td className="r">{nP}</td><td className="r">100%</td><td className="r">{nT}</td><td className="r">100%</td></tr></tfoot>
            </table>
          </div>
        </Card>

        <Card id="rp-fac" title="By facility" sub="Tasks counted where the work happens">
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="tbl num">
              <thead><tr><th>Facility</th><th className="r">Projects</th><th className="r">Tasks</th><th className="r">Late</th><th className="r">At risk</th><th>Progress</th><th className="r">Budget</th><th className="r">Share</th></tr></thead>
              <tbody>
                {d.fac.map(([name, g]) => {
                  const b = budgetOf(g.tasks), pr = progressOf(g.tasks);
                  return (
                    <tr key={name}>
                      <td className="font-semibold">{name}</td><td className="r">{g.projects.size}</td><td className="r">{g.tasks.length}</td>
                      <td className="r" style={{ color: g.late ? "#FFB9A6" : undefined }}>{g.late}</td><td className="r" style={{ color: g.risk ? "#FFD08A" : undefined }}>{g.risk}</td>
                      <td><span className="flex items-center gap-2"><span className="w-16"><Meter value={pr} /></span>{Math.round(pr)}%</span></td>
                      <td className="r">{b ? money(plan, b) : <span className="text-white/45">None</span>}</td><td className="r text-white/75">{share(b, d.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card id="rp-over" title="Overdue" sub={d.overdue.length ? `${plural(d.overdue.length, "task")}, ${share(d.overdue.length, nT)} of all tasks` : "Tasks past their end date or their deadline"}>
        {!d.overdue.length ? <Empty title="Nothing is overdue">Tasks appear here when they pass their end date before reaching 100%, or when they end after their deadline.</Empty> : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="tbl num">
              <thead><tr><th>Task</th><th>Project</th><th>Facility</th><th>Owner</th><th>End</th><th>Progress</th><th>Why</th></tr></thead>
              <tbody>
                {d.overdue.map((r) => (
                  <tr key={r.t.id} className="click" tabIndex={0} onClick={() => ctx.open({ kind: "task", id: r.t.id })} onKeyDown={(e) => { if (e.key === "Enter") ctx.open({ kind: "task", id: r.t.id }); }}>
                    <td className="wrap font-semibold">{r.t.name}</td><td className="wrap text-white/80" style={{ minWidth: 160 }}>{r.p.name}</td><td>{facilityOf(r.p, r.t)}</td>
                    <td>{r.t.owner || r.p.owner || <span className="text-white/45">Not set</span>}</td><td>{fmtDate(r.e)}</td><td>{r.t.progress}%</td><td className="text-white/80">{r.st.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="rp-month" title={`Finishing in ${fmtMonth(now, true)}`} sub={d.month.length ? `${plural(d.month.length, "task")} end this month, ${share(d.month.length, nT)} of all tasks. ${openMonth} still open.` : "Tasks with an end date in this month"}>
        {!d.month.length ? <Empty title="Nothing ends this month">Tasks with an end date in this month are listed here.</Empty> : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="tbl num">
              <thead><tr><th>Task</th><th>Project</th><th>End</th><th>Progress</th><th>Status</th></tr></thead>
              <tbody>
                {d.month.map((r) => (
                  <tr key={r.t.id} className="click" tabIndex={0} onClick={() => ctx.open({ kind: "task", id: r.t.id })} onKeyDown={(e) => { if (e.key === "Enter") ctx.open({ kind: "task", id: r.t.id }); }}>
                    <td className="wrap font-semibold">{r.t.name}</td><td className="wrap text-white/80" style={{ minWidth: 160 }}>{r.p.name}</td><td>{fmtDate(r.e)}</td>
                    <td><span className="flex items-center gap-2"><span className="w-20"><Meter value={r.t.progress} /></span>{r.t.progress}%</span></td><td><StatusChip status={r.st.status} title={r.st.reason} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card id="rp-budget" title="Budget by month" sub="Each task's budget is spread evenly over its days, then added up per month">
        {!d.keys.length ? <Empty title="No budget entered yet">Open a task and fill in its budget. The monthly spread then appears here.</Empty> : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="tbl num">
              <thead><tr><th>Project</th>{d.keys.map((k) => <th key={k} className="r">{fmtMonth(k)}</th>)}<th className="r">Total</th><th className="r">Share</th></tr></thead>
              <tbody>
                {d.perProject.map((p) => (
                  <tr key={p.name}><td className="wrap font-semibold">{p.name}</td>{d.keys.map((k) => <td key={k} className="r">{p.by.get(k) ? money(plan, p.by.get(k)!) : <span className="text-white/30">0</span>}</td>)}<td className="r font-semibold">{money(plan, p.total)}</td><td className="r text-white/75">{share(p.total, d.total)}</td></tr>
                ))}
              </tbody>
              <tfoot><tr><td>All projects</td>{d.keys.map((k) => <td key={k} className="r">{money(plan, d.months.get(k) ?? 0)}</td>)}<td className="r">{money(plan, d.total)}</td><td className="r">100%</td></tr></tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
