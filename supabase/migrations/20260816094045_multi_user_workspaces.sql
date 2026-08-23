-- Replace the temporary single-owner model with user-owned, multi-workspace ledgers.
-- Existing rows are assigned to the account that claimed the original app.

create table public.user_workspaces (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  slug text not null check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  name text not null check (length(trim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);

alter table public.user_workspaces enable row level security;
grant select, insert, update, delete on public.user_workspaces to authenticated;
revoke all on public.user_workspaces from anon;

create policy "users manage their own workspaces"
on public.user_workspaces for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

do $$
declare
  owner_id uuid;
  table_name text;
begin
  select user_id into owner_id from private.app_owner limit 1;
  if owner_id is null then
    select id into owner_id from auth.users where lower(email) = 'elioandrayen@gmail.com' limit 1;
  end if;
  if owner_id is null then
    raise exception 'The existing ledger owner could not be identified.';
  end if;

  insert into public.user_workspaces (user_id, slug, name)
  values (owner_id, 'test', 'Testing'), (owner_id, 'live', 'Elio Live')
  on conflict (user_id, slug) do nothing;

  foreach table_name in array array[
    'app_settings','exchange_rates','transactions','notifications','managed_items',
    'accounts','categories','budget_items','goals','subscriptions','monthly_budgets',
    'budget_allocations','account_transfers','budget_reallocations',
    'goal_contributions','month_close_distributions'
  ] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade default auth.uid()', table_name);
    execute format('update public.%I set user_id = $1 where user_id is null', table_name) using owner_id;
    execute format('alter table public.%I alter column user_id set not null', table_name);
  end loop;
end $$;

-- Workspace names are now user-defined rather than limited to test/live.
do $$
declare
  table_name text;
  constraint_name text;
begin
  foreach table_name in array array[
    'app_settings','exchange_rates','transactions','notifications','managed_items',
    'accounts','categories','budget_items','goals','subscriptions','monthly_budgets',
    'budget_allocations','account_transfers','budget_reallocations',
    'goal_contributions','month_close_distributions'
  ] loop
    for constraint_name in
      select c.conname
      from pg_constraint c
      join pg_class t on t.oid = c.conrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public' and t.relname = table_name and c.contype = 'c'
        and pg_get_constraintdef(c.oid) ilike '%workspace%'
        and pg_get_constraintdef(c.oid) ilike '%test%live%'
    loop
      execute format('alter table public.%I drop constraint %I', table_name, constraint_name);
    end loop;
  end loop;
end $$;

-- Tenant-aware uniqueness lets different users use familiar names such as "live".
alter table public.app_settings drop constraint if exists app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (user_id, workspace);

drop index if exists public.categories_workspace_name_idx;
create unique index categories_user_workspace_name_idx on public.categories (user_id, workspace, lower(name));

alter table public.monthly_budgets drop constraint if exists monthly_budgets_workspace_month_start_key;
alter table public.monthly_budgets add constraint monthly_budgets_user_workspace_month_key unique (user_id, workspace, month_start);

alter table public.budget_allocations drop constraint if exists budget_allocations_workspace_budget_item_id_month_start_key;
alter table public.budget_allocations add constraint budget_allocations_user_workspace_item_month_key unique (user_id, workspace, budget_item_id, month_start);

drop index if exists public.notifications_workspace_dedupe_idx;
create unique index notifications_user_workspace_dedupe_idx
on public.notifications (user_id, workspace, dedupe_key)
where dedupe_key is not null;

-- Replace every old single-owner policy with explicit row ownership and workspace membership.
do $$
declare
  table_name text;
  policy_name text;
begin
  foreach table_name in array array[
    'app_settings','exchange_rates','transactions','notifications','managed_items',
    'accounts','categories','budget_items','goals','subscriptions','monthly_budgets',
    'budget_allocations','account_transfers','budget_reallocations',
    'goal_contributions','month_close_distributions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    for policy_name in select policyname from pg_policies where schemaname = 'public' and tablename = table_name loop
      execute format('drop policy %I on public.%I', policy_name, table_name);
    end loop;
    execute format(
      'create policy %I on public.%I for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.user_workspaces w where w.user_id = (select auth.uid()) and w.slug = workspace))',
      table_name || '_owner_access', table_name
    );
    execute format('grant select, insert, update, delete on public.%I to authenticated', table_name);
    execute format('revoke all on public.%I from anon', table_name);
  end loop;
end $$;

grant usage, select on all sequences in schema public to authenticated;
revoke usage on all sequences in schema public from anon;

create or replace function public.create_user_workspace(p_name text)
returns public.user_workspaces
language plpgsql security invoker set search_path = '' as $$
declare
  result public.user_workspaces;
  base_slug text;
  candidate text;
  suffix integer := 1;
begin
  if (select auth.uid()) is null then raise exception 'Sign in to create a workspace.'; end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 60 then raise exception 'Workspace name must be between 1 and 60 characters.'; end if;
  base_slug := trim(both '-' from regexp_replace(lower(trim(p_name)), '[^a-z0-9]+', '-', 'g'));
  if base_slug = '' then base_slug := 'workspace'; end if;
  base_slug := left(base_slug, 34);
  candidate := base_slug;
  while exists (select 1 from public.user_workspaces where user_id = (select auth.uid()) and slug = candidate) loop
    suffix := suffix + 1;
    candidate := left(base_slug, 34) || '-' || suffix;
  end loop;

  insert into public.user_workspaces (user_id, slug, name)
  values ((select auth.uid()), candidate, trim(p_name)) returning * into result;
  insert into public.app_settings (id, user_id, workspace, exchange_rate_lbp_per_usd, base_currency, opening_balance_usd, monthly_budget_usd)
  values (true, (select auth.uid()), candidate, 89500, 'USD', 0, 0);
  insert into public.exchange_rates (user_id, workspace, lbp_per_usd, note)
  values ((select auth.uid()), candidate, 89500, 'Initial workspace rate');
  insert into public.categories (user_id, workspace, name, category_group, is_default)
  select (select auth.uid()), candidate, defaults.name, defaults.category_group, true
  from (values
    ('Salary', 'Financial'), ('Other income', 'Financial'), ('Housing', 'Essential'),
    ('Food & dining', 'Essential'), ('Transport', 'Essential'), ('Utilities', 'Essential'),
    ('Health', 'Essential'), ('Shopping', 'Flexible'), ('Entertainment', 'Lifestyle'), ('Other', 'Other')
  ) as defaults(name, category_group);
  return result;
end $$;

create or replace function public.clear_user_workspace(p_workspace text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if not exists (select 1 from public.user_workspaces where user_id = (select auth.uid()) and slug = p_workspace) then raise exception 'Workspace not found.'; end if;
  delete from public.month_close_distributions where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.budget_reallocations where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.goal_contributions where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.account_transfers where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.transactions where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.subscriptions where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.budget_allocations where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.monthly_budgets where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.budget_items where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.goals where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.categories where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.accounts where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.notifications where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.managed_items where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.exchange_rates where user_id = (select auth.uid()) and workspace = p_workspace;
  update public.app_settings set exchange_rate_lbp_per_usd = 89500, opening_balance_usd = 0, monthly_budget_usd = 0, updated_at = now()
  where user_id = (select auth.uid()) and workspace = p_workspace;
  insert into public.exchange_rates (user_id, workspace, lbp_per_usd, note) values ((select auth.uid()), p_workspace, 89500, 'Workspace reset rate');
end $$;

create or replace function public.delete_user_workspace(p_workspace text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.clear_user_workspace(p_workspace);
  delete from public.exchange_rates where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.app_settings where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.user_workspaces where user_id = (select auth.uid()) and slug = p_workspace;
end $$;

-- Functions whose conflict keys or validation previously assumed globally unique workspaces.
create or replace function public.set_exchange_rate(p_workspace text, p_rate numeric)
returns numeric language plpgsql security invoker set search_path = '' as $$
begin
  if p_rate is null or p_rate <= 0 then raise exception 'Exchange rate must be greater than zero'; end if;
  update public.app_settings set exchange_rate_lbp_per_usd = p_rate, updated_at = now()
  where user_id = (select auth.uid()) and workspace = p_workspace;
  if not found then raise exception 'Workspace settings not found'; end if;
  insert into public.exchange_rates (user_id, workspace, lbp_per_usd, note) values ((select auth.uid()), p_workspace, p_rate, 'Updated from budget app');
  insert into public.notifications (user_id, workspace, title, body, type, action_target)
  values ((select auth.uid()), p_workspace, 'Exchange rate updated', 'New transactions will use 1 USD = ' || trim(to_char(p_rate, 'FM999,999,999,990.######')) || ' LBP. Historical entries were not changed.', 'info', 'Settings');
  return p_rate;
end $$;

create or replace function public.set_monthly_budget(p_workspace text, p_month date, p_amount numeric, p_recurring boolean)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint;
begin
  insert into public.monthly_budgets (user_id, workspace, month_start, amount_usd, recurring)
  values ((select auth.uid()), p_workspace, date_trunc('month', p_month)::date, p_amount, p_recurring)
  on conflict (user_id, workspace, month_start) do update set amount_usd = excluded.amount_usd, recurring = excluded.recurring, updated_at = now()
  returning id into result_id;
  update public.app_settings set monthly_budget_usd = p_amount, updated_at = now()
  where user_id = (select auth.uid()) and workspace = p_workspace and date_trunc('month', p_month)::date = date_trunc('month', current_date)::date;
  return result_id;
end $$;

create or replace function public.allocate_budget_money(p_workspace text, p_month date, p_budget_item_id bigint, p_amount numeric, p_recurring boolean default false)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint; delta numeric; current_amount numeric; available numeric;
begin
  if p_amount < 0 then raise exception 'Allocation must be zero or greater.'; end if;
  if not exists (select 1 from public.budget_items where id = p_budget_item_id and workspace = p_workspace and active) then raise exception 'Budget item is unavailable.'; end if;
  select coalesce(amount_usd, 0) into current_amount from public.budget_allocations where workspace = p_workspace and budget_item_id = p_budget_item_id and month_start = date_trunc('month', p_month)::date;
  delta := p_amount - coalesce(current_amount, 0); available := public.workspace_unallocated_cash(p_workspace);
  if delta > available then raise exception 'Only % is unallocated.', available; end if;
  insert into public.monthly_budgets (user_id, workspace, month_start, amount_usd, recurring, status)
  values ((select auth.uid()), p_workspace, date_trunc('month', p_month)::date, p_amount, false, 'draft')
  on conflict (user_id, workspace, month_start) do nothing;
  insert into public.budget_allocations (user_id, workspace, budget_item_id, month_start, amount_usd, recurring)
  values ((select auth.uid()), p_workspace, p_budget_item_id, date_trunc('month', p_month)::date, p_amount, p_recurring)
  on conflict (user_id, workspace, budget_item_id, month_start) do update set amount_usd = excluded.amount_usd, recurring = excluded.recurring, updated_at = now()
  returning id into result_id;
  update public.monthly_budgets set amount_usd = (select coalesce(sum(amount_usd + moved_in_usd - moved_out_usd + rollover_usd),0) from public.budget_allocations where workspace = p_workspace and month_start = date_trunc('month', p_month)::date), status = case when status = 'closed' then 'reopened' else status end, updated_at = now()
  where workspace = p_workspace and month_start = date_trunc('month', p_month)::date;
  return result_id;
end $$;

create or replace function public.process_due_subscriptions(p_workspace text, p_as_of date default current_date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare subscription_row public.subscriptions%rowtype; charge_date date; processed_count integer := 0; month_start date := date_trunc('month', p_as_of)::date;
begin
  for subscription_row in
    select * from public.subscriptions where workspace = p_workspace and active = true and due_day <= extract(day from p_as_of)
      and (last_charged_month is null or last_charged_month < month_start)
    order by due_day, id for update skip locked
  loop
    charge_date := make_date(extract(year from p_as_of)::integer, extract(month from p_as_of)::integer, subscription_row.due_day);
    insert into public.transactions (user_id, workspace, name, category, transaction_date, kind, original_amount, original_currency, exchange_rate_lbp_per_usd, amount_usd, notes, account_id, budget_item_id, subscription_id)
    values ((select auth.uid()), p_workspace, subscription_row.name, coalesce((select c.name from public.budget_items b left join public.categories c on c.id = b.category_id where b.id = subscription_row.budget_item_id), 'Subscriptions'), charge_date, 'expense', subscription_row.original_amount, subscription_row.original_currency, subscription_row.exchange_rate_lbp_per_usd, -subscription_row.amount_usd, 'Automatic monthly subscription charge', subscription_row.account_id, subscription_row.budget_item_id, subscription_row.id);
    update public.subscriptions set last_charged_month = month_start, updated_at = now() where id = subscription_row.id;
    insert into public.notifications (user_id, workspace, title, body, type, action_target)
    values ((select auth.uid()), p_workspace, 'Subscription charged', subscription_row.name || ' was deducted automatically on ' || to_char(charge_date, 'Mon DD') || '.', 'info', 'Subscriptions');
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end $$;

create or replace function public.generate_subscription_reminders(p_workspace text, p_as_of date default current_date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare subscription_row public.subscriptions%rowtype; due_date date; reminder_day integer; notice_body text; notice_key text; created_count integer := 0; affected_count integer; reminder_days integer[]; reminders_enabled boolean;
begin
  select subscription_reminders_enabled, subscription_reminder_days into reminders_enabled, reminder_days from public.app_settings where workspace = p_workspace;
  if not coalesce(reminders_enabled, true) then return 0; end if;
  for subscription_row in select * from public.subscriptions where workspace = p_workspace and active = true order by due_day, id loop
    due_date := make_date(extract(year from p_as_of)::integer, extract(month from p_as_of)::integer, subscription_row.due_day);
    if due_date < p_as_of then due_date := (due_date + interval '1 month')::date; end if;
    foreach reminder_day in array coalesce(reminder_days, array[7, 3, 1]) loop
      if due_date - p_as_of = reminder_day then
        notice_body := subscription_row.name || ' is due on ' || to_char(due_date, 'Mon DD, YYYY') || ' (' || reminder_day || case when reminder_day = 1 then ' day' else ' days' end || ' remaining).';
        notice_key := 'subscription:' || subscription_row.id || ':' || due_date || ':' || reminder_day;
        insert into public.notifications (user_id, workspace, title, body, type, action_target, dedupe_key)
        values ((select auth.uid()), p_workspace, 'Upcoming subscription', notice_body, 'warning', 'Subscriptions', notice_key)
        on conflict (user_id, workspace, dedupe_key) where dedupe_key is not null do nothing;
        get diagnostics affected_count = row_count; created_count := created_count + affected_count;
      end if;
    end loop;
  end loop;
  return created_count;
end $$;

-- The user explicitly requested that previously submitted Elio Live finance data be cleared.
do $$
declare owner_id uuid;
begin
  select user_id into owner_id from private.app_owner limit 1;
  if owner_id is not null then
    perform set_config('request.jwt.claim.sub', owner_id::text, true);
    perform public.clear_user_workspace('live');
  end if;
end $$;

revoke all on function public.create_user_workspace(text) from public, anon;
revoke all on function public.clear_user_workspace(text) from public, anon;
revoke all on function public.delete_user_workspace(text) from public, anon;
grant execute on function public.create_user_workspace(text) to authenticated;
grant execute on function public.clear_user_workspace(text) to authenticated;
grant execute on function public.delete_user_workspace(text) to authenticated;

do $$
declare function_record record;
begin
  for function_record in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in (
      'set_exchange_rate','set_monthly_budget','effective_monthly_budget','effective_budget_allocation',
      'process_due_subscriptions','generate_subscription_reminders','create_budget_with_allocation',
      'allocate_budget_money','move_budget_money','contribute_to_goal','create_account_transfer',
      'close_budget_month','reopen_budget_month','activate_budget_month','workspace_liquid_balance',
      'workspace_goal_reserve','workspace_assigned_reserve','workspace_unallocated_cash'
    )
  loop
    execute format('revoke all on function %s from public, anon', function_record.signature);
    execute format('grant execute on function %s to authenticated', function_record.signature);
  end loop;
end $$;

revoke all on function public.claim_app_owner() from public, anon, authenticated;
drop function public.claim_app_owner();
revoke all on function public.is_app_owner() from public, anon, authenticated;
drop function public.is_app_owner();
drop table private.app_owner;
