import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('migration preserves legacy recipe and shopping CAS rejects stale writes',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
   CREATE TABLE recipes(id uuid PRIMARY KEY,title text,source_url text,image_url text,category text,tags text[],ingredients text[],steps text[],notes text,prep_time_minutes integer,cook_time_minutes integer,total_time_minutes integer,servings integer,nutrition jsonb,created_at timestamptz DEFAULT now());
   CREATE TABLE categories(id serial PRIMARY KEY,name text UNIQUE);
   INSERT INTO recipes(id,title,ingredients,steps,nutrition) VALUES('12345678-1234-4234-8234-123456789012','Pasta',ARRAY['pasta'],ARRAY['Cuoci'],'{"_favorite":true,"_sourceNotes":"Fonte","salt":0.2}');`);
  for(const file of ['001_backend_safety','002_shopping_read','003_personal_kitchen'])await db.exec(await readFile(new URL(`../database/migrations/${file}.sql`,import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../database/migrations/003_personal_kitchen.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../database/migrations/004_kitchen_read.sql',import.meta.url),'utf8'));
  const row=(await db.query('SELECT * FROM recipes')).rows[0];
  assert.equal(row.title,'Pasta');assert.equal(row.favorite,true);assert.equal(row.source_notes,'Fonte');assert.equal(row.revision,1);
  const change=(await db.query(`SELECT recipe_apply($1,1,'{"title":"Pasta nuova"}'::jsonb) AS result`,[row.id])).rows[0].result;
  assert.equal(change.current.revision,2);
  const stale=(await db.query(`SELECT recipe_apply($1,1,'{"title":"Persa"}'::jsonb) AS result`,[row.id])).rows[0].result;
  assert.equal(stale.conflict,true);assert.equal(stale.current.title,'Pasta nuova');
  assert.equal((await db.query('SELECT count(*)::int AS n FROM recipe_versions')).rows[0].n,2);
  await assert.rejects(db.query('DELETE FROM recipes'));
  let state=(await db.query('SELECT shopping_read() AS result')).rows[0].result;
  assert.equal(state.revision,1);assert.deepEqual(state.items,[]);
  const items=[{id:'22345678-1234-4234-8234-123456789012',text:'Latte',source:'Test',done:false}];
  state=(await db.query('SELECT shopping_apply($1,$2::jsonb,true) AS result',[state.revision,JSON.stringify(items)])).rows[0].result;
  assert.equal(state.items.length,1);assert.equal(state.revision,2);
  const conflict=(await db.query(`SELECT shopping_apply(1,'[]'::jsonb,true) AS result`)).rows[0].result;
  assert.equal(conflict.conflict,true);assert.equal(conflict.items[0].text,'Latte');
  const pantryId='32345678-1234-4234-8234-123456789012';
  const pantry=(await db.query(`SELECT kitchen_apply('pantry_items',$1::jsonb,NULL) AS r`,[JSON.stringify({id:pantryId,name:'Latte',normalized_name:'latte',quantity:1,unit:'l'})])).rows[0].r.current;
  assert.equal(pantry.revision,1);
  const edited=(await db.query(`SELECT kitchen_apply('pantry_items',$1::jsonb,1) AS r`,[JSON.stringify({id:pantryId,finished:true})])).rows[0].r;
  assert.equal(edited.current.finished,true);
  assert.equal((await db.query(`SELECT kitchen_apply('pantry_items',$1::jsonb,1) AS r`,[JSON.stringify({id:pantryId,name:'Perso'})])).rows[0].r.conflict,true);
  assert.equal((await db.query('SELECT title FROM recipes')).rows[0].title,'Pasta nuova');
  await db.query(`SELECT kitchen_apply('meal_plan_entries',$1::jsonb,NULL)`,[JSON.stringify({id:'42345678-1234-4234-8234-123456789012',date:'2026-10-15',meal_type:'dinner',recipe_id:row.id,servings:4})]);
  await db.query(`SELECT kitchen_apply('cooking_history',$1::jsonb,NULL)`,[JSON.stringify({id:'52345678-1234-4234-8234-123456789012',recipe_id:row.id,cooked_at:'2026-10-15T12:00:00Z',rating:4,notes:'Meno sale'})]);
  const kitchen=(await db.query(`SELECT kitchen_read('2026-10-12','2026-10-18') AS r`)).rows[0].r;
  assert.equal(kitchen.plan.length,1);assert.equal(kitchen.stats[0].count,1);assert.equal(Number(kitchen.stats[0].average_rating),4);
  assert.equal(kitchen.history[0].notes,'Meno sale');
 }finally{await db.close();}
});
