-- NULL Money core finance rebuild. This migration is intentionally additive so
-- existing live ledger rows remain valid while the UI moves to funded months.

drop trigger if exists monthly_budget_total_guard on public.monthly_budgets;
drop trigger if exists budget_allocation_total_guard on public.budget_allocations;

alter table public.monthly_budgets
  add column if not exists status text not null default 'active'
    check (status in ('draft', 'active', 'closed', 'reopened')),
  add column if not exists savings_target_usd numeric(18,2) not null default 0 check (savings_target_usd >= 0),
  add column if not exists next_month_target_usd numeric(18,2) not null default 0 check (next_month_target_usd >= 0),
  add column if not exists closed_at timestamptz,
  add column if not exists closing_balance_usd numeric(18,2),
  add column if not exists closing_income_usd numeric(18,2),
  add column if not exists closing_expense_usd numeric(18,2),
  add column if not exists closing_savings_usd numeric(18,2),
  add column if not exists closing_variance_usd numeric(18,2),
  add column if not exists reopen_count integer not null default 0 check (reopen_count >= 0);

alter table public.budget_allocations
  add column if not exists moved_in_usd numeric(18,2) not null default 0 check (moved_in_usd >= 0),
  add column if not exists moved_out_usd numeric(18,2) not null default 0 check (moved_out_usd >= 0),
  add column if not exists rollover_usd numeric(18,2) not null default 0;

alter table public.transactions add column if not exists updated_at timestamptz not null default now();

create table public.goal_contributions (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  goal_id bigint not null references public.goals(id) on delete cascade,
  contribution_date date not null default current_date,
  amount_usd numeric(18,2) not null check (amount_usd <> 0),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table public.account_transfers (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  from_account_id bigint not null references public.accounts(id) on delete restrict,
  to_account_id bigint not null references public.accounts(id) on delete restrict,
  transfer_date date not null default current_date,
  amount_usd numeric(18,2) not null check (amount_usd > 0),
  original_amount numeric(18,2) not null check (original_amount > 0),
  original_currency text not null check (original_currency in ('USD', 'LBP')),
  exchange_rate_lbp_per_usd numeric(18,6) not null check (exchange_rate_lbp_per_usd > 0),
  note text not null default '',
  created_at timestamptz not null default now(),
  check (from_account_id <> to_account_id)
);

create table public.month_close_distributions (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  monthly_budget_id bigint not null references public.monthly_budgets(id) on delete cascade,
  distribution_type text not null check (distribution_type in ('balance', 'next_month', 'goal', 'deficit')),
  goal_id bigint references public.goals(id) on delete restrict,
  amount_usd numeric(18,2) not null check (amount_usd >= 0),
  created_at timestamptz not null default now(),
  check ((distribution_type = 'goal' and goal_id is not null) or (distribution_type <> 'goal' and goal_id is null))
);

create table public.budget_reallocations (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  month_start date not null,
  from_budget_item_id bigint references public.budget_items(id) on delete restrict,
  to_budget_item_id bigint not null references public.budget_items(id) on delete restrict,
  amount_usd numeric(18,2) not null check (amount_usd > 0),
  created_at timestamptz not null default now(),
  check (from_budget_item_id is null or from_budget_item_id <> to_budget_item_id)
);

create index goal_contributions_workspace_goal_idx on public.goal_contributions (workspace, goal_id, contribution_date);
create index account_transfers_workspace_date_idx on public.account_transfers (workspace, transfer_date desc);
create index month_close_distributions_month_idx on public.month_close_distributions (workspace, monthly_budget_id);
create index budget_reallocations_month_idx on public.budget_reallocations (workspace, month_start);

alter table public.goal_contributions enable row level security;
alter table public.account_transfers enable row level security;
alter table public.month_close_distributions enable row level security;
alter table public.budget_reallocations enable row level security;

grant select, insert, update, delete on table public.goal_contributions to anon;
grant select, insert, update, delete on table public.account_transfers to anon;
grant select, insert, update, delete on table public.month_close_distributions to anon;
grant select, insert, update, delete on table public.budget_reallocations to anon;
grant usage, select on all sequences in schema public to anon;

create policy "personal goal contribution access" on public.goal_contributions for all to anon using (true) with check (true);
create policy "personal transfer access" on public.account_transfers for all to anon using (true) with check (true);
create policy "personal month close access" on public.month_close_distributions for all to anon using (true) with check (true);
create policy "personal reallocation access" on public.budget_reallocations for all to anon using (true) with check (true);

-- Preserve existing goal progress as an opening virtual reserve. These records
-- do not change any account balance; they make the previously displayed amount auditable.
insert into public.goal_contributions (workspace, goal_id, contribution_date, amount_usd, note)
select workspace, id, current_date, saved_amount_usd, 'Opening reserve migrated from goal progress'
from public.goals
where saved_amount_usd > 0
  and not exists (select 1 from public.goal_contributions c where c.goal_id = goals.id);

create or replace function public.workspace_liquid_balance(p_workspace text)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce((select sum(a.starting_balance_usd) from public.accounts a where a.workspace = p_workspace and a.active), 0)
       + coalesce((select sum(t.amount_usd) from public.transactions t where t.workspace = p_workspace), 0);
$$;

create or replace function public.workspace_goal_reserve(p_workspace text)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(c.amount_usd), 0) from public.goal_contributions c where c.workspace = p_workspace;
$$;

create or replace function public.workspace_assigned_reserve(p_workspace text)
returns numeric language sql stable security invoker set search_path = '' as $$
  select coalesce(sum(greatest(0,
    a.amount_usd + a.moved_in_usd - a.moved_out_usd + a.rollover_usd - coalesce(spent.total, 0)
  )), 0)
  from public.budget_allocations a
  join public.monthly_budgets m on m.workspace = a.workspace and m.month_start = a.month_start and m.status <> 'closed'
  left join lateral (
    select sum(abs(t.amount_usd)) total from public.transactions t
    where t.workspace = a.workspace and t.budget_item_id = a.budget_item_id and t.kind = 'expense'
      and date_trunc('month', t.transaction_date)::date = a.month_start
  ) spent on true
  where a.workspace = p_workspace;
$$;

create or replace function public.workspace_unallocated_cash(p_workspace text)
returns numeric language sql stable security invoker set search_path = '' as $$
  select public.workspace_liquid_balance(p_workspace)
       - public.workspace_goal_reserve(p_workspace)
       - public.workspace_assigned_reserve(p_workspace);
$$;

create or replace function public.allocate_budget_money(
  p_workspace text, p_month date, p_budget_item_id bigint, p_amount numeric, p_recurring boolean default false
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint; delta numeric; current_amount numeric; available numeric;
begin
  if p_amount < 0 then raise exception 'Allocation must be zero or greater.'; end if;
  if not exists (select 1 from public.budget_items where id = p_budget_item_id and workspace = p_workspace and active) then raise exception 'Budget item is unavailable.'; end if;
  select coalesce(amount_usd, 0) into current_amount from public.budget_allocations
    where workspace = p_workspace and budget_item_id = p_budget_item_id and month_start = date_trunc('month', p_month)::date;
  delta := p_amount - coalesce(current_amount, 0);
  available := public.workspace_unallocated_cash(p_workspace);
  if delta > available then raise exception 'Only % is unallocated.', available; end if;
  insert into public.monthly_budgets (workspace, month_start, amount_usd, recurring, status)
    values (p_workspace, date_trunc('month', p_month)::date, p_amount, false, 'draft')
    on conflict (workspace, month_start) do nothing;
  insert into public.budget_allocations (workspace, budget_item_id, month_start, amount_usd, recurring)
    values (p_workspace, p_budget_item_id, date_trunc('month', p_month)::date, p_amount, p_recurring)
    on conflict (workspace, budget_item_id, month_start) do update set amount_usd = excluded.amount_usd, recurring = excluded.recurring, updated_at = now()
    returning id into result_id;
  update public.monthly_budgets set amount_usd = (
    select coalesce(sum(amount_usd + moved_in_usd - moved_out_usd + rollover_usd),0) from public.budget_allocations
    where workspace = p_workspace and month_start = date_trunc('month', p_month)::date
  ), status = case when status = 'closed' then 'reopened' else status end, updated_at = now()
  where workspace = p_workspace and month_start = date_trunc('month', p_month)::date;
  return result_id;
end; $$;

create or replace function public.move_budget_money(
  p_workspace text, p_month date, p_from_budget_item_id bigint, p_to_budget_item_id bigint, p_amount numeric
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint; source_available numeric;
begin
  if p_amount <= 0 or p_from_budget_item_id = p_to_budget_item_id then raise exception 'Enter a valid reallocation.'; end if;
  select a.amount_usd + a.moved_in_usd - a.moved_out_usd + a.rollover_usd - coalesce(sum(abs(t.amount_usd)),0)
  into source_available
  from public.budget_allocations a left join public.transactions t on t.workspace = a.workspace and t.budget_item_id = a.budget_item_id and t.kind = 'expense' and date_trunc('month',t.transaction_date)::date = a.month_start
  where a.workspace = p_workspace and a.budget_item_id = p_from_budget_item_id and a.month_start = date_trunc('month',p_month)::date
  group by a.id;
  if coalesce(source_available,0) < p_amount then raise exception 'Source category only has % available.', coalesce(source_available,0); end if;
  update public.budget_allocations set moved_out_usd = moved_out_usd + p_amount, updated_at = now()
    where workspace = p_workspace and budget_item_id = p_from_budget_item_id and month_start = date_trunc('month',p_month)::date;
  update public.budget_allocations set moved_in_usd = moved_in_usd + p_amount, updated_at = now()
    where workspace = p_workspace and budget_item_id = p_to_budget_item_id and month_start = date_trunc('month',p_month)::date;
  if not found then raise exception 'Destination category must be assigned before receiving money.'; end if;
  insert into public.budget_reallocations (workspace, month_start, from_budget_item_id, to_budget_item_id, amount_usd)
    values (p_workspace,date_trunc('month',p_month)::date,p_from_budget_item_id,p_to_budget_item_id,p_amount) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.contribute_to_goal(p_workspace text, p_goal_id bigint, p_amount numeric, p_note text default '')
returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint; available numeric; reserved numeric; target numeric;
begin
  if p_amount = 0 then raise exception 'Contribution cannot be zero.'; end if;
  select target_amount_usd into target from public.goals where id = p_goal_id and workspace = p_workspace and active;
  if target is null then raise exception 'Goal is unavailable.'; end if;
  available := public.workspace_unallocated_cash(p_workspace);
  select coalesce(sum(amount_usd),0) into reserved from public.goal_contributions where workspace = p_workspace and goal_id = p_goal_id;
  if p_amount > available then raise exception 'Only % is unallocated.', available; end if;
  if reserved + p_amount < 0 or reserved + p_amount > target then raise exception 'Goal reserve must remain between zero and its target.'; end if;
  insert into public.goal_contributions (workspace,goal_id,amount_usd,note) values (p_workspace,p_goal_id,p_amount,p_note) returning id into result_id;
  update public.goals set saved_amount_usd = reserved + p_amount, updated_at = now() where id = p_goal_id and workspace = p_workspace;
  return result_id;
end; $$;

create or replace function public.create_account_transfer(
  p_workspace text, p_from_account_id bigint, p_to_account_id bigint, p_date date,
  p_original_amount numeric, p_original_currency text, p_rate numeric, p_note text default ''
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint; amount_usd numeric;
begin
  if p_original_amount <= 0 or p_rate <= 0 or p_from_account_id = p_to_account_id then raise exception 'Enter a valid transfer.'; end if;
  if not exists (select 1 from public.accounts where id = p_from_account_id and workspace = p_workspace and active) or
     not exists (select 1 from public.accounts where id = p_to_account_id and workspace = p_workspace and active) then raise exception 'Transfer accounts are unavailable.'; end if;
  amount_usd := case when p_original_currency = 'LBP' then p_original_amount / p_rate else p_original_amount end;
  insert into public.account_transfers (workspace,from_account_id,to_account_id,transfer_date,amount_usd,original_amount,original_currency,exchange_rate_lbp_per_usd,note)
    values (p_workspace,p_from_account_id,p_to_account_id,p_date,amount_usd,p_original_amount,p_original_currency,p_rate,p_note) returning id into result_id;
  return result_id;
end; $$;

create or replace function public.close_budget_month(
  p_workspace text, p_month date, p_to_balance numeric, p_to_next_month numeric, p_goal_id bigint default null, p_to_goal numeric default 0
) returns bigint language plpgsql security invoker set search_path = '' as $$
declare month_id bigint; income numeric; expense numeric; funded numeric; remaining numeric; balance numeric;
begin
  select id,amount_usd into month_id,funded from public.monthly_budgets where workspace=p_workspace and month_start=date_trunc('month',p_month)::date for update;
  if month_id is null then raise exception 'Budget month does not exist.'; end if;
  select coalesce(sum(case when kind='income' then amount_usd else 0 end),0),coalesce(sum(case when kind='expense' then abs(amount_usd) else 0 end),0)
    into income,expense from public.transactions where workspace=p_workspace and date_trunc('month',transaction_date)::date=date_trunc('month',p_month)::date;
  remaining := funded - expense;
  if remaining >= 0 and round(p_to_balance+p_to_next_month+p_to_goal,2) <> round(remaining,2) then raise exception 'Distributions must equal the remaining %.',remaining; end if;
  delete from public.month_close_distributions where monthly_budget_id=month_id;
  if remaining >= 0 then
    if p_to_balance>0 then insert into public.month_close_distributions(workspace,monthly_budget_id,distribution_type,amount_usd) values(p_workspace,month_id,'balance',p_to_balance); end if;
    if p_to_next_month>0 then insert into public.month_close_distributions(workspace,monthly_budget_id,distribution_type,amount_usd) values(p_workspace,month_id,'next_month',p_to_next_month); end if;
    if p_to_goal>0 then
      if p_goal_id is null then raise exception 'Choose a goal for the goal distribution.'; end if;
      insert into public.goal_contributions(workspace,goal_id,contribution_date,amount_usd,note)
        values(p_workspace,p_goal_id,date_trunc('month',p_month)::date,p_to_goal,'Month close');
      update public.goals set saved_amount_usd=saved_amount_usd+p_to_goal,updated_at=now() where id=p_goal_id and workspace=p_workspace;
      insert into public.month_close_distributions(workspace,monthly_budget_id,distribution_type,goal_id,amount_usd) values(p_workspace,month_id,'goal',p_goal_id,p_to_goal);
    end if;
  else insert into public.month_close_distributions(workspace,monthly_budget_id,distribution_type,amount_usd) values(p_workspace,month_id,'deficit',abs(remaining)); end if;
  balance := public.workspace_liquid_balance(p_workspace);
  update public.monthly_budgets set status='closed',closed_at=now(),closing_balance_usd=balance,closing_income_usd=income,closing_expense_usd=expense,closing_savings_usd=income-expense,closing_variance_usd=remaining,updated_at=now() where id=month_id;
  return month_id;
end; $$;

create or replace function public.reopen_budget_month(p_workspace text,p_month date)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint;
begin
  for result_id in select id from public.monthly_budgets where workspace=p_workspace and month_start=date_trunc('month',p_month)::date and status='closed' for update loop
    insert into public.goal_contributions(workspace,goal_id,contribution_date,amount_usd,note)
      select p_workspace,goal_id,current_date,-amount_usd,'Month close reopened' from public.month_close_distributions
      where monthly_budget_id=result_id and distribution_type='goal';
    update public.goals g set saved_amount_usd=greatest(0,g.saved_amount_usd-d.amount_usd),updated_at=now()
      from public.month_close_distributions d where d.monthly_budget_id=result_id and d.distribution_type='goal' and d.goal_id=g.id;
    delete from public.month_close_distributions where monthly_budget_id=result_id;
  end loop;
  update public.monthly_budgets set status='reopened',closed_at=null,reopen_count=reopen_count+1,updated_at=now()
  where workspace=p_workspace and month_start=date_trunc('month',p_month)::date returning id into result_id;
  if result_id is null then raise exception 'Budget month does not exist.'; end if;
  return result_id;
end; $$;

create or replace function public.activate_budget_month(p_workspace text,p_month date)
returns bigint language plpgsql security invoker set search_path = '' as $$
declare result_id bigint;
begin
  update public.monthly_budgets set status='active',updated_at=now()
  where workspace=p_workspace and month_start=date_trunc('month',p_month)::date and status in ('draft','reopened')
  returning id into result_id;
  if result_id is null then raise exception 'Add at least one category allocation before activating this month.'; end if;
  return result_id;
end; $$;

revoke execute on function public.workspace_liquid_balance(text) from public;
revoke execute on function public.workspace_goal_reserve(text) from public;
revoke execute on function public.workspace_assigned_reserve(text) from public;
revoke execute on function public.workspace_unallocated_cash(text) from public;
revoke execute on function public.allocate_budget_money(text,date,bigint,numeric,boolean) from public;
revoke execute on function public.move_budget_money(text,date,bigint,bigint,numeric) from public;
revoke execute on function public.contribute_to_goal(text,bigint,numeric,text) from public;
revoke execute on function public.create_account_transfer(text,bigint,bigint,date,numeric,text,numeric,text) from public;
revoke execute on function public.close_budget_month(text,date,numeric,numeric,bigint,numeric) from public;
revoke execute on function public.reopen_budget_month(text,date) from public;
revoke execute on function public.activate_budget_month(text,date) from public;
grant execute on function public.workspace_liquid_balance(text) to anon;
grant execute on function public.workspace_goal_reserve(text) to anon;
grant execute on function public.workspace_assigned_reserve(text) to anon;
grant execute on function public.workspace_unallocated_cash(text) to anon;
grant execute on function public.allocate_budget_money(text,date,bigint,numeric,boolean) to anon;
grant execute on function public.move_budget_money(text,date,bigint,bigint,numeric) to anon;
grant execute on function public.contribute_to_goal(text,bigint,numeric,text) to anon;
grant execute on function public.create_account_transfer(text,bigint,bigint,date,numeric,text,numeric,text) to anon;
grant execute on function public.close_budget_month(text,date,numeric,numeric,bigint,numeric) to anon;
grant execute on function public.reopen_budget_month(text,date) to anon;
grant execute on function public.activate_budget_month(text,date) to anon;
