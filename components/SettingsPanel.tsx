"use client";
import { useEffect, useRef, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { api, jsonBody } from "@/lib/api-client";
import { ThemeControl } from "./ThemeControl";
import {
  mergeRecipes,
  readRecipeCache,
  writeLocalRecipeSafetyCopy,
} from "@/lib/local-cache";
import { readOffline, writeOffline } from "@/lib/offline-db";
import { displayImageUrl } from "@/lib/image-client";
import { variantImageUrl } from "@/lib/image-url";
type Check = { ok: boolean; label: string };
export function SettingsPanel({
  categories,
  setCategories,
  recipes,
  onLogout,
  onImagesRepaired,
}: {
  categories: Category[];
  setCategories: (rows: Category[]) => void;
  recipes: Recipe[];
  onLogout: () => void;
  onImagesRepaired: (rows: { id: string; imageUrl: string }[]) => void;
}) {
  const [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [newCategory, setNewCategory] = useState(""),
    [version, setVersion] = useState("7.0.0"),
    [system, setSystem] = useState<Record<string, Check> | null>(null),
    [backup, setBackup] = useState<{
      recipes: number;
      latestBackupAt: string;
      latestBackupRecipes: number;
      protected: boolean;
    } | null>(null),
    [updateFile, setUpdateFile] = useState<File | null>(null),
    [result, setResult] = useState<{
      branch: string;
      commit: string;
      version: string;
    } | null>(null);
  const lock = useRef(false),
    backupInput = useRef<HTMLInputElement>(null);
  async function refresh() {
    try {
      const data = await api<typeof backup>("/api/backup/status");
      setBackup(data);
    } catch {}
  }
  useEffect(() => {
    void refresh();
    void api<{ version: string }>("/api/version")
      .then((data) => setVersion(data.version))
      .catch(() => {});
  }, []);
  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operazione non completata.",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function snapshot() {
    const data = await api<{ recipes: number }>(
      "/api/backup/snapshot",
      { method: "POST" },
      180000,
    );
    setMessage(`Backup verificato · ${data.recipes} ricette.`);
    await refresh();
  }
  async function importFile(file: File) {
    if (
      !confirm(
        "Importare il backup aggiungendo solo i record mancanti? Prima verrà creata una copia di sicurezza. I record esistenti saranno conservati.",
      )
    )
      return;
    await run(async () => {
      if (file.size > 50 * 1024 * 1024)
        throw new Error("Il backup supera il limite di 50 MB.");
      setMessage("Carico e verifico il backup…");
      let init: RequestInit;
      if (file.size > 3 * 1024 * 1024) {
        const upload = await api<{ path: string; signedUrl: string }>(
          "/api/backup/upload",
          { method: "POST" },
        );
        const response = await fetch(upload.signedUrl, {
          method: "PUT",
          headers: { "content-type": "application/zip", "x-upsert": "false" },
          body: file,
        });
        if (!response.ok)
          throw new Error("Caricamento del backup non completato. Riprova.");
        init = jsonBody({ uploadPath: upload.path });
      } else {
        const form = new FormData();
        form.append("file", file);
        init = { body: form };
      }
      const report = await api<{
        inserted: number;
        skippedExisting: number;
        conflicts: unknown[];
        errors: unknown[];
      }>("/api/backup/import", { method: "POST", ...init }, 300000);
      setMessage(
        `Importazione: ${report.inserted} nuovi record, ${report.skippedExisting} già presenti conservati, ${report.conflicts.length} conflitti, ${report.errors.length} righe da controllare. Ricarica il ricettario per vedere le aggiunte.`,
      );
      await writeOffline("last-import-report", report);
      await refresh();
    });
  }
  async function prepareOffline() {
    setMessage("Preparo le ricette per la consultazione offline…");
    let cursor: string | null = null;
    let all = await readRecipeCache();
    let count = 0;
    do {
      const response: { items: Recipe[]; nextCursor: string | null } =
        await api<{ items: Recipe[]; nextCursor: string | null }>(
          "/api/recipes?limit=100" + (cursor ? "&cursor=" + cursor : ""),
        );
      all = mergeRecipes(response.items, all);
      count += response.items.length;
      await writeLocalRecipeSafetyCopy(all);
      for (const recipe of response.items) {
        if (!recipe.imageUrl) continue;
        const url = displayImageUrl(variantImageUrl(recipe.imageUrl, "thumb"));
        try {
          const response = await fetch(url);
          if (response.ok) {
            const blob = await response.blob();
            if (blob.size < 400000) await writeOffline("image:" + url, blob);
          }
        } catch {}
      }
      if (response.nextCursor === cursor && cursor)
        throw new Error("Paginazione non valida: copia precedente conservata.");
      cursor = response.nextCursor;
    } while (cursor);
    setMessage(
      `${count} ricette preparate sul dispositivo. Le miniature disponibili sono state conservate. Il browser può rimuovere i dati locali: conserva anche un backup ZIP.`,
    );
  }
  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    const row = await api<Category>("/api/categories", {
      method: "POST",
      ...jsonBody({ name }),
    });
    setCategories([...categories.filter((item) => item.id !== row.id), row]);
    setNewCategory("");
    setMessage("Catalogo aggiunto.");
  }
  async function removeCategory(row: Category) {
    if (row.id < 0) return;
    if (
      !confirm(
        `Rimuovere il catalogo “${row.name}”? Le ricette vengono conservate.`,
      )
    )
      return;
    await api("/api/categories/" + row.id, { method: "DELETE" });
    setCategories(categories.filter((item) => item.id !== row.id));
    setMessage("Catalogo rimosso.");
  }
  async function installUpdate() {
    if (!updateFile) return;
    const form = new FormData();
    form.append("file", updateFile);
    const data = await api<{ branch: string; commit: string; version: string }>(
      "/api/admin/update",
      { method: "POST", body: form },
      300000,
    );
    setResult(data);
    setUpdateFile(null);
    setMessage(
      "Pacchetto verificato e preparato su un ramo di anteprima. Apri il relativo deployment Preview e verifica le funzioni prima del rilascio.",
    );
  }
  return (
    <section className="settings-page">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Come piace a te</span>
          <h2>Impostazioni</h2>
        </div>
        <span className="version-pill">v{version}</span>
      </div>
      {message && (
        <div className="status-line" role="status">
          {message}
        </div>
      )}
      <div className="settings-grid">
        <section className="surface settings-card">
          <h3>Aspetto</h3>
          <p>Una luce morbida, di giorno e di sera.</p>
          <ThemeControl />
          <p className="muted-line">
            La visualizzazione Griglia, Lista o Compatta si sceglie nel
            ricettario e resta su questo dispositivo.
          </p>
        </section>
        <section className="surface settings-card">
          <h3>Backup</h3>
          <p>
            La copia completa comprende dati e fotografie. L’importazione
            aggiunge solo ciò che manca.
          </p>
          <p>
            Ultimo backup:{" "}
            <strong>
              {backup?.latestBackupAt
                ? new Date(backup.latestBackupAt).toLocaleString("it-IT")
                : "da verificare"}
            </strong>
            {backup ? ` · ${backup.latestBackupRecipes} ricette` : ""}
          </p>
          <div className="button-row">
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void run(snapshot)}
            >
              Backup ora
            </button>
            <a className="button soft" href="/api/backup/export?format=zip">
              Scarica backup completo
            </a>
            <button
              className="button soft"
              disabled={busy}
              onClick={() => backupInput.current?.click()}
            >
              Importa backup
            </button>
            <input
              ref={backupInput}
              aria-label="File backup da importare"
              type="file"
              accept=".zip,application/zip"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void importFile(file);
                e.target.value = "";
              }}
            />
          </div>
          <details>
            <summary>Altre opzioni di recupero</summary>
            <div className="button-row">
              <a className="button soft" href="/api/backup/export">
                Scarica dati JSON
              </a>
              <button
                className="button soft"
                disabled={busy}
                onClick={() => {
                  if (
                    confirm(
                      "Ripristinare i record mancanti dall’ultimo backup verificato? I record attuali saranno conservati.",
                    )
                  )
                    void run(async () => {
                      const data = await api<{
                        restored: boolean;
                        recipes: number;
                      }>("/api/backup/restore", { method: "POST" }, 300000);
                      setMessage(
                        data.restored
                          ? `Recupero completato: ${data.recipes} ricette. Ricarica il ricettario.`
                          : "Nessun backup disponibile.",
                      );
                    });
                }}
              >
                Recupera ultimo backup
              </button>
            </div>
          </details>
        </section>
        <section className="surface settings-card">
          <h3>Dati</h3>
          <button
            className="button soft"
            disabled={busy}
            onClick={() => void run(prepareOffline)}
          >
            Prepara consultazione offline
          </button>
          <p>
            La copia locale serve a consultare le ricette. I salvataggi delle
            ricette richiedono la connessione.
          </p>
          <h4>Cataloghi</h4>
          <div className="category-manager">
            {categories.map((row) => (
              <div className="category-manager-row" key={row.id}>
                <span>{row.name}</span>
                {row.id >= 0 && (
                  <button
                    className="button soft"
                    disabled={busy}
                    aria-label={"Rimuovi catalogo " + row.name}
                    onClick={() => void run(() => removeCategory(row))}
                  >
                    Rimuovi
                  </button>
                )}
              </div>
            ))}
          </div>
          <form
            className="inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              void run(addCategory);
            }}
          >
            <input
              aria-label="Nuovo catalogo"
              value={newCategory}
              maxLength={120}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder="Nuovo catalogo…"
            />
            <button
              className="button primary"
              disabled={busy || !newCategory.trim()}
            >
              Aggiungi
            </button>
          </form>
          <details>
            <summary>Copertine mancanti</summary>
            <button
              className="button soft"
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const data = await api<{
                    updated: { id: string; imageUrl: string }[];
                    remaining: number;
                  }>("/api/recipes/images/repair", { method: "POST" }, 180000);
                  onImagesRepaired(data.updated);
                  setMessage(
                    `${data.updated.length} copertine recuperate · ${data.remaining || 0} da controllare.`,
                  );
                })
              }
            >
              Recupera fino a 8 copertine
            </button>
          </details>
        </section>
        <section className="surface settings-card">
          <h3>Account</h3>
          <p>
            Il tuo ricettario è personale. La sessione è protetta sul server.
          </p>
          <button
            className="button soft"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await api("/api/auth/logout", { method: "POST" });
                onLogout();
              })
            }
          >
            Esci da questo dispositivo
          </button>
        </section>
        <section className="surface settings-card">
          <h3>Aggiornamenti</h3>
          <p>
            Il pacchetto ZIP crea un ramo di anteprima dopo il backup. Il
            rilascio della versione online richiede una verifica separata.
          </p>
          <label className="field">
            Pacchetto aggiornamento
            <input
              type="file"
              aria-label="Pacchetto aggiornamento"
              accept=".zip,application/zip"
              disabled={busy}
              onChange={(e) => setUpdateFile(e.target.files?.[0] || null)}
            />
          </label>
          <button
            className="button primary"
            disabled={busy || !updateFile}
            onClick={() => void run(installUpdate)}
          >
            Prepara anteprima
          </button>
          {result && (
            <div className="update-result">
              <p>Versione {result.version}</p>
              <p>
                Ramo: <code>{result.branch}</code>
              </p>
              <p>
                Commit: <code>{result.commit}</code>
              </p>
            </div>
          )}
        </section>
        <details className="surface settings-card advanced-settings">
          <summary>Avanzate / Diagnostica</summary>
          <p>Controlli tecnici senza chiamate OpenAI.</p>
          <button
            className="button soft"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                setSystem(
                  await api<Record<string, Check>>("/api/system/status"),
                );
                setMessage("Controllo completato.");
              })
            }
          >
            Controlla sistema
          </button>
          {system && (
            <div className="system-grid">
              {Object.entries(system).map(([name, item]) => (
                <div
                  className={"system-row " + (item.ok ? "ok" : "bad")}
                  key={name}
                >
                  <span className="system-dot" />
                  <div>
                    <strong>{name}</strong>
                    <small>{item.label}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="button-row">
            <a
              className="button soft"
              href="/api/health"
              target="_blank"
              rel="noreferrer"
            >
              Health
            </a>
            <a
              className="button soft"
              href="/api/admin/migrations"
              target="_blank"
              rel="noreferrer"
            >
              Migrazioni database
            </a>
          </div>
          <p>
            {recipes.length} ricette caricate su questa pagina. La versione del
            database viene verificata dal server.
          </p>
        </details>
      </div>
    </section>
  );
}
