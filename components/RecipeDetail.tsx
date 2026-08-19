"use client";

import { useEffect, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { exportRecipePdf } from "@/lib/pdf";
import { displayImageUrl } from "@/lib/image-client";
import { Icon } from "@/components/Icon";

export function RecipeDetail({
  recipe,
  categories,
  onClose,
  onUpdated,
  onAddShopping
}: {
  recipe: Recipe;
  categories: Category[];
  onClose: () => void;
  onUpdated: (recipe: Recipe) => void;
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
    setBusy(true);
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
      onUpdated(recipe);
      alert(error?.message || "Non riesco a spostare la ricetta.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    const text = `${recipe.title}\n\nIngredienti:\n${recipe.ingredients.map((x) => `• ${x}`).join("\n")}\n\nProcedimento:\n${recipe.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
    if (navigator.share) {
      try { await navigator.share({ title: recipe.title, text, url: recipe.sourceUrl || undefined }); return; } catch {}
    }
    await navigator.clipboard.writeText(text);
    alert("Ricetta copiata negli appunti.");
  }

  const n = recipe.nutrition;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <article className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.title}>
        <div className="recipe-hero">
          {recipe.imageUrl ? <img src={displayImageUrl(recipe.imageUrl)} alt={recipe.title} /> : <div className="recipe-hero-placeholder"><span>{recipe.title.slice(0, 1).toUpperCase()}</span></div>}
          <div className="hero-shade" />
          <button className="round-button close-button" onClick={onClose} type="button" aria-label="Chiudi"><Icon name="close" size={20} /></button>
          <div className="hero-copy">
            <select className="category-select-on-image" disabled={busy} value={recipe.category} onChange={(e) => changeCategory(e.target.value)}>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <h2>{recipe.title}</h2>
          </div>
        </div>

        <div className="recipe-modal-body">
          <div className="stats-strip">
            <div><Icon name="clock" size={18} /><span><strong>{recipe.totalTimeMinutes || "–"}</strong><small>minuti</small></span></div>
            <div><Icon name="users" size={18} /><span><strong>{recipe.servings || "–"}</strong><small>porzioni</small></span></div>
            <div><Icon name="flame" size={18} /><span><strong>{n?.calories || "–"}</strong><small>kcal / porz.</small></span></div>
          </div>

          <div className="detail-actions top-actions">
            <button className="button soft" onClick={() => exportRecipePdf(recipe)} type="button"><Icon name="download" size={17} /> PDF</button>
            <button className="button soft" onClick={share} type="button"><Icon name="share" size={17} /> Condividi</button>
            <button className="button soft" onClick={() => onAddShopping(recipe.ingredients, recipe.title)} type="button"><Icon name="bag" size={17} /> Lista spesa</button>
          </div>

          <section className="recipe-section">
            <div className="recipe-section-title"><div><span className="section-kicker">Preparazione</span><h3>Ingredienti</h3></div><span>tocca per spuntare</span></div>
            <div className="cook-list">
              {recipe.ingredients.map((item, i) => {
                const checked = checkedIngredients.includes(i);
                return (
                  <button type="button" key={i} className={checked ? "cook-row checked" : "cook-row"} onClick={() => setCheckedIngredients((current) => checked ? current.filter((x) => x !== i) : [...current, i])}>
                    <span className="cook-check">{checked ? <Icon name="check" size={13} /> : null}</span><span>{item}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="recipe-section">
            <div className="recipe-section-title"><div><span className="section-kicker">Modalità cucina</span><h3>Procedimento</h3></div><span>{checkedSteps.length}/{recipe.steps.length}</span></div>
            <div className="steps-list">
              {recipe.steps.map((step, i) => {
                const checked = checkedSteps.includes(i);
                return (
                  <button type="button" key={i} className={checked ? "step-row checked" : "step-row"} onClick={() => setCheckedSteps((current) => checked ? current.filter((x) => x !== i) : [...current, i])}>
                    <span className="step-number">{checked ? <Icon name="check" size={14} /> : i + 1}</span><span>{step}</span>
                  </button>
                );
              })}
            </div>
          </section>

          {n ? (
            <section className="recipe-section nutrition-section">
              <div className="recipe-section-title"><div><span className="section-kicker">Per porzione</span><h3>Valori nutrizionali</h3></div><span>{n.estimated ? "stima" : "dati ricetta"}</span></div>
              <div className="nutrition-display-grid">
                {[
                  ["Calorie", n.calories, "kcal"], ["Proteine", n.protein, "g"], ["Carboidrati", n.carbs, "g"], ["Grassi", n.fat, "g"],
                  ["Zuccheri", n.sugars, "g"], ["Fibre", n.fiber, "g"], ["Sale", n.salt, "g"]
                ].map(([label, value, unit]) => (
                  <div className="nutrition-cell" key={String(label)}><span>{label}</span><strong>{value ?? "–"}</strong><small>{unit}</small></div>
                ))}
              </div>
            </section>
          ) : null}

          {recipe.notes ? <section className="recipe-section note-section"><span className="section-kicker">Promemoria</span><h3>Note</h3><p>{recipe.notes}</p></section> : null}

          <div className="data-protection-note"><Icon name="shield" size={17} /><span>Questa ricetta è protetta: gli aggiornamenti dell'app non la cancellano e la cancellazione permanente è disattivata.</span></div>

          {recipe.sourceUrl ? <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Apri il video originale</a> : null}
        </div>
      </article>
    </div>
  );
}
