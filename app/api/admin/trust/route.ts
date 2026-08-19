import { UPDATE_COOKIE, isTrustedUpdateDevice, safeEqual, trustedValue } from "@/lib/update-auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const password = process.env.UPDATE_PASSWORD || "";
  return Response.json({ trusted: isTrustedUpdateDevice(request, password), configured: !!password });
}

export async function POST(request: Request) {
  const password = process.env.UPDATE_PASSWORD || "";
  if (!password) return Response.json({ error: "UPDATE_PASSWORD non è configurata su Vercel." }, { status: 503 });

  const body = await request.json().catch(() => ({}));
  const supplied = String(body?.password || "");
  if (!safeEqual(supplied, password)) {
    return Response.json({ error: "Password non corretta." }, { status: 401 });
  }

  return new Response(JSON.stringify({ trusted: true }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${UPDATE_COOKIE}=${encodeURIComponent(trustedValue(password))}; Path=/api/admin; Max-Age=31536000; HttpOnly; Secure; SameSite=Strict`
    }
  });
}

export async function DELETE() {
  return new Response(JSON.stringify({ trusted: false }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "set-cookie": `${UPDATE_COOKIE}=; Path=/api/admin; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
    }
  });
}
