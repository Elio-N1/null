create table public.app_settings (
  id boolean primary key default true check (id),
  exchange_rate_lbp_per_usd numeric(18,6) not null check (exchange_rate_lbp_per_usd > 0),
  base_currency text not null default 'USD' check (base_currency in ('USD', 'LBP')),
  opening_balance_usd numeric(14,2) not null default 9000,
  monthly_budget_usd numeric(14,2) not null default 6400 check (monthly_budget_usd >= 0),
  updated_at timestamptz not null default now()
);

create table public.exchange_rates (
  id bigint generated always as identity primary key,
  lbp_per_usd numeric(18,6) not null check (lbp_per_usd > 0),
  effective_at timestamptz not null default now(),
  note text not null default 'Manual update',
  created_at timestamptz not null default now()
);

create table public.transactions (
  id bigint generated always as identity primary key,
  name text not null check (length(trim(name)) between 1 and 120),
  category text not null check (length(trim(category)) between 1 and 80),
  transaction_date date not null default current_date,
  kind text not null check (kind in ('expense', 'income')),
  original_amount numeric(18,2) not null check (original_amount > 0),
  original_currency text not null check (original_currency in ('USD', 'LBP')),
  exchange_rate_lbp_per_usd numeric(18,6) not null check (exchange_rate_lbp_per_usd > 0),
  amount_usd numeric(18,2) not null,
  notes text not null default '',
  created_at timestamptz not null default now(),
  check ((kind = 'expense' and amount_usd < 0) or (kind = 'income' and amount_usd > 0))
);

create table public.notifications (
  id bigint generated always as identity primary key,
  title text not null check (length(trim(title)) between 1 and 120),
  body text not null default '',
  type text not null default 'info' check (type in ('info', 'success', 'warning')),
  action_target text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.managed_items (
  id bigint generated always as identity primary key,
  section text not null check (section in ('Accounts', 'Budgets', 'Goals', 'Categories', 'Subscriptions', 'Investments', 'Settings')),
  name text not null check (length(trim(name)) between 1 and 120),
  detail text not null default 'Unassigned',
  value text not null default '',
  progress integer not null default 0 check (progress between 0 and 100),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index transactions_date_idx on public.transactions (transaction_date desc, created_at desc);
create index transactions_category_idx on public.transactions (category);
create index exchange_rates_effective_idx on public.exchange_rates (effective_at desc);
create index notifications_unread_idx on public.notifications (created_at desc) where read_at is null;
create index managed_items_section_idx on public.managed_items (section, created_at);

alter table public.app_settings enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.transactions enable row level security;
alter table public.notifications enable row level security;
alter table public.managed_items enable row level security;

grant select, insert, update, delete on table public.app_settings to anon;
grant select, insert, update, delete on table public.exchange_rates to anon;
grant select, insert, update, delete on table public.transactions to anon;
grant select, insert, update, delete on table public.notifications to anon;
grant select, insert, update, delete on table public.managed_items to anon;
grant usage, select on all sequences in schema public to anon;

create policy "personal app settings access" on public.app_settings for all to anon using (true) with check (true);
create policy "personal exchange rates access" on public.exchange_rates for all to anon using (true) with check (true);
create policy "personal transactions access" on public.transactions for all to anon using (true) with check (true);
create policy "personal notifications access" on public.notifications for all to anon using (true) with check (true);
create policy "personal managed items access" on public.managed_items for all to anon using (true) with check (true);

insert into public.app_settings (exchange_rate_lbp_per_usd) values (89500);
insert into public.exchange_rates (lbp_per_usd, note) values (89500, 'Initial configured rate');

insert into public.transactions (name, category, transaction_date, kind, original_amount, original_currency, exchange_rate_lbp_per_usd, amount_usd) values
  ('Carrefour Verdun', 'Food & dining', '2026-08-16', 'expense', 48.75, 'USD', 89500, -48.75),
  ('Salary · Main job', 'Income', '2026-08-15', 'income', 3900, 'USD', 89500, 3900),
  ('Netflix', 'Entertainment', '2026-08-14', 'expense', 11.99, 'USD', 89500, -11.99),
  ('Touch mobile', 'Utilities', '2026-08-13', 'expense', 26.50, 'USD', 89500, -26.50),
  ('Classy Café', 'Food & dining', '2026-08-12', 'expense', 12.40, 'USD', 89500, -12.40);

insert into public.notifications (title, body, type, action_target) values
  ('Your ledger is ready', 'Supabase persistence is connected and your starting records were imported.', 'success', 'Transactions'),
  ('Budget check', 'Housing has reached 78% of its monthly limit.', 'warning', 'Budgets');

insert into public.managed_items (section, name, detail, value, progress) values
  ('Accounts', 'Main checking', 'Checking · USD', '$8,420.60', 72), ('Accounts', 'Emergency fund', 'Savings · USD', '$4,420.00', 48),
  ('Budgets', 'Essentials', 'Monthly', '$4,200', 74), ('Budgets', 'Flexible spending', 'Monthly', '$1,400', 52),
  ('Goals', 'Emergency reserve', 'Dec 2026', '$10,000', 82), ('Goals', 'Japan trip', 'Apr 2027', '$4,500', 46), ('Goals', 'New studio', 'Sep 2027', '$18,000', 21),
  ('Categories', 'Housing', 'Essential', '$2,500', 78), ('Categories', 'Food & dining', 'Lifestyle', '$900', 69), ('Categories', 'Transport', 'Essential', '$500', 56),
  ('Subscriptions', 'Netflix', 'Aug 19', '$11.99', 70), ('Subscriptions', 'Spotify', 'Aug 22', '$10.99', 44), ('Subscriptions', 'iCloud+', 'Aug 28', '$2.99', 25),
  ('Investments', 'S&P 500 ETF', 'Equity', '$12,480', 68), ('Investments', 'Bitcoin', 'Digital asset', '$6,920', 41), ('Investments', 'Treasury fund', 'Fixed income', '$5,480', 54),
  ('Settings', 'Budget alerts', 'Notification', 'ON', 100), ('Settings', 'Weekly summary', 'Email', 'ON', 100);
