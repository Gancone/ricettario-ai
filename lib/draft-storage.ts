import type { RecipeDraft } from "@/types/recipe";
export const DRAFT_KEY = "ricettario-draft-v6";

export function restoreDraft(raw: string | null, empty: RecipeDraft) {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!saved?.draft || typeof saved.draft !== "object") return null;
    const draft = { ...empty };
    for (const key of Object.keys(draft) as (keyof RecipeDraft)[]) {
      if (typeof saved.draft[key] === typeof draft[key]) Object.assign(draft, { [key]: saved.draft[key] });
    }
    return { draft, sourceText: typeof saved.sourceText === "string" ? saved.sourceText : "" };
  } catch { return null; }
}
