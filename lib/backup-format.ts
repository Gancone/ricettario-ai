import { createHash } from 'node:crypto';
import { gzipSync,gunzipSync } from 'node:zlib';
import { HttpError } from './validation';
export function canonical(value:any):string {
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export function checksum(value:Uint8Array|string){return createHash('sha256').update(value).digest('hex');}
export function encodeChunk(rows:any[]){const bytes=gzipSync(Buffer.from(JSON.stringify(rows)));return {bytes,checksum:checksum(bytes),count:rows.length};}
export function decodeChunk(bytes:Buffer,hash:string,count:number){
 if(checksum(bytes)!==hash)throw new HttpError(422,'Checksum del backup non valido.');
 const rows=JSON.parse(gunzipSync(bytes,{maxOutputLength:32*1024*1024}).toString('utf8'));
 if(!Array.isArray(rows)||rows.length!==count)throw new HttpError(422,'Chunk incompleto.');return rows;
}
export function suspiciousBackup(count:number,previous:number){
 return previous>0 && (count===0 || (previous>=10 && count<previous*0.7));
}
export type Chunk={path:string;entity:'recipes'|'categories'|'shopping_items'|'recipe_versions';count:number;bytes:number;checksum:string};
export type Manifest={version:2;created_at:string;recipe_count:number;category_count:number;checksum:string;app_version:string;reason:string;chunks:Chunk[];suspicious:boolean;id:string};
export function sealManifest(value:Omit<Manifest,'checksum'>):Manifest{return {...value,checksum:checksum(canonical(value))};}
export function verifyManifest(value:any):asserts value is Manifest{
 if(!value||value.version!==2||!Array.isArray(value.chunks)||!/^backups\/[a-zA-Z0-9-]+$/.test(value.id)||!Number.isSafeInteger(value.recipe_count)||!Number.isSafeInteger(value.category_count))throw new HttpError(422,'Manifest backup non valido.');
 const {checksum:hash,...body}=value;
 if(hash!==checksum(canonical(body)))throw new HttpError(422,'Checksum manifest non valido.');
 const paths=new Set<string>();
 for(const c of value.chunks){
  if(!c.path.startsWith(value.id+'/')||!/^[a-zA-Z0-9/_-]+\.json\.gz$/.test(c.path)||paths.has(c.path)||
   !['recipes','categories','shopping_items','recipe_versions'].includes(c.entity)||!Number.isSafeInteger(c.count)||c.count<0||c.bytes>10*1024*1024||!Number.isSafeInteger(c.bytes)||c.bytes<1||!/^[a-f0-9]{64}$/.test(c.checksum))
   throw new HttpError(422,'Descrittore chunk non valido.');
  paths.add(c.path);
 }
 for(const [entity,total] of [['recipes',value.recipe_count],['categories',value.category_count]])if(value.chunks.filter((c:Chunk)=>c.entity===entity).reduce((n:number,c:Chunk)=>n+c.count,0)!==total)throw new HttpError(422,'Conteggio backup incompleto.');
}
export function legacyBackup(value:any){
 if(!value||!Array.isArray(value.recipes)||!Array.isArray(value.categories))throw new HttpError(422,'Backup legacy incompleto.');
 return value;
}
