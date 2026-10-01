import { guard,requireSchema,allRows } from '@/lib/backend';
import { newReport,restoreRows } from '@/lib/data-safety';
import { fromDb } from '@/lib/recipe-map';
import { readJson,errorResponse,HttpError } from '@/lib/validation';
export const maxDuration=300;
export async function POST(request:Request){
 const auth=await guard(request,'write');if(auth)return auth;
 try{
  await requireSchema();const body=await readJson(request,32*1024*1024);
  if(!Array.isArray(body.recipes))throw new HttpError(400,'Elenco ricette mancante.');
  const report=newReport();await restoreRows(body.recipes,report);
  return Response.json({...report,recovered:report.inserted,...(body.reportOnly?{}:{recipes:(await allRows('recipes')).map(fromDb)})});
 }catch(e){return errorResponse(e);}
}
