import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { supabase } from "@/lib/supabase";
import { persistRecipeImage, persistRecipeImageBytes } from "@/lib/image-storage";
import { downloadYtDlpThumbnailBytes } from "@/lib/ytdlp";
import { requireAppAuth } from "@/lib/app-auth";

export const runtime = "nodejs";
export const maxDuration = 300;
function isStable(url?: string | null) { return !!url && url.includes("/storage/v1/object/public/recipe-images/"); }

export async function POST(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  const { data, error } = await supabase.from("recipes").select("id, source_url, image_url").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const candidates = (data || []).filter((r) => r.source_url && !isStable(r.image_url)).slice(0, 8);
  const updated: Array<{ id: string; imageUrl: string }> = [];
  for (const recipe of candidates) {
    let workdir = "";
    try {
      let stable = await persistRecipeImage(recipe.id, recipe.image_url || "");
      if (!isStable(stable)) {
        workdir = await mkdtemp(path.join(tmpdir(), "ricettario-thumb-"));
        const thumb = await downloadYtDlpThumbnailBytes(recipe.source_url, workdir);
        if (thumb) stable = await persistRecipeImageBytes(recipe.id, thumb.bytes, thumb.contentType);
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
