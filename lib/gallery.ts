import type { Recipe } from "@/types/recipe";
import { matchesSearch } from "./cooking";
import { ingredientList } from "./ingredients";
import { pantryCoverage, type KitchenState } from "./kitchen";
export const FILTERS = {
  all: "Tutte",
  under15: "≤ 15 min",
  under30: "≤ 30 min",
  under60: "≤ 60 min",
  under500: "≤ 500 kcal",
  protein20: "≥ 20 g proteine",
  protein30: "≥ 30 g proteine",
  vegetarian: "Vegetariana",
  recent: "Cucinate di recente",
  never: "Mai cucinate",
  pantry: "Disponibili con dispensa",
};
export const SORTS = {
  newest: "Più recenti",
  oldest: "Più vecchie",
  title: "A–Z",
  cooked: "Più cucinate",
  rating: "Miglior voto",
  fastest: "Più veloci",
  lightest: "Meno caloriche",
};
export type GalleryQuery = {
  q: string;
  category: string;
  filter: string;
  sort: string;
};
export function filterGallery(
  recipes: Recipe[],
  query: GalleryQuery,
  kitchen: KitchenState,
) {
  const stats = new Map(kitchen.stats.map((row) => [row.recipe_id, row]));
  return recipes
    .filter((r) => {
      if (query.category === "Archiviate" ? !r.archived : r.archived)
        return false;
      if (query.category === "Preferite" && !r.favorite) return false;
      if (
        !["Tutte", "Preferite", "Archiviate"].includes(query.category) &&
        r.category !== query.category
      )
        return false;
      if (
        !matchesSearch(
          [
            r.title,
            r.category,
            ...r.ingredients,
            ...r.steps,
            ...r.tags,
            r.notes || "",
            r.sourceNotes || "",
          ].join(" "),
          query.q,
        )
      )
        return false;
      if (query.filter.startsWith("under") && query.filter !== "under500")
        return (
          r.totalTimeMinutes != null &&
          r.totalTimeMinutes <= Number(query.filter.slice(5))
        );
      if (query.filter === "under500")
        return r.nutrition?.calories != null && r.nutrition.calories <= 500;
      if (query.filter.startsWith("protein"))
        return (
          r.nutrition?.protein != null &&
          r.nutrition.protein >= Number(query.filter.slice(7))
        );
      if (query.filter === "vegetarian")
        return r.tags.some((tag) => /^(vegetarian[ao]|vegan[ao])$/i.test(tag));
      if (query.filter === "recent")
        return (
          Date.parse(stats.get(r.id)?.last_cooked_at || "") >=
          Date.now() - 30 * 86400000
        );
      if (query.filter === "never") return !stats.get(r.id)?.count;
      if (query.filter === "pantry")
        return (
          !!r.ingredients.length &&
          !pantryCoverage(ingredientList(r.ingredients), kitchen.pantry).missing
            .length
        );
      return true;
    })
    .sort((a, b) => {
      const latest = Date.parse(b.createdAt) - Date.parse(a.createdAt);
      if (query.sort === "title") return a.title.localeCompare(b.title, "it");
      if (query.sort === "oldest") return -latest;
      if (query.sort === "fastest")
        return (
          (a.totalTimeMinutes ?? Infinity) - (b.totalTimeMinutes ?? Infinity) ||
          latest
        );
      if (query.sort === "lightest")
        return (
          (a.nutrition?.calories ?? Infinity) -
            (b.nutrition?.calories ?? Infinity) || latest
        );
      if (query.sort === "cooked")
        return (
          (stats.get(b.id)?.count || 0) - (stats.get(a.id)?.count || 0) ||
          latest
        );
      if (query.sort === "rating")
        return (
          (stats.get(b.id)?.average_rating ?? -1) -
            (stats.get(a.id)?.average_rating ?? -1) || latest
        );
      return latest;
    });
}
