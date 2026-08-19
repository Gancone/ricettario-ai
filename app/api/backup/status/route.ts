import { backupStatus } from "@/lib/data-safety";
export async function GET() {
  try { return Response.json(await backupStatus(), { headers: { "cache-control": "no-store" } }); }
  catch (error: any) { return Response.json({ error: error?.message || "Backup non disponibile" }, { status: 500 }); }
}
