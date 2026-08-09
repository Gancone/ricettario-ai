"use client";

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";

type Recipe = {
  id: string;
  title: string;
  sourceUrl?: string;
  imageUrl?: string;
  category: string;
  tags: string[];
  ingredients: string[];
  steps: string[];
  notes?: string;

  prepTimeMinutes?: number;
  cookTimeMinutes?: number;
  totalTimeMinutes?: number;
  servings?: number;

  nutrition?: {
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
    sugars?: number;
    fiber?: number;
    salt?: number;
    estimated?: boolean;
  };

  createdAt: string;
};

const emptyDraft = {
  title: "",
  sourceUrl: "",
  imageUrl: "",
  category: "",
  tags: "",
  ingredients: "",
  steps: "",
  notes: "",

  prepTimeMinutes: "",
  cookTimeMinutes: "",
  totalTimeMinutes: "",
  servings: "",

  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  sugars: "",
  fiber: "",
  salt: "",
  nutritionEstimated: true
};

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [draft, setDraft] = useState(emptyDraft);
  const [sourceText, setSourceText] = useState("");
  const [video, setVideo] = useState<File | null>(null);
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Tutte");
  const [categories, setCategories] = useState<string[]>([
    "Colazione",
    "Merenda",
    "Primi piatti",
    "Secondi piatti",
    "Contorni",
    "Dessert"
  ]);

  const [newCategory, setNewCategory] = useState("");

  const [expandedRecipes, setExpandedRecipes] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);

  const RECIPES_PER_PAGE = 20;

  async function loadRecipes() {

    try {

      const response =
        await fetch("/api/recipes");

      const data =
        await response.json();

      if (!response.ok) {
        throw new Error(
          data.error ||
          "Errore caricamento ricette"
        );
      }

      const formatted: Recipe[] =
        data.map((recipe: any) => ({

          id:
            recipe.id,

          title:
            recipe.title,

          sourceUrl:
            recipe.source_url || "",

          imageUrl:
            recipe.image_url || "",

          category:
            recipe.category,

          tags:
            recipe.tags || [],

          ingredients:
            recipe.ingredients || [],

          steps:
            recipe.steps || [],

          notes:
            recipe.notes || "",

          prepTimeMinutes:
            recipe.prep_time_minutes,

          cookTimeMinutes:
            recipe.cook_time_minutes,

          totalTimeMinutes:
            recipe.total_time_minutes,

          servings:
            recipe.servings,

          nutrition:
            recipe.nutrition,

          createdAt:
            recipe.created_at

        }));

      setRecipes(formatted);

    } catch (error) {

      console.error(
        "Errore Supabase:",
        error
      );

    }

  }
  /*useEffect(() => {
    const rawRecipes = localStorage.getItem("ricettario-ai");

    if (rawRecipes) {
      setRecipes(JSON.parse(rawRecipes));
    }

    const rawCategories = localStorage.getItem("ricettario-categories");

    if (rawCategories) {
      setCategories(JSON.parse(rawCategories));
    }
  }, []);*/

  useEffect(() => {

    loadRecipes();

  }, []);

  function addCategory() {
    const name = newCategory.trim();

    if (!name) return;

    if (categories.includes(name)) {
      setNewCategory("");
      return;
    }

    const next = [...categories, name];

    setCategories(next);

    localStorage.setItem(
      "ricettario-categories",
      JSON.stringify(next)
    );

    setDraft({
      ...draft,
      category: name
    });

    setNewCategory("");
  }

  function toggleRecipe(id: string) {
    setExpandedRecipes(current =>
      current.includes(id)
        ? current.filter(recipeId => recipeId !== id)
        : [...current, id]
    );
  }

  function persist(next: Recipe[]) {
    setRecipes(next);
    localStorage.setItem("ricettario-ai", JSON.stringify(next));
  }

  async function extractRecipe() {
    if (!video && !sourceText.trim() && !draft.sourceUrl.trim()) {
      setStatus("Incolla il link del video, oppure usa il caricamento manuale.");
      return;
    }
    setStatus("Sto trasformando il contenuto in ricetta…");
    try {
      const body = new FormData();
      if (video) body.append("video", video);
      body.append("sourceText", sourceText);
      body.append("sourceUrl", draft.sourceUrl);

      const res = await fetch("/api/extract", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Errore di estrazione");

      setDraft((d) => ({
        ...d,

        title: data.title || d.title,
        imageUrl: data.imageUrl || "",

        ingredients:
          (data.ingredients || []).join("\n"),

        steps:
          (data.steps || []).join("\n"),

        notes:
          data.notes || "",

        prepTimeMinutes:
          data.prepTimeMinutes || "",

        cookTimeMinutes:
          data.cookTimeMinutes || "",

        totalTimeMinutes:
          data.totalTimeMinutes || "",

        servings:
          data.servings || "",

        calories:
          data.nutrition?.calories ?? "",

        protein:
          data.nutrition?.protein ?? "",

        carbs:
          data.nutrition?.carbs ?? "",

        fat:
          data.nutrition?.fat ?? "",

        sugars:
          data.nutrition?.sugars ?? "",

        fiber:
          data.nutrition?.fiber ?? "",

        salt:
          data.nutrition?.salt ?? "",

        nutritionEstimated:
          data.nutrition?.estimated ?? true
      }));
      setStatus(`Ricetta estratta ✓ ${data._debug || ""}`);
    } catch (e: any) {
      setStatus(e.message || "Qualcosa non ha funzionato.");
    }
  }

  async function saveRecipe() {

    if (!draft.title.trim()) {
      setStatus("Dai un titolo alla ricetta.");
      return;
    }
    const recipe: Recipe = {
      id: crypto.randomUUID(),

      title: draft.title.trim(),

      sourceUrl: draft.sourceUrl.trim(),

      imageUrl: draft.imageUrl,

      category:
        draft.category.trim() ||
        "Senza categoria",

      tags:
        draft.tags
          .split(",")
          .map(x => x.trim())
          .filter(Boolean),

      ingredients:
        draft.ingredients
          .split("\n")
          .map(x => x.trim())
          .filter(Boolean),

      steps:
        draft.steps
          .split("\n")
          .map(x => x.trim())
          .filter(Boolean),

      notes:
        draft.notes.trim(),

      prepTimeMinutes:
        Number(draft.prepTimeMinutes) ||
        undefined,

      cookTimeMinutes:
        Number(draft.cookTimeMinutes) ||
        undefined,

      totalTimeMinutes:
        Number(draft.totalTimeMinutes) ||
        undefined,

      servings:
        Number(draft.servings) ||
        undefined,

      nutrition: {
        calories:
          Number(draft.calories) ||
          undefined,

        protein:
          Number(draft.protein) ||
          undefined,

        carbs:
          Number(draft.carbs) ||
          undefined,

        fat:
          Number(draft.fat) ||
          undefined,

        sugars:
          Number(draft.sugars) ||
          undefined,

        fiber:
          Number(draft.fiber) ||
          undefined,

        salt:
          Number(draft.salt) ||
          undefined,

        estimated:
          draft.nutritionEstimated
      },

      createdAt:
        new Date().toISOString()
    };
    try {

      setStatus(
        "Salvataggio..."
      );

      const response =
        await fetch(
          "/api/recipes",
          {
            method: "POST",

            headers: {
              "Content-Type":
                "application/json"
            },

            body:
              JSON.stringify(
                recipe
              )
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data.error ||
          "Errore salvataggio"
        );

      }

      setRecipes(current => [
        recipe,
        ...current
      ]);

      setDraft(
        emptyDraft
      );

      setSourceText("");

      setVideo(null);

      setStatus(
        "Salvata ✓"
      );

    } catch (error: any) {

      console.error(error);

      setStatus(
        `Errore salvataggio: ${error.message}`
      );

    }

  }

  async function removeRecipe(
    id: string
  ) {

    try {

      const response =
        await fetch(
          `/api/recipes/${id}`,
          {
            method: "DELETE"
          }
        );

      const data =
        await response.json();

      if (!response.ok) {

        throw new Error(
          data.error ||
          "Errore eliminazione"
        );

      }

      setRecipes(current =>
        current.filter(
          recipe =>
            recipe.id !== id
        )
      );

    } catch (error: any) {

      alert(
        `Non riesco a eliminare la ricetta: ${error.message}`
      );

    }
  }

  const filterCategories = useMemo(
    () => [
      "Tutte",
      ...Array.from(
        new Set([
          ...categories,
          ...recipes.map(r => r.category)
        ])
      )
    ],
    [categories, recipes]
  );

  function exportRecipePdf(recipe: Recipe) {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4"
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    const margin = 20;
    const maxWidth = pageWidth - margin * 2;

    let y = 20;

    function checkPageSpace(heightNeeded = 10) {
      if (y + heightNeeded > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
    }

    // Titolo
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");

    const titleLines = doc.splitTextToSize(
      recipe.title,
      maxWidth
    );

    doc.text(titleLines, margin, y);
    y += titleLines.length * 9 + 5;

    // Categoria
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    doc.text(
      `Categoria: ${recipe.category}`,
      margin,
      y
    );

    y += 10;

    // Ingredienti
    checkPageSpace(20);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Ingredienti", margin, y);

    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    recipe.ingredients.forEach((ingredient) => {
      const lines = doc.splitTextToSize(
        `• ${ingredient}`,
        maxWidth
      );

      checkPageSpace(lines.length * 6);

      doc.text(lines, margin, y);

      y += lines.length * 6;
    });

    y += 6;

    // Procedimento
    checkPageSpace(20);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Procedimento", margin, y);

    y += 8;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");

    recipe.steps.forEach((step, index) => {
      const lines = doc.splitTextToSize(
        `${index + 1}. ${step}`,
        maxWidth
      );

      checkPageSpace(lines.length * 6 + 3);

      doc.text(lines, margin, y);

      y += lines.length * 6 + 3;
    });

    // Note
    if (recipe.notes) {
      y += 5;

      checkPageSpace(20);

      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Note", margin, y);

      y += 8;

      doc.setFontSize(11);
      doc.setFont("helvetica", "normal");

      const noteLines = doc.splitTextToSize(
        recipe.notes,
        maxWidth
      );

      checkPageSpace(noteLines.length * 6);

      doc.text(noteLines, margin, y);

      y += noteLines.length * 6;
    }

    // Fonte
    if (recipe.sourceUrl) {
      y += 8;

      checkPageSpace(15);

      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");

      const sourceLines = doc.splitTextToSize(
        `Fonte: ${recipe.sourceUrl}`,
        maxWidth
      );

      doc.text(sourceLines, margin, y);
    }

    // Nome file pulito
    const safeFileName = recipe.title
      .replace(/[<>:"/\\|?*]/g, "")
      .trim()
      .replace(/\s+/g, " ");

    doc.save(`${safeFileName}.pdf`);
  }

  const visible = recipes.filter(r => {
    const haystack = [r.title, r.category, ...r.tags, ...r.ingredients].join(" ").toLowerCase();
    return (filter === "Tutte" || r.category === filter) &&
      haystack.includes(query.toLowerCase());
  });

  const totalPages = Math.ceil(
    visible.length / RECIPES_PER_PAGE
  );

  const startIndex =
    (currentPage - 1) * RECIPES_PER_PAGE;

  const paginatedRecipes = visible.slice(
    startIndex,
    startIndex + RECIPES_PER_PAGE
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [query, filter]);
  return (
    <main className="shell">
      <header>
        <div>
          <h1>Il mio Ricettario</h1>
          <div className="subtitle">Video → ricetta scritta → salva → cataloga come vuoi.</div>
        </div>
        <div className="small">I dati del ricettario restano nel tuo browser.</div>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>1. Incolla il link</h2>
          <div className="field">
            <label>Link del video (Instagram, TikTok, YouTube…)</label>
            <input
              value={draft.sourceUrl}
              onChange={e => setDraft({ ...draft, sourceUrl: e.target.value })}
              placeholder="https://..."
              inputMode="url"
            />
          </div>
          <div className="field">
            <label>Caricamento manuale (solo se il link non funziona)</label>
            <input
              type="file"
              accept="video/*,audio/*"
              onChange={e => setVideo(e.target.files?.[0] || null)}
            />
          </div>
          <div className="field">
            <label>Oppure incolla didascalia / testo</label>
            <textarea
              value={sourceText}
              onChange={e => setSourceText(e.target.value)}
              placeholder="Ingredienti, descrizione del post, trascrizione..."
            />
          </div>
          <button className="primary" onClick={extractRecipe}>✨ Estrai ricetta dal link</button>
          <div className="status" style={{ marginTop: 10 }}>{status}</div>
        </section>

        <section className="panel">
          <h2>2. Controlla e salva</h2>
          {draft.imageUrl && (
            <img
              src={draft.imageUrl}
              alt="Anteprima del piatto"
              style={{
                width: "100%",
                height: "240px",
                objectFit: "cover",
                borderRadius: "16px",
                marginBottom: "16px"
              }}
            />
          )}
          <div className="grid">
            <div className="field">
              <label>Preparazione (minuti)</label>
              <input
                type="number"
                value={draft.prepTimeMinutes}
                onChange={e =>
                  setDraft({
                    ...draft,
                    prepTimeMinutes: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Cottura (minuti)</label>
              <input
                type="number"
                value={draft.cookTimeMinutes}
                onChange={e =>
                  setDraft({
                    ...draft,
                    cookTimeMinutes: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Tempo totale</label>
              <input
                type="number"
                value={draft.totalTimeMinutes}
                onChange={e =>
                  setDraft({
                    ...draft,
                    totalTimeMinutes: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Porzioni</label>
              <input
                type="number"
                value={draft.servings}
                onChange={e =>
                  setDraft({
                    ...draft,
                    servings: e.target.value
                  })
                }
              />
            </div>
          </div>
          <div className="field">
            <label>Titolo</label>
            <input value={draft.title} onChange={e => setDraft({ ...draft, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Catalogo</label>

            <select
              value={draft.category}
              onChange={e =>
                setDraft({
                  ...draft,
                  category: e.target.value
                })
              }
            >
              <option value="">Scegli dove salvare la ricetta</option>

              {categories.map(category => (
                <option
                  key={category}
                  value={category}
                >
                  {category}
                </option>
              ))}

            </select>
            <div className="row">

              <input
                value={newCategory}
                onChange={e => setNewCategory(e.target.value)}
                placeholder="Nuovo catalogo..."
              />

              <button
                type="button"
                className="secondary"
                onClick={addCategory}
              >
                + Aggiungi
              </button>

            </div>
          </div>
          <h3>Valori nutrizionali</h3>

          <p className="small">
            Valori per porzione
            {draft.nutritionEstimated
              ? " • stima"
              : ""}
          </p>

          <div className="nutrition-grid">

            <div className="field">
              <label>Calorie</label>
              <input
                type="number"
                value={draft.calories}
                onChange={e =>
                  setDraft({
                    ...draft,
                    calories: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Proteine (g)</label>
              <input
                type="number"
                step="0.1"
                value={draft.protein}
                onChange={e =>
                  setDraft({
                    ...draft,
                    protein: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Carboidrati (g)</label>
              <input
                type="number"
                step="0.1"
                value={draft.carbs}
                onChange={e =>
                  setDraft({
                    ...draft,
                    carbs: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Grassi (g)</label>
              <input
                type="number"
                step="0.1"
                value={draft.fat}
                onChange={e =>
                  setDraft({
                    ...draft,
                    fat: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Zuccheri (g)</label>
              <input
                type="number"
                step="0.1"
                value={draft.sugars}
                onChange={e =>
                  setDraft({
                    ...draft,
                    sugars: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Fibre (g)</label>
              <input
                type="number"
                step="0.1"
                value={draft.fiber}
                onChange={e =>
                  setDraft({
                    ...draft,
                    fiber: e.target.value
                  })
                }
              />
            </div>

            <div className="field">
              <label>Sale (g)</label>
              <input
                type="number"
                step="0.01"
                value={draft.salt}
                onChange={e =>
                  setDraft({
                    ...draft,
                    salt: e.target.value
                  })
                }
              />
            </div>

          </div>
          <div className="field">
            <label>Tag, separati da virgola</label>
            <input
              value={draft.tags}
              onChange={e => setDraft({ ...draft, tags: e.target.value })}
              placeholder="veloce, vegetariano, cena"
            />
          </div>
          <div className="field">
            <label>Ingredienti — uno per riga</label>
            <textarea value={draft.ingredients} onChange={e => setDraft({ ...draft, ingredients: e.target.value })} />
          </div>
          <div className="field">
            <label>Procedimento — un passaggio per riga</label>
            <textarea value={draft.steps} onChange={e => setDraft({ ...draft, steps: e.target.value })} />
          </div>
          <div className="field">
            <label>Note</label>
            <textarea value={draft.notes} onChange={e => setDraft({ ...draft, notes: e.target.value })} />
          </div>
          <button className="primary" onClick={saveRecipe}>Salva ricetta</button>
        </section>
      </div>

      <section className="recipes">
        <h2>Le mie ricette</h2>
        <div className="toolbar">
          <input placeholder="Cerca ricetta o ingrediente…" value={query} onChange={e => setQuery(e.target.value)} />
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            {filterCategories.map(c => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <button
            className="secondary"
            onClick={() =>
              setExpandedRecipes(
                paginatedRecipes.map(r => r.id)
              )
            }
          >
            Apri tutte
          </button>

          <button
            className="secondary"
            onClick={() =>
              setExpandedRecipes([])
            }
          >
            Chiudi tutte
          </button>
        </div>

        <div className="cards">

          {paginatedRecipes.map(r => (
            <article
              className={`recipe-card ${expandedRecipes.includes(r.id)
                ? "recipe-card-expanded"
                : "recipe-card-collapsed"
                }`}
              key={r.id}
            >
              <div
                className="recipe-cover"
                onClick={() => toggleRecipe(r.id)}
              >
                {r.imageUrl ? (
                  <img
                    src={r.imageUrl}
                    alt={r.title}
                    className="recipe-image"
                  />
                ) : (
                  <div className="recipe-placeholder">
                    🍽️
                  </div>
                )}

                <div className="recipe-cover-overlay">
                  <div>
                    <h3>{r.title}</h3>
                    <span>{r.category}</span>
                  </div>

                  <button
                    type="button"
                    className="recipe-open-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleRecipe(r.id);
                    }}
                  >
                    {expandedRecipes.includes(r.id)
                      ? "Chiudi"
                      : "Apri"}
                  </button>
                </div>
              </div>

              {expandedRecipes.includes(r.id) && (
                <div className="recipe-content">

                  {r.tags.length > 0 && (
                    <div className="tags">
                      {r.tags.map(tag => (
                        <span
                          className="tag"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="recipe-stats">

                    {r.totalTimeMinutes && (
                      <div>
                        <strong>
                          {r.totalTimeMinutes} min
                        </strong>

                        <span>
                          Tempo totale
                        </span>
                      </div>
                    )}

                    {r.servings && (
                      <div>
                        <strong>
                          {r.servings}
                        </strong>

                        <span>
                          Porzioni
                        </span>
                      </div>
                    )}

                    {r.nutrition?.calories && (
                      <div>
                        <strong>
                          {r.nutrition.calories} kcal
                        </strong>

                        <span>
                          Per porzione
                        </span>
                      </div>
                    )}

                  </div>
                  <h4>Ingredienti</h4>

                  <ul className="ingredients">
                    {r.ingredients.map((ingredient, index) => (
                      <li key={index}>
                        {ingredient}
                      </li>
                    ))}
                  </ul>

                  <h4>Procedimento</h4>

                  <ol className="steps">
                    {r.steps.map((step, index) => (
                      <li key={index}>
                        {step}
                      </li>
                    ))}
                  </ol>
                  {r.nutrition && (
                    <div className="nutrition-box">

                      <h4>
                        Valori nutrizionali
                      </h4>

                      <div className="small">
                        Per porzione
                        {r.nutrition.estimated
                          ? " • valori stimati"
                          : ""}
                      </div>

                      <div className="nutrition-values">

                        <div>
                          <strong>
                            {r.nutrition.calories ?? "-"}
                          </strong>
                          <span>kcal</span>
                        </div>

                        <div>
                          <strong>
                            {r.nutrition.protein ?? "-"} g
                          </strong>
                          <span>Proteine</span>
                        </div>

                        <div>
                          <strong>
                            {r.nutrition.carbs ?? "-"} g
                          </strong>
                          <span>Carboidrati</span>
                        </div>

                        <div>
                          <strong>
                            {r.nutrition.fat ?? "-"} g
                          </strong>
                          <span>Grassi</span>
                        </div>

                        <div>
                          <strong>
                            {r.nutrition.sugars ?? "-"} g
                          </strong>
                          <span>Zuccheri</span>
                        </div>

                        <div>
                          <strong>
                            {r.nutrition.fiber ?? "-"} g
                          </strong>
                          <span>Fibre</span>
                        </div>

                        <div>
                          <strong>
                            {r.nutrition.salt ?? "-"} g
                          </strong>
                          <span>Sale</span>
                        </div>

                      </div>

                    </div>
                  )}
                  {r.notes && (
                    <>
                      <h4>Note</h4>
                      <p>{r.notes}</p>
                    </>
                  )}

                  <div className="recipe-actions">

                    <button
                      className="secondary"
                      onClick={() =>
                        exportRecipePdf(r)
                      }
                    >
                      📄 PDF
                    </button>

                    {r.sourceUrl && (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="secondary"
                      >
                        Fonte
                      </a>
                    )}

                    <button
                      className="secondary"
                      onClick={() =>
                        removeRecipe(r.id)
                      }
                    >
                      Elimina
                    </button>

                  </div>
                </div>
              )}
            </article>
          ))}
          {!visible.length && <div className="small">Nessuna ricetta trovata.</div>}
        </div>
        {totalPages > 1 && (
          <div className="pagination">

            <button
              className="secondary"
              disabled={currentPage === 1}
              onClick={() =>
                setCurrentPage(currentPage - 1)
              }
            >
              ←
            </button>

            {Array.from(
              { length: totalPages },
              (_, index) => index + 1
            ).map(page => (
              <button
                key={page}
                className={
                  page === currentPage
                    ? "page-button page-button-active"
                    : "page-button"
                }
                onClick={() =>
                  setCurrentPage(page)
                }
              >
                {page}
              </button>
            ))}

            <button
              className="secondary"
              disabled={
                currentPage === totalPages
              }
              onClick={() =>
                setCurrentPage(currentPage + 1)
              }
            >
              →
            </button>

          </div>
        )}
      </section>
    </main>
  );
}
