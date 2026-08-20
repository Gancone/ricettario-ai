import { authCookieHeader, configuredAppPassword, validPassword } from "@/lib/app-auth";

export async function POST(request: Request) {
  try {
    const { password = "" } = await request.json().catch(() => ({}));
    if (!configuredAppPassword()) {
      return Response.json({ success: true, configured: false });
    }
    if (!validPassword(String(password))) {
      return Response.json({ error: "Password non corretta." }, { status: 401 });
    }
    return Response.json(
      { success: true, configured: true },
      { headers: { "set-cookie": authCookieHeader(), "cache-control": "no-store" } }
    );
  } catch {
    return Response.json({ error: "Accesso non riuscito." }, { status: 500 });
  }
}
