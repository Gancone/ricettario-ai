import { z } from 'zod';

export const uuid = z.string().uuid();
export const revisionSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
export const urlSchema = z.string().max(4096).refine(value => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; }
}, 'URL HTTP/HTTPS non valido');
const optionalUrl = z.union([urlSchema, z.literal('')]).optional();
const number = z.number().finite().min(0).max(1e7).optional();
export const nutritionSchema = z.object({ calories: number, protein: number, carbs: number, fat: number, sugars: number, fiber: number, salt: number, estimated: z.boolean().optional() });
export const recipeSchema = z.object({
  id: uuid, title: z.string().trim().min(1).max(300), category: z.string().trim().max(120).optional().transform(v => v || 'Senza categoria'),
  tags: z.array(z.string().trim().max(100)).max(100),
  ingredients: z.array(z.string().trim().min(1).max(4000)).min(1).max(500),
  steps: z.array(z.string().trim().min(1).max(10000)).min(1).max(500),
  notes: z.string().max(50000).optional(), sourceNotes: z.string().max(50000).optional(),
  sourceUrl: optionalUrl, imageUrl: optionalUrl,
  prepTimeMinutes: number, cookTimeMinutes: number, totalTimeMinutes: number, servings: number,
  nutrition: nutritionSchema.optional(), favorite: z.boolean().optional(), archived: z.boolean().optional(),
  rating: z.number().int().min(0).max(5).optional(), createdAt: z.iso.datetime({ offset: true }).optional(),
  updatedAt: z.iso.datetime({ offset: true }).optional(), archivedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  revision: revisionSchema.optional(), expectedRevision: revisionSchema.optional()
});
export const categorySchema = z.object({ name: z.string().trim().min(1).max(120) });
export const shoppingItemSchema = z.object({
  id: uuid, text: z.string().trim().min(1).max(1000), source: z.string().max(300).default(''),
  quantity: z.number().finite().min(0).max(1e6).nullable().optional(), unit: z.string().max(40).nullable().optional(),
  recipe_id: uuid.nullable().optional(), done: z.boolean(), revision: revisionSchema.optional()
});
export const uploadMetadataSchema = z.object({ recipeId: uuid, contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']), size: z.number().int().positive().max(10 * 1024 * 1024) });
export const manifestSchema = z.object({
  name: z.literal('Ricettario AI'), version: z.string().regex(/^\d+\.\d+\.\d+$/),
  channel: z.literal('stable').optional(), description: z.string().max(5000).optional(), notes: z.string().max(10000).optional(),
  managedRoots: z.array(z.string().max(200)).max(30).optional(), delete: z.array(z.string().max(300)).max(500).optional(),
  hashes: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).optional()
});
export const backupZipManifestSchema = z.object({
  format: z.literal('ricettario-ai-backup'), version: z.number().int().min(1).max(2),
  createdAt: z.string().max(80), app_version: z.string().max(40),
  files: z.array(z.object({ path: z.string().min(1).max(500), bytes: z.number().int().nonnegative().max(100 * 1024 * 1024), checksum: z.string().regex(/^[a-f0-9]{64}$/) })).max(10000)
});
export class HttpError extends Error {
  public status: number;
  public details?: Record<string, unknown>;
  constructor(status: number, message: string, details?: Record<string, unknown>) { super(message); this.status = status; this.details = details; }
}
export function errorResponse(error: unknown) {
  if (error instanceof HttpError) return Response.json({ error: error.message, ...error.details }, { status: error.status, headers: { 'cache-control': 'no-store' } });
  if (error instanceof z.ZodError || error instanceof SyntaxError || (error instanceof Error && error.name === 'InvalidRecipe')) return Response.json({ error: 'Dati non validi. Controlla campi e formato.' }, { status: 400 });
  return Response.json({ error: 'Operazione non completata. I dati esistenti sono conservati. Controlla la diagnostica backend.' }, { status: 503 });
}
export async function readBytes(request: Request, max = 2 * 1024 * 1024) {
  if (Number(request.headers.get('content-length')) > max) throw new HttpError(413, 'Payload troppo grande. Usa richieste a batch.');
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) throw new HttpError(413, 'Payload troppo grande. Usa richieste a batch.'); parts.push(value); } }
  catch (e) { await reader.cancel().catch(() => {}); throw e; }
  finally { reader.releaseLock(); }
  return Buffer.concat(parts);
}
export async function readJson(request: Request, max?: number) { return JSON.parse((await readBytes(request, max)).toString('utf8')); }
export async function readForm(request: Request, max: number) {
  const bytes = await readBytes(request, max);
  return new Response(new Uint8Array(bytes), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
}
