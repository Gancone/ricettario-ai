-- New, additive structures only. No existing recipe is rewritten or removed.
CREATE TABLE IF NOT EXISTS public.recipe_ingredients(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,
 recipe_revision bigint NOT NULL,position integer NOT NULL,original_text text NOT NULL,quantity numeric,quantity_max numeric,
 unit text,ingredient text NOT NULL,notes text,normalized_ingredient text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(recipe_id,recipe_revision,position)
);
CREATE INDEX IF NOT EXISTS recipe_ingredients_lookup ON public.recipe_ingredients(recipe_id,recipe_revision);
CREATE TABLE IF NOT EXISTS public.pantry_items(
 id uuid PRIMARY KEY,name text NOT NULL,normalized_name text NOT NULL,quantity numeric,unit text,notes text,
 finished boolean NOT NULL DEFAULT false,revision bigint NOT NULL DEFAULT 1,archived_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.meal_plan_entries(
 id uuid PRIMARY KEY,date date NOT NULL,meal_type text NOT NULL CHECK(meal_type IN('breakfast','lunch','dinner','snack')),
 recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,servings numeric NOT NULL CHECK(servings>0 AND servings<=1000),notes text,
 revision bigint NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meal_plan_dates ON public.meal_plan_entries(date) WHERE archived_at IS NULL;
CREATE TABLE IF NOT EXISTS public.cooking_history(
 id uuid PRIMARY KEY,recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE RESTRICT,cooked_at timestamptz NOT NULL DEFAULT now(),
 servings numeric,rating integer CHECK(rating BETWEEN 0 AND 5),notes text,
 revision bigint NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cooking_history_recipe ON public.cooking_history(recipe_id,cooked_at DESC);
CREATE TABLE IF NOT EXISTS public.recipe_settings(id uuid PRIMARY KEY,preferences jsonb NOT NULL DEFAULT '{}',revision bigint NOT NULL DEFAULT 1,archived_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.shopping_items ADD COLUMN IF NOT EXISTS quantity_max numeric;
ALTER TABLE public.shopping_items ADD COLUMN IF NOT EXISTS ingredient_key text;
ALTER TABLE public.shopping_items ADD COLUMN IF NOT EXISTS group_name text;
ALTER TABLE public.shopping_items ADD COLUMN IF NOT EXISTS contributions jsonb NOT NULL DEFAULT '[]';

CREATE OR REPLACE FUNCTION public.capture_structured_ingredients() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF jsonb_typeof(NEW.nutrition->'_structuredIngredients')='array' THEN
  INSERT INTO public.recipe_ingredients(recipe_id,recipe_revision,position,original_text,quantity,quantity_max,unit,ingredient,notes,normalized_ingredient)
  SELECT NEW.id,coalesce(NEW.revision,1),n::integer-1,x->>'originalText',(x->>'quantity')::numeric,(x->>'quantityMax')::numeric,x->>'unit',x->>'ingredient',x->>'notes',x->>'normalizedIngredient'
  FROM jsonb_array_elements(NEW.nutrition->'_structuredIngredients') WITH ORDINALITY a(x,n)
  ON CONFLICT(recipe_id,recipe_revision,position) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE TRIGGER recipe_ingredients_capture AFTER INSERT OR UPDATE OF ingredients,nutrition ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.capture_structured_ingredients();

CREATE OR REPLACE FUNCTION public.kitchen_apply(p_entity text,p_item jsonb,p_expected bigint DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE old_row jsonb;next_row jsonb;entity_table text;item_id uuid;
BEGIN
 IF p_entity NOT IN('pantry_items','meal_plan_entries','cooking_history','recipe_settings') THEN RAISE EXCEPTION 'Invalid kitchen entity';END IF;
 entity_table:=p_entity;item_id:=(p_item->>'id')::uuid;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 FOR UPDATE',entity_table) INTO old_row USING item_id;
 IF old_row IS NULL THEN
  IF p_expected IS NOT NULL THEN RETURN jsonb_build_object('missing',true);END IF;
  next_row:=p_item||jsonb_build_object('revision',1,'created_at',now(),'updated_at',now(),'archived_at',NULL);
  -- Explicit column lists retain defaults for optional values.
  IF p_entity='pantry_items' THEN INSERT INTO pantry_items(id,name,normalized_name,quantity,unit,notes,finished) VALUES(item_id,next_row->>'name',next_row->>'normalized_name',(next_row->>'quantity')::numeric,next_row->>'unit',next_row->>'notes',coalesce((next_row->>'finished')::boolean,false)) RETURNING to_jsonb(pantry_items) INTO next_row;
  ELSIF p_entity='meal_plan_entries' THEN INSERT INTO meal_plan_entries(id,date,meal_type,recipe_id,servings,notes) VALUES(item_id,(next_row->>'date')::date,next_row->>'meal_type',(next_row->>'recipe_id')::uuid,(next_row->>'servings')::numeric,next_row->>'notes') RETURNING to_jsonb(meal_plan_entries) INTO next_row;
  ELSIF p_entity='cooking_history' THEN INSERT INTO cooking_history(id,recipe_id,cooked_at,servings,rating,notes) VALUES(item_id,(next_row->>'recipe_id')::uuid,coalesce((next_row->>'cooked_at')::timestamptz,now()),(next_row->>'servings')::numeric,(next_row->>'rating')::integer,next_row->>'notes') RETURNING to_jsonb(cooking_history) INTO next_row;
  ELSE INSERT INTO recipe_settings(id,preferences) VALUES(item_id,coalesce(next_row->'preferences','{}')) RETURNING to_jsonb(recipe_settings) INTO next_row;END IF;
 ELSE
  IF p_expected IS NULL OR p_expected<>(old_row->>'revision')::bigint THEN RETURN jsonb_build_object('conflict',true,'current',old_row);END IF;
  next_row:=old_row||p_item||jsonb_build_object('id',item_id,'created_at',old_row->'created_at','revision',p_expected+1,'updated_at',now());
  IF p_entity='pantry_items' THEN UPDATE pantry_items SET name=next_row->>'name',normalized_name=next_row->>'normalized_name',quantity=(next_row->>'quantity')::numeric,unit=next_row->>'unit',notes=next_row->>'notes',finished=(next_row->>'finished')::boolean,archived_at=(next_row->>'archived_at')::timestamptz,revision=p_expected+1,updated_at=now() WHERE id=item_id RETURNING to_jsonb(pantry_items) INTO next_row;
  ELSIF p_entity='meal_plan_entries' THEN UPDATE meal_plan_entries SET date=(next_row->>'date')::date,meal_type=next_row->>'meal_type',recipe_id=(next_row->>'recipe_id')::uuid,servings=(next_row->>'servings')::numeric,notes=next_row->>'notes',archived_at=(next_row->>'archived_at')::timestamptz,revision=p_expected+1,updated_at=now() WHERE id=item_id RETURNING to_jsonb(meal_plan_entries) INTO next_row;
  ELSIF p_entity='cooking_history' THEN UPDATE cooking_history SET cooked_at=(next_row->>'cooked_at')::timestamptz,servings=(next_row->>'servings')::numeric,rating=(next_row->>'rating')::integer,notes=next_row->>'notes',archived_at=(next_row->>'archived_at')::timestamptz,revision=p_expected+1,updated_at=now() WHERE id=item_id RETURNING to_jsonb(cooking_history) INTO next_row;
  ELSE UPDATE recipe_settings SET preferences=next_row->'preferences',revision=p_expected+1,updated_at=now() WHERE id=item_id RETURNING to_jsonb(recipe_settings) INTO next_row;END IF;
 END IF;
 RETURN jsonb_build_object('current',next_row);
END $$;

CREATE OR REPLACE FUNCTION public.shopping_apply_v7(p_expected bigint,p_items jsonb,p_replace boolean DEFAULT true) RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE result jsonb;item jsonb;
BEGIN
 result:=public.shopping_apply(p_expected,p_items,p_replace);
 IF coalesce((result->>'conflict')::boolean,false) THEN RETURN result;END IF;
 IF p_replace THEN FOR item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
  UPDATE shopping_items SET quantity_max=(item->>'quantity_max')::numeric,ingredient_key=item->>'ingredient_key',group_name=item->>'group_name',contributions=coalesce(item->'contributions','[]') WHERE id=(item->>'id')::uuid;
 END LOOP;END IF;
 RETURN public.shopping_read();
END $$;

DO $$ DECLARE name text;BEGIN
 FOREACH name IN ARRAY ARRAY['recipe_ingredients','pantry_items','meal_plan_entries','cooking_history','recipe_settings'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon,authenticated',name);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON public.%I TO service_role',name);
  EXECUTE format('CREATE OR REPLACE TRIGGER kitchen_epoch AFTER INSERT OR UPDATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.touch_data_epoch()',name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.kitchen_apply(text,jsonb,bigint),public.shopping_apply_v7(bigint,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_apply(text,jsonb,bigint),public.shopping_apply_v7(bigint,jsonb,boolean) TO service_role;
