// Shared building blocks, in the Paper Monitor's style (Icon, Card, Chip, Ring, Empty) plus the
// dialog and small pieces the Gantt needs.
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { STATUS_COLOR, STATUS_LABEL, STATUS_TONE, type Status, type Tone } from "../lib/model";

const PATHS: Record<string, ReactNode> = {
  overview: <><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></>,
  timeline: <><path d="M4 6h9" /><path d="M9 12h11" /><path d="M6 18h8" /></>,
  projects: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></>,
  milestones: <><path d="M12 3 21 12 12 21 3 12z" /></>,
  facilities: <><path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 21v-6h6v6" /><path d="M9 10h.01M15 10h.01" /></>,
  reports: <><path d="M4 20V10" /><path d="M10 20V4" /><path d="M16 20v-7" /><path d="M22 20H2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
  gantt: <><rect x="3" y="5" width="10" height="4" rx="2" /><rect x="8" y="11" width="13" height="4" rx="2" /><rect x="5" y="17" width="9" height="4" rx="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  chevron: <path d="m9 6 6 6-6 6" />,
  transfer: <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>,
  undo: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
  redo: <><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  sort: <path d="m8 9 4-4 4 4M8 15l4 4 4-4" />,
  up: <path d="m6 15 6-6 6 6" />,
  down: <path d="m6 9 6 6 6-6" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  copy: <><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  fold: <path d="m7 15 5 5 5-5M7 9l5-5 5 5" />,
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: "none" }}>
      {PATHS[name]}
    </svg>
  );
}

export function Card({ title, sub, id, children, style, right, solid }: { title: string; sub?: ReactNode; id: string; children: ReactNode; style?: CSSProperties; right?: ReactNode; solid?: boolean }) {
  return (
    <section className={"glass flex min-w-0 flex-col gap-4 p-[22px] " + (solid ? "glass-solid" : "")} aria-labelledby={id} style={style}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 id={id} className="display m-0 text-xl font-semibold">{title}</h2>
          {sub && <span className="muted text-xs">{sub}</span>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

export const Chip = ({ tone, children }: { tone: Tone; children: ReactNode }) => <span className={"chip chip-" + tone}>{children}</span>;

/** Status is never colour alone: a dot plus its text label. */
export function StatusChip({ status, title }: { status: Status; title?: string }) {
  return (
    <span className={"chip chip-" + STATUS_TONE[status]} title={title}>
      <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Ring({ size, r, stroke, progress, color, label, children }: { size: number; r: number; stroke: number; progress: number; color: string; label: string; children: ReactNode }) {
  const C = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          style={{ strokeDasharray: `${(p * C).toFixed(1)} ${C.toFixed(1)}`, transition: "stroke-dasharray 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="tile flex min-w-0 flex-col gap-1 px-3.5 py-3">
      <span className="text-xs text-white/72">{label}</span>
      <span className="num text-base font-semibold">{value}</span>
      {sub && <span className="text-xs text-white/68">{sub}</span>}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="tile flex flex-col gap-1.5 p-4">
      <span className="text-sm font-semibold">{title}</span>
      <span className="text-[13px] leading-snug text-white/75">{children}</span>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Meter({ value, color, label }: { value: number; color?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <span className="meter" role="img" aria-label={label ?? `${Math.round(v)}% complete`}>
      <i className="anim-w" style={{ width: v + "%", background: color }} />
    </span>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={"flex min-w-0 flex-col gap-1.5 text-[13px] font-medium text-white/80 " + (className ?? "")}>
      <span>{label}</span>
      {children}
      {error ? <span className="err-text" role="alert">{error}</span> : hint ? <span className="text-xs font-normal text-white/60">{hint}</span> : null}
    </label>
  );
}

/** Modal dialog on the native element, so focus is trapped and Escape closes it. */
export function Modal({ title, children, onClose, footer }: { title: string; children: ReactNode; onClose: () => void; footer: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    return () => { if (d && d.open) d.close(); };
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-labelledby="modal-title" onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="flex flex-col gap-4 p-6">
        <h2 id="modal-title" className="display m-0 text-xl font-semibold">{title}</h2>
        <div className="flex flex-col gap-3 text-sm leading-relaxed text-white/85">{children}</div>
        <div className="mt-1 flex flex-wrap justify-end gap-2.5">{footer}</div>
      </div>
    </dialog>
  );
}

export function SortHead<K extends string>({ k, label, sort, setSort, right }: { k: K; label: string; sort: { k: K; dir: 1 | -1 }; setSort: (s: { k: K; dir: 1 | -1 }) => void; right?: boolean }) {
  const on = sort.k === k;
  return (
    <th className={right ? "r" : ""} aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort({ k, dir: on ? (sort.dir === 1 ? -1 : 1) : 1 })}>
        {label}
        <span className={on ? "text-accent" : "opacity-40"}><Icon name={on ? (sort.dir === 1 ? "up" : "down") : "sort"} size={13} /></span>
      </button>
    </th>
  );
}
