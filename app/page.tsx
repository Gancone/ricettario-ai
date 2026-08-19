"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, type AppTab } from "@/components/BottomNav";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeDetail } from "@/components/RecipeDetail";
import { NewRecipe } from "@/components/NewRecipe";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ShoppingList, type ShoppingItem } from "@/components/ShoppingList";
import { Icon } from "@/components/Icon";
import { mergeRecipes, readLocalRecipeSafetyCopy, writeLocalRecipeSafetyCopy } from "@/lib/local-cache";
import type { Category, Recipe } from "@/types/recipe";

const PAGE_SIZE = 20;
type SortMode = "newest" | "title" | "fastest" | "lightest";

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tab, setTab] = useState<AppTab>("recipes");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tutte");
  const [sort, setSort] = useState<SortMode>("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [safetyMessage, setSafetyMessage] = useState("");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [shopping, setShoppingState] = useState<ShoppingItem[]>([]);
  const imageRepairStarted = useRef(false);

  useEffect(() => {
    const local = readLocalRecipeSafetyCopy();
    if (local.length) {
      setRecipes(local);
      setSafetyMessage(`${local.length} ricette disponibili nella copia di sicurezza locale.`);
    }

    Promise.all([
      fetch("/api/recipes", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" })
    ])
      .then(async ([rr, cr]) => {
        const serverRecipes = await rr.json();
        const serverCategories = await cr.json();
        if (!rr.ok) throw new Error(serverRecipes.error || "Errore caricamento ricette");
        if (!cr.ok) throw new Error(serverCategories.error || "Errore caricamento categorie");

        const merged = mergeRecipes(serverRecipes, local);
        setCategories(serverCategories);
        setRecipes(merged);
        writeLocalRecipeSafetyCopy(merged);

        if (merged.length > serverRecipes.length) {
          setSafetyMessage("Ho trovato ricette nella copia locale e le sto rimettendo al sicuro su Supabase…");
          fetch("/api/recipes/recover", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ recipes: merged })
          })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
              if (!ok || !Array.isArray(data.recipes)) return;
              setRecipes(data.recipes);
              writeLocalRecipeSafetyCopy(data.recipes);
              setSafetyMessage(`Protezione dati attiva · ${data.recipes.length} ricette sincronizzate.`);
            })
            .catch(() => {});
        } else {
          setSafetyMessage(serverRecipes.length ? "Protezione dati attiva · Supabase + copia locale + backup automatici." : "Ricettario vuoto: i nuovi salvataggi saranno protetti automaticamente.");
        }
      })
      .catch((e) => {
        setLoadError(e?.message || "Non riesco a contattare Supabase.");
        if (local.length) setSafetyMessage("Supabase non è raggiungibile: sto mostrando la copia locale senza cancellare nulla.");
      })
      .finally(() => setLoading(false));

    try {
      const saved = localStorage.getItem("ricettario-shopping-v5") || localStorage.getItem("ricettario-shopping-v4");
      if (saved) setShoppingState(JSON.parse(saved));
    } catch {}

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!recipes.length) return;
    writeLocalRecipeSafetyCopy(recipes);
  }, [recipes]);

  useEffect(() => {
    if (loading || imageRepairStarted.current) return;
    if (!recipes.some((r) => r.sourceUrl && !r.imageUrl?.includes("/storage/v1/object/public/recipe-images/"))) return;
    imageRepairStarted.current = true;

    fetch("/api/recipes/images/repair", { method: "POST" })
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || !Array.isArray(data.updated) || !data.updated.length) return;
        setRecipes((current) => current.map((recipe) => {
          const hit = data.updated.find((x: any) => x.id === recipe.id);
          return hit ? { ...recipe, imageUrl: hit.imageUrl } : recipe;
        }));
      })
      .catch(() => {});
  }, [loading, recipes]);

  function setShopping(items: ShoppingItem[]) {
    setShoppingState(items);
    localStorage.setItem("ricettario-shopping-v5", JSON.stringify(items));
  }

  function addShopping(ingredients: string[], source: string) {
    const newItems = ingredients.map((text) => ({ id: crypto.randomUUID(), text, source, done: false }));
    setShopping([...shopping, ...newItems]);
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    const list = recipes.filter((r) => {
      const categoryMatch = category === "Tutte" || r.category === category;
      if (!categoryMatch) return false;
      if (!needle) return true;
      return [r.title, r.category, ...r.tags, ...r.ingredients].join(" ").toLocaleLowerCase("it").includes(needle);
    });

    return [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "it");
      if (sort === "fastest") return (a.totalTimeMinutes || Number.MAX_SAFE_INTEGER) - (b.totalTimeMinutes || Number.MAX_SAFE_INTEGER);
      if (sort === "lightest") return (a.nutrition?.calories || Number.MAX_SAFE_INTEGER) - (b.nutrition?.calories || Number.MAX_SAFE_INTEGER);
      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
  }, [recipes, query, category, sort]);

  useEffect(() => setPage(1), [query, category, sort]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateRecipe(recipe: Recipe) {
    setRecipes((current) => current.map((r) => r.id === recipe.id ? recipe : r));
    setSelected((current) => current?.id === recipe.id ? recipe : current);
  }

  const activeLabel = category === "Tutte" ? "Le mie ricette" : category;
  const shoppingRemaining = shopping.filter((x) => !x.done).length;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => { setTab("recipes"); setCategory("Tutte"); }}>
          <span className="brand-mark"><Icon name="book" size={21} /></span>
          <span><strong>Ricettario</strong><small>personale & protetto</small></span>
        </button>
        <nav className="desktop-nav">
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}><Icon name="book" size={16} />Ricette</button>
          <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}><Icon name="plus" size={16} />Nuova</button>
          <button className={tab === "shopping" ? "active" : ""} onClick={() => setTab("shopping")}><Icon name="bag" size={16} />Spesa {shoppingRemaining ? <b>{shoppingRemaining}</b> : null}</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Icon name="settings" size={16} />Altro</button>
        </nav>
        <span className="version-top">v5</span>
      </header>

      <main className="main-content">
        {tab === "recipes" ? (
          <section className="page-section recipes-page">
            <div className="recipes-hero">
              <div>
                <span className="eyebrow">Ricettario personale</span>
                <h1>{activeLabel}</h1>
                <p>{filtered.length} {filtered.length === 1 ? "ricetta" : "ricette"} · tutto ordinato, sincronizzato e protetto.</p>
              </div>
              <button type="button" className="button primary desktop-new" onClick={() => setTab("new")}><Icon name="plus" size={18} /> Nuova ricetta</button>
            </div>

            <div className="safety-ribbon"><Icon name="shield" size={15} /><span>{safetyMessage || "Protezione dati attiva"}</span></div>

            <div className="recipes-toolbar">
              <div className="search-wrap">
                <Icon name="search" size={19} className="search-icon" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca ricetta o ingrediente…" />
                {query ? <button type="button" className="clear-search" onClick={() => setQuery("")} aria-label="Pulisci ricerca"><Icon name="close" size={16} /></button> : null}
              </div>
              <select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)} aria-label="Ordina ricette">
                <option value="newest">Più recenti</option>
                <option value="title">A–Z</option>
                <option value="fastest">Più veloci</option>
                <option value="lightest">Meno calorie</option>
              </select>
            </div>

            <div className="category-scroll" aria-label="Cataloghi">
              <button type="button" className={category === "Tutte" ? "category-chip active" : "category-chip"} onClick={() => setCategory("Tutte")}>Tutte <span>{recipes.length}</span></button>
              {categories.map((c) => {
                const count = recipes.filter((r) => r.category === c.name).length;
                return <button type="button" key={c.id} className={category === c.name ? "category-chip active" : "category-chip"} onClick={() => setCategory(c.name)}>{c.name} <span>{count}</span></button>;
              })}
            </div>

            {loading && !recipes.length ? <div className="loading-grid"><div/><div/><div/><div/></div> : null}
            {loadError ? <div className="warning-banner"><Icon name="cloud" size={17} /><span>{loadError} Le copie di sicurezza non vengono cancellate.</span></div> : null}

            {!loading && !visible.length ? (
              <div className="surface empty-recipes"><div className="empty-icon"><Icon name="book" size={32} /></div><h2>Nessuna ricetta qui</h2><p>{query ? "Prova con un'altra ricerca o catalogo." : "Aggiungi la prima ricetta e verrà salvata con backup automatico."}</p><button className="button primary" onClick={() => setTab("new")}><Icon name="plus" size={17} />Aggiungi ricetta</button></div>
            ) : (
              <div className="recipe-grid">
                {visible.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                    onOpen={() => setSelected(recipe)}
                    onImageUpdated={(imageUrl) => updateRecipe({ ...recipe, imageUrl })}
                  />
                ))}
              </div>
            )}

            {pages > 1 ? (
              <div className="pagination">
                <button type="button" className="page-arrow" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><Icon name="arrowLeft" size={18} /></button>
                <span className="page-indicator">Pagina <b>{page}</b> di {pages}</span>
                <button type="button" className="page-arrow" disabled={page === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}><Icon name="arrowRight" size={18} /></button>
              </div>
            ) : null}
          </section>
        ) : null}

        {tab === "new" ? <NewRecipe categories={categories} onSaved={(recipe) => { const next = [recipe, ...recipes.filter((x) => x.id !== recipe.id)]; setRecipes(next); writeLocalRecipeSafetyCopy(next); setTab("recipes"); setCategory("Tutte"); setSelected(recipe); }} /> : null}
        {tab === "shopping" ? <ShoppingList items={shopping} setItems={setShopping} /> : null}
        {tab === "settings" ? <SettingsPanel categories={categories} setCategories={setCategories} recipes={recipes} /> : null}
      </main>

      <BottomNav tab={tab} onChange={setTab} shoppingCount={shoppingRemaining} />

      {selected ? (
        <RecipeDetail
          recipe={selected}
          categories={categories}
          onClose={() => setSelected(null)}
          onUpdated={updateRecipe}
          onAddShopping={addShopping}
        />
      ) : null}
    </div>
  );
}
