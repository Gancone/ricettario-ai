import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Variabile d'ambiente mancante: ${name}`);
  return value;
}

let client: SupabaseClient | undefined;
function getClient() {
  if (client) return client;
  const url = getEnv("SUPABASE_URL");
  try { if (!/^https?:$/.test(new URL(url).protocol)) throw new Error(); }
  catch { throw new Error("SUPABASE_URL non è un indirizzo valido. Controlla il Project URL nelle impostazioni del server."); }
  client = createClient(url, getEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal || AbortSignal.timeout(20000) }) }
  });
  return client;
}

// La configurazione viene verificata alla prima richiesta, senza bloccare la build.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const instance = getClient();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  }
});
