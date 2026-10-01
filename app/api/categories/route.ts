import { supabase } from "@/lib/supabase";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import { DEFAULT_CATEGORY_NAMES } from "@/lib/categories";
import { guard, requireSchema } from "@/lib/backend";
import { categorySchema, readJson, errorResponse } from "@/lib/validation";

async function ensureDefaults() {
  const { error } = await supabase
    .from("categories")
    .upsert(DEFAULT_CATEGORY_NAMES.map((name) => ({ name })), { onConflict: "name" });
  if (error) throw error;
}

async function readCategories() {
  const { data, error } = await supabase.from("categories").select("id,name").order("name");
  if (error) throw error;
  return data || [];
}

export async function GET(request: Request) {
  const auth = await guard(request);
  if (auth) return auth;
  try {
    await requireSchema();
    await ensureDefaults();
    const categories = await readCategories();
    return Response.json(categories, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  const auth = await guard(request, "write");
  if (auth) return auth;
  try {
    await requireSchema();
    const { name } = categorySchema.parse(await readJson(request, 32 * 1024));

    const { data, error } = await supabase
      .from("categories")
      .upsert({ name }, { onConflict: "name" })
      .select("id,name")
      .single();

    if (error) throw error;
    await createDatabaseSnapshot("category-save").catch(() => {});
    return Response.json(data);
  } catch (error) { return errorResponse(error); }
}
