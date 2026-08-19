import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { supabase } from "@/lib/supabase";
import { persistRecipeImage } from "@/lib/image-storage";
import { downloadYtDlpThumbnailDataUrl } from "@/lib/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 300;

function isStable(url?: string | null) {
  return !!url && url.includes("/storage/v1/object/public/recipe-images/");
}

export async function POST() {
  const { data, error } = await supabase
    .from("recipes")
    .select("id, source_url, image_url")
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const candidates = (data || []).filter((r) => r.source_url && !isStable(r.image_url)).slice(0, 20);
  const updated: Array<{ id: string; imageUrl: string }> = [];

  for (const recipe of candidates) {
    let workdir = "";
    try {
      let stable = await persistRecipeImage(recipe.id, recipe.image_url || "");
      if (!isStable(stable)) {
        workdir = await mkdtemp(path.join(tmpdir(), "ricettario-thumb-"));
        const dataUrl = await downloadYtDlpThumbnailDataUrl(recipe.source_url, workdir);
        if (dataUrl) stable = await persistRecipeImage(recipe.id, dataUrl);
      }
      if (isStable(stable) && stable !== recipe.image_url) {
        const { error: updateError } = await supabase.from("recipes").update({ image_url: stable }).eq("id", recipe.id);
        if (!updateError) updated.push({ id: recipe.id, imageUrl: stable });
      }
    } catch {}
    finally { if (workdir) try { await rm(workdir, { recursive: true, force: true }); } catch {} }
  }

  const remaining = Math.max(0, (data || []).filter((r) => r.source_url && !isStable(r.image_url)).length - updated.length);
  return Response.json({ updated, remaining });
}
