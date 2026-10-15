import type { Recipe } from "@/types/recipe";
import {
  canonicalMeasure,
  ingredientList,
  normalizeIngredient,
  scaleStructured,
  type StructuredIngredient,
} from "./ingredients";
export type KitchenRow = {
  id: string;
  revision: number;
  created_at?: string;
  updated_at?: string;
  archived_at?: string | null;
};
export type PantryItem = KitchenRow & {
  name: string;
  normalized_name: string;
  quantity: number | null;
  unit: string | null;
  notes?: string;
  finished: boolean;
};
export type MealEntry = KitchenRow & {
  date: string;
  meal_type: "breakfast" | "lunch" | "dinner" | "snack";
  recipe_id: string;
  servings: number;
  notes?: string;
};
export type CookingEntry = KitchenRow & {
  recipe_id: string;
  cooked_at: string;
  servings?: number | null;
  rating?: number | null;
  notes?: string;
};
export type Usage = {
  recipe_id: string;
  count: number;
  last_cooked_at: string;
  average_rating: number | null;
};
export type KitchenState = {
  pantry: PantryItem[];
  plan: MealEntry[];
  history: CookingEntry[];
  stats: Usage[];
};
export const EMPTY_KITCHEN: KitchenState = {
  pantry: [],
  plan: [],
  history: [],
  stats: [],
};
export const MEALS = {
  breakfast: "Colazione",
  lunch: "Pranzo",
  dinner: "Cena",
  snack: "Snack",
};
export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function weekDays(date = new Date()) {
  const monday = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + i);
    return dateKey(day);
  });
}
export function pantryCoverage(
  ingredients: StructuredIngredient[],
  pantry: PantryItem[],
) {
  const remaining = pantry
    .filter(
      (item) =>
        !item.finished &&
        !item.archived_at &&
        (item.quantity === null || item.quantity > 0),
    )
    .map((item) => ({ ...item }));
  const missing: StructuredIngredient[] = [];
  const missingIndices: number[] = [];
  let have = 0;
  let uncertain = 0;
  for (const [index, item] of ingredients.entries()) {
    const matches = remaining.filter(
      (row) =>
        normalizeIngredient(row.normalized_name || row.name) ===
        item.normalizedIngredient,
    );
    if (!matches.length) {
      missing.push(item);
      missingIndices.push(index);
      continue;
    }
    if (item.quantity === null) {
      have++;
      continue;
    }
    const wanted = canonicalMeasure(
      item.quantityMax ?? item.quantity,
      item.unit,
    );
    let available = 0;
    for (const row of matches) {
      if (row.quantity === null) {
        uncertain++;
        continue;
      }
      const stock = canonicalMeasure(row.quantity, row.unit);
      if (stock.unit === wanted.unit) available += stock.quantity;
    }
    if (available >= wanted.quantity) {
      have++;
      let consume = wanted.quantity;
      for (const row of matches) {
        if (row.quantity === null) continue;
        const stock = canonicalMeasure(row.quantity, row.unit);
        if (stock.unit !== wanted.unit) continue;
        const used = Math.min(consume, stock.quantity);
        consume -= used;
        row.quantity =
          (stock.quantity - used) /
          (row.unit === "kg" || row.unit === "l" ? 1000 : 1);
      }
    } else if (available > 0) {
      const missingQuantity =
        (wanted.quantity - available) /
        (item.unit === "kg" || item.unit === "l" ? 1000 : 1);
      missing.push({ ...item, quantity: missingQuantity, quantityMax: null });
      missingIndices.push(index);
      for (const row of matches)
        if (
          row.quantity !== null &&
          canonicalMeasure(row.quantity, row.unit).unit === wanted.unit
        )
          row.quantity = 0;
    } else if (matches.some((row) => row.quantity === null)) {
      have++;
    } else {
      missing.push(item);
      missingIndices.push(index);
    }
  }
  return {
    have,
    total: ingredients.length,
    missing,
    missingIndices,
    uncertain,
  };
}
export function plannedIngredients(entries: MealEntry[], recipes: Recipe[]) {
  const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
  return entries
    .filter((entry) => !entry.archived_at)
    .flatMap((entry) => {
      const recipe = byId.get(entry.recipe_id);
      return recipe
        ? ingredientList(recipe.ingredients).map((item, index) => ({
            item: scaleStructured(
              item,
              entry.servings / (recipe.servings || 2),
            ),
            key: entry.id + ":" + index,
            source: recipe.title + " · " + entry.date,
          }))
        : [];
    });
}
export function cookingSummary(history: CookingEntry[], recipeId: string) {
  const rows = history.filter(
    (row) => row.recipe_id === recipeId && !row.archived_at,
  );
  const rated = rows.filter((row) => row.rating != null);
  return {
    count: rows.length,
    lastCookedAt:
      rows
        .map((row) => row.cooked_at)
        .sort()
        .at(-1) || "",
    averageRating: rated.length
      ? rated.reduce((sum, row) => sum + Number(row.rating), 0) / rated.length
      : null,
  };
}
