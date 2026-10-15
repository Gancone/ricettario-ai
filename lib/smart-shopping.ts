import {
  canonicalMeasure,
  formatIngredient,
  ingredientGroup,
  normalizeIngredient,
  parseIngredient,
  type StructuredIngredient,
} from "./ingredients";
import type { ShoppingItem } from "./shopping";
export type Contribution = {
  key: string;
  source: string;
  quantity: number | null;
  quantity_max: number | null;
};
export type SmartShoppingItem = ShoppingItem & {
  quantity_max?: number | null;
  ingredient_key?: string;
  group_name?: string;
  contributions?: Contribution[];
};
function recalculate(row: SmartShoppingItem, item: StructuredIngredient) {
  const parts = row.contributions || [];
  const unknown = parts.some((part) => part.quantity === null);
  row.quantity = unknown
    ? null
    : parts.reduce((sum, part) => sum + (part.quantity || 0), 0);
  row.quantity_max =
    unknown || !parts.some((part) => part.quantity_max != null)
      ? null
      : parts.reduce(
          (sum, part) => sum + (part.quantity_max ?? part.quantity ?? 0),
          0,
        );
  row.source = [...new Set(parts.map((part) => part.source))]
    .join(" · ")
    .slice(0, 300);
  row.text = formatIngredient({
    ...item,
    quantity: row.quantity,
    quantityMax: row.quantity_max,
    unit: row.unit || null,
  });
}
export function aggregateShopping(
  current: SmartShoppingItem[],
  input: { item: StructuredIngredient; key: string; source: string }[],
  id: () => string,
) {
  const next = current.map((row) => ({
    ...row,
    contributions: row.contributions?.map((item) => ({ ...item })),
  }));
  for (const { item, key, source } of input) {
    const measure =
      item.quantity === null
        ? { quantity: null, unit: item.unit }
        : canonicalMeasure(item.quantity, item.unit);
    const max =
      item.quantityMax === null
        ? null
        : canonicalMeasure(item.quantityMax, item.unit).quantity;
    const groupKey =
      item.normalizedIngredient +
      "|" +
      (measure.unit || "unspecified") +
      "|" +
      (item.quantity === null ? "unknown" : "known") +
      "|" +
      normalizeIngredient(item.notes);
    const contribution = {
      key,
      source: source.slice(0, 300),
      quantity: measure.quantity,
      quantity_max: max,
    };
    const previous = next.find(
      (row) => !row.done && row.contributions?.some((part) => part.key === key),
    );
    if (previous) {
      if (previous.ingredient_key === groupKey) {
        previous.contributions = previous.contributions!.map((part) =>
          part.key === key ? contribution : part,
        );
        recalculate(previous, { ...item, unit: measure.unit });
        continue;
      }
      previous.contributions = previous.contributions!.filter(
        (part) => part.key !== key,
      );
      if (!previous.contributions.length)
        next.splice(next.indexOf(previous), 1);
      else recalculate(previous, parseIngredient(previous.text));
    }
    const existing = next.find(
      (row) => !row.done && row.ingredient_key === groupKey,
    );
    if (existing) {
      existing.contributions = [
        ...(existing.contributions || []),
        contribution,
      ];
      recalculate(existing, { ...item, unit: measure.unit });
    } else
      next.push({
        id: id(),
        text: formatIngredient({
          ...item,
          quantity: measure.quantity,
          quantityMax: max,
          unit: measure.unit,
        }),
        source: source.slice(0, 300),
        done: false,
        quantity: measure.quantity,
        quantity_max: max,
        unit: measure.unit,
        ingredient_key: groupKey,
        group_name: ingredientGroup(item.ingredient),
        contributions: [contribution],
      });
  }
  return next;
}
export function shoppingFromText(
  current: SmartShoppingItem[],
  lines: string[],
  source: string,
  id: () => string,
) {
  return aggregateShopping(
    current,
    lines.map((line, index) => ({
      item: parseIngredient(line),
      key: source + "|" + index + "|" + line,
      source,
    })),
    id,
  );
}
