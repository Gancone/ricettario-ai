import {guard} from '@/lib/backend';
import {supabase} from '@/lib/supabase';
import {kitchenEntity,saveKitchen,requireKitchenSchema} from '@/lib/kitchen-server';
import {errorResponse,readJson,uuid} from '@/lib/validation';
type Context={params:Promise<{entity:string}>};
export async function GET(request:Request,{params}:Context){const auth=await guard(request);if(auth)return auth;try{await requireKitchenSchema();const entity=kitchenEntity.parse((await params).entity);const url=new URL(request.url);let query=supabase.from(entity).select('*').order('id').limit(200);const cursor=url.searchParams.get('cursor');if(cursor)query=query.gt('id',uuid.parse(cursor));const{data,error}=await query;if(error)throw error;return Response.json({items:data,nextCursor:data?.length===200?data.at(-1)?.id:null},{headers:{'cache-control':'no-store'}});}catch(error){return errorResponse(error);}}
export async function POST(request:Request,{params}:Context){const auth=await guard(request,'write');if(auth)return auth;try{const entity=kitchenEntity.parse((await params).entity);const body=await readJson(request,32*1024);return Response.json(await saveKitchen(entity,body.item,body.expectedRevision));}catch(error){return errorResponse(error);}}
