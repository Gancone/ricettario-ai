import { backupStatus } from "@/lib/data-safety";
import { guard } from "@/lib/backend";
import { errorResponse } from "@/lib/validation";
export async function GET(request: Request) {
  const auth = await guard(request); if (auth) return auth;
  try { return Response.json(await backupStatus(), { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}
