import OpenAI from "openai";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  access,
  chmod,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile
} from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export const runtime = "nodejs";
export const maxDuration = 300;

const exec = promisify(execFile);

const IS_WINDOWS = process.platform === "win32";

const YTDLP_PATH = IS_WINDOWS
  ? "yt-dlp"
  : path.join(tmpdir(), "yt-dlp");

function safeJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  return JSON.parse(cleaned);
}

async function run(
  command: string,
  args: string[]
) {
  return exec(command, args, {
    maxBuffer: 30 * 1024 * 1024
  });
}

/*
 * Vercel non ha yt-dlp installato.
 * Lo scarichiamo in /tmp alla prima richiesta.
 */
async function ensureYtDlp() {

  // In locale su Windows usiamo yt-dlp già installato
  if (IS_WINDOWS) {
    try {
      const version = await run(
        "yt-dlp",
        ["--version"]
      );

      return version.stdout.trim();

    } catch {
      throw new Error(
        "yt-dlp non risulta disponibile su Windows. " +
        "Prova nel terminale: yt-dlp --version"
      );
    }
  }

  // Su Vercel/Linux proviamo prima il file già presente in /tmp
  try {
    await access(YTDLP_PATH);

    const version = await run(
      YTDLP_PATH,
      ["--version"]
    );

    return version.stdout.trim();

  } catch {
    // Se non esiste, lo scarichiamo
  }

  const response = await fetch(
    "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux"
  );

  if (!response.ok) {
    throw new Error(
      "Non riesco a scaricare yt-dlp sul server."
    );
  }

  const buffer = Buffer.from(
    await response.arrayBuffer()
  );

  await writeFile(
    YTDLP_PATH,
    buffer
  );

  await chmod(
    YTDLP_PATH,
    0o755
  );

  const version = await run(
    YTDLP_PATH,
    ["--version"]
  );

  return version.stdout.trim();
}

async function getMetadata(
  url: string
) {
  try {
    const info = await run(
      YTDLP_PATH,
      [
        "--no-playlist",

        "--print",
        "%(title)s|||%(description)s|||%(thumbnail)s",

        "--skip-download",

        url
      ]
    );

    const output =
      info.stdout.trim();

    if (!output) {
      return {
        text: "",
        thumbnail: ""
      };
    }

    const parts =
      output.split("|||");

    return {
      text:
        `${parts[0] || ""}\n${parts[1] || ""
        }`,

      thumbnail:
        parts[2]?.trim() || ""
    };

  } catch {
    return {
      text: "",
      thumbnail: ""
    };
  }
}

async function downloadMedia(
  url: string,
  workdir: string
) {

  const outputTemplate =
    path.join(
      workdir,
      "source.%(ext)s"
    );

  try {

    /*
     * Cerchiamo un formato compatibile
     * direttamente con OpenAI.
     */
    await run(
      YTDLP_PATH,
      [
        "--no-playlist",

        "-f",
        "bestaudio[ext=m4a]/bestaudio[ext=webm]/best[ext=mp4]/best",

        "-o",
        outputTemplate,

        url
      ]
    );

  } catch (error: any) {

    const details =
      String(
        error?.stderr ||
        error?.message ||
        ""
      );

    throw new Error(
      "yt-dlp non riesce a leggere questo video. " +
      "Il contenuto potrebbe richiedere login oppure Instagram/TikTok potrebbe bloccare il server.\n\n" +
      details.slice(-1500)
    );
  }

  const files =
    await readdir(workdir);

  const mediaFile =
    files.find(
      file =>
        file.startsWith("source.")
    );

  if (!mediaFile) {
    throw new Error(
      "Il video è stato elaborato ma non trovo il file scaricato."
    );
  }

  return path.join(
    workdir,
    mediaFile
  );
}

export async function POST(
  request: Request
) {

  let workdir = "";

  try {

    if (
      !process.env.OPENAI_API_KEY
    ) {

      return Response.json(
        {
          error:
            "Manca OPENAI_API_KEY nelle variabili d'ambiente."
        },
        {
          status: 500
        }
      );

    }

    const form =
      await request.formData();

    const sourceUrl =
      String(
        form.get("sourceUrl") || ""
      ).trim();

    const sourceText =
      String(
        form.get("sourceText") || ""
      ).trim();

    const uploaded =
      form.get("video") as
      | File
      | null;

    if (
      !sourceUrl &&
      !sourceText &&
      (
        !uploaded ||
        uploaded.size === 0
      )
    ) {

      return Response.json(
        {
          error:
            "Incolla un link oppure carica un video."
        },
        {
          status: 400
        }
      );

    }

    workdir =
      await mkdtemp(
        path.join(
          tmpdir(),
          "ricetta-"
        )
      );

    let mediaPath = "";

    let metadataText = "";

    let thumbnailUrl = "";

    let downloadMethod = "";

    /*
     * SE C'È UN LINK
     */
    if (sourceUrl) {

      await ensureYtDlp();

      const metadata =
        await getMetadata(
          sourceUrl
        );

      metadataText =
        metadata.text;

      thumbnailUrl =
        metadata.thumbnail;

      try {

        mediaPath =
          await downloadMedia(
            sourceUrl,
            workdir
          );

        downloadMethod =
          "link";

      } catch (error: any) {

        /*
         * Se c'è anche un file manuale,
         * continuiamo con quello.
         */
        if (
          !uploaded ||
          uploaded.size === 0
        ) {

          return Response.json(
            {
              error:
                error?.message ||
                "Impossibile recuperare il video."
            },
            {
              status: 400
            }
          );

        }
      }
    }

    /*
     * FALLBACK:
     * file caricato manualmente.
     */
    if (
      !mediaPath &&
      uploaded &&
      uploaded.size > 0
    ) {

      const extension =
        path.extname(
          uploaded.name
        ) || ".mp4";

      mediaPath =
        path.join(
          workdir,
          `upload${extension}`
        );

      const bytes =
        Buffer.from(
          await uploaded.arrayBuffer()
        );

      await writeFile(
        mediaPath,
        bytes
      );

      downloadMethod =
        "file caricato";
    }

    const client =
      new OpenAI({
        apiKey:
          process.env.OPENAI_API_KEY
      });

    let transcript =
      sourceText;

    /*
     * TRASCRIZIONE
     *
     * Non usiamo più FFmpeg.
     */
    if (mediaPath) {

      const buffer =
        await readFile(
          mediaPath
        );

      const fileName =
        path.basename(
          mediaPath
        );

      const transcription =
        await client
          .audio
          .transcriptions
          .create({
            file:
              await OpenAI.toFile(
                buffer,
                fileName
              ),

            model:
              "gpt-4o-mini-transcribe"
          });

      transcript = [
        transcript,
        transcription.text
      ]
        .filter(Boolean)
        .join("\n\n");
    }

    const context = [
      metadataText,
      transcript
    ]
      .filter(Boolean)
      .join(
        "\n\n---\n\n"
      );

    if (
      !context.trim()
    ) {

      return Response.json(
        {
          error:
            "Non sono riuscito a ricavare testo dal contenuto."
        },
        {
          status: 400
        }
      );

    }

    /*
     * CREAZIONE RICETTA
     */
    const response =
      await client.responses.create({

        model:
          "gpt-5",

        store:
          false,

        input: `
Trasforma questo contenuto in una ricetta italiana chiara e fedele.

REGOLE:

- Usa titolo, descrizione/didascalia e trascrizione.
- Non inventare quantità di ingredienti se non sono ricavabili.
- Se una quantità manca, inserisci soltanto il nome dell'ingrediente.
- Elimina saluti, sponsor e contenuti non pertinenti.
- Se qualcosa è dubbio, indicalo nelle note.
- Puoi stimare i tempi di preparazione e cottura quando non sono dichiarati.
- I valori nutrizionali devono essere calcolati PER PORZIONE.
- I valori nutrizionali sono stime quando gli ingredienti o le quantità non sono sufficientemente precisi.
- calories è espresso in kcal.
- protein, carbs, fat, sugars, fiber e salt sono espressi in grammi.
- totalTimeMinutes deve rappresentare il tempo totale realistico.
- Rispondi SOLO con JSON valido, senza markdown.

FORMATO:

{
  "title": "string",

  "ingredients": [
    "string"
  ],

  "steps": [
    "string"
  ],

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
}

URL FONTE:

${sourceUrl || "nessuno"}

CONTENUTO:

${context}
`
      });

    const recipe =
      safeJson(
        response.output_text
      );

    return Response.json({
      ...recipe,

      imageUrl:
        thumbnailUrl,

      _debug:
        downloadMethod
          ? `Video recuperato tramite ${downloadMethod}`
          : ""
    });

  } catch (error: any) {

    console.error(
      "EXTRACT ERROR:",
      error
    );

    return Response.json(
      {
        error:
          error?.message ||
          "Errore durante l'estrazione."
      },
      {
        status: 500
      }
    );

  } finally {

    if (workdir) {

      try {

        await rm(
          workdir,
          {
            recursive: true,
            force: true
          }
        );

      } catch {
        // niente
      }

    }
  }
}