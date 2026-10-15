import AdmZip from 'adm-zip';
import yauzl from 'yauzl';
import {checksum} from './backup-format';
import {HttpError} from './validation';
export const PORTABLE_TABLES:Record<string,string>={recipes:'recipes',recipe_ingredients:'recipe_ingredients',categories:'categories',shopping:'shopping_items',pantry:'pantry_items',meal_plan:'meal_plan_entries',cooking_history:'cooking_history',recipe_versions:'recipe_versions',settings:'recipe_settings'};
export type PortableImage={url:string;path:string;recipeId:string;contentType:string;bytes:Buffer};
const MAX=120*1024*1024;
export function safeArchivePath(name:string){return typeof name==='string'&&!!name&&!name.includes('\\')&&!name.startsWith('/')&&!/^[a-z]:/i.test(name)&&!name.includes('\0')&&!name.split('/').some(part=>part==='..'||part==='.'||part==='');}
export function packPortableBackup(entities:Record<string,unknown[]>,images:PortableImage[],version:string){
 const zip=new AdmZip();const files:{path:string;bytes:number;checksum:string}[]=[];let total=0;
 const add=(path:string,bytes:Buffer)=>{if(!safeArchivePath(path)||files.some(file=>file.path===path))throw new HttpError(400,'Percorso backup non valido o duplicato.');total+=bytes.length;if(total>MAX)throw new HttpError(413,'Backup oltre 120 MB.');zip.addFile(path,bytes);files.push({path,bytes:bytes.length,checksum:checksum(bytes)});};
 for(const key of Object.keys(PORTABLE_TABLES))add(key+'.json',Buffer.from(JSON.stringify(entities[key]||[])));
 for(const image of images)add(image.path,image.bytes);
 const manifest={format:'ricettario-ai-backup',version:3,createdAt:new Date().toISOString(),app_version:version,files,images:images.map(({bytes,...item})=>item)};
 zip.addFile('manifest.json',Buffer.from(JSON.stringify(manifest,null,2)));const bytes=zip.toBuffer();if(bytes.length>100*1024*1024)throw new HttpError(413,'Backup ZIP oltre 100 MB.');return bytes;
}
export async function readArchive(bytes:Buffer):Promise<Map<string,Buffer>>{
 if(bytes.length>100*1024*1024)throw new HttpError(413,'Archivio troppo grande.');
 return new Promise((resolve,reject)=>{yauzl.fromBuffer(bytes,{lazyEntries:true,validateEntrySizes:true,strictFileNames:true},(error,zip)=>{
  if(error||!zip){reject(new HttpError(422,'Archivio ZIP non valido.'));return;}let count=0,total=0,settled=false;const files=new Map<string,Buffer>();
  const fail=(error:unknown)=>{if(settled)return;settled=true;zip.close();reject(error);};zip.on('error',fail);zip.on('end',()=>{if(!settled){settled=true;resolve(files);}});
  zip.on('entry',entry=>{if(settled)return;if(entry.fileName.endsWith('/')){zip.readEntry();return;}
   if(++count>10000||!safeArchivePath(entry.fileName)||files.has(entry.fileName)||entry.uncompressedSize>32*1024*1024||total+entry.uncompressedSize>MAX){fail(new HttpError(413,'Archivio oltre i limiti o con percorsi non validi.'));return;}
   zip.openReadStream(entry,(error,stream)=>{if(error||!stream){fail(new HttpError(422,'File ZIP non leggibile.'));return;}const chunks:Buffer[]=[];let length=0;stream.on('error',fail);stream.on('data',(chunk:Buffer)=>{length+=chunk.length;total+=chunk.length;if(length>32*1024*1024||total>MAX){stream.destroy();fail(new HttpError(413,'Archivio decompresso troppo grande.'));return;}chunks.push(chunk);});stream.on('end',()=>{if(!settled){files.set(entry.fileName,Buffer.concat(chunks));zip.readEntry();}});});
  });zip.readEntry();
 });});
}
export async function unpackPortableBackup(bytes:Buffer){
 const files=await readArchive(bytes);const manifestBytes=files.get('manifest.json');if(!manifestBytes)throw new HttpError(422,'Manifest mancante.');
 let manifest:any;try{manifest=JSON.parse(manifestBytes.toString('utf8'));}catch{throw new HttpError(422,'Manifest non valido.');}
 if(manifest.format!=='ricettario-ai-backup'||![1,2,3].includes(manifest.version)||!Array.isArray(manifest.files)||manifest.files.length>10000)throw new HttpError(422,'Formato backup non supportato.');
 const verified=new Map<string,string>();for(const file of manifest.files){const data=files.get(file.path);if(!safeArchivePath(file.path)||!data||data.length!==file.bytes||checksum(data)!==file.checksum)throw new HttpError(422,'Checksum backup non valido.');if(verified.has(file.path)&&(manifest.version>=3||verified.get(file.path)!==file.checksum))throw new HttpError(422,'File duplicato nel manifest.');verified.set(file.path,file.checksum);}
 if([...files.keys()].some(path=>path!=='manifest.json'&&!verified.has(path)))throw new HttpError(422,'File non verificato nel backup.');
 const entities:Record<string,any[]>={};for(const [key,table]of Object.entries(PORTABLE_TABLES)){const file=files.get(key+'.json')||files.get('data/'+table+'.json');if(!file){entities[key]=[];continue;}try{const rows=JSON.parse(file.toString('utf8'));if(!Array.isArray(rows)||rows.length>100000)throw new Error();entities[key]=rows;}catch{throw new HttpError(422,'Dati backup non validi: '+key);}}
 const images=Array.isArray(manifest.images)?manifest.images:[];for(const image of images)if(!verified.has(image.path)||!image.path.startsWith('images/')||typeof image.url!=='string'||typeof image.recipeId!=='string')throw new HttpError(422,'Mappa immagini non valida.');
 return{manifest,entities,files,images};
}
