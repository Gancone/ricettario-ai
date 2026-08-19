"use client";

import { useMemo, useState } from "react";
import { EMPTY_DRAFT, type Category, type Recipe, type RecipeDraft } from "@/types/recipe";
import { displayImageUrl } from "@/lib/image-client";
import { Icon } from "@/components/Icon";

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
    setStatus("Sto leggendo il contenuto…");
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
      setStatus("Ricetta pronta. Controlla i dati e salvala.");
    } catch (error: any) {
      setStatus(error?.message || "Qualcosa non ha funzionato.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!draft.title.trim()) return setStatus("Manca il titolo della ricetta.");
    if (!draft.category.trim()) return setStatus("Scegli un catalogo.");

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
        calories: n(draft.calories), protein: n(draft.protein), carbs: n(draft.carbs), fat: n(draft.fat),
        sugars: n(draft.sugars), fiber: n(draft.fiber), salt: n(draft.salt), estimated: draft.nutritionEstimated
      },
      createdAt: new Date().toISOString()
    };

    setBusy(true);
    setStatus("Salvataggio sicuro su Supabase…");
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
      setStatus("Salvata e protetta ✓");
    } catch (error: any) {
      setStatus(`Errore: ${error?.message || "salvataggio non riuscito"}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="new-recipe-page page-section">
      <div className="section-heading">
        <span className="eyebrow">Nuova ricetta</span>
        <h2>Incolla. Controlla. Salva.</h2>
        <p>OpenAI viene usata solo durante l’estrazione. Dopo il salvataggio la ricetta resta nel tuo archivio protetto.</p>
      </div>

      <div className="new-layout">
        <div className="surface import-card">
          <div className="step-badge"><span>1</span><div><strong>Importa la fonte</strong><small>Il link è il metodo principale.</small></div></div>
          <div className="field">
            <label>Link del video</label>
            <div className="input-with-icon"><Icon name="external" size={17} /><input inputMode="url" placeholder="https://instagram.com/..." value={draft.sourceUrl} onChange={(e) => patch({ sourceUrl: e.target.value })} /></div>
          </div>
          <details className="optional-box">
            <summary>Alternative se il link non funziona</summary>
            <div className="optional-content">
              <div className="field"><label>Testo o didascalia</label><textarea placeholder="Incolla la didascalia del post…" value={sourceText} onChange={(e) => setSourceText(e.target.value)} /></div>
              <label className="file-button"><Icon name="image" size={17} /><span>{video?.name || "Carica video/audio"}</span><input type="file" accept="video/*,audio/*" onChange={(e) => setVideo(e.target.files?.[0] || null)} /></label>
            </div>
          </details>
          <button className="button primary big full" type="button" onClick={extract} disabled={busy}><Icon name="sparkles" size={18} />{busy ? "Elaborazione…" : "Estrai ricetta"}</button>
          {status ? <div className="status-line">{status}</div> : null}
          {warning ? <div className="warning-box">{warning}</div> : null}
        </div>

        <div className={hasExtracted ? "surface editor-card" : "surface editor-card empty-editor"}>
          {!hasExtracted ? (
            <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={30} /></div><h3>La ricetta comparirà qui</h3><p>Potrai correggere ogni dato prima del salvataggio definitivo.</p></div>
          ) : (
            <>
              <div className="step-badge"><span>2</span><div><strong>Controlla e salva</strong><small>Tutto resta modificabile.</small></div></div>
              {draft.imageUrl ? <img className="draft-cover" src={displayImageUrl(draft.imageUrl)} alt="Anteprima piatto" /> : <div className="draft-cover-placeholder"><Icon name="image" size={28} /><span>La foto verrà recuperata quando disponibile</span></div>}

              <div className="field hero-field"><label>Titolo</label><input value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></div>
              <div className="form-grid two">
                <div className="field"><label>Catalogo</label><select value={draft.category} onChange={(e) => patch({ category: e.target.value })}><option value="">Scegli catalogo</option>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div>
                <div className="field"><label>Tag</label><input placeholder="veloce, vegetariano…" value={draft.tags} onChange={(e) => patch({ tags: e.target.value })} /></div>
              </div>

              <div className="editor-section"><div className="mini-heading">Ingredienti</div><div className="field"><textarea className="tall" value={draft.ingredients} onChange={(e) => patch({ ingredients: e.target.value })} placeholder="Un ingrediente per riga" /></div></div>
              <div className="editor-section"><div className="mini-heading">Procedimento</div><div className="field"><textarea className="tall" value={draft.steps} onChange={(e) => patch({ steps: e.target.value })} placeholder="Un passaggio per riga" /></div></div>

              <div className="editor-section">
                <div className="mini-heading">Tempi e porzioni</div>
                <div className="form-grid four">
                  <div className="field"><label>Preparazione</label><div className="input-unit"><input type="number" value={draft.prepTimeMinutes} onChange={(e) => patch({ prepTimeMinutes: e.target.value })} /><span>min</span></div></div>
                  <div className="field"><label>Cottura</label><div className="input-unit"><input type="number" value={draft.cookTimeMinutes} onChange={(e) => patch({ cookTimeMinutes: e.target.value })} /><span>min</span></div></div>
                  <div className="field"><label>Totale</label><div className="input-unit"><input type="number" value={draft.totalTimeMinutes} onChange={(e) => patch({ totalTimeMinutes: e.target.value })} /><span>min</span></div></div>
                  <div className="field"><label>Porzioni</label><input type="number" value={draft.servings} onChange={(e) => patch({ servings: e.target.value })} /></div>
                </div>
              </div>

              <div className="editor-section">
                <div className="mini-heading row-between"><span>Valori nutrizionali</span><span className="muted">per porzione</span></div>
                <div className="nutrition-edit-grid">
                  {[["calories", "Calorie", "kcal"], ["protein", "Proteine", "g"], ["carbs", "Carboidrati", "g"], ["fat", "Grassi", "g"], ["sugars", "Zuccheri", "g"], ["fiber", "Fibre", "g"], ["salt", "Sale", "g"]].map(([key, label, unit]) => (
                    <div className="field compact" key={key}><label>{label}</label><div className="input-unit"><input type="number" step="0.1" value={(draft as any)[key]} onChange={(e) => patch({ [key]: e.target.value } as any)} /><span>{unit}</span></div></div>
                  ))}
                </div>
                <label className="check-line"><input type="checkbox" checked={draft.nutritionEstimated} onChange={(e) => patch({ nutritionEstimated: e.target.checked })} /><span>Valori nutrizionali stimati</span></label>
              </div>

              <div className="field"><label>Note personali</label><textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} /></div>
              <div className="save-protection"><Icon name="shield" size={17} /><span>Al salvataggio viene creato anche un backup automatico.</span></div>
              <button className="button primary big full sticky-save" type="button" onClick={save} disabled={busy}><Icon name="database" size={18} />{busy ? "Salvataggio…" : "Salva nel ricettario"}</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
