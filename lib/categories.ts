import type { Category } from "@/types/recipe";

export const DEFAULT_CATEGORY_NAMES = [
  "Colazione",
  "Merenda",
  "Primi piatti",
  "Secondi piatti",
  "Contorni",
  "Dessert"
] as const;

export function fallbackCategories(): Category[] {
  return DEFAULT_CATEGORY_NAMES.map((name, index) => ({ id: -(index + 1), name }));
}

export function mergeCategoryNames(names: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of [...DEFAULT_CATEGORY_NAMES, ...names]) {
    const name = String(value || "").trim();
    const key = name.toLocaleLowerCase("it");
    if (!name || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}
