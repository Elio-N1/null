alter table public.app_settings add column workspace text;
update public.app_settings set workspace = 'test';
alter table public.app_settings alter column workspace set not null;
alter table public.app_settings add constraint app_settings_workspace_check check (workspace in ('test', 'live'));
alter table public.app_settings drop constraint app_settings_pkey;
alter table public.app_settings add constraint app_settings_pkey primary key (workspace);

alter table public.exchange_rates add column workspace text;
update public.exchange_rates set workspace = 'test';
alter table public.exchange_rates alter column workspace set not null;
alter table public.exchange_rates add constraint exchange_rates_workspace_check check (workspace in ('test', 'live'));

alter table public.transactions add column workspace text;
update public.transactions set workspace = 'test';
alter table public.transactions alter column workspace set not null;
alter table public.transactions add constraint transactions_workspace_check check (workspace in ('test', 'live'));

alter table public.notifications add column workspace text;
update public.notifications set workspace = 'test';
alter table public.notifications alter column workspace set not null;
alter table public.notifications add constraint notifications_workspace_check check (workspace in ('test', 'live'));

alter table public.managed_items add column workspace text;
update public.managed_items set workspace = 'test';
alter table public.managed_items alter column workspace set not null;
alter table public.managed_items add constraint managed_items_workspace_check check (workspace in ('test', 'live'));

insert into public.app_settings (
  id,
  workspace,
  exchange_rate_lbp_per_usd,
  base_currency,
  opening_balance_usd,
  monthly_budget_usd
) values (true, 'live', 89500, 'USD', 0, 0);

insert into public.exchange_rates (workspace, lbp_per_usd, note)
values ('live', 89500, 'Initial live workspace rate');

drop index if exists public.transactions_date_idx;
drop index if exists public.transactions_category_idx;
drop index if exists public.exchange_rates_effective_idx;
drop index if exists public.notifications_unread_idx;
drop index if exists public.managed_items_section_idx;

create index transactions_workspace_date_idx on public.transactions (workspace, transaction_date desc, created_at desc);
create index transactions_workspace_category_idx on public.transactions (workspace, category);
create index exchange_rates_workspace_effective_idx on public.exchange_rates (workspace, effective_at desc);
create index notifications_workspace_unread_idx on public.notifications (workspace, created_at desc) where read_at is null;
create index managed_items_workspace_section_idx on public.managed_items (workspace, section, created_at);

drop function if exists public.set_exchange_rate(numeric);

create function public.set_exchange_rate(p_workspace text, p_rate numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_workspace not in ('test', 'live') then
    raise exception 'Unknown workspace';
  end if;

  if p_rate is null or p_rate <= 0 then
    raise exception 'Exchange rate must be greater than zero';
  end if;

  update public.app_settings
  set exchange_rate_lbp_per_usd = p_rate,
      updated_at = now()
  where workspace = p_workspace;

  if not found then
    raise exception 'Workspace settings not found';
  end if;

  insert into public.exchange_rates (workspace, lbp_per_usd, note)
  values (p_workspace, p_rate, 'Updated from budget app');

  insert into public.notifications (workspace, title, body, type, action_target)
  values (
    p_workspace,
    'Exchange rate updated',
    'New transactions will use 1 USD = ' || trim(to_char(p_rate, 'FM999,999,999,990.######')) || ' LBP. Historical entries were not changed.',
    'info',
    'Settings'
  );

  return p_rate;
end;
$$;

revoke execute on function public.set_exchange_rate(text, numeric) from public;
grant execute on function public.set_exchange_rate(text, numeric) to anon;
