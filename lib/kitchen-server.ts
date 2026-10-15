import {z} from 'zod';
import {supabase} from './supabase';
import {HttpError,uuid,revisionSchema} from './validation';
import {normalizeIngredient} from './ingredients';
export const kitchenEntity=z.enum(['pantry_items','meal_plan_entries','cooking_history','recipe_settings']);
const positive=z.number().finite().min(0).max(1e7).nullable();
const fields={id:uuid,revision:revisionSchema.optional(),archived_at:z.iso.datetime({offset:true}).nullable().optional()};
export const pantrySchema=z.object({...fields,name:z.string().trim().min(1).max(300),normalized_name:z.string().max(300).optional(),quantity:positive.default(null),unit:z.string().trim().max(40).nullable().default(null),notes:z.string().max(10000).default(''),finished:z.boolean().default(false)});
export const mealSchema=z.object({...fields,date:z.iso.date(),meal_type:z.enum(['breakfast','lunch','dinner','snack']),recipe_id:uuid,servings:z.number().finite().positive().max(1000),notes:z.string().max(10000).default('')});
export const historySchema=z.object({...fields,recipe_id:uuid,cooked_at:z.iso.datetime({offset:true}),servings:positive.optional(),rating:z.number().int().min(0).max(5).nullable().optional(),notes:z.string().max(10000).default('')});
const settingsSchema=z.object({...fields,preferences:z.object({theme:z.enum(['system','light','dark']).optional(),view:z.enum(['grid','list','compact']).optional(),groupShopping:z.boolean().optional()})});
export async function requireKitchenSchema(){const{data,error}=await supabase.from('schema_migrations').select('id').eq('id','003_personal_kitchen').maybeSingle();if(error||!data)throw new HttpError(503,'Le nuove funzioni richiedono la migrazione v7. Le ricette esistenti restano disponibili.',{code:'KITCHEN_SCHEMA_NOT_READY'});}
export async function saveKitchen(entity:ReturnType<typeof kitchenEntity.parse>,value:unknown,expected:unknown){await requireKitchenSchema();const schema=entity==='pantry_items'?pantrySchema:entity==='meal_plan_entries'?mealSchema:entity==='cooking_history'?historySchema:settingsSchema;const item=schema.parse(value);if('name'in item)item.normalized_name=normalizeIngredient(item.name);if(expected!==null&&expected!==undefined)revisionSchema.parse(expected);
 const {data,error}=await supabase.rpc('kitchen_apply',{p_entity:entity,p_item:item,p_expected:expected??null});
 if(error?.code==='23505')throw new HttpError(409,'Questo elemento esiste già. Ricarica prima di modificarlo.');if(error)throw error;if(data.conflict)throw new HttpError(409,'Modifica concorrente: i dati sul server sono conservati. Ricarica prima di riprovare.',{current:data.current});if(data.missing)throw new HttpError(404,'Elemento non trovato.');return data.current;
}
