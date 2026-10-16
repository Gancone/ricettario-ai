import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseIngredient,scaleStructured,formatIngredient,canonicalMeasure} from '../lib/ingredients.ts';
import {checkNutrition} from '../lib/nutrition.ts';
test('ingredienti: frazioni, range, unità e quantità mancanti',()=>{
 for(const [line,n,max,unit,name] of [['250 g farina',250,null,'g','farina'],['1/2 cipolla',.5,null,null,'cipolla'],['1 1/2 cucchiai olio',1.5,null,'cucchiai','olio'],['2-3 uova',2,3,null,'uova'],['200 ml latte',200,null,'ml','latte']]){const item=parseIngredient(line);assert.equal(item.quantity,n);assert.equal(item.quantityMax,max);assert.equal(item.unit,unit);assert.equal(item.ingredient,name);}
 for(const line of ['q.b.','sale','una manciata di spinaci','1/0 latte','20x30 cm'])assert.equal(parseIngredient(line).quantity,null);
});
test('scaling strutturato è temporaneo, conserva range e quantità non numeriche',()=>{
 const original=parseIngredient('2-3 uova');const scaled=scaleStructured(original,2);assert.equal(formatIngredient(scaled),'4–6 uova');assert.equal(original.quantity,2);
 assert.equal(formatIngredient(parseIngredient('250 g farina'),2),'500 g farina');assert.equal(formatIngredient(parseIngredient('sale q.b.'),2),'sale q.b.');
 assert.deepEqual(canonicalMeasure(.5,'kg'),{quantity:500,unit:'g'});assert.deepEqual(canonicalMeasure(1,'l'),{quantity:1000,unit:'ml'});
});
test('nutrizione: coerenza matematica e fiducia deterministica, nessuna AI',()=>{
 const n=checkNutrition({calories:1000,protein:10,carbs:20,fat:10},['200 g farina'],4);assert.equal(n.calories,210);assert.equal(n.confidence,'high');assert.ok(n.consistencyWarning);
 assert.equal(checkNutrition({},['olio q.b.','sale'],undefined).confidence,'low');assert.equal(checkNutrition({},['200 g pasta','sale'],2).confidence,'low');
});
