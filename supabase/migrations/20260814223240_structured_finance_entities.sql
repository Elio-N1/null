create table public.accounts (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  name text not null check (length(trim(name)) between 1 and 120),
  account_type text not null default 'Checking' check (account_type in ('Cash', 'Checking', 'Savings', 'Wallet', 'Other')),
  currency text not null default 'USD' check (currency in ('USD', 'LBP')),
  original_balance numeric(18,2) not null default 0,
  exchange_rate_lbp_per_usd numeric(18,6) not null check (exchange_rate_lbp_per_usd > 0),
  starting_balance_usd numeric(18,2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.categories (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  name text not null check (length(trim(name)) between 1 and 80),
  category_group text not null default 'Flexible' check (category_group in ('Essential', 'Flexible', 'Financial', 'Lifestyle', 'Other')),
  is_default boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index categories_workspace_name_idx on public.categories (workspace, lower(name));

create table public.budget_items (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  name text not null check (length(trim(name)) between 1 and 120),
  category_id bigint references public.categories(id) on delete set null,
  monthly_limit_usd numeric(18,2) not null default 0 check (monthly_limit_usd >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.goals (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  name text not null check (length(trim(name)) between 1 and 120),
  target_amount_usd numeric(18,2) not null default 0 check (target_amount_usd >= 0),
  saved_amount_usd numeric(18,2) not null default 0 check (saved_amount_usd >= 0),
  target_date date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id bigint generated always as identity primary key,
  workspace text not null check (workspace in ('test', 'live')),
  name text not null check (length(trim(name)) between 1 and 120),
  original_amount numeric(18,2) not null check (original_amount > 0),
  original_currency text not null check (original_currency in ('USD', 'LBP')),
  exchange_rate_lbp_per_usd numeric(18,6) not null check (exchange_rate_lbp_per_usd > 0),
  amount_usd numeric(18,2) not null check (amount_usd > 0),
  due_day integer not null check (due_day between 1 and 28),
  account_id bigint not null references public.accounts(id) on delete restrict,
  budget_item_id bigint references public.budget_items(id) on delete set null,
  active boolean not null default true,
  last_charged_month date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.transactions
  add column account_id bigint references public.accounts(id) on delete restrict,
  add column budget_item_id bigint references public.budget_items(id) on delete set null,
  add column subscription_id bigint references public.subscriptions(id) on delete set null;

create index accounts_workspace_active_idx on public.accounts (workspace, active, created_at);
create index categories_workspace_active_idx on public.categories (workspace, active, created_at);
create index budget_items_workspace_active_idx on public.budget_items (workspace, active, created_at);
create index goals_workspace_active_idx on public.goals (workspace, active, target_date);
create index subscriptions_workspace_due_idx on public.subscriptions (workspace, active, due_day);
create index transactions_workspace_account_idx on public.transactions (workspace, account_id, transaction_date desc);
create index transactions_workspace_budget_idx on public.transactions (workspace, budget_item_id, transaction_date desc);

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.budget_items enable row level security;
alter table public.goals enable row level security;
alter table public.subscriptions enable row level security;

grant select, insert, update, delete on table public.accounts to anon;
grant select, insert, update, delete on table public.categories to anon;
grant select, insert, update, delete on table public.budget_items to anon;
grant select, insert, update, delete on table public.goals to anon;
grant select, insert, update, delete on table public.subscriptions to anon;
grant usage, select on all sequences in schema public to anon;

create policy "personal accounts access" on public.accounts for all to anon using (true) with check (true);
create policy "personal categories access" on public.categories for all to anon using (true) with check (true);
create policy "personal budget items access" on public.budget_items for all to anon using (true) with check (true);
create policy "personal goals access" on public.goals for all to anon using (true) with check (true);
create policy "personal subscriptions access" on public.subscriptions for all to anon using (true) with check (true);

insert into public.categories (workspace, name, category_group, is_default)
select workspace, name, category_group, true
from (values ('test'), ('live')) as workspaces(workspace)
cross join (values
  ('Housing', 'Essential'),
  ('Food & dining', 'Essential'),
  ('Transport', 'Essential'),
  ('Utilities', 'Essential'),
  ('Health', 'Essential'),
  ('Shopping', 'Flexible'),
  ('Entertainment', 'Lifestyle'),
  ('Other', 'Other')
) as defaults(name, category_group);

insert into public.accounts (workspace, name, account_type, currency, original_balance, exchange_rate_lbp_per_usd, starting_balance_usd)
values ('test', 'Main checking', 'Checking', 'USD', 9000, 89500, 9000);

update public.transactions
set account_id = (select id from public.accounts where workspace = 'test' and name = 'Main checking')
where workspace = 'test';

insert into public.budget_items (workspace, name, category_id, monthly_limit_usd)
select 'test', valueset.name, categories.id, valueset.monthly_limit
from (values
  ('Housing', 2500::numeric),
  ('Food & dining', 900::numeric),
  ('Transport', 500::numeric),
  ('Shopping', 800::numeric),
  ('Entertainment', 400::numeric)
) as valueset(name, monthly_limit)
join public.categories on categories.workspace = 'test' and categories.name = valueset.name;

insert into public.goals (workspace, name, target_amount_usd, saved_amount_usd, target_date)
values
  ('test', 'Emergency reserve', 10000, 8200, '2026-12-31'),
  ('test', 'Japan trip', 4500, 2070, '2027-04-30'),
  ('test', 'New studio', 18000, 3780, '2027-09-30');

insert into public.subscriptions (workspace, name, original_amount, original_currency, exchange_rate_lbp_per_usd, amount_usd, due_day, account_id, budget_item_id)
select 'test', valueset.name, valueset.amount, 'USD', 89500, valueset.amount, valueset.due_day, accounts.id, budget_items.id
from (values
  ('Netflix', 11.99::numeric, 19, 'Entertainment'),
  ('Spotify', 10.99::numeric, 22, 'Entertainment'),
  ('iCloud+', 2.99::numeric, 28, null)
) as valueset(name, amount, due_day, budget_name)
join public.accounts on accounts.workspace = 'test' and accounts.name = 'Main checking'
left join public.budget_items on budget_items.workspace = 'test' and budget_items.name = valueset.budget_name;

create function public.process_due_subscriptions(p_workspace text, p_as_of date default current_date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_row public.subscriptions%rowtype;
  charge_date date;
  processed_count integer := 0;
  month_start date := date_trunc('month', p_as_of)::date;
begin
  if p_workspace not in ('test', 'live') then
    raise exception 'Unknown workspace';
  end if;

  for subscription_row in
    select *
    from public.subscriptions
    where workspace = p_workspace
      and active = true
      and due_day <= extract(day from p_as_of)
      and (last_charged_month is null or last_charged_month < month_start)
    order by due_day, id
    for update skip locked
  loop
    charge_date := make_date(extract(year from p_as_of)::integer, extract(month from p_as_of)::integer, subscription_row.due_day);

    insert into public.transactions (
      workspace, name, category, transaction_date, kind, original_amount, original_currency,
      exchange_rate_lbp_per_usd, amount_usd, notes, account_id, budget_item_id, subscription_id
    ) values (
      p_workspace,
      subscription_row.name,
      coalesce((select c.name from public.budget_items b left join public.categories c on c.id = b.category_id where b.id = subscription_row.budget_item_id), 'Subscriptions'),
      charge_date,
      'expense',
      subscription_row.original_amount,
      subscription_row.original_currency,
      subscription_row.exchange_rate_lbp_per_usd,
      -subscription_row.amount_usd,
      'Automatic monthly subscription charge',
      subscription_row.account_id,
      subscription_row.budget_item_id,
      subscription_row.id
    );

    update public.subscriptions
    set last_charged_month = month_start, updated_at = now()
    where id = subscription_row.id;

    insert into public.notifications (workspace, title, body, type, action_target)
    values (
      p_workspace,
      'Subscription charged',
      subscription_row.name || ' was deducted automatically on ' || to_char(charge_date, 'Mon DD') || '.',
      'info',
      'Subscriptions'
    );

    processed_count := processed_count + 1;
  end loop;

  return processed_count;
end;
$$;

revoke execute on function public.process_due_subscriptions(text, date) from public;
grant execute on function public.process_due_subscriptions(text, date) to anon;
