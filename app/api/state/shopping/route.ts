import { requireAppAuth } from "@/lib/app-auth";
import { readJsonState, writeJsonState } from "@/lib/cloud-state";
import { validShoppingItems } from "@/lib/shopping";

export type ShoppingStateItem = { id: string; text: string; source: string; done: boolean };

export async function GET(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const items = await readJsonState<ShoppingStateItem[]>("shopping.json", []);
    if (!validShoppingItems(items)) throw new Error("Lista salvata non valida. La copia locale è ancora disponibile.");
    return Response.json(items, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "Lista cloud non disponibile. Riprova tra poco." }, { status: 503 }); }
}

export async function PUT(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const body = await request.json();
    if (!validShoppingItems(body?.items)) return Response.json({ error: "Lista non valida o superiore a 1000 elementi." }, { status: 400 });
    const items = body.items;
    await writeJsonState("shopping.json", items);
    return Response.json({ success: true, items });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Sincronizzazione lista non riuscita." }, { status: 500 });
  }
}
