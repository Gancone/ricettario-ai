"use client";

import { useEffect, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { exportRecipePdf } from "@/lib/pdf";

export function RecipeDetail({
  recipe,
  categories,
  onClose,
  onUpdated,
  onDeleted,
  onAddShopping
}: {
  recipe: Recipe;
  categories: Category[];
  onClose: () => void;
  onUpdated: (recipe: Recipe) => void;
  onDeleted: (id: string) => void;
  onAddShopping: (ingredients: string[], title: string) => void;
}) {
  const [checkedIngredients, setCheckedIngredients] = useState<number[]>([]);
  const [checkedSteps, setCheckedSteps] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; };
  }, []);

  async function changeCategory(category: string) {
    const updated = { ...recipe, category };
    onUpdated(updated);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(updated)
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Modifica non riuscita");
      onUpdated(data);
    } catch (error: any) {
      alert(error?.message || "Non riesco a spostare la ricetta.");
      onUpdated(recipe);
    }
  }

  async function remove() {
    if (!confirm(`Eliminare “${recipe.title}”?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Eliminazione non riuscita");
      onDeleted(recipe.id);
      onClose();
    } catch (error: any) {
      alert(error?.message || "Non riesco a eliminare la ricetta.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = `${recipe.title}\n\nIngredienti:\n${recipe.ingredients.map((x) => `• ${x}`).join("\n")}\n\nProcedimento:\n${recipe.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
    if (navigator.share) {
      try { await navigator.share({ title: recipe.title, text }); return; } catch {}
    }
    await navigator.clipboard.writeText(text);
    alert("Ricetta copiata negli appunti.");
  }

  const n = recipe.nutrition;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <article className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.title}>
        <div className="recipe-hero">
          {recipe.imageUrl ? <img src={recipe.imageUrl} alt={recipe.title} /> : <div className="recipe-hero-placeholder">🍽️</div>}
          <div className="hero-shade" />
          <button className="round-button close-button" onClick={onClose} type="button" aria-label="Chiudi">×</button>
          <div className="hero-copy">
            <select className="category-select-on-image" value={recipe.category} onChange={(e) => changeCategory(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <h2>{recipe.title}</h2>
          </div>
        </div>

        <div className="recipe-modal-body">
          <div className="stats-strip">
            <div><strong>{recipe.totalTimeMinutes || "–"}</strong><span>minuti</span></div>
            <div><strong>{recipe.servings || "–"}</strong><span>porzioni</span></div>
            <div><strong>{n?.calories || "–"}</strong><span>kcal / porz.</span></div>
          </div>

          <div className="detail-actions top-actions">
            <button className="button soft" onClick={() => exportRecipePdf(recipe)} type="button">PDF con foto</button>
            <button className="button soft" onClick={share} type="button">Condividi</button>
            <button className="button soft" onClick={() => onAddShopping(recipe.ingredients, recipe.title)} type="button">+ Lista spesa</button>
          </div>

          <section className="recipe-section">
            <div className="recipe-section-title"><h3>Ingredienti</h3><span>tocca per spuntare</span></div>
            <div className="cook-list">
              {recipe.ingredients.map((item, i) => {
                const checked = checkedIngredients.includes(i);
                return (
                  <button type="button" key={`${item}-${i}`} className={checked ? "cook-row checked" : "cook-row"} onClick={() => setCheckedIngredients((current) => checked ? current.filter((x) => x !== i) : [...current, i])}>
                    <span className="cook-check">{checked ? "✓" : ""}</span><span>{item}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="recipe-section">
            <div className="recipe-section-title"><h3>Procedimento</h3><span>modalità cucina</span></div>
            <div className="steps-list">
              {recipe.steps.map((step, i) => {
                const checked = checkedSteps.includes(i);
                return (
                  <button type="button" key={i} className={checked ? "step-row checked" : "step-row"} onClick={() => setCheckedSteps((current) => checked ? current.filter((x) => x !== i) : [...current, i])}>
                    <span className="step-number">{checked ? "✓" : i + 1}</span><span>{step}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {n ? (
            <section className="recipe-section nutrition-section">
              <div className="recipe-section-title"><h3>Valori nutrizionali</h3><span>per porzione{n.estimated ? " · stimati" : ""}</span></div>
              <div className="nutrition-display-grid">
                {[
                  ["Calorie", n.calories, "kcal"], ["Proteine", n.protein, "g"], ["Carboidrati", n.carbs, "g"], ["Grassi", n.fat, "g"],
                  ["Zuccheri", n.sugars, "g"], ["Fibre", n.fiber, "g"], ["Sale", n.salt, "g"]
                ].map(([label, value, unit]) => (
                  <div className="nutrition-cell" key={String(label)}><span>{label}</span><strong>{value ?? "–"} <small>{unit}</small></strong></div>
                ))}
              </div>
            </section>
          ) : null}

          {recipe.notes ? <section className="recipe-section note-section"><h3>Note</h3><p>{recipe.notes}</p></section> : null}

          <div className="detail-footer">
            {recipe.sourceUrl ? <a className="button soft" href={recipe.sourceUrl} target="_blank" rel="noreferrer">Apri video originale</a> : null}
            <button className="button danger" type="button" onClick={remove} disabled={busy}>Elimina ricetta</button>
          </div>
        </div>
      </article>
    </div>
  );
}
