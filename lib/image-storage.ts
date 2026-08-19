import { supabase } from "@/lib/supabase";

const BUCKET = "recipe-images";
let bucketEnsured = false;

async function ensureBucket() {
  if (bucketEnsured) return;

  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
      fileSizeLimit: "5MB"
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketEnsured = true;
}

function extensionFor(contentType: string) {
  if (contentType.includes("png")) return "png";
  if (contentType.includes("webp")) return "webp";
  return "jpg";
}

export async function persistRecipeImage(recipeId: string, imageUrl?: string) {
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return imageUrl || "";
  if (imageUrl.includes("/storage/v1/object/public/recipe-images/")) return imageUrl;

  try {
    const response = await fetch(imageUrl, {
      headers: { "user-agent": "Mozilla/5.0 RicettarioAI/4.0" },
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) return imageUrl;

    const contentType = response.headers.get("content-type") || "image/jpeg";
    if (!contentType.startsWith("image/")) return imageUrl;

    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5 * 1024 * 1024) return imageUrl;

    await ensureBucket();
    const path = `${recipeId}/cover.${extensionFor(contentType)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000"
    });
    if (error) return imageUrl;

    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  } catch {
    return imageUrl;
  }
}
