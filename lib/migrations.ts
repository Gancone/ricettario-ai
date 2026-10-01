import { Client } from 'pg';
import { createRequire } from 'node:module';
import { readdir,readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { supabase } from './supabase';
import { encodeChunk,sealManifest,type Chunk } from './backup-format';
import { checksum } from './backup-format';
import { HttpError } from './validation';
const pkg = createRequire(import.meta.url)('../package.json') as { version: string };
export async function migrateDatabase(){
 const connectionString=process.env.DATABASE_URL;
 if(!connectionString)throw new HttpError(503,'DATABASE_URL amministrativa mancante. Il service-role REST non può eseguire migrazioni DDL.');
 const client=new Client({connectionString,connectionTimeoutMillis:15000,statement_timeout:180000});
 await client.connect();const applied:string[]=[];
 try{
  await client.query('SELECT pg_advisory_lock(867530901)');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
  try{
   await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations(id text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
   const existing=await client.query('SELECT id,checksum FROM public.schema_migrations');
   const directory=path.join(process.cwd(),'database','migrations');
   const files=(await readdir(directory)).filter(f=>/^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
   const pending=[];
   for(const file of files){const sql=await readFile(path.join(directory,file),'utf8');const id=file.slice(0,-4);const hash=checksum(sql);const old=existing.rows.find(r=>r.id===id);
    if(old&&old.checksum!==hash)throw new Error('Checksum migrazione modificato: '+id);if(!old)pending.push({id,sql,hash});}
   if(pending.length){
    // Back up the original rows inside this stable DB snapshot before any data change.
    const bucket='ricettario-backups';const options={public:false,fileSizeLimit:10*1024*1024,allowedMimeTypes:['application/json','application/gzip']};
    const found=await supabase.storage.getBucket(bucket);
    if(found.error&&!/not found|does not exist/i.test(found.error.message))throw found.error;
    const configured=found.data?await supabase.storage.updateBucket(bucket,options):await supabase.storage.createBucket(bucket,options);if(configured.error)throw configured.error;
    const id='backups/pre-migration-'+Date.now()+'-'+randomUUID();const chunks:Chunk[]=[];const counts:Record<string,number>={recipes:0,categories:0};
    for(const table of ['recipes','categories','shopping_items','recipe_versions'] as const){
     const exists=await client.query('SELECT to_regclass($1) AS name',['public.'+table]);if(!exists.rows[0].name)continue;
     await client.query('DECLARE migration_rows NO SCROLL CURSOR FOR SELECT * FROM public.'+table+' ORDER BY id');
     let index=0;
     for(;;){const batch=await client.query('FETCH 100 FROM migration_rows');if(!batch.rows.length)break;
      const encoded=encodeChunk(batch.rows);const key=id+'/'+table+'-'+(++index)+'.json.gz';
      const result=await supabase.storage.from(bucket).upload(key,encoded.bytes,{contentType:'application/gzip',upsert:false});if(result.error)throw result.error;
      const check=await supabase.storage.from(bucket).download(key);if(check.error||!check.data||checksum(Buffer.from(await check.data.arrayBuffer()))!==encoded.checksum)throw new Error('Backup pre-migrazione non verificato');
      chunks.push({path:key,entity:table,count:batch.rows.length,bytes:encoded.bytes.length,checksum:encoded.checksum});counts[table]=(counts[table]||0)+batch.rows.length;
     }await client.query('CLOSE migration_rows');
    }
    const manifest=sealManifest({id,version:2,created_at:new Date().toISOString(),recipe_count:counts.recipes,category_count:counts.categories,reason:'pre-migration',app_version:pkg.version,chunks,suspicious:false});
    const result=await supabase.storage.from(bucket).upload(id+'/manifest.json',Buffer.from(JSON.stringify(manifest)),{contentType:'application/json',upsert:false});if(result.error)throw result.error;
    // Never replace existing backup pointers as part of a migration.
    for(const migration of pending){await client.query(migration.sql);await client.query('INSERT INTO public.schema_migrations(id,checksum) VALUES($1,$2)',[migration.id,migration.hash]);applied.push(migration.id);}
   }
   await client.query('COMMIT');
  }catch(e){await client.query('ROLLBACK');throw e;}
  await client.query("NOTIFY pgrst, 'reload schema'");
  return {applied,recipesDeleted:0};
 }finally{await client.query('SELECT pg_advisory_unlock(867530901)').catch(()=>{});await client.end();}
}
