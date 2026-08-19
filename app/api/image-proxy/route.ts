export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url).searchParams.get("url") || "";
    if (!/^https?:\/\//i.test(url)) return new Response("URL non valido", { status: 400 });

    const upstream = await fetch(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: "https://www.instagram.com/"
      },
      signal: AbortSignal.timeout(15000)
    });
    if (!upstream.ok) return new Response("Immagine non disponibile", { status: 404 });

    const type = (upstream.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (!type.startsWith("image/")) return new Response("Contenuto non immagine", { status: 415 });

    return new Response(await upstream.arrayBuffer(), {
      headers: {
        "content-type": type,
        "cache-control": "public, max-age=86400, stale-while-revalidate=604800"
      }
    });
  } catch {
    return new Response("Immagine non disponibile", { status: 404 });
  }
}
