import { supabase } from "@/lib/supabase";
import { fromDb, toDb } from "@/lib/recipe-map";
import { persistRecipeImage } from "@/lib/image-storage";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import { requireAppAuth } from "@/lib/app-auth";
import type { Recipe } from "@/types/recipe";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireAppAuth(request);
  if (auth) return auth;
  try {
    const { id } = await params;
    const recipe = (await request.json()) as Recipe;

    // Se il backup precedente alla modifica fallisce, la modifica viene bloccata.
    await createDatabaseSnapshot("pre-recipe-edit");

    const stableImageUrl = await persistRecipeImage(id, recipe.imageUrl);
    const { data, error } = await supabase
      .from("recipes")
      .update(toDb({ ...recipe, imageUrl: stableImageUrl }))
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;
    let backupWarning = "";
    try { await createDatabaseSnapshot("post-recipe-edit"); }
    catch (e: any) { backupWarning = e?.message || "Backup successivo non riuscito"; }
    return Response.json({ ...fromDb(data), backupWarning });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore modifica ricetta" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = requireAppAuth(request);
  if (auth) return auth;
  return Response.json(
    { error: "La cancellazione permanente è disattivata. Usa Archivia: la ricetta resterà recuperabile." },
    { status: 405, headers: { Allow: "PATCH" } }
  );
}
