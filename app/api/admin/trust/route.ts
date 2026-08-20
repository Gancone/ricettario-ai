import { isAppAuthenticated, requireAppAuth } from "@/lib/app-auth";
export async function GET(request: Request) {
  return Response.json({ trusted: isAppAuthenticated(request), configured: true }, { headers: { "cache-control": "no-store" } });
}
export async function POST(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  return Response.json({ trusted: true });
}
export async function DELETE(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  return Response.json({ trusted: true });
}
