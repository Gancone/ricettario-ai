import { guard, allRows } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { fromDb } from "@/lib/recipe-map";
import { validateRecipe } from "@/lib/recipe-input";
import { findDuplicate, insertRecipe } from "@/lib/recipe-store";
import { persistRecipeImage } from "@/lib/image-storage";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import { readJson, errorResponse, HttpError, uuid } from "@/lib/validation";
import { FILTERS, SORTS, filterGallery } from "@/lib/gallery";
import { EMPTY_KITCHEN, type PantryItem } from "@/lib/kitchen";
export async function GET(request: Request) {
  const auth = await guard(request);
  if (auth) return auth;
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "index") {
      const output = [];
      let cursor = "";
      for (;;) {
        let query = supabase
          .from("recipes")
          .select("id,title,category,servings,archived,created_at")
          .order("id")
          .limit(500);
        if (cursor) query = query.gt("id", cursor);
        const { data, error } = await query;
        if (error) throw error;
        output.push(
          ...(data || []).map((row) => ({
            ...fromDb(row),
            ingredients: [],
            steps: [],
          })),
        );
        if (!data?.length || data.length < 500) break;
        cursor = data[data.length - 1].id;
      }
      return Response.json(output, {
        headers: { "cache-control": "no-store" },
      });
    }
    if (url.searchParams.get("view") === "gallery") {
      const filter = url.searchParams.get("filter") || "all",
        sort = url.searchParams.get("sort") || "newest";
      if (!Object.hasOwn(FILTERS, filter) || !Object.hasOwn(SORTS, sort))
        throw new HttpError(400, "Filtro o ordine non valido.");
      if (filter === "pantry") {
        const rows = (await allRows("recipes")).map(fromDb),
          pantry = (await allRows("pantry_items")) as PantryItem[];
        const filtered = filterGallery(
          rows,
          {
            q: (url.searchParams.get("q") || "").slice(0, 300),
            category: url.searchParams.get("category") || "Tutte",
            filter,
            sort,
          },
          { ...EMPTY_KITCHEN, pantry },
        );
        const offset = Math.min(
          1000000,
          Math.max(0, Math.floor(Number(url.searchParams.get("offset")) || 0)),
        );
        return Response.json(
          {
            items: filtered.slice(offset, offset + 20),
            total: filtered.length,
            summary: {
              recipes: rows.filter((row) => !row.archived).length,
              favorites: rows.filter((row) => row.favorite && !row.archived)
                .length,
              categories: {},
            },
          },
          { headers: { "cache-control": "no-store" } },
        );
      }
      const { data, error } = await supabase.rpc("recipe_gallery", {
        p_query: (url.searchParams.get("q") || "").slice(0, 300),
        p_category: (url.searchParams.get("category") || "Tutte").slice(0, 120),
        p_filter: filter,
        p_sort: sort,
        p_limit: 20,
        p_offset: Math.min(
          1000000,
          Math.max(0, Number(url.searchParams.get("offset")) || 0),
        ),
      });
      if (error) throw error;
      return Response.json(
        { ...data, items: (data.items || []).map(fromDb) },
        { headers: { "cache-control": "no-store" } },
      );
    }
    if (url.searchParams.has("limit")) {
      const limit = Math.min(
        200,
        Math.max(1, Number(url.searchParams.get("limit")) || 100),
      );
      const cursor = url.searchParams.get("cursor");
      let q = supabase.from("recipes").select("*").order("id").limit(limit);
      if (cursor) q = q.gt("id", uuid.parse(cursor));
      const { data, error } = await q;
      if (error) throw error;
      return Response.json(
        {
          items: (data || []).map(fromDb),
          nextCursor: data?.length === limit ? data[data.length - 1].id : null,
        },
        { headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json((await allRows("recipes")).map(fromDb), {
      headers: { "cache-control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  const auth = await guard(request, "write");
  if (auth) return auth;
  try {
    const recipe = validateRecipe(await readJson(request));
    const duplicate = recipe.sourceUrl
      ? await findDuplicate(recipe.sourceUrl, recipe.id)
      : null;
    if (duplicate)
      throw new HttpError(409, "Questa fonte è già presente.", {
        duplicateId: duplicate.id,
        current: duplicate,
      });
    recipe.imageUrl = await persistRecipeImage(recipe.id, recipe.imageUrl);
    const saved = await insertRecipe(recipe);
    let backupWarning = "";
    try {
      const backup = await createDatabaseSnapshot("recipe-save");
      if (backup.suspicious)
        backupWarning = "Backup sospetto: copia precedente conservata.";
    } catch {
      backupWarning = "Backup automatico non completato: la ricetta è salvata.";
    }
    return Response.json({ ...saved, backupWarning });
  } catch (e) {
    return errorResponse(e);
  }
}
