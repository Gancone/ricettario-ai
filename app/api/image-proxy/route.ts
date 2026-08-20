import { requireAppAuth } from "@/lib/app-auth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const url = new URL(request.url).searchParams.get("url") || "";
    if (!/^https?:\/\//i.test(url)) return new Response("URL non valido", { status: 400 });
    const upstream = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 Chrome/130 Safari/537.36", accept: "image/*,*/*;q=0.8", referer: "https://www.instagram.com/" },
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) return new Response("Immagine non disponibile", { status: 404 });
    const type = (upstream.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!type.startsWith("image/")) return new Response("Contenuto non immagine", { status: 415 });
    return new Response(await upstream.arrayBuffer(), { headers: { "content-type": type, "cache-control": "private, max-age=86400" } });
  } catch { return new Response("Immagine non disponibile", { status: 404 }); }
}
