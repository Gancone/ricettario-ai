import AdmZip from "adm-zip";
import { createHash, randomUUID } from "node:crypto";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import { guard } from "@/lib/backend";
import { errorResponse, HttpError, manifestSchema, readForm } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_ZIP_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 260;

function cleanPath(value: string) { return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, ""); }
function forbiddenPath(p: string) {
  const parts = p.split("/");
  return !p || p.includes("../") || p.startsWith("../") || parts.includes(".git") || parts.includes("node_modules") || parts.includes(".next") || p === ".env" || p.startsWith(".env.") || p.startsWith(".vercel");
}
function stripSingleRoot(paths: string[]) {
  const roots = new Set(paths.filter(Boolean).map((p) => p.split("/")[0]));
  if (roots.size !== 1) return "";
  const root = [...roots][0];
  return paths.every((p) => p === root || p.startsWith(`${root}/`)) ? `${root}/` : "";
}
function protectedPath(p: string) { return p === "package-lock.json" || p === "package.json" || p.startsWith(".env") || p.startsWith(".git/"); }

async function gh(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(init.headers || {}) }
  });
  const text = await response.text(); let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || "errore"}`);
  return body;
}

export async function POST(request: Request) {
  const auth = await guard(request, "update"); if (auth) return auth;
  try {
    const token = process.env.GITHUB_UPDATE_TOKEN || "";
    const owner = process.env.GITHUB_OWNER || "";
    const repo = process.env.GITHUB_REPO || "";
    const baseBranch = process.env.GITHUB_BRANCH || "main";
    if (!token || !owner || !repo) throw new HttpError(503, "Aggiornamenti non configurati: mancano le variabili GitHub amministrative.");

    const backup = await createDatabaseSnapshot("pre-update");
    if (!backup?.createdAt) throw new HttpError(503, "Backup pre-aggiornamento non verificato. Aggiornamento bloccato.");
    const form = await readForm(request, MAX_ZIP_BYTES + 256 * 1024);
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) throw new HttpError(400, "Seleziona il file ZIP dell'aggiornamento.");
    if (file.size > MAX_ZIP_BYTES) throw new HttpError(413, "ZIP troppo grande. Massimo 6 MB.");

    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    if (!entries.length || entries.length > MAX_FILES) throw new HttpError(400, "Pacchetto aggiornamento vuoto o con troppi file.");
    const rawPaths = entries.map((e) => cleanPath(e.entryName));
    if (rawPaths.some(forbiddenPath)) throw new HttpError(400, "Il pacchetto contiene percorsi non consentiti.");
    const rootPrefix = stripSingleRoot(rawPaths);
    const files = entries.map((entry) => {
      let p = cleanPath(entry.entryName); if (rootPrefix && p.startsWith(rootPrefix)) p = p.slice(rootPrefix.length);
      return { path: p, data: entry.getData() };
    });
    if (files.some((f) => forbiddenPath(f.path) || protectedPath(f.path) && f.path.startsWith(".env"))) throw new HttpError(400, "Il pacchetto contiene file protetti.");
    if (!files.some((f) => f.path === "package.json") || !files.some((f) => f.path === "package-lock.json") || !files.some((f) => f.path === "app/page.tsx")) throw new HttpError(400, "ZIP non riconosciuto: servono package.json, package-lock.json e app/page.tsx.");

    const manifestFile = files.find((f) => f.path === "update-manifest.json");
    if (!manifestFile) throw new HttpError(400, "Manifest aggiornamento mancante.");
    const manifest = manifestSchema.parse(JSON.parse(manifestFile.data.toString("utf8")));
    const lock = JSON.parse(files.find((f) => f.path === "package-lock.json")!.data.toString("utf8"));
    if (Number(lock.lockfileVersion || 0) < 3) throw new HttpError(400, "package-lock.json non riproducibile: lockfileVersion 3 o superiore richiesto.");
    if (manifest.hashes) {
      for (const [pathName, expected] of Object.entries(manifest.hashes)) {
        const item = files.find((f) => f.path === cleanPath(pathName));
        if (!item || createHash("sha256").update(item.data).digest("hex") !== expected) throw new HttpError(400, "Hash manifest non valido.");
      }
    }
    const version = manifest.version;
    const deletePaths = (manifest.delete || []).map(cleanPath).filter((p) => p && !forbiddenPath(p) && !protectedPath(p));
    const managedRoots = (manifest.managedRoots || []).map((p) => cleanPath(p).replace(/\/$/, "")).filter((p) => p && !forbiddenPath(p) && !protectedPath(p));

    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(baseBranch)}`, token);
    const parentSha = ref.object.sha;
    const parentCommit = await gh(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token);
    const baseTreeSha = parentCommit.tree.sha;
    const currentTree = await gh(`/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`, token);
    const existingPaths = new Set<string>((currentTree.tree || []).filter((x: any) => x.type === "blob").map((x: any) => String(x.path)));
    const incomingPaths = new Set(files.map((f) => f.path));
    const tree: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    for (const item of files) {
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, token, { method: "POST", body: JSON.stringify({ content: item.data.toString("base64"), encoding: "base64" }) });
      tree.push({ path: item.path, mode: "100644", type: "blob", sha: blob.sha });
    }
    for (const existing of existingPaths) {
      if (managedRoots.some((root) => existing === root || existing.startsWith(`${root}/`)) && !incomingPaths.has(existing) && !protectedPath(existing)) tree.push({ path: existing, mode: "100644", type: "blob", sha: null });
    }
    for (const p of deletePaths) if (existingPaths.has(p) && !incomingPaths.has(p)) tree.push({ path: p, mode: "100644", type: "blob", sha: null });

    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, token, { method: "POST", body: JSON.stringify({ base_tree: baseTreeSha, tree }) });
    const commit = await gh(`/repos/${owner}/${repo}/git/commits`, token, { method: "POST", body: JSON.stringify({ message: `Aggiornamento Ricettario AI ${version}`, tree: newTree.sha, parents: [parentSha] }) });
    const previewBranch = `update/${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
    await gh(`/repos/${owner}/${repo}/git/refs`, token, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${previewBranch}`, sha: commit.sha }) });
    return Response.json({ success: true, version, files: files.length, backupAt: backup.createdAt, branch: previewBranch, commit: commit.sha, message: "Backup verificato. Aggiornamento pubblicato su un ramo di anteprima: la produzione non è stata modificata automaticamente." });
  } catch (error) {
    console.error("UPDATE ERROR", error instanceof Error ? error.message : "unknown");
    return errorResponse(error);
  }
}
