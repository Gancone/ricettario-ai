-- Additive migration; transaction and checksum managed by tools/migrate.ts.
CREATE TABLE IF NOT EXISTS public.schema_migrations(id text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS public.backend_state(key text PRIMARY KEY,revision bigint NOT NULL DEFAULT 1);
INSERT INTO public.backend_state(key) VALUES ('data_epoch'),('shopping') ON CONFLICT DO NOTHING;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS revision bigint DEFAULT 1;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS favorite boolean;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS archived boolean;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS rating integer;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS source_notes text;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS source_url_normalized text;
CREATE TABLE IF NOT EXISTS public.recipe_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
 revision bigint NOT NULL,snapshot jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),reason text NOT NULL
);
CREATE INDEX IF NOT EXISTS recipe_versions_lookup ON public.recipe_versions(recipe_id,revision DESC);
CREATE INDEX IF NOT EXISTS recipes_source_normalized ON public.recipes(source_url_normalized);
CREATE INDEX IF NOT EXISTS recipes_source_original ON public.recipes(source_url);
CREATE OR REPLACE FUNCTION public.normalize_recipe_source(value text) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path=public,pg_temp AS $$
DECLARE parts text[]; host text; pathname text; query text; result text;
BEGIN
 IF value IS NULL OR btrim(value)='' THEN RETURN NULL; END IF;
 parts:=regexp_match(btrim(value),'^https?://([^/?#]+)([^?#]*)([?]([^#]*))?','i');
 IF parts IS NULL THEN RETURN btrim(value); END IF;
 host:=regexp_replace(lower(parts[1]),'^www[.]','');
 pathname:=regexp_replace(coalesce(parts[2],''),'/+$','');
 SELECT string_agg(p,'&' ORDER BY p) INTO query FROM unnest(string_to_array(coalesce(parts[4],''),'&')) p
  WHERE p<>'' AND split_part(lower(p),'=',1) !~ '^(utm_.*|fbclid|gclid|igsh|igshid|si|feature|t|start)$';
 IF host IN ('youtube.com','m.youtube.com','youtu.be') THEN
  IF host='youtu.be' THEN pathname:='/watch';query:='v='||trim(both '/' from parts[2]);
  ELSIF pathname ~ '^/(shorts|embed)/' THEN query:='v='||split_part(pathname,'/',3);pathname:='/watch';
  ELSE SELECT p INTO result FROM unnest(string_to_array(coalesce(query,''),'&')) p WHERE p LIKE 'v=%' LIMIT 1;query:=result;END IF;
  host:='youtube.com';
 END IF;
 RETURN 'https://'||host||coalesce(nullif(pathname,''),'/')||CASE WHEN coalesce(query,'')<>'' THEN '?'||query ELSE '' END;
END $$;
-- Original legacy values are preserved in history AND in nutrition until next explicit edit.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.schema_migrations WHERE id='001_backend_safety') THEN
  INSERT INTO public.recipe_versions(recipe_id,revision,snapshot,reason) SELECT id,coalesce(revision,1),to_jsonb(r),'migration' FROM public.recipes r;
  UPDATE public.recipes SET updated_at=coalesce(updated_at,created_at,now()),revision=coalesce(revision,1),
   favorite=coalesce(favorite,nutrition->>'_favorite'='true',false),archived=coalesce(archived,nutrition->>'_archived'='true',false),
   source_notes=coalesce(source_notes,nutrition->>'_sourceNotes',''),
   rating=coalesce(rating,CASE WHEN nutrition->>'_rating' ~ '^[0-5]$' THEN (nutrition->>'_rating')::integer END),
   archived_at=coalesce(archived_at,CASE WHEN coalesce(archived,nutrition->>'_archived'='true',false) THEN coalesce(updated_at,created_at,now()) END),
   source_url_normalized=public.normalize_recipe_source(source_url);
 END IF;
END $$;
CREATE OR REPLACE FUNCTION public.touch_data_epoch() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN UPDATE public.backend_state SET revision=revision+1 WHERE key='data_epoch';RETURN NULL;END $$;
CREATE OR REPLACE TRIGGER recipes_epoch AFTER INSERT OR UPDATE OR DELETE ON public.recipes FOR EACH STATEMENT EXECUTE FUNCTION public.touch_data_epoch();
CREATE OR REPLACE TRIGGER categories_epoch AFTER INSERT OR UPDATE OR DELETE ON public.categories FOR EACH STATEMENT EXECUTE FUNCTION public.touch_data_epoch();
CREATE OR REPLACE FUNCTION public.guard_recipe_write() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Permanent recipe deletion is disabled';END IF;
 IF TG_OP='INSERT' THEN NEW.revision:=1;NEW.updated_at:=now();
 ELSE
  IF current_setting('ricettario.recipe_write',true) IS DISTINCT FROM 'allowed' THEN RAISE EXCEPTION 'Revision required: use recipe_apply RPC';END IF;
  IF NEW.id<>OLD.id THEN RAISE EXCEPTION 'Recipe IDs are immutable';END IF;
  INSERT INTO public.recipe_versions(recipe_id,revision,snapshot,reason) VALUES(OLD.id,coalesce(OLD.revision,1),to_jsonb(OLD),
   coalesce(nullif(current_setting('ricettario.reason',true),''),'before_update'));
  NEW.revision:=coalesce(OLD.revision,1)+1;NEW.updated_at:=now();
 END IF;
 NEW.source_url_normalized:=public.normalize_recipe_source(NEW.source_url);
 NEW.archived_at:=CASE WHEN coalesce(NEW.archived,false) THEN coalesce(NEW.archived_at,now()) ELSE NULL END;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER recipes_guard BEFORE INSERT OR UPDATE OR DELETE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.guard_recipe_write();
CREATE OR REPLACE FUNCTION public.recipe_apply(p_id uuid,p_expected bigint,p_patch jsonb,p_reason text DEFAULT 'before_update')
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE current_row public.recipes;next_row public.recipes;
BEGIN
 SELECT * INTO current_row FROM public.recipes WHERE id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('missing',true);END IF;
 IF p_expected IS NULL OR coalesce(current_row.revision,1)<>p_expected THEN RETURN jsonb_build_object('conflict',true,'current',to_jsonb(current_row));END IF;
 IF p_reason NOT IN ('before_update','before_archive','before_restore','manual_snapshot') THEN RAISE EXCEPTION 'Invalid history reason';END IF;
 PERFORM set_config('ricettario.recipe_write','allowed',true);PERFORM set_config('ricettario.reason',p_reason,true);
 next_row:=jsonb_populate_record(current_row,p_patch-ARRAY['id','revision','updated_at','created_at','source_url_normalized']);
 UPDATE public.recipes SET title=next_row.title,source_url=next_row.source_url,image_url=next_row.image_url,
  category=next_row.category,tags=next_row.tags,ingredients=next_row.ingredients,steps=next_row.steps,notes=next_row.notes,
  prep_time_minutes=next_row.prep_time_minutes,cook_time_minutes=next_row.cook_time_minutes,total_time_minutes=next_row.total_time_minutes,
  servings=next_row.servings,nutrition=next_row.nutrition,favorite=next_row.favorite,archived=next_row.archived,rating=next_row.rating,source_notes=next_row.source_notes
  WHERE id=p_id RETURNING * INTO next_row;
 PERFORM set_config('ricettario.recipe_write','',true);
 RETURN jsonb_build_object('current',to_jsonb(next_row));
END $$;
CREATE TABLE IF NOT EXISTS public.shopping_items (
 id uuid PRIMARY KEY,text text NOT NULL,source text NOT NULL DEFAULT '',quantity numeric,unit text,recipe_id uuid REFERENCES public.recipes(id) ON DELETE RESTRICT,
 done boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),revision bigint NOT NULL DEFAULT 1,deleted_at timestamptz
);
CREATE OR REPLACE TRIGGER shopping_epoch AFTER INSERT OR UPDATE OR DELETE ON public.shopping_items FOR EACH STATEMENT EXECUTE FUNCTION public.touch_data_epoch();
CREATE OR REPLACE FUNCTION public.shopping_apply(p_expected bigint,p_items jsonb,p_replace boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE rev bigint;item jsonb;result jsonb;
BEGIN
 SELECT revision INTO rev FROM public.backend_state WHERE key='shopping' FOR UPDATE;
 IF p_replace AND (p_expected IS NULL OR p_expected<>rev) THEN
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') INTO result FROM public.shopping_items s WHERE deleted_at IS NULL;
  RETURN jsonb_build_object('conflict',true,'revision',rev,'items',result);
 END IF;
 IF jsonb_typeof(p_items)<>'array' OR jsonb_array_length(p_items)>10000 THEN RAISE EXCEPTION 'Invalid shopping batch';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  INSERT INTO public.shopping_items(id,text,source,done,quantity,unit,recipe_id)
   VALUES((item->>'id')::uuid,item->>'text',coalesce(item->>'source',''),coalesce((item->>'done')::boolean,false),(item->>'quantity')::numeric,item->>'unit',(item->>'recipe_id')::uuid) ON CONFLICT(id) DO NOTHING;
  IF p_replace THEN UPDATE public.shopping_items SET text=item->>'text',source=coalesce(item->>'source',''),done=coalesce((item->>'done')::boolean,false),
   quantity=(item->>'quantity')::numeric,unit=item->>'unit',recipe_id=(item->>'recipe_id')::uuid,updated_at=now(),revision=revision+1,deleted_at=NULL WHERE id=(item->>'id')::uuid;END IF;
 END LOOP;
 IF p_replace THEN UPDATE public.shopping_items SET deleted_at=now(),updated_at=now(),revision=revision+1
  WHERE deleted_at IS NULL AND id NOT IN (SELECT (x->>'id')::uuid FROM jsonb_array_elements(p_items) x);END IF;
 UPDATE public.backend_state SET revision=revision+1 WHERE key='shopping' RETURNING revision INTO rev;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY created_at,id),'[]') INTO result FROM public.shopping_items s WHERE deleted_at IS NULL;
 RETURN jsonb_build_object('revision',rev,'items',result);
END $$;
CREATE TABLE IF NOT EXISTS public.backend_limits(key text PRIMARY KEY,hits bigint NOT NULL,expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION public.consume_limit(p_key text,p_limit integer,p_seconds integer) RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE n bigint;
BEGIN
 INSERT INTO public.backend_limits(key,hits,expires_at) VALUES(p_key,1,now()+make_interval(secs=>p_seconds))
 ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN backend_limits.expires_at<=now() THEN 1 ELSE backend_limits.hits+1 END,
 expires_at=CASE WHEN backend_limits.expires_at<=now() THEN now()+make_interval(secs=>p_seconds) ELSE backend_limits.expires_at END RETURNING hits INTO n;
 RETURN n<=p_limit;
END $$;
CREATE TABLE IF NOT EXISTS public.backend_leases(key text PRIMARY KEY,owner uuid NOT NULL,expires_at timestamptz NOT NULL);
CREATE OR REPLACE FUNCTION public.acquire_lease(p_key text,p_owner uuid,p_seconds integer) RETURNS boolean LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE claimed uuid;
BEGIN
 INSERT INTO public.backend_leases VALUES(p_key,p_owner,now()+make_interval(secs=>p_seconds))
 ON CONFLICT(key) DO UPDATE SET owner=EXCLUDED.owner,expires_at=EXCLUDED.expires_at
 WHERE backend_leases.expires_at<=now() OR backend_leases.owner=p_owner RETURNING owner INTO claimed;
 RETURN claimed IS NOT NULL;
END $$;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shopping_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backend_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backend_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backend_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recipes,public.categories,public.recipe_versions,public.shopping_items,public.schema_migrations,public.backend_state,public.backend_limits,public.backend_leases FROM anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.recipes,public.categories,public.recipe_versions,public.shopping_items,public.schema_migrations,public.backend_state,public.backend_limits,public.backend_leases TO service_role;
REVOKE DELETE,TRUNCATE ON public.recipes,public.recipe_versions FROM service_role;
REVOKE ALL ON FUNCTION public.recipe_apply(uuid,bigint,jsonb,text),public.shopping_apply(bigint,jsonb,boolean),public.consume_limit(text,integer,integer),public.acquire_lease(text,uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recipe_apply(uuid,bigint,jsonb,text),public.shopping_apply(bigint,jsonb,boolean),public.consume_limit(text,integer,integer),public.acquire_lease(text,uuid,integer) TO service_role;
