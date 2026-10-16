import { exportCurrentBackup, exportCurrentBackupZip } from "@/lib/data-safety";
import { guard } from "@/lib/backend";
import { errorResponse } from "@/lib/validation";
import { randomUUID } from "node:crypto";
import { supabase } from "@/lib/supabase";
import { ensureBucket, BACKUP_BUCKET } from "@/lib/data-safety";
export const maxDuration = 300;
export async function GET(request: Request) {
  const auth = await guard(request, "backup");
  if (auth) return auth;
  try {
    if (new URL(request.url).searchParams.get("format") === "zip") {
      const payload = await exportCurrentBackupZip();
      const date = new Date().toISOString().slice(0, 10);
      if (payload.length > 50 * 1024 * 1024)
        throw new Error(
          "Il backup supera 50 MB. Esporta i dati in JSON e conserva anche le fotografie da Storage.",
        );
      await ensureBucket();
      const path = `portable/${randomUUID()}/Ricettario-AI-backup-${date}.zip`;
      const upload = await supabase.storage
        .from(BACKUP_BUCKET)
        .upload(path, payload, {
          contentType: "application/zip",
          upsert: false,
        });
      if (upload.error) throw upload.error;
      const { data, error } = await supabase.storage
        .from(BACKUP_BUCKET)
        .createSignedUrl(path, 300, {
          download: `Ricettario-AI-backup-${date}.zip`,
        });
      if (error) throw error;
      return new Response(null, {
        status: 303,
        headers: { location: data.signedUrl, "cache-control": "no-store" },
      });
    }
    const payload = await exportCurrentBackup();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="backup-ricettario-${date}.json"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
