import { supabase } from "@/lib/supabase";
import { fromDb, toDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import type { Recipe } from "@/types/recipe";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recipe = (await request.json()) as Recipe;
    const stableImageUrl = await persistRecipeImage(id, recipe.imageUrl);

    const { data, error } = await supabase
      .from("recipes")
      .update(toDb({ ...recipe, imageUrl: stableImageUrl }))
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    return Response.json(fromDb(data));
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore modifica ricetta" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { error } = await supabase.from("recipes").delete().eq("id", id);
    if (error) throw error;

    // La cancellazione dell'immagine non deve impedire la cancellazione della ricetta.
    try {
      const { data } = await supabase.storage.from("recipe-images").list(id);
      if (data?.length) {
        await supabase.storage.from("recipe-images").remove(data.map((f) => `${id}/${f.name}`));
      }
    } catch {}

    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore eliminazione ricetta" }, { status: 500 });
  }
}
