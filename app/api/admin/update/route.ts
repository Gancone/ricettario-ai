import AdmZip from "adm-zip";
import { createDatabaseSnapshot } from "@/lib/data-safety";
import { configuredAppPassword, requireAppAuth } from "@/lib/app-auth";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_ZIP_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 260;

function cleanPath(value: string) {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function forbiddenPath(p: string) {
  const parts = p.split("/");
  return (
    !p || p.includes("../") || p.startsWith("../") || parts.includes(".git") ||
    parts.includes("node_modules") || parts.includes(".next") || p === ".env" ||
    p.startsWith(".env.") || p === ".env.local" || p === ".vercel"
  );
}

function stripSingleRoot(paths: string[]) {
  const roots = new Set(paths.filter(Boolean).map((p) => p.split("/")[0]));
  if (roots.size !== 1) return "";
  const root = [...roots][0];
  return paths.every((p) => p === root || p.startsWith(`${root}/`)) ? `${root}/` : "";
}

async function gh(url: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${url}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || text || "errore sconosciuto"}`);
  return body;
}

export async function POST(request: Request) {
  const auth = requireAppAuth(request);
  if (auth) return auth;

  try {
    if (!configuredAppPassword()) {
      return Response.json({ error: "Per sicurezza configura APP_PASSWORD oppure lascia configurata UPDATE_PASSWORD su Vercel." }, { status: 503 });
    }

    const token = process.env.GITHUB_UPDATE_TOKEN || "";
    const owner = process.env.GITHUB_OWNER || "";
    const repo = process.env.GITHUB_REPO || "";
    const branch = process.env.GITHUB_BRANCH || "main";
    if (!token || !owner || !repo) {
      return Response.json({ error: "Aggiornamenti non configurati: mancano GITHUB_UPDATE_TOKEN / GITHUB_OWNER / GITHUB_REPO." }, { status: 503 });
    }

    // REGOLA DI SICUREZZA: se il backup non riesce, l'aggiornamento NON parte.
    const backup = await createDatabaseSnapshot("pre-update");
    if (!backup?.createdAt) throw new Error("Backup pre-aggiornamento non verificato. Aggiornamento bloccato.");

    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) return Response.json({ error: "Seleziona il file ZIP dell'aggiornamento." }, { status: 400 });
    if (file.size > MAX_ZIP_BYTES) return Response.json({ error: "ZIP troppo grande. Massimo 6 MB." }, { status: 413 });

    const zip = new AdmZip(Buffer.from(await file.arrayBuffer()));
    const entries = zip.getEntries().filter((e) => !e.isDirectory);
    if (!entries.length || entries.length > MAX_FILES) return Response.json({ error: "Pacchetto aggiornamento vuoto o con troppi file." }, { status: 400 });

    const rawPaths = entries.map((e) => cleanPath(e.entryName));
    const rootPrefix = stripSingleRoot(rawPaths);
    const files = entries.map((entry) => {
      let p = cleanPath(entry.entryName);
      if (rootPrefix && p.startsWith(rootPrefix)) p = p.slice(rootPrefix.length);
      return { path: p, data: entry.getData() };
    }).filter((f) => f.path && !forbiddenPath(f.path));

    if (!files.some((f) => f.path === "package.json") || !files.some((f) => f.path === "app/page.tsx")) {
      return Response.json({ error: "ZIP non riconosciuto: devono essere presenti package.json e app/page.tsx." }, { status: 400 });
    }

    let version = "nuova versione";
    let deletePaths: string[] = [];
    let managedRoots: string[] = [];
    const manifest = files.find((f) => f.path === "update-manifest.json");
    if (manifest) {
      try {
        const parsed = JSON.parse(manifest.data.toString("utf8"));
        version = parsed.version || version;
        deletePaths = Array.isArray(parsed.delete) ? parsed.delete.map((x: unknown) => cleanPath(String(x))).filter((x: string) => x && !forbiddenPath(x)) : [];
        managedRoots = Array.isArray(parsed.managedRoots) ? parsed.managedRoots.map((x: unknown) => cleanPath(String(x)).replace(/\/$/, "")).filter((x: string) => x && !forbiddenPath(x)) : [];
      } catch {}
    }

    const ref = await gh(`/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, token);
    const parentSha = ref.object.sha;
    const parentCommit = await gh(`/repos/${owner}/${repo}/git/commits/${parentSha}`, token);
    const baseTreeSha = parentCommit.tree.sha;
    const currentTree = await gh(`/repos/${owner}/${repo}/git/trees/${baseTreeSha}?recursive=1`, token);
    const existingPaths = new Set<string>((currentTree.tree || []).filter((x: any) => x.type === "blob").map((x: any) => String(x.path)));
    const incomingPaths = new Set(files.map((f) => f.path));

    const tree: Array<{ path: string; mode: string; type: string; sha: string | null }> = [];
    for (const item of files) {
      const blob = await gh(`/repos/${owner}/${repo}/git/blobs`, token, {
        method: "POST",
        body: JSON.stringify({ content: item.data.toString("base64"), encoding: "base64" })
      });
      tree.push({ path: item.path, mode: "100644", type: "blob", sha: blob.sha });
    }

    // Pulizia automatica delle cartelle gestite: i file obsoleti non restano nel repository.
    for (const existing of existingPaths) {
      const managed = managedRoots.some((root) => existing === root || existing.startsWith(`${root}/`));
      if (managed && !incomingPaths.has(existing)) {
        tree.push({ path: existing, mode: "100644", type: "blob", sha: null });
      }
    }

    if (!incomingPaths.has("package-lock.json") && existingPaths.has("package-lock.json")) {
      tree.push({ path: "package-lock.json", mode: "100644", type: "blob", sha: null });
    }
    for (const p of deletePaths) {
      if (existingPaths.has(p) && !incomingPaths.has(p)) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
    }

    const newTree = await gh(`/repos/${owner}/${repo}/git/trees`, token, {
      method: "POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree })
    });
    const commit = await gh(`/repos/${owner}/${repo}/git/commits`, token, {
      method: "POST",
      body: JSON.stringify({ message: `Aggiornamento Ricettario AI ${version}`, tree: newTree.sha, parents: [parentSha] })
    });
    await gh(`/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, token, {
      method: "PATCH",
      body: JSON.stringify({ sha: commit.sha, force: false })
    });

    return Response.json({
      success: true,
      version,
      files: files.length,
      backupAt: backup.createdAt,
      message: "Backup verificato. Aggiornamento inviato a GitHub; Vercel avvierà il deploy automaticamente."
    });
  } catch (error: any) {
    console.error("UPDATE ERROR", error);
    return Response.json({ error: error?.message || "Aggiornamento non riuscito." }, { status: 500 });
  }
}
