import { execFile } from "child_process";
import { promisify } from "util";
import { access, chmod, readFile, readdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

const exec = promisify(execFile);
const IS_WINDOWS = process.platform === "win32";
const YTDLP_PATH = IS_WINDOWS ? "yt-dlp" : path.join(tmpdir(), "ricettario-yt-dlp-linux");

async function run(command: string, args: string[]) {
  return exec(command, args, { maxBuffer: 30 * 1024 * 1024, windowsHide: true });
}

export async function ensureYtDlp() {
  if (IS_WINDOWS) {
    try {
      await run("yt-dlp", ["--version"]);
      return;
    } catch {
      throw new Error("yt-dlp non è disponibile sul PC. Usa il sito pubblicato su Vercel oppure installa yt-dlp.");
    }
  }

  try {
    await access(YTDLP_PATH);
    await run(YTDLP_PATH, ["--version"]);
    return;
  } catch {}

  const response = await fetch("https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux", {
    signal: AbortSignal.timeout(45000)
  });
  if (!response.ok) throw new Error("Non riesco a preparare il motore video sul server.");

  await writeFile(YTDLP_PATH, Buffer.from(await response.arrayBuffer()));
  await chmod(YTDLP_PATH, 0o755);
  await run(YTDLP_PATH, ["--version"]);
}

export async function getYtDlpMetadata(url: string) {
  await ensureYtDlp();
  try {
    const info = await run(YTDLP_PATH, [
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      "--dump-single-json",
      url
    ]);
    const json = JSON.parse(info.stdout);
    return {
      text: [json.title, json.description].filter(Boolean).join("\n\n"),
      thumbnail: String(json.thumbnail || "")
    };
  } catch {
    return { text: "", thumbnail: "" };
  }
}

export async function downloadYtDlpMedia(url: string, workdir: string) {
  await ensureYtDlp();
  const output = path.join(workdir, "source.%(ext)s");
  try {
    await run(YTDLP_PATH, [
      "--no-playlist",
      "--no-warnings",
      "--socket-timeout", "20",
      "--retries", "1",
      "-f", "bestaudio[ext=m4a]/bestaudio[ext=webm]/best[ext=mp4]/best",
      "-o", output,
      url
    ]);
  } catch (error: any) {
    const details = String(error?.stderr || error?.message || "").trim();
    throw new Error(
      "Il social non ha permesso di leggere automaticamente il video. Il post può richiedere login oppure bloccare i server cloud." +
      (details ? `\n\nDettaglio: ${details.slice(-900)}` : "")
    );
  }

  const files = await readdir(workdir);
  const found = files.find((f) => f.startsWith("source."));
  if (!found) throw new Error("Il video è stato letto ma non trovo il file multimediale.");
  return path.join(workdir, found);
}

function mimeForThumbnail(file: string) {
  const ext = path.extname(file).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  return "";
}

export async function downloadYtDlpThumbnailDataUrl(url: string, workdir: string) {
  await ensureYtDlp();
  const output = path.join(workdir, "thumb.%(ext)s");
  try {
    await run(YTDLP_PATH, [
      "--no-playlist",
      "--no-warnings",
      "--skip-download",
      "--write-thumbnail",
      "--socket-timeout", "20",
      "--retries", "1",
      "-o", output,
      url
    ]);

    const files = await readdir(workdir);
    const found = files.find((f) => f.startsWith("thumb."));
    if (!found) return "";
    const mime = mimeForThumbnail(found);
    if (!mime) return "";
    const bytes = await readFile(path.join(workdir, found));
    if (!bytes.length || bytes.length > 3 * 1024 * 1024) return "";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return "";
  }
}
