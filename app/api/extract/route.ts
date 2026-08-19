import OpenAI from "openai";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { downloadYtDlpMedia, downloadYtDlpThumbnailDataUrl, getYtDlpMetadata } from "@/lib/ytdlp";

export const runtime = "nodejs";
export const maxDuration = 300;

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function normalizeRecipe(raw: any) {
  const nutrition = raw?.nutrition || {};
  return {
    title: String(raw?.title || "Ricetta senza titolo").trim(),
    ingredients: Array.isArray(raw?.ingredients) ? raw.ingredients.map(String) : [],
    steps: Array.isArray(raw?.steps) ? raw.steps.map(String) : [],
    notes: String(raw?.notes || ""),
    prepTimeMinutes: asNumber(raw?.prepTimeMinutes),
    cookTimeMinutes: asNumber(raw?.cookTimeMinutes),
    totalTimeMinutes: asNumber(raw?.totalTimeMinutes),
    servings: asNumber(raw?.servings),
    nutrition: {
      calories: asNumber(nutrition.calories),
      protein: asNumber(nutrition.protein),
      carbs: asNumber(nutrition.carbs),
      fat: asNumber(nutrition.fat),
      sugars: asNumber(nutrition.sugars),
      fiber: asNumber(nutrition.fiber),
      salt: asNumber(nutrition.salt),
      estimated: nutrition.estimated !== false
    }
  };
}

export async function POST(request: Request) {
  let workdir = "";
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: "Manca OPENAI_API_KEY nelle variabili d'ambiente." }, { status: 500 });
    }

    const form = await request.formData();
    const sourceUrl = String(form.get("sourceUrl") || "").trim();
    const sourceText = String(form.get("sourceText") || "").trim();
    const uploaded = form.get("video") as File | null;

    if (!sourceUrl && !sourceText && (!uploaded || uploaded.size === 0)) {
      return Response.json({ error: "Incolla il link di un video oppure carica un file." }, { status: 400 });
    }

    workdir = await mkdtemp(path.join(tmpdir(), "ricettario-"));
    let mediaPath = "";
    let metadataText = "";
    let thumbnailUrl = "";
    let warning = "";

    if (sourceUrl) {
      const metadata = await getYtDlpMetadata(sourceUrl);
      metadataText = metadata.text;
      thumbnailUrl = await downloadYtDlpThumbnailDataUrl(sourceUrl, workdir) || metadata.thumbnail;

      try {
        mediaPath = await downloadYtDlpMedia(sourceUrl, workdir);
      } catch (error: any) {
        warning = error?.message || "Video non accessibile";
        if (!metadataText.trim() && !sourceText && (!uploaded || uploaded.size === 0)) {
          return Response.json({ error: warning }, { status: 400 });
        }
      }
    }

    if (!mediaPath && uploaded && uploaded.size > 0) {
      const ext = path.extname(uploaded.name) || ".mp4";
      mediaPath = path.join(workdir, `upload${ext}`);
      await writeFile(mediaPath, Buffer.from(await uploaded.arrayBuffer()));
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    let transcript = sourceText;

    if (mediaPath) {
      const transcription = await client.audio.transcriptions.create({
        file: await OpenAI.toFile(await readFile(mediaPath), path.basename(mediaPath)),
        model: "gpt-4o-mini-transcribe"
      });
      transcript = [transcript, transcription.text].filter(Boolean).join("\n\n");
    }

    const context = [metadataText, transcript].filter(Boolean).join("\n\n---\n\n");
    if (!context.trim()) {
      return Response.json({ error: "Non sono riuscito a ricavare informazioni utili dal contenuto." }, { status: 400 });
    }

    const response = await client.responses.create({
      model: "gpt-4o-mini",
      store: false,
      input: `Trasforma il contenuto seguente in una ricetta italiana chiara e fedele.\n\nREGOLE:\n- Usa soltanto le informazioni ricavabili da titolo, didascalia e trascrizione.\n- Non inventare quantità di ingredienti mancanti: se una quantità non è disponibile, scrivi solo l'ingrediente.\n- Elimina saluti, sponsor e parti non pertinenti.\n- Puoi stimare tempi e valori nutrizionali quando non sono dichiarati; in quel caso nutrition.estimated deve essere true.\n- I valori nutrizionali sono PER PORZIONE. calories in kcal; protein, carbs, fat, sugars, fiber e salt in grammi.\n- totalTimeMinutes deve essere coerente con preparazione e cottura.\n- Se il numero di porzioni non è ricavabile, usa 0.\n- Restituisci SOLO JSON valido, senza markdown.\n\nFORMATO:\n{\n  \"title\": \"string\",\n  \"ingredients\": [\"string\"],\n  \"steps\": [\"string\"],\n  \"notes\": \"string\",\n  \"prepTimeMinutes\": 0,\n  \"cookTimeMinutes\": 0,\n  \"totalTimeMinutes\": 0,\n  \"servings\": 0,\n  \"nutrition\": {\n    \"calories\": 0,\n    \"protein\": 0,\n    \"carbs\": 0,\n    \"fat\": 0,\n    \"sugars\": 0,\n    \"fiber\": 0,\n    \"salt\": 0,\n    \"estimated\": true\n  }\n}\n\nURL FONTE:\n${sourceUrl || "nessuno"}\n\nCONTENUTO:\n${context}`
    });

    let raw: any;
    try {
      raw = JSON.parse(response.output_text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
    } catch {
      throw new Error("L'AI ha restituito una risposta non valida. Riprova l'estrazione.");
    }

    return Response.json({
      ...normalizeRecipe(raw),
      imageUrl: thumbnailUrl,
      warning
    });
  } catch (error: any) {
    console.error("EXTRACT ERROR", error);
    return Response.json({ error: error?.message || "Errore durante l'estrazione." }, { status: 500 });
  } finally {
    if (workdir) {
      try { await rm(workdir, { recursive: true, force: true }); } catch {}
    }
  }
}
