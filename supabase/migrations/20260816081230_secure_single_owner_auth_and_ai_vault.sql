create extension if not exists supabase_vault with schema vault;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.app_owner (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  claimed_at timestamptz not null default now()
);

create table if not exists private.user_ai_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_secret_id uuid,
  model text not null default 'gemini-2.5-flash-lite',
  updated_at timestamptz not null default now()
);

create or replace function public.is_app_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.app_owner
    where singleton = true and user_id = (select auth.uid())
  );
$$;

create or replace function public.claim_app_owner()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Authentication required';
  end if;

  insert into private.app_owner (singleton, user_id)
  values (true, (select auth.uid()))
  on conflict (singleton) do nothing;

  return public.is_app_owner();
end;
$$;

revoke all on function public.is_app_owner() from public, anon;
revoke all on function public.claim_app_owner() from public, anon;
grant execute on function public.is_app_owner() to authenticated;
grant execute on function public.claim_app_owner() to authenticated;

do $$
declare
  item record;
  policy_item record;
begin
  for item in
    select tablename
    from pg_tables
    where schemaname = 'public'
      and tablename = any (array[
        'app_settings', 'exchange_rates', 'transactions', 'notifications',
        'managed_items', 'accounts', 'categories', 'budget_items', 'goals',
        'subscriptions', 'monthly_budgets', 'budget_allocations',
        'account_transfers', 'budget_reallocations', 'goal_contributions',
        'month_close_distributions'
      ])
  loop
    execute format('alter table public.%I enable row level security', item.tablename);
    execute format('revoke all on table public.%I from anon', item.tablename);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', item.tablename);

    for policy_item in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = item.tablename
    loop
      execute format('drop policy %I on public.%I', policy_item.policyname, item.tablename);
    end loop;

    execute format(
      'create policy "single owner access" on public.%I for all to authenticated using ((select public.is_app_owner())) with check ((select public.is_app_owner()))',
      item.tablename
    );
  end loop;
end;
$$;

revoke all on all sequences in schema public from anon;
grant usage, select on all sequences in schema public to authenticated;

do $$
declare
  item record;
begin
  for item in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = any (array[
        'set_exchange_rate', 'process_due_subscriptions',
        'create_budget_with_allocation', 'effective_budget_allocation',
        'effective_monthly_budget', 'set_monthly_budget',
        'validate_budget_allocation_total', 'validate_monthly_budget_total',
        'activate_budget_month', 'allocate_budget_money', 'close_budget_month',
        'contribute_to_goal', 'create_account_transfer', 'move_budget_money',
        'reopen_budget_month', 'workspace_assigned_reserve',
        'workspace_goal_reserve', 'workspace_liquid_balance',
        'workspace_unallocated_cash', 'generate_subscription_reminders'
      ])
  loop
    execute format('revoke execute on function public.%I(%s) from anon', item.proname, item.args);
    execute format('grant execute on function public.%I(%s) to authenticated', item.proname, item.args);
  end loop;
end;
$$;

create or replace function public.save_user_gemini_key(p_user_id uuid, p_api_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_secret_id uuid;
  next_secret_id uuid;
begin
  if p_user_id is null or length(trim(p_api_key)) < 20 then
    raise exception 'A valid Gemini API key is required';
  end if;

  select gemini_secret_id into existing_secret_id
  from private.user_ai_settings
  where user_id = p_user_id;

  if existing_secret_id is null then
    select vault.create_secret(
      trim(p_api_key),
      'gemini_' || replace(p_user_id::text, '-', ''),
      'NULL Money Gemini API key'
    ) into next_secret_id;

    insert into private.user_ai_settings (user_id, gemini_secret_id)
    values (p_user_id, next_secret_id)
    on conflict (user_id) do update
      set gemini_secret_id = excluded.gemini_secret_id,
          updated_at = now();
  else
    perform vault.update_secret(existing_secret_id, trim(p_api_key));
    update private.user_ai_settings set updated_at = now() where user_id = p_user_id;
  end if;
end;
$$;

create or replace function public.get_user_gemini_key(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where id = (
    select gemini_secret_id from private.user_ai_settings where user_id = p_user_id
  );
$$;

create or replace function public.has_user_gemini_key(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.user_ai_settings
    where user_id = p_user_id and gemini_secret_id is not null
  );
$$;

revoke all on function public.save_user_gemini_key(uuid, text) from public, anon, authenticated;
revoke all on function public.get_user_gemini_key(uuid) from public, anon, authenticated;
revoke all on function public.has_user_gemini_key(uuid) from public, anon, authenticated;
grant execute on function public.save_user_gemini_key(uuid, text) to service_role;
grant execute on function public.get_user_gemini_key(uuid) to service_role;
grant execute on function public.has_user_gemini_key(uuid) to service_role;
