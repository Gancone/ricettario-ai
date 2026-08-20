import { requireAppAuth, configuredAppPassword } from "@/lib/app-auth";
import { supabase } from "@/lib/supabase";
import { backupStatus } from "@/lib/data-safety";
import { ensureImageBucket } from "@/lib/image-storage";

export async function GET(request: Request) {
  const auth = requireAppAuth(request); if (auth) return auth;
  const status: Record<string, any> = {
    auth: { ok: Boolean(configuredAppPassword()), label: configuredAppPassword() ? "Accesso protetto" : "Password non configurata" },
    openai: { ok: Boolean(process.env.OPENAI_API_KEY), label: process.env.OPENAI_API_KEY ? "Configurata" : "Chiave mancante" },
    updates: { ok: Boolean(process.env.GITHUB_UPDATE_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO), label: "" },
    supabase: { ok: false, label: "" },
    backup: { ok: false, label: "" },
    images: { ok: false, label: "" }
  };
  status.updates.label = status.updates.ok ? "Configurati" : "Configurazione incompleta";

  try {
    const { count, error } = await supabase.from("recipes").select("id", { count: "exact", head: true });
    if (error) throw error;
    status.supabase = { ok: true, label: `${count || 0} ricette raggiungibili` };
  } catch (e: any) {
    status.supabase = { ok: false, label: e?.message || "Non raggiungibile" };
  }

  try {
    const b = await backupStatus();
    status.backup = { ok: Boolean(b.protected), label: b.latestBackupAt ? `Ultimo: ${new Date(b.latestBackupAt).toLocaleString("it-IT")}` : "Nessun backup" };
  } catch (e: any) {
    status.backup = { ok: false, label: e?.message || "Non disponibile" };
  }

  try {
    await ensureImageBucket();
    status.images = { ok: true, label: "Storage immagini pronto" };
  } catch (e: any) {
    status.images = { ok: false, label: e?.message || "Storage non disponibile" };
  }

  return Response.json(status, { headers: { "cache-control": "no-store" } });
}
