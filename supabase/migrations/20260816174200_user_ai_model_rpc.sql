create or replace function public.save_user_gemini_model(p_user_id uuid, p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into private.user_ai_settings (user_id, model, updated_at)
  values (p_user_id, p_model, now())
  on conflict (user_id) do update
    set model = excluded.model,
        updated_at = now();
end;
$$;

create or replace function public.get_user_gemini_model(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select model from private.user_ai_settings where user_id = p_user_id;
$$;

revoke all on function public.save_user_gemini_model(uuid, text) from public, anon, authenticated;
revoke all on function public.get_user_gemini_model(uuid) from public, anon, authenticated;
grant execute on function public.save_user_gemini_model(uuid, text) to service_role;
grant execute on function public.get_user_gemini_model(uuid) to service_role;
