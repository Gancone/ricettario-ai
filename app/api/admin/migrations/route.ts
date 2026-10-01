import { requireAppAuth } from '@/lib/app-auth';
import { migrateDatabase } from '@/lib/migrations';
import { errorResponse } from '@/lib/validation';
export const runtime='nodejs';
export const maxDuration=300;
export async function POST(request:Request){
 const auth=requireAppAuth(request);if(auth)return auth;
 // Bootstrap cannot depend on tables this very migration creates; DB advisory lock serializes it.
 try{return Response.json(await migrateDatabase());}catch(e){return errorResponse(e);}
}
