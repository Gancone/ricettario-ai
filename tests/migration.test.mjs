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
  for(const file of ['001_backend_safety','002_shopping_read'])await db.exec(await readFile(new URL(`../database/migrations/${file}.sql`,import.meta.url),'utf8'));
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
 }finally{await db.close();}
});
