import AdmZip from "adm-zip";
import { createHash } from "node:crypto";
import { guard, requireSchema } from "@/lib/backend";
import { createDatabaseSnapshot, newReport, restoreRows } from "@/lib/data-safety";
import { persistRecipeImageBytes } from "@/lib/image-storage";
import { backupZipManifestSchema, errorResponse, HttpError, readForm } from "@/lib/validation";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_ZIP_BYTES = 100 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 120 * 1024 * 1024;
function safePath(value: string) { const p = value.replace(/\\/g, "/"); return !!p && !p.startsWith("/") && !p.split("/").includes("..") && !p.includes("\0") && !p.startsWith(".git/"); }
function typeFor(name: string) { const ext = name.toLowerCase().split(".").pop(); return ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg"; }

export async function POST(request: Request) {
  const auth = await guard(request, "backup"); if (auth) return auth;
  try {
    await requireSchema();
    const form = await readForm(request, MAX_ZIP_BYTES + 256 * 1024);
    const file = form.get("file") || form.get("backup");
    if (!(file instanceof File) || !file.size) throw new HttpError(400, "Seleziona un backup ZIP.");
    if (file.size > MAX_ZIP_BYTES) throw new HttpError(413, "Backup ZIP troppo grande.");
    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    const entries = zip.getEntries().filter((entry) => !entry.isDirectory);
    if (!entries.length || entries.length > 10000 || entries.some((entry) => !safePath(entry.entryName))) throw new HttpError(400, "Backup ZIP non valido.");
    const totalSize = entries.reduce((sum, entry) => sum + Number(entry.header.size || 0), 0);
    if (totalSize > MAX_UNCOMPRESSED_BYTES) throw new HttpError(413, "Backup decompresso troppo grande.");
    const byPath = new Map(entries.map((entry) => [entry.entryName.replace(/\\/g, "/"), entry]));
    const manifestEntry = byPath.get("manifest.json");
    if (!manifestEntry) throw new HttpError(400, "Manifest backup mancante.");
    const manifest = backupZipManifestSchema.parse(JSON.parse(manifestEntry.getData().toString("utf8")));
    for (const item of manifest.files) {
      if (!safePath(item.path)) throw new HttpError(400, "Percorso manifest non consentito.");
      const entry = byPath.get(item.path); if (!entry) throw new HttpError(422, "File backup mancante.");
      const bytes = entry.getData(); if (bytes.length !== item.bytes || createHash("sha256").update(bytes).digest("hex") !== item.checksum) throw new HttpError(422, "Checksum backup non valido.");
    }
    const readJsonFile = (name: string) => { const entry = byPath.get(name); if (!entry) return []; const value = JSON.parse(entry.getData().toString("utf8")); if (!Array.isArray(value)) throw new HttpError(422, `File ${name} non valido.`); return value; };
    const recipes: any[] = readJsonFile("data/recipes.json");
    const categories: any[] = readJsonFile("data/categories.json");
    const shopping: any[] = readJsonFile("data/shopping_items.json");
    const mode = String(form.get("mode") || "additive");
    if (mode !== "additive" && mode !== "overwrite") throw new HttpError(400, "Modalità import non valida.");
    if (mode === "overwrite" && String(form.get("confirm") || "") !== "OVERWRITE_WITH_HISTORY") throw new HttpError(400, "Conferma esplicita obbligatoria.");
    const revisions = JSON.parse(String(form.get("expectedRevisions") || "{}"));
    if (!revisions || typeof revisions !== "object" || Array.isArray(revisions)) throw new HttpError(400, "expectedRevisions non valido.");
    if (mode === "overwrite") { const safety = await createDatabaseSnapshot("pre-explicit-import"); if (safety.suspicious) throw new HttpError(409, "Backup sospetto: sovrascrittura bloccata."); }
    for (const raw of recipes) {
      const id = String(raw?.id || "");
      if (!id) continue;
      const image = entries.find((entry) => entry.entryName.replace(/\\/g, "/").startsWith(`images/${id}/`));
      if (image) { const bytes = image.getData(); raw.image_url = await persistRecipeImageBytes(id, bytes, typeFor(image.entryName)); }
    }
    const report = newReport(); await restoreRows(recipes, report, mode === "overwrite", revisions as Record<string, number>);
    for (const row of categories) {
      if (typeof row?.name !== "string" || !row.name.trim()) { report.errors.push({ id: "category", error: "Categoria non valida" }); continue; }
      const { error } = await supabase.from("categories").insert({ name: row.name.trim().slice(0, 120) }); if (error && error.code !== "23505") report.errors.push({ id: "category", error: "Categoria non importata" }); else if (!error) report.inserted++;
    }
    if (shopping.length) { const { error } = await supabase.rpc("shopping_apply", { p_expected: null, p_items: shopping, p_replace: false }); if (error) report.errors.push({ id: "shopping", error: "Lista non importata" }); }
    return Response.json({ ...report, imported: true, mode });
  } catch (error) { return errorResponse(error); }
}
