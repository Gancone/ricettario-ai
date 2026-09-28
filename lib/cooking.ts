const fractions: Record<string, number> = { "½": .5, "¼": .25, "¾": .75, "⅓": 1 / 3, "⅔": 2 / 3, "⅛": .125 };
const quantity = /^(\s*)(?:(\d+)\s+(\d+)\s*\/\s*(\d+)|(\d+)\s*\/\s*(\d+)|(\d*)\s*([½¼¾⅓⅔⅛])|(\d+(?:[.,]\d+)?))/;

export function scaleIngredient(text: string, factor: number) {
  if (!Number.isFinite(factor) || factor <= 0 || factor === 1) return text;
  const match = text.match(quantity);
  if (!match) return text;
  // Non alterare intervalli o dimensioni come 2-3 uova o 20x30 cm.
  if (/^\s*[-–x×]/i.test(text.slice(match[0].length))) return text;
  const amount = match[2] ? Number(match[2]) + Number(match[3]) / Number(match[4])
    : match[5] ? Number(match[5]) / Number(match[6])
    : match[8] ? Number(match[7] || 0) + fractions[match[8]] : Number(match[9].replace(",", "."));
  if (!Number.isFinite(amount)) return text;
  const scaled = new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(amount * factor);
  return match[1] + scaled + text.slice(match[0].length);
}

export function remainingSeconds(endsAt: number, now = Date.now()) {
  return Math.max(0, Math.ceil((endsAt - now) / 1000));
}

export function matchesSearch(text: string, query: string) {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("it");
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/).every((word) => haystack.includes(word));
}
