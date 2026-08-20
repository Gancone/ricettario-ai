import { requireAppAuth } from "@/lib/app-auth";
import { persistRecipeImageBytes } from "@/lib/image-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireAppAuth(request);
  if (auth) return auth;

  try {
    const form = await request.formData();
    const recipeId = String(form.get("recipeId") || "").trim();
    const image = form.get("image") as File | null;
    if (!recipeId || !image || image.size === 0) {
      return Response.json({ error: "Immagine o ID ricetta mancante." }, { status: 400 });
    }
    if (image.size > 5 * 1024 * 1024) {
      return Response.json({ error: "Immagine troppo grande. Massimo 5 MB." }, { status: 413 });
    }
    const contentType = String(image.type || "image/jpeg").toLowerCase();
    if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
      return Response.json({ error: "Formato immagine non supportato." }, { status: 415 });
    }
    const url = await persistRecipeImageBytes(recipeId, Buffer.from(await image.arrayBuffer()), contentType);
    return Response.json({ imageUrl: url });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Caricamento immagine non riuscito." }, { status: 500 });
  }
}
