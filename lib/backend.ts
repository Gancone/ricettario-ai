import { supabase } from './supabase';
import crypto from 'node:crypto';
import { requireAppAuth, configuredAppPassword, requireSameOrigin } from './app-auth';
import { HttpError, errorResponse } from './validation';
export const SCHEMA_VERSION = '001_backend_safety';
export async function requireSchema() {
 const {data,error}=await supabase.from('schema_migrations').select('id').eq('id',SCHEMA_VERSION).maybeSingle();
 if(error||!data) throw new HttpError(503,'Schema database non aggiornato. Esegui npm run db:migrate.',{code:'SCHEMA_NOT_READY'});
}
const limits:Record<string,[number,number]>={login:[10,900],extract:[6,3600],image:[120,60],update:[3,3600],backup:[12,3600],write:[120,60],read:[600,60]};
const loginAttempts = new Map<string, { count: number; expires: number }>();
export async function guard(request:Request,operation='read',login=false) {
 if(!login){const auth=requireAppAuth(request);if(auth)return auth;}
 else{if(!configuredAppPassword())return Response.json({error:'Configurazione incompleta: APP_PASSWORD obbligatoria.'},{status:503});const origin=requireSameOrigin(request);if(origin)return origin;
  // Login must remain usable before the first migration creates backend_limits.
  const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const now = Date.now(); const current = loginAttempts.get(key);
  if (!current || current.expires <= now) loginAttempts.set(key, { count: 1, expires: now + 15 * 60 * 1000 });
  else if (++current.count > 10) return Response.json({ error: 'Troppi tentativi. Riprova più tardi.' }, { status: 429, headers: { 'retry-after': '900' } });
  return null;
 }
 try {
  const [count,seconds]=limits[operation]||limits.read;
  const source = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  const bucket = crypto.createHash('sha256').update(source).digest('hex').slice(0,32);
  const {data,error}=await supabase.rpc('consume_limit',{p_key:'app:'+operation+':'+bucket,p_limit:count,p_seconds:seconds});
  if(error)throw new HttpError(503,'Limitatore non disponibile: verifica la migrazione del database.');
  if(!data)return Response.json({error:'Troppe richieste. Riprova più tardi.'},{status:429,headers:{'retry-after':String(seconds)}});
  return null;
 }catch(e){return errorResponse(e);}
}
export function clearLoginLimit(request: Request) {
 const key = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
 loginAttempts.delete(key);
}
export async function* pages(table:string,columns='*',size=200):AsyncGenerator<any[]> {
 let after:string|number|undefined;
 for(;;){let q=supabase.from(table).select(columns).order('id').limit(size);if(after!==undefined)q=q.gt('id',after);
 const {data,error}=await q;if(error)throw error;if(!data?.length)break;yield data;after=(data[data.length-1] as any).id;if(data.length<size)break;}
}
export async function allRows(table:string){const result:any[]=[];for await(const page of pages(table))result.push(...page);return result;}
