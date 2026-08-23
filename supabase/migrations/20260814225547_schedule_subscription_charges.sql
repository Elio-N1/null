create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'null-money-daily-subscriptions',
  '5 1 * * *',
  $$
    select public.process_due_subscriptions('live', current_date);
    select public.process_due_subscriptions('test', current_date);
  $$
);
