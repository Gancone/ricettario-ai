import type { Recipe } from "@/types/recipe";

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
    title: row.title,
    sourceUrl: row.source_url || "",
    imageUrl: row.image_url || "",
    category: row.category || "Senza categoria",
    tags: row.tags || [],
    ingredients: row.ingredients || [],
    steps: row.steps || [],
    sourceNotes: String(raw._sourceNotes || ""),
    notes: row.notes || "",
    prepTimeMinutes: row.prep_time_minutes ?? undefined,
    cookTimeMinutes: row.cook_time_minutes ?? undefined,
    totalTimeMinutes: row.total_time_minutes ?? undefined,
    servings: row.servings ?? undefined,
    nutrition,
    favorite: raw._favorite === true,
    archived: raw._archived === true,
    rating: Number.isFinite(Number(raw._rating)) ? Number(raw._rating) : undefined,
    createdAt: row.created_at
  };
}

export function toDb(recipe: Partial<Recipe>) {
  const nutrition = {
    ...(recipe.nutrition || {}),
    _sourceNotes: recipe.sourceNotes || "",
    _favorite: recipe.favorite === true,
    _archived: recipe.archived === true,
    _rating: recipe.rating || null
  };

  return {
    title: recipe.title,
    source_url: recipe.sourceUrl || null,
    image_url: recipe.imageUrl || null,
    category: recipe.category || "Senza categoria",
    tags: recipe.tags || [],
    ingredients: recipe.ingredients || [],
    steps: recipe.steps || [],
    notes: recipe.notes || null,
    prep_time_minutes: recipe.prepTimeMinutes ?? null,
    cook_time_minutes: recipe.cookTimeMinutes ?? null,
    total_time_minutes: recipe.totalTimeMinutes ?? null,
    servings: recipe.servings ?? null,
    nutrition
  };
}
