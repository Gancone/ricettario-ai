export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; }
}

export async function api<T>(url: string, init: RequestInit = {}, timeoutMs = 45000): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, cache: "no-store", signal: init.signal || controller.signal });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new ApiError(response.status === 401
      ? "La sessione è scaduta. Accedi di nuovo: la bozza rimane su questo dispositivo."
      : body?.error || (response.status === 413 ? "File troppo grande. Usa un file più piccolo o incolla il testo della ricetta." : "Il server non ha completato la richiesta. Riprova tra poco."), response.status);
    if (body === null) throw new Error("Risposta del server non valida. Riprova.");
    return body as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("La richiesta sta impiegando troppo tempo. Controlla la connessione e riprova.");
    if (error instanceof TypeError) throw new Error("Connessione non disponibile. I dati inseriti restano su questo dispositivo.");
    throw error;
  } finally { clearTimeout(timeout); }
}

export function jsonBody(value: unknown): RequestInit {
  return { headers: { "content-type": "application/json" }, body: JSON.stringify(value) };
}
