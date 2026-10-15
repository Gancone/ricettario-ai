"use client";
import { useState } from "react";
import type { Recipe } from "@/types/recipe";
import { ingredientList, formatIngredient } from "@/lib/ingredients";
import {
  pantryCoverage,
  type KitchenState,
  type KitchenRow,
} from "@/lib/kitchen";
import { createRecipeId } from "@/lib/recipe-id";
export function RecipeKitchen({
  recipe,
  servings,
  state,
  busy,
  onSave,
  onShopping,
}: {
  recipe: Recipe;
  servings: number;
  state: KitchenState;
  busy: boolean;
  onSave: (
    entity: string,
    item: Partial<KitchenRow> & Record<string, unknown>,
  ) => Promise<KitchenRow>;
  onShopping: (lines: string[], title: string) => void;
}) {
  const [note, setNote] = useState(""),
    [rating, setRating] = useState(""),
    [message, setMessage] = useState(""),
    [editing, setEditing] = useState<string | null>(null);
  const usage = state.stats.find((item) => item.recipe_id === recipe.id);
  const coverage = pantryCoverage(
    ingredientList(recipe.ingredients).map((item) => ({
      ...item,
      quantity:
        item.quantity === null
          ? null
          : (item.quantity * servings) / (recipe.servings || 2),
      quantityMax:
        item.quantityMax === null
          ? null
          : (item.quantityMax * servings) / (recipe.servings || 2),
    })),
    state.pantry,
  );
  async function cooked() {
    setMessage("");
    try {
      const existing = state.history.find((item) => item.id === editing);
      await onSave("cooking_history", {
        ...(existing || {}),
        id: editing || createRecipeId(),
        recipe_id: recipe.id,
        cooked_at: existing?.cooked_at || new Date().toISOString(),
        servings,
        rating: rating === "" ? null : Number(rating),
        notes: note,
      });
      setNote("");
      setRating("");
      setEditing(null);
      setMessage("Preparazione salvata nello storico.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Preparazione non salvata.",
      );
    }
  }
  return (
    <>
      <section className="recipe-section pantry-coverage">
        <h3>La tua dispensa</h3>
        <p>
          Hai {coverage.have} di {coverage.total} ingredienti
          {coverage.uncertain ? " · alcune quantità sono da controllare" : ""}.
        </p>
        <button
          className="button soft"
          disabled={!coverage.missing.length}
          onClick={() =>
            onShopping(
              coverage.missing.map((item) => formatIngredient(item)),
              recipe.title + " · mancanti",
            )
          }
        >
          Aggiungi alla spesa solo ciò che manca
        </button>
      </section>
      <section className="recipe-section cooking-history">
        <h3>Storico</h3>
        <p>
          Cucinata {usage?.count || 0} volte
          {usage?.last_cooked_at
            ? " · Ultima volta: " +
              new Date(usage.last_cooked_at).toLocaleDateString("it-IT")
            : ""}
          {usage?.average_rating != null
            ? " · Voto medio: " + Number(usage.average_rating).toFixed(1) + "/5"
            : ""}
        </p>
        <div className="form-grid two">
          <label className="field">
            Voto
            <select
              aria-label="Voto della preparazione"
              value={rating}
              onChange={(e) => setRating(e.target.value)}
            >
              <option value="">Senza voto</option>
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="field">
            Nota per la prossima volta
            <input
              aria-label="Nota nello storico"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="La prossima volta meno sale…"
            />
          </label>
        </div>
        <div className="button-row">
          <button
            className="button primary"
            disabled={busy}
            onClick={() => void cooked()}
          >
            {editing ? "Salva preparazione" : "Cucinata oggi"}
          </button>
          {editing && (
            <button
              className="button soft"
              onClick={() => {
                setEditing(null);
                setNote("");
                setRating("");
              }}
            >
              Annulla modifica
            </button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
        <div className="history-notes">
          {state.history
            .filter((item) => item.recipe_id === recipe.id)
            .slice(0, 10)
            .map((entry) => (
              <div key={entry.id}>
                <p>
                  {new Date(entry.cooked_at).toLocaleDateString("it-IT")}
                  {entry.rating != null ? ` · ${entry.rating}/5` : ""}
                  {entry.notes ? " · " + entry.notes : ""}
                </p>
                <button
                  className="button soft"
                  onClick={() => {
                    setEditing(entry.id);
                    setNote(entry.notes || "");
                    setRating(entry.rating == null ? "" : String(entry.rating));
                  }}
                >
                  Modifica preparazione
                </button>
              </div>
            ))}
        </div>
      </section>
    </>
  );
}
