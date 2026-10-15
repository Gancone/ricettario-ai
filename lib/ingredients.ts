export type StructuredIngredient = {
 originalText:string; quantity:number|null; quantityMax:number|null; unit:string|null;
 ingredient:string; notes:string; normalizedIngredient:string;
};
const fractions:Record<string,number>={'½':.5,'¼':.25,'¾':.75,'⅓':1/3,'⅔':2/3,'⅛':.125};
const amount='(?:\\d+\\s+\\d+\\s*/\\s*\\d+|\\d+\\s*/\\s*\\d+|\\d*\\s*[½¼¾⅓⅔⅛]|\\d+(?:[.,]\\d+)?)';
const leading=new RegExp('^('+amount+')(?:\\s*[-–]\\s*('+amount+'))?\\s*');
const units:Record<string,string>={g:'g',gr:'g',grammo:'g',grammi:'g',kg:'kg',chilogrammi:'kg',ml:'ml',millilitri:'ml',l:'l',lt:'l',litro:'l',litri:'l',cucchiaino:'cucchiaini',cucchiaini:'cucchiaini',cucchiaio:'cucchiai',cucchiai:'cucchiai',pezzo:'pz',pezzi:'pz',pz:'pz',tazza:'tazze',tazze:'tazze',spicchio:'spicchi',spicchi:'spicchi'};
const aliases:Record<string,string>={pomodoro:'pomodori',cipolle:'cipolla',uovo:'uova',carote:'carota',patate:'patata',zucchine:'zucchina',limoni:'limone',mele:'mela',banane:'banana'};
export function normalizeIngredient(value:string){const text=value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').replace(/[’']/g,' ').replace(/[.,;:()]/g,' ').replace(/\s+/g,' ').trim();return aliases[text]||text;}
function numeric(value:string){const trimmed=value.trim();const unicode=trimmed.match(/^(\d*)\s*([½¼¾⅓⅔⅛])$/);if(unicode)return Number(unicode[1]||0)+fractions[unicode[2]];const mixed=trimmed.match(/^(?:(\d+)\s+)?(\d+)\s*\/\s*(\d+)$/);return mixed?Number(mixed[1]||0)+Number(mixed[2])/Number(mixed[3]):Number(trimmed.replace(',','.'));}
export function parseIngredient(originalText:string):StructuredIngredient{
 let rest=originalText.trim(),quantity:number|null=null,quantityMax:number|null=null,unit:string|null=null;
 const match=rest.match(leading);
 // Dimensions and malformed fractions are never interpreted as food quantities.
 if(match&&!/^[x×/]/i.test(rest.slice(match[0].length))){const first=numeric(match[1]),last=match[2]?numeric(match[2]):null;if(Number.isFinite(first)&&first>=0&&(last===null||Number.isFinite(last)&&last>=first)){quantity=first;quantityMax=last;rest=rest.slice(match[0].length);}}
 const token=rest.match(/^([a-zà-ù.]+)\s+/i);if(quantity!==null&&token&&units[token[1].toLowerCase()]){unit=units[token[1].toLowerCase()];rest=rest.slice(token[0].length);}
 rest=rest.replace(/^(?:di|del|della|delle|dei|degli)\s+/i,'');
 const unspecified=rest.match(/^(?:q\.?\s*b\.?|quanto basta|una? manciata(?: di)?)\s*/i);if(quantity===null&&unspecified)rest=rest.slice(unspecified[0].length);
 const pieces=rest.split(/,\s*/);let ingredient=pieces.shift()||originalText;let notes=pieces.join(', ');
 const qb=ingredient.match(/\s+(q\.?\s*b\.?|quanto basta)$/i);if(qb){ingredient=ingredient.slice(0,qb.index);notes=[qb[1],notes].filter(Boolean).join(', ');}
 if(!ingredient.trim()){ingredient=originalText;quantity=null;quantityMax=null;unit=null;}
 return {originalText,quantity,quantityMax,unit,ingredient:ingredient.trim(),notes,normalizedIngredient:normalizeIngredient(ingredient)};
}
export function ingredientList(lines:string[]){return lines.map(parseIngredient);}
export function formatQuantity(n:number){return new Intl.NumberFormat('it-IT',{maximumFractionDigits:2,useGrouping:false}).format(n);}
export function formatIngredient(item:StructuredIngredient,factor=1){if(item.quantity===null||!Number.isFinite(factor)||factor<=0)return item.originalText;const range=item.quantityMax===null?'':'–'+formatQuantity(item.quantityMax*factor);return `${formatQuantity(item.quantity*factor)}${range}${item.unit?' '+item.unit:''} ${item.ingredient}${item.notes?', '+item.notes:''}`;}
export function scaleStructured(item:StructuredIngredient,factor:number):StructuredIngredient{return !Number.isFinite(factor)||factor<=0?{...item}:{...item,quantity:item.quantity===null?null:item.quantity*factor,quantityMax:item.quantityMax===null?null:item.quantityMax*factor};}
export function canonicalMeasure(quantity:number,unit:string|null){if(unit==='kg')return{quantity:quantity*1000,unit:'g'};if(unit==='l')return{quantity:quantity*1000,unit:'ml'};return{quantity,unit:unit||'pz'};}
export function ingredientGroup(name:string){const n=normalizeIngredient(name);if(/^(pomodor|cipoll|carot|patat|zucchin|spinaci|insalat|broccol|aglio|peperon)/.test(n))return 'Verdura';if(/^(mela|banana|pera|limone|arancia|fragol|frutta)/.test(n))return 'Frutta';if(/pollo|manzo|maiale|salmone|tonno|pesce|tacchino/.test(n))return 'Carne/Pesce';if(/latte|burro|yogurt|panna|formaggio|mozzarella|ricotta/.test(n))return 'Latticini';if(/surgelat/.test(n))return 'Surgelati';if(/acqua|succo|vino|birra/.test(n))return 'Bevande';if(/farina|olio|sale|zucchero|pasta|riso|lievito|uova|ceci|fagioli|cacao|pepe/.test(n))return 'Dispensa';return 'Altro';}
