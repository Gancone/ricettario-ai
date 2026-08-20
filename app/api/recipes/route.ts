import { supabase } from "@/lib/supabase";
import { fromDb, toDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import { createDatabaseSnapshot, restoreIfDatabaseUnexpectedlyEmpty } from "@/lib/data-safety";
import { requireAppAuth } from "@/lib/app-auth";
import { normalizeSourceUrl } from "@/lib/source-url";
import type { Recipe } from "@/types/recipe";

async function readRecipes() {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function GET(request: Request) {
  const auth = requireAppAuth(request);
  if (auth) return auth;
  try {
    let rows = await readRecipes();
    if (!rows.length) {
      await restoreIfDatabaseUnexpectedlyEmpty();
      rows = await readRecipes();
    }
    return Response.json(rows.map(fromDb), {
      headers: { "cache-control": "no-store, max-age=0" }
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore caricamento ricette" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = requireAppAuth(request);
  if (auth) return auth;
  try {
    const recipe = (await request.json()) as Recipe;
    if (!recipe.id || !recipe.title?.trim()) {
      return Response.json({ error: "Titolo o ID ricetta mancante" }, { status: 400 });
    }
    if (!recipe.ingredients?.length || !recipe.steps?.length) {
      return Response.json({ error: "Ingredienti e procedimento sono obbligatori." }, { status: 400 });
    }

    if (recipe.sourceUrl) {
      const normalized = normalizeSourceUrl(recipe.sourceUrl);
      const { data: rows } = await supabase.from("recipes").select("id,source_url,title").neq("id", recipe.id).limit(1000);
      const duplicate = (rows || []).find((x) => normalizeSourceUrl(x.source_url || "") === normalized);
      if (duplicate) {
        return Response.json({ error: `Questa fonte è già salvata come “${duplicate.title}”.`, duplicateId: duplicate.id }, { status: 409 });
      }
    }

    const stableImageUrl = await persistRecipeImage(recipe.id, recipe.imageUrl);
    const row = {
      id: recipe.id,
      ...toDb({ ...recipe, imageUrl: stableImageUrl }),
      created_at: recipe.createdAt || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from("recipes")
      .upsert(row, { onConflict: "id" })
      .select("*")
      .single();

    if (error) throw error;
    let backupWarning = "";
    try { await createDatabaseSnapshot("recipe-save"); }
    catch (e: any) { backupWarning = e?.message || "Backup automatico non riuscito"; }
    return Response.json({ ...fromDb(data), backupWarning });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore salvataggio ricetta" }, { status: 500 });
  }
}
