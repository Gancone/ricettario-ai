import { requireAppAuth } from "@/lib/app-auth";
import { readJsonState, writeJsonState } from "@/lib/cloud-state";

export type ShoppingStateItem = { id: string; text: string; source: string; done: boolean };

export async function GET(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  const items = await readJsonState<ShoppingStateItem[]>("shopping.json", []);
  return Response.json(Array.isArray(items) ? items : [], { headers: { "cache-control": "no-store" } });
}

export async function PUT(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  try {
    const body = await request.json();
    const items = Array.isArray(body?.items) ? body.items.slice(0, 1000) : [];
    await writeJsonState("shopping.json", items);
    return Response.json({ success: true, items });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Sincronizzazione lista non riuscita." }, { status: 500 });
  }
}
