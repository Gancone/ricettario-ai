import { randomUUID } from 'node:crypto';
import { supabase } from './supabase';
import { safeFetchExternal } from './safe-fetch';
import { uuid,uploadMetadataSchema,HttpError } from './validation';
export const IMAGE_BUCKET='recipe-images';
export const IMAGE_MAX_BYTES=Math.min(10*1024*1024,Math.max(1024,Number(process.env.IMAGE_MAX_BYTES)||5*1024*1024));
export const IMAGE_TYPES=['image/jpeg','image/png','image/webp'];
let ready=false;
export async function ensureImageBucket(){
 if(ready)return;
 const {data,error}=await supabase.storage.getBucket(IMAGE_BUCKET);
 if(error&&!/not found|does not exist/i.test(error.message))throw error;
 if(!data){const {error}=await supabase.storage.createBucket(IMAGE_BUCKET,{public:true,fileSizeLimit:IMAGE_MAX_BYTES,allowedMimeTypes:IMAGE_TYPES});if(error&&!/already exists/i.test(error.message))throw error;}
 ready=true;
}
export function assertImage(bytes:Buffer,type:string) {
 if(!bytes.length||bytes.length>IMAGE_MAX_BYTES)throw new HttpError(413,'Immagine troppo grande.');
 const valid=type==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:
 type==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
 type==='image/webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':false;
 if(!valid)throw new HttpError(415,'Il contenuto non corrisponde a una foto JPEG, PNG o WebP.');
}
export function immutableImagePath(id:string,type:string,temporary=false){
 uuid.parse(id);const extension=type==='image/png'?'png':type==='image/webp'?'webp':'jpg';
 return (temporary?'temporary/':'')+id+'/'+Date.now()+'-'+randomUUID()+'.'+extension;
}
export function ownImagePath(url:string){
 try{const source=new URL(url);const base=new URL(process.env.SUPABASE_URL||'');
 const prefix='/storage/v1/object/public/'+IMAGE_BUCKET+'/';
 if(source.origin!==base.origin||!source.pathname.startsWith(prefix))return null;
 const path=decodeURIComponent(source.pathname.slice(prefix.length));
 return path&&!path.split('/').some(p=>!p||p==='.'||p==='..')&&!/[\\\x00]/.test(path)?path:null;
 }catch{return null;}
}
export async function persistRecipeImageBytes(id:string,bytes:Buffer,type='image/jpeg',temporary=false){
 uploadMetadataSchema.parse({recipeId:id,contentType:type,size:bytes.length});assertImage(bytes,type);await ensureImageBucket();
 const key=immutableImagePath(id,type,temporary);const {error}=await supabase.storage.from(IMAGE_BUCKET).upload(key,bytes,{contentType:type,upsert:false,cacheControl:'31536000'});
 if(error)throw error;return supabase.storage.from(IMAGE_BUCKET).getPublicUrl(key).data.publicUrl;
}
export async function persistRecipeImage(id:string,url?:string,temporary=false):Promise<string>{
 if(!url)return '';uuid.parse(id);
 const own=ownImagePath(url);
 if(own){
  if(!own.startsWith('temporary/'))return url;
  if(temporary)return url;
  if(own.split('/')[1]!==id)throw new HttpError(400,'Foto temporanea di un’altra bozza.');
  const {data,error}=await supabase.storage.from(IMAGE_BUCKET).download(own);if(error||!data)throw error||new Error('Immagine mancante');
  if(data.size>IMAGE_MAX_BYTES)throw new HttpError(413,'Immagine troppo grande.');
  return persistRecipeImageBytes(id,Buffer.from(await data.arrayBuffer()),data.type);
 }
 const downloaded=await safeFetchExternal(url,{maxBytes:IMAGE_MAX_BYTES,contentTypes:IMAGE_TYPES});
 return persistRecipeImageBytes(id,downloaded.bytes,downloaded.contentType,temporary);
}
