import { supabase } from "@/lib/supabase";

const BUCKET = "ricettario-state";
let ready = false;

async function ensureBucket() {
  if (ready) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "2MB",
      allowedMimeTypes: ["application/json"]
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  ready = true;
}

export async function readJsonState<T>(path: string, fallback: T): Promise<T> {
    await ensureBucket();
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error) {
      if (String((error as { statusCode?: string }).statusCode) === "404" || /not found|does not exist/i.test(error.message)) return fallback;
      throw error;
    }
    if (!data) return fallback;
    return JSON.parse(await data.text()) as T;
}

export async function writeJsonState<T>(path: string, value: T) {
  await ensureBucket();
  const bytes = Buffer.from(JSON.stringify(value, null, 2), "utf8");
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/json",
    upsert: true,
    cacheControl: "0"
  });
  if (error) throw error;
}
