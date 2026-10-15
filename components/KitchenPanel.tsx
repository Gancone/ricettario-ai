"use client";
import { useState, type ReactNode } from "react";
import type { Recipe } from "@/types/recipe";
import { createRecipeId } from "@/lib/recipe-id";
import {
  MEALS,
  weekDays,
  type KitchenState,
  type PantryItem,
  type MealEntry,
  type KitchenRow,
} from "@/lib/kitchen";
import { matchesSearch } from "@/lib/cooking";
export type MoreSection = "planner" | "pantry" | "history" | "settings";
type Props = {
  section: MoreSection;
  onSection: (section: MoreSection) => void;
  recipes: Recipe[];
  state: KitchenState;
  status: string;
  busy: boolean;
  save: (
    entity: string,
    item: Partial<KitchenRow> & Record<string, unknown>,
  ) => Promise<KitchenRow>;
  reload: (days?: string[]) => Promise<void>;
  onOpen: (recipe: Recipe) => void;
  onPlanShopping: (entries: MealEntry[], missingOnly: boolean) => void;
  children: ReactNode;
};
export function KitchenPanel({
  section,
  onSection,
  recipes,
  state,
  status,
  busy,
  save,
  reload,
  onOpen,
  onPlanShopping,
  children,
}: Props) {
  const [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [quantity, setQuantity] = useState(""),
    [unit, setUnit] = useState(""),
    [notes, setNotes] = useState(""),
    [editing, setEditing] = useState<PantryItem | null>(null),
    [message, setMessage] = useState("");
  const [week, setWeek] = useState(() => weekDays()),
    [day, setDay] = useState(() => weekDays()[0]),
    [meal, setMeal] = useState<MealEntry["meal_type"]>("dinner"),
    [recipeId, setRecipeId] = useState(""),
    [servings, setServings] = useState("2"),
    [planNote, setPlanNote] = useState(""),
    [editPlan, setEditPlan] = useState<MealEntry | null>(null),
    [missingOnly, setMissingOnly] = useState(true),
    [undo, setUndo] = useState<{
      entity: string;
      item: KitchenRow & Record<string, unknown>;
    } | null>(null);
  const run = async (action: () => Promise<unknown>) => {
    setMessage("");
    try {
      await action();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Operazione non completata.",
      );
    }
  };
  const archive = (
    entity: string,
    item: KitchenRow & Record<string, unknown>,
  ) =>
    run(async () => {
      const current = await save(entity, {
        ...item,
        archived_at: new Date().toISOString(),
      });
      setUndo({ entity, item: { ...item, ...current } });
    });
  function moveWeek(amount: number) {
    const date = new Date(week[0] + "T12:00:00");
    date.setDate(date.getDate() + amount * 7);
    const days = weekDays(date);
    setWeek(days);
    setDay(days[0]);
    void reload(days);
  }
  async function savePantry() {
    if (!name.trim()) return;
    await save("pantry_items", {
      ...(editing || {}),
      id: editing?.id || createRecipeId(),
      name: name.trim(),
      quantity: quantity.trim() ? Number(quantity.replace(",", ".")) : null,
      unit: unit || null,
      notes,
      finished: editing?.finished || false,
    });
    setName("");
    setQuantity("");
    setUnit("");
    setNotes("");
    setEditing(null);
  }
  function editPantry(item: PantryItem) {
    setEditing(item);
    setName(item.name);
    setQuantity(item.quantity === null ? "" : String(item.quantity));
    setUnit(item.unit || "");
    setNotes(item.notes || "");
  }
  async function savePlan() {
    if (!recipeId) return;
    await save("meal_plan_entries", {
      ...(editPlan || {}),
      id: editPlan?.id || createRecipeId(),
      date: day,
      meal_type: meal,
      recipe_id: recipeId,
      servings: Number(servings),
      notes: planNote,
    });
    setEditPlan(null);
    setPlanNote("");
    setRecipeId("");
  }
  const selectedPlan = state.plan.filter(
    (entry) =>
      entry.date >= week[0] && entry.date <= week[6] && !entry.archived_at,
  );
  return (
    <section className="page-section kitchen-page">
      <nav className="more-tabs" aria-label="La tua cucina">
        {(
          [
            ["planner", "Piano pasti"],
            ["pantry", "Dispensa"],
            ["history", "Storico"],
            ["settings", "Impostazioni"],
          ] as const
        ).map(([value, label]) => (
          <button
            type="button"
            key={value}
            aria-pressed={section === value}
            className={section === value ? "active" : ""}
            onClick={() => onSection(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {section !== "settings" && (
        <p className="sync-caption" role="status">
          {status || "Caricamento…"}
        </p>
      )}
      {message && (
        <div className="warning-box" role="alert">
          {message}
        </div>
      )}
      {undo && (
        <div className="status-line">
          Elemento archiviato.{" "}
          <button
            className="button soft"
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await save(undo.entity, { ...undo.item, archived_at: null });
                setUndo(null);
              })
            }
          >
            Annulla archiviazione
          </button>
        </div>
      )}
      {section === "pantry" && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Quello che hai già</span>
              <h2>La tua dispensa</h2>
              <p>
                Le quantità sono facoltative. Segna ciò che finisce, senza
                perdere le note.
              </p>
            </div>
          </div>
          <form
            className="surface kitchen-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(savePantry);
            }}
          >
            <div className="form-grid two">
              <label className="field">
                Alimento
                <input
                  aria-label="Alimento dispensa"
                  value={name}
                  maxLength={300}
                  required
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <div className="form-grid two">
                <label className="field">
                  Quantità
                  <input
                    aria-label="Quantità dispensa"
                    type="number"
                    min="0"
                    step="any"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                  />
                </label>
                <label className="field">
                  Unità
                  <select
                    aria-label="Unità dispensa"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  >
                    {[
                      "",
                      "g",
                      "kg",
                      "ml",
                      "l",
                      "pz",
                      "cucchiai",
                      "cucchiaini",
                    ].map((value) => (
                      <option key={value} value={value}>
                        {value || "Solo presenza"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <label className="field">
              Note
              <input
                aria-label="Note dispensa"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={10000}
              />
            </label>
            <div className="button-row">
              <button className="button primary" disabled={busy} type="submit">
                {editing ? "Salva alimento" : "Aggiungi alimento"}
              </button>
              {editing && (
                <button
                  className="button soft"
                  type="button"
                  onClick={() => {
                    setEditing(null);
                    setName("");
                    setQuantity("");
                    setNotes("");
                  }}
                >
                  Annulla
                </button>
              )}
            </div>
          </form>
          <label className="field pantry-search">
            Cerca in dispensa
            <input
              type="search"
              aria-label="Cerca in dispensa"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="kitchen-list">
            {state.pantry
              .filter(
                (item) =>
                  !item.archived_at &&
                  matchesSearch(item.name + " " + item.notes, query),
              )
              .map((item) => (
                <article
                  className={
                    "surface kitchen-row" + (item.finished ? " finished" : "")
                  }
                  key={item.id}
                >
                  <div>
                    <strong>{item.name}</strong>
                    <p>
                      {item.finished
                        ? "Terminato"
                        : item.quantity !== null
                          ? `${item.quantity} ${item.unit || ""}`
                          : "Presente · quantità da controllare"}
                      {item.notes ? " · " + item.notes : ""}
                    </p>
                  </div>
                  <div className="button-row">
                    <button
                      className="button soft"
                      disabled={busy}
                      onClick={() =>
                        void run(() =>
                          save("pantry_items", {
                            ...item,
                            finished: !item.finished,
                          }),
                        )
                      }
                    >
                      {item.finished ? "Di nuovo disponibile" : "Terminato"}
                    </button>
                    <button
                      className="button soft"
                      onClick={() => editPantry(item)}
                    >
                      Modifica
                    </button>
                    <button
                      className="button soft"
                      disabled={busy}
                      aria-label={"Archivia " + item.name}
                      onClick={() => void archive("pantry_items", item)}
                    >
                      Archivia
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {!state.pantry.length && (
            <div className="empty-state">
              <h3>Aggiungi ciò che hai in cucina</h3>
              <p>Le ricette ti diranno quali ingredienti hai già.</p>
            </div>
          )}
        </>
      )}
      {section === "planner" && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">Una settimana alla volta</span>
              <h2>Piano pasti</h2>
              <p>
                Scegli le ricette e le porzioni. La lista della spesa segue il
                tuo piano.
              </p>
            </div>
          </div>
          <div className="week-controls">
            <button
              className="button soft"
              aria-label="Settimana precedente"
              onClick={() => moveWeek(-1)}
            >
              ←
            </button>
            <strong>
              {new Date(week[0] + "T12:00:00").toLocaleDateString("it-IT", {
                day: "numeric",
                month: "short",
              })}{" "}
              –{" "}
              {new Date(week[6] + "T12:00:00").toLocaleDateString("it-IT", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </strong>
            <button
              className="button soft"
              aria-label="Settimana successiva"
              onClick={() => moveWeek(1)}
            >
              →
            </button>
          </div>
          <form
            className="surface kitchen-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run(savePlan);
            }}
          >
            <div className="form-grid two">
              <label className="field">
                Giorno
                <select
                  aria-label="Giorno del pasto"
                  value={day}
                  onChange={(e) => setDay(e.target.value)}
                >
                  {week.map((date) => (
                    <option key={date} value={date}>
                      {new Date(date + "T12:00:00").toLocaleDateString(
                        "it-IT",
                        { weekday: "long", day: "numeric" },
                      )}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Pasto
                <select
                  aria-label="Tipo di pasto"
                  value={meal}
                  onChange={(e) =>
                    setMeal(e.target.value as MealEntry["meal_type"])
                  }
                >
                  {Object.entries(MEALS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Ricetta
                <select
                  required
                  aria-label="Ricetta da pianificare"
                  value={recipeId}
                  onChange={(e) => {
                    setRecipeId(e.target.value);
                    setServings(
                      String(
                        recipes.find((recipe) => recipe.id === e.target.value)
                          ?.servings || 2,
                      ),
                    );
                  }}
                >
                  <option value="">Scegli una ricetta</option>
                  {recipes
                    .filter((recipe) => !recipe.archived)
                    .map((recipe) => (
                      <option key={recipe.id} value={recipe.id}>
                        {recipe.title}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                Porzioni
                <input
                  aria-label="Porzioni del pasto"
                  type="number"
                  min="1"
                  max="1000"
                  step="1"
                  required
                  value={servings}
                  onChange={(e) => setServings(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              Note
              <input
                aria-label="Note del pasto"
                value={planNote}
                onChange={(e) => setPlanNote(e.target.value)}
              />
            </label>
            <div className="button-row">
              <button
                type="submit"
                className="button primary"
                disabled={busy || !recipeId}
              >
                {editPlan ? "Salva pasto" : "Assegna ricetta"}
              </button>
              {editPlan && (
                <button
                  type="button"
                  className="button soft"
                  onClick={() => {
                    setEditPlan(null);
                    setRecipeId("");
                  }}
                >
                  Annulla
                </button>
              )}
            </div>
          </form>
          <div className="week-grid">
            {week.map((date) => (
              <section className="surface day-card" key={date}>
                <h3>
                  {new Date(date + "T12:00:00").toLocaleDateString("it-IT", {
                    weekday: "long",
                    day: "numeric",
                  })}
                </h3>
                {Object.entries(MEALS).map(([type, label]) => (
                  <div className="meal-slot" key={type}>
                    <span>{label}</span>
                    {selectedPlan
                      .filter(
                        (entry) =>
                          entry.date === date && entry.meal_type === type,
                      )
                      .map((entry) => {
                        const recipe = recipes.find(
                          (recipe) => recipe.id === entry.recipe_id,
                        );
                        return (
                          <div className="meal-entry" key={entry.id}>
                            <button
                              className="meal-title"
                              disabled={!recipe}
                              onClick={() => recipe && onOpen(recipe)}
                            >
                              {recipe?.title || "Ricetta non ancora caricata"}
                            </button>
                            <small>
                              {entry.servings} porzioni
                              {entry.notes ? " · " + entry.notes : ""}
                            </small>
                            <div className="button-row">
                              <button
                                className="button soft"
                                aria-label={
                                  "Modifica pasto " + (recipe?.title || "")
                                }
                                onClick={() => {
                                  setEditPlan(entry);
                                  setDay(entry.date);
                                  setMeal(entry.meal_type);
                                  setRecipeId(entry.recipe_id);
                                  setServings(String(entry.servings));
                                  setPlanNote(entry.notes || "");
                                }}
                              >
                                Modifica
                              </button>
                              <button
                                className="button soft"
                                aria-label={
                                  "Rimuovi dal piano " + (recipe?.title || "")
                                }
                                disabled={busy}
                                onClick={() =>
                                  void archive("meal_plan_entries", entry)
                                }
                              >
                                Rimuovi
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </section>
            ))}
          </div>
          {!selectedPlan.length && (
            <div className="empty-state">
              <h3>Pianifica il primo pasto</h3>
              <p>Inizia da una ricetta che ami.</p>
            </div>
          )}
          <div className="planner-shopping surface">
            <label className="check-label">
              <input
                type="checkbox"
                checked={missingOnly}
                onChange={(e) => setMissingOnly(e.target.checked)}
              />{" "}
              Escludi ciò che hai in dispensa
            </label>
            <button
              className="button primary"
              disabled={!selectedPlan.length}
              onClick={() => onPlanShopping(selectedPlan, missingOnly)}
            >
              Genera lista della spesa
            </button>
          </div>
        </>
      )}
      {section === "history" && (
        <>
          <div className="section-heading">
            <div>
              <span className="eyebrow">I tuoi piatti nel tempo</span>
              <h2>Storico cucina</h2>
              <p>
                Le ultime 100 preparazioni. Puoi aggiungere una preparazione
                dalla ricetta.
              </p>
            </div>
          </div>
          <div className="kitchen-list">
            {state.history.map((entry) => {
              const recipe = recipes.find(
                (recipe) => recipe.id === entry.recipe_id,
              );
              return (
                <article className="surface kitchen-row" key={entry.id}>
                  <div>
                    <button
                      className="meal-title"
                      disabled={!recipe}
                      onClick={() => recipe && onOpen(recipe)}
                    >
                      {recipe?.title || "Ricetta da caricare"}
                    </button>
                    <p>
                      {new Date(entry.cooked_at).toLocaleDateString("it-IT")}
                      {entry.rating != null ? ` · ${entry.rating}/5` : ""}
                      {entry.servings ? ` · ${entry.servings} porzioni` : ""}
                    </p>
                    {entry.notes && <p>{entry.notes}</p>}
                  </div>
                  <button
                    className="button soft"
                    disabled={busy}
                    onClick={() => void archive("cooking_history", entry)}
                  >
                    Archivia voce
                  </button>
                </article>
              );
            })}
          </div>
          {!state.history.length && (
            <div className="empty-state">
              <h3>La prima volta è un buon inizio</h3>
              <p>Apri una ricetta e scegli “Cucinata oggi”.</p>
            </div>
          )}
        </>
      )}
      {section === "settings" && children}
    </section>
  );
}
