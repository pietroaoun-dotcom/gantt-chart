import { useMemo, useState } from "react";
import { NO_FILTERS, filtersOn, visibleProjects, type Ctx } from "../lib/ctx";
import { STATUS_ORDER, budgetOf, facilityOf, fmtDate, money, ownerOf, parseDate, plural, progressOf, span, type Status } from "../lib/model";
import { Card, Empty, Icon, Meter, SortHead, StatusChip } from "../components/ui";
import { FilterBar } from "../components/Filters";

type View = "projects" | "tasks";
type Key = "name" | "project" | "facility" | "owner" | "stage" | "start" | "end" | "progress" | "status" | "budget";
interface Line { id: string; kind: "project" | "task"; name: string; project: string; facility: string; owner: string; stage: string; start: number | null; end: number | null; progress: number; status: Status; reason: string; budget: number }
const LIMIT = 25;

export default function Projects({ ctx }: { ctx: Ctx }) {
  const { plan, now, query, filters } = ctx;
  const [view, setView] = useState<View>("projects");
  const [sort, setSort] = useState<{ k: Key; dir: 1 | -1 }>({ k: "start", dir: 1 });
  const [all, setAll] = useState(false);

  const lines = useMemo<Line[]>(() => {
    const vis = visibleProjects(plan, now, query, filters);
    const out: Line[] = [];
    for (const v of vis) {
      if (view === "projects") {
        const sp = span(v.p.tasks);
        out.push({ id: v.p.id, kind: "project", name: v.p.name, project: "", facility: facilityOf(v.p), owner: v.p.owner, stage: v.p.status, start: sp?.[0] ?? null, end: sp?.[1] ?? null, progress: progressOf(v.p.tasks), status: v.pst.status, reason: v.pst.reason, budget: budgetOf(v.p.tasks) });
      } else for (const { t, st } of v.tasks) {
        if (t.type === "buf") continue;
        out.push({ id: t.id, kind: "task", name: t.name, project: v.p.name, facility: facilityOf(v.p, t), owner: ownerOf(v.p, t), stage: v.p.status, start: parseDate(t.start), end: parseDate(t.end), progress: t.progress, status: st.status, reason: st.reason, budget: +t.budget || 0 });
      }
    }
    const val = (l: Line): string | number => sort.k === "status" ? STATUS_ORDER.indexOf(l.status) : sort.k === "start" || sort.k === "end" ? l[sort.k] ?? Infinity : l[sort.k];
    return out.sort((a, b) => { const x = val(a), y = val(b); return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir; });
  }, [plan, now, query, filters, view, sort]);

  const shown = all ? lines : lines.slice(0, LIMIT);
  const total = view === "projects" ? plan.projects.length : plan.projects.reduce((n, p) => n + p.tasks.filter((t) => t.type !== "buf").length, 0);
  const H = (k: Key, label: string, right?: boolean) => <SortHead k={k} label={label} sort={sort} setSort={setSort} right={right} />;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="glass flex flex-wrap items-center gap-2.5 p-2.5" style={{ borderRadius: 22 }} role="toolbar" aria-label="List controls">
        <div role="group" aria-label="What to list" className="seg">
          <button type="button" aria-pressed={view === "projects"} onClick={() => { setView("projects"); setAll(false); }}>Projects</button>
          <button type="button" aria-pressed={view === "tasks"} onClick={() => { setView("tasks"); setAll(false); }}>Tasks</button>
        </div>
        <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-white/20 sm:block" />
        <FilterBar ctx={ctx} />
        <button type="button" className="btn btn-primary ml-auto" style={{ borderRadius: 999 }} onClick={() => ctx.open({ kind: "newProject" })}><Icon name="plus" size={16} />Add project</button>
      </div>

      <Card id="pl-title" title={view === "projects" ? "All projects" : "All tasks"}
        sub={filtersOn(query, filters) ? `Showing ${lines.length} of ${total}. Click a row for details, click a column to sort.` : `${plural(total, view === "projects" ? "project" : "task")}. Click a row for details, click a column to sort.`}>
        {!lines.length ? (
          plan.projects.length ? (
            <Empty title="Nothing matches" action={<button className="btn" onClick={() => { ctx.setFilters(NO_FILTERS); ctx.setQuery(""); }}>Clear filters</button>}>Try another facility, status or owner, or clear the search box.</Empty>
          ) : (
            <Empty title="No projects yet" action={<button className="btn btn-primary" onClick={() => ctx.open({ kind: "newProject" })}>Add the first project</button>}>Projects you add appear here with their dates, progress and status.</Empty>
          )
        ) : (
          <>
            <div className="-mx-2 overflow-x-auto px-2">
              <table className="tbl num">
                <thead>
                  <tr>
                    {H("name", view === "projects" ? "Project" : "Task")}
                    {view === "tasks" && H("project", "Project")}
                    {H("facility", "Facility")}{H("owner", "Owner")}
                    {view === "projects" && H("stage", "Stage")}
                    {H("start", "Start")}{H("end", "End")}{H("progress", "Progress")}{H("status", "Status")}{H("budget", "Budget", true)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((l) => (
                    <tr key={l.id} className="click" tabIndex={0} onClick={() => ctx.open({ kind: l.kind, id: l.id })}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ctx.open({ kind: l.kind, id: l.id }); } }}>
                      <td className="wrap font-semibold">{l.name || "Untitled"}</td>
                      {view === "tasks" && <td className="wrap text-white/80" style={{ minWidth: 160 }}>{l.project}</td>}
                      <td>{l.facility}</td>
                      <td>{l.owner || <span className="text-white/45">Not set</span>}</td>
                      {view === "projects" && <td>{l.stage || <span className="text-white/45">Not set</span>}</td>}
                      <td>{l.start != null ? fmtDate(l.start) : <span className="text-white/45">No date</span>}</td>
                      <td>{l.end != null ? fmtDate(l.end) : <span className="text-white/45">No date</span>}</td>
                      <td><span className="flex items-center gap-2"><span className="w-20"><Meter value={l.progress} /></span><span className="w-9 text-right font-semibold">{Math.round(l.progress)}%</span></span></td>
                      <td><StatusChip status={l.status} title={l.reason} /></td>
                      <td className="r">{l.budget ? money(plan, l.budget) : <span className="text-white/45">None</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr><td colSpan={view === "tasks" ? 8 : 8}>Total budget of the rows listed</td><td className="r">{money(plan, lines.reduce((x, l) => x + l.budget, 0))}</td></tr>
                </tfoot>
              </table>
            </div>
            {lines.length > LIMIT && (
              <div><button type="button" className="btn" onClick={() => setAll(!all)}>{all ? `Show the first ${LIMIT}` : `Show all ${lines.length}`}</button></div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
