import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scaleIngredient, remainingSeconds, matchesSearch } from '../lib/cooking.ts';
import { validShoppingItems, addIngredients } from '../lib/shopping.ts';
import { restoreDraft } from '../lib/draft-storage.ts';
import { validateRecipe } from '../lib/recipe-input.ts';
import { api, ApiError } from '../lib/api-client.ts';

test('quantità: frazioni, numeri misti, virgole e simboli Unicode', () => {
  for (const [input, factor, expected] of [['1/2 tazza di latte', 2, '1 tazza di latte'], ['1 1/2 tazze', 2, '3 tazze'], ['½ cucchiaio', 2, '1 cucchiaio'], ['1½ tazze', 2, '3 tazze'], ['0,5 kg di farina', 3, '1,5 kg di farina'], ['200 g farina', .5, '100 g farina']]) assert.equal(scaleIngredient(input, factor), expected);
  for (const input of ['sale q.b.', '2-3 uova', '20x30 cm', '1/0 tazza']) assert.equal(scaleIngredient(input, 2), input);
});
test('timer corretto anche dopo una sospensione del browser', () => {
  assert.equal(remainingSeconds(61000, 1000), 60);
  assert.equal(remainingSeconds(61000, 30000), 31);
  assert.equal(remainingSeconds(61000, 90000), 0);
});
test('ricerca per più parole indipendenti dall’ordine e dagli accenti', () => {
  assert.ok(matchesSearch('Caffè con latte e cannella', 'latte caffe'));
  assert.equal(matchesSearch('Pasta al pomodoro', 'pasta tonno'), false);
});
test('spesa: non perdere quantità o mutare i dati delle ricette precedenti', () => {
  let nextId = 0;
  const id = () => String(++nextId);
  const original = [{ id: 'a', text: '100 g farina', source: 'Pane', done: false }];
  const next = addIngredients(original, ['200 g farina', '100 g farina'], 'Torta', id);
  assert.equal(next.length, 3);
  assert.equal(original[0].source, 'Pane');
  assert.equal(addIngredients(next, ['200 g farina'], 'Torta', id).length, 3);
  assert.equal(validShoppingItems([{ text: 'Latte' }]), false);
  assert.equal(validShoppingItems(next), true);
});
test('bozza: recupero dei campi validi senza accettare dati corrotti', () => {
  const empty = { id: 'abc', title: '', ingredients: '', nutritionEstimated: true };
  const result = restoreDraft(JSON.stringify({ draft: { title: 'Pasta', ingredients: ['invalid'], nutritionEstimated: false }, sourceText: 'Testo originale' }), empty);
  assert.equal(result.draft.title, 'Pasta'); assert.equal(result.draft.ingredients, '');
  assert.equal(result.draft.nutritionEstimated, false); assert.equal(result.sourceText, 'Testo originale');
  assert.equal(restoreDraft('{corrotto', empty), null);
});
const recipe = { id: '12345678-1234-4234-8234-123456789012', title: ' Pasta ', category: '', ingredients: ['  Pasta '], steps: ['Cuoci'], tags: [] };
test('validazione server protegge salvataggi e modifiche', () => {
  assert.equal(validateRecipe(recipe).title, 'Pasta');
  assert.equal(validateRecipe(recipe).category, 'Senza categoria');
  for (const value of [null, { ...recipe, id: 'draft-1' }, { ...recipe, steps: [] }, { ...recipe, ingredients: {} }, { ...recipe, sourceUrl: 'javascript:alert(1)' }, { ...recipe, nutrition: { calories: -10 } }, { ...recipe, servings: 1e20 }]) assert.throws(() => validateRecipe(value));
});
test('errori API: HTML, sessione scaduta e problemi di connessione', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>Bad gateway</html>', { status: 502 });
    await assert.rejects(api('/test'), /server non ha completato/);
    globalThis.fetch = async () => Response.json({}, { status: 401 });
    await assert.rejects(api('/test'), (e) => e instanceof ApiError && e.status === 401);
    globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
    await assert.rejects(api('/test'), /Connessione non disponibile/);
  } finally { globalThis.fetch = original; }
});
