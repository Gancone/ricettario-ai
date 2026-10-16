"use client";
import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { api, jsonBody } from "@/lib/api-client";
type Version = {
  id: string;
  revision: number;
  created_at: string;
  reason: string;
};
export function RecipeVersions({
  recipe,
  onUpdated,
}: {
  recipe: Recipe;
  onUpdated: (recipe: Recipe) => void;
}) {
  const [versions, setVersions] = useState<Version[]>([]),
    [open, setOpen] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [snapshot, setSnapshot] = useState<any>(null);
  async function load() {
    setOpen(true);
    setBusy(true);
    try {
      const data = await api<{ items: Version[] }>(
        `/api/recipes/${recipe.id}/versions`,
      );
      setVersions(data.items || []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Versioni non disponibili.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="versions-panel">
      <button
        className="button soft"
        onClick={() => void load()}
        disabled={busy}
      >
        Cronologia delle versioni
      </button>
      {open && (
        <div>
          <h3>Versioni della ricetta</h3>
          {versions.map((version) => (
            <div className="version-row" key={version.id}>
              <span>
                Revisione {version.revision} ·{" "}
                {new Date(version.created_at).toLocaleString("it-IT")}
              </span>
              <button
                className="button soft"
                disabled={busy}
                onClick={async () => {
                  try {
                    const value = await api<any>(
                      `/api/recipes/${recipe.id}/versions/${version.id}`,
                    );
                    setSnapshot({ ...value, versionId: version.id });
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Versione non disponibile.",
                    );
                  }
                }}
              >
                Visualizza versione
              </button>
            </div>
          ))}
          {!versions.length && !busy && <p>Nessuna versione precedente.</p>}
          {snapshot && (
            <div className="surface snapshot-preview">
              <h4>{snapshot.snapshot?.title}</h4>
              <ul>
                {snapshot.snapshot?.ingredients?.map(
                  (line: string, i: number) => (
                    <li key={i}>{line}</li>
                  ),
                )}
              </ul>
              <ol>
                {snapshot.snapshot?.steps?.map((line: string, i: number) => (
                  <li key={i}>{line}</li>
                ))}
              </ol>
              <p>{snapshot.snapshot?.notes}</p>
              <button
                className="button primary"
                disabled={busy}
                onClick={async () => {
                  if (
                    !confirm(
                      "Ripristinare questa versione? La ricetta attuale resta nella cronologia e viene creato un backup preventivo.",
                    )
                  )
                    return;
                  setBusy(true);
                  try {
                    const current = await api<Recipe>(
                      `/api/recipes/${recipe.id}/versions/${snapshot.versionId}`,
                      {
                        method: "POST",
                        ...jsonBody({ expectedRevision: recipe.revision ?? 1 }),
                      },
                      120000,
                    );
                    onUpdated(current);
                    setSnapshot(null);
                    await load();
                    setMessage("Versione ripristinata in una nuova revisione.");
                  } catch (error) {
                    setMessage(
                      error instanceof Error
                        ? error.message
                        : "Ripristino non completato.",
                    );
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Ripristina questa versione
              </button>
            </div>
          )}
          <button className="button soft" onClick={() => setOpen(false)}>
            Chiudi cronologia
          </button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
