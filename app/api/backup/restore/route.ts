import { createDatabaseSnapshot, restoreLatestSnapshotAdditively } from "@/lib/data-safety";
import { requireAppAuth } from "@/lib/app-auth";
export async function POST(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const result = await restoreLatestSnapshotAdditively();
    if (result.restored) await createDatabaseSnapshot("post-restore");
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ error: error?.message || "Ripristino non riuscito" }, { status: 500 });
  }
}
