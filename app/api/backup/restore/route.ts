import { restoreLatestSnapshotAdditively } from '@/lib/data-safety';
import { guard } from '@/lib/backend';
import { readJson,errorResponse,HttpError } from '@/lib/validation';
export const maxDuration=300;
export async function POST(request:Request){
 const auth=await guard(request,'backup');if(auth)return auth;
 try{
  const input=request.body?await readJson(request):{};
  if(input.mode&&input.mode!=='additive'&&input.mode!=='overwrite')throw new HttpError(400,'Modalità restore non valida.');
  if(input.mode==='overwrite'&&input.confirm!=='OVERWRITE_WITH_HISTORY')throw new HttpError(400,'Conferma esplicita obbligatoria.');
  return Response.json(await restoreLatestSnapshotAdditively(input.mode==='overwrite',input.expectedRevisions||{}));
 }catch(e){return errorResponse(e);}
}
