// App shell, in the Paper Monitor's layout: sticky glass header, side rail, pages.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NO_FILTERS, owners, type Ctx, type Filters, type Page, type Sel } from "./lib/ctx";
import { fmtDate, plural, today } from "./lib/model";
import { usePlan } from "./lib/store";
import { exportCSV, exportJSON } from "./lib/io";
import { when } from "./lib/when";
import { Icon } from "./components/ui";
import SignIn from "./components/SignIn";
import DetailPanel from "./components/DetailPanel";
import ImportDialog from "./components/ImportDialog";
import Overview from "./pages/Overview";
import Timeline from "./pages/Timeline";
import Projects from "./pages/Projects";
import Milestones from "./pages/Milestones";
import Facilities from "./pages/Facilities";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";

const NAV: [Page, string][] = [["overview", "Overview"], ["timeline", "Timeline"], ["projects", "Projects"], ["milestones", "Milestones"], ["facilities", "Facilities"], ["reports", "Reports"], ["settings", "Settings"]];
const TITLES: Record<Page, [string, string]> = {
  overview: ["", ""],
  timeline: ["Timeline", "Every project on one calendar"],
  projects: ["Projects", "Sort, search and open any project or task"],
  milestones: ["Milestones", "Milestones, deadlines and decision dates"],
  facilities: ["Facilities", "The plan, area by area"],
  reports: ["Reports", "Counts, overdue work and budget"],
  settings: ["Settings", "Accounts, the plan, facilities and data"],
};
const BLOBS = [
  { x: "-8%", y: "-8%", s: 640, c: "#1D4F7A" },
  { x: "55%", y: "-12%", s: 560, c: "#3B3F9E" },
  { x: "76%", y: "36%", s: 540, c: "#12304A" },
  { x: "6%", y: "42%", s: 600, c: "#5B3FA0" },
  { x: "38%", y: "70%", s: 660, c: "#1B3D5C" },
];
const pageFromHash = (): Page => { const h = location.hash.replace("#", "") as Page; return NAV.some(([p]) => p === h) ? h : "overview"; };
const initials = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");

interface Toast { id: number; msg: string; action?: { label: string; fn: () => void } }

export default function App() {
  const store = usePlan();
  const [page, setPage] = useState<Page>(pageFromHash);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [sel, setSel] = useState<Sel | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [menu, setMenu] = useState(false);
  const [importing, setImporting] = useState(false);
  const [userMenu, setUserMenu] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(today);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onHash = () => setPage(pageFromHash());
    window.addEventListener("hashchange", onHash);
    const t = window.setInterval(() => setNow(today()), 60000); // also refreshes "last saved 5 min ago"
    return () => { window.removeEventListener("hashchange", onHash); clearInterval(t); };
  }, []);
  const [, tick] = useState(0);
  useEffect(() => { const t = window.setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);

  const go = useCallback((p: Page) => { if (location.hash !== "#" + p) location.hash = p; setPage(p); window.scrollTo({ top: 0 }); }, []);
  const toast = useCallback((msg: string, action?: Toast["action"]) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, action }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4500);
  }, []);
  const open = useCallback((s: Sel | null) => setSel(s), []);

  useEffect(() => { if (store.notice) { toast(store.notice); store.clearNotice(); } }, [store.notice, store, toast]);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !menuRef.current?.contains(e.target as Node)) setMenu(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [menu]);
  useEffect(() => {
    if (!userMenu) return;
    const close = (e: MouseEvent | KeyboardEvent) => { if (e instanceof KeyboardEvent ? e.key === "Escape" : !userRef.current?.contains(e.target as Node)) setUserMenu(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", close);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", close); };
  }, [userMenu]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (!(e.ctrlKey || e.metaKey) || el.closest("input, textarea, select")) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) store.redo(); else store.undo(); }
      if (e.key.toLowerCase() === "y") { e.preventDefault(); store.redo(); }
    };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [store]);

  const plan = store.plan;
  const ctx = useMemo<Ctx | null>(() => plan && {
    store, plan, now, page, query, filters, setFilters, sel, open, go, toast,
    // Typing in the header search on a page without a list jumps to the project list
    setQuery: (q: string) => { setQuery(q); if (q && (page === "overview" || page === "reports" || page === "settings")) go("projects"); },
  }, [store, plan, now, page, query, filters, sel, open, go, toast]);

  const chip = (() => {
    if (store.mode === "loading") return { text: "Loading", tone: "" };
    if (store.mode === "local") return { text: "Saved in this browser", tone: "" };
    switch (store.save) {
      case "pending": case "saving": return { text: "Saving", tone: "" };
      case "error": return { text: "Not saved", tone: "bad" };
      case "conflict": return { text: "Newer version found", tone: "warn" };
      default: return { text: store.meta.savedAt ? `Last saved ${when(store.meta.savedAt)}${store.meta.savedBy ? ` by ${store.meta.savedBy}` : ""}` : "Nothing saved yet", tone: "" };
    }
  })();
  const [title, sub] = page === "overview" && plan ? [plan.title, plan.subtitle || "A summary of every project"] : TITLES[page];
  const taskCount = plan ? plan.projects.reduce((n, p) => n + p.tasks.filter((t) => t.type !== "buf").length, 0) : 0;

  if (store.mode === "signin") {
    return (
      <div className="relative min-h-screen overflow-clip px-4 pb-10" style={{ background: "var(--bg)" }}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ opacity: 0.75 }}>
          {BLOBS.map((b, i) => <div key={i} className="blob" style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }} />)}
          <div className="absolute inset-0" style={{ background: "rgba(3,6,14,0.3)" }} />
        </div>
        <main className="relative z-[1]"><SignIn store={store} /></main>
      </div>
    );
  }
  const name = store.me?.name ?? "";

  return (
    <div className="relative min-h-screen overflow-clip" style={{ background: "var(--bg)" }}>
      {/* quieter behind the timeline, so dense bars stay readable */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0" style={{ opacity: page === "timeline" ? 0.35 : 0.75, transition: "opacity .4s" }}>
        {BLOBS.map((b, i) => <div key={i} className="blob" style={{ left: b.x, top: b.y, width: b.s, height: b.s, background: b.c }} />)}
        <div className="absolute inset-0" style={{ background: "rgba(3,6,14,0.3)" }} />
      </div>
      <a href="#main" className="sr-only-x focus:not-sr-only">Skip to content</a>

      <div className="relative z-[1] mx-auto flex max-w-[1680px] flex-col gap-5 px-4 pt-5 pb-10 sm:px-6">
        <header className="glass sticky top-3 z-[30] flex flex-wrap items-center justify-between gap-3 py-2.5 pr-3 pl-4" style={{ borderRadius: 20, background: "rgba(13,22,40,0.84)" }}>
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-on-accent"><Icon name="gantt" size={20} /></span>
            <div className="flex flex-col leading-tight">
              <span className="display text-base font-bold tracking-wide">Project Gantt</span>
              <span className="muted text-xs">HOLDAL facilities</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-wrap items-center justify-end gap-2.5">
            <label htmlFor="topsearch" className="sr-only-x">Search projects, tasks, owners or facilities</label>
            <div className="relative min-w-[150px] flex-1 sm:max-w-[280px]">
              <span className="absolute top-3.5 left-3.5 opacity-70"><Icon name="search" size={16} /></span>
              <input id="topsearch" type="search" placeholder="Search projects and tasks" value={query} onChange={(e) => ctx?.setQuery(e.target.value)}
                className="field" style={{ paddingLeft: 38, borderRadius: 999, background: "rgba(0,0,0,0.25)" }} disabled={!ctx} />
            </div>
            <span role="status" aria-live="polite" title={store.meta.savedAt ? `Version ${store.meta.version}, saved ${fmtDate(Date.parse(store.meta.savedAt))}` : undefined}
              className="max-w-full truncate rounded-full border border-dashed px-2.5 py-1.5 text-xs"
              style={{ borderColor: chip.tone === "bad" ? "#F08A6C" : chip.tone === "warn" ? "#FFD08A" : "rgba(255,255,255,.4)", color: chip.tone === "bad" ? "#FFB9A6" : chip.tone === "warn" ? "#FFD08A" : "rgba(255,255,255,.85)" }}>
              {chip.text}
            </span>
            <button type="button" className="icon-btn" onClick={store.undo} disabled={!store.canUndo} aria-label="Undo the last change" title="Undo (Ctrl+Z)"><Icon name="undo" size={18} /></button>
            <div ref={menuRef} className="relative">
              <button type="button" className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Import and export" aria-expanded={menu} title="Import and export" disabled={!ctx}><Icon name="transfer" size={19} /></button>
              {menu && plan && (
                <div className="menu-pop" role="menu">
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); exportJSON(plan, store.meta.version); }}>Export JSON<small>Full backup, can be imported again</small></button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); exportCSV(plan); }}>Export CSV<small>One row per task, opens in Excel</small></button>
                  <button type="button" role="menuitem" onClick={() => { setMenu(false); setImporting(true); }}>Import a file<small>Merge or replace, with a preview first</small></button>
                </div>
              )}
            </div>
            {name && (
              <div ref={userRef} className="relative">
                <button type="button" onClick={() => setUserMenu(!userMenu)} aria-label={`Signed in as ${name}. Open the account menu.`} aria-expanded={userMenu} title={name}
                  className="grid h-11 w-11 flex-none place-items-center rounded-full border-0 bg-accent text-sm font-bold text-on-accent">{initials(name)}</button>
                {userMenu && (
                  <div className="menu-pop" role="menu">
                    <span className="flex flex-col gap-0.5 px-3 py-2 text-sm font-semibold">{name}<small className="text-xs font-normal text-white/65">{store.me?.admin ? "Administrator" : "Signed in"}</small></span>
                    <button type="button" role="menuitem" onClick={() => { setUserMenu(false); go("settings"); }}>{store.me?.admin ? "Accounts and settings" : "Settings"}</button>
                    <button type="button" role="menuitem" onClick={() => { setUserMenu(false); setSel(null); void store.signOut(); }}>Sign out</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <div className="flex flex-wrap items-start gap-5">
          <nav aria-label="Sections" className="glass rail flex w-[84px] flex-col gap-1.5 px-2 py-2.5 md:sticky md:top-24" style={{ borderRadius: 22 }}>
            {NAV.map(([p, label], i) => (
              <button key={p} type="button" onClick={() => go(p)} aria-current={page === p ? "page" : undefined} aria-label={label}
                className={"flex min-h-14 flex-col items-center gap-1 rounded-2xl border-0 px-1 py-2.5 " + (i === 6 ? "rail-sep " : "") + (page === p ? "bg-accent text-on-accent" : "bg-transparent text-white/85 hover:bg-white/10")}>
                <Icon name={p} size={22} />
                <span className="rail-label text-[11px] font-semibold">{label}</span>
              </button>
            ))}
          </nav>

          <main id="main" className="flex min-w-0 flex-col gap-5" style={{ flex: "999 1 560px" }}>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <h1 className="display m-0 text-[32px] leading-[1.05] font-semibold tracking-tight sm:text-[40px]">{title || "Project Gantt"}</h1>
                {sub && <span className="max-w-[80ch] text-sm text-white/75">{sub}</span>}
              </div>
              {plan && page === "overview" && <span className="muted num text-[13px]">{plural(plan.projects.length, "project")}, {plural(taskCount, "task")} · {fmtDate(now)}</span>}
            </div>

            {store.loadError && (
              <Banner tone="warn" title="The shared plan did not load" body={`${store.loadError}. You are working in this browser only until it loads.`}>
                <button className="btn btn-sm" onClick={store.reload}>Try again</button>
              </Banner>
            )}
            {store.save === "error" && (
              <Banner tone="bad" title="The last change was not saved to the server" body={`${store.error}. It is kept in this browser, so nothing is lost.`}>
                <button className="btn btn-sm" onClick={store.retry}>Try again</button>
              </Banner>
            )}
            {store.save === "conflict" && store.conflict && (
              <Banner tone="warn" title={`${store.conflict.savedBy || "Someone"} saved a newer version ${when(store.conflict.savedAt)}`} body="You also have changes that are not saved yet. Choose which version to keep.">
                <button className="btn btn-sm btn-primary" onClick={() => store.resolve("mine")}>Keep mine</button>
                <button className="btn btn-sm" onClick={() => store.resolve("theirs")}>Load theirs</button>
              </Banner>
            )}

            {!ctx && <Skeleton />}
            {ctx && page === "overview" && <Overview ctx={ctx} />}
            {ctx && page === "timeline" && <Timeline ctx={ctx} />}
            {ctx && page === "projects" && <Projects ctx={ctx} />}
            {ctx && page === "milestones" && <Milestones ctx={ctx} />}
            {ctx && page === "facilities" && <Facilities ctx={ctx} />}
            {ctx && page === "reports" && <Reports ctx={ctx} />}
            {ctx && page === "settings" && <Settings ctx={ctx} onImport={() => setImporting(true)} />}
          </main>
        </div>
      </div>

      {ctx && sel && <DetailPanel ctx={ctx} sel={sel} />}
      {ctx && importing && <ImportDialog ctx={ctx} onClose={() => setImporting(false)} />}
      {plan && (
        <>
          <datalist id="facility-list">{plan.facilities.map((f) => <option key={f} value={f} />)}</datalist>
          <datalist id="owner-list">{owners(plan).map((o) => <option key={o} value={o} />)}</datalist>
        </>
      )}
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <span>{t.msg}</span>
            {t.action && <button type="button" onClick={() => { t.action!.fn(); setToasts((x) => x.filter((y) => y.id !== t.id)); }}>{t.action.label}</button>}
          </div>
        ))}
      </div>
    </div>
  );
}

function Banner({ tone, title, body, children }: { tone: "warn" | "bad"; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="glass flex flex-wrap items-center gap-x-4 gap-y-2.5 px-5 py-3.5" role="alert" style={{ borderRadius: 18, borderColor: tone === "bad" ? "rgba(240,138,108,.6)" : "rgba(255,208,138,.5)" }}>
      <div className="flex min-w-[220px] flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold" style={{ color: tone === "bad" ? "#FFB9A6" : "#FFD08A" }}>{title}</span>
        <span className="text-[13px] text-white/80">{body}</span>
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading the plan">
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {[0, 1, 2, 3].map((i) => <div key={i} className="skel h-[136px]" />)}
      </div>
      <div className="skel h-[420px]" />
    </div>
  );
}
