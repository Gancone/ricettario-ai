import crypto from "crypto";

export const APP_AUTH_COOKIE = "ricettario_app_auth";

export function configuredAppPassword() {
  return String(process.env.APP_PASSWORD || process.env.UPDATE_PASSWORD || "").trim();
}

function tokenFor(password: string) {
  return crypto
    .createHash("sha256")
    .update(`ricettario-app-v2:${password}`)
    .digest("hex");
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function isAppAuthenticated(request: Request) {
  const password = configuredAppPassword();
  if (!password) return true;
  const cookie = cookieValue(request, APP_AUTH_COOKIE);
  return Boolean(cookie && safeEqual(cookie, tokenFor(password)));
}

export function requireAppAuth(request: Request) {
  if (isAppAuthenticated(request)) return null;
  return Response.json(
    { error: "Sessione non autorizzata. Accedi al Ricettario." },
    { status: 401, headers: { "cache-control": "no-store" } }
  );
}

export function validPassword(candidate: string) {
  const password = configuredAppPassword();
  if (!password) return true;
  return safeEqual(candidate, password);
}

export function authCookieHeader() {
  const password = configuredAppPassword();
  const token = tokenFor(password);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${APP_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`;
}

export function clearAuthCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${APP_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
