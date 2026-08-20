import { backupStatus } from "@/lib/data-safety";
import { requireAppAuth } from "@/lib/app-auth";
export async function GET(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try { return Response.json(await backupStatus(), { headers: { "cache-control": "no-store" } }); }
  catch (error: any) { return Response.json({ error: error?.message || "Backup non disponibile" }, { status: 500 }); }
}
