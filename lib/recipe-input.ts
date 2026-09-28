import type { Recipe } from "@/types/recipe";
export class InvalidRecipe extends Error {}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function validateRecipe(value: unknown): Recipe {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidRecipe("Ricetta non valida.");
  const input = value as Recipe;
  if (typeof input.id !== "string" || !UUID.test(input.id)) throw new InvalidRecipe("Identificativo della ricetta non valido. Ricarica la pagina e riprova.");
  if (typeof input.title !== "string" || !input.title.trim() || input.title.length > 300) throw new InvalidRecipe("Inserisci un titolo da 1 a 300 caratteri.");
  for (const key of ["ingredients", "steps", "tags"] as const) {
    if (!Array.isArray(input[key]) || input[key].length > 500 || input[key].some((item) => typeof item !== "string" || item.length > 10000)) throw new InvalidRecipe(`Formato non valido: ${key}.`);
  }
  if (!input.ingredients.some((x) => x.trim()) || !input.steps.some((x) => x.trim())) throw new InvalidRecipe("Ingredienti e procedimento sono obbligatori.");
  for (const key of ["category", "notes", "sourceNotes", "sourceUrl", "imageUrl"] as const) {
    if (input[key] != null && typeof input[key] !== "string") throw new InvalidRecipe(`Formato non valido: ${key}.`);
  }
  for (const key of ["sourceUrl", "imageUrl"] as const) {
    if (input[key]) {
      try { if (!["http:", "https:"].includes(new URL(input[key]!).protocol)) throw new Error(); }
      catch { throw new InvalidRecipe("Usa un indirizzo completo che inizi con https:// o http://."); }
    }
  }
  for (const key of ["prepTimeMinutes", "cookTimeMinutes", "totalTimeMinutes", "servings"] as const) {
    const number = input[key];
    if (number != null && (typeof number !== "number" || !Number.isFinite(number) || number < 0 || number > 2147483647)) throw new InvalidRecipe("Tempi e porzioni devono essere numeri validi, maggiori o uguali a zero.");
  }
  if (input.nutrition != null) {
    if (typeof input.nutrition !== "object" || Array.isArray(input.nutrition)) throw new InvalidRecipe("Valori nutrizionali non validi.");
    for (const key of ["calories", "protein", "carbs", "fat", "sugars", "fiber", "salt"] as const) {
      const number = input.nutrition[key];
      if (number != null && (typeof number !== "number" || !Number.isFinite(number) || number < 0)) throw new InvalidRecipe("Valori nutrizionali non validi.");
    }
  }
  return { ...input, title: input.title.trim(), category: input.category?.trim() || "Senza categoria",
    ingredients: input.ingredients.map((x) => x.trim()).filter(Boolean), steps: input.steps.map((x) => x.trim()).filter(Boolean), tags: input.tags.map((x) => x.trim()).filter(Boolean) };
}
