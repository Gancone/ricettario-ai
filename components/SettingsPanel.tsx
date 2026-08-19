"use client";

import { useEffect, useRef, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";

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
  const [updateFile, setUpdateFile] = useState<File | null>(null);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updating, setUpdating] = useState(false);
  const [currentVersion, setCurrentVersion] = useState("4.0.0");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/version", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => d.version && setCurrentVersion(d.version))
      .catch(() => {});
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
    setCategories([...categories, data].sort((a, b) => a.name.localeCompare(b.name, "it")));
    setNewCategory("");
  }

  async function removeCategory(category: Category) {
    if (recipes.some((r) => r.category === category.name)) {
      alert("Prima sposta le ricette di questo catalogo in un'altra categoria.");
      return;
    }
    if (!confirm(`Eliminare il catalogo “${category.name}”?`)) return;
    const response = await fetch(`/api/categories/${category.id}`, { method: "DELETE" });
    if (!response.ok) return alert("Non riesco a eliminare il catalogo.");
    setCategories(categories.filter((c) => c.id !== category.id));
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), recipes, categories }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `backup-ricettario-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function installUpdate() {
    if (!updateFile) return setUpdateStatus("Scegli il file ZIP che ti ho fornito.");
    if (!updatePassword) return setUpdateStatus("Inserisci la password aggiornamenti.");
    setUpdating(true);
    setUpdateStatus("Invio aggiornamento a GitHub…");
    try {
      const form = new FormData();
      form.append("file", updateFile);
      form.append("password", updatePassword);
      const response = await fetch("/api/admin/update", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Aggiornamento non riuscito");
      setUpdateStatus(`✓ ${data.message} Attendo che Vercel pubblichi la versione ${data.version}…`);
      setUpdateFile(null);

      if (data.version && data.version !== currentVersion) {
        const started = Date.now();
        const timer = window.setInterval(async () => {
          if (Date.now() - started > 4 * 60 * 1000) {
            window.clearInterval(timer);
            setUpdateStatus(`Aggiornamento inviato. Il deploy sta impiegando più del previsto: ricarica la pagina tra poco.`);
            return;
          }
          try {
            const versionResponse = await fetch(`/api/version?t=${Date.now()}`, { cache: "no-store" });
            const versionData = await versionResponse.json();
            if (versionData.version === data.version) {
              window.clearInterval(timer);
              setUpdateStatus(`✓ Versione ${data.version} installata. Ricarico l’app…`);
              window.setTimeout(() => window.location.reload(), 1200);
            }
          } catch {}
        }, 10000);
      }
      if (fileRef.current) fileRef.current.value = "";
    } catch (error: any) {
      setUpdateStatus(error?.message || "Aggiornamento non riuscito.");
    } finally {
      setUpdating(false);
    }
  }

  return (
    <section className="page-section settings-page">
      <div className="section-heading"><span className="eyebrow">Impostazioni</span><h2>Il tuo ricettario, sotto controllo.</h2></div>

      <div className="settings-grid">
        <div className="surface settings-card">
          <div className="settings-title"><div><h3>Cataloghi</h3><p>Crea e organizza le categorie come preferisci.</p></div><span className="count-pill">{categories.length}</span></div>
          <div className="category-manager">
            {categories.map((c) => <div className="category-manager-row" key={c.id}><span>{c.name}</span><button type="button" className="tiny-danger" onClick={() => removeCategory(c)}>Elimina</button></div>)}
          </div>
          <div className="inline-add"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="Nuovo catalogo…" onKeyDown={(e) => e.key === "Enter" && addCategory()} /><button className="button primary" type="button" onClick={addCategory}>Aggiungi</button></div>
        </div>

        <div className="surface settings-card">
          <div className="settings-title"><div><h3>Backup</h3><p>Scarica una copia completa delle ricette e categorie.</p></div></div>
          <button className="button soft full" type="button" onClick={exportBackup}>Esporta backup JSON</button>
          <div className="info-note">Il backup non usa OpenAI e non comporta costi.</div>
        </div>

        <div className="surface settings-card update-card">
          <div className="settings-title"><div><h3>Aggiornamenti ZIP</h3><p>Dopo la configurazione iniziale, i prossimi aggiornamenti si installano direttamente da qui: trascini il mio ZIP e Vercel si aggiorna da solo.</p></div><span className="version-pill">v{currentVersion}</span></div>

          <label
            className={updateFile ? "update-drop has-file" : "update-drop"}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) setUpdateFile(f); }}
          >
            <input ref={fileRef} type="file" accept=".zip,application/zip" onChange={(e) => setUpdateFile(e.target.files?.[0] || null)} />
            <strong>{updateFile ? updateFile.name : "Trascina qui il file ZIP"}</strong>
            <span>oppure tocca per sceglierlo</span>
          </label>

          <div className="field"><label>Password aggiornamenti</label><input type="password" autoComplete="current-password" value={updatePassword} onChange={(e) => setUpdatePassword(e.target.value)} placeholder="••••••••••••" /></div>
          <button className="button primary full" type="button" disabled={updating} onClick={installUpdate}>{updating ? "Aggiornamento…" : "Installa aggiornamento"}</button>
          {updateStatus ? <div className="status-line">{updateStatus}</div> : null}
          <div className="info-note">Richiede una configurazione una tantum su Vercel: token GitHub + password. Il token resta solo sul server.</div>
        </div>
      </div>
    </section>
  );
}
