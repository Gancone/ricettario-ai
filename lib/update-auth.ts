import crypto from "crypto";

export const UPDATE_COOKIE = "ricettario_update_trusted";

export function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

export function trustedValue(password: string) {
  return crypto.createHash("sha256").update(`ricettario-device-v1:${password}`).digest("hex");
}

export function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

export function isTrustedUpdateDevice(request: Request, password: string) {
  if (!password) return false;
  const value = cookieValue(request, UPDATE_COOKIE);
  return !!value && safeEqual(value, trustedValue(password));
}
