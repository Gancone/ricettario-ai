"use client";
import { useEffect, useRef, useState } from "react";
import { createRecipeId } from "@/lib/recipe-id";
import { normalizeSourceUrl } from "@/lib/source-url";
import { api } from "@/lib/api-client";
import { readOffline, writeOffline } from "@/lib/offline-db";
import type { Recipe } from "@/types/recipe";
type Job = {
  id: string;
  url: string;
  status: "waiting" | "processing" | "ready" | "error" | "duplicate";
  data?: any;
  message?: string;
};
const labels = {
  waiting: "In attesa",
  processing: "Elaborazione",
  ready: "Pronta",
  error: "Errore",
  duplicate: "Già nel ricettario",
};
export function ImportQueue({
  onReady,
  known,
  categories,
}: {
  onReady: (data: any, url: string) => void;
  known: Recipe[];
  categories: string[];
}) {
  const [jobs, setJobs] = useState<Job[]>([]),
    [text, setText] = useState(""),
    [running, setRunning] = useState(false),
    [message, setMessage] = useState("");
  const current = useRef<Job[]>([]),
    stop = useRef(false),
    active = useRef(false),
    live = useRef(true);
  const store = (next: Job[]) => {
    current.current = next;
    if (live.current) setJobs(next);
    void writeOffline("import-queue", next).catch(() => {
      if (live.current)
        setMessage(
          "La coda resta solo in questa scheda: archivio offline non disponibile.",
        );
    });
  };
  useEffect(() => {
    live.current = true;
    readOffline<Job[]>("import-queue")
      .then((saved) => {
        if (live.current && Array.isArray(saved)) {
          const rows = saved
            .filter(
              (row) =>
                typeof row.url === "string" && typeof row.id === "string",
            )
            .slice(0, 20)
            .map((row) =>
              row.status === "processing"
                ? { ...row, status: "waiting" as const }
                : row,
            );
          current.current = rows;
          setJobs(rows);
        }
      })
      .catch(() => {});
    return () => {
      live.current = false;
      stop.current = true;
    };
  }, []);
  const patch = (id: string, values: Partial<Job>) =>
    store(
      current.current.map((job) =>
        job.id === id ? { ...job, ...values } : job,
      ),
    );
  function add() {
    setMessage("");
    const urls = text.split(/\s+/).filter(Boolean);
    const next = [...current.current];
    for (const url of urls) {
      let valid = false;
      try {
        valid = ["http:", "https:"].includes(new URL(url).protocol);
      } catch {}
      if (!valid) {
        setMessage("Usa link HTTP/HTTPS, uno per riga.");
        continue;
      }
      if (next.length >= 20) {
        setMessage("La coda può contenere fino a 20 fonti.");
        break;
      }
      if (
        !next.some(
          (row) => normalizeSourceUrl(row.url) === normalizeSourceUrl(url),
        )
      )
        next.push({ id: createRecipeId(), url, status: "waiting" });
    }
    store(next);
    setText("");
  }
  async function start() {
    if (active.current) return;
    active.current = true;
    stop.current = false;
    setRunning(true);
    try {
      for (const job of current.current.filter(
        (row) => row.status === "waiting",
      )) {
        if (stop.current || !live.current) break;
        const duplicate = known.find(
          (recipe) =>
            normalizeSourceUrl(recipe.sourceUrl || "") ===
            normalizeSourceUrl(job.url),
        );
        if (duplicate) {
          patch(job.id, {
            status: "duplicate",
            data: { duplicate: true, existingRecipe: duplicate },
          });
          continue;
        }
        patch(job.id, { status: "processing", message: "" });
        try {
          const form = new FormData();
          form.append("sourceUrl", job.url);
          form.append("recipeId", createRecipeId());
          form.append("categoryNames", categories.join("|"));
          const data = await api<any>(
            "/api/extract",
            { method: "POST", body: form },
            310000,
          );
          patch(job.id, {
            status: data.duplicate ? "duplicate" : "ready",
            data,
          });
        } catch (error) {
          patch(job.id, {
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Importazione non riuscita.",
          });
        }
      }
    } finally {
      active.current = false;
      if (live.current) setRunning(false);
    }
  }
  return (
    <details className="surface import-queue">
      <summary>Importa più link · {jobs.length} in coda</summary>
      <div className="field">
        <label htmlFor="import-urls">Link da importare, uno per riga</label>
        <textarea
          id="import-urls"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="https://…"
        />
      </div>
      <div className="button-row">
        <button
          className="button soft"
          type="button"
          onClick={add}
          disabled={running}
        >
          Aggiungi alla coda
        </button>
        <button
          className="button primary"
          type="button"
          disabled={running || !jobs.some((row) => row.status === "waiting")}
          onClick={() => void start()}
        >
          Avvia importazione sequenziale
        </button>
        {running && (
          <button
            type="button"
            className="button soft"
            onClick={() => {
              stop.current = true;
              setMessage(
                "La fonte in elaborazione termina; le successive restano in attesa.",
              );
            }}
          >
            Sospendi dopo questa fonte
          </button>
        )}
      </div>
      <p className="sync-caption">
        Una fonte alla volta. Ogni ricetta va controllata nell’editor prima del
        salvataggio.
      </p>
      {message && <p role="status">{message}</p>}
      <ol>
        {jobs.map((job) => (
          <li className="queue-row" key={job.id}>
            <div>
              <strong>{labels[job.status]}</strong>
              <span>{job.url}</span>
              {job.message && <p role="status">{job.message}</p>}
            </div>
            <div className="button-row">
              {job.status === "ready" && (
                <button
                  className="button primary"
                  onClick={() => onReady(job.data, job.url)}
                  type="button"
                >
                  Controlla nell’editor
                </button>
              )}
              {job.status === "error" && (
                <button
                  className="button soft"
                  type="button"
                  onClick={() =>
                    patch(job.id, { status: "waiting", message: "" })
                  }
                >
                  Riprova
                </button>
              )}
              {job.status !== "processing" && (
                <button
                  className="button soft"
                  aria-label={"Rimuovi dalla coda " + job.url}
                  type="button"
                  onClick={() =>
                    store(current.current.filter((row) => row.id !== job.id))
                  }
                >
                  Rimuovi
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </details>
  );
}
