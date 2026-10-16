"use client";

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { createRecipeId } from "@/lib/recipe-id";

import type { SmartShoppingItem } from "@/lib/smart-shopping";
import { ingredientGroup } from "@/lib/ingredients";
export type ShoppingItem = SmartShoppingItem;

export function ShoppingList({
  items,
  setItems,
  syncStatus,
  onRetry,
  conflict,
  onResolve,
}: {
  items: ShoppingItem[];
  setItems: (items: ShoppingItem[]) => void;
  syncStatus: string;
  onRetry: () => void;
  conflict?: boolean;
  onResolve?: () => void;
}) {
  const [grouped, setGrouped] = useState(false);
  useEffect(() => {
    try {
      setGrouped(localStorage.getItem("ricettario-shopping-groups") === "1");
    } catch {}
  }, []);
  const rows = grouped
    ? [...items].sort((a, b) =>
        (a.group_name || ingredientGroup(a.text)).localeCompare(
          b.group_name || ingredientGroup(b.text),
          "it",
        ),
      )
    : items;
  const remaining = items.filter((x) => !x.done).length;
  const [manual, setManual] = useState("");
  const [undo, setUndo] = useState<ShoppingItem[] | null>(null);
  function removeItems(next: ShoppingItem[]) {
    setUndo(items);
    setItems(next);
  }

  function addManual() {
    const text = manual.trim();
    if (!text) return;
    setItems([
      ...items,
      { id: createRecipeId(), text, source: "Aggiunto a mano", done: false },
    ]);
    setManual("");
  }

  return (
    <section className="page-section narrow-page">
      <div className="section-heading row-between align-end">
        <div>
          <span className="eyebrow">Lista della spesa</span>
          <h2>
            {remaining
              ? `${remaining} da comprare`
              : items.length
                ? "Tutto nel carrello"
                : "La tua prossima spesa"}
          </h2>
          <p>
            Spunta gli ingredienti mentre fai la spesa. Le modifiche vengono
            conservate anche se perdi la connessione.
          </p>
        </div>
        {items.length ? (
          <button
            type="button"
            className="button soft"
            onClick={() => removeItems([])}
          >
            Svuota
          </button>
        ) : null}
      </div>
      <div className="shopping-sync-line" role="status">
        <Icon name="cloud" size={14} />
        <span>{syncStatus}</span>
        {syncStatus !== "Sincronizzata" ? (
          <button className="button soft" onClick={onRetry}>
            Riprova
          </button>
        ) : null}
      </div>
      {conflict && (
        <div className="warning-banner" role="alert">
          <span>
            La lista è cambiata su un altro dispositivo. La tua copia resta
            conservata.
          </span>
          <button className="button soft" onClick={onResolve}>
            Conserva copia e ricarica
          </button>
        </div>
      )}
      <label className="check-label">
        <input
          type="checkbox"
          checked={grouped}
          onChange={(e) => {
            setGrouped(e.target.checked);
            try {
              localStorage.setItem(
                "ricettario-shopping-groups",
                e.target.checked ? "1" : "0",
              );
            } catch {}
          }}
        />
        Raggruppa per reparto
      </label>
      {undo ? (
        <div className="app-notice" role="status">
          <span>Elementi rimossi</span>
          <button
            onClick={() => {
              setItems([
                ...items,
                ...undo.filter(
                  (old) => !items.some((item) => item.id === old.id),
                ),
              ]);
              setUndo(null);
            }}
          >
            Annulla
          </button>
        </div>
      ) : null}
      {items.some((item) => item.done) ? (
        <button
          className="button soft"
          onClick={() => removeItems(items.filter((item) => !item.done))}
        >
          Rimuovi acquistati
        </button>
      ) : null}
      <div className="surface shopping-surface">
        <div className="shopping-manual">
          <input
            aria-label="Aggiungi alla spesa"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
            placeholder="Aggiungi qualcosa…"
          />
          <button type="button" className="button primary" onClick={addManual}>
            <Icon name="plus" size={15} />
            Aggiungi
          </button>
        </div>
        {!items.length ? (
          <div className="empty-state">
            <div className="empty-icon">
              <Icon name="bag" size={30} />
            </div>
            <h3>Niente da comprare</h3>
            <p>Apri una ricetta e aggiungi i suoi ingredienti alla lista.</p>
          </div>
        ) : (
          <>
            <div className="shopping-progress">
              <div>
                <span
                  style={{
                    width: `${items.length ? ((items.length - remaining) / items.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>
                {items.length - remaining} completati su {items.length}
              </small>
            </div>
            <div className="shopping-list">
              {rows.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.done}
                  className={item.done ? "shopping-row done" : "shopping-row"}
                  onClick={() =>
                    setItems(
                      items.map((x) =>
                        x.id === item.id ? { ...x, done: !x.done } : x,
                      ),
                    )
                  }
                >
                  <span className="shopping-check">
                    {item.done ? <Icon name="check" size={14} /> : null}
                  </span>
                  <span className="shopping-copy">
                    <strong>{item.text}</strong>
                    <small>
                      {grouped
                        ? (item.group_name || ingredientGroup(item.text)) +
                          " · "
                        : ""}
                      {item.source}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
