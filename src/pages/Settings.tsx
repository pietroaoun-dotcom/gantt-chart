import { useState, type FormEvent } from "react";
import type { Ctx } from "../lib/ctx";
import { fmtDate, parseDate, plural } from "../lib/model";
import { exportCSV, exportJSON } from "../lib/io";
import type { HistoryItem } from "../lib/store";
import { Card, Chip, Empty, Field, Icon } from "../components/ui";
import { when } from "../lib/when";
import Accounts from "../components/Accounts";

export default function Settings({ ctx, onImport }: { ctx: Ctx; onImport: () => void }) {
  const { plan, store } = ctx;
  return (
    <div className="grid items-start gap-5" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))" }}>
      {store.me?.admin && <Accounts ctx={ctx} />}
      <PlanCard key={JSON.stringify([plan.title, plan.subtitle, plan.deadline, plan.deadlineLabel, plan.currency])} ctx={ctx} />
      <FacilitiesCard ctx={ctx} />
      <Card id="st-data" title="Data" sub={store.mode === "shared" ? "Saved on the shared server, for everyone with the link" : "Saved in this browser only"}>
        <p className="m-0 text-[13px] leading-relaxed text-white/80">
          {store.mode === "shared"
            ? "Every change is kept in this browser at once and sent to the shared server a moment later. Other people see it within 20 seconds. If two people change the plan at the same time, the second one is asked which version to keep."
            : "The shared storage is not connected, so changes stay in this browser. Export a backup to move the plan to another computer."}
        </p>
        <div className="flex flex-wrap gap-2.5">
          <button type="button" className="btn" onClick={onImport}><Icon name="transfer" size={16} />Import a file</button>
          <button type="button" className="btn" onClick={() => exportJSON(plan, store.meta.version)}>Export JSON, full backup</button>
          <button type="button" className="btn" onClick={() => exportCSV(plan)}>Export CSV, one row per task</button>
        </div>
      </Card>
      {store.mode === "shared" && <HistoryCard ctx={ctx} />}
    </div>
  );
}

function PlanCard({ ctx }: { ctx: Ctx }) {
  const { plan } = ctx;
  const [f, setF] = useState({ title: plan.title, subtitle: plan.subtitle, deadline: plan.deadline, deadlineLabel: plan.deadlineLabel, currency: plan.currency });
  const set = (k: keyof typeof f, v: string) => setF((x) => ({ ...x, [k]: v }));
  const titleErr = f.title.trim() ? "" : "Give the plan a title.";
  const dlErr = f.deadline && parseDate(f.deadline) == null ? "This date is not valid." : "";
  const changed = JSON.stringify(f) !== JSON.stringify({ title: plan.title, subtitle: plan.subtitle, deadline: plan.deadline, deadlineLabel: plan.deadlineLabel, currency: plan.currency });
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (titleErr || dlErr) return;
    ctx.store.update((d) => Object.assign(d, { ...f, title: f.title.trim() }));
    ctx.toast("Plan settings saved.");
  };
  return (
    <Card id="st-plan" title="Plan" sub="Title and deadline for the whole plan">
      <form onSubmit={save} noValidate className="flex flex-col gap-3.5">
        <Field label="Title" error={titleErr}><input className="field" value={f.title} onChange={(e) => set("title", e.target.value)} aria-invalid={!!titleErr} /></Field>
        <Field label="Summary line"><textarea className="field" rows={2} value={f.subtitle} onChange={(e) => set("subtitle", e.target.value)} placeholder="One sentence shown under the title" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plan deadline" error={dlErr} hint="Projects without their own deadline use this one."><input type="date" className="field num" value={f.deadline} onChange={(e) => set("deadline", e.target.value)} /></Field>
          <Field label="Deadline label"><input className="field" value={f.deadlineLabel} onChange={(e) => set("deadlineLabel", e.target.value)} placeholder="Deadline" /></Field>
        </div>
        <Field label="Currency symbol" className="max-w-[160px]"><input className="field" value={f.currency} onChange={(e) => set("currency", e.target.value)} maxLength={4} /></Field>
        <div><button type="submit" className="btn btn-primary" disabled={!changed || !!titleErr || !!dlErr}>Save plan settings</button></div>
      </form>
    </Card>
  );
}

function FacilitiesCard({ ctx }: { ctx: Ctx }) {
  const { plan, store } = ctx;
  const [add, setAdd] = useState("");
  const [edit, setEdit] = useState<{ from: string; to: string } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const uses = (f: string) => plan.projects.filter((p) => p.facility === f || p.tasks.some((t) => t.facility === f)).length;
  const exists = (n: string) => plan.facilities.some((x) => x.toLowerCase() === n.trim().toLowerCase());
  const addErr = add.trim() && exists(add) ? "This facility is already in the list." : "";
  const renameErr = edit && edit.to.trim() !== edit.from && exists(edit.to) ? "Another facility already has this name." : edit && !edit.to.trim() ? "Give it a name." : "";

  function rename(e: FormEvent) {
    e.preventDefault();
    if (!edit || renameErr) return;
    const to = edit.to.trim(), from = edit.from;
    if (to !== from) store.update((d) => {
      d.facilities = d.facilities.map((x) => (x === from ? to : x));
      d.projects.forEach((p) => { if (p.facility === from) p.facility = to; p.tasks.forEach((t) => { if (t.facility === from) t.facility = to; }); });
    });
    setEdit(null);
  }
  function remove(f: string) {
    store.update((d) => {
      d.facilities = d.facilities.filter((x) => x !== f);
      d.projects.forEach((p) => { if (p.facility === f) p.facility = ""; p.tasks.forEach((t) => { if (t.facility === f) t.facility = ""; }); });
    });
    setRemoving(null);
    ctx.toast(`Removed "${f}".`, { label: "Undo", fn: store.undo });
  }
  return (
    <Card id="st-fac" title="Facilities" sub="The areas used to group and filter projects">
      {!plan.facilities.length && <Empty title="No facilities yet">Add the areas of the building, for example 4th floor or Parking. You can then pick one for each project.</Empty>}
      <div className="flex flex-col gap-2">
        {plan.facilities.map((f) => edit?.from === f ? (
          <form key={f} onSubmit={rename} className="tile flex flex-col gap-2 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <input className="field flex-1" style={{ minWidth: 140 }} autoFocus value={edit.to} onChange={(e) => setEdit({ from: f, to: e.target.value })} aria-label={`New name for ${f}`} aria-invalid={!!renameErr} />
              <button type="submit" className="btn btn-sm btn-primary" disabled={!!renameErr}>Save</button>
              <button type="button" className="btn btn-sm" onClick={() => setEdit(null)}>Cancel</button>
            </div>
            {renameErr && <span className="err-text" role="alert">{renameErr}</span>}
          </form>
        ) : (
          <div key={f} className="tile flex flex-wrap items-center gap-2.5 px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{f}</span>
            {removing === f ? (
              <span className="flex flex-wrap items-center gap-2 text-[13px]">
                {uses(f) ? `Used by ${plural(uses(f), "project")}. Remove it from them too?` : "Remove it?"}
                <button type="button" className="btn btn-sm btn-danger" onClick={() => remove(f)}>Yes, remove</button>
                <button type="button" className="btn btn-sm" onClick={() => setRemoving(null)}>Keep</button>
              </span>
            ) : (
              <>
                <Chip tone="plain">{plural(uses(f), "project")}</Chip>
                <button type="button" className="btn btn-sm" onClick={() => setEdit({ from: f, to: f })}>Rename</button>
                <button type="button" className="btn btn-sm btn-danger" onClick={() => setRemoving(f)} aria-label={`Remove ${f}`}><Icon name="trash" size={15} /></button>
              </>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={(e) => { e.preventDefault(); const n = add.trim(); if (!n || addErr) return; store.update((d) => { d.facilities.push(n); }); setAdd(""); }} className="flex flex-wrap items-end gap-2.5">
        <Field label="Add a facility" error={addErr} className="min-w-[200px] flex-1"><input className="field" value={add} onChange={(e) => setAdd(e.target.value)} placeholder="For example Roof" aria-invalid={!!addErr} /></Field>
        <button type="submit" className="btn" disabled={!add.trim() || !!addErr}><Icon name="plus" size={16} />Add</button>
      </form>
    </Card>
  );
}

function HistoryCard({ ctx }: { ctx: Ctx }) {
  const { store } = ctx;
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  async function load() {
    setState("loading"); setError("");
    try { setItems(await store.history()); setState("idle"); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setState("error"); }
  }
  async function restore(v: number) {
    setBusy(v);
    try { await store.restore(v); ctx.toast(`Version ${v} is back as the current plan.`, { label: "Undo", fn: store.undo }); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); setState("error"); }
    setBusy(null);
  }
  return (
    <Card id="st-hist" title="Version history" sub="The last 50 saved versions. Saves by one person within ten minutes count as one."
      right={<button type="button" className="btn btn-sm" onClick={load} disabled={state === "loading"}>{items ? "Refresh" : "Show versions"}</button>}>
      {state === "loading" && <div className="skel h-24" aria-busy="true" aria-label="Loading versions" />}
      {state === "error" && (
        <div className="tile flex flex-col gap-2.5 p-4" role="alert">
          <span className="text-sm font-semibold">The versions did not load</span>
          <span className="text-[13px] text-white/80">{error}. Check your connection and try again.</span>
          <div><button type="button" className="btn btn-sm" onClick={load}>Try again</button></div>
        </div>
      )}
      {state === "idle" && !items && <span className="text-[13px] text-white/70">Open the list to bring an earlier version back.</span>}
      {state === "idle" && items && !items.length && <Empty title="No saved versions yet">Versions appear here after the first change is saved.</Empty>}
      {state === "idle" && items && items.length > 0 && (
        <div className="flex max-h-[340px] flex-col gap-2 overflow-y-auto">
          {items.map((it) => (
            <div key={it.version} className="tile flex flex-wrap items-center gap-2.5 px-3.5 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{it.savedBy || "Someone"}</span>
                <span className="num text-xs text-white/65">{it.savedAt ? `${when(it.savedAt)} · ${fmtDate(Date.parse(it.savedAt))}` : "Date unknown"} · version {it.version}</span>
              </span>
              {it.version === store.meta.version ? <Chip tone="good">Current</Chip> : <button type="button" className="btn btn-sm" onClick={() => restore(it.version)} disabled={busy != null}>{busy === it.version ? "Restoring" : "Restore"}</button>}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
