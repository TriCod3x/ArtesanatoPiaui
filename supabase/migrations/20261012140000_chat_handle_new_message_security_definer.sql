CREATE OR REPLACE FUNCTION public.handle_new_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = new.created_at
  WHERE id = new.conversation_id;
  RETURN new;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_message() FROM PUBLIC;
