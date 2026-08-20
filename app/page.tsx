"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, type AppTab } from "@/components/BottomNav";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeDetail } from "@/components/RecipeDetail";
import { NewRecipe } from "@/components/NewRecipe";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ShoppingList, type ShoppingItem } from "@/components/ShoppingList";
import { LoginScreen } from "@/components/LoginScreen";
import { Icon } from "@/components/Icon";
import { fallbackCategories } from "@/lib/categories";
import { mergeRecipes, readLocalRecipeSafetyCopy, writeLocalRecipeSafetyCopy } from "@/lib/local-cache";
import type { Category, Recipe } from "@/types/recipe";

const PAGE_SIZE = 20;
type SortMode = "newest" | "title" | "fastest" | "lightest";
type QuickFilter = "all" | "under30" | "under500" | "protein30";

function normalizeShoppingName(text: string) {
  return text.toLocaleLowerCase("it").replace(/^\s*[\d.,/½¼¾]+\s*(?:g|kg|ml|l|pz|pezzi|cucchiai?|cucchiaini?)?\s*/i, "").replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

function mergeShoppingItems(current: ShoppingItem[], ingredients: string[], source: string) {
  const next = [...current];
  for (const ingredient of ingredients) {
    const key = normalizeShoppingName(ingredient);
    const existing = next.find((x) => !x.done && normalizeShoppingName(x.text) === key && key.length > 2);
    if (existing) {
      if (!existing.source.includes(source)) existing.source = `${existing.source} · ${source}`;
      continue;
    }
    next.push({ id: crypto.randomUUID(), text: ingredient, source, done: false });
  }
  return next;
}

export default function Home() {
  const [authChecked, setAuthChecked] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [categories, setCategories] = useState<Category[]>(fallbackCategories());
  const [tab, setTab] = useState<AppTab>("recipes");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("Tutte");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [sort, setSort] = useState<SortMode>("newest");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [safetyMessage, setSafetyMessage] = useState("");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [shopping, setShoppingState] = useState<ShoppingItem[]>([]);
  const [shoppingSyncing, setShoppingSyncing] = useState(false);
  const [offline, setOffline] = useState(false);
  const shoppingReady = useRef(false);
  const shoppingTimer = useRef<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAuthenticated(Boolean(d.authenticated)))
      .catch(() => setAuthenticated(false))
      .finally(() => setAuthChecked(true));
  }, []);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    const local = readLocalRecipeSafetyCopy();
    if (local.length) {
      setRecipes(local);
      setSafetyMessage(`${local.length} ricette disponibili nella copia locale di sicurezza.`);
    }

    setLoading(true);
    Promise.all([
      fetch("/api/recipes", { cache: "no-store" }),
      fetch("/api/categories", { cache: "no-store" }),
      fetch("/api/state/shopping", { cache: "no-store" })
    ])
      .then(async ([rr, cr, sr]) => {
        if (rr.status === 401 || cr.status === 401) { setAuthenticated(false); return; }
        const serverRecipes = await rr.json();
        const serverCategories = await cr.json();
        const serverShopping = sr.ok ? await sr.json() : [];
        if (!rr.ok) throw new Error(serverRecipes.error || "Errore caricamento ricette");
        if (!cr.ok) throw new Error(serverCategories.error || "Errore caricamento categorie");
        if (cancelled) return;

        const merged = mergeRecipes(serverRecipes, local);
        setCategories(Array.isArray(serverCategories) && serverCategories.length ? serverCategories : fallbackCategories());
        setRecipes(merged);
        writeLocalRecipeSafetyCopy(merged);
        if (Array.isArray(serverShopping)) setShoppingState(serverShopping);
        shoppingReady.current = true;
        setOffline(false);

        if (merged.length > serverRecipes.length) {
          setSafetyMessage("Ho trovato ricette nella copia locale: le sto risincronizzando su Supabase…");
          fetch("/api/recipes/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipes: merged }) })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
              if (!ok || !Array.isArray(data.recipes)) return;
              setRecipes(data.recipes); writeLocalRecipeSafetyCopy(data.recipes);
              setSafetyMessage(`Fortress attiva · ${data.recipes.length} ricette sincronizzate e protette.`);
            }).catch(() => {});
        } else {
          setSafetyMessage(serverRecipes.length ? "Fortress attiva · Supabase + copia locale + backup automatici." : "Ricettario vuoto: i nuovi salvataggi saranno protetti automaticamente.");
        }
      })
      .catch((e) => {
        setLoadError(e?.message || "Non riesco a contattare Supabase.");
        setOffline(true);
        if (local.length) setSafetyMessage("Modalità offline · sto mostrando l'ultima copia locale senza cancellare nulla.");
        try {
          const saved = localStorage.getItem("ricettario-shopping-v6") || localStorage.getItem("ricettario-shopping-v5");
          if (saved) setShoppingState(JSON.parse(saved));
        } catch {}
        shoppingReady.current = true;
      })
      .finally(() => setLoading(false));

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => { cancelled = true; };
  }, [authenticated]);

  useEffect(() => {
    if (!recipes.length) return;
    writeLocalRecipeSafetyCopy(recipes);
  }, [recipes]);

  function setShopping(items: ShoppingItem[]) {
    setShoppingState(items);
    try { localStorage.setItem("ricettario-shopping-v6", JSON.stringify(items)); } catch {}
    if (!shoppingReady.current || !authenticated) return;
    if (shoppingTimer.current) window.clearTimeout(shoppingTimer.current);
    setShoppingSyncing(true);
    shoppingTimer.current = window.setTimeout(async () => {
      try {
        await fetch("/api/state/shopping", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ items }) });
      } finally { setShoppingSyncing(false); }
    }, 450);
  }

  function addShopping(ingredients: string[], source: string) {
    setShopping(mergeShoppingItems(shopping, ingredients, source));
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("it");
    const list = recipes.filter((r) => {
      if (category === "Preferite" && (!r.favorite || r.archived)) return false;
      if (category === "Archiviate" && !r.archived) return false;
      if (category !== "Tutte" && category !== "Preferite" && category !== "Archiviate" && (r.category !== category || r.archived)) return false;
      if (category === "Tutte" && r.archived) return false;
      if (quickFilter === "under30" && (!r.totalTimeMinutes || r.totalTimeMinutes > 30)) return false;
      if (quickFilter === "under500" && (r.nutrition?.calories === undefined || r.nutrition.calories > 500)) return false;
      if (quickFilter === "protein30" && (r.nutrition?.protein === undefined || r.nutrition.protein < 30)) return false;
      if (!needle) return true;
      return [r.title, r.category, ...r.tags, ...r.ingredients, ...r.steps, r.sourceNotes || "", r.notes || ""].join(" ").toLocaleLowerCase("it").includes(needle);
    });

    return [...list].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title, "it");
      if (sort === "fastest") return (a.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER) - (b.totalTimeMinutes ?? Number.MAX_SAFE_INTEGER);
      if (sort === "lightest") return (a.nutrition?.calories ?? Number.MAX_SAFE_INTEGER) - (b.nutrition?.calories ?? Number.MAX_SAFE_INTEGER);
      return (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0);
    });
  }, [recipes, query, category, sort, quickFilter]);

  useEffect(() => setPage(1), [query, category, sort, quickFilter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateRecipe(recipe: Recipe) {
    setRecipes((current) => current.map((r) => r.id === recipe.id ? recipe : r));
    setSelected((current) => current?.id === recipe.id ? recipe : current);
  }

  async function toggleFavorite(recipe: Recipe) {
    const updated = { ...recipe, favorite: !recipe.favorite };
    updateRecipe(updated);
    try {
      const r = await fetch(`/api/recipes/${recipe.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(updated) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Modifica non riuscita");
      updateRecipe(d);
    } catch { updateRecipe(recipe); }
  }

  function addCategoryToState(c: Category) {
    setCategories((current) => [...current.filter((x) => x.name !== c.name), c].sort((a, b) => a.name.localeCompare(b.name, "it")));
  }

  const activeLabel = category === "Tutte" ? "Le mie ricette" : category;
  const shoppingRemaining = shopping.filter((x) => !x.done).length;

  if (!authChecked) return <div className="boot-screen"><span className="brand-mark"><Icon name="book" size={24} /></span><strong>Ricettario</strong></div>;
  if (!authenticated) return <LoginScreen onAuthenticated={() => setAuthenticated(true)} />;

  return (
    <div className="app-shell">
      <header className="topbar">
        <button type="button" className="brand" onClick={() => { setTab("recipes"); setCategory("Tutte"); }}><span className="brand-mark"><Icon name="book" size={21} /></span><span><strong>Ricettario</strong><small>personale & protetto</small></span></button>
        <nav className="desktop-nav">
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}><Icon name="book" size={16} />Ricette</button>
          <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}><Icon name="plus" size={16} />Nuova</button>
          <button className={tab === "shopping" ? "active" : ""} onClick={() => setTab("shopping")}><Icon name="bag" size={16} />Spesa {shoppingRemaining ? <b>{shoppingRemaining}</b> : null}</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Icon name="settings" size={16} />Altro</button>
        </nav>
        <span className="version-top">v6</span>
      </header>

      <main className="main-content">
        {tab === "recipes" ? <section className="page-section recipes-page">
          <div className="recipes-hero"><div><span className="eyebrow">Ricettario personale</span><h1>{activeLabel}</h1><p>{filtered.length} {filtered.length === 1 ? "ricetta" : "ricette"} · ricerca, filtri e backup sempre disponibili.</p></div><button type="button" className="button primary desktop-new" onClick={() => setTab("new")}><Icon name="plus" size={18} /> Nuova ricetta</button></div>
          <div className={offline ? "safety-ribbon offline" : "safety-ribbon"}><Icon name={offline ? "cloud" : "shield"} size={15} /><span>{safetyMessage || "Protezione dati attiva"}</span></div>

          <div className="recipes-toolbar"><div className="search-wrap"><Icon name="search" size={19} className="search-icon" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca titolo, ingrediente, procedimento o note…" />{query ? <button type="button" className="clear-search" onClick={() => setQuery("")}><Icon name="close" size={16} /></button> : null}</div><select className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}><option value="newest">Più recenti</option><option value="title">A–Z</option><option value="fastest">Più veloci</option><option value="lightest">Meno calorie</option></select></div>

          <div className="category-scroll" aria-label="Cataloghi">
            <button type="button" className={category === "Tutte" ? "category-chip active" : "category-chip"} onClick={() => setCategory("Tutte")}>Tutte <span>{recipes.filter((r) => !r.archived).length}</span></button>
            <button type="button" className={category === "Preferite" ? "category-chip active special" : "category-chip special"} onClick={() => setCategory("Preferite")}><Icon name="heart" size={12} /> Preferite <span>{recipes.filter((r) => r.favorite && !r.archived).length}</span></button>
            {categories.map((c) => { const count = recipes.filter((r) => r.category === c.name && !r.archived).length; return <button type="button" key={`${c.id}-${c.name}`} className={category === c.name ? "category-chip active" : "category-chip"} onClick={() => setCategory(c.name)}>{c.name} <span>{count}</span></button>; })}
            <button type="button" className={category === "Archiviate" ? "category-chip active archive-chip" : "category-chip archive-chip"} onClick={() => setCategory("Archiviate")}><Icon name="archive" size={12} /> Archiviate <span>{recipes.filter((r) => r.archived).length}</span></button>
          </div>

          <div className="quick-filters"><button className={quickFilter === "all" ? "active" : ""} onClick={() => setQuickFilter("all")}>Tutte</button><button className={quickFilter === "under30" ? "active" : ""} onClick={() => setQuickFilter("under30")}>≤ 30 min</button><button className={quickFilter === "under500" ? "active" : ""} onClick={() => setQuickFilter("under500")}>≤ 500 kcal</button><button className={quickFilter === "protein30" ? "active" : ""} onClick={() => setQuickFilter("protein30")}>≥ 30 g proteine</button></div>

          {loading && !recipes.length ? <div className="loading-grid"><div/><div/><div/><div/></div> : null}
          {loadError ? <div className="warning-banner"><Icon name="cloud" size={17} /><span>{loadError} Le copie locali non vengono cancellate.</span></div> : null}
          {!loading && !visible.length ? <div className="surface empty-recipes"><div className="empty-icon"><Icon name="book" size={32} /></div><h2>Nessuna ricetta qui</h2><p>{query || quickFilter !== "all" ? "Prova a rimuovere un filtro." : category === "Archiviate" ? "Non hai ricette archiviate." : "Aggiungi una ricetta: verrà salvata su Supabase con backup automatico."}</p>{category !== "Archiviate" ? <button className="button primary" onClick={() => setTab("new")}><Icon name="plus" size={17} />Aggiungi ricetta</button> : null}</div> : <div className="recipe-grid">{visible.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => setSelected(recipe)} onToggleFavorite={() => toggleFavorite(recipe)} onImageUpdated={(imageUrl) => updateRecipe({ ...recipe, imageUrl })} />)}</div>}
          {pages > 1 ? <div className="pagination"><button type="button" className="page-arrow" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><Icon name="arrowLeft" size={18} /></button><span className="page-indicator">Pagina <b>{page}</b> di {pages}</span><button type="button" className="page-arrow" disabled={page === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}><Icon name="arrowRight" size={18} /></button></div> : null}
        </section> : null}

        {tab === "new" ? <NewRecipe categories={categories} onCategoryAdded={addCategoryToState} onDuplicate={(recipe) => { setSelected(recipe); setTab("recipes"); }} onSaved={(recipe) => { const next = [recipe, ...recipes.filter((x) => x.id !== recipe.id)]; setRecipes(next); writeLocalRecipeSafetyCopy(next); setTab("recipes"); setCategory("Tutte"); setSelected(recipe); }} /> : null}
        {tab === "shopping" ? <ShoppingList items={shopping} setItems={setShopping} syncing={shoppingSyncing} /> : null}
        {tab === "settings" ? <SettingsPanel categories={categories} setCategories={setCategories} recipes={recipes} onLogout={() => { setAuthenticated(false); setRecipes([]); }} onImagesRepaired={(updates) => setRecipes((current) => current.map((recipe) => { const hit = updates.find((x) => x.id === recipe.id); return hit ? { ...recipe, imageUrl: hit.imageUrl } : recipe; }))} /> : null}
      </main>

      <BottomNav tab={tab} onChange={setTab} shoppingCount={shoppingRemaining} />
      {selected ? <RecipeDetail recipe={selected} categories={categories} onClose={() => setSelected(null)} onUpdated={updateRecipe} onAddShopping={addShopping} /> : null}
    </div>
  );
}
