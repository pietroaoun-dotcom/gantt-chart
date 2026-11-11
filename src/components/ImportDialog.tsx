// Import a backup (.json) or a task sheet (.csv): pick a file, see what would change, then
// choose to merge or replace. Problems are shown here with a way to try again.
import { useEffect, useRef, useState } from "react";
import type { Ctx } from "../lib/ctx";
import { diffImport, mergeImport, readImport, type ImportDiff } from "../lib/io";
import { plural, type Plan } from "../lib/model";
import { Modal } from "./ui";

export default function ImportDialog({ ctx, onClose }: { ctx: Ctx; onClose: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ name: string; incoming: Plan; diff: ImportDiff } | null>(null);
  const [error, setError] = useState("");
  const pick = () => input.current?.click();
  useEffect(() => { pick(); }, []);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(""); setState(null);
    try {
      const incoming = readImport(file.name, await file.text(), ctx.plan);
      setState({ name: file.name, incoming, diff: diffImport(ctx.plan, incoming) });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  function apply(mode: "merge" | "replace") {
    if (!state) return;
    ctx.store.replace(mode === "merge" ? mergeImport(ctx.plan, state.incoming) : state.incoming);
    ctx.toast(mode === "merge" ? `Merged ${state.name}.` : `Replaced the plan with ${state.name}.`, { label: "Undo", fn: ctx.store.undo });
    onClose();
  }
  const d = state?.diff;
  const nothing = d && !d.added && !d.changed && !d.missing;

  return (
    <Modal title="Import" onClose={onClose}
      footer={<>
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        {state && !nothing && <button type="button" className="btn" onClick={() => apply("replace")}>Replace everything</button>}
        {state && !nothing && (d!.added > 0 || d!.changed > 0) && <button type="button" className="btn btn-primary" onClick={() => apply("merge")}>Merge</button>}
      </>}>
      <input ref={input} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ""; }} />
      {!state && !error && (
        <>
          <p className="m-0">Choose a backup file (.json) or a task sheet (.csv) exported from this site.</p>
          <div><button type="button" className="btn" onClick={pick}>Choose a file</button></div>
        </>
      )}
      {error && (
        <div className="tile flex flex-col gap-2.5 p-4" role="alert">
          <span className="font-semibold">The file could not be imported</span>
          <span className="text-[13px] text-white/80">{error}. Nothing was changed.</span>
          <div><button type="button" className="btn btn-sm" onClick={pick}>Try another file</button></div>
        </div>
      )}
      {state && d && (
        <>
          <p className="m-0"><b className="font-semibold">{state.name}</b> holds {plural(state.incoming.projects.length, "project")} and {plural(d.added + d.changed + d.unchanged, "task")}.</p>
          <div className="grid grid-cols-3 gap-2.5">
            <Count n={d.added} label={d.added === 1 ? "task added" : "tasks added"} />
            <Count n={d.changed} label={d.changed === 1 ? "task changed" : "tasks changed"} />
            <Count n={d.unchanged} label="the same" />
          </div>
          {nothing ? <p className="m-0">This file matches the current plan, so there is nothing to import.</p> : (
            <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-[13px] text-white/80">
              <li><b className="font-semibold text-white">Merge</b> adds the new tasks and updates the changed ones. Nothing is removed.</li>
              <li><b className="font-semibold text-white">Replace everything</b> swaps the whole plan for the file{d.missing ? `, which removes ${plural(d.missing, "task")} that the file does not have` : ""}.</li>
              <li>Either way, Undo brings the current plan back.</li>
            </ul>
          )}
        </>
      )}
    </Modal>
  );
}
const Count = ({ n, label }: { n: number; label: string }) => (
  <div className="tile flex flex-col gap-0.5 px-3.5 py-3"><span className="display num text-2xl font-semibold">{n}</span><span className="text-xs text-white/70">{label}</span></div>
);
