create table public.monthly_budgets (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  month_start date not null check (month_start = date_trunc('month', month_start)::date),
  amount_usd numeric(18,2) not null check (amount_usd >= 0),
  recurring boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace, month_start)
);

create table public.budget_allocations (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  budget_item_id bigint not null references public.budget_items(id) on delete cascade,
  month_start date not null check (month_start = date_trunc('month', month_start)::date),
  amount_usd numeric(18,2) not null check (amount_usd >= 0),
  recurring boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace, budget_item_id, month_start)
);

create index monthly_budgets_workspace_month_idx on public.monthly_budgets (workspace, month_start desc);
create index budget_allocations_workspace_month_idx on public.budget_allocations (workspace, month_start desc, budget_item_id);

alter table public.monthly_budgets enable row level security;
alter table public.budget_allocations enable row level security;
grant select, insert, update, delete on table public.monthly_budgets to anon;
grant select, insert, update, delete on table public.budget_allocations to anon;
grant usage, select on all sequences in schema public to anon;
create policy "personal monthly budgets access" on public.monthly_budgets for all to anon using (true) with check (true);
create policy "personal budget allocations access" on public.budget_allocations for all to anon using (true) with check (true);

create function public.effective_monthly_budget(p_workspace text, p_month date)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select amount_usd
     from public.monthly_budgets
     where workspace = p_workspace
       and (month_start = date_trunc('month', p_month)::date
         or (recurring and month_start < date_trunc('month', p_month)::date))
     order by month_start desc
     limit 1),
    (select monthly_budget_usd from public.app_settings where workspace = p_workspace),
    0
  );
$$;

create function public.effective_budget_allocation(p_workspace text, p_budget_item_id bigint, p_month date)
returns numeric
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (select amount_usd
     from public.budget_allocations
     where workspace = p_workspace
       and budget_item_id = p_budget_item_id
       and (month_start = date_trunc('month', p_month)::date
         or (recurring and month_start < date_trunc('month', p_month)::date))
     order by month_start desc
     limit 1),
    (select monthly_limit_usd from public.budget_items where id = p_budget_item_id and workspace = p_workspace),
    0
  );
$$;

create function public.validate_monthly_budget_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  allocated numeric;
begin
  select coalesce(sum(public.effective_budget_allocation(new.workspace, item.id, new.month_start)), 0)
  into allocated
  from public.budget_items item
  where item.workspace = new.workspace and item.active;

  if allocated > new.amount_usd then
    raise exception 'Monthly budget cannot be below active category allocations (% allocated).', allocated;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create function public.validate_budget_allocation_total()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  total_allocated numeric;
  overall_budget numeric;
begin
  if not exists (select 1 from public.budget_items where id = new.budget_item_id and workspace = new.workspace) then
    raise exception 'Budget item does not belong to this workspace.';
  end if;

  select coalesce(sum(
    case when item.id = new.budget_item_id then new.amount_usd
         else public.effective_budget_allocation(new.workspace, item.id, new.month_start)
    end
  ), 0)
  into total_allocated
  from public.budget_items item
  where item.workspace = new.workspace and item.active;

  overall_budget := public.effective_monthly_budget(new.workspace, new.month_start);
  if total_allocated > overall_budget then
    raise exception 'Category budgets total % exceeds the monthly budget of %.', total_allocated, overall_budget;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger monthly_budget_total_guard
before insert or update on public.monthly_budgets
for each row execute function public.validate_monthly_budget_total();

create trigger budget_allocation_total_guard
before insert or update on public.budget_allocations
for each row execute function public.validate_budget_allocation_total();

insert into public.monthly_budgets (workspace, month_start, amount_usd, recurring)
select settings.workspace, date_trunc('month', current_date)::date,
  greatest(settings.monthly_budget_usd, coalesce(allocations.total, 0)), true
from public.app_settings settings
left join lateral (
  select sum(monthly_limit_usd) as total
  from public.budget_items
  where workspace = settings.workspace and active
) allocations on true
on conflict (workspace, month_start) do nothing;

insert into public.budget_allocations (workspace, budget_item_id, month_start, amount_usd, recurring)
select workspace, id, date_trunc('month', current_date)::date, monthly_limit_usd, true
from public.budget_items
on conflict (workspace, budget_item_id, month_start) do nothing;

create function public.set_monthly_budget(p_workspace text, p_month date, p_amount numeric, p_recurring boolean)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare result_id bigint;
begin
  insert into public.monthly_budgets (workspace, month_start, amount_usd, recurring)
  values (p_workspace, date_trunc('month', p_month)::date, p_amount, p_recurring)
  on conflict (workspace, month_start) do update
    set amount_usd = excluded.amount_usd, recurring = excluded.recurring, updated_at = now()
  returning id into result_id;

  update public.app_settings
  set monthly_budget_usd = p_amount, updated_at = now()
  where workspace = p_workspace and date_trunc('month', p_month)::date = date_trunc('month', current_date)::date;
  return result_id;
end;
$$;

create function public.create_budget_with_allocation(
  p_workspace text, p_name text, p_category_id bigint, p_month date, p_amount numeric, p_recurring boolean
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare result_id bigint;
begin
  insert into public.budget_items (workspace, name, category_id, monthly_limit_usd)
  values (p_workspace, p_name, p_category_id, p_amount)
  returning id into result_id;

  insert into public.budget_allocations (workspace, budget_item_id, month_start, amount_usd, recurring)
  values (p_workspace, result_id, date_trunc('month', p_month)::date, p_amount, p_recurring);
  return result_id;
end;
$$;

revoke execute on function public.effective_monthly_budget(text, date) from public;
revoke execute on function public.effective_budget_allocation(text, bigint, date) from public;
revoke execute on function public.set_monthly_budget(text, date, numeric, boolean) from public;
revoke execute on function public.create_budget_with_allocation(text, text, bigint, date, numeric, boolean) from public;
grant execute on function public.effective_monthly_budget(text, date) to anon;
grant execute on function public.effective_budget_allocation(text, bigint, date) to anon;
grant execute on function public.set_monthly_budget(text, date, numeric, boolean) to anon;
grant execute on function public.create_budget_with_allocation(text, text, bigint, date, numeric, boolean) to anon;
