import { randomUUID } from 'node:crypto';
import { supabase } from './supabase';
import { pages,allRows,requireSchema } from './backend';
import { readJsonState } from './cloud-state';
import { checksum,canonical,encodeChunk,decodeChunk,sealManifest,verifyManifest,legacyBackup,suspiciousBackup,type Manifest,type Chunk } from './backup-format';
import { HttpError } from './validation';
import { fromDb,toDb } from './recipe-map';
import { validateRecipe } from './recipe-input';
import { applyRecipe } from './recipe-store';
import { IMAGE_BUCKET, ownImagePath } from './image-storage';
import yazl from 'yazl';
import pkg from '../package.json';
export const BACKUP_BUCKET='ricettario-backups';
let ready=false;
async function ensureBucket(){
 if(ready)return;const {data,error}=await supabase.storage.getBucket(BACKUP_BUCKET);
 if(error&&!/not found|does not exist/i.test(error.message))throw error;
 const options={public:false,fileSizeLimit:10*1024*1024,allowedMimeTypes:['application/json','application/gzip']};
 const result=data?await supabase.storage.updateBucket(BACKUP_BUCKET,options):await supabase.storage.createBucket(BACKUP_BUCKET,options);
 if(result.error)throw result.error;ready=true;
}
async function put(path:string,bytes:Buffer,type='application/json',upsert=false){
 const {error}=await supabase.storage.from(BACKUP_BUCKET).upload(path,bytes,{contentType:type,cacheControl:'0',upsert});if(error)throw error;
}
async function read(path:string):Promise<Buffer|null>{
 const {data,error}=await supabase.storage.from(BACKUP_BUCKET).download(path);
 if(error){if(String((error as any).statusCode)==='404'||/not found|does not exist/i.test(error.message))return null;throw error;}
 if(!data)return null;if(data.size>32*1024*1024)throw new HttpError(413,'Backup legacy troppo grande: usa importazione a chunk.');
 return Buffer.from(await data.arrayBuffer());
}
async function pointer(path:string){
 const bytes=await read(path);if(!bytes)return null;const data=JSON.parse(bytes.toString('utf8'));
 if(data.version===2)verifyManifest(data);else legacyBackup(data);return data;
}
async function epoch(){const {data,error}=await supabase.from('backend_state').select('revision').eq('key','data_epoch').single();if(error)throw error;return data.revision;}
async function lease(owner:string){const {data,error}=await supabase.rpc('acquire_lease',{p_key:'backup',p_owner:owner,p_seconds:300});if(error)throw error;if(!data)throw new HttpError(409,'Un altro backup è in corso.');}
export async function createDatabaseSnapshot(reason='automatic'){
 await requireSchema();await ensureBucket();const owner=randomUUID();await lease(owner);
 try{
  const before=await epoch();const good=await pointer('last-known-good.json')||await pointer('latest.json');
  const stamp=new Date().toISOString();const id='backups/'+stamp.replace(/[:.]/g,'-')+'-'+randomUUID();
  const chunks:Chunk[]=[];let recipeCount=0;let categoryCount=0;
  for(const entity of ['recipes','categories','shopping_items','recipe_versions'] as const){
   let index=0;let pending:any[]=[];let size=0;
   const flush=async()=>{
    if(!pending.length)return;const encoded=encodeChunk(pending);if(encoded.bytes.length>9*1024*1024)throw new HttpError(413,'Una riga del backup supera il limite per chunk.');
    const path=id+'/'+entity+'-'+String(++index).padStart(4,'0')+'.json.gz';
    await put(path,encoded.bytes,'application/gzip');chunks.push({path,entity,count:encoded.count,bytes:encoded.bytes.length,checksum:encoded.checksum});pending=[];size=0;await lease(owner);
   };
   for await(const batch of pages(entity)){
    for(const row of batch){const bytes=Buffer.byteLength(JSON.stringify(row));if(size+bytes>2*1024*1024)await flush();pending.push(row);size+=bytes;
     if(entity==='recipes')recipeCount++;if(entity==='categories')categoryCount++;}
   }await flush();
  }
  if(before!==await epoch())throw new HttpError(409,'Dati modificati durante il backup: riprova. La copia precedente è conservata.');
  const previous=good?.version===2?good.recipe_count:good?.recipes?.length||0;
  const manifest=sealManifest({version:2,created_at:stamp,recipe_count:recipeCount,category_count:categoryCount,app_version:pkg.version,reason,id,chunks,suspicious:suspiciousBackup(recipeCount,previous)});
  // Verify every uploaded byte before publishing any pointer.
  await verifyStoredBackup(manifest);
  await lease(owner);
  const bytes=Buffer.from(JSON.stringify(manifest));
  const name='snapshots/'+id.slice(8)+'.json';
  await put(id+'/manifest.json',bytes);await put(name,bytes);
  await put('latest.json',bytes,'application/json',true);
  if(!manifest.suspicious)await put('last-known-good.json',bytes,'application/json',true);
  return {createdAt:stamp,recipes:recipeCount,categories:categoryCount,name,suspicious:manifest.suspicious,verified:true};
 }finally{await supabase.from('backend_leases').update({expires_at:new Date(0).toISOString()}).eq('key','backup').eq('owner',owner);}
}
export async function verifyStoredBackup(manifest:Manifest){
 verifyManifest(manifest);for(const c of manifest.chunks){const bytes=await read(c.path);if(!bytes||bytes.length!==c.bytes)throw new HttpError(422,'Chunk mancante.');decodeChunk(bytes,c.checksum,c.count);}
}
export async function* backupRows(backup:any,entity:Chunk['entity']){
 if(backup.version!==2){legacyBackup(backup);const rows=backup[entity]|| (entity==='shopping_items'?backup.shopping:[])||[];for(let i=0;i<rows.length;i+=100)yield rows.slice(i,i+100);return;}
 verifyManifest(backup);
 for(const c of backup.chunks.filter((c:Chunk)=>c.entity===entity)){const bytes=await read(c.path);if(!bytes)throw new HttpError(422,'Chunk mancante.');yield decodeChunk(bytes,c.checksum,c.count);}
}
export type RestoreReport={inserted:number;skippedExisting:number;conflicts:{id:string;reason:string}[];errors:{id:string;error:string}[];modified:string[]};
export function newReport():RestoreReport{return {inserted:0,skippedExisting:0,conflicts:[],errors:[],modified:[]};}
export async function restoreRows(rows:any[],report:RestoreReport,overwrite=false,revisions:Record<string,number>={}){
 for(let start=0;start<rows.length;start+=100){
  const batch=rows.slice(start,start+100);
  for(const raw of batch){
   const id=typeof raw?.id==='string'?raw.id:'invalid';
   try{
    const recipe=validateRecipe(raw.source_url!==undefined||raw.created_at!==undefined?fromDb(raw):raw);
    const {data:existing,error}=await supabase.from('recipes').select('*').eq('id',recipe.id).maybeSingle();if(error)throw error;
    if(existing){
     if(!overwrite){report.skippedExisting++;if(canonical(toDb(fromDb(existing)))!==canonical(toDb(recipe)))report.conflicts.push({id,reason:'Versione esistente diversa, conservata'});continue;}
     if(!revisions[id]){report.conflicts.push({id,reason:'expectedRevision mancante'});continue;}
     await applyRecipe(id,revisions[id],toDb(recipe),'before_restore');report.modified.push(id);continue;
    }
    const {error:insertError}=await supabase.from('recipes').insert({id:recipe.id,...toDb(recipe),created_at:recipe.createdAt});
    if(insertError?.code==='23505'){report.skippedExisting++;continue;}if(insertError)throw insertError;report.inserted++;
   }catch(e){if(e instanceof HttpError&&e.status===409)report.conflicts.push({id,reason:'Revisione modificata, conservata'});else report.errors.push({id,error:'Riga non importata: dati non validi o database non disponibile.'});}
  }
 }
}
export async function readLatestSnapshot(){return await pointer('last-known-good.json')||await pointer('latest.json');}
export async function restoreLatestSnapshotAdditively(overwrite=false,revisions:Record<string,number>={}){
 await requireSchema();const backup=await readLatestSnapshot();const report=newReport();
 if(!backup)return {...report,restored:false,recipes:0,categories:0,createdAt:''};
 if(backup.version===2)await verifyStoredBackup(backup);
 if(overwrite){const safety=await createDatabaseSnapshot('pre-explicit-restore');if(safety.suspicious)throw new HttpError(409,'Backup sospetto: sovrascrittura bloccata.');}
 for await(const rows of backupRows(backup,'recipes'))await restoreRows(rows,report,overwrite,revisions);
 let categories=0;
 for await(const rows of backupRows(backup,'categories')){
  for(const row of rows){if(typeof row.name!=='string'||!row.name.trim()||row.name.length>120){report.errors.push({id:'category',error:'Categoria non valida'});continue;}
   const {error}=await supabase.from('categories').insert({name:row.name});if(error&&error.code!=='23505')report.errors.push({id:'category',error:'Categoria non importata'});else if(!error)categories++;}
 }
 for await(const rows of backupRows(backup,'shopping_items')){
  const {error}=await supabase.rpc('shopping_apply',{p_expected:null,p_items:rows,p_replace:false});if(error)report.errors.push({id:'shopping',error:'Lista non importata'});
 }
 return {...report,restored:true,recipes:report.inserted,categories,createdAt:backup.created_at||backup.createdAt};
}
export async function backupStatus(){
 const {count,error}=await supabase.from('recipes').select('id',{count:'exact',head:true});if(error)throw error;
 const latest=await pointer('latest.json');const good=await pointer('last-known-good.json');
 return {recipes:count||0,latestBackupAt:latest?.created_at||latest?.createdAt||'',latestBackupRecipes:latest?.recipe_count??latest?.recipes?.length??0,
 lastKnownGoodAt:good?.created_at||good?.createdAt||'',suspicious:latest?.suspicious===true,protected:!!good&&!latest?.suspicious};
}
export async function exportCurrentBackup(){
 const recipes=await allRows('recipes'),categories=await allRows('categories'),shopping=await allRows('shopping_items');
 const content={recipes,categories,shopping};return {...content,schemaVersion:1,createdAt:new Date().toISOString(),checksum:checksum(canonical(content)),app_version:pkg.version};
}

export async function exportCurrentBackupZip(){
 const entities:any={recipes:await allRows('recipes'),categories:await allRows('categories'),shopping_items:await allRows('shopping_items'),recipe_versions:await allRows('recipe_versions')};
 const files:{name:string;bytes:Buffer}[]=[];const imageFiles:any[]=[];
 for(const row of entities.recipes){const imagePath=ownImagePath(row.image_url||'');if(!imagePath)continue;const {data}=await supabase.storage.from(IMAGE_BUCKET).download(imagePath);if(!data||data.size>10*1024*1024)continue;const bytes=Buffer.from(await data.arrayBuffer());const name='images/'+row.id+'/'+imagePath.split('/').pop();files.push({name,bytes});imageFiles.push({recipe_id:row.id,path:name,bytes:bytes.length,checksum:checksum(bytes)});}
 for(const [name,rows] of Object.entries(entities))files.push({name:`data/${name}.json`,bytes:Buffer.from(JSON.stringify(rows))});
 const manifest={format:'ricettario-ai-backup',version:2,createdAt:new Date().toISOString(),app_version:pkg.version,files:[...files.map(f=>({path:f.name,bytes:f.bytes.length,checksum:checksum(f.bytes)})),...imageFiles]};files.push({name:'manifest.json',bytes:Buffer.from(JSON.stringify(manifest,null,2))});
 return await new Promise<Buffer>((resolve,reject)=>{const zip=new yazl.ZipFile();const chunks:Buffer[]=[];let size=0;let failed=false;zip.outputStream.on('data',(chunk:Buffer)=>{if(failed)return;size+=chunk.length;if(size>100*1024*1024){failed=true;reject(new HttpError(413,'Backup ZIP troppo grande.'));return;}chunks.push(chunk);});zip.outputStream.on('error',(error)=>{if(!failed){failed=true;reject(error);}});zip.outputStream.on('end',()=>{if(!failed)resolve(Buffer.concat(chunks));});for(const file of files)zip.addBuffer(file.bytes,file.name);zip.end();});
}
