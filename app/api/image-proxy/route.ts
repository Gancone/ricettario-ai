import { guard } from '@/lib/backend';
import { safeFetchExternal } from '@/lib/safe-fetch';
import { IMAGE_MAX_BYTES,IMAGE_TYPES,assertImage } from '@/lib/image-storage';
import { errorResponse } from '@/lib/validation';
export const runtime='nodejs';
export async function GET(request:Request){
 const auth=await guard(request,'image');if(auth)return auth;
 try{const url=new URL(request.url).searchParams.get('url')||'';const image=await safeFetchExternal(url,{maxBytes:IMAGE_MAX_BYTES,contentTypes:IMAGE_TYPES});assertImage(image.bytes,image.contentType);
 return new Response(new Uint8Array(image.bytes),{headers:{'content-type':image.contentType,'cache-control':'private, max-age=3600','x-content-type-options':'nosniff'}});
 }catch(e){return errorResponse(e);}
}
