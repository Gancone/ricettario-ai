import { createDatabaseSnapshot } from "@/lib/data-safety";
import { requireAppAuth } from "@/lib/app-auth";
export async function POST(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try { return Response.json(await createDatabaseSnapshot("manual")); }
  catch (error: any) { return Response.json({ error: error?.message || "Backup non riuscito" }, { status: 500 }); }
}
