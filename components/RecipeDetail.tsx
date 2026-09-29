"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Category, Recipe } from "@/types/recipe";
import { exportRecipePdf } from "@/lib/pdf";
import { displayImageUrl } from "@/lib/image-client";
import { Icon } from "@/components/Icon";
import { scaleIngredient, remainingSeconds } from "@/lib/cooking";
import { api, jsonBody } from "@/lib/api-client";

function prettyNumber(value: number) {
  const rounded = Math.round(value * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(".", ",");
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
  const [timer, setTimer] = useState<{ label: string; endsAt: number } | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState("");
  const modalRef = useRef<HTMLElement>(null);
  const closeRef = useRef<() => void>(() => {});
  const saving = useRef(false);
  function close() {
    if (busy) return;
    if (editMode && JSON.stringify(draft) !== JSON.stringify(recipe) && !confirm("Chiudere senza salvare le modifiche?")) return;
    if (timer && !confirm("Chiudendo la ricetta il timer verrà fermato. Continuare?")) return;
    onClose();
  }
  closeRef.current = close;

  useEffect(() => {
    const old = document.body.style.overflow;
    const previousFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    modalRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); closeRef.current(); }
      if (event.key !== "Tab") return;
      const elements = Array.from(modalRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') || []).filter((el) => el.getClientRects().length > 0);
      const first = elements[0]; const last = elements[elements.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modalRef.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = old; document.removeEventListener("keydown", handleKey); previousFocus?.focus(); wakeRef.current?.release?.().catch?.(() => {}); };
  }, []);

  useEffect(() => { if (!editMode) setDraft(recipe); }, [recipe, editMode]);

  useEffect(() => {
    if (!timer) return;
    const tick = () => {
      const left = remainingSeconds(timer.endsAt);
      setSeconds(left);
      if (!left) { setMessage(`Timer terminato: ${timer.label}`); navigator.vibrate?.([250, 120, 250]); setTimer(null); }
    };
    tick();
    const handle = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(handle); document.removeEventListener("visibilitychange", tick); };
  }, [timer]);

  function startTimer(minutes: number, index: number) {
    if (timer && !confirm("Sostituire il timer in corso?")) return;
    setSeconds(minutes * 60); setTimer({ label: `${minutes} min · passaggio ${index + 1}`, endsAt: Date.now() + minutes * 60000 });
  }

  const factor = (recipe.servings || 2) > 0 ? targetServings / (recipe.servings || 2) : 1;
  const scaledIngredients = useMemo(() => recipe.ingredients.map((x) => scaleIngredient(x, factor)), [recipe.ingredients, factor]);

  async function saveUpdated(updated: Recipe) {
    if (saving.current) throw new Error("Salvataggio già in corso.");
    saving.current = true;
    setBusy(true);
    try {
      const data = await api<Recipe & { backupWarning?: string }>(`/api/recipes/${recipe.id}`, { method: "PATCH", ...jsonBody(updated) }, 90000);
      onUpdated(data);
      setDraft(data);
      setMessage(data.backupWarning ? "Modifiche salvate. Il backup successivo non è riuscito: riprova da Impostazioni." : "Modifiche salvate.");
      return data as Recipe;
    } catch (error: any) {
      setMessage(error?.message || "Non riesco a salvare la modifica. I dati inseriti sono ancora qui.");
      throw error;
    } finally { setBusy(false); saving.current = false; }
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
      form.append("recipeId", recipe.id);
      const response = await fetch("/api/images/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Foto non caricata");
      if (editMode) setDraft((current) => ({ ...current, imageUrl: data.imageUrl }));
      else await saveUpdated({ ...recipe, imageUrl: data.imageUrl });
    } catch (error: any) { alert(error?.message || "Foto non caricata."); }
    finally { setBusy(false); }
  }

  async function share() {
    const text = `${recipe.title}\n\nIngredienti:\n${scaledIngredients.map((x) => `• ${x}`).join("\n")}\n\nProcedimento:\n${recipe.steps.map((x, i) => `${i + 1}. ${x}`).join("\n")}`;
    if (navigator.share) {
      try { await navigator.share({ title: recipe.title, text, url: recipe.sourceUrl || undefined }); return; } catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(text); setMessage("Ricetta copiata negli appunti."); }
    catch { setMessage("Gli appunti non sono disponibili. Puoi scaricare la ricetta in PDF."); }
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
  const timerText = timer ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}` : "";

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <article ref={modalRef} tabIndex={-1} className="recipe-modal" role="dialog" aria-modal="true" aria-label={recipe.title}>
        <div className="recipe-hero">
          {recipe.imageUrl ? <img src={displayImageUrl(recipe.imageUrl)} alt={recipe.title} /> : <div className="recipe-hero-placeholder"><span>{recipe.title.slice(0, 1).toUpperCase()}</span></div>}
          <div className="hero-shade" />
          <button className="round-button close-button" onClick={close} disabled={busy} type="button" aria-label="Chiudi"><Icon name="close" size={20} /></button>
          <button className={recipe.favorite ? "round-button favorite-detail active" : "round-button favorite-detail"} onClick={toggleFavorite} disabled={busy} aria-pressed={!!recipe.favorite} type="button" aria-label="Preferito"><Icon name="heart" size={19} /></button>
          <div className="hero-copy">
            <span className="category-on-image">{recipe.archived ? "Archiviata" : recipe.category}</span>
            <h2>{recipe.title}</h2>
          </div>
        </div>

        <div className="recipe-modal-body">
          {message ? <div className="status-line detail-status" role="status">{message}</div> : null}
          {editMode ? (
            <fieldset className="detail-editor" disabled={busy} aria-label="Modifica ricetta">
              <div className="detail-editor-head"><div><span className="section-kicker">Modifica completa</span><h3>Correggi la ricetta</h3></div><button className="button soft" onClick={() => { setDraft(recipe); setEditMode(false); }} type="button">Annulla</button></div>
              <div className="field"><label>Titolo</label><input aria-label="Titolo" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
              <div className="form-grid two"><div className="field"><label>Catalogo</label><select aria-label="Catalogo" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })}>{categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}</select></div><div className="field"><label>Tag</label><input aria-label="Tag" value={draft.tags.join(", ")} onChange={(e) => setDraft({ ...draft, tags: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></div></div>
              <div className="field"><label>Ingredienti · uno per riga</label><textarea aria-label="Ingredienti" className="tall" value={draft.ingredients.join("\n")} onChange={(e) => setDraft({ ...draft, ingredients: e.target.value.split("\n") })} /></div>
              <div className="field"><label>Procedimento · un passaggio per riga</label><textarea aria-label="Procedimento" className="tall" value={draft.steps.join("\n")} onChange={(e) => setDraft({ ...draft, steps: e.target.value.split("\n") })} /></div>
              <div className="form-grid four">
                <div className="field"><label>Prep.</label><input aria-label="Preparazione in minuti" type="number" min="0" value={draft.prepTimeMinutes ?? ""} onChange={(e) => setDraft({ ...draft, prepTimeMinutes: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div className="field"><label>Cottura</label><input aria-label="Cottura in minuti" type="number" min="0" value={draft.cookTimeMinutes ?? ""} onChange={(e) => setDraft({ ...draft, cookTimeMinutes: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div className="field"><label>Totale</label><input aria-label="Tempo totale in minuti" type="number" min="0" value={draft.totalTimeMinutes ?? ""} onChange={(e) => setDraft({ ...draft, totalTimeMinutes: e.target.value ? Number(e.target.value) : undefined })} /></div>
                <div className="field"><label>Porzioni</label><input aria-label="Porzioni" type="number" min="1" value={draft.servings ?? 2} onChange={(e) => setDraft({ ...draft, servings: Number(e.target.value) || 2 })} /></div>
              </div>
              <div className="nutrition-edit-grid">
                {[["Calorie","calories","kcal"],["Proteine","protein","g"],["Carboidrati","carbs","g"],["Grassi","fat","g"],["Zuccheri","sugars","g"],["Fibre","fiber","g"],["Sale","salt","g"]].map(([label,key,unit]) => <div className="field" key={key}><label>{label}</label><div className="input-unit"><input aria-label={label} type="number" min="0" step="0.1" value={(draft.nutrition as any)?.[key] ?? ""} onChange={(e) => setNutrition(key, e.target.value)} /><span>{unit}</span></div></div>)}
              </div>
              <div className="notes-grid"><div className="field"><label>Note dalla fonte</label><textarea aria-label="Note dalla fonte" value={draft.sourceNotes || ""} onChange={(e) => setDraft({ ...draft, sourceNotes: e.target.value })} /></div><div className="field"><label>Le mie note</label><textarea aria-label="Note personali" value={draft.notes || ""} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></div></div>
              <label className="file-button inline-photo"><Icon name="image" size={16} /><span>Scegli nuova copertina</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => uploadImage(e.target.files?.[0] || null)} /></label>
              <button className="button primary big full" type="button" disabled={busy} onClick={saveEdit}><Icon name="database" size={17} />{busy ? "Salvo…" : "Salva modifiche"}</button>
            </fieldset>
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
                <button className="button soft" onClick={() => { onAddShopping(scaledIngredients, recipe.title); setMessage("Ingredienti aggiunti alla lista della spesa."); }} type="button"><Icon name="bag" size={17} /> Spesa</button>
                <button className={wakeOn ? "button soft active" : "button soft"} onClick={toggleWakeLock} type="button"><Icon name="sun" size={17} /> {wakeOn ? "Schermo acceso" : "Tieni acceso"}</button>
              </div>

              <section className="recipe-section serving-section">
                <div className="recipe-section-title"><div><span className="section-kicker">Adatta quantità</span><h3>Porzioni</h3></div></div>
                <div className="serving-control"><button type="button" aria-label="Diminuisci porzioni" onClick={() => setTargetServings((x) => Math.max(1, x - 1))}>−</button><strong>{targetServings}</strong><button type="button" aria-label="Aumenta porzioni" onClick={() => setTargetServings((x) => Math.min(24, x + 1))}>+</button><span>{factor !== 1 ? `quantità × ${prettyNumber(factor)}` : "quantità originali"}</span></div>
              </section>

              <section className="recipe-section">
                <div className="recipe-section-title"><div><span className="section-kicker">Preparazione</span><h3>Ingredienti</h3></div><span>tocca per spuntare</span></div>
                <div className="cook-list">
                  {scaledIngredients.map((item, i) => {
                    const checked = checkedIngredients.includes(i);
                    return <button type="button" key={i} aria-pressed={checked} className={checked ? "cook-row checked" : "cook-row"} onClick={() => setCheckedIngredients((current) => checked ? current.filter((x) => x !== i) : [...current, i])}><span className="cook-check">{checked ? <Icon name="check" size={13} /> : null}</span><span>{item}</span></button>;
                  })}
                </div>
              </section>

              <section className="recipe-section">
                <div className="recipe-section-title"><div><span className="section-kicker">Modalità cucina</span><h3>Procedimento</h3></div><span>{checkedSteps.length}/{recipe.steps.length}</span></div>
                <div className="steps-list">
                  {recipe.steps.map((step, i) => {
                    const checked = checkedSteps.includes(i);
                    const minutes = extractTimerMinutes(step);
                    return <div className={checked ? "step-row-wrap checked" : "step-row-wrap"} key={i}><button type="button" aria-pressed={checked} className={checked ? "step-row checked" : "step-row"} onClick={() => setCheckedSteps((current) => checked ? current.filter((x) => x !== i) : [...current, i])}><span className="step-number">{checked ? <Icon name="check" size={14} /> : i + 1}</span><span>{step}</span></button>{minutes ? <button type="button" className="step-timer" onClick={() => startTimer(minutes, i)}><Icon name="timer" size={14} />{minutes} min</button> : null}</div>;
                  })}
                </div>
              </section>

              {timer ? <div className="floating-timer"><Icon name="timer" size={18} /><div><strong>{timerText}</strong><span>{timer.label}</span></div><button onClick={() => setTimer(null)} type="button" aria-label="Ferma timer"><Icon name="close" size={16} /></button></div> : null}

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
