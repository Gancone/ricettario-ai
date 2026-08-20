"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { newEmptyDraft, type Category, type Recipe, type RecipeDraft } from "@/types/recipe";
import { fallbackCategories } from "@/lib/categories";
import { displayImageUrl } from "@/lib/image-client";
import { Icon } from "@/components/Icon";

function n(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function numberString(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(parsed) : "";
}

function buildRecipe(draft: RecipeDraft): Recipe {
  const prep = n(draft.prepTimeMinutes) || 0;
  const cook = n(draft.cookTimeMinutes) || 0;
  const statedTotal = n(draft.totalTimeMinutes) || 0;
  const total = Math.max(statedTotal, prep + cook) || undefined;
  const protein = n(draft.protein) || 0;
  const carbs = n(draft.carbs) || 0;
  const fat = n(draft.fat) || 0;
  const calories = n(draft.calories) || (protein || carbs || fat ? Math.round(protein * 4 + carbs * 4 + fat * 9) : undefined);

  return {
    id: draft.id,
    title: draft.title.trim(),
    sourceUrl: draft.sourceUrl.trim(),
    imageUrl: draft.imageUrl,
    category: draft.category.trim() || "Senza categoria",
    tags: draft.tags.split(",").map((x) => x.trim()).filter(Boolean),
    ingredients: draft.ingredients.split("\n").map((x) => x.trim()).filter(Boolean),
    steps: draft.steps.split("\n").map((x) => x.trim()).filter(Boolean),
    sourceNotes: draft.sourceNotes.trim(),
    notes: draft.notes.trim(),
    prepTimeMinutes: prep || undefined,
    cookTimeMinutes: cook || undefined,
    totalTimeMinutes: total,
    servings: Math.max(1, Math.round(n(draft.servings) || 2)),
    nutrition: {
      calories,
      protein: n(draft.protein),
      carbs: n(draft.carbs),
      fat: n(draft.fat),
      sugars: n(draft.sugars),
      fiber: n(draft.fiber),
      salt: n(draft.salt),
      estimated: draft.nutritionEstimated
    },
    favorite: false,
    archived: false,
    createdAt: new Date().toISOString()
  };
}

export function NewRecipe({
  categories,
  onSaved,
  onDuplicate,
  onCategoryAdded
}: {
  categories: Category[];
  onSaved: (recipe: Recipe) => void;
  onDuplicate: (recipe: Recipe) => void;
  onCategoryAdded: (category: Category) => void;
}) {
  const availableCategories = categories.length ? categories : fallbackCategories();
  const [draft, setDraft] = useState<RecipeDraft>(() => ({ ...newEmptyDraft(), category: availableCategories[0]?.name || "" }));
  const [sourceText, setSourceText] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [warning, setWarning] = useState("");
  const [duplicate, setDuplicate] = useState<Recipe | null>(null);
  const [newCategory, setNewCategory] = useState("");
  const [imageBusy, setImageBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!draft.category && availableCategories[0]?.name) setDraft((d) => ({ ...d, category: availableCategories[0].name }));
  }, [categories]);

  const hasExtracted = useMemo(() => Boolean(draft.title || draft.ingredients || draft.steps), [draft]);
  const patch = (values: Partial<RecipeDraft>) => setDraft((d) => ({ ...d, ...values }));

  async function extract() {
    if (!draft.sourceUrl.trim() && !sourceText.trim() && !video) {
      setStatus("Incolla un link oppure scegli un video.");
      return;
    }
    setBusy(true);
    setDuplicate(null);
    setWarning("");
    setStatus("Controllo se la ricetta esiste già…");
    try {
      const form = new FormData();
      form.append("recipeId", draft.id);
      form.append("sourceUrl", draft.sourceUrl.trim());
      form.append("sourceText", sourceText.trim());
      form.append("categoryNames", availableCategories.map((c) => c.name).join("|"));
      if (video) form.append("video", video);

      const response = await fetch("/api/extract", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Estrazione non riuscita");

      if (data.duplicate && data.existingRecipe) {
        setDuplicate(data.existingRecipe);
        setStatus("Questa fonte è già nel ricettario: non ho consumato una nuova estrazione OpenAI.");
        return;
      }

      const suggested = availableCategories.find((c) => c.name === data.suggestedCategory)?.name || draft.category || availableCategories[0]?.name || "";
      patch({
        id: data.recipeId || draft.id,
        title: data.title || "",
        imageUrl: data.imageUrl || "",
        category: suggested,
        ingredients: (data.ingredients || []).join("\n"),
        steps: (data.steps || []).join("\n"),
        sourceNotes: data.sourceNotes || "",
        notes: "",
        prepTimeMinutes: numberString(data.prepTimeMinutes),
        cookTimeMinutes: numberString(data.cookTimeMinutes),
        totalTimeMinutes: numberString(data.totalTimeMinutes),
        servings: numberString(data.servings || 2),
        calories: numberString(data.nutrition?.calories),
        protein: numberString(data.nutrition?.protein),
        carbs: numberString(data.nutrition?.carbs),
        fat: numberString(data.nutrition?.fat),
        sugars: numberString(data.nutrition?.sugars),
        fiber: numberString(data.nutrition?.fiber),
        salt: numberString(data.nutrition?.salt),
        nutritionEstimated: data.nutrition?.estimated !== false
      });
      setWarning(data.warning || "");
      setStatus("Ricetta completa. Ho stimato anche porzioni e valori nutrizionali quando non erano dichiarati.");
    } catch (error: any) {
      setStatus(error?.message || "Qualcosa non ha funzionato.");
    } finally {
      setBusy(false);
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    setBusy(true);
    try {
      const response = await fetch("/api/categories", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Catalogo non creato");
      onCategoryAdded(data);
      patch({ category: data.name });
      setNewCategory("");
    } catch (error: any) {
      setStatus(error?.message || "Non riesco a creare il catalogo.");
    } finally { setBusy(false); }
  }

  async function uploadCover(file: File | null) {
    if (!file) return;
    setImageBusy(true);
    try {
      const form = new FormData();
      form.append("recipeId", draft.id);
      form.append("image", file);
      const response = await fetch("/api/images/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Foto non caricata");
      patch({ imageUrl: data.imageUrl || "" });
      setStatus("Copertina aggiornata.");
    } catch (error: any) {
      setStatus(error?.message || "Foto non caricata.");
    } finally { setImageBusy(false); if (imageInput.current) imageInput.current.value = ""; }
  }

  async function save() {
    if (!draft.title.trim()) return setStatus("Manca il titolo della ricetta.");
    if (!draft.category.trim()) return setStatus("Scegli un catalogo.");
    const ingredientList = draft.ingredients.split("\n").map((x) => x.trim()).filter(Boolean);
    const stepList = draft.steps.split("\n").map((x) => x.trim()).filter(Boolean);
    if (!ingredientList.length) return setStatus("Aggiungi almeno un ingrediente.");
    if (!stepList.length) return setStatus("Aggiungi almeno un passaggio del procedimento.");

    const recipe = buildRecipe(draft);
    setBusy(true);
    setStatus("Salvataggio sicuro su Supabase + backup…");
    try {
      const response = await fetch("/api/recipes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(recipe)
      });
      const saved = await response.json();
      if (!response.ok) {
        if (response.status === 409 && saved.duplicateId) throw new Error(saved.error || "Ricetta già presente");
        throw new Error(saved.error || "Salvataggio non riuscito");
      }
      onSaved(saved);
      setDraft({ ...newEmptyDraft(), category: availableCategories[0]?.name || "" });
      setSourceText(""); setVideo(null); setWarning(""); setDuplicate(null);
      setStatus(saved.backupWarning ? `Salvata su Supabase. Attenzione backup: ${saved.backupWarning}` : "Salvata, sincronizzata e protetta ✓");
    } catch (error: any) {
      setStatus(`Errore: ${error?.message || "salvataggio non riuscito"}`);
    } finally { setBusy(false); }
  }

  return (
    <section className="new-recipe-page page-section">
      <div className="section-heading compact-heading">
        <span className="eyebrow">Nuova ricetta</span>
        <h2>Dal video al tuo ricettario.</h2>
        <p>Prima controllo i duplicati. OpenAI viene usata solo quando serve davvero.</p>
      </div>

      <div className="new-layout">
        <div className="surface import-card">
          <div className="step-badge"><span>1</span><div><strong>Importa la fonte</strong><small>Incolla il link del Reel, TikTok o video.</small></div></div>
          <div className="field">
            <label>Link del video</label>
            <div className="input-with-icon"><Icon name="external" size={17} /><input inputMode="url" placeholder="https://instagram.com/..." value={draft.sourceUrl} onChange={(e) => patch({ sourceUrl: e.target.value })} /></div>
          </div>
          <details className="optional-box">
            <summary>Se il link non funziona</summary>
            <div className="optional-content">
              <div className="field"><label>Testo o didascalia</label><textarea placeholder="Incolla la didascalia del post…" value={sourceText} onChange={(e) => setSourceText(e.target.value)} /></div>
              <label className="file-button"><Icon name="image" size={17} /><span>{video?.name || "Carica video/audio"}</span><input type="file" accept="video/*,audio/*" onChange={(e) => setVideo(e.target.files?.[0] || null)} /></label>
            </div>
          </details>
          <button className="button primary big full" type="button" onClick={extract} disabled={busy}><Icon name="sparkles" size={18} />{busy ? "Elaborazione…" : "Estrai ricetta"}</button>
          {status ? <div className="status-line">{status}</div> : null}
          {warning ? <div className="warning-box">{warning}</div> : null}
          {duplicate ? <div className="duplicate-box"><div><strong>Già salvata</strong><span>{duplicate.title}</span></div><button className="button soft" type="button" onClick={() => onDuplicate(duplicate)}>Apri ricetta</button></div> : null}
        </div>

        <div className={hasExtracted ? "surface editor-card" : "surface editor-card empty-editor"}>
          {!hasExtracted ? (
            <div className="empty-state"><div className="empty-icon"><Icon name="sparkles" size={30} /></div><h3>La ricetta comparirà qui</h3><p>Porzioni, tempi, nutrizione e catalogo vengono compilati automaticamente e restano modificabili.</p></div>
          ) : (
            <>
              <div className="step-badge"><span>2</span><div><strong>Controlla e salva</strong><small>Correggi solo quello che vuoi.</small></div></div>

              <div className="draft-cover-wrap">
                {draft.imageUrl ? <img className="draft-cover" src={displayImageUrl(draft.imageUrl)} alt="Anteprima piatto" /> : <div className="draft-cover-placeholder"><Icon name="image" size={28} /><span>Nessuna copertina disponibile</span></div>}
                <label className="cover-edit-button"><Icon name="image" size={15} />{imageBusy ? "Carico…" : "Scegli foto"}<input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadCover(e.target.files?.[0] || null)} disabled={imageBusy} /></label>
              </div>

              <div className="field hero-field"><label>Titolo</label><input value={draft.title} onChange={(e) => patch({ title: e.target.value })} /></div>

              <div className="form-grid two">
                <div className="field">
                  <label>Catalogo</label>
                  <select value={draft.category} onChange={(e) => patch({ category: e.target.value })}><option value="">Scegli catalogo</option>{availableCategories.map((c) => <option key={`${c.id}-${c.name}`} value={c.name}>{c.name}</option>)}</select>
                  <div className="quick-category-add"><input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="+ Nuovo catalogo" onKeyDown={(e) => e.key === "Enter" && addCategory()} /><button type="button" onClick={addCategory} disabled={busy}>Aggiungi</button></div>
                </div>
                <div className="field"><label>Tag</label><input placeholder="veloce, vegetariano…" value={draft.tags} onChange={(e) => patch({ tags: e.target.value })} /></div>
              </div>

              <details className="editor-accordion" open>
                <summary><span>Ingredienti</span><small>{draft.ingredients.split("\n").filter(Boolean).length}</small></summary>
                <div className="accordion-content"><div className="field"><textarea className="tall" value={draft.ingredients} onChange={(e) => patch({ ingredients: e.target.value })} placeholder="Un ingrediente per riga" /></div></div>
              </details>

              <details className="editor-accordion" open>
                <summary><span>Procedimento</span><small>{draft.steps.split("\n").filter(Boolean).length}</small></summary>
                <div className="accordion-content"><div className="field"><textarea className="tall" value={draft.steps} onChange={(e) => patch({ steps: e.target.value })} placeholder="Un passaggio per riga" /></div></div>
              </details>

              <details className="editor-accordion" open>
                <summary><span>Tempi, porzioni e nutrizione</span><small>{draft.servings || 2} porz.</small></summary>
                <div className="accordion-content">
                  <div className="form-grid four">
                    <div className="field"><label>Preparazione</label><div className="input-unit"><input type="number" min="0" value={draft.prepTimeMinutes} onChange={(e) => patch({ prepTimeMinutes: e.target.value })} /><span>min</span></div></div>
                    <div className="field"><label>Cottura</label><div className="input-unit"><input type="number" min="0" value={draft.cookTimeMinutes} onChange={(e) => patch({ cookTimeMinutes: e.target.value })} /><span>min</span></div></div>
                    <div className="field"><label>Totale</label><div className="input-unit"><input type="number" min="0" value={draft.totalTimeMinutes} onChange={(e) => patch({ totalTimeMinutes: e.target.value })} /><span>min</span></div></div>
                    <div className="field"><label>Porzioni</label><input type="number" min="1" value={draft.servings} onChange={(e) => patch({ servings: e.target.value })} /></div>
                  </div>

                  <div className="nutrition-edit-heading"><div><strong>Valori nutrizionali</strong><span>per porzione</span></div><label className="check-label"><input type="checkbox" checked={draft.nutritionEstimated} onChange={(e) => patch({ nutritionEstimated: e.target.checked })} /> Stima</label></div>
                  <div className="nutrition-edit-grid">
                    {[
                      ["Calorie", "calories", "kcal"], ["Proteine", "protein", "g"], ["Carboidrati", "carbs", "g"], ["Grassi", "fat", "g"],
                      ["Zuccheri", "sugars", "g"], ["Fibre", "fiber", "g"], ["Sale", "salt", "g"]
                    ].map(([label, key, unit]) => <div className="field" key={key}><label>{label}</label><div className="input-unit"><input type="number" min="0" step="0.1" value={(draft as any)[key]} onChange={(e) => patch({ [key]: e.target.value } as any)} /><span>{unit}</span></div></div>)}
                  </div>
                </div>
              </details>

              <details className="editor-accordion">
                <summary><span>Note</span><small>fonte + personali</small></summary>
                <div className="accordion-content notes-grid">
                  <div className="field"><label>Note dalla fonte</label><textarea value={draft.sourceNotes} onChange={(e) => patch({ sourceNotes: e.target.value })} placeholder="Informazioni utili estratte dal video…" /></div>
                  <div className="field"><label>Le mie note personali</label><textarea value={draft.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Es. la prossima volta meno sale…" /></div>
                </div>
              </details>

              <div className="save-safety"><Icon name="shield" size={16} /><span>Il salvataggio crea anche un backup. Gli aggiornamenti non cancellano le ricette.</span></div>
              <button className="button primary big full sticky-save" type="button" onClick={save} disabled={busy}><Icon name="database" size={18} />{busy ? "Salvo…" : "Salva nel ricettario"}</button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
