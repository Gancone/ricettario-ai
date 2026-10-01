import { authCookieHeader,validPassword } from '@/lib/app-auth';
import { clearLoginLimit, guard } from '@/lib/backend';
import { readJson,errorResponse,HttpError } from '@/lib/validation';
export async function POST(request:Request){
 const blocked=await guard(request,'login',true);if(blocked)return blocked;
 try{const {password}=await readJson(request,4096);if(typeof password!=='string'||!validPassword(password))throw new HttpError(401,'Password non corretta.');
 clearLoginLimit(request);
 return Response.json({success:true,configured:true},{headers:{'set-cookie':authCookieHeader(),'cache-control':'no-store'}});
 }catch(e){return errorResponse(e);}
}
