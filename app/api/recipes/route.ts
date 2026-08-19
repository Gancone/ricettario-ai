import { supabase } from "@/lib/supabase";
import { fromDb, toDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import { createDatabaseSnapshot, restoreIfDatabaseUnexpectedlyEmpty } from "@/lib/data-safety";
import type { Recipe } from "@/types/recipe";

async function readRecipes() {
  const { data, error } = await supabase
    .from("recipes")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function GET() {
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
  try {
    const recipe = (await request.json()) as Recipe;
    if (!recipe.id || !recipe.title?.trim()) {
      return Response.json({ error: "Titolo o ID ricetta mancante" }, { status: 400 });
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
    await createDatabaseSnapshot("recipe-save").catch(() => {});
    return Response.json(fromDb(data));
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore salvataggio ricetta" }, { status: 500 });
  }
}
