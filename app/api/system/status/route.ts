import { configuredAppPassword } from "@/lib/app-auth";
import { guard, requireSchema, SCHEMA_VERSION } from "@/lib/backend";
import { supabase } from "@/lib/supabase";
import { backupStatus } from "@/lib/data-safety";
import { ensureImageBucket } from "@/lib/image-storage";

export async function GET(request: Request) {
  const auth = await guard(request); if (auth) return auth;
  const status: Record<string, any> = {
    appVersion: process.env.npm_package_version || "6.2.0",
    schema: { ok: false, version: SCHEMA_VERSION, label: "Migrazione richiesta" },
    auth: { ok: Boolean(configuredAppPassword()), label: configuredAppPassword() ? "Accesso protetto" : "Password non configurata" },
    openai: { ok: Boolean(process.env.OPENAI_API_KEY), label: process.env.OPENAI_API_KEY ? "Configurata" : "Chiave mancante" },
    updates: { ok: Boolean(process.env.GITHUB_UPDATE_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO), label: "" },
    supabase: { ok: false, label: "" }, backup: { ok: false, label: "" }, images: { ok: false, label: "" },
    video: { ok: Boolean(process.env.YTDLP_VERSION && process.env.YTDLP_SHA256), label: process.env.YTDLP_VERSION && process.env.YTDLP_SHA256 ? "Versione verificata" : "Pin SHA-256 mancante" }
  };
  status.updates.label = status.updates.ok ? "Configurati" : "Configurazione incompleta";
  try { await requireSchema(); status.schema = { ok: true, version: SCHEMA_VERSION, label: "Schema aggiornato" }; }
  catch { status.schema = { ok: false, version: SCHEMA_VERSION, label: "Esegui la migrazione database" }; }
  try {
    const { count, error } = await supabase.from("recipes").select("id", { count: "exact", head: true });
    if (error) throw error; status.supabase = { ok: true, label: `${count || 0} ricette raggiungibili` };
  } catch { status.supabase = { ok: false, label: "Database non raggiungibile" }; }
  if (status.schema.ok) {
    try { const b = await backupStatus(); status.backup = { ok: Boolean(b.protected), label: b.latestBackupAt ? `Ultimo: ${new Date(b.latestBackupAt).toLocaleString("it-IT")}` : "Nessun backup", lastKnownGoodAt: b.lastKnownGoodAt || "", suspicious: Boolean(b.suspicious) }; }
    catch { status.backup = { ok: false, label: "Backup non disponibile" }; }
  }
  try { await ensureImageBucket(); status.images = { ok: true, label: "Storage immagini pronto" }; }
  catch { status.images = { ok: false, label: "Storage immagini non disponibile" }; }
  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
