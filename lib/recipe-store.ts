import { supabase } from './supabase';
import { fromDb,toDb } from './recipe-map';
import { requireSchema } from './backend';
import { normalizeSourceUrl } from './source-url';
import { uuid,revisionSchema,HttpError } from './validation';
import type { Recipe } from '@/types/recipe';
export async function findDuplicate(source:string,exclude?:string){
 const normalized=normalizeSourceUrl(source);if(!normalized)return null;
 await requireSchema();
 // The SQL normalizer is authoritative for legacy URLs and query escaping.
 const norm=await supabase.rpc('normalize_recipe_source',{value:source});if(norm.error)throw norm.error;
 let q=supabase.from('recipes').select('*').eq('source_url_normalized',norm.data||normalized).limit(1);
 if(exclude)q=q.neq('id',exclude);
 const {data,error}=await q;if(error)throw error;return data?.[0]?fromDb(data[0]):null;
}
export async function getRecipe(id:string){
 uuid.parse(id);const {data,error}=await supabase.from('recipes').select('*').eq('id',id).maybeSingle();if(error)throw error;
 if(!data)throw new HttpError(404,'Ricetta non trovata.');return data;
}
export async function insertRecipe(recipe:Recipe){
 await requireSchema();
 const {data,error}=await supabase.from('recipes').insert({id:recipe.id,...toDb(recipe),created_at:recipe.createdAt||new Date().toISOString()}).select('*').single();
 if(error?.code==='23505')throw new HttpError(409,'Questo ID esiste già: nessuna ricetta è stata sovrascritta.',{current:fromDb(await getRecipe(recipe.id))});
 if(error)throw error;return fromDb(data);
}
export async function applyRecipe(id:string,expected:unknown,patch:Record<string,unknown>,reason='before_update'){
 uuid.parse(id);if(!revisionSchema.safeParse(expected).success)throw new HttpError(428,'Ricarica la ricetta: manca la revisione richiesta.');
 await requireSchema();
 const {data,error}=await supabase.rpc('recipe_apply',{p_id:id,p_expected:expected,p_patch:patch,p_reason:reason});
 if(error)throw error;if(data.missing)throw new HttpError(404,'Ricetta non trovata.');
 if(data.conflict)throw new HttpError(409,'La ricetta è stata modificata su un altro dispositivo. Le tue modifiche non sono state sovrascritte: conserva la bozza e ricarica la versione corrente.',{current:fromDb(data.current)});
 return fromDb(data.current);
}
