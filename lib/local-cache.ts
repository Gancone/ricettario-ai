import type { Recipe } from "@/types/recipe";

const PRIMARY_KEY = "ricettario-safe-v6";
const LEGACY_KEYS = [
  "ricettario-safe-v5",
  "ricettario-ai",
  "ricettario-ai-v4",
  "ricettario-recipes",
  "recipes"
];

function looksLikeRecipe(value: any): value is Recipe {
  return Boolean(
    value &&
    typeof value === "object" &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.ingredients) &&
    Array.isArray(value.steps)
  );
}

function extractRecipes(value: any): Recipe[] {
  if (Array.isArray(value)) return value.filter(looksLikeRecipe);
  if (Array.isArray(value?.recipes)) return value.recipes.filter(looksLikeRecipe);
  return [];
}

export function readLocalRecipeSafetyCopy(): Recipe[] {
  if (typeof window === "undefined") return [];

  const found: Recipe[] = [];
  const keys = new Set<string>([PRIMARY_KEY, ...LEGACY_KEYS]);

  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.toLowerCase().includes("ricettario")) keys.add(key);
    }
  } catch {}

  for (const key of keys) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      found.push(...extractRecipes(parsed));
    } catch {}
  }

  const byId = new Map<string, Recipe>();
  for (const recipe of found) {
    const current = byId.get(recipe.id);
    if (!current) {
      byId.set(recipe.id, recipe);
      continue;
    }
    const currentDate = Date.parse(current.createdAt || "") || 0;
    const nextDate = Date.parse(recipe.createdAt || "") || 0;
    if (nextDate >= currentDate) byId.set(recipe.id, recipe);
  }

  return [...byId.values()].sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0));
}

export function writeLocalRecipeSafetyCopy(recipes: Recipe[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PRIMARY_KEY,
      JSON.stringify({ version: 1, savedAt: new Date().toISOString(), recipes })
    );
  } catch {}
}

export function mergeRecipes(primary: Recipe[], secondary: Recipe[]) {
  const byId = new Map<string, Recipe>();
  for (const recipe of secondary) byId.set(recipe.id, recipe);
  for (const recipe of primary) byId.set(recipe.id, recipe);
  return [...byId.values()].sort((a, b) => (Date.parse(b.createdAt || "") || 0) - (Date.parse(a.createdAt || "") || 0));
}
