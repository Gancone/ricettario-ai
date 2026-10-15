import { guard } from "@/lib/backend";
import { importPortableBackup } from "@/lib/portable-backup";
import { supabase } from "@/lib/supabase";
import { BACKUP_BUCKET } from "@/lib/data-safety";
import { errorResponse, HttpError, readForm, readJson } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 300;
export async function POST(request: Request) {
  const auth = await guard(request, "backup");
  if (auth) return auth;
  try {
    let bytes: Buffer;
    if (request.headers.get("content-type")?.includes("application/json")) {
      const body = await readJson(request);
      if (
        typeof body.uploadPath !== "string" ||
        !/^imports\/[0-9a-f-]{36}\.zip$/.test(body.uploadPath)
      )
        throw new HttpError(400, "Percorso backup non valido.");
      const { data, error } = await supabase.storage
        .from(BACKUP_BUCKET)
        .download(body.uploadPath);
      if (error || !data)
        throw new HttpError(422, "Backup caricato non disponibile.");
      if (data.size > 50 * 1024 * 1024)
        throw new HttpError(413, "Backup oltre 50 MB.");
      bytes = Buffer.from(await data.arrayBuffer());
    } else {
      const form = await readForm(request, 4 * 1024 * 1024);
      const file = form.get("file") || form.get("backup");
      if (!(file instanceof File) || !file.size)
        throw new HttpError(400, "Seleziona un backup ZIP.");
      if (form.get("mode") && form.get("mode") !== "additive")
        throw new HttpError(400, "Il backup si importa solo in modo additivo.");
      bytes = Buffer.from(await file.arrayBuffer());
    }
    return Response.json(await importPortableBackup(bytes));
  } catch (error) {
    return errorResponse(error);
  }
}
