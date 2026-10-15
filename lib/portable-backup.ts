import { supabase } from "./supabase";
import { allRows } from "./backend";
import { requireKitchenSchema } from "./kitchen-server";
import { createDatabaseSnapshot, newReport, restoreRows } from "./data-safety";
import {
  IMAGE_BUCKET,
  ownImagePath,
  persistRecipeImageBytes,
  assertImage,
} from "./image-storage";
import { safeFetchExternal } from "./safe-fetch";
import { HttpError, uuid } from "./validation";
import {
  packPortableBackup,
  unpackPortableBackup,
  PORTABLE_TABLES,
  type PortableImage,
} from "./portable-format";
import { checksum, canonical } from "./backup-format";
import pkg from "../package.json";
import { validatePortableRows } from "./portable-validation";
async function dataEpoch() {
  const { data, error } = await supabase
    .from("backend_state")
    .select("revision")
    .eq("key", "data_epoch")
    .single();
  if (error) throw error;
  return data.revision;
}
export async function exportPortableBackup() {
  await requireKitchenSchema();
  const before = await dataEpoch();
  const entities: Record<string, any[]> = {};
  for (const [key, table] of Object.entries(PORTABLE_TABLES))
    entities[key] = await allRows(table);
  const references = new Map<string, string>();
  for (const row of entities.recipes)
    if (row.image_url) references.set(row.image_url, row.id);
  for (const row of entities.recipe_versions)
    if (row.snapshot?.image_url)
      references.set(row.snapshot.image_url, row.recipe_id);
  const images: PortableImage[] = [];
  let imageBytes = 0;
  for (const [url, id] of references) {
    uuid.parse(id);
    const own = ownImagePath(url);
    let bytes: Buffer, type: string;
    if (own) {
      const { data, error } = await supabase.storage
        .from(IMAGE_BUCKET)
        .download(own);
      if (error || !data)
        throw new HttpError(
          422,
          "Una foto non è disponibile. Backup completo non creato; i dati esistenti restano conservati.",
        );
      bytes = Buffer.from(await data.arrayBuffer());
      type = data.type;
    } else if (url.startsWith("data:")) {
      const match = url.match(
        /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/,
      );
      if (!match || url.length > 8 * 1024 * 1024)
        throw new HttpError(422, "Foto incorporata non valida.");
      type = match[1];
      bytes = Buffer.from(match[2], "base64");
    } else {
      const remote = await safeFetchExternal(url, {
        maxBytes: 10 * 1024 * 1024,
        contentTypes: ["image/jpeg", "image/png", "image/webp"],
      });
      bytes = remote.bytes;
      type = remote.contentType;
    }
    assertImage(bytes, type);
    imageBytes += bytes.length;
    if (imageBytes > 90 * 1024 * 1024)
      throw new HttpError(
        413,
        "Foto oltre il limite del backup portabile (90 MB).",
      );
    const ext =
      type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
    images.push({
      url,
      recipeId: id,
      contentType: type,
      path: `images/${id}/${checksum(url).slice(0, 20)}.${ext}`,
      bytes,
    });
  }
  if (before !== (await dataEpoch()))
    throw new HttpError(
      409,
      "Dati modificati durante l’esportazione. Riprova: nessuna copia precedente è stata sostituita.",
    );
  return packPortableBackup(entities, images, pkg.version);
}
export async function importPortableBackup(bytes: Buffer) {
  await requireKitchenSchema();
  const archive = await unpackPortableBackup(bytes);
  validatePortableRows(archive.entities);
  for (const image of archive.images) {
    uuid.parse(image.recipeId);
    assertImage(archive.files.get(image.path)!, image.contentType);
  }
  const safety = await createDatabaseSnapshot("pre-portable-import");
  if (!safety.verified || safety.suspicious)
    throw new HttpError(
      409,
      "Backup preventivo non verificato: importazione bloccata.",
    );
  const report = newReport();
  const imageMap = new Map<string, string>();
  for (const row of archive.entities.recipes) {
    uuid.parse(row.id);
    const { data, error } = await supabase
      .from("recipes")
      .select("id")
      .eq("id", row.id)
      .maybeSingle();
    if (error) throw error;
    if (data) {
      await restoreRows([row], report);
      continue;
    }
    const mapping = archive.images.find(
      (image: any) => image.url === row.image_url,
    );
    const legacyImage = [...archive.files.keys()].find((file) =>
      file.startsWith(`images/${row.id}/`),
    );
    const file = mapping?.path || legacyImage;
    if (file) {
      const photo = archive.files.get(file)!;
      const mime =
        mapping?.contentType ||
        (file.endsWith(".png")
          ? "image/png"
          : file.endsWith(".webp")
            ? "image/webp"
            : "image/jpeg");
      const restored = await persistRecipeImageBytes(row.id, photo, mime);
      if (row.image_url) imageMap.set(row.image_url, restored);
      row.image_url = restored;
    }
    await restoreRows([row], report);
  }
  for (const [key, table] of Object.entries(PORTABLE_TABLES)) {
    if (key === "recipes") continue;
    for (const raw of archive.entities[key]) {
      const row = { ...raw };
      if (key === "categories") {
        if (typeof row.name !== "string" || !row.name.trim()) {
          report.errors.push({ id: "category", error: "Nome non valido" });
          continue;
        }
        const { data, error } = await supabase
          .from(table)
          .select("id")
          .eq("name", row.name)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          report.skippedExisting++;
          continue;
        }
        delete row.id;
      } else {
        uuid.parse(row.id);
        const { data, error } = await supabase
          .from(table)
          .select("*")
          .eq("id", row.id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          report.skippedExisting++;
          if (canonical(data) !== canonical(row))
            report.conflicts.push({
              id: row.id,
              reason: "Record esistente conservato",
            });
          continue;
        }
      }
      if (table === "recipe_versions" && row.snapshot?.image_url) {
        const url = row.snapshot.image_url;
        const mapping = archive.images.find((image: any) => image.url === url);
        if (mapping && !imageMap.has(url)) {
          const stable = await persistRecipeImageBytes(
            mapping.recipeId,
            archive.files.get(mapping.path)!,
            mapping.contentType,
          );
          imageMap.set(url, stable);
        }
        row.snapshot = { ...row.snapshot, image_url: imageMap.get(url) || url };
      }
      const { error } = await supabase.from(table).insert(row);
      if (error?.code === "23505") {
        report.skippedExisting++;
        continue;
      }
      if (error)
        report.errors.push({
          id: row.id || key,
          error: "Riga non importata: il record esistente è conservato.",
        });
      else report.inserted++;
    }
  }
  return {
    ...report,
    imported: true,
    mode: "additive",
    backupAt: safety.createdAt,
  };
}
