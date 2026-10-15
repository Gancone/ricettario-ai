CREATE OR REPLACE FUNCTION public.kitchen_read(p_from date,p_to date) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
 'pantry',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.name),'[]') FROM public.pantry_items p WHERE archived_at IS NULL),
 'plan',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.date,p.meal_type,p.id),'[]') FROM public.meal_plan_entries p WHERE archived_at IS NULL AND date BETWEEN p_from AND p_to),
 'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.cooked_at DESC),'[]') FROM (SELECT * FROM public.cooking_history WHERE archived_at IS NULL ORDER BY cooked_at DESC,id LIMIT 100) h),
 'stats',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM (SELECT recipe_id,count(*)::integer AS count,max(cooked_at) AS last_cooked_at,avg(rating)::numeric AS average_rating FROM public.cooking_history WHERE archived_at IS NULL GROUP BY recipe_id) s));
$$;
REVOKE ALL ON FUNCTION public.kitchen_read(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.kitchen_read(date,date) TO service_role;
