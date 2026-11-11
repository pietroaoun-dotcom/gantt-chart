import { useMemo, useState } from "react";
import type { Ctx } from "../lib/ctx";
import { DAY, daysText, facilityOf, fmtDate, markers, plural } from "../lib/model";
import { Card, Chip, Empty } from "../components/ui";

export default function Milestones({ ctx }: { ctx: Ctx }) {
  const { plan, now } = ctx;
  const [past, setPast] = useState(false);
  const [kind, setKind] = useState<"all" | "Milestone" | "Deadline" | "Decision">("all");
  const q = ctx.query.trim().toLowerCase();
  const all = useMemo(() => markers(plan), [plan]);
  const list = all.filter((m) => (kind === "all" || m.kind === kind) && (past || m.date >= now || !m.done) && (!q || m.title.toLowerCase().includes(q) || m.project.name.toLowerCase().includes(q)));
  const overdue = list.filter((m) => !m.done && m.date < now).length;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="glass flex flex-wrap items-center gap-2.5 p-2.5" style={{ borderRadius: 22 }} role="toolbar" aria-label="Milestone controls">
        <div role="group" aria-label="Kind" className="seg">
          {(["all", "Milestone", "Deadline", "Decision"] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}>{k === "all" ? "All" : k + "s"}</button>)}
        </div>
        <label className="ml-1 flex min-h-11 items-center gap-2.5 text-sm">
          <input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} />
          Show reached ones too
        </label>
      </div>
      <Card id="ms-title" title="Dates that matter" sub={list.length ? `${plural(list.length, "date")}, sorted by date${overdue ? `. ${overdue} overdue.` : "."}` : "Milestones, deadlines and decision dates across all projects"}>
        {!list.length ? (
          <Empty title={all.length ? "Nothing to show here" : "No milestones or deadlines yet"}>
            {all.length ? "Change the kind above, or tick the box to include the ones already reached." : "Open a task and tick the milestone box, or give a task or project a deadline. They are then listed here with the days to go."}
          </Empty>
        ) : (
          <div className="-mx-2 overflow-x-auto px-2">
            <table className="tbl num">
              <thead><tr><th>Date</th><th>Days to go</th><th>What</th><th>Kind</th><th>Project</th><th>Facility</th><th>Status</th></tr></thead>
              <tbody>
                {list.map((m, i) => {
                  const d = Math.round((m.date - now) / DAY);
                  const open = () => ctx.open(m.task ? { kind: "task", id: m.task.id } : { kind: "project", id: m.project.id });
                  return (
                    <tr key={i} className="click" tabIndex={0} onClick={open} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); open(); } }}>
                      <td className="font-semibold">{fmtDate(m.date)}</td>
                      <td>{m.done ? <span className="text-white/55">Done</span> : daysText(d)}</td>
                      <td className="wrap">{m.title}</td>
                      <td><Chip tone="plain">{m.kind}</Chip></td>
                      <td className="wrap text-white/80" style={{ minWidth: 160 }}>{m.project.name}</td>
                      <td>{facilityOf(m.project, m.task)}</td>
                      <td>{m.done ? <Chip tone="good">Reached</Chip> : d < 0 ? <Chip tone="bad">Overdue</Chip> : d <= 7 ? <Chip tone="warn">This week</Chip> : <Chip tone="plain">Upcoming</Chip>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
