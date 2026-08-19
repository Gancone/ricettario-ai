export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url).searchParams.get("url") || "";
    if (!/^https?:\/\//i.test(url)) {
      return new Response("URL non valido", { status: 400 });
    }

    const upstream = await fetch(url, {
      headers: { "user-agent": "Mozilla/5.0 RicettarioAI/4.0" },
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok) return new Response("Immagine non disponibile", { status: 404 });

    const type = upstream.headers.get("content-type") || "image/jpeg";
    if (!type.startsWith("image/")) return new Response("Contenuto non immagine", { status: 415 });

    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=3600"
      }
    });
  } catch {
    return new Response("Immagine non disponibile", { status: 404 });
  }
}
