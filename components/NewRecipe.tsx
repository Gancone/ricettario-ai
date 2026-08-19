"use client";

import { useMemo, useState } from "react";
import { EMPTY_DRAFT, type Category, type Recipe, type RecipeDraft } from "@/types/recipe";

function n(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function NewRecipe({ categories, onSaved }: { categories: Category[]; onSaved: (recipe: Recipe) => void }) {
  const [draft, setDraft] = useState<RecipeDraft>({ ...EMPTY_DRAFT, category: categories[0]?.name || "" });
  const [sourceText, setSourceText] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");

  const hasExtracted = useMemo(() => Boolean(draft.title || draft.ingredients || draft.steps), [draft]);

  const patch = (values: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...values }));

  async function extract() {
    if (!draft.sourceUrl.trim() && !sourceText.trim() && !video) {
      setStatus("Incolla un link oppure scegli un video.");
      return;
    }
    setBusy(true);
    setWarning("");
    setStatus("Sto leggendo il contenuto e preparando la ricetta…");
    try {
      const form = new FormData();
      form.append("sourceUrl", draft.sourceUrl.trim());
      form.append("sourceText", sourceText.trim());
      if (video) form.append("video", video);

      const response = await fetch("/api/extract", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Estrazione non riuscita");

      patch({
        title: data.title || "",
        imageUrl: data.imageUrl || "",
        ingredients: (data.ingredients || []).join("\n"),
        steps: (data.steps || []).join("\n"),
        notes: data.notes || "",
        prepTimeMinutes: data.prepTimeMinutes ? String(data.prepTimeMinutes) : "",
        cookTimeMinutes: data.cookTimeMinutes ? String(data.cookTimeMinutes) : "",
        totalTimeMinutes: data.totalTimeMinutes ? String(data.totalTimeMinutes) : "",
        servings: data.servings ? String(data.servings) : "",
        calories: data.nutrition?.calories ? String(data.nutrition.calories) : "",
        protein: data.nutrition?.protein ? String(data.nutrition.protein) : "",
        carbs: data.nutrition?.carbs ? String(data.nutrition.carbs) : "",
        fat: data.nutrition?.fat ? String(data.nutrition.fat) : "",
        sugars: data.nutrition?.sugars ? String(data.nutrition.sugars) : "",
        fiber: data.nutrition?.fiber ? String(data.nutrition.fiber) : "",
        salt: data.nutrition?.salt ? String(data.nutrition.salt) : "",
        nutritionEstimated: data.nutrition?.estimated !== false
      });
      setWarning(data.warning || "");
      setStatus("Ricetta pronta. Controllala e salvala.");
    } catch (error: any) {
      setStatus(error?.message || "Qualcosa non ha funzionato.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft.title.trim()) {
      setStatus("Manca il titolo della ricetta.");
      return;
    }
    if (!draft.category.trim()) {
      setStatus("Scegli un catalogo.");
      return;
    }

    const recipe: Recipe = {
      id: crypto.randomUUID(),
      title: draft.title.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      imageUrl: draft.imageUrl,
      category: draft.category,
      tags: draft.tags.split(",").map((x) => x.trim()).filter(Boolean),
      ingredients: draft.ingredients.split("\n").map((x) => x.trim()).filter(Boolean),
      steps: draft.steps.split("\n").map((x) => x.trim()).filter(Boolean),
      notes: draft.notes.trim(),
      prepTimeMinutes: n(draft.prepTimeMinutes),
      cookTimeMinutes: n(draft.cookTimeMinutes),
      totalTimeMinutes: n(draft.totalTimeMinutes),
      servings: n(draft.servings),
      nutrition: {
        calories: n(draft.calories),
        protein: n(draft.protein),
        carbs: n(draft.carbs),
        fat: n(draft.fat),
        sugars: n(draft.sugars),
        fiber: n(draft.fiber),
        salt: n(draft.salt),
        estimated: draft.nutritionEstimated
      },
      createdAt: new Date().toISOString()
    };

    setBusy(true);
    setStatus("Salvataggio…");
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recipe)
      });
      const saved = await response.json();
      if (!response.ok) throw new Error(saved.error || "Salvataggio non riuscito");
      onSaved(saved);
      setDraft({ ...EMPTY_DRAFT, category: categories[0]?.name || "" });
      setSourceText("");
      setVideo(null);
      setWarning("");
      setStatus("Salvata ✓");
    } catch (error: any) {
      setStatus(`Errore: ${error?.message || "salvataggio non riuscito"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="new-recipe-page page-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">Nuova ricetta</span>
          <h2>Da video a ricetta, in un passaggio.</h2>
          <p>Incolla il link. Se il social blocca il video, puoi usare il caricamento manuale come piano B.</p>
        </div>
      </div>

      <div className="new-layout">
        <div className="surface import-card">
          <div className="field">
            <label>Link del video</label>
            <input inputMode="url" placeholder="https://instagram.com/..." value={draft.sourceUrl} onChange={(e) => patch({ sourceUrl: e.target.value })} />
          </div>
          <div className="field">
            <label>Testo o didascalia <span className="muted">(facoltativo)</span></label>
            <textarea placeholder="Puoi incollare qui la didascalia del post…" value={sourceText} onChange={(e) => setSourceText(e.target.value)} />
          </div>
          <div className="upload-line">
            <label className="file-button">
              <span>Carica video</span>
              <input type="file" accept="video/*,audio/*" onChange={(e) => setVideo(e.target.files?.[0] || null)} />
            </label>
            <span className="muted file-name">{video?.name || "Solo se il link non funziona"}</span>
          </div>
          <button className="button primary big" type="button" onClick={extract} disabled={busy}>
            {busy ? "Elaborazione…" : "Estrai ricetta"}
          </button>
          {status ? <div className="status-line">{status}</div> : null}
          {warning ? <div className="warning-box">{warning}</div> : null}
        </div>

        <div className={hasExtracted ? "surface editor-card" : "surface editor-card empty-editor"}>
          {!hasExtracted ? (
            <div className="empty-state">
              <div className="empty-icon">✦</div>
              <h3>Qui comparirà la ricetta</h3>
              <p>Dopo l'estrazione potrai correggere ogni campo prima di salvarla.</p>
            </div>
          ) : (
            <>
              {draft.imageUrl ? <img className="draft-cover" src={draft.imageUrl} alt="Anteprima piatto" /> : null}
              <div className="field"><label>Titolo</label><input value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></div>
              <div className="form-grid two">
                <div className="field">
                  <label>Catalogo</label>
                  <select value={draft.category} onChange={(e) => patch({ category: e.target.value })}>
                    <option value="">Scegli catalogo</option>
                    {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="field"><label>Tag</label><input placeholder="veloce, vegetariano…" value={draft.tags} onChange={(e) => patch({ tags: e.target.value })} /></div>
              </div>
              <div className="field"><label>Ingredienti <span className="muted">uno per riga</span></label><textarea className="tall" value={draft.ingredients} onChange={(e) => patch({ ingredients: e.target.value })} /></div>
              <div className="field"><label>Procedimento <span className="muted">un passaggio per riga</span></label><textarea className="tall" value={draft.steps} onChange={(e) => patch({ steps: e.target.value })} /></div>

              <div className="mini-heading">Tempi e porzioni</div>
              <div className="form-grid four">
                <div className="field"><label>Prep.</label><input type="number" value={draft.prepTimeMinutes} onChange={(e) => patch({ prepTimeMinutes: e.target.value })} placeholder="min" /></div>
                <div className="field"><label>Cottura</label><input type="number" value={draft.cookTimeMinutes} onChange={(e) => patch({ cookTimeMinutes: e.target.value })} placeholder="min" /></div>
                <div className="field"><label>Totale</label><input type="number" value={draft.totalTimeMinutes} onChange={(e) => patch({ totalTimeMinutes: e.target.value })} placeholder="min" /></div>
                <div className="field"><label>Porzioni</label><input type="number" value={draft.servings} onChange={(e) => patch({ servings: e.target.value })} /></div>
              </div>

              <div className="mini-heading row-between"><span>Valori nutrizionali</span><span className="muted">per porzione</span></div>
              <div className="nutrition-edit-grid">
                {[
                  ["calories", "Calorie", "kcal"], ["protein", "Proteine", "g"], ["carbs", "Carboidrati", "g"], ["fat", "Grassi", "g"],
                  ["sugars", "Zuccheri", "g"], ["fiber", "Fibre", "g"], ["salt", "Sale", "g"]
                ].map(([key, label, unit]) => (
                  <div className="field compact" key={key}>
                    <label>{label}</label>
                    <div className="input-unit"><input type="number" step="0.1" value={(draft as any)[key]} onChange={(e) => patch({ [key]: e.target.value } as any)} /><span>{unit}</span></div>
                  </div>
                ))}
              </div>
              <label className="check-line"><input type="checkbox" checked={draft.nutritionEstimated} onChange={(e) => patch({ nutritionEstimated: e.target.checked })} /> <span>Valori nutrizionali stimati</span></label>
              <div className="field"><label>Note</label><textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} /></div>
              <button className="button primary big full" type="button" onClick={save} disabled={busy}>Salva nel ricettario</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
