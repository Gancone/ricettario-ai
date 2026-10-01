import { createDatabaseSnapshot } from "@/lib/data-safety";
import { guard } from "@/lib/backend";
import { errorResponse } from "@/lib/validation";
export async function POST(request: Request) {
  const auth = await guard(request, "backup"); if (auth) return auth;
  try { return Response.json(await createDatabaseSnapshot("manual")); }
  catch (error) { return errorResponse(error); }
}
