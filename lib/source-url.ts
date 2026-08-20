export function normalizeSourceUrl(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.host.toLowerCase().replace(/^www\./, "");
    let pathname = url.pathname.replace(/\/+$/, "");
    if (!pathname) pathname = "/";
    return `${url.protocol.toLowerCase()}//${host}${pathname}`;
  } catch {
    return raw.replace(/[?#].*$/, "").replace(/\/+$/, "").replace(/^https?:\/\/www\./i, "https://").toLowerCase();
  }
}
