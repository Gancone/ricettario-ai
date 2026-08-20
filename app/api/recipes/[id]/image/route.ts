import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { supabase } from "@/lib/supabase";
import { persistRecipeImage, persistRecipeImageBytes } from "@/lib/image-storage";
import { downloadYtDlpThumbnailBytes } from "@/lib/ytdlp";
import { requireAppAuth } from "@/lib/app-auth";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = requireAppAuth(request); if (auth) return auth;
  let workdir = "";
  try {
    const { id } = await params;
    const contentType = request.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const image = form.get("image") as File | null;
      if (!image || image.size === 0) return Response.json({ error: "Seleziona una foto." }, { status: 400 });
      if (image.size > 5 * 1024 * 1024) return Response.json({ error: "Foto troppo grande. Massimo 5 MB." }, { status: 413 });
      const mime = String(image.type || "image/jpeg").toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp"].includes(mime)) return Response.json({ error: "Formato foto non supportato." }, { status: 415 });
      const stable = await persistRecipeImageBytes(id, Buffer.from(await image.arrayBuffer()), mime);
      const { error } = await supabase.from("recipes").update({ image_url: stable }).eq("id", id);
      if (error) throw error;
      return Response.json({ imageUrl: stable });
    }

    const { data: recipe, error } = await supabase
      .from("recipes")
      .select("id, source_url, image_url")
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
