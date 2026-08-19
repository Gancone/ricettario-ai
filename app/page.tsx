"use client";

import { useEffect, useMemo, useState } from "react";
import { BottomNav, type AppTab } from "@/components/BottomNav";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeDetail } from "@/components/RecipeDetail";
import { NewRecipe } from "@/components/NewRecipe";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ShoppingList, type ShoppingItem } from "@/components/ShoppingList";
import type { Category, Recipe } from "@/types/recipe";

const PAGE_SIZE = 20;

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<AppTab>("recipes");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tutte");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [shopping, setShoppingState] = useState<ShoppingItem[]>([]);

  useEffect(() => {
    Promise.all([fetch("/api/recipes"), fetch("/api/categories")])
      .then(async ([rr, cr]) => {
        const r = await rr.json();
        const c = await cr.json();
        if (!rr.ok) throw new Error(r.error || "Errore caricamento ricette");
        if (!cr.ok) throw new Error(c.error || "Errore caricamento categorie");
        setRecipes(r);
        setCategories(c);
      })
      .catch((e) => setLoadError(e?.message || "Non riesco a caricare il ricettario."))
      .finally(() => setLoading(false));

    try {
      const saved = localStorage.getItem("ricettario-shopping-v4");
      if (saved) setShoppingState(JSON.parse(saved));
    } catch {}

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  function setShopping(items: ShoppingItem[]) {
    setShoppingState(items);
    localStorage.setItem("ricettario-shopping-v4", JSON.stringify(items));
  }

  function addShopping(ingredients: string[], source: string) {
    const newItems = ingredients.map((text) => ({ id: crypto.randomUUID(), text, source, done: false }));
    setShopping([...shopping, ...newItems]);
    alert(`${ingredients.length} ingredienti aggiunti alla lista della spesa.`);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    return recipes.filter((r) => {
      const categoryMatch = category === "Tutte" || r.category === category;
      if (!categoryMatch) return false;
      if (!needle) return true;
      return [r.title, r.category, ...r.tags, ...r.ingredients].join(" ").toLocaleLowerCase("it").includes(needle);
    });
  }, [recipes, query, category]);

  useEffect(() => setPage(1), [query, category]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateRecipe(recipe: Recipe) {
    setRecipes((current) => current.map((r) => r.id === recipe.id ? recipe : r));
    setSelected((current) => current?.id === recipe.id ? recipe : current);
  }

  const activeLabel = category === "Tutte" ? "Tutte le ricette" : category;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => { setTab("recipes"); setCategory("Tutte"); }}>
          <span className="brand-mark">R</span>
          <span><strong>Ricettario</strong><small>la tua cucina, ordinata</small></span>
        </button>
        <nav className="desktop-nav">
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}>Ricette</button>
          <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}>Nuova</button>
          <button className={tab === "shopping" ? "active" : ""} onClick={() => setTab("shopping")}>Spesa {shopping.length ? <b>{shopping.filter((x) => !x.done).length}</b> : null}</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}>Impostazioni</button>
        </nav>
        <span className="version-top">v4</span>
      </header>

      <main className="main-content">
        {tab === "recipes" ? (
          <section className="page-section recipes-page">
            <div className="recipes-hero">
              <div>
                <span className="eyebrow">Il mio ricettario</span>
                <h1>{activeLabel}</h1>
                <p>{filtered.length} {filtered.length === 1 ? "ricetta" : "ricette"} · immagini, ingredienti e valori sempre a portata di mano.</p>
              </div>
              <button type="button" className="button primary desktop-new" onClick={() => setTab("new")}>+ Nuova ricetta</button>
            </div>

            <div className="search-wrap">
              <span className="search-icon">⌕</span>
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca ricetta, ingrediente o tag…" />
              {query ? <button type="button" className="clear-search" onClick={() => setQuery("")}>×</button> : null}
            </div>

            <div className="category-scroll" aria-label="Cataloghi">
              <button type="button" className={category === "Tutte" ? "category-chip active" : "category-chip"} onClick={() => setCategory("Tutte")}>Tutte <span>{recipes.length}</span></button>
              {categories.map((c) => {
                const count = recipes.filter((r) => r.category === c.name).length;
                return <button type="button" key={c.id} className={category === c.name ? "category-chip active" : "category-chip"} onClick={() => setCategory(c.name)}>{c.name} <span>{count}</span></button>;
              })}
            </div>

            {loading ? <div className="loading-grid"><div/><div/><div/><div/></div> : null}
            {loadError ? <div className="error-banner">{loadError}</div> : null}

            {!loading && !visible.length ? (
              <div className="surface empty-recipes"><div className="empty-icon">🍲</div><h2>Nessuna ricetta qui</h2><p>{query ? "Prova con un'altra ricerca." : "Importa la prima ricetta dal tuo video preferito."}</p><button className="button primary" onClick={() => setTab("new")}>Aggiungi ricetta</button></div>
            ) : (
              <div className="recipe-grid">
                {visible.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => setSelected(recipe)} />)}
              </div>
            )}

            {pages > 1 ? (
              <div className="pagination">
                <button type="button" className="page-arrow" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>‹</button>
                <div className="page-numbers">
                  {Array.from({ length: pages }, (_, i) => i + 1).map((p) => <button key={p} className={page === p ? "active" : ""} onClick={() => setPage(p)}>{p}</button>)}
                </div>
                <button type="button" className="page-arrow" disabled={page === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>›</button>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "new" ? <NewRecipe categories={categories} onSaved={(recipe) => { setRecipes((r) => [recipe, ...r]); setTab("recipes"); setCategory("Tutte"); setSelected(recipe); }} /> : null}
        {tab === "shopping" ? <ShoppingList items={shopping} setItems={setShopping} /> : null}
        {tab === "settings" ? <SettingsPanel categories={categories} setCategories={setCategories} recipes={recipes} /> : null}
      </main>

      <BottomNav tab={tab} onChange={setTab} />

      {selected ? (
        <RecipeDetail
          recipe={selected}
          categories={categories}
          onClose={() => setSelected(null)}
          onUpdated={updateRecipe}
          onDeleted={(id) => setRecipes((r) => r.filter((x) => x.id !== id))}
          onAddShopping={addShopping}
        />
      ) : null}
    </div>
  );
}
