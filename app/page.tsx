"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { BottomNav, type AppTab } from "@/components/BottomNav";
import { RecipeCard } from "@/components/RecipeCard";
import { RecipeDetail } from "@/components/RecipeDetail";
import { NewRecipe } from "@/components/NewRecipe";
import { SettingsPanel } from "@/components/SettingsPanel";
import { ShoppingList } from "@/components/ShoppingList";
import { LoginScreen } from "@/components/LoginScreen";
import { Icon } from "@/components/Icon";
import { fallbackCategories } from "@/lib/categories";
import { mergeRecipes, readLocalRecipeSafetyCopy, writeLocalRecipeSafetyCopy } from "@/lib/local-cache";
import type { Category, Recipe } from "@/types/recipe";
import { api, ApiError } from "@/lib/api-client";
import { createRecipeId } from "@/lib/recipe-id";
import { addIngredients } from "@/lib/shopping";
import { matchesSearch } from "@/lib/cooking";
import { useShopping } from "@/components/useShopping";

const PAGE_SIZE = 20;
type SortMode = "newest" | "title" | "fastest" | "lightest";
type QuickFilter = "all" | "under30" | "under500" | "protein30";

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
  const [offline, setOffline] = useState(false);
  const [reload, setReload] = useState(0);
  const [notice, setNotice] = useState("");
  const favoritePending = useRef(new Set<string>());
  const { items: shopping, update: setShopping, status: shoppingStatus, retry: retryShopping } = useShopping(authenticated);

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
    setLoadError("");
    api<Category[]>("/api/categories").then((data) => {
      if (!cancelled && Array.isArray(data) && data.length) setCategories(data);
    }).catch(() => {});
    api<Recipe[]>("/api/recipes")
      .then((serverRecipes) => {
        if (cancelled) return;
        if (!Array.isArray(serverRecipes)) throw new Error("Risposta del ricettario non valida.");
        const merged = mergeRecipes(serverRecipes, local);
        setRecipes(merged);
        writeLocalRecipeSafetyCopy(merged);
        setOffline(false);

        if (merged.length > serverRecipes.length) {
          setSafetyMessage("Ho trovato ricette nella copia locale: le sto risincronizzando su Supabase…");
          fetch("/api/recipes/recover", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ recipes: merged }) })
            .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
            .then(({ ok, data }) => {
              if (cancelled || !ok || !Array.isArray(data.recipes)) return;
              setRecipes(data.recipes); writeLocalRecipeSafetyCopy(data.recipes);
              setSafetyMessage(`Fortress attiva · ${data.recipes.length} ricette sincronizzate e protette.`);
            }).catch(() => {});
        } else {
          setSafetyMessage(serverRecipes.length ? "Fortress attiva · Supabase + copia locale + backup automatici." : "Ricettario vuoto: i nuovi salvataggi saranno protetti automaticamente.");
        }
      })
      .catch((e) => {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) { setAuthenticated(false); return; }
        setLoadError(e?.message || "Non riesco a contattare Supabase.");
        setOffline(true);
        if (local.length) setSafetyMessage("Modalità offline · sto mostrando l'ultima copia locale senza cancellare nulla.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => { cancelled = true; };
  }, [authenticated, reload]);

  useEffect(() => {
    if (!recipes.length) return;
    writeLocalRecipeSafetyCopy(recipes);
  }, [recipes]);

  function addShopping(ingredients: string[], source: string) {
    setShopping(addIngredients(shopping, ingredients, source, createRecipeId));
    setNotice("Ingredienti aggiunti alla lista della spesa.");
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
      return matchesSearch([r.title, r.category, ...r.tags, ...r.ingredients, ...r.steps, r.sourceNotes || "", r.notes || ""].join(" "), needle);
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
  useEffect(() => setPage((current) => Math.min(current, pages)), [pages]);
  const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateRecipe(recipe: Recipe) {
    setRecipes((current) => current.map((r) => r.id === recipe.id ? recipe : r));
    setSelected((current) => current?.id === recipe.id ? recipe : current);
  }

  async function toggleFavorite(recipe: Recipe) {
    if (favoritePending.current.has(recipe.id)) return;
    favoritePending.current.add(recipe.id);
    const updated = { ...recipe, favorite: !recipe.favorite };
    try {
      const r = await fetch(`/api/recipes/${recipe.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...updated, expectedRevision: recipe.revision ?? 1 }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Modifica non riuscita");
      updateRecipe(d);
    } catch { setNotice("Preferito non aggiornato. Controlla la connessione e riprova."); }
    finally { favoritePending.current.delete(recipe.id); }
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
        <nav className="desktop-nav" aria-label="Navigazione principale">
          <button className={tab === "recipes" ? "active" : ""} onClick={() => setTab("recipes")}><Icon name="book" size={16} />Ricette</button>
          <button className={tab === "new" ? "active" : ""} onClick={() => setTab("new")}><Icon name="plus" size={16} />Nuova</button>
          <button className={tab === "shopping" ? "active" : ""} onClick={() => setTab("shopping")}><Icon name="bag" size={16} />Spesa {shoppingRemaining ? <b>{shoppingRemaining}</b> : null}</button>
          <button className={tab === "settings" ? "active" : ""} onClick={() => setTab("settings")}><Icon name="settings" size={16} />Altro</button>
        </nav>
        <span className="version-top">v6.2</span>
      </header>

      <main className="main-content">
        {notice ? <div className="app-notice" role="status"><span>{notice}</span><button aria-label="Chiudi messaggio" onClick={() => setNotice("")}><Icon name="close" size={16} /></button></div> : null}
        {tab === "recipes" ? <section className="page-section recipes-page">
          <div className="recipes-hero"><div><span className="eyebrow">La tua cucina, ogni giorno</span><h1>{activeLabel}</h1><p>Ritrova un sapore. Scegli cosa cucinare.</p></div><button type="button" className="button primary desktop-new" onClick={() => setTab("new")}><Icon name="plus" size={18} /> Nuova ricetta</button></div>
          <div className="collection-summary"><span><strong>{recipes.filter((r) => !r.archived).length}</strong> ricette</span><span><strong>{recipes.filter((r) => r.favorite && !r.archived).length}</strong> preferite</span><span><strong>{recipes.filter((r) => !r.archived && r.totalTimeMinutes != null && r.totalTimeMinutes <= 30).length}</strong> pronte in 30 min</span></div>
          <div className={offline ? "safety-ribbon offline" : "safety-ribbon"}><Icon name={offline ? "cloud" : "shield"} size={15} /><span>{safetyMessage || "Protezione dati attiva"}</span></div>

          <div className="recipes-toolbar"><div className="search-wrap"><Icon name="search" size={19} className="search-icon" /><input aria-label="Cerca ricette" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Cerca titolo, ingrediente, procedimento o note…" />{query ? <button type="button" className="clear-search" aria-label="Cancella ricerca" onClick={() => setQuery("")}><Icon name="close" size={16} /></button> : null}</div><select aria-label="Ordina ricette" className="sort-select" value={sort} onChange={(e) => setSort(e.target.value as SortMode)}><option value="newest">Più recenti</option><option value="title">A–Z</option><option value="fastest">Più veloci</option><option value="lightest">Meno calorie</option></select></div>

          <div className="category-scroll" aria-label="Cataloghi">
            <button type="button" className={category === "Tutte" ? "category-chip active" : "category-chip"} onClick={() => setCategory("Tutte")}>Tutte <span>{recipes.filter((r) => !r.archived).length}</span></button>
            <button type="button" className={category === "Preferite" ? "category-chip active special" : "category-chip special"} onClick={() => setCategory("Preferite")}><Icon name="heart" size={12} /> Preferite <span>{recipes.filter((r) => r.favorite && !r.archived).length}</span></button>
            {categories.map((c) => { const count = recipes.filter((r) => r.category === c.name && !r.archived).length; return <button type="button" key={`${c.id}-${c.name}`} className={category === c.name ? "category-chip active" : "category-chip"} onClick={() => setCategory(c.name)}>{c.name} <span>{count}</span></button>; })}
            <button type="button" className={category === "Archiviate" ? "category-chip active archive-chip" : "category-chip archive-chip"} onClick={() => setCategory("Archiviate")}><Icon name="archive" size={12} /> Archiviate <span>{recipes.filter((r) => r.archived).length}</span></button>
          </div>

          <div className="quick-filters"><button className={quickFilter === "all" ? "active" : ""} onClick={() => setQuickFilter("all")}>Tutte</button><button className={quickFilter === "under30" ? "active" : ""} onClick={() => setQuickFilter("under30")}>≤ 30 min</button><button className={quickFilter === "under500" ? "active" : ""} onClick={() => setQuickFilter("under500")}>≤ 500 kcal</button><button className={quickFilter === "protein30" ? "active" : ""} onClick={() => setQuickFilter("protein30")}>≥ 30 g proteine</button></div>

          {loading && !recipes.length ? <div className="loading-grid"><div/><div/><div/><div/></div> : null}
          {loadError ? <div className="warning-banner" role="alert"><Icon name="cloud" size={17} /><span>{loadError}</span><button className="button soft" disabled={loading} onClick={() => setReload((n) => n + 1)}>Riprova</button></div> : null}
          {(query || quickFilter !== "all" || category !== "Tutte") ? <div className="results-bar"><span>{filtered.length} risultati</span><button onClick={() => { setQuery(""); setQuickFilter("all"); setCategory("Tutte"); }}>Azzera filtri</button></div> : null}
          {!loading && !visible.length ? <div className="surface empty-recipes"><div className="empty-icon"><Icon name="book" size={32} /></div><h2>Nessuna ricetta qui</h2><p>{query || quickFilter !== "all" ? "Prova a rimuovere un filtro." : category === "Archiviate" ? "Non hai ricette archiviate." : "Aggiungi una ricetta: verrà salvata su Supabase con backup automatico."}</p>{category !== "Archiviate" ? <button className="button primary" onClick={() => setTab("new")}><Icon name="plus" size={17} />Aggiungi ricetta</button> : null}</div> : <div className="recipe-grid">{visible.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={() => setSelected(recipe)} onToggleFavorite={() => toggleFavorite(recipe)} onImageUpdated={(imageUrl) => updateRecipe({ ...recipe, imageUrl })} />)}</div>}
          {pages > 1 ? <div className="pagination"><button type="button" className="page-arrow" aria-label="Pagina precedente" disabled={page === 1} onClick={() => setPage((p) => Math.max(1, p - 1))}><Icon name="arrowLeft" size={18} /></button><span className="page-indicator">Pagina <b>{page}</b> di {pages}</span><button type="button" className="page-arrow" aria-label="Pagina successiva" disabled={page === pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}><Icon name="arrowRight" size={18} /></button></div> : null}
        </section> : null}

        <div hidden={tab !== "new"}><NewRecipe categories={categories} onCategoryAdded={addCategoryToState} onDuplicate={(recipe) => { setSelected(recipe); setTab("recipes"); }} onSaved={(recipe) => { const next = [recipe, ...recipes.filter((x) => x.id !== recipe.id)]; setRecipes(next); writeLocalRecipeSafetyCopy(next); setTab("recipes"); setCategory("Tutte"); setQuery(""); setQuickFilter("all"); setPage(1); setNotice((recipe as Recipe & { backupWarning?: string }).backupWarning ? "Ricetta salvata. Il backup automatico non è riuscito: riprova da Impostazioni." : "Ricetta salvata nel tuo ricettario."); setSelected(recipe); }} /></div>
        {tab === "shopping" ? <ShoppingList items={shopping} setItems={setShopping} syncStatus={shoppingStatus} onRetry={retryShopping} /> : null}
        {tab === "settings" ? <SettingsPanel categories={categories} setCategories={setCategories} recipes={recipes} onLogout={() => { setAuthenticated(false); setRecipes([]); }} onImagesRepaired={(updates) => setRecipes((current) => current.map((recipe) => { const hit = updates.find((x) => x.id === recipe.id); return hit ? { ...recipe, imageUrl: hit.imageUrl } : recipe; }))} /> : null}
      </main>

      <BottomNav tab={tab} onChange={setTab} shoppingCount={shoppingRemaining} />
      {selected ? <RecipeDetail key={selected.id} recipe={selected} categories={categories} onClose={() => setSelected(null)} onUpdated={updateRecipe} onAddShopping={addShopping} /> : null}
    </div>
  );
}
