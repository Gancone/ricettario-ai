import { supabase } from "@/lib/supabase";

const BUCKET = "ricettario-backups";
const LATEST = "latest.json";
const MAX_SNAPSHOTS = 40;
let bucketReady = false;

type BackupPayload = {
  schemaVersion: 1;
  createdAt: string;
  reason: string;
  recipes: any[];
  categories: any[];
};

function safeReason(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "auto";
}

async function ensureBucket() {
  if (bucketReady) return;
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await supabase.storage.createBucket(BUCKET, {
      public: false,
      fileSizeLimit: "10MB",
      allowedMimeTypes: ["application/json"]
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
  bucketReady = true;
}

async function collectData(reason: string): Promise<BackupPayload> {
  const [{ data: recipes, error: recipeError }, { data: categories, error: categoryError }] = await Promise.all([
    supabase.from("recipes").select("*").order("created_at", { ascending: false }),
    supabase.from("categories").select("*").order("name")
  ]);
  if (recipeError) throw recipeError;
  if (categoryError) throw categoryError;
  return {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    reason,
    recipes: recipes || [],
    categories: categories || []
  };
}

async function uploadJson(path: string, payload: BackupPayload, upsert: boolean) {
  await ensureBucket();
  const bytes = Buffer.from(JSON.stringify(payload, null, 2), "utf8");
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: "application/json",
    cacheControl: "0",
    upsert
  });
  if (error) throw error;
}

async function pruneSnapshots() {
  try {
    const { data } = await supabase.storage.from(BUCKET).list("snapshots", {
      limit: 100,
      sortBy: { column: "name", order: "desc" }
    });
    const files = (data || []).filter((x) => x.name.endsWith(".json"));
    if (files.length <= MAX_SNAPSHOTS) return;
    await supabase.storage.from(BUCKET).remove(files.slice(MAX_SNAPSHOTS).map((x) => `snapshots/${x.name}`));
  } catch {}
}

export async function createDatabaseSnapshot(reason = "automatic") {
  const payload = await collectData(reason);
  const stamp = payload.createdAt.replace(/[:.]/g, "-");
  const name = `snapshots/${stamp}-${safeReason(reason)}.json`;
  await uploadJson(name, payload, false);
  await uploadJson(LATEST, payload, true);
  await pruneSnapshots();
  return { createdAt: payload.createdAt, recipes: payload.recipes.length, categories: payload.categories.length, name };
}

export async function readLatestSnapshot(): Promise<BackupPayload | null> {
  try {
    await ensureBucket();
    const { data, error } = await supabase.storage.from(BUCKET).download(LATEST);
    if (error || !data) return null;
    const parsed = JSON.parse(await data.text());
    if (!parsed || !Array.isArray(parsed.recipes) || !Array.isArray(parsed.categories)) return null;
    return parsed as BackupPayload;
  } catch {
    return null;
  }
}

export async function restoreLatestSnapshotAdditively() {
  const backup = await readLatestSnapshot();
  if (!backup) return { restored: false, recipes: 0, categories: 0, createdAt: "" };

  if (backup.recipes.length) {
    const { error } = await supabase.from("recipes").upsert(backup.recipes, { onConflict: "id" });
    if (error) throw error;
  }

  if (backup.categories.length) {
    const categoryRows = backup.categories.map((row) => ({ name: row.name })).filter((row) => row.name);
    if (categoryRows.length) {
      const { error } = await supabase.from("categories").upsert(categoryRows, { onConflict: "name" });
      if (error) throw error;
    }
  }

  return {
    restored: true,
    recipes: backup.recipes.length,
    categories: backup.categories.length,
    createdAt: backup.createdAt
  };
}

export async function restoreIfDatabaseUnexpectedlyEmpty() {
  const { count, error } = await supabase.from("recipes").select("id", { count: "exact", head: true });
  if (error) throw error;
  if ((count || 0) > 0) return { restored: false, recipes: count || 0 };

  const backup = await readLatestSnapshot();
  if (!backup?.recipes?.length) return { restored: false, recipes: 0 };
  const result = await restoreLatestSnapshotAdditively();
  return { restored: result.restored, recipes: result.recipes };
}

export async function backupStatus() {
  const [{ count, error: recipeError }, latest] = await Promise.all([
    supabase.from("recipes").select("id", { count: "exact", head: true }),
    readLatestSnapshot()
  ]);
  if (recipeError) throw recipeError;
  return {
    recipes: count || 0,
    latestBackupAt: latest?.createdAt || "",
    latestBackupRecipes: latest?.recipes?.length || 0,
    protected: true
  };
}

export async function exportCurrentBackup() {
  return collectData("manual-export");
}
