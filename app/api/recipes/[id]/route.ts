import { guard } from '@/lib/backend';
import { toDb,fromDb } from '@/lib/recipe-map';
import { getRecipe,applyRecipe } from '@/lib/recipe-store';
import { validateRecipe } from '@/lib/recipe-input';
import { persistRecipeImage } from '@/lib/image-storage';
import { readJson,errorResponse,HttpError } from '@/lib/validation';
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,{params}:Context){
 const auth=await guard(request);if(auth)return auth;try{return Response.json(fromDb(await getRecipe((await params).id)),{headers:{'cache-control':'no-store'}});}catch(e){return errorResponse(e);}
}
export async function PATCH(request:Request,{params}:Context){
 const auth=await guard(request,'write');if(auth)return auth;
 try{
  const {id}=await params;const input=await readJson(request);const recipe=validateRecipe(input);
  if(recipe.id!==id)throw new HttpError(400,'ID non corrispondente.');
  // A missing revision is never silently replaced with the latest revision.
  if(!input.expectedRevision)throw new HttpError(428,'Ricarica la ricetta: revisione richiesta.');
  recipe.imageUrl=await persistRecipeImage(id,recipe.imageUrl);
  return Response.json(await applyRecipe(id,input.expectedRevision,toDb(recipe),recipe.archived?'before_archive':'before_update'));
 }catch(e){return errorResponse(e);}
}
export async function DELETE(request:Request){
 const auth=await guard(request,'write');if(auth)return auth;
 return Response.json({error:'La cancellazione permanente è disattivata. Usa Archivia.'},{status:405,headers:{Allow:'GET, PATCH'}});
}
