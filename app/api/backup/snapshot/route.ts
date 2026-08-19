import { createDatabaseSnapshot } from "@/lib/data-safety";
export async function POST() {
  try { return Response.json(await createDatabaseSnapshot("manual")); }
  catch (error: any) { return Response.json({ error: error?.message || "Backup non riuscito" }, { status: 500 }); }
}
