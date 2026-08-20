"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { exportRecipePdf } from "@/lib/pdf";
import { displayImageUrl } from "@/lib/image-client";
import { Icon } from "@/components/Icon";

function parseLeadingNumber(value: string) {
  const normalized = value.replace(",", ".");
  const fraction = normalized.match(/^(\d+)\s*\/\s*(\d+)/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  const decimal = normalized.match(/^\d+(?:\.\d+)?/);
  return decimal ? Number(decimal[0]) : null;
}

function prettyNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
}

function scaleIngredient(text: string, factor: number) {
  const amount = parseLeadingNumber(text.trim());
  if (amount === null || factor === 1) return text;
  const match = text.trim().match(/^(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)/);
  if (!match) return text;
  return text.replace(match[0], prettyNumber(amount * factor));
}

function extractTimerMinutes(step: string) {
  const match = step.match(/(\d{1,3})\s*(?:min|minuti|minuto)\b/i);
  return match ? Number(match[1]) : 0;
}

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
  const [editMode, setEditMode] = useState(false);
  const [draft, setDraft] = useState(recipe);
  const [targetServings, setTargetServings] = useState(recipe.servings || 2);
  const [wakeOn, setWakeOn] = useState(false);
  const wakeRef = useRef<any>(null);
  const [timer, setTimer] = useState<{ label: string; seconds: number } | null>(null);

  useEffect(() => {
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = old; wakeRef.current?.release?.().catch?.(() => {}); };
  }, []);

  useEffect(() => setDraft(recipe), [recipe]);

  useEffect(() => {
    if (!timer || timer.seconds <= 0) return;
    const handle = window.setInterval(() => {
      setTimer((current) => {
        if (!current) return null;
        if (current.seconds <= 1) {
          window.clearInterval(handle);
          if ("vibrate" in navigator) navigator.vibrate?.([250, 120, 250]);
          alert(`Timer terminato: ${current.label}`);
          return null;
        }
        return { ...current, seconds: current.seconds - 1 };
      });
    }, 1000);
    return () => window.clearInterval(handle);
  }, [timer?.label]);

  const factor = (recipe.servings || 2) > 0 ? targetServings / (recipe.servings || 2) : 1;
  const scaledIngredients = useMemo(() => recipe.ingredients.map((x) => scaleIngredient(x, factor)), [recipe.ingredients, factor]);

  async function saveUpdated(updated: Recipe, rollback = recipe) {
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
      setDraft(data);
      return data as Recipe;
    } catch (error: any) {
      onUpdated(rollback);
      alert(error?.message || "Non riesco a salvare la modifica.");
      throw error;
    } finally { setBusy(false); }
  }

  async function toggleFavorite() {
    await saveUpdated({ ...recipe, favorite: !recipe.favorite }).catch(() => {});
  }

  async function toggleArchive() {
    const next = { ...recipe, archived: !recipe.archived };
    await saveUpdated(next).then(() => { if (!recipe.archived) onClose(); }).catch(() => {});
  }

  async function saveEdit() {
    const cleaned: Recipe = {
      ...draft,
      title: draft.title.trim(),
      ingredients: draft.ingredients.map((x) => x.trim()).filter(Boolean),
      steps: draft.steps.map((x) => x.trim()).filter(Boolean),
      servings: Math.max(1, Math.round(draft.servings || 2)),
      totalTimeMinutes: Math.max(draft.totalTimeMinutes || 0, (draft.prepTimeMinutes || 0) + (draft.cookTimeMinutes || 0)) || undefined
    };
    if (!cleaned.title || !cleaned.ingredients.length || !cleaned.steps.length) return alert("Titolo, ingredienti e procedimento non possono essere vuoti.");
    await saveUpdated(cleaned).then(() => setEditMode(false)).catch(() => {});
  }

  async function uploadImage(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.append("image", file);
      const response = await fetch(`/api/recipes/${recipe.id}/image`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Foto non caricata");
      await saveUpdated({ ...recipe, imageUrl: data.imageUrl });
    } catch (error: any) { alert(error?.message || "Foto non caricata."); }
    finally { setBusy(false); }
  }

  async function share() {
    const text = `${recipe.title}\n\nIngredienti:\n${scaledIngredients.map((x) => `• ${x}`).join("\n")}\n\nProcedimento:\n${recipe.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
    if (navigator.share) {
      try { await navigator.share({ title: recipe.title, text, url: recipe.sourceUrl || undefined }); return; } catch {}
    }
    await navigator.clipboard.writeText(text);
    alert("Ricetta copiata negli appunti.");
  }

  async function toggleWakeLock() {
    try {
      if (wakeOn) {
        await wakeRef.current?.release?.();
        wakeRef.current = null; setWakeOn(false); return;
      }
      const nav: any = navigator;
      if (!nav.wakeLock?.request) return alert("Il browser non supporta lo schermo sempre acceso.");
      wakeRef.current = await nav.wakeLock.request("screen");
      setWakeOn(true);
      wakeRef.current.addEventListener?.("release", () => setWakeOn(false));
    } catch { alert("Non riesco a mantenere lo schermo acceso su questo dispositivo."); }
  }

  function setNutrition(key: string, value: string) {
    const num = value === "" ? undefined : Number(value);
    setDraft((d) => ({ ...d, nutrition: { ...(d.nutrition || {}), [key]: Number.isFinite(num as number) ? num : undefined } }));
  }

  const n = recipe.nutrition;
  const timerText = timer ? `${Math.floor(timer.seconds / 60)}:${String(timer.seconds % 60).padStart(2, "0")}` : "";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <article className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.title}>
        <div className="recipe-hero">
          {recipe.imageUrl ? <img src={displayImageUrl(recipe.imageUrl)} alt={recipe.title} /> : <div className="recipe-hero-placeholder"><span>{recipe.title.slice(0, 1).toUpperCase()}</span></div>}
          <div className="hero-shade" />
          <button className="round-button close-button" onClick={onClose} type="button" aria-label="Chiudi"><Icon name="close" size={20} /></button>
          <button className={recipe.favorite ? "round-button favorite-detail active" : "round-button favorite-detail"} onClick={toggleFavorite} type="button" aria-label="Preferito"><Icon name="heart" size={19} /></button>
          <div className="hero-copy">
            <span className="category-on-image">{recipe.archived ? "Archiviata" : recipe.category}</span>
            <h2>{recipe.title}</h2>
          </div>
        </div>

        <div className="recipe-modal-body">
          {editMode ? (
            <div className="detail-editor">
              <div className="detail-editor-head"><div><span className="section-kicker">Modifica completa</span><h3>Correggi la ricetta</h3></div><button className="button soft" onClick={() => { setDraft(recipe); setEditMode(false); }} type="button">Annulla</button></div>
              <div className="field"><label>Titolo</label><input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="form-grid two"><div className="field"><label>Catalogo</label><select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div><div className="field"><label>Tag</label><input value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></div></div>
              <div className="field"><label>Ingredienti · uno per riga</label><textarea className="tall" value={draft.ingredients.join("\n")} onChange={(e) => setDraft({ ...draft, ingredients: e.target.value.split("\n") })} /></div>
              <div className="field"><label>Procedimento · un passaggio per riga</label><textarea className="tall" value={draft.steps.join("\n")} onChange={(e) => setDraft({ ...draft, steps: e.target.value.split("\n") })} /></div>
              <div className="form-grid four">
                <div className="field"><label>Prep.</label><input type="number" min="0" value={draft.prepTimeMinutes ?? ""} onChange={(e) => setDraft({ ...draft, prepTimeMinutes: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div className="field"><label>Cottura</label><input type="number" min="0" value={draft.cookTimeMinutes ?? ""} onChange={(e) => setDraft({ ...draft, cookTimeMinutes: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div className="field"><label>Totale</label><input type="number" min="0" value={draft.totalTimeMinutes ?? ""} onChange={(e) => setDraft({ ...draft, totalTimeMinutes: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div className="field"><label>Porzioni</label><input type="number" min="1" value={draft.servings ?? 2} onChange={(e) => setDraft({ ...draft, servings: Number(e.target.value) || 2 })} /></div>
              </div>
              <div className="nutrition-edit-grid">
                {[["Calorie","calories","kcal"],["Proteine","protein","g"],["Carboidrati","carbs","g"],["Grassi","fat","g"],["Zuccheri","sugars","g"],["Fibre","fiber","g"],["Sale","salt","g"]].map(([label,key,unit]) => <div className="field" key={key}><label>{label}</label><div className="input-unit"><input type="number" min="0" step="0.1" value={(draft.nutrition as any)?.[key] ?? ""} onChange={(e) => setNutrition(key, e.target.value)} /><span>{unit}</span></div></div>)}
              </div>
              <div className="notes-grid"><div className="field"><label>Note dalla fonte</label><textarea value={draft.sourceNotes || ""} onChange={(e) => setDraft({ ...draft, sourceNotes: e.target.value })} /></div><div className="field"><label>Le mie note</label><textarea value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div></div>
              <label className="file-button inline-photo"><Icon name="image" size={16} /><span>Scegli nuova copertina</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(e.target.files?.[0] || null)} /></label>
              <button className="button primary big full" type="button" disabled={busy} onClick={saveEdit}><Icon name="database" size={17} />{busy ? "Salvo…" : "Salva modifiche"}</button>
            </div>
          ) : (
            <>
              <div className="stats-strip">
                <div><Icon name="clock" size={18} /><span><strong>{recipe.totalTimeMinutes ?? "–"}</strong><small>minuti</small></span></div>
                <div><Icon name="users" size={18} /><span><strong>{recipe.servings ?? "–"}</strong><small>porzioni</small></span></div>
                <div><Icon name="flame" size={18} /><span><strong>{n?.calories ?? "–"}</strong><small>kcal / porz.</small></span></div>
              </div>

              <div className="detail-actions top-actions pro-actions">
                <button className="button soft" onClick={() => setEditMode(true)} type="button"><Icon name="edit" size={17} /> Modifica</button>
                <button className="button soft" onClick={() => exportRecipePdf(recipe)} type="button"><Icon name="download" size={17} /> PDF</button>
                <button className="button soft" onClick={share} type="button"><Icon name="share" size={17} /> Condividi</button>
                <button className="button soft" onClick={() => onAddShopping(scaledIngredients, recipe.title)} type="button"><Icon name="bag" size={17} /> Spesa</button>
                <button className={wakeOn ? "button soft active" : "button soft"} onClick={toggleWakeLock} type="button"><Icon name="sun" size={17} /> {wakeOn ? "Schermo acceso" : "Tieni acceso"}</button>
              </div>

              <section className="recipe-section serving-section">
                <div className="recipe-section-title"><div><span className="section-kicker">Adatta quantità</span><h3>Porzioni</h3></div></div>
                <div className="serving-control"><button type="button" onClick={() => setTargetServings((x) => Math.max(1, x - 1))}>−</button><strong>{targetServings}</strong><button type="button" onClick={() => setTargetServings((x) => Math.min(24, x + 1))}>+</button><span>{factor !== 1 ? `quantità × ${prettyNumber(factor)}` : "quantità originali"}</span></div>
              </section>

              <section className="recipe-section">
                <div className="recipe-section-title"><div><span className="section-kicker">Preparazione</span><h3>Ingredienti</h3></div><span>tocca per spuntare</span></div>
                <div className="cook-list">
                  {scaledIngredients.map((item, i) => {
                    const checked = checkedIngredients.includes(i);
                    return <button type="button" key={i} className={checked ? "cook-row checked" : "cook-row"} onClick={() => setCheckedIngredients((current) => checked ? current.filter((x) => x !== i) : [...current, i])}><span className="cook-check">{checked ? <Icon name="check" size={13} /> : null}</span><span>{item}</span></button>;
                  })}
                </div>
              </section>

              <section className="recipe-section">
                <div className="recipe-section-title"><div><span className="section-kicker">Modalità cucina</span><h3>Procedimento</h3></div><span>{checkedSteps.length}/{recipe.steps.length}</span></div>
                <div className="steps-list">
                  {recipe.steps.map((step, i) => {
                    const checked = checkedSteps.includes(i);
                    const minutes = extractTimerMinutes(step);
                    return <div className={checked ? "step-row-wrap checked" : "step-row-wrap"} key={i}><button type="button" className={checked ? "step-row checked" : "step-row"} onClick={() => setCheckedSteps((current) => checked ? current.filter((x) => x !== i) : [...current, i])}><span className="step-number">{checked ? <Icon name="check" size={14} /> : i + 1}</span><span>{step}</span></button>{minutes ? <button type="button" className="step-timer" onClick={() => setTimer({ label: `${minutes} min · passaggio ${i + 1}`, seconds: minutes * 60 })}><Icon name="timer" size={14} />{minutes} min</button> : null}</div>;
                  })}
                </div>
              </section>

              {timer ? <div className="floating-timer"><Icon name="timer" size={18} /><div><strong>{timerText}</strong><span>{timer.label}</span></div><button onClick={() => setTimer(null)} type="button"><Icon name="close" size={16} /></button></div> : null}

              {n ? <section className="recipe-section nutrition-section"><div className="recipe-section-title"><div><span className="section-kicker">Per porzione</span><h3>Valori nutrizionali</h3></div><span>{n.estimated ? "stima" : "dati ricetta"}</span></div><div className="nutrition-display-grid">{[["Calorie",n.calories,"kcal"],["Proteine",n.protein,"g"],["Carboidrati",n.carbs,"g"],["Grassi",n.fat,"g"],["Zuccheri",n.sugars,"g"],["Fibre",n.fiber,"g"],["Sale",n.salt,"g"]].map(([label,value,unit]) => <div className="nutrition-cell" key={String(label)}><span>{label}</span><strong>{value ?? "–"}</strong><small>{unit}</small></div>)}</div></section> : null}

              {recipe.sourceNotes ? <section className="recipe-section note-section"><span className="section-kicker">Dalla fonte</span><h3>Note della ricetta</h3><p>{recipe.sourceNotes}</p></section> : null}
              {recipe.notes ? <section className="recipe-section note-section personal-note"><span className="section-kicker">Personali</span><h3>Le mie note</h3><p>{recipe.notes}</p></section> : null}

              <div className="recipe-safe-actions"><div className="data-protection-note"><Icon name="shield" size={17} /><span>Nessuna cancellazione permanente. Puoi archiviare e ripristinare la ricetta quando vuoi.</span></div><button className="button soft archive-button" type="button" disabled={busy} onClick={toggleArchive}><Icon name="archive" size={16} />{recipe.archived ? "Ripristina dall’archivio" : "Archivia ricetta"}</button></div>
              {recipe.sourceUrl ? <a className="source-link" href={recipe.sourceUrl} target="_blank" rel="noreferrer"><Icon name="external" size={16} /> Apri il video originale</a> : null}
            </>
          )}
        </div>
      </article>
    </div>
  );
}
