CREATE OR REPLACE FUNCTION public.handle_store_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
begin
  update public.stores
  set
    rating = (select round(avg(rating)::numeric, 2) from public.reviews where store_id = new.store_id),
    rating_count = (select count(*) from public.reviews where store_id = new.store_id)
  where id = new.store_id;
  return new;
end;
$$;
