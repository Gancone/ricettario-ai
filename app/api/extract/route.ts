import OpenAI from "openai";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, readFile, readdir, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

const exec = promisify(execFile);

function safeJson(text: string) {
  const cleaned = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  return JSON.parse(cleaned);
}

async function run(command: string, args: string[]) {
  return exec(command, args, {
    maxBuffer: 30 * 1024 * 1024,
    windowsHide: true
  });
}

async function checkYtDlp() {
  try {
    const r = await run("yt-dlp", ["--version"]);
    return r.stdout.trim();
  } catch (e: any) {
    throw new Error(
      "yt-dlp non risulta installato o non è nel PATH di Windows. " +
      "Apri un nuovo terminale e prova: yt-dlp --version"
    );
  }
}

async function downloadWithYtDlp(url: string, workdir: string) {
  const outputTemplate = path.join(workdir, "source.%(ext)s");
  const attempts: { label: string; args: string[] }[] = [
    {
      label: "senza login",
      args: ["--no-playlist", "-f", "bestaudio/best", "-o", outputTemplate, url]
    },
    {
      label: "con cookie Chrome",
      args: ["--cookies-from-browser", "chrome", "--no-playlist", "-f", "bestaudio/best", "-o", outputTemplate, url]
    },
    {
      label: "con cookie Edge",
      args: ["--cookies-from-browser", "edge", "--no-playlist", "-f", "bestaudio/best", "-o", outputTemplate, url]
    }
  ];

  const errors: string[] = [];

  for (const attempt of attempts) {
    try {
      await run("yt-dlp", attempt.args);
      const files = await readdir(workdir);
      const found = files.find(f => f.startsWith("source."));
      if (found) return { mediaPath: path.join(workdir, found), method: attempt.label };
    } catch (e: any) {
      const stderr = String(e?.stderr || e?.message || "").trim();
      errors.push(`${attempt.label}: ${stderr.slice(-1600)}`);
    }
  }

  throw new Error(
    "yt-dlp non è riuscito a leggere il video.\n\n" +
    errors.join("\n\n") +
    "\n\nSe il video è Instagram/TikTok, aprilo prima nel browser in cui sei già autenticato e riprova."
  );
}

async function getMetadata(url: string) {
  const attempts = [
    [
      "--no-playlist",
      "--print",
      "%(title)s|||%(description)s|||%(thumbnail)s",
      "--skip-download",
      url
    ],
    [
      "--cookies-from-browser",
      "chrome",
      "--no-playlist",
      "--print",
      "%(title)s|||%(description)s|||%(thumbnail)s",
      "--skip-download",
      url
    ],
    [
      "--cookies-from-browser",
      "edge",
      "--no-playlist",
      "--print",
      "%(title)s|||%(description)s|||%(thumbnail)s",
      "--skip-download",
      url
    ]
  ];

  for (const args of attempts) {
    try {
      const info = await run("yt-dlp", args);

      if (info.stdout.trim()) {
        const parts = info.stdout.trim().split("|||");

        return {
          text: `${parts[0] || ""}\n${parts[1] || ""}`,
          thumbnail: parts[2]?.trim() || ""
        };
      }
    } catch { }
  }

  return {
    text: "",
    thumbnail: ""
  };
}

export async function POST(request: Request) {
  let workdir = "";
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "Manca OPENAI_API_KEY nel file .env.local." },
        { status: 500 }
      );
    }

    const form = await request.formData();
    const sourceUrl = String(form.get("sourceUrl") || "").trim();
    const sourceText = String(form.get("sourceText") || "").trim();
    const uploaded = form.get("video") as File | null;

    if (!sourceUrl && !sourceText && (!uploaded || uploaded.size === 0)) {
      return Response.json({ error: "Incolla un link oppure carica un video." }, { status: 400 });
    }

    workdir = await mkdtemp(path.join(tmpdir(), "ricetta-"));
    let mediaPath = "";
    let metadataText = "";
    let thumbnailUrl = "";
    let downloadMethod = "";

    if (sourceUrl) {
      await checkYtDlp();
      const metadata = await getMetadata(sourceUrl);

      metadataText = metadata.text;
      thumbnailUrl = metadata.thumbnail;

      try {
        const dl = await downloadWithYtDlp(sourceUrl, workdir);
        mediaPath = dl.mediaPath;
        downloadMethod = dl.method;
      } catch (e: any) {
        if (!uploaded || uploaded.size === 0) {
          return Response.json(
            { error: e?.message || "Impossibile recuperare il video." },
            { status: 400 }
          );
        }
      }
    }

    if (!mediaPath && uploaded && uploaded.size > 0) {
      mediaPath = path.join(workdir, uploaded.name || "upload.mp4");
      await writeFile(mediaPath, Buffer.from(await uploaded.arrayBuffer()));
      downloadMethod = "file caricato";
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let transcript = sourceText;

    if (mediaPath) {
      let audioPath = mediaPath;
      try {
        const mp3 = path.join(workdir, "audio.mp3");
        await run("ffmpeg", [
          "-y", "-i", mediaPath, "-vn",
          "-ac", "1", "-ar", "16000",
          "-b:a", "64k", mp3
        ]);
        audioPath = mp3;
      } catch {
        // Prova comunque il file originale.
      }

      const tr = await client.audio.transcriptions.create({
        file: await OpenAI.toFile(await readFile(audioPath), path.basename(audioPath)),
        model: "gpt-4o-mini-transcribe"
      });
      transcript = [transcript, tr.text].filter(Boolean).join("\n\n");
    }

    const context = [metadataText, transcript].filter(Boolean).join("\n\n---\n\n");

    if (!context.trim()) {
      return Response.json({ error: "Non sono riuscito a ricavare testo dal contenuto." }, { status: 400 });
    }

    const response = await client.responses.create({
      model: "gpt-5",
      store: false,
      input: `Trasforma questo contenuto in una ricetta italiana chiara e fedele.

REGOLE:
- Usa titolo, descrizione/didascalia e trascrizione.
- Non inventare quantità, ingredienti, temperature, tempi o passaggi.
- Se una quantità manca, inserisci solo il nome dell'ingrediente.
- Se qualcosa è dubbio, scrivilo nelle note.
- Elimina saluti, sponsor e parti non pertinenti.
- Rispondi SOLO con JSON valido:

{
  "title": "string",
  "ingredients": ["string"],
  "steps": ["string"],
  "notes": "string",

  "prepTimeMinutes": 0,
  "cookTimeMinutes": 0,
  "totalTimeMinutes": 0,
  "servings": 0,

  "nutrition": {
    "calories": 0,
    "protein": 0,
    "carbs": 0,
    "fat": 0,
    "sugars": 0,
    "fiber": 0,
    "salt": 0,
    "estimated": true
  }
    VALORI NUTRIZIONALI:

- I valori nutrizionali devono essere PER PORZIONE.
- calories è espresso in kcal.
- protein, carbs, fat, sugars, fiber e salt sono espressi in grammi.
- Calcola i valori usando le quantità degli ingredienti quando disponibili.
- Se mancano quantità sufficienti, fai solo una stima ragionevole e imposta "estimated": true.
- Se i dati sono sufficientemente chiari, imposta "estimated": false.
- Non inventare tempi dichiarati nel video. Se non vengono indicati, puoi stimare un tempo realistico.
- totalTimeMinutes deve rappresentare preparazione + cottura.
}

URL:
${sourceUrl || "nessuno"}

CONTENUTO:
${context}`
    });

    const recipe = safeJson(response.output_text);

    return Response.json({
      ...recipe,
      imageUrl: thumbnailUrl,
      _debug: downloadMethod ? `Video recuperato ${downloadMethod}` : ""
    });
  } catch (error: any) {
    console.error(error);
    return Response.json(
      { error: error?.message || "Errore durante l'estrazione." },
      { status: 500 }
    );
  } finally {
    if (workdir) {
      try { await rm(workdir, { recursive: true, force: true }); } catch { }
    }
  }
}
