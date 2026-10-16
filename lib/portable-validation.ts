import { HttpError, uuid } from "./validation";
/** Validate references before the first upload/insert; existing records always win. */
export function validatePortableRows(entities: Record<string, any[]>) {
  for (const [key, rows] of Object.entries(entities)) {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object" || Array.isArray(row))
        throw new HttpError(422, "Riga non valida: " + key);
      if (key === "categories") {
        if (
          typeof row.name !== "string" ||
          !row.name.trim() ||
          row.name.length > 120
        )
          throw new HttpError(422, "Catalogo non valido.");
        continue;
      }
      uuid.parse(row.id);
      if (seen.has(row.id))
        throw new HttpError(422, "ID duplicato nel backup: " + key);
      seen.add(row.id);
      if (row.recipe_id != null) uuid.parse(row.recipe_id);
      if (
        row.revision != null &&
        (!Number.isSafeInteger(row.revision) || row.revision < 1)
      )
        throw new HttpError(422, "Revisione non valida: " + key);
      if (
        key === "recipes" &&
        (typeof row.title !== "string" ||
          !row.title.trim() ||
          !Array.isArray(row.ingredients) ||
          !Array.isArray(row.steps) ||
          row.ingredients.some((value: unknown) => typeof value !== "string") ||
          row.steps.some((value: unknown) => typeof value !== "string"))
      )
        throw new HttpError(422, "Ricetta non valida nel backup.");
      if (
        key === "recipe_versions" &&
        (!row.snapshot || typeof row.snapshot !== "object")
      )
        throw new HttpError(422, "Versione ricetta non valida.");
    }
  }
}
