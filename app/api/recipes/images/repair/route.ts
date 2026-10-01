import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { persistRecipeImage, persistRecipeImageBytes } from "@/lib/image-storage";
import { downloadYtDlpThumbnailBytes } from "@/lib/ytdlp";
import { guard, pages } from "@/lib/backend";
import { applyRecipe } from "@/lib/recipe-store";
import { errorResponse } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;
const BATCH_SIZE = 20;
function isStable(url?: string | null) { return !!url && url.includes("/storage/v1/object/public/recipe-images/"); }

export async function POST(request: Request) {
  const auth = await guard(request, "image"); if (auth) return auth;
  try {
    const candidates: any[] = [];
    for await (const batch of pages("recipes", "id,revision,source_url,image_url", 100)) {
      for (const row of batch) {
        if (row.source_url && !isStable(row.image_url)) candidates.push(row);
        if (candidates.length >= BATCH_SIZE) break;
      }
      if (candidates.length >= BATCH_SIZE) break;
    }
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
          const saved = await applyRecipe(recipe.id, recipe.revision ?? 1, { image_url: stable }, "before_update");
          updated.push({ id: saved.id, imageUrl: saved.imageUrl || stable });
        }
      } catch {}
      finally { if (workdir) try { await rm(workdir, { recursive: true, force: true }); } catch {} }
    }
    return Response.json({ updated, processed: candidates.length, remainingUnknown: candidates.length === BATCH_SIZE });
  } catch (error) { return errorResponse(error); }
}
