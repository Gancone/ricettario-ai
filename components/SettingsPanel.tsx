"use client";

import { useEffect, useRef, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { Icon } from "@/components/Icon";

export function SettingsPanel({
  categories,
  setCategories,
  recipes,
  onLogout,
  onImagesRepaired
}: {
  categories: Category[];
  setCategories: (categories: Category[]) => void;
  recipes: Recipe[];
  onLogout: () => void;
  onImagesRepaired: (updates: Array<{ id: string; imageUrl: string }>) => void;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updating, setUpdating] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("6.0.0");
  const [backup, setBackup] = useState<{ recipes: number; latestBackupAt: string; latestBackupRecipes: number; protected: boolean } | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState("");
  const [system, setSystem] = useState<Record<string, { ok: boolean; label: string }> | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairMessage, setRepairMessage] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function refreshBackupStatus() {
    try {
      const r = await fetch("/api/backup/status", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setBackup(d);
    } catch {}
  }

  async function refreshSystem() {
    try {
      const r = await fetch("/api/system/status", { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setSystem(d);
    } catch {}
  }

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" }).then((r) => r.json()).then((d) => d.version && setCurrentVersion(d.version)).catch(() => {});
    refreshBackupStatus();
    refreshSystem();
  }, []);

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const response = await fetch("/api/categories", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const data = await response.json();
    if (!response.ok) return alert(data.error || "Non riesco a creare il catalogo.");
    setCategories([...categories.filter((x) => x.id !== data.id), data].sort((a, b) => a.name.localeCompare(b.name, "it")));
    setNewCategory("");
    refreshBackupStatus();
  }

  async function removeCategory(category: Category) {
    if (category.id < 0) return alert("Questo è un catalogo base e non viene eliminato.");
    if (recipes.some((r) => r.category === category.name && !r.archived)) return alert("Prima sposta le ricette di questo catalogo in un'altra categoria.");
    if (!confirm(`Eliminare solo il catalogo “${category.name}”? Le ricette non verranno toccate.`)) return;
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    if (!response.ok) return alert("Non riesco a eliminare il catalogo.");
    setCategories(categories.filter((c) => c.id !== category.id));
    refreshBackupStatus();
  }

  async function createBackup() {
    setBackupBusy(true); setBackupMessage("Creo una copia di sicurezza…");
    try {
      const r = await fetch("/api/backup/snapshot", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Backup non riuscito");
      setBackupMessage(`Backup creato · ${d.recipes} ricette protette.`);
      await refreshBackupStatus(); await refreshSystem();
    } catch (error: any) { setBackupMessage(error?.message || "Backup non riuscito"); }
    finally { setBackupBusy(false); }
  }

  async function restoreBackup() {
    if (!confirm("Ripristinare l'ultimo backup? Il ripristino è additivo: non elimina nulla.")) return;
    setBackupBusy(true); setBackupMessage("Ripristino l’ultimo backup…");
    try {
      const r = await fetch("/api/backup/restore", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Ripristino non riuscito");
      setBackupMessage(d.restored ? `Ripristinate ${d.recipes} ricette. Ricarico…` : "Non c'è ancora un backup da ripristinare.");
      if (d.restored) window.setTimeout(() => window.location.reload(), 900);
    } catch (error: any) { setBackupMessage(error?.message || "Ripristino non riuscito"); }
    finally { setBackupBusy(false); }
  }

  async function repairImages() {
    setRepairing(true); setRepairMessage("Cerco fino a 8 copertine mancanti…");
    try {
      const r = await fetch("/api/recipes/images/repair", { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Riparazione non riuscita");
      onImagesRepaired(d.updated || []);
      setRepairMessage(`${d.updated?.length || 0} copertine riparate${d.remaining ? ` · ${d.remaining} ancora da verificare` : ""}.`);
    } catch (error: any) { setRepairMessage(error?.message || "Riparazione non riuscita"); }
    finally { setRepairing(false); }
  }

  async function installUpdate() {
    if (!updateFile) return setUpdateStatus("Scegli il file ZIP dell'aggiornamento.");
    setUpdating(true);
    setUpdateStatus("Verifico il backup e invio la nuova versione…");
    try {
      const form = new FormData(); form.append("file", updateFile);
      const response = await fetch("/api/admin/update", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Aggiornamento non riuscito");
      setUpdateStatus(`Backup verificato. Vercel sta installando la versione ${data.version}…`);
      setUpdateFile(null); if (fileRef.current) fileRef.current.value = "";
      if (data.version && data.version !== currentVersion) {
        const started = Date.now();
        const timer = window.setInterval(async () => {
          if (Date.now() - started > 5 * 60 * 1000) {
            window.clearInterval(timer);
            setUpdateStatus("Deploy ancora in corso. Riapri l'app tra poco: il backup pre-aggiornamento è già al sicuro.");
            return;
          }
          try {
            const versionResponse = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
            const versionData = await versionResponse.json();
            if (versionData.version === data.version) {
              window.clearInterval(timer);
              setUpdateStatus(`Versione ${data.version} installata. Ricarico…`);
              window.setTimeout(() => window.location.reload(), 1000);
            }
          } catch {}
        }, 9000);
      }
    } catch (error: any) { setUpdateStatus(error?.message || "Aggiornamento non riuscito."); }
    finally { setUpdating(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    onLogout();
  }

  const backupDate = backup?.latestBackupAt ? new Date(backup.latestBackupAt).toLocaleString("it-IT") : "non ancora creato";

  return (
    <section className="page-section settings-page">
      <div className="section-heading compact-heading"><span className="eyebrow">Impostazioni</span><h2>Controllo totale.</h2><p>Backup, cataloghi, salute del sistema e aggiornamenti. Nessun codice da toccare.</p></div>

      <div className="settings-grid">
        <div className="surface settings-card protection-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="shield" size={20} /></span><h3>Protezione ricette</h3><p>Le ricette vivono su Supabase, hanno una copia locale e snapshot automatici. Gli aggiornamenti non modificano il database.</p></div><span className="status-pill good">Fortress</span></div>
          <div className="protection-stats"><div><strong>{backup?.recipes ?? recipes.length}</strong><span>ricette su Supabase</span></div><div><strong>{backup?.latestBackupRecipes ?? "–"}</strong><span>nell’ultimo backup</span></div></div>
          <div className="backup-last"><Icon name="cloud" size={16} /><span>Ultimo backup: <b>{backupDate}</b></span></div>
          <div className="button-row"><button className="button primary" disabled={backupBusy} type="button" onClick={createBackup}><Icon name="shield" size={16} /> Backup ora</button><a className="button soft" href="/api/backup/export"><Icon name="download" size={16} /> Scarica JSON</a><button className="button soft" disabled={backupBusy} type="button" onClick={restoreBackup}><Icon name="refresh" size={16} /> Ripristina</button></div>
          {backupMessage ? <div className="status-line">{backupMessage}</div> : null}
        </div>

        <div className="surface settings-card system-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="database" size={20} /></span><h3>Stato del sistema</h3><p>Un controllo rapido senza consumare credito OpenAI.</p></div><button className="button soft tiny-button" onClick={refreshSystem} type="button"><Icon name="refresh" size={14} />Controlla</button></div>
          <div className="system-grid">
            {system ? (Object.entries(system) as Array<[string, { ok: boolean; label: string }]>).map(([key, item]) => <div className={item.ok ? "system-row ok" : "system-row bad"} key={key}><span className="system-dot"/><div><strong>{key === "auth" ? "Accesso" : key === "openai" ? "OpenAI" : key === "updates" ? "Aggiornamenti" : key === "supabase" ? "Supabase" : key === "backup" ? "Backup" : "Immagini"}</strong><small>{item.label}</small></div></div>) : <div className="muted-line">Controllo in corso…</div>}
          </div>
        </div>

        <div className="surface settings-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="tag" size={20} /></span><h3>Cataloghi</h3><p>I cataloghi base vengono sempre ricreati se mancanti.</p></div><span className="count-pill">{categories.length}</span></div>
          <div className="category-manager">{categories.map((c) => <div className="category-manager-row" key={`${c.id}-${c.name}`}><span>{c.name}</span><small>{recipes.filter((r) => r.category === c.name && !r.archived).length}</small><button type="button" className="tiny-danger" onClick={() => removeCategory(c)}>{c.id < 0 ? "Base" : "Rimuovi"}</button></div>)}</div>
          <div className="inline-add"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nuovo catalogo…" onKeyDown={(e) => e.key === "Enter" && addCategory()} /><button className="button primary" type="button" onClick={addCategory}><Icon name="plus" size={16} />Aggiungi</button></div>
        </div>

        <div className="surface settings-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="image" size={20} /></span><h3>Copertine</h3><p>Il recupero massivo non parte più a ogni apertura. Lo avvii tu solo quando serve.</p></div></div>
          <button className="button soft full" disabled={repairing} type="button" onClick={repairImages}><Icon name="image" size={16} />{repairing ? "Recupero…" : "Ripara copertine mancanti"}</button>
          {repairMessage ? <div className="status-line">{repairMessage}</div> : null}
        </div>

        <div className="surface settings-card update-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="refresh" size={20} /></span><h3>Aggiornamenti ZIP</h3><p>Non c'è più una seconda password: se hai effettuato l'accesso al Ricettario, puoi aggiornare. Se il backup pre-update fallisce, l'aggiornamento viene bloccato.</p></div><span className="version-pill">v{currentVersion}</span></div>
          <label className={updateFile ? "update-drop has-file" : "update-drop"}><Icon name="download" size={28} /><strong>{updateFile?.name || "Trascina o scegli lo ZIP"}</strong><span>Il pacchetto aggiorna solo il codice. Le ricette restano su Supabase.</span><input ref={fileRef} type="file" accept=".zip,application/zip" onChange={(e) => setUpdateFile(e.target.files?.[0] || null)} /></label>
          <button className="button primary full" type="button" disabled={!updateFile || updating} onClick={installUpdate}><Icon name="refresh" size={16} />{updating ? "Aggiorno…" : "Installa aggiornamento"}</button>
          {updateStatus ? <div className="status-line">{updateStatus}</div> : null}
        </div>

        <div className="surface settings-card account-card">
          <div className="settings-title"><div><span className="settings-icon"><Icon name="lock" size={20} /></span><h3>Accesso personale</h3><p>La stessa sessione protegge ricette, OpenAI e aggiornamenti. Resta memorizzata sul dispositivo.</p></div></div>
          <button className="button soft" type="button" onClick={logout}><Icon name="logout" size={16} /> Esci da questo dispositivo</button>
        </div>
      </div>
    </section>
  );
}
