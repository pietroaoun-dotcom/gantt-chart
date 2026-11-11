// Sign-in screen. Accounts are created by an administrator; the first time someone signs in
// (or after a reset) they choose their own password, typed twice.
import { useState, type FormEvent } from "react";
import type { Store } from "../lib/store";
import { Field, Icon } from "./ui";

export default function SignIn({ store }: { store: Store }) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [setup, setSetup] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    if (!name.trim()) return setError("Enter your name.");
    if (setup && pass.length < 6) return setError("Choose a password of at least 6 characters.");
    if (setup && pass !== pass2) return setError("The two passwords are not the same.");
    setBusy(true);
    if (setup) {
      const r = await store.setPassword(name, pass, pass2);
      if (r.error) setError(r.error);
    } else {
      const r = await store.signIn(name, pass);
      if (r.setup) { setSetup(true); setPass(""); setPass2(""); }
      else if (r.error) setError(r.error);
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto flex w-full max-w-[440px] flex-col gap-5 pt-[6vh]">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-accent text-on-accent"><Icon name="gantt" size={24} /></span>
        <div className="flex flex-col leading-tight">
          <span className="display text-xl font-bold tracking-wide">Project Gantt</span>
          <span className="muted text-sm">HOLDAL facilities</span>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="glass flex flex-col gap-4 p-6">
        <div className="flex flex-col gap-1">
          <h1 className="display m-0 text-2xl font-semibold">{setup ? "Choose your password" : "Sign in"}</h1>
          <span className="text-[13px] leading-relaxed text-white/75">
            {setup ? `Welcome, ${name.trim()}. Choose a password for your account and type it twice.` : "Use the name your administrator gave your account. Everything you change is recorded under it."}
          </span>
        </div>
        {!setup && (
          <Field label="Name"><input className="field" autoFocus autoComplete="username" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></Field>
        )}
        <Field label={setup ? "New password" : "Password"} hint={setup ? "At least 6 characters." : "First time here? Leave it empty and continue."}>
          <input className="field" type="password" autoFocus={setup} autoComplete={setup ? "new-password" : "current-password"} value={pass} onChange={(e) => setPass(e.target.value)} />
        </Field>
        {setup && (
          <Field label="The same password again"><input className="field" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></Field>
        )}
        {error && <span className="err-text" role="alert">{error}</span>}
        <div className="flex flex-wrap items-center gap-2.5">
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "One moment" : setup ? "Save password and sign in" : "Sign in"}</button>
          {setup && <button type="button" className="btn" onClick={() => { setSetup(false); setPass(""); setPass2(""); setError(""); }}>Back</button>}
        </div>
      </form>
      <span className="px-1 text-xs leading-relaxed text-white/60">No account, or forgot your password? Ask an administrator to add you or to reset it.</span>
    </div>
  );
}
