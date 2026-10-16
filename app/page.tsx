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
import { BrandLogo } from "@/components/BrandLogo";
import { KitchenPanel, type MoreSection } from "@/components/KitchenPanel";
import { useKitchen } from "@/components/useKitchen";
import {
  useCookingTimers,
  CookingTimerTray,
} from "@/components/useCookingTimers";
import { useShopping } from "@/components/useShopping";
import { fallbackCategories } from "@/lib/categories";
import {
  mergeRecipes,
  readRecipeCache,
  writeLocalRecipeSafetyCopy,
} from "@/lib/local-cache";
import { api, ApiError, jsonBody } from "@/lib/api-client";
import { FILTERS, SORTS, filterGallery } from "@/lib/gallery";
import { aggregateShopping, shoppingFromText } from "@/lib/smart-shopping";
import {
  plannedIngredients,
  pantryCoverage,
  type MealEntry,
} from "@/lib/kitchen";
import { createRecipeId } from "@/lib/recipe-id";
import type { Recipe, Category } from "@/types/recipe";
const PAGE_SIZE = 20;
type Gallery = {
  items: Recipe[];
  total: number;
  summary: {
    recipes: number;
    favorites: number;
    categories: Record<string, number>;
  };
};
export default function Home() {
  const [authChecked, setAuthChecked] = useState(false),
    [authenticated, setAuthenticated] = useState(false),
    [recipes, setRecipes] = useState<Recipe[]>([]),
    [index, setIndex] = useState<Recipe[]>([]),
    [categories, setCategories] = useState<Category[]>(fallbackCategories()),
    [tab, setTab] = useState<AppTab>("recipes"),
    [section, setSection] = useState<MoreSection>("planner");
  const [query, setQuery] = useState(""),
    [category, setCategory] = useState("Tutte"),
    [filter, setFilter] = useState("all"),
    [sort, setSort] = useState("newest"),
    [page, setPage] = useState(1),
    [view, setView] = useState("grid"),
    [loading, setLoading] = useState(true),
    [offline, setOffline] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [selected, setSelected] = useState<Recipe | null>(null),
    [reload, setReload] = useState(0),
    [gallery, setGallery] = useState<Gallery | null>(null),
    [legacy, setLegacy] = useState(false);
  const favorites = useRef(new Set<string>()),
    cached = useRef<Recipe[]>([]),
    hydrated = useRef(false);
  const kitchen = useKitchen(authenticated),
    timers = useCookingTimers(),
    shopping = useShopping(authenticated);
  const remember = (rows: Recipe[]) => {
    setRecipes((current) => {
      const next = mergeRecipes(rows, current);
      cached.current = next;
      return next;
    });
  };
  useEffect(() => {
    try {
      const theme = localStorage.getItem("ricettario-theme") || "system";
      document.documentElement.dataset.theme = [
        "system",
        "light",
        "dark",
      ].includes(theme)
        ? theme
        : "system";
      const saved = localStorage.getItem("ricettario-view");
      if (saved && ["grid", "list", "compact"].includes(saved)) setView(saved);
    } catch {}
    const check = async () => {
      try {
        const result = await api<{ authenticated: boolean }>(
          "/api/auth/status",
        );
        setAuthenticated(result.authenticated);
        if (result.authenticated)
          localStorage.setItem("ricettario-offline-access", "1");
        else localStorage.removeItem("ricettario-offline-access");
      } catch {
        try {
          if (
            !navigator.onLine &&
            localStorage.getItem("ricettario-offline-access") === "1"
          ) {
            setAuthenticated(true);
            setOffline(true);
          }
        } catch {}
      } finally {
        setAuthChecked(true);
      }
    };
    void check();
    const connect = () => {
        setOffline(false);
        setReload((n) => n + 1);
      },
      disconnect = () => setOffline(true);
    window.addEventListener("online", connect);
    window.addEventListener("offline", disconnect);
    return () => {
      window.removeEventListener("online", connect);
      window.removeEventListener("offline", disconnect);
    };
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    void readRecipeCache().then((rows) => {
      if (!stopped && !hydrated.current) {
        setRecipes((current) => {
          const next = mergeRecipes(current, rows);
          cached.current = next;
          return next;
        });
        hydrated.current = true;
      }
    });
    void api<Category[]>("/api/categories")
      .then((rows) => {
        if (!stopped && Array.isArray(rows) && rows.length) setCategories(rows);
      })
      .catch(() => {});
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      stopped = true;
    };
  }, [authenticated]);
  useEffect(() => {
    if (authenticated && hydrated.current)
      void writeLocalRecipeSafetyCopy(recipes).catch(() =>
        setNotice(
          "Archivio offline non disponibile. Le ricette salvate sul server sono conservate.",
        ),
      );
  }, [recipes, authenticated]);
  useEffect(() => {
    if (!authenticated) return;
    let stopped = false;
    const controller = new AbortController();
    const timer = setTimeout(
      async () => {
        setLoading(true);
        setError("");
        try {
          const params = new URLSearchParams({
            view: "gallery",
            q: query,
            category,
            filter,
            sort,
            offset: String((page - 1) * PAGE_SIZE),
          });
          const data = await api<Gallery | Recipe[]>("/api/recipes?" + params, {
            signal: controller.signal,
          });
          if (stopped) return;
          if (Array.isArray(data)) {
            setLegacy(true);
            remember(data);
            setGallery(null);
          } else {
            if (!Array.isArray(data.items))
              throw new Error("Risposta del ricettario non valida.");
            setLegacy(false);
            setGallery(data);
            remember(data.items);
          }
          setOffline(false);
        } catch (cause) {
          if (stopped) return;
          if (cause instanceof ApiError && cause.status === 401) {
            try {
              localStorage.removeItem("ricettario-offline-access");
            } catch {}
            setAuthenticated(false);
            return;
          }
          setOffline(!navigator.onLine);
          setError(
            cause instanceof Error
              ? cause.message
              : "Ricettario non disponibile.",
          );
          setGallery(null);
        } finally {
          if (!stopped) setLoading(false);
        }
      },
      query ? 240 : 0,
    );
    return () => {
      stopped = true;
      controller.abort();
      clearTimeout(timer);
    };
  }, [authenticated, query, category, filter, sort, page, reload]);
  useEffect(() => {
    if (!authenticated || tab !== "settings" || index.length) return;
    let stopped = false;
    void api<Recipe[]>("/api/recipes?view=index")
      .then((rows) => {
        if (!stopped && Array.isArray(rows)) setIndex(rows);
      })
      .catch(() => {});
    return () => {
      stopped = true;
    };
  }, [authenticated, tab, index.length]);
  const local = useMemo(
    () =>
      filterGallery(
        recipes,
        { q: query, category, filter, sort },
        kitchen.state,
      ),
    [recipes, query, category, filter, sort, kitchen.state],
  );
  const visible =
      gallery && !offline && !legacy
        ? gallery.items
        : local.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    total = gallery && !offline && !legacy ? gallery.total : local.length,
    pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const summary = gallery?.summary || {
    recipes: recipes.filter((r) => !r.archived).length,
    favorites: recipes.filter((r) => r.favorite && !r.archived).length,
    categories: {},
  };
  const kitchenRecipes = mergeRecipes(recipes, index);
  function changeCategory(value: string) {
    setCategory(value);
    setPage(1);
  }
  function updateRecipe(recipe: Recipe) {
    remember([recipe]);
    setSelected((current) => (current?.id === recipe.id ? recipe : current));
    setGallery((current) =>
      current
        ? {
            ...current,
            items: current.items.map((row) =>
              row.id === recipe.id ? recipe : row,
            ),
          }
        : current,
    );
  }
  async function openRecipe(recipe: Recipe) {
    if (recipe.steps.length) {
      setSelected(recipe);
      return;
    }
    try {
      const full = await api<Recipe>("/api/recipes/" + recipe.id);
      remember([full]);
      setSelected(full);
    } catch (cause) {
      setNotice(
        cause instanceof Error
          ? cause.message
          : "Ricetta non disponibile offline.",
      );
    }
  }
  async function toggleFavorite(recipe: Recipe) {
    if (favorites.current.has(recipe.id)) return;
    favorites.current.add(recipe.id);
    try {
      const saved = await api<Recipe>("/api/recipes/" + recipe.id, {
        method: "PATCH",
        ...jsonBody({
          ...recipe,
          favorite: !recipe.favorite,
          expectedRevision: recipe.revision ?? 1,
        }),
      });
      updateRecipe(saved);
      setReload((n) => n + 1);
    } catch (cause) {
      setNotice(
        cause instanceof Error ? cause.message : "Preferito non aggiornato.",
      );
    } finally {
      favorites.current.delete(recipe.id);
    }
  }
  function addShopping(lines: string[], source: string) {
    shopping.update(
      shoppingFromText(shopping.items, lines, source, createRecipeId),
    );
    setNotice("Ingredienti aggiunti alla lista della spesa.");
  }
  async function planShopping(entries: MealEntry[], missingOnly: boolean) {
    try {
      const loaded: Recipe[] = [];
      for (const id of new Set(entries.map((row) => row.recipe_id))) {
        const found = cached.current.find((row) => row.id === id);
        loaded.push(found || (await api<Recipe>("/api/recipes/" + id)));
      }
      remember(loaded);
      let input = plannedIngredients(entries, loaded);
      if (missingOnly) {
        const coverage = pantryCoverage(
          input.map((row) => row.item),
          kitchen.state.pantry,
        );
        input = coverage.missing.map((item, index) => ({
          ...input[coverage.missingIndices[index]],
          item,
        }));
      }
      shopping.update(aggregateShopping(shopping.items, input, createRecipeId));
      setNotice(
        "Lista aggiornata dal piano pasti. Le aggiunte già presenti non vengono duplicate.",
      );
      setTab("shopping");
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : "Lista non generata.");
    }
  }
  function logout() {
    try {
      localStorage.removeItem("ricettario-offline-access");
    } catch {}
    setAuthenticated(false);
    setRecipes([]);
    setSelected(null);
  }
  const remaining = shopping.items.filter((row) => !row.done).length;
  if (!authChecked)
    return (
      <div className="boot-screen">
        <BrandLogo decorative />
        <strong>Ricettario AI</strong>
      </div>
    );
  if (!authenticated)
    return (
      <LoginScreen
        onAuthenticated={() => {
          try {
            localStorage.setItem("ricettario-offline-access", "1");
          } catch {}
          setAuthenticated(true);
          setReload((n) => n + 1);
        }}
      />
    );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#contenuto">
        Vai al contenuto
      </a>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setTab("recipes");
            changeCategory("Tutte");
          }}
        >
          <span className="brand-mark official-brand-mark">
            <BrandLogo decorative />
          </span>
          <span>
            <strong>Ricettario AI</strong>
            <small>La tua cucina, ogni giorno</small>
          </span>
        </button>
        <nav className="desktop-nav" aria-label="Navigazione principale">
          {(
            [
              ["recipes", "book", "Ricette"],
              ["new", "plus", "Nuova"],
              ["shopping", "bag", "Spesa"],
              ["settings", "settings", "Altro"],
            ] as const
          ).map(([value, icon, label]) => (
            <button
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              <Icon name={icon} size={16} />
              {label}
              {value === "shopping" && remaining > 0 ? (
                <b>{remaining}</b>
              ) : null}
            </button>
          ))}
        </nav>
        <span className="version-top">v7.0</span>
      </header>
      <main className="main-content" id="contenuto">
        {notice && (
          <div className="app-notice" role="status">
            <span>{notice}</span>
            <button aria-label="Chiudi messaggio" onClick={() => setNotice("")}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {offline && (
          <p className="warning-banner" role="status">
            Offline — stai vedendo l’ultima copia sincronizzata. Per salvare
            ricette o pasti serve la connessione.
          </p>
        )}
        {tab === "recipes" && (
          <section className="page-section recipes-page">
            <div className="recipes-hero">
              <div>
                <span className="eyebrow">Il tuo ricettario personale</span>
                <h1>{category === "Tutte" ? "Le mie ricette" : category}</h1>
                <p>
                  {summary.recipes} ricette · {summary.favorites} preferite
                </p>
              </div>
              <button className="button primary" onClick={() => setTab("new")}>
                <Icon name="plus" size={18} />
                Nuova ricetta
              </button>
            </div>
            <div className="kitchen-shortcuts">
              <button
                onClick={() => {
                  setTab("settings");
                  setSection("planner");
                }}
              >
                Piano pasti →
              </button>
              <button
                onClick={() => {
                  setTab("settings");
                  setSection("pantry");
                }}
              >
                La mia dispensa →
              </button>
            </div>
            <div className="recipes-toolbar">
              <div className="search-wrap">
                <Icon name="search" size={19} className="search-icon" />
                <input
                  type="search"
                  aria-label="Cerca ricette"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Cerca ricette, ingredienti o note…"
                />
              </div>
              <select
                aria-label="Ordina ricette"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value);
                  setPage(1);
                }}
              >
                {Object.entries(SORTS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div className="category-scroll" aria-label="Cataloghi">
              {[
                "Tutte",
                "Preferite",
                ...categories.map((row) => row.name),
                "Archiviate",
              ].map((name) => (
                <button
                  key={name}
                  className={
                    "category-chip" + (category === name ? " active" : "")
                  }
                  aria-pressed={category === name}
                  onClick={() => changeCategory(name)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="gallery-options">
              <label className="field inline-field">
                Filtra
                <select
                  aria-label="Filtra ricette"
                  value={filter}
                  onChange={(e) => {
                    setFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {Object.entries(FILTERS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <div
                className="view-options"
                role="group"
                aria-label="Visualizzazione ricette"
              >
                {[
                  ["grid", "Griglia"],
                  ["list", "Lista"],
                  ["compact", "Compatta"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    aria-pressed={view === value}
                    className={view === value ? "active" : ""}
                    onClick={() => {
                      setView(value);
                      try {
                        localStorage.setItem("ricettario-view", value);
                      } catch {}
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {error && (
              <div className="warning-banner" role="alert">
                <span>
                  {error}
                  {recipes.length
                    ? " Mostro le ricette già presenti sul dispositivo."
                    : ""}
                </span>
                <button
                  className="button soft"
                  disabled={loading}
                  onClick={() => setReload((n) => n + 1)}
                >
                  Riprova
                </button>
              </div>
            )}
            {(query || filter !== "all" || category !== "Tutte") && (
              <div className="results-bar">
                <span>
                  {total} risultati{offline ? " nella copia locale" : ""}
                </span>
                <button
                  onClick={() => {
                    setQuery("");
                    setFilter("all");
                    changeCategory("Tutte");
                  }}
                >
                  Azzera filtri
                </button>
              </div>
            )}
            {loading && !visible.length ? (
              <div className="loading-grid" aria-label="Caricamento ricette">
                <div />
                <div />
                <div />
                <div />
              </div>
            ) : !visible.length ? (
              <div className="surface empty-recipes">
                <div className="empty-icon">
                  <Icon name="book" size={32} />
                </div>
                <h2>
                  {query || filter !== "all"
                    ? "Nessuna ricetta trovata"
                    : category === "Tutte"
                      ? "Importa la prima ricetta"
                      : "Questo catalogo è vuoto"}
                </h2>
                <p>
                  {query || filter !== "all"
                    ? "Prova con un altro ingrediente o rimuovi un filtro."
                    : "Conserva qui i piatti che vuoi cucinare ancora."}
                </p>
                <button
                  className="button primary"
                  onClick={() => setTab("new")}
                >
                  Aggiungi ricetta
                </button>
              </div>
            ) : (
              <div className={"recipe-grid view-" + view} aria-busy={loading}>
                {visible.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    view={view}
                    recipe={recipe}
                    onOpen={() => void openRecipe(recipe)}
                    onToggleFavorite={() => void toggleFavorite(recipe)}
                  />
                ))}
              </div>
            )}
            {pages > 1 && (
              <div className="pagination">
                <button
                  className="button soft"
                  aria-label="Pagina precedente"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  ←
                </button>
                <span>
                  Pagina {page} di {pages}
                </span>
                <button
                  className="button soft"
                  aria-label="Pagina successiva"
                  disabled={page >= pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  →
                </button>
              </div>
            )}
          </section>
        )}
        <div hidden={tab !== "new"}>
          <NewRecipe
            categories={categories}
            knownRecipes={recipes}
            onCategoryAdded={(row) =>
              setCategories((current) => [
                ...current.filter((x) => x.id !== row.id),
                row,
              ])
            }
            onDuplicate={(recipe) => {
              setSelected(recipe);
              setTab("recipes");
            }}
            onSaved={(recipe) => {
              remember([recipe]);
              setSelected(recipe);
              setTab("recipes");
              setQuery("");
              setFilter("all");
              changeCategory("Tutte");
              setReload((n) => n + 1);
              setNotice(
                (recipe as Recipe & { backupWarning?: string }).backupWarning ||
                  "Ricetta salvata nel tuo ricettario.",
              );
            }}
          />
        </div>
        {tab === "shopping" && (
          <ShoppingList
            items={shopping.items}
            setItems={shopping.update}
            syncStatus={shopping.status}
            onRetry={shopping.retry}
            conflict={shopping.conflict}
            onResolve={() =>
              void shopping.resolve().catch((cause) => setNotice(String(cause)))
            }
          />
        )}
        {tab === "settings" && (
          <KitchenPanel
            section={section}
            onSection={setSection}
            recipes={kitchenRecipes}
            state={kitchen.state}
            status={kitchen.status}
            busy={kitchen.busy}
            save={kitchen.save}
            reload={kitchen.reload}
            onOpen={(recipe) => void openRecipe(recipe)}
            onPlanShopping={(entries, missing) =>
              void planShopping(entries, missing)
            }
          >
            <SettingsPanel
              categories={categories}
              setCategories={setCategories}
              recipes={recipes}
              onLogout={logout}
              onImagesRepaired={(updates) =>
                remember(
                  recipes.map((recipe) => {
                    const hit = updates.find((row) => row.id === recipe.id);
                    return hit ? { ...recipe, imageUrl: hit.imageUrl } : recipe;
                  }),
                )
              }
            />
          </KitchenPanel>
        )}
      </main>
      {!selected && <CookingTimerTray {...timers} />}
      <BottomNav tab={tab} onChange={setTab} shoppingCount={remaining} />
      {selected && (
        <RecipeDetail
          key={selected.id}
          recipe={selected}
          categories={categories}
          onClose={() => setSelected(null)}
          onUpdated={updateRecipe}
          onAddShopping={addShopping}
          timerActions={timers}
          timerTray={<CookingTimerTray {...timers} inline />}
          kitchen={kitchen.state}
          onKitchenSave={kitchen.save}
          kitchenBusy={kitchen.busy}
        />
      )}
    </div>
  );
}
