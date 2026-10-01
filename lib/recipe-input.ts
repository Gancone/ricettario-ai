import { recipeSchema } from './validation';
import type { Recipe } from '@/types/recipe';
export class InvalidRecipe extends Error { name = 'InvalidRecipe'; }
export function validateRecipe(value: unknown): Recipe & { expectedRevision?: number } {
  const result = recipeSchema.safeParse(value);
  if (!result.success) throw new InvalidRecipe('Ricetta non valida: controlla titolo, ingredienti, procedimento, URL e limiti dei campi.');
  return { ...result.data, createdAt: result.data.createdAt || new Date().toISOString() };
}
