import { supabase } from "@/lib/supabase";
import { createDatabaseSnapshot } from "@/lib/data-safety";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await createDatabaseSnapshot("pre-category-delete").catch(() => {});
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw error;
    await createDatabaseSnapshot("category-delete").catch(() => {});
    return Response.json({ success: true });
  } catch (error: any) {
    return Response.json({ error: error?.message || "Errore eliminazione categoria" }, { status: 500 });
  }
}
