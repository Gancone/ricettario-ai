import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { supabase } from "@/lib/supabase";
import { persistRecipeImage } from "@/lib/image-storage";
import { downloadYtDlpThumbnailDataUrl } from "@/lib/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let workdir = "";
  try {
    const { id } = await params;
    const { data: recipe, error } = await supabase
      .from("recipes")
      .select("id, source_url, image_url")
      .eq("id", id)
      .single();
    if (error) throw error;

    let stable = await persistRecipeImage(id, recipe.image_url || "");
    if ((!stable || stable === recipe.image_url) && recipe.source_url) {
      workdir = await mkdtemp(path.join(tmpdir(), "ricettario-thumb-"));
      const dataUrl = await downloadYtDlpThumbnailDataUrl(recipe.source_url, workdir);
      if (dataUrl) stable = await persistRecipeImage(id, dataUrl);
    }

    if (!stable) return Response.json({ error: "Non sono riuscito a recuperare una copertina per questa ricetta." }, { status: 404 });
    if (stable !== recipe.image_url) {
      const { error: updateError } = await supabase.from("recipes").update({ image_url: stable }).eq("id", id);
      if (updateError) throw updateError;
    }
    return Response.json({ imageUrl: stable });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Immagine non disponibile" }, { status: 500 });
  } finally {
    if (workdir) try { await rm(workdir, { recursive: true, force: true }); } catch {}
  }
}
