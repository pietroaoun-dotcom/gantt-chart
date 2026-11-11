import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as RPointerEvent } from "react";
import { NO_FILTERS, filtersOn, visibleProjects, type Ctx, type VisibleProject } from "../lib/ctx";
import {
  DAY, STATUS_COLOR, STATUS_LABEL, addMonths, duration, facilityOf, fmtDate, fmtDayMonth, fmtMonth, iso, monday, monthName, monthStart,
  ownerOf, parseDate, plural, progressOf, span, yearStart, type Project, type Status, type StatusInfo, type Task,
} from "../lib/model";
import { ls } from "../lib/store";
import { Empty, Icon, StatusChip } from "../components/ui";
import { FilterBar } from "../components/Filters";

type Zoom = "day" | "week" | "month";
const ZOOMS: Record<Zoom, { px: number; pad: number; label: string }> = {
  day: { px: 30, pad: 5, label: "Day" },
  week: { px: 12, pad: 14, label: "Week" },
  month: { px: 3.6, pad: 45, label: "Month" },
};

type Row =
  | { kind: "proj"; key: string; v: VisibleProject; open: boolean }
  | { kind: "task"; key: string; p: Project; t: Task; st: StatusInfo }
  | { kind: "add"; key: string; p: Project };

interface Drag { el: HTMLElement; mode: "m" | "l" | "r"; x0: number; left0: number; w0: number; dd: number; moved: boolean; tasks: { id: string; s: number; e: number; ms: boolean }[]; px: number }

export default function Timeline({ ctx }: { ctx: Ctx }) {
  const { plan, now, filters, setFilters, query } = ctx;
  const [zoom, setZoom] = useState<Zoom>(() => (ls.get("gantt:zoom") as Zoom) in ZOOMS ? (ls.get("gantt:zoom") as Zoom) : "week");
  const [open, setOpen] = useState<Set<string>>(() => { try { return new Set(JSON.parse(ls.get("gantt:open") ?? "[]")); } catch { return new Set(); } });
  const [width, setWidth] = useState(1200);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const suppressClick = useRef(false);

  useEffect(() => { ls.set("gantt:zoom", zoom); }, [zoom]);
  useEffect(() => { ls.set("gantt:open", JSON.stringify([...open])); }, [open]);
  useLayoutEffect(() => {
    const el = wrap.current; if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el); setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const vis = useMemo(() => visibleProjects(plan, now, query, filters), [plan, now, query, filters]);
  const filtering = filtersOn(query, filters);
  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    for (const v of vis) {
      // While searching or filtering, matching tasks are shown without an extra click
      const isOpen = open.has(v.p.id) || (filtering && v.hidden > 0);
      out.push({ kind: "proj", key: "p:" + v.p.id, v, open: isOpen });
      if (isOpen) {
        v.tasks.forEach(({ t, st }) => out.push({ kind: "task", key: "t:" + t.id, p: v.p, t, st }));
        out.push({ kind: "add", key: "a:" + v.p.id, p: v.p });
      }
    }
    return out;
  }, [vis, open, filtering]);

  const lw = width < 640 ? 150 : width < 1000 ? 250 : 350;
  const narrow = lw <= 150;
  const { px, pad } = ZOOMS[zoom];

  const range = useMemo(() => {
    const sp = span(plan.projects.flatMap((p) => p.tasks));
    const dl = parseDate(plan.deadline);
    let a = sp ? Math.min(sp[0], now) : now, b = sp ? Math.max(sp[1], now) : now + 90 * DAY;
    for (const p of plan.projects) { const d = parseDate(p.deadline); if (d != null) b = Math.max(b, d); }
    if (dl != null) { a = Math.min(a, dl); b = Math.max(b, dl); }
    const S = zoom === "month" ? monthStart(a - pad * DAY) : monday(a - pad * DAY);
    let E = b + (pad + 2) * DAY;
    const avail = Math.max(280, width - lw - 2);
    if (((E - S) / DAY) * px < avail) E = S + Math.ceil(avail / px) * DAY;
    return { S, E, W: Math.ceil(((E - S) / DAY) * px), dl };
  }, [plan, now, zoom, px, pad, width, lw]);
  const { S, E, W } = range;
  const X = (t: number) => ((t - S) / DAY) * px;

  const scrollToToday = () => { const el = wrap.current; if (el) el.scrollLeft = Math.max(0, X(now) - (el.clientWidth - lw) * 0.3); };
  useLayoutEffect(scrollToToday, [zoom, S]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- scale cells ----- */
  const scale = useMemo(() => {
    const top: { x: number; w: number; label: string }[] = [], bottom: { x: number; w: number; label: string; we?: boolean }[] = [];
    const clip = (a: number, b: number) => { const x = Math.max(0, X(a)), r = Math.min(W, X(b)); return { x, w: r - x }; };
    if (zoom === "month") {
      for (let t = yearStart(S); t < E; t = Date.UTC(new Date(t).getUTCFullYear() + 1, 0, 1)) { const c = clip(t, Date.UTC(new Date(t).getUTCFullYear() + 1, 0, 1)); if (c.w > 1) top.push({ ...c, label: c.w > 40 ? String(new Date(t).getUTCFullYear()) : "" }); }
      for (let t = monthStart(S); t < E; t = addMonths(t, 1)) { const c = clip(t, addMonths(t, 1)); if (c.w > 1) bottom.push({ ...c, label: c.w > 30 ? monthName(t) : "" }); }
    } else {
      for (let t = monthStart(S); t < E; t = addMonths(t, 1)) { const c = clip(t, addMonths(t, 1)); if (c.w > 1) top.push({ ...c, label: c.w > 110 ? fmtMonth(t, true) : c.w > 60 ? fmtMonth(t) : "" }); }
      if (zoom === "week") for (let t = monday(S); t < E; t += 7 * DAY) { const c = clip(t, t + 7 * DAY); if (c.w > 1) bottom.push({ ...c, label: c.w > 50 ? fmtDayMonth(t) : "" }); }
      else for (let t = S; t < E; t += DAY) { const wd = new Date(t).getUTCDay(); bottom.push({ ...clip(t, t + DAY), label: String(new Date(t).getUTCDate()), we: wd === 0 || wd === 6 }); }
    }
    const weekends: number[] = [];
    if (zoom !== "month") for (let t = monday(S) + 5 * DAY; t < E; t += 7 * DAY) weekends.push(Math.max(0, X(t)));
    return { top, bottom, weekends };
  }, [zoom, S, E, W, px]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----- dragging bars ----- */
  function onBarDown(e: RPointerEvent<HTMLElement>, tasks: Task[], canResize: boolean) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const mode = !canResize ? "m" : target.classList.contains("hl") ? "l" : target.classList.contains("hr") ? "r" : "m";
    const el = e.currentTarget;
    const list = tasks.map((t) => ({ id: t.id, s: parseDate(t.start), e: parseDate(t.end), ms: t.type === "ms" })).filter((o) => o.s != null && o.e != null) as Drag["tasks"];
    if (!list.length) return;
    drag.current = { el, mode, x0: e.clientX, left0: parseFloat(el.style.left), w0: parseFloat(el.style.width), dd: 0, moved: false, tasks: list, px };
    el.setPointerCapture(e.pointerId);
  }
  function onBarMove(e: RPointerEvent<HTMLElement>) {
    const d = drag.current; if (!d) return;
    const dx = e.clientX - d.x0;
    if (!d.moved && Math.abs(dx) < 4) return;
    if (!d.moved) { d.moved = true; d.el.classList.add("dragging"); }
    let dd = Math.round(dx / d.px);
    const first = d.tasks[0], len = Math.round((first.e - first.s) / DAY);
    if (d.mode === "l") dd = Math.min(dd, len);
    if (d.mode === "r") dd = Math.max(dd, -len);
    d.dd = dd;
    if (d.mode !== "r") d.el.style.left = d.left0 + dd * d.px + "px";
    if (d.mode === "l") d.el.style.width = d.w0 - dd * d.px + "px";
    if (d.mode === "r") d.el.style.width = d.w0 + dd * d.px + "px";
    const s = Math.min(...d.tasks.map((o) => o.s)) + (d.mode !== "r" ? dd * DAY : 0);
    const en = Math.max(...d.tasks.map((o) => o.e)) + (d.mode !== "l" ? dd * DAY : 0);
    setTip({ x: e.clientX, y: e.clientY, text: s === en ? fmtDate(s) : `${fmtDate(s)} to ${fmtDate(en)}` });
  }
  function onBarUp() {
    const d = drag.current; drag.current = null; setTip(null);
    if (!d) return;
    d.el.classList.remove("dragging");
    if (!d.moved) return;
    suppressClick.current = true;
    setTimeout(() => (suppressClick.current = false), 0);
    if (!d.dd) { d.el.style.left = d.left0 + "px"; if (!isNaN(d.w0)) d.el.style.width = d.w0 + "px"; return; }
    const ids = new Map(d.tasks.map((o) => [o.id, o]));
    ctx.store.update((plan) => {
      for (const p of plan.projects) for (const t of p.tasks) {
        const o = ids.get(t.id); if (!o) continue;
        if (d.mode !== "r") t.start = iso(o.s + d.dd * DAY);
        if (d.mode !== "l") t.end = iso(o.e + d.dd * DAY);
        if (o.ms) t.end = t.start;
      }
    });
  }
  const barHandlers = (tasks: Task[], canResize: boolean) => ({
    onPointerDown: (e: RPointerEvent<HTMLElement>) => onBarDown(e, tasks, canResize),
    onPointerMove: onBarMove, onPointerUp: onBarUp, onPointerCancel: onBarUp,
  });
  const click = (fn: () => void) => () => { if (!suppressClick.current) fn(); };

  /* ----- keyboard: up and down between rows, right to the bar, Enter opens ----- */
  function onRowKey(e: KeyboardEvent<HTMLElement>, i: number, r: Row) {
    const focusRow = (n: number) => (wrap.current?.querySelector(`[data-row="${n}"]`) as HTMLElement | null)?.focus();
    if (e.key === "ArrowDown") { e.preventDefault(); focusRow(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); focusRow(i - 1); }
    else if (e.key === "Enter") { e.preventDefault(); if (r.kind === "proj") ctx.open({ kind: "project", id: r.v.p.id }); else if (r.kind === "task") ctx.open({ kind: "task", id: r.t.id }); else ctx.open({ kind: "newTask", projectId: r.p.id }); }
    else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (r.kind === "proj" && !r.open) toggle(r.v.p.id);
      else (wrap.current?.querySelector(`[data-bar="${i}"]`) as HTMLElement | null)?.focus();
    } else if (e.key === "ArrowLeft" && r.kind === "proj" && r.open) { e.preventDefault(); toggle(r.v.p.id); }
  }
  const onBarKey = (e: KeyboardEvent<HTMLElement>, i: number) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); (wrap.current?.querySelector(`[data-row="${i}"]`) as HTMLElement | null)?.focus(); }
  };
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOpen = vis.length > 0 && vis.every((v) => open.has(v.p.id));

  const taskCount = plan.projects.reduce((n, p) => n + p.tasks.filter((t) => t.type !== "buf").length, 0);

  const pctLabel = (w: number, progress: number) => {
    if (w < 46) return null;
    const fill = (w * progress) / 100;
    if (fill >= 44) return <span className="pct num" style={{ left: 8, color: "#1e140c" }}>{progress}%</span>;
    if (fill + 44 > w) return null;
    return <span className="pct num" style={{ left: fill + 7, color: "#fff" }}>{progress}%</span>;
  };

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="glass flex flex-wrap items-center gap-2.5 p-2.5" style={{ borderRadius: 22 }} role="toolbar" aria-label="Timeline controls">
        <div role="group" aria-label="Zoom" className="seg">
          {(Object.keys(ZOOMS) as Zoom[]).map((z) => <button key={z} type="button" aria-pressed={zoom === z} onClick={() => setZoom(z)}>{ZOOMS[z].label}</button>)}
        </div>
        <button type="button" className="btn" style={{ borderRadius: 999 }} onClick={scrollToToday}><Icon name="calendar" size={16} />Today</button>
        <span aria-hidden="true" className="mx-1 hidden h-7 w-px bg-white/20 sm:block" />
        <FilterBar ctx={ctx} />
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <button type="button" className="btn" style={{ borderRadius: 999 }} onClick={() => setOpen(allOpen ? new Set() : new Set(plan.projects.map((p) => p.id)))}>
            <Icon name="fold" size={16} />{allOpen ? "Collapse all" : "Expand all"}
          </button>
          <button type="button" className="btn btn-primary" style={{ borderRadius: 999 }} onClick={() => ctx.open({ kind: "newProject" })}><Icon name="plus" size={16} />Add project</button>
        </div>
      </div>

      <section className="glass glass-solid flex min-w-0 flex-col gap-3 p-3 sm:p-4" aria-label="Timeline">
        <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-1">
          <span className="num text-[13px] text-white/75">
            {filtering ? `Showing ${vis.length} of ${plural(plan.projects.length, "project")}` : `${plural(plan.projects.length, "project")}, ${plural(taskCount, "task")}`}
          </span>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-white/75" aria-label="Legend">
            {(["track", "risk", "late", "upcoming"] as Status[]).map((s) => <span key={s} className="flex items-center gap-1.5"><i className="lg" style={{ "--sc": STATUS_COLOR[s] } as CSSProperties} />{STATUS_LABEL[s]}</span>)}
            <span className="flex items-center gap-1.5"><i className="lg" style={{ background: "var(--color-accent)", borderColor: "var(--color-accent)" }} />Progress</span>
            <span className="flex items-center gap-1.5"><i className="lg" style={{ "--sc": "#fff", background: "repeating-linear-gradient(135deg,rgba(255,255,255,.4) 0 3px,transparent 3px 6px)" } as CSSProperties} />Source</span>
            <span className="flex items-center gap-1.5"><i className="lg" style={{ borderStyle: "dashed", borderColor: "rgba(255,255,255,.6)", background: "none" }} />Buffer</span>
            <span className="flex items-center gap-1.5"><i style={{ width: 9, height: 9, background: "#fff", transform: "rotate(45deg)", borderRadius: 2, display: "inline-block" }} />Milestone</span>
            <span className="flex items-center gap-1.5"><i style={{ height: 12, borderLeft: "2px dashed #F08A6C", display: "inline-block" }} />Deadline</span>
          </div>
        </div>

        {!plan.projects.length ? (
          <Empty title="No projects yet" action={<button className="btn btn-primary" onClick={() => ctx.open({ kind: "newProject" })}>Add the first project</button>}>
            Add a project, then give it tasks with a start and an end date. You can also import a backup or a task sheet from the menu in the header.
          </Empty>
        ) : !vis.length ? (
          <Empty title="Nothing matches these filters" action={<button className="btn" onClick={() => { setFilters(NO_FILTERS); ctx.setQuery(""); }}>Clear filters</button>}>
            Try another facility, status or owner, or clear the search box.
          </Empty>
        ) : null}

        <div ref={wrap} className="gantt-scroll" style={{ display: vis.length ? undefined : "none" }}>
          <div className="gantt" style={{ "--lw": lw + "px" } as CSSProperties}>
            {/* left: names, sticky while scrolling sideways */}
            <div className="g-left">
              <div className="g-head">
                <div className="g-h1 flex items-center px-3 text-[12.5px] font-bold text-white/90">{narrow ? "Project" : "Project or task"}</div>
                <div className="g-h2 flex items-center px-3 text-xs text-white/65">{narrow ? "Tap to open" : "Facility, owner and status"}</div>
              </div>
              {rows.map((r, i) => {
                if (r.kind === "proj") {
                  const { p, pst } = r.v;
                  const selected = ctx.sel?.kind === "project" && ctx.sel.id === p.id;
                  return (
                    <div key={r.key} className={"g-row proj" + (selected ? " sel" : "")} role="button" tabIndex={i === 0 ? 0 : -1} data-row={i}
                      aria-expanded={r.open} aria-label={`${p.name || "Untitled project"}, ${STATUS_LABEL[pst.status]}, ${plural(p.tasks.length, "task")}. Press Enter for details, right arrow to show tasks.`}
                      onClick={() => toggle(p.id)} onKeyDown={(e) => onRowKey(e, i, r)}>
                      <span className="g-tw" aria-hidden="true" data-open={r.open}><span style={{ display: "grid", transform: r.open ? "rotate(90deg)" : undefined, transition: "transform .15s" }}><Icon name="chevron" size={16} /></span></span>
                      <span className="g-name">
                        <b>{p.name || "Untitled project"}</b>
                        {narrow
                          ? <span style={{ color: STATUS_COLOR[pst.status] }}>{STATUS_LABEL[pst.status]}</span>
                          : <span>{[facilityOf(p), p.owner, plural(p.tasks.length, "task")].filter(Boolean).join(" · ")}</span>}
                      </span>
                      {!narrow && <StatusChip status={pst.status} title={pst.reason} />}
                    </div>
                  );
                }
                if (r.kind === "task") {
                  const { p, t, st } = r;
                  const selected = ctx.sel?.kind === "task" && ctx.sel.id === t.id;
                  const s = parseDate(t.start), e = parseDate(t.end);
                  const dates = s == null || e == null ? "No dates yet" : t.type === "ms" ? fmtDate(s) : `${fmtDate(s)} to ${fmtDate(e)}`;
                  return (
                    <div key={r.key} className={"g-row task" + (selected ? " sel" : "")} role="button" tabIndex={-1} data-row={i}
                      aria-label={`${t.name || "Untitled task"}, ${dates}, ${t.progress}% complete, ${STATUS_LABEL[st.status]}. Press Enter for details.`}
                      onClick={() => ctx.open({ kind: "task", id: t.id })} onKeyDown={(e2) => onRowKey(e2, i, r)}>
                      <span className="g-name">
                        <b>{t.name || "Untitled task"}</b>
                        {narrow
                          ? <span style={{ color: STATUS_COLOR[st.status] }}>{STATUS_LABEL[st.status]}</span>
                          : <span className="num">{[dates, t.facility && t.facility !== p.facility ? t.facility : "", t.owner && t.owner !== p.owner ? ownerOf(p, t) : ""].filter(Boolean).join(" · ")}</span>}
                      </span>
                      {!narrow && t.type !== "buf" && <StatusChip status={st.status} title={st.reason} />}
                    </div>
                  );
                }
                return (
                  <div key={r.key} className="g-row add task" role="button" tabIndex={-1} data-row={i} aria-label={`Add a task to ${r.p.name}`}
                    onClick={() => ctx.open({ kind: "newTask", projectId: r.p.id })} onKeyDown={(e) => onRowKey(e, i, r)}>
                    <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white/70"><Icon name="plus" size={14} />Add task</span>
                    {!narrow && <button type="button" className="ml-auto border-0 bg-transparent text-[12.5px] font-semibold text-white/70 underline" onClick={(e) => { e.stopPropagation(); ctx.open({ kind: "project", id: r.p.id }); }}>Project details</button>}
                  </div>
                );
              })}
            </div>

            {/* right: the dates */}
            <div className="g-right" style={{ width: W }}>
              <div className="g-head">
                <div className="g-h1">{scale.top.map((c, i) => <div key={i} className="sc top" style={{ left: c.x, width: c.w }}>{c.label}</div>)}</div>
                <div className="g-h2">
                  {scale.bottom.map((c, i) => <div key={i} className={"sc num" + (zoom === "day" ? " day" : "") + (c.we ? " we" : "")} style={{ left: c.x, width: c.w }}>{c.label}</div>)}
                  {now >= S && now < E && <span className="flag" style={{ left: X(now) + px / 2 }}>Today</span>}
                  {range.dl != null && <span className="flag dl" style={{ left: X(range.dl + DAY) }}>{plan.deadlineLabel || "Deadline"} {fmtDayMonth(range.dl)}</span>}
                </div>
              </div>
              <div style={{ position: "relative" }}>
                <div className="g-ov" aria-hidden="true">
                  {scale.weekends.map((x, i) => <i key={"w" + i} className="wk" style={{ left: x, width: 2 * px }} />)}
                  {scale.bottom.map((c, i) => zoom !== "day" && c.x > 0 ? <i key={"b" + i} className="gl" style={{ left: c.x }} /> : null)}
                  {scale.top.map((c, i) => c.x > 0 ? <i key={"t" + i} className="gl2" style={{ left: c.x }} /> : null)}
                  {range.dl != null && <i className="plan-dl" style={{ left: X(range.dl + DAY) }} />}
                  {now >= S && now < E && <i className="today-line" style={{ left: X(now) + px / 2 }} />}
                </div>
                {rows.map((r, i) => {
                  if (r.kind === "proj") {
                    const { p, pst } = r.v;
                    const sp = span(p.tasks), pr = Math.round(progressOf(p.tasks));
                    const own = parseDate(p.deadline);
                    const w = sp ? ((sp[1] - sp[0]) / DAY + 1) * px : 0;
                    const selected = ctx.sel?.kind === "project" && ctx.sel.id === p.id;
                    return (
                      <div key={r.key} className={"g-row proj" + (selected ? " sel" : "")}>
                        {sp && (
                          <button type="button" className={"bar sum" + (r.open ? " thin" : "")} data-bar={i} tabIndex={-1}
                            style={{ left: X(sp[0]), width: w, "--sc": STATUS_COLOR[pst.status] } as CSSProperties}
                            aria-label={`${p.name}: ${fmtDate(sp[0])} to ${fmtDate(sp[1])}, ${pr}% complete, ${STATUS_LABEL[pst.status]}. Open project details.`}
                            title={`${p.name}\n${fmtDate(sp[0])} to ${fmtDate(sp[1])}\n${pr}% complete · ${STATUS_LABEL[pst.status]}`}
                            {...barHandlers(p.tasks, false)} onClick={click(() => ctx.open({ kind: "project", id: p.id }))} onKeyDown={(e) => onBarKey(e, i)}>
                            <span className="fill" style={{ width: pr + "%" }} />
                            {!r.open && pctLabel(w, pr)}
                          </button>
                        )}
                        {!r.open && p.tasks.filter((t) => t.type === "ms" && parseDate(t.start) != null).map((t) => (
                          <span key={t.id} className="ms" aria-hidden="true" title={`${t.name}: ${fmtDate(t.start)}`} style={{ left: X(parseDate(t.start)!) + px / 2, pointerEvents: "none", "--sc": "#fff" } as CSSProperties}><i /></span>
                        ))}
                        {own != null && <span className="dl-mark" style={{ left: X(own + DAY) }} title={`Project deadline: ${fmtDate(own)}`} role="img" aria-label={`Project deadline ${fmtDate(own)}`} />}
                      </div>
                    );
                  }
                  if (r.kind === "task") {
                    const { p, t, st } = r;
                    const s = parseDate(t.start), e = parseDate(t.end);
                    const td = parseDate(t.deadline);
                    const selected = ctx.sel?.kind === "task" && ctx.sel.id === t.id;
                    const sc = STATUS_COLOR[st.status];
                    const label = s == null || e == null ? "" : `${t.name}: ${t.type === "ms" ? fmtDate(s) : `${fmtDate(s)} to ${fmtDate(e)}, ${plural(duration(t), "day")}, ${t.progress}% complete`}, ${STATUS_LABEL[st.status]}. Open task details.`;
                    const title = s == null || e == null ? "" : `${t.name}\n${t.type === "ms" ? fmtDate(s) : `${fmtDate(s)} to ${fmtDate(e)} · ${plural(duration(t), "day")}`}\n${t.type === "buf" ? "Buffer" : `${t.progress}% complete · ${STATUS_LABEL[st.status]} (${st.reason})`}${ownerOf(p, t) ? `\nOwner: ${ownerOf(p, t)}` : ""}`;
                    const w = s != null && e != null ? Math.max(8, ((e - s) / DAY + 1) * px) : 0;
                    return (
                      <div key={r.key} className={"g-row task" + (selected ? " sel" : "")}>
                        {s != null && e != null && e >= s && (t.type === "ms" ? (
                          <>
                            <button type="button" className="ms" data-bar={i} tabIndex={-1} style={{ left: X(s) + px / 2, "--sc": sc } as CSSProperties} aria-label={label} title={title}
                              {...barHandlers([t], false)} onClick={click(() => ctx.open({ kind: "task", id: t.id }))} onKeyDown={(ev) => onBarKey(ev, i)}><i /></button>
                            <span className="ms-label" style={{ left: X(s) + px / 2 + 16 }}>{t.name}</span>
                          </>
                        ) : (
                          <button type="button" className={"bar" + (t.type === "src" ? " src" : t.type === "buf" ? " buf" : "")} data-bar={i} tabIndex={-1}
                            style={{ left: X(s), width: w, "--sc": sc } as CSSProperties} aria-label={label} title={title}
                            {...barHandlers([t], true)} onClick={click(() => ctx.open({ kind: "task", id: t.id }))} onKeyDown={(ev) => onBarKey(ev, i)}>
                            {t.type !== "buf" && t.progress > 0 && <span className="fill" style={{ width: t.progress + "%" }} />}
                            {t.type !== "buf" && pctLabel(w, t.progress)}
                            <span className="hl" /><span className="hr" />
                          </button>
                        ))}
                        {td != null && <span className="dl-mark" style={{ left: X(td + DAY) }} title={`Deadline: ${fmtDate(td)}`} role="img" aria-label={`Deadline ${fmtDate(td)}`} />}
                      </div>
                    );
                  }
                  return <div key={r.key} className="g-row add" />;
                })}
              </div>
            </div>
          </div>
        </div>
        {vis.length > 0 && (
          <p className="m-0 px-1 text-xs leading-relaxed text-white/65">
            Click a project to show or hide its tasks. Click a bar to open its details. Drag a bar to move it, or drag its ends to change the dates.
          </p>
        )}
      </section>
      {tip && <div className="drag-tip num" style={{ left: Math.min(tip.x + 14, window.innerWidth - 240), top: tip.y - 44 }}>{tip.text}</div>}
    </div>
  );
}

