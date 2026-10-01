import { supabase } from "@/lib/supabase";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import { guard } from "@/lib/backend";
import { errorResponse } from "@/lib/validation";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await guard(request, "write");
  if (auth) return auth;
  try {
    const { id } = await params;
    await createDatabaseSnapshot("pre-category-delete");
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) throw error;
    await createDatabaseSnapshot("post-category-delete");
    return Response.json({ success: true });
  } catch (error) { return errorResponse(error); }
}
