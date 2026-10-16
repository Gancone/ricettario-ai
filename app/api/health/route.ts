import { requireAppAuth } from "@/lib/app-auth";
import { supabase } from "@/lib/supabase";
import pkg from "@/package.json";
export async function GET(request: Request) {
  const auth = requireAppAuth(request);
  if (auth) return auth;
  try {
    const checks = await Promise.all([
      supabase.from("schema_migrations").select("id").order("id"),
      supabase.from("recipes").select("id", { count: "exact", head: true }),
    ]);
    if (checks.some((check) => check.error)) throw new Error("database");
    const applied = (checks[0].data || []).map((row) => row.id);
    const ready = applied.includes("005_recipe_gallery");
    return Response.json(
      {
        ok: ready,
        version: pkg.version,
        schema: { required: "005_recipe_gallery", applied, ready },
        database: { reachable: true, recipes: checks[1].count ?? 0 },
        aiCalls: 0,
      },
      { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json(
      {
        ok: false,
        version: pkg.version,
        database: { reachable: false },
        aiCalls: 0,
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
