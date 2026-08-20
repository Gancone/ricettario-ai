import { clearAuthCookieHeader } from "@/lib/app-auth";

export async function POST() {
  return Response.json(
    { success: true },
    { headers: { "set-cookie": clearAuthCookieHeader(), "cache-control": "no-store" } }
  );
}
