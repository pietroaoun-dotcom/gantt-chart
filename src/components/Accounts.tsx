// Accounts (administrators only): add a person by name, reset a password, make someone an
// administrator, remove an account, and see the recent activity.
import { useEffect, useState, type FormEvent } from "react";
import type { Ctx } from "../lib/ctx";
import type { Account } from "../lib/store";
import { when } from "../lib/when";
import { Card, Chip, Field, Icon } from "./ui";

interface LogItem { at: string; action: string; by: string; forName?: string; version?: number }
const WORDS: Record<string, (i: LogItem) => string> = {
  "plan-saved": (i) => `${i.by} changed the plan (version ${i.version})`,
  "user-added": (i) => `${i.by} added the account ${i.forName}`,
  "user-removed": (i) => `${i.by} removed the account ${i.forName}`,
  "password-set": (i) => `${i.by} chose a password`,
  "password-reset": (i) => `${i.by} reset the password of ${i.forName}`,
  "admin-on": (i) => `${i.by} made ${i.forName} an administrator`,
  "admin-off": (i) => `${i.by} removed administrator rights from ${i.forName}`,
};

export default function Accounts({ ctx }: { ctx: Ctx }) {
  const { store } = ctx;
  const [users, setUsers] = useState<Account[] | null>(null);
  const [items, setItems] = useState<LogItem[] | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [confirm, setConfirm] = useState<{ name: string; what: "reset" | "remove" } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setError("");
    try {
      setUsers((await store.admin<{ users: Account[] }>("users")).users);
      setItems((await store.admin<{ items: LogItem[] }>("activity")).items);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function act(action: string, body: Record<string, unknown>, done: string) {
    setBusy(true); setError("");
    try { await store.admin(action, body); ctx.toast(done); setConfirm(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }
  async function add(e: FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setAddErr("Enter the person's name.");
    setAddErr(""); setBusy(true);
    try { await store.admin("addUser", { name: n }); setName(""); ctx.toast(`Added ${n}. They choose a password the first time they sign in.`); await load(); }
    catch (err) { setAddErr(err instanceof Error ? err.message : String(err)); }
    setBusy(false);
  }

  return (
    <>
      <Card id="st-acc" title="Accounts" sub="Add a person by name. They choose their own password the first time they sign in.">
        {error && (
          <div className="tile flex flex-col gap-2.5 p-4" role="alert">
            <span className="text-sm font-semibold">That did not work</span>
            <span className="text-[13px] text-white/80">{error}</span>
            <div><button type="button" className="btn btn-sm" onClick={load}>Try again</button></div>
          </div>
        )}
        {!users && !error && <div className="skel h-24" aria-busy="true" aria-label="Loading accounts" />}
        <div className="flex flex-col gap-2">
          {users?.map((u) => (
            <div key={u.name} className="tile flex flex-wrap items-center gap-2.5 px-3.5 py-2.5">
              <span className="flex min-w-[140px] flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">{u.name}</span>
                <span className="num text-xs text-white/65">{u.waiting ? "Has not chosen a password yet" : u.lastSeen ? `Last seen ${when(u.lastSeen)}` : "Has not signed in yet"}</span>
              </span>
              {confirm?.name === u.name ? (
                <span className="flex flex-wrap items-center gap-2 text-[13px]">
                  {confirm.what === "reset" ? "Reset the password? They are signed out and choose a new one." : "Remove this account?"}
                  <button type="button" className="btn btn-sm btn-danger" disabled={busy}
                    onClick={() => confirm.what === "reset" ? act("resetUser", { name: u.name }, `Password of ${u.name} reset.`) : act("removeUser", { name: u.name }, `Removed ${u.name}.`)}>
                    {confirm.what === "reset" ? "Yes, reset" : "Yes, remove"}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setConfirm(null)}>Cancel</button>
                </span>
              ) : (
                <>
                  {u.admin && <Chip tone="good">Administrator</Chip>}
                  {u.waiting && <Chip tone="warn">Waiting</Chip>}
                  {!u.owner && <button type="button" className="btn btn-sm" disabled={busy} onClick={() => act("setAdmin", { name: u.name, admin: !u.admin }, u.admin ? `${u.name} is no longer an administrator.` : `${u.name} is now an administrator.`)}>{u.admin ? "Remove admin" : "Make admin"}</button>}
                  {!u.waiting && <button type="button" className="btn btn-sm" onClick={() => setConfirm({ name: u.name, what: "reset" })}>Reset password</button>}
                  {!u.owner && <button type="button" className="btn btn-sm btn-danger" onClick={() => setConfirm({ name: u.name, what: "remove" })} aria-label={`Remove ${u.name}`}><Icon name="trash" size={15} /></button>}
                </>
              )}
            </div>
          ))}
        </div>
        <form onSubmit={add} className="flex flex-wrap items-end gap-2.5">
          <Field label="Add a person" error={addErr} className="min-w-[200px] flex-1"><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" maxLength={40} aria-invalid={!!addErr} /></Field>
          <button type="submit" className="btn btn-primary" disabled={busy}><Icon name="plus" size={16} />Add account</button>
        </form>
      </Card>
      <Card id="st-act" title="Activity" sub="Who changed the plan and the accounts, newest first"
        right={<button type="button" className="btn btn-sm" onClick={load}>Refresh</button>}>
        {!items && !error && <div className="skel h-24" aria-busy="true" aria-label="Loading activity" />}
        {items && !items.length && <span className="text-[13px] text-white/70">Nothing recorded yet. Changes appear here once people start editing.</span>}
        {items && items.length > 0 && (
          <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">
            {items.map((i, n) => (
              <div key={n} className="tile flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 px-3.5 py-2">
                <span className="text-[13px]">{(WORDS[i.action] ?? ((x: LogItem) => `${x.by}: ${x.action}`))(i)}</span>
                <span className="num text-xs text-white/60">{when(i.at)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </>
  );
}
