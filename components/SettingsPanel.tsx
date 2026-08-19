"use client";

import { useEffect, useRef, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { Icon } from "@/components/Icon";

export function SettingsPanel({
  categories,
  setCategories,
  recipes
}: {
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  recipes: Recipe[];
}) {
  const [newCategory, setNewCategory] = useState("");
  const [updatePassword, setUpdatePassword] = useState("");
  const [updateTrusted, setUpdateTrusted] = useState(false);
  const [trustChecked, setTrustChecked] = useState(false);
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updating, setUpdating] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("5.0.0");
  const [backup, setBackup] = useState<{ recipes: number; latestBackupAt: string; latestBackupRecipes: number; protected: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refreshBackupStatus() {
    try {
      const r = await fetch("/api/backup/status", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setBackup(d);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" }).then((r) => r.json()).then((d) => d.version && setCurrentVersion(d.version)).catch(() => {});
    fetch("/api/admin/trust", { cache: "no-store" }).then((r) => r.json()).then((d) => setUpdateTrusted(!!d.trusted)).catch(() => {}).finally(() => setTrustChecked(true));
    refreshBackupStatus();
  }, []);

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const response = await fetch("/api/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) return alert(data.error || "Non riesco a creare il catalogo.");
    setCategories([...categories.filter((x) => x.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name, "it")));
    setNewCategory("");
    refreshBackupStatus();
  }

  async function removeCategory(category: Category) {
    if (recipes.some((r) => r.category === category.name)) return alert("Prima sposta le ricette di questo catalogo in un'altra categoria.");
    if (!confirm(`Eliminare solo il catalogo “${category.name}”? Le ricette non verranno toccate.`)) return;
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    if (!response.ok) return alert("Non riesco a eliminare il catalogo.");
    setCategories(categories.filter((c) => c.id !== category.id));
    refreshBackupStatus();
  }

  async function createBackup() {
    setBackupBusy(true);
    setBackupMessage("Creo una copia di sicurezza…");
    try {
      const r = await fetch("/api/backup/snapshot", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Backup non riuscito");
      setBackupMessage(`Backup creato · ${d.recipes} ricette protette.`);
      await refreshBackupStatus();
    } catch (error: any) {
      setBackupMessage(error?.message || "Backup non riuscito");
    } finally { setBackupBusy(false); }
  }

  async function restoreBackup() {
    if (!confirm("Ripristinare l'ultimo backup? Il ripristino è additivo: non elimina le ricette già presenti.")) return;
    setBackupBusy(true);
    setBackupMessage("Ripristino l’ultimo backup…");
    try {
      const r = await fetch("/api/backup/restore", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ripristino non riuscito");
      setBackupMessage(d.restored ? `Ripristinate ${d.recipes} ricette. Ricarico…` : "Non c'è ancora un backup da ripristinare.");
      if (d.restored) window.setTimeout(() => window.location.reload(), 900);
    } catch (error: any) {
      setBackupMessage(error?.message || "Ripristino non riuscito");
    } finally { setBackupBusy(false); }
  }

  async function authorizeUpdates() {
    if (!updatePassword) return setUpdateStatus("Inserisci la password soltanto questa prima volta.");
    setUpdating(true);
    setUpdateStatus("Autorizzo questo dispositivo…");
    try {
      const response = await fetch("/api/admin/trust", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: updatePassword })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Autorizzazione non riuscita");
      setUpdateTrusted(true);
      setUpdatePassword("");
      setUpdateStatus("Dispositivo autorizzato. Da ora gli ZIP non richiedono più la password su questo browser.");
    } catch (error: any) {
      setUpdateStatus(error?.message || "Autorizzazione non riuscita.");
    } finally { setUpdating(false); }
  }

  async function installUpdate() {
    if (!updateFile) return setUpdateStatus("Scegli il file ZIP dell'aggiornamento.");
    if (!updateTrusted) return setUpdateStatus("Autorizza prima questo dispositivo una sola volta.");
    setUpdating(true);
    setUpdateStatus("Creo un backup pre-aggiornamento e invio la nuova versione…");
    try {
      const form = new FormData();
      form.append("file", updateFile);
      const response = await fetch("/api/admin/update", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Aggiornamento non riuscito");
      setUpdateStatus(`Aggiornamento inviato. Attendo Vercel per la versione ${data.version}…`);
      setUpdateFile(null);
      if (fileRef.current) fileRef.current.value = "";

      if (data.version && data.version !== currentVersion) {
        const started = Date.now();
        const timer = window.setInterval(async () => {
          if (Date.now() - started > 5 * 60 * 1000) {
            window.clearInterval(timer);
            setUpdateStatus("Deploy ancora in corso. Riapri l'app tra poco: le ricette sono già state salvate nel backup pre-aggiornamento.");
            return;
          }
          try {
            const versionResponse = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
            const versionData = await versionResponse.json();
            if (versionData.version === data.version) {
              window.clearInterval(timer);
              setUpdateStatus(`Versione ${data.version} installata. Ricarico l’app…`);
              window.setTimeout(() => window.location.reload(), 1000);
            }
          } catch {}
        }, 9000);
      }
    } catch (error: any) {
      setUpdateStatus(error?.message || "Aggiornamento non riuscito.");
    } finally { setUpdating(false); }
  }

  const backupDate = backup?.latestBackupAt ? new Date(backup.latestBackupAt).toLocaleString("it-IT") : "non ancora creato";

  return (
    <section className="page-section settings-page">
      <div className="section-heading"><span className="eyebrow">Impostazioni</span><h2>Ordine, sicurezza, controllo.</h2><p>Qui gestisci cataloghi, backup e aggiornamenti senza toccare il codice.</p></div>

      <div className="settings-grid">
        <div className="surface settings-card protection-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="shield" size={20} /></span><h3>Protezione ricette</h3><p>Le ricette non vengono cancellate dagli aggiornamenti e la cancellazione permanente è disattivata.</p></div><span className="status-pill good">Attiva</span></div>
          <div className="protection-stats">
            <div><strong>{backup?.recipes ?? recipes.length}</strong><span>ricette su Supabase</span></div>
            <div><strong>{backup?.latestBackupRecipes ?? "–"}</strong><span>nell’ultimo backup</span></div>
          </div>
          <div className="backup-last"><Icon name="cloud" size={16} /><span>Ultimo backup: <b>{backupDate}</b></span></div>
          <div className="button-row">
            <button className="button primary" disabled={backupBusy} type="button" onClick={createBackup}><Icon name="shield" size={16} /> Backup ora</button>
            <a className="button soft" href="/api/backup/export"><Icon name="download" size={16} /> Scarica JSON</a>
            <button className="button soft" disabled={backupBusy} type="button" onClick={restoreBackup}><Icon name="refresh" size={16} /> Ripristina</button>
          </div>
          {backupMessage ? <div className="status-line">{backupMessage}</div> : null}
        </div>

        <div className="surface settings-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="tag" size={20} /></span><h3>Cataloghi</h3><p>Crea le tue sezioni e sposta le ricette quando vuoi.</p></div><span className="count-pill">{categories.length}</span></div>
          <div className="category-manager">
            {categories.map((c) => <div className="category-manager-row" key={c.id}><span>{c.name}</span><small>{recipes.filter((r) => r.category === c.name).length}</small><button type="button" className="tiny-danger" onClick={() => removeCategory(c)}>Rimuovi</button></div>)}
          </div>
          <div className="inline-add"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nuovo catalogo…" onKeyDown={(e) => e.key === "Enter" && addCategory()} /><button className="button primary" type="button" onClick={addCategory}><Icon name="plus" size={16} />Aggiungi</button></div>
        </div>

        <div className="surface settings-card update-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="refresh" size={20} /></span><h3>Aggiornamenti ZIP</h3><p>Trascina qui le versioni che ti preparo. Prima di ogni aggiornamento viene creato automaticamente un backup delle ricette.</p></div><span className="version-pill">v{currentVersion}</span></div>

          <label className={updateFile ? "update-drop has-file" : "update-drop"} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setUpdateFile(f); }}>
            <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={(e) => setUpdateFile(e.target.files?.[0] || null)} />
            <Icon name="download" size={28} />
            <strong>{updateFile ? updateFile.name : "Trascina qui il file ZIP"}</strong>
            <span>oppure tocca per sceglierlo</span>
          </label>

          {!trustChecked ? <div className="info-note">Controllo autorizzazione…</div> : null}
          {trustChecked && !updateTrusted ? (
            <div className="device-auth-box">
              <div><strong>Autorizzazione una sola volta</strong><p>Inserisci la password aggiornamenti soltanto ora. Questo browser resterà autorizzato per un anno.</p></div>
              <div className="inline-add"><input type="password" autoComplete="current-password" value={updatePassword} onChange={(e) => setUpdatePassword(e.target.value)} placeholder="Password aggiornamenti" /><button className="button soft" type="button" disabled={updating} onClick={authorizeUpdates}>Autorizza</button></div>
            </div>
          ) : null}
          {updateTrusted ? <div className="trusted-device"><Icon name="check" size={16} /> Questo dispositivo è autorizzato: niente password ai prossimi aggiornamenti.</div> : null}
          <button className="button primary full" type="button" disabled={updating || !updateTrusted} onClick={installUpdate}>{updating ? "Aggiornamento…" : "Installa aggiornamento"}</button>
          {updateStatus ? <div className="status-line">{updateStatus}</div> : null}
        </div>
      </div>
    </section>
  );
}
