import { supabase } from "@/lib/supabase";
import { createDatabaseSnapshot } from "@/lib/data-safety";

const DEFAULT_CATEGORIES = [
  "Colazione",
  "Merenda",
  "Primi piatti",
  "Secondi piatti",
  "Contorni",
  "Dessert"
];

async function readCategories() {
  const { data, error } = await supabase.from("categories").select("id,name").order("name");
  if (error) throw error;
  return data || [];
}

export async function GET() {
  try {
    let categories = await readCategories();
    if (!categories.length) {
      await supabase.from("categories").upsert(DEFAULT_CATEGORIES.map((name) => ({ name })), { onConflict: "name" });
      categories = await readCategories();
      await createDatabaseSnapshot("default-categories").catch(() => {});
    }
    return Response.json(categories, { headers: { "cache-control": "no-store, max-age=0" } });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore caricamento categorie" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name } = await request.json();
    const clean = String(name || "").trim();
    if (!clean) return Response.json({ error: "Nome categoria mancante" }, { status: 400 });

    const { data, error } = await supabase
      .from("categories")
      .upsert({ name: clean }, { onConflict: "name" })
      .select("id,name")
      .single();

    if (error) throw error;
    await createDatabaseSnapshot("category-save").catch(() => {});
    return Response.json(data);
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore creazione categoria" }, { status: 500 });
  }
}
