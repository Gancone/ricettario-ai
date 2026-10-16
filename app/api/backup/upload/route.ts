import { randomUUID } from "node:crypto";
import { guard } from "@/lib/backend";
import { ensureBucket, BACKUP_BUCKET } from "@/lib/data-safety";
import { supabase } from "@/lib/supabase";
import { errorResponse } from "@/lib/validation";
export async function POST(request: Request) {
  const auth = await guard(request, "backup");
  if (auth) return auth;
  try {
    await ensureBucket();
    const path = "imports/" + randomUUID() + ".zip";
    const { data, error } = await supabase.storage
      .from(BACKUP_BUCKET)
      .createSignedUploadUrl(path, { upsert: false });
    if (error) throw error;
    return Response.json(
      { path, signedUrl: data.signedUrl, maxBytes: 50 * 1024 * 1024 },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
