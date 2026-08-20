import { supabase } from "@/lib/supabase";
import { toDb, fromDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import type { Recipe } from "@/types/recipe";
import { requireAppAuth } from "@/lib/app-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const body = await request.json().catch(() => ({}));
    const recipes = Array.isArray(body?.recipes) ? (body.recipes as Recipe[]) : [];
    if (!recipes.length) return Response.json({ recovered: 0, recipes: [] });
    if (recipes.length > 500) return Response.json({ error: "Troppe ricette in un solo ripristino." }, { status: 413 });

    const rows: any[] = [];
    for (const recipe of recipes) {
      if (!recipe?.id || !recipe?.title) continue;
      const imageUrl = await persistRecipeImage(recipe.id, recipe.imageUrl);
      rows.push({
        id: recipe.id,
        ...toDb({ ...recipe, imageUrl }),
        created_at: recipe.createdAt || new Date().toISOString()
      });
    }

    if (rows.length) {
      const { error } = await supabase.from("recipes").upsert(rows, { onConflict: "id" });
      if (error) throw error;
      await createDatabaseSnapshot("local-recovery");
    }

    const { data, error } = await supabase.from("recipes").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return Response.json({ recovered: rows.length, recipes: (data || []).map(fromDb) });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Ripristino ricette non riuscito" }, { status: 500 });
  }
}
