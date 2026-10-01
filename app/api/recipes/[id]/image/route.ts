import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { supabase } from "@/lib/supabase";
import { persistRecipeImage, persistRecipeImageBytes } from "@/lib/image-storage";
import { downloadYtDlpThumbnailBytes } from "@/lib/ytdlp";
import { guard } from "@/lib/backend";
import { applyRecipe } from "@/lib/recipe-store";
import { errorResponse, readForm, uuid } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await guard(request, "image"); if (auth) return auth;
  let workdir = "";
  try {
    const { id: rawId } = await params;
    const id = uuid.parse(rawId);
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await readForm(request, 6 * 1024 * 1024);
      const image = form.get("image") as File | null;
      if (!image || image.size === 0) return Response.json({ error: "Seleziona una foto." }, { status: 400 });
      if (image.size > 5 * 1024 * 1024) return Response.json({ error: "Foto troppo grande. Massimo 5 MB." }, { status: 413 });
      const mime = String(image.type || "image/jpeg").toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return Response.json({ error: "Formato foto non supportato." }, { status: 415 });
      const { data: current, error: currentError } = await supabase.from("recipes").select("*").eq("id", id).single();
      if (currentError) throw currentError;
      const stable = await persistRecipeImageBytes(id, Buffer.from(await image.arrayBuffer()), mime, false);
      return Response.json(await applyRecipe(id, current.revision ?? 1, { image_url: stable }, "before_update"));
    }

    const { data: recipe, error } = await supabase
      .from("recipes")
      .select("*")
      .eq("id", id)
      .single();
    if (error) throw error;

    let stable = await persistRecipeImage(id, recipe.image_url || "");
    if ((!stable || stable === recipe.image_url) && recipe.source_url) {
      workdir = await mkdtemp(path.join(tmpdir(), "ricettario-thumb-"));
      const thumb = await downloadYtDlpThumbnailBytes(recipe.source_url, workdir);
      if (thumb) stable = await persistRecipeImageBytes(id, thumb.bytes, thumb.contentType);
    }

    if (!stable) return Response.json({ error: "Non sono riuscito a recuperare una copertina per questa ricetta." }, { status: 404 });
    if (stable !== recipe.image_url) {
      await applyRecipe(id, recipe.revision ?? 1, { image_url: stable }, "before_update");
    }
    return Response.json({ imageUrl: stable });
  } catch (error: any) {
    return errorResponse(error);
  } finally {
    if (workdir) try { await rm(workdir, { recursive: true, force: true }); } catch {}
  }
}
