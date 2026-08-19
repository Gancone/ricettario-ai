import type { Recipe } from "@/types/recipe";

export function fromDb(row: any): Recipe {
  return {
    id: row.id,
    title: row.title,
    sourceUrl: row.source_url || "",
    imageUrl: row.image_url || "",
    category: row.category || "Senza categoria",
    tags: row.tags || [],
    ingredients: row.ingredients || [],
    steps: row.steps || [],
    notes: row.notes || "",
    prepTimeMinutes: row.prep_time_minutes ?? undefined,
    cookTimeMinutes: row.cook_time_minutes ?? undefined,
    totalTimeMinutes: row.total_time_minutes ?? undefined,
    servings: row.servings ?? undefined,
    nutrition: row.nutrition || undefined,
    createdAt: row.created_at
  };
}

export function toDb(recipe: Partial<Recipe>) {
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
    nutrition: recipe.nutrition || null
  };
}
