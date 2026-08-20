import { configuredAppPassword, isAppAuthenticated } from "@/lib/app-auth";

export async function GET(request: Request) {
  return Response.json(
    {
      configured: Boolean(configuredAppPassword()),
      authenticated: isAppAuthenticated(request)
    },
    { headers: { "cache-control": "no-store" } }
  );
}
