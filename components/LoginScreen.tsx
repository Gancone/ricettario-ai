"use client";

import { useState } from "react";
import { Icon } from "@/components/Icon";

export function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login() {
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
      <div className="login-card surface">
        <div className="login-mark"><Icon name="book" size={28} /></div>
        <span className="eyebrow">Ricettario personale</span>
        <h1>Le tue ricette, solo per te.</h1>
        <p>Accedi una volta su questo dispositivo. La sessione resta memorizzata e protegge anche le API OpenAI e gli aggiornamenti.</p>
        <div className="field"><label>Password</label><div className="input-with-icon"><Icon name="lock" size={17} /><input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && login()} placeholder="La password che usavi per gli aggiornamenti" /></div></div>
        <button className="button primary big full" type="button" disabled={busy} onClick={login}><Icon name="lock" size={17} />{busy ? "Accesso…" : "Entra nel ricettario"}</button>
        {error ? <div className="warning-box">{error}</div> : null}
      </div>
    </main>
  );
}
