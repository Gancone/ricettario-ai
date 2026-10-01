import type { Recipe } from "@/types/recipe";

function integerValue(value: number | undefined) {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0 || value > 2147483647) {
    throw new Error("Tempi e porzioni devono essere numeri validi, maggiori o uguali a zero.");
  }
  return Math.ceil(value);
}

function rawNutrition(row: any) {
  return row?.nutrition && typeof row.nutrition === "object" ? row.nutrition : {};
}

export function fromDb(row: any): Recipe {
  const raw = rawNutrition(row);
  const nutrition = {
    calories: raw.calories ?? undefined,
    protein: raw.protein ?? undefined,
    carbs: raw.carbs ?? undefined,
    fat: raw.fat ?? undefined,
    sugars: raw.sugars ?? undefined,
    fiber: raw.fiber ?? undefined,
    salt: raw.salt ?? undefined,
    estimated: raw.estimated !== false
  };

  return {
    id: row.id,
    revision: Number(row.revision ?? 1),
    updatedAt: row.updated_at || row.created_at,
    archivedAt: row.archived_at || null,
    title: row.title,
    sourceUrl: row.source_url || "",
    imageUrl: row.image_url || "",
    category: row.category || "Senza categoria",
    tags: row.tags || [],
    ingredients: row.ingredients || [],
    steps: row.steps || [],
    sourceNotes: String(row.source_notes ?? raw._sourceNotes ?? ""),
    notes: row.notes || "",
    prepTimeMinutes: row.prep_time_minutes ?? undefined,
    cookTimeMinutes: row.cook_time_minutes ?? undefined,
    totalTimeMinutes: row.total_time_minutes ?? undefined,
    servings: row.servings ?? undefined,
    nutrition,
    favorite: row.favorite ?? raw._favorite === true,
    archived: row.archived ?? raw._archived === true,
    rating: row.rating ?? (raw._rating != null && Number.isFinite(Number(raw._rating)) ? Number(raw._rating) : undefined),
    createdAt: row.created_at
  };
}

export function toDb(recipe: Partial<Recipe>) {
  const nutrition = Object.fromEntries(Object.entries(recipe.nutrition || {}).filter(([key]) => ['calories','protein','carbs','fat','sugars','fiber','salt','estimated'].includes(key)));

  return {
    title: recipe.title,
    source_notes: recipe.sourceNotes || "",
    favorite: recipe.favorite === true,
    archived: recipe.archived === true,
    rating: recipe.rating ?? null,
    source_url: recipe.sourceUrl || null,
    image_url: recipe.imageUrl || null,
    category: recipe.category || "Senza categoria",
    tags: recipe.tags || [],
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    notes: recipe.notes || null,
    prep_time_minutes: integerValue(recipe.prepTimeMinutes),
    cook_time_minutes: integerValue(recipe.cookTimeMinutes),
    total_time_minutes: integerValue(recipe.totalTimeMinutes),
    servings: integerValue(recipe.servings),
    nutrition
  };
}
