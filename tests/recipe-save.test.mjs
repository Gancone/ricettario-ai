import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { toDb, fromDb } from "../lib/recipe-map.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("../lib/recipe-id.ts", import.meta.url), "utf8"))
  .replace("export function createRecipeId", "function createRecipeId") + "\ncreateRecipeId();";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
for (const [name, crypto] of [
  ["browser moderno", webcrypto],
  ["browser HTTP senza randomUUID", { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) }],
  ["browser senza API crypto", undefined]
]) {
  test(`ID compatibile con Supabase: ${name}`, () => {
    const ids = new Set(Array.from({ length: 50 }, () => runInNewContext(source, { crypto })));
    assert.equal(ids.size, 50);
    for (const id of ids) assert.match(id, uuid);
  });
}

test("tempi decimali compatibili con le colonne integer; metadati v6 preservati", () => {
  const row = toDb({ title: "Pasta", prepTimeMinutes: 2.5, cookTimeMinutes: 0, totalTimeMinutes: 2.5, servings: 2,
    nutrition: { salt: 0.25, fat: 0 }, sourceNotes: "Fonte", favorite: true, archived: true, rating: 4 });
  assert.equal(row.prep_time_minutes, 3);
  assert.equal(row.cook_time_minutes, 0);
  assert.equal(row.total_time_minutes, 3);
  const restored = fromDb(row);
  assert.equal(restored.nutrition.salt, 0.25);
  assert.equal(restored.nutrition.fat, 0);
  assert.equal(restored.sourceNotes, "Fonte");
  assert.equal(restored.favorite, true);
  assert.equal(restored.archived, true);
  assert.equal(restored.rating, 4);
});

test("valori mancanti restano null; valori non validi vengono rifiutati", () => {
  assert.equal(toDb({}).prep_time_minutes, null);
  for (const value of [-1, NaN, Infinity, 2147483648]) {
    assert.throws(() => toDb({ prepTimeMinutes: value }), /numeri validi/);
  }
});
