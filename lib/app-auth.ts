import crypto from 'node:crypto';
export const APP_AUTH_COOKIE = 'ricettario_app_auth';
export function configuredAppPassword() { return String(process.env.APP_PASSWORD || '').trim(); }
function safeEqual(a: string, b: string) {
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());
}
function lifetime() {
  const value = Number(process.env.SESSION_TTL_SECONDS || 604800);
  return Number.isFinite(value) ? Math.max(300, Math.min(2592000, Math.floor(value))) : 604800;
}
function signature(value: string) { return crypto.createHmac('sha256', configuredAppPassword()).update('ricettario-session-v3:' + value).digest('base64url'); }
export function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('cookie') || '').split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) { try { return decodeURIComponent(rest.join('=')); } catch { return ''; } }
  }
  return '';
}
export function isAppAuthenticated(request: Request) {
  if (!configuredAppPassword()) return false;
  const [expiry, nonce, sig, extra] = cookieValue(request, APP_AUTH_COOKIE).split('.');
  const timestamp = Number(expiry);
  return !extra && /^\d+$/.test(expiry || '') && /^[a-f0-9]{32}$/.test(nonce || '') && !!sig &&
    timestamp > Date.now() / 1000 && timestamp <= Date.now() / 1000 + lifetime() + 60 && safeEqual(sig, signature(expiry + '.' + nonce));
}
export function requireSameOrigin(request: Request) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return null;
  const origin = request.headers.get('origin');
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== new URL(request.url).origin))
    return Response.json({ error: 'Origine della richiesta non autorizzata.' }, { status: 403 });
  return null;
}
export function requireAppAuth(request: Request) {
  if (!configuredAppPassword()) return Response.json({ error: 'Configurazione incompleta: APP_PASSWORD obbligatoria.', code: 'AUTH_NOT_CONFIGURED' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  if (!isAppAuthenticated(request)) return Response.json({ error: 'Sessione non autorizzata. Accedi al Ricettario.' }, { status: 401, headers: { 'cache-control': 'no-store' } });
  return requireSameOrigin(request);
}
export function validPassword(candidate: string) { const password = configuredAppPassword(); return !!password && safeEqual(candidate, password); }
export function authCookieHeader() {
  if (!configuredAppPassword()) throw new Error('APP_PASSWORD obbligatoria');
  const body = (Math.floor(Date.now() / 1000) + lifetime()) + '.' + crypto.randomBytes(16).toString('hex');
  return APP_AUTH_COOKIE + '=' + body + '.' + signature(body) + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + lifetime() + (process.env.NODE_ENV === 'production' ? '; Secure' : '');
}
export function clearAuthCookieHeader() { return APP_AUTH_COOKIE + '=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' + (process.env.NODE_ENV === 'production' ? '; Secure' : ''); }
