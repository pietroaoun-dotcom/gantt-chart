import { useMemo } from "react";
import type { Ctx } from "../lib/ctx";
import { STATUS_ORDER, UNASSIGNED, budgetOf, counted, facilityOf, money, plural, progressOf, projectStatus, taskStatus, type Project, type Status, type Task } from "../lib/model";
import { Empty, Icon, Ring, StatTile, StatusChip } from "../components/ui";

export default function Facilities({ ctx }: { ctx: Ctx }) {
  const { plan, now } = ctx;
  const q = ctx.query.trim().toLowerCase();
  const groups = useMemo(() => {
    const m = new Map<string, { projects: Project[]; tasks: Task[]; status: Record<Status, number> }>();
    const get = (k: string) => { let g = m.get(k); if (!g) { g = { projects: [], tasks: [], status: { late: 0, risk: 0, track: 0, upcoming: 0, complete: 0 } }; m.set(k, g); } return g; };
    plan.facilities.forEach(get);
    for (const p of plan.projects) {
      if (!p.tasks.length) get(facilityOf(p)).projects.push(p);
      for (const t of p.tasks) {
        const g = get(facilityOf(p, t));
        if (!g.projects.includes(p)) g.projects.push(p);
        g.tasks.push(t);
        if (counted(t)) g.status[taskStatus(plan, p, t, now).status]++;
      }
    }
    return [...m.entries()].map(([name, g]) => ({ name, ...g })).sort((a, b) => b.tasks.length - a.tasks.length || a.name.localeCompare(b.name));
  }, [plan, now]);
  const list = groups.filter((g) => !q || g.name.toLowerCase().includes(q) || g.projects.some((p) => p.name.toLowerCase().includes(q)));

  if (!groups.length) {
    return <Empty title="No facilities yet" action={<button className="btn" onClick={() => ctx.go("settings")}>Open settings</button>}>Give each project a facility in its details, or add the list of facilities in Settings. Each one then gets a card here.</Empty>;
  }
  if (!list.length) return <Empty title="Nothing matches the search">Clear the search box in the header to see every facility.</Empty>;

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 320px), 1fr))" }}>
      {list.map((g) => {
        const pr = progressOf(g.tasks), budget = budgetOf(g.tasks);
        const worst = STATUS_ORDER.find((s) => g.status[s] > 0);
        const open = g.tasks.filter(counted).length - g.status.complete;
        return (
          <section key={g.name} className="glass flex min-w-0 flex-col gap-4 p-[22px]" aria-label={g.name}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <h2 className="display m-0 truncate text-xl font-semibold">{g.name}</h2>
                <span className="muted text-xs">{plural(g.projects.length, "project")}, {plural(g.tasks.filter(counted).length, "task")}</span>
              </div>
              {worst && g.tasks.length > 0 ? <StatusChip status={g.status.late ? "late" : g.status.risk ? "risk" : worst} /> : <span className="chip chip-plain">No tasks</span>}
            </div>
            <div className="flex items-center gap-4">
              <Ring size={84} r={34} stroke={8} progress={pr / 100} color="#a394ff" label={`${Math.round(pr)}% complete`}>
                <span className="display num text-lg font-bold">{Math.round(pr)}%</span>
              </Ring>
              <div className="grid flex-1 grid-cols-2 gap-2">
                <StatTile label="Late" value={<span style={{ color: g.status.late ? "#FFB9A6" : undefined }}>{g.status.late}</span>} />
                <StatTile label="At risk" value={<span style={{ color: g.status.risk ? "#FFD08A" : undefined }}>{g.status.risk}</span>} />
                <StatTile label="Open tasks" value={open} />
                <StatTile label="Budget" value={budget ? money(plan, budget) : "None"} />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {g.projects.slice(0, 4).map((p) => (
                <button key={p.id} type="button" className="rowbtn !py-2" onClick={() => ctx.open({ kind: "project", id: p.id })}>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{p.name || "Untitled project"}</span>
                  <StatusChip status={projectStatus(plan, p, now).status} />
                </button>
              ))}
              {g.projects.length > 4 && <span className="px-1 text-xs text-white/65">and {g.projects.length - 4} more</span>}
              {!g.projects.length && <span className="px-1 text-[13px] text-white/65">No projects in this facility yet.</span>}
            </div>
            {g.name !== UNASSIGNED && g.projects.length > 0 && (
              <button type="button" className="btn btn-sm mt-auto self-start" onClick={() => { ctx.setFilters({ status: "", owner: "", facility: g.name }); ctx.go("timeline"); }}>
                Show in the timeline<Icon name="arrow" size={15} />
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
}
