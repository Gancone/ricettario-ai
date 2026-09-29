export type ShoppingItem = { id: string; text: string; source: string; done: boolean };
export function validShoppingItems(value: unknown): value is ShoppingItem[] {
  return Array.isArray(value) && value.length <= 1000 && value.every((item) => item &&
    typeof item.id === "string" && typeof item.text === "string" && item.text.trim().length > 0 &&
    typeof item.source === "string" && typeof item.done === "boolean");
}

export function addIngredients(current: ShoppingItem[], ingredients: string[], source: string, id: () => string) {
  const next = current.map((item) => ({ ...item }));
  for (const text of ingredients) {
    // Unisci solo righe identiche della stessa ricetta: quantità diverse non vanno perse.
    const exists = next.some((item) => !item.done && item.text.trim().toLocaleLowerCase("it") === text.trim().toLocaleLowerCase("it") && item.source === source);
    if (!exists && text.trim()) next.push({ id: id(), text: text.trim(), source, done: false });
  }
  return next;
}
