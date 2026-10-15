-- One statement gives the list and its matching compare-and-swap revision.
CREATE OR REPLACE FUNCTION public.shopping_read() RETURNS jsonb
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('revision',b.revision,'items',
  (SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY created_at,id),'[]'::jsonb)
   FROM public.shopping_items s WHERE deleted_at IS NULL))
 FROM public.backend_state b WHERE key='shopping';
$$;
REVOKE ALL ON FUNCTION public.shopping_read() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.shopping_read() TO service_role;
