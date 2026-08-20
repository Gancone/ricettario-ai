import { exportCurrentBackup } from "@/lib/data-safety";
import { requireAppAuth } from "@/lib/app-auth";
export async function GET(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const payload = await exportCurrentBackup();
    const date = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="backup-ricettario-${date}.json"`,
        "cache-control": "no-store"
      }
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Esportazione backup non riuscita" }, { status: 500 });
  }
}
