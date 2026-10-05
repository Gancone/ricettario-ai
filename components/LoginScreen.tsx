"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login() {
    if (busy) return;
    if (!password) return setError("Inserisci la password del Ricettario.");
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Accesso non riuscito");
      onAuthenticated();
    } catch (e: any) { setError(e?.message || "Accesso non riuscito"); }
    finally { setBusy(false); }
  }

  return (
    <main className="login-page">
      <form className="login-card surface" onSubmit={(event) => { event.preventDefault(); void login(); }}>
        <div className="login-mark"><Icon name="book" size={28} /></div>
        <span className="eyebrow">Ricettario personale</span>
        <h1>Le tue ricette, solo per te.</h1>
        <p>Un posto per conservare i tuoi sapori preferiti. Accedi e ritrova tutte le tue ricette.</p>
        <div className="field"><label htmlFor="login-password">Password del ricettario</label><div className="input-with-icon"><Icon name="lock" size={17} /><input id="login-password" type="password" autoComplete="current-password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} placeholder="Inserisci la tua password" aria-describedby={error ? "login-error" : undefined} aria-invalid={!!error} /></div></div>
        <button className="button primary big full" type="submit" disabled={busy}><Icon name="lock" size={17} />{busy ? "Accesso…" : "Entra nel ricettario"}</button>
        {error ? <div className="warning-box" id="login-error" role="alert">{error}</div> : null}
      </form>
    </main>
  );
}
