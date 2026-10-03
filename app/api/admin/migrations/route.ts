import { requireAppAuth } from '@/lib/app-auth';
import { migrateDatabase } from '@/lib/migrations';
import { errorResponse } from '@/lib/validation';
export const runtime='nodejs';
export const maxDuration=300;
export async function GET(request:Request){
 const auth=requireAppAuth(request);if(auth)return auth;
 return new Response('<!doctype html><html lang="it"><meta charset="utf-8"><title>Aggiornamento database</title><main><h1>Aggiornamento database Ricettario</h1><p>Prima delle modifiche viene verificata una copia delle ricette. Le migrazioni sono additive e conservano gli ID.</p><form method="post"><button type="submit">Esegui backup e migrazione</button></form></main></html>',{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; form-action 'self'; frame-ancestors 'none'"}});
}
export async function POST(request:Request){
 const auth=requireAppAuth(request);if(auth)return auth;
 // Bootstrap cannot depend on tables this very migration creates; DB advisory lock serializes it.
 try{return Response.json(await migrateDatabase());}catch(e){return errorResponse(e);}
}
