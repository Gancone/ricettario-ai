import { guard,allRows } from '@/lib/backend';
import { supabase } from '@/lib/supabase';
import { fromDb } from '@/lib/recipe-map';
import { validateRecipe } from '@/lib/recipe-input';
import { findDuplicate,insertRecipe } from '@/lib/recipe-store';
import { persistRecipeImage } from '@/lib/image-storage';
import { createDatabaseSnapshot } from '@/lib/data-safety';
import { readJson,errorResponse,HttpError,uuid } from '@/lib/validation';
export async function GET(request:Request){
 const auth=await guard(request);if(auth)return auth;
 try{
  const url=new URL(request.url);
  if(url.searchParams.has('limit')){
   const limit=Math.min(200,Math.max(1,Number(url.searchParams.get('limit'))||100));const cursor=url.searchParams.get('cursor');
   let q=supabase.from('recipes').select('*').order('id').limit(limit);if(cursor)q=q.gt('id',uuid.parse(cursor));
   const {data,error}=await q;if(error)throw error;
   return Response.json({items:(data||[]).map(fromDb),nextCursor:data?.length===limit?data[data.length-1].id:null},{headers:{'cache-control':'no-store'}});
  }
  return Response.json((await allRows('recipes')).map(fromDb),{headers:{'cache-control':'no-store'}});
 }catch(e){return errorResponse(e);}
}
export async function POST(request:Request){
 const auth=await guard(request,'write');if(auth)return auth;
 try{
  const recipe=validateRecipe(await readJson(request));const duplicate=recipe.sourceUrl?await findDuplicate(recipe.sourceUrl,recipe.id):null;
  if(duplicate)throw new HttpError(409,'Questa fonte è già presente.',{duplicateId:duplicate.id,current:duplicate});
  recipe.imageUrl=await persistRecipeImage(recipe.id,recipe.imageUrl);
  const saved=await insertRecipe(recipe);let backupWarning='';
  try{const backup=await createDatabaseSnapshot('recipe-save');if(backup.suspicious)backupWarning='Backup sospetto: copia precedente conservata.';}catch{backupWarning='Backup automatico non completato: la ricetta è salvata.';}
  return Response.json({...saved,backupWarning});
 }catch(e){return errorResponse(e);}
}
