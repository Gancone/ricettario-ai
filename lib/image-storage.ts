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

function parseDataUrl(value: string) {
  const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/i);
  if (!match) return null;
  try {
    return { contentType: match[1].toLowerCase(), bytes: Buffer.from(match[2], "base64") };
  } catch {
    return null;
  }
}

export async function persistRecipeImage(recipeId: string, imageUrl?: string) {
  if (!imageUrl) return "";
  if (imageUrl.includes("/storage/v1/object/public/recipe-images/")) return imageUrl;

  try {
    let contentType = "image/jpeg";
    let bytes: Buffer;

    const data = parseDataUrl(imageUrl);
    if (data) {
      contentType = data.contentType;
      bytes = data.bytes;
    } else if (/^https?:\/\//i.test(imageUrl)) {
      const response = await fetch(imageUrl, {
        headers: {
          "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
          accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
          referer: "https://www.instagram.com/"
        },
        signal: AbortSignal.timeout(15000)
      });
      if (!response.ok) return imageUrl;
      contentType = (response.headers.get("content-type") || "image/jpeg").split(";")[0].trim().toLowerCase();
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) return imageUrl;
      bytes = Buffer.from(await response.arrayBuffer());
    } else {
      return imageUrl;
    }

    if (!bytes.length || bytes.length > 5 * 1024 * 1024) return imageUrl;

    await ensureBucket();
    const objectPath = `${recipeId}/cover.${extensionFor(contentType)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(objectPath, bytes, {
      contentType,
      upsert: true,
      cacheControl: "31536000"
    });
    if (error) return imageUrl;

    return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  } catch {
    return imageUrl;
  }
}
