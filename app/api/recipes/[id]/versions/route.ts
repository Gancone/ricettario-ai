import { guard,requireSchema } from '@/lib/backend';
import { supabase } from '@/lib/supabase';
import { getRecipe } from '@/lib/recipe-store';
import { uuid,errorResponse } from '@/lib/validation';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){
 const auth=await guard(request);if(auth)return auth;
 try{await requireSchema();const id=uuid.parse((await params).id);const offset=Math.max(0,Number(new URL(request.url).searchParams.get('offset'))||0);
 const {data,error}=await supabase.from('recipe_versions').select('id,recipe_id,revision,created_at,reason').eq('recipe_id',id).order('created_at',{ascending:false}).order('id').range(offset,offset+99);
 if(error)throw error;return Response.json({items:data,nextOffset:data?.length===100?offset+100:null});}catch(e){return errorResponse(e);}
}
export async function POST(request:Request,{params}:Context){
 const auth=await guard(request,'write');if(auth)return auth;
 try{await requireSchema();const row=await getRecipe((await params).id);const {data,error}=await supabase.from('recipe_versions').insert({recipe_id:row.id,revision:row.revision??1,snapshot:row,reason:'manual_snapshot'}).select('id').single();if(error)throw error;return Response.json(data);}catch(e){return errorResponse(e);}
}
