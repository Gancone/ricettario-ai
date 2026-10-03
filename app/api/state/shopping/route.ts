import { guard, requireSchema } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { shoppingItemSchema, readJson, errorResponse, HttpError } from "@/lib/validation";

export type ShoppingStateItem = { id: string; text: string; source: string; done: boolean; quantity?: number | null; unit?: string | null; recipe_id?: string | null };

export async function GET(request: Request) {
  const auth = await guard(request); if (auth) return auth;
  try { await requireSchema(); const { data, error } = await supabase.rpc("shopping_read"); if (error) throw error; return Response.json(data, { headers: { "cache-control": "no-store" } }); }
  catch (error) { return errorResponse(error); }
}

export async function PUT(request: Request) {
  const auth = await guard(request, "write"); if (auth) return auth;
  try {
    await requireSchema(); const body = await readJson(request, 2 * 1024 * 1024); const items = Array.isArray(body?.items) && body.items.length <= 10000 ? body.items.map((item: unknown) => shoppingItemSchema.parse(item)) : null;
    if (!items) throw new HttpError(400, "Lista non valida o superiore a 10000 elementi.");
    const result = await supabase.rpc("shopping_apply", { p_expected: body.revision ?? null, p_items: items, p_replace: true }); if (result.error) throw result.error;
    if (result.data?.conflict) return Response.json(result.data, { status: 409 });
    return Response.json(result.data);
  } catch (error) { return errorResponse(error); }
}
