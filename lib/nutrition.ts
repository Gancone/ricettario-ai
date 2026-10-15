import type {Nutrition} from '@/types/recipe';
import {ingredientList} from './ingredients';
export function checkNutrition(nutrition:Nutrition|undefined,ingredients:string[],servings?:number){
 const result={...nutrition,estimated:true};
 const precise=ingredientList(ingredients).filter(item=>item.quantity!==null).length;
 const confidence:'high'|'medium'|'low'=!servings||precise<ingredients.length*.6?'low':precise<ingredients.length?'medium':'high';
 const complete=[result.protein,result.carbs,result.fat].every(value=>typeof value==='number');
 const calculated=(result.protein||0)*4+(result.carbs||0)*4+(result.fat||0)*9;
 const inconsistent=complete&&calculated>0&&(result.calories==null||Math.abs(result.calories-calculated)>Math.max(50,calculated*.3));
 if(inconsistent)result.calories=Math.round(calculated);
 return{...result,confidence,consistencyWarning:inconsistent?'Calorie ricalcolate da proteine, carboidrati e grassi.':undefined};
}
