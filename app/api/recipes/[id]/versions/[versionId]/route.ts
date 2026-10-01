import { guard } from '@/lib/backend';
import { supabase } from '@/lib/supabase';
import { fromDb,toDb } from '@/lib/recipe-map';
import { applyRecipe } from '@/lib/recipe-store';
import { createDatabaseSnapshot } from '@/lib/data-safety';
import { uuid,readJson,errorResponse,HttpError } from '@/lib/validation';
type Context={params:Promise<{id:string;versionId:string}>};
async function readVersion(id:string,versionId:string){uuid.parse(id);uuid.parse(versionId);const {data,error}=await supabase.from('recipe_versions').select('*').eq('recipe_id',id).eq('id',versionId).maybeSingle();if(error)throw error;if(!data)throw new HttpError(404,'Versione non trovata.');return data;}
export async function GET(request:Request,{params}:Context){const auth=await guard(request);if(auth)return auth;try{const {id,versionId}=await params;return Response.json(await readVersion(id,versionId));}catch(e){return errorResponse(e);}}
export async function POST(request:Request,{params}:Context){
 const auth=await guard(request,'backup');if(auth)return auth;
 try{const {id,versionId}=await params;const input=await readJson(request);const version=await readVersion(id,versionId);
 const backup=await createDatabaseSnapshot('pre-version-restore');if(backup.suspicious)throw new HttpError(409,'Backup sospetto: ripristino bloccato.');
 return Response.json(await applyRecipe(id,input.expectedRevision,toDb(fromDb(version.snapshot)),'before_restore'));
 }catch(e){return errorResponse(e);}
}
