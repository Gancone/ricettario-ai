import { supabase } from "@/lib/supabase";
import { fromDb, toDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import type { Recipe } from "@/types/recipe";

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("recipes")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    return Response.json((data || []).map(fromDb));
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

    const { data, error } = await supabase
      .from("recipes")
      .insert({
        id: recipe.id,
        ...toDb({ ...recipe, imageUrl: stableImageUrl }),
        created_at: recipe.createdAt || new Date().toISOString()
      })
      .select("*")
      .single();

    if (error) throw error;
    return Response.json(fromDb(data));
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore salvataggio ricetta" }, { status: 500 });
  }
}
