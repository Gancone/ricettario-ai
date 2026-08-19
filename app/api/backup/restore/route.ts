import { createDatabaseSnapshot, restoreLatestSnapshotAdditively } from "@/lib/data-safety";
export async function POST() {
  try {
    const result = await restoreLatestSnapshotAdditively();
    if (result.restored) await createDatabaseSnapshot("post-restore").catch(() => {});
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ error: error?.message || "Ripristino non riuscito" }, { status: 500 });
  }
}
