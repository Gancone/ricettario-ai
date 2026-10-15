import {canonicalMeasure,formatIngredient,ingredientGroup,normalizeIngredient,parseIngredient,type StructuredIngredient} from './ingredients';
import type {ShoppingItem} from './shopping';
export type Contribution={key:string;source:string;quantity:number|null;quantity_max:number|null};
export type SmartShoppingItem=ShoppingItem&{quantity_max?:number|null;ingredient_key?:string;group_name?:string;contributions?:Contribution[]};
export function aggregateShopping(current:SmartShoppingItem[],input:{item:StructuredIngredient;key:string;source:string}[],id:()=>string){
 const next=current.map(row=>({...row,contributions:row.contributions?.map(item=>({...item}))}));
 for(const {item,key,source} of input){
  if(next.some(row=>!row.done&&row.contributions?.some(value=>value.key===key)))continue;
  const measure=item.quantity===null?{quantity:null,unit:item.unit}:canonicalMeasure(item.quantity,item.unit);
  const max=item.quantityMax===null?null:canonicalMeasure(item.quantityMax,item.unit).quantity;
  const groupKey=item.normalizedIngredient+'|'+(measure.unit||'unspecified')+'|'+(item.quantity===null?'unknown':'known')+'|'+normalizeIngredient(item.notes);
  const existing=next.find(row=>!row.done&&row.ingredient_key===groupKey);
  const contribution={key,source,quantity:measure.quantity,quantity_max:max};
  if(existing){existing.quantity=(existing.quantity??0)+(measure.quantity??0);existing.quantity_max=existing.quantity_max!==null&&existing.quantity_max!==undefined||max!==null?(existing.quantity_max??((existing.quantity||0)-(measure.quantity||0)))+(max??measure.quantity??0):null;existing.contributions=[...(existing.contributions||[]),contribution];existing.source=[...new Set(existing.contributions.map(value=>value.source))].join(' · ').slice(0,300);existing.text=formatIngredient({...item,quantity:item.quantity===null?null:existing.quantity,quantityMax:existing.quantity_max??null,unit:measure.unit});}
  else next.push({id:id(),text:formatIngredient({...item,quantity:measure.quantity,quantityMax:max,unit:item.quantity===null?item.unit:measure.unit}),source:source.slice(0,300),done:false,quantity:measure.quantity,quantity_max:max,unit:measure.unit,ingredient_key:groupKey,group_name:ingredientGroup(item.ingredient),contributions:[contribution]});
 }
 return next;
}
export function shoppingFromText(current:SmartShoppingItem[],lines:string[],source:string,id:()=>string){return aggregateShopping(current,lines.map((line,index)=>({item:parseIngredient(line),key:source+'|'+index+'|'+line,source})),id);}
