import OpenAI from "openai";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import path from "path";
import { downloadYtDlpMedia, downloadYtDlpThumbnailBytes, getYtDlpMetadata } from "@/lib/ytdlp";
import { persistRecipeImage, persistRecipeImageBytes } from "@/lib/image-storage";
import { DEFAULT_CATEGORY_NAMES, mergeCategoryNames } from "@/lib/categories";
import { guard } from "@/lib/backend";
import { findDuplicate } from "@/lib/recipe-store";
import { errorResponse, HttpError, readForm, urlSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const maxDuration = 300;

function asPositive(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function asNonNegative(value: unknown, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function cleanStringList(value: unknown) {
  return Array.isArray(value) ? value.map((x) => String(x || "").trim()).filter(Boolean) : [];
}

function pickCategory(value: unknown, allowed: string[]) {
  const raw = String(value || "").trim();
  const exact = allowed.find((x) => x.toLocaleLowerCase("it") === raw.toLocaleLowerCase("it"));
  return exact || allowed[0] || "Primi piatti";
}

function normalizeRecipe(raw: any, categories: string[]) {
  const nutrition = raw?.nutrition || {};
  const prep = asNonNegative(raw?.prepTimeMinutes, 10);
  const cook = asNonNegative(raw?.cookTimeMinutes, 15);
  const total = Math.max(asNonNegative(raw?.totalTimeMinutes, prep + cook), prep + cook);
  const servings = Math.min(12, Math.max(1, Math.round(asPositive(raw?.servings, 2))));

  const protein = asNonNegative(nutrition.protein);
  const carbs = asNonNegative(nutrition.carbs);
  const fat = asNonNegative(nutrition.fat);
  let calories = asNonNegative(nutrition.calories);
  if (!calories && (protein || carbs || fat)) calories = Math.round(protein * 4 + carbs * 4 + fat * 9);

  return {
    title: String(raw?.title || "Ricetta senza titolo").trim(),
    suggestedCategory: pickCategory(raw?.suggestedCategory, categories),
    ingredients: cleanStringList(raw?.ingredients),
    steps: cleanStringList(raw?.steps),
    sourceNotes: String(raw?.sourceNotes || raw?.notes || "").trim(),
    prepTimeMinutes: prep,
    cookTimeMinutes: cook,
    totalTimeMinutes: total,
    servings,
    nutrition: {
      calories,
      protein,
      carbs,
      fat,
      sugars: asNonNegative(nutrition.sugars),
      fiber: asNonNegative(nutrition.fiber),
      salt: asNonNegative(nutrition.salt),
      estimated: nutrition.estimated !== false
    }
  };
}

export async function POST(request: Request) {
  const auth = await guard(request, "extract");
  if (auth) return auth;

  let workdir = "";
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new HttpError(503, "Servizio di estrazione non configurato.");
    }

    const form = await readForm(request, 60 * 1024 * 1024);
    const sourceUrl = String(form.get("sourceUrl") || "").trim();
    const sourceText = String(form.get("sourceText") || "").trim().slice(0, 120_000);
    const recipeId = String(form.get("recipeId") || "").trim() || crypto.randomUUID();
    const uploaded = form.get("video") as File | null;
    if (sourceUrl) urlSchema.parse(sourceUrl);
    if (uploaded && uploaded.size > 50 * 1024 * 1024) throw new HttpError(413, "Il video supera il limite di 50 MB.");
    const requestedCategories = String(form.get("categoryNames") || "")
      .split("|")
      .map((x) => x.trim())
      .filter(Boolean);
    const categories = mergeCategoryNames(requestedCategories.length ? requestedCategories : [...DEFAULT_CATEGORY_NAMES]);

    if (!sourceUrl && !sourceText && (!uploaded || uploaded.size === 0)) {
      return Response.json({ error: "Incolla il link di un video oppure carica un file." }, { status: 400 });
    }

    if (sourceUrl) {
      const duplicate = await findDuplicate(sourceUrl);
      if (duplicate) {
        return Response.json({ duplicate: true, existingRecipe: duplicate, message: "Questa fonte è già presente nel ricettario." });
      }
    }

    workdir = await mkdtemp(path.join(tmpdir(), "ricettario-"));
    let mediaPath = "";
    let metadataText = "";
    let imageUrl = "";
    let warning = "";

    if (sourceUrl) {
      const metadata = await getYtDlpMetadata(sourceUrl);
      metadataText = metadata.text;

      const thumb = await downloadYtDlpThumbnailBytes(sourceUrl, workdir);
      if (thumb) {
        imageUrl = await persistRecipeImageBytes(recipeId, thumb.bytes, thumb.contentType).catch(() => "");
      }
      if (!imageUrl && metadata.thumbnail) {
        imageUrl = await persistRecipeImage(recipeId, metadata.thumbnail).catch(() => metadata.thumbnail || "");
      }

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
        file: await OpenAI.toFile(await readFile(/* turbopackIgnore: true */ mediaPath), path.basename(mediaPath)),
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
      max_output_tokens: 1800,
      input: `Trasforma il contenuto seguente in una ricetta italiana chiara e fedele. Devi produrre una scheda completa anche quando il video non dichiara tutti i dati.\n\nREGOLE DI FEDELTÀ:\n- Ingredienti e procedimento devono derivare dal contenuto. Non inventare quantità mancanti: se la quantità non è disponibile, scrivi solo il nome dell'ingrediente.\n- Elimina saluti, sponsor, pubblicità e parti non pertinenti.\n- sourceNotes contiene SOLO informazioni utili provenienti dalla fonte o incertezze dell'estrazione. Non scrivere frasi decorative.\n\nSTIME OBBLIGATORIE:\n- Se tempi, porzioni o valori nutrizionali non sono dichiarati, STIMALI in modo culinariamente plausibile usando ingredienti, quantità e tipo di piatto. Non lasciare questi campi a zero soltanto perché il video non li dice.\n- servings deve essere un intero plausibile da 1 a 12; se non è chiaro, usa la stima più probabile (spesso 2 o 4).\n- I valori nutrizionali sono PER PORZIONE: calories in kcal; protein, carbs, fat, sugars, fiber e salt in grammi.\n- nutrition.estimated deve essere true quando almeno un valore è stimato.\n- totalTimeMinutes deve essere almeno prepTimeMinutes + cookTimeMinutes.\n\nCATALOGO:\n- suggestedCategory deve essere ESATTAMENTE uno di questi valori: ${categories.join(", ")}.\n- Scegli il catalogo più coerente con il piatto.\n\nRestituisci SOLO JSON valido, senza markdown, con questa forma:\n{\n  "title": "string",\n  "suggestedCategory": "string",\n  "ingredients": ["string"],\n  "steps": ["string"],\n  "sourceNotes": "string",\n  "prepTimeMinutes": 10,\n  "cookTimeMinutes": 15,\n  "totalTimeMinutes": 25,\n  "servings": 2,\n  "nutrition": {\n    "calories": 450,\n    "protein": 20,\n    "carbs": 55,\n    "fat": 16,\n    "sugars": 6,\n    "fiber": 5,\n    "salt": 1.2,\n    "estimated": true\n  }\n}\n\nURL FONTE:\n${sourceUrl || "nessuno"}\n\nCONTENUTO:\n${context}`
    });

    let raw: any;
    try {
      raw = JSON.parse(response.output_text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim());
    } catch {
      throw new Error("L'AI ha restituito una risposta non valida. Riprova l'estrazione.");
    }

    return Response.json({
      ...normalizeRecipe(raw, categories),
      imageUrl,
      recipeId,
      warning
    });
  } catch (error) {
    console.error("EXTRACT ERROR", error instanceof Error ? error.message : "unknown");
    return errorResponse(error);
  } finally {
    if (workdir) {
      try { await rm(workdir, { recursive: true, force: true }); } catch {}
    }
  }
}
