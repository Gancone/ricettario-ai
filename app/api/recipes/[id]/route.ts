import { supabase } from "@/lib/supabase";
import { fromDb, toDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import { createDatabaseSnapshot } from "@/lib/data-safety";
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
    await createDatabaseSnapshot("recipe-edit").catch(() => {});
    return Response.json(fromDb(data));
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore modifica ricetta" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json(
    {
      error: "La cancellazione permanente è disattivata per proteggere il ricettario. Le ricette non vengono eliminate dal database."
    },
    { status: 405, headers: { Allow: "PATCH" } }
  );
}
