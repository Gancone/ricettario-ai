import { access } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !path.extname(specifier)) {
    const candidate = new URL(`${specifier}.ts`, context.parentURL);
    try { await access(fileURLToPath(candidate)); return nextResolve(candidate.href, context); } catch {}
  }
  return nextResolve(specifier, context);
}
