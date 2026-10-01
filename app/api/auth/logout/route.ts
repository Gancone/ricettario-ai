import { clearAuthCookieHeader, requireSameOrigin } from "@/lib/app-auth";

export async function POST(request: Request) {
  const origin = requireSameOrigin(request); if (origin) return origin;
  return Response.json(
    { success: true },
    { headers: { "set-cookie": clearAuthCookieHeader(), "cache-control": "no-store" } }
  );
}
