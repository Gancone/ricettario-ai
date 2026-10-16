import { test } from "node:test";
import assert from "node:assert/strict";
import {
  displayScaledIngredient,
  parseIngredient,
} from "../lib/ingredients.ts";
import { aggregateShopping } from "../lib/smart-shopping.ts";
import { filterGallery } from "../lib/gallery.ts";
import { EMPTY_KITCHEN, pantryCoverage } from "../lib/kitchen.ts";
import { validatePortableRows } from "../lib/portable-validation.ts";
test("scaling visuale conserva frase originale e scala entrambi gli estremi", () => {
  assert.equal(
    displayScaledIngredient("1/2 tazza di latte", 2),
    "1 tazza di latte",
  );
  assert.equal(displayScaledIngredient("2-3 uova", 2), "4–6 uova");
  assert.equal(displayScaledIngredient("sale q.b.", 3), "sale q.b.");
  assert.equal(displayScaledIngredient("20x30 cm", 2), "20x30 cm");
});
test("rigenerare un pasto modificato sostituisce il contributo, non perde le altre ricette", () => {
  const a = {
      item: parseIngredient("200 g pomodori"),
      key: "pasto1:0",
      source: "Lunedì",
    },
    b = {
      item: parseIngredient("300 g pomodori"),
      key: "pasto2:0",
      source: "Martedì",
    };
  const first = aggregateShopping([], [a, b], () => "id1");
  const changed = aggregateShopping(
    first,
    [{ ...a, item: parseIngredient("400 g pomodori") }],
    () => "id2",
  );
  assert.equal(changed.length, 1);
  assert.equal(changed[0].quantity, 700);
  assert.equal(changed[0].text, "700 g pomodori");
  assert.equal(first[0].quantity, 500);
  assert.equal(changed[0].contributions.length, 2);
});
test("dispensa nel piano conserva la provenienza quando il primo pasto è coperto e il secondo parziale", () => {
  const lines = [
    parseIngredient("200 g pasta"),
    parseIngredient("200 g pasta"),
  ];
  const result = pantryCoverage(lines, [
    {
      id: "p",
      revision: 1,
      name: "pasta",
      normalized_name: "pasta",
      quantity: 300,
      unit: "g",
      finished: false,
    },
  ]);
  assert.deepEqual(result.missingIndices, [1]);
  assert.equal(result.missing[0].quantity, 100);
});
test("gallery offline: accenti, tutte le parole, filtri e ordine basati sullo storico", () => {
  const a = {
      id: "a",
      title: "Caffè al latte",
      ingredients: ["200 ml latte"],
      steps: ["Scalda"],
      tags: [],
      category: "Colazione",
      createdAt: "2026-10-01T00:00:00Z",
      totalTimeMinutes: 5,
    },
    b = {
      ...a,
      id: "b",
      title: "Zuppa di ceci",
      tags: ["vegetariana"],
      category: "Primi",
      createdAt: "2026-10-02T00:00:00Z",
    };
  const query = {
    q: "latte caffe",
    category: "Tutte",
    filter: "all",
    sort: "newest",
  };
  assert.deepEqual(
    filterGallery([a, b], query, EMPTY_KITCHEN).map((r) => r.id),
    ["a"],
  );
  assert.deepEqual(
    filterGallery(
      [a, b],
      { ...query, q: "", filter: "vegetarian" },
      EMPTY_KITCHEN,
    ).map((r) => r.id),
    ["b"],
  );
  assert.deepEqual(
    filterGallery(
      [a, b],
      { ...query, q: "", sort: "cooked" },
      {
        ...EMPTY_KITCHEN,
        stats: [
          {
            recipe_id: "a",
            count: 3,
            last_cooked_at: "2026-10-15",
            average_rating: 4,
          },
        ],
      },
    ).map((r) => r.id),
    ["a", "b"],
  );
});
test("backup: validazione completa degli ID prima delle modifiche e record ripetuti rifiutati", () => {
  const row = {
    id: "12345678-1234-4234-8234-123456789012",
    title: "Ricetta",
    ingredients: ["sale"],
    steps: ["Cuoci"],
    revision: 1,
  };
  assert.doesNotThrow(() => validatePortableRows({ recipes: [row] }));
  assert.throws(
    () => validatePortableRows({ recipes: [row, row] }),
    /duplicato/,
  );
  assert.throws(
    () => validatePortableRows({ recipes: [{ ...row, revision: 0 }] }),
    /Revisione/,
  );
  assert.throws(() => validatePortableRows({ pantry: [{ id: "non valido" }] }));
});
import {migrationHash,matchesMigration} from '../lib/migration-hash.ts';
import {checksum} from '../lib/backup-format.ts';
test('migrazioni: Windows e Linux hanno hash compatibili, una modifica SQL resta bloccata',()=>{const sql='CREATE TABLE esempio(id text);\n';assert.equal(migrationHash(sql),migrationHash(sql.replace(/\n/g,'\r\n')));assert.equal(matchesMigration(sql,checksum(sql.replace(/\n/g,'\r\n'))),true);assert.equal(matchesMigration(sql+'-- modificato',migrationHash(sql)),false);});
