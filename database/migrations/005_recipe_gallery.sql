CREATE INDEX IF NOT EXISTS recipes_gallery_order ON public.recipes(archived,created_at DESC,id);
CREATE INDEX IF NOT EXISTS recipes_gallery_time ON public.recipes(total_time_minutes);
CREATE OR REPLACE FUNCTION public.recipe_gallery(p_query text DEFAULT '',p_category text DEFAULT 'Tutte',p_filter text DEFAULT 'all',p_sort text DEFAULT 'newest',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0) RETURNS jsonb LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 WITH usage AS(SELECT recipe_id,count(*)::int AS cooked,max(cooked_at) AS last_cooked,avg(rating) AS average_rating FROM cooking_history WHERE archived_at IS NULL GROUP BY recipe_id),
 filtered AS(SELECT r.*,coalesce(u.cooked,0) AS usage_count,u.last_cooked,u.average_rating FROM recipes r LEFT JOIN usage u ON u.recipe_id=r.id WHERE
  (CASE WHEN p_category='Archiviate' THEN coalesce(r.archived,false) ELSE NOT coalesce(r.archived,false) END)
  AND(p_category IN('Tutte','Archiviate') OR(p_category='Preferite' AND coalesce(r.favorite,false)) OR r.category=p_category)
  AND NOT EXISTS(SELECT 1 FROM regexp_split_to_table(lower(translate(btrim(p_query),'àèéìòù','aeeiou')),'\s+') word WHERE word<>'' AND lower(translate(concat_ws(' ',r.title,r.category,array_to_string(r.tags,' '),array_to_string(r.ingredients,' '),array_to_string(r.steps,' '),r.notes,r.source_notes),'àèéìòù','aeeiou')) NOT LIKE '%'||word||'%')
  AND CASE p_filter WHEN 'under15' THEN r.total_time_minutes<=15 WHEN 'under30' THEN r.total_time_minutes<=30 WHEN 'under60' THEN r.total_time_minutes<=60 WHEN 'under500' THEN (CASE WHEN r.nutrition->>'calories' ~ '^\d+(\.\d+)?$' THEN (r.nutrition->>'calories')::numeric END)<=500 WHEN 'protein20' THEN (CASE WHEN r.nutrition->>'protein' ~ '^\d+(\.\d+)?$' THEN (r.nutrition->>'protein')::numeric END)>=20 WHEN 'protein30' THEN (CASE WHEN r.nutrition->>'protein' ~ '^\d+(\.\d+)?$' THEN (r.nutrition->>'protein')::numeric END)>=30 WHEN 'vegetarian' THEN EXISTS(SELECT 1 FROM unnest(r.tags) tag WHERE lower(tag) IN('vegetariana','vegetariano','vegana','vegano')) WHEN 'recent' THEN u.last_cooked>=now()-interval '30 days' WHEN 'never' THEN u.recipe_id IS NULL ELSE true END),
 page AS(SELECT * FROM filtered ORDER BY
  CASE WHEN p_sort='title' THEN title END ASC,
  CASE WHEN p_sort='oldest' THEN created_at END ASC,
  CASE WHEN p_sort='fastest' THEN total_time_minutes END ASC NULLS LAST,
  CASE WHEN p_sort='lightest' THEN (CASE WHEN nutrition->>'calories' ~ '^\d+(\.\d+)?$' THEN (nutrition->>'calories')::numeric END) END ASC NULLS LAST,
  CASE WHEN p_sort='cooked' THEN usage_count END DESC NULLS LAST,
  CASE WHEN p_sort='rating' THEN average_rating END DESC NULLS LAST,
  created_at DESC,id LIMIT greatest(1,least(p_limit,20)) OFFSET greatest(0,p_offset))
 SELECT jsonb_build_object('items',(SELECT coalesce(jsonb_agg(to_jsonb(page)),'[]') FROM page),'total',(SELECT count(*) FROM filtered),
 'summary',jsonb_build_object('recipes',(SELECT count(*) FROM recipes WHERE NOT coalesce(archived,false)),'favorites',(SELECT count(*) FROM recipes WHERE coalesce(favorite,false) AND NOT coalesce(archived,false)),'categories',(SELECT coalesce(jsonb_object_agg(coalesce(category,'Senza categoria'),n),'{}') FROM(SELECT category,count(*) AS n FROM recipes WHERE NOT coalesce(archived,false) GROUP BY category)c)));
$$;
REVOKE ALL ON FUNCTION public.recipe_gallery(text,text,text,text,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.recipe_gallery(text,text,text,text,integer,integer) TO service_role;
