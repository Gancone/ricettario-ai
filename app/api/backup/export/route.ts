import { exportCurrentBackup, exportCurrentBackupZip } from "@/lib/data-safety";
import { guard } from "@/lib/backend";
import { errorResponse } from "@/lib/validation";
export async function GET(request: Request) {
  const auth = await guard(request, "backup"); if (auth) return auth;
  try {
    if (new URL(request.url).searchParams.get("format") === "zip") {
      const payload = await exportCurrentBackupZip();
      const date = new Date().toISOString().slice(0, 10);
      return new Response(new Uint8Array(payload), { headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="backup-ricettario-${date}.zip"`, "cache-control": "no-store" } });
    }
    const payload = await exportCurrentBackup();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="backup-ricettario-${date}.json"`,
        "cache-control": "no-store"
      }
    });
  } catch (error) { return errorResponse(error); }
}
