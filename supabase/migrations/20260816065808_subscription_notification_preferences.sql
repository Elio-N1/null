alter table public.app_settings
  add column subscription_reminders_enabled boolean not null default true,
  add column subscription_reminder_days integer[] not null default array[7, 3, 1],
  add column browser_notifications boolean not null default false;

create function public.generate_subscription_reminders(p_workspace text, p_as_of date default current_date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  subscription_row public.subscriptions%rowtype;
  reminder_day integer;
  due_date date;
  notice_body text;
  created_count integer := 0;
  reminder_days integer[];
  reminders_enabled boolean;
begin
  if p_workspace not in ('test', 'live') then
    raise exception 'Unknown workspace';
  end if;

  select subscription_reminders_enabled, subscription_reminder_days
  into reminders_enabled, reminder_days
  from public.app_settings
  where workspace = p_workspace;

  if not coalesce(reminders_enabled, true) then
    return 0;
  end if;

  for subscription_row in
    select * from public.subscriptions
    where workspace = p_workspace and active = true
    order by due_day, id
  loop
    due_date := make_date(extract(year from p_as_of)::integer, extract(month from p_as_of)::integer, subscription_row.due_day);
    if due_date < p_as_of then
      due_date := (due_date + interval '1 month')::date;
    end if;

    foreach reminder_day in array coalesce(reminder_days, array[7, 3, 1])
    loop
      if due_date - p_as_of = reminder_day then
        notice_body := subscription_row.name || ' is due on ' || to_char(due_date, 'Mon DD, YYYY') || ' (' || reminder_day || case when reminder_day = 1 then ' day' else ' days' end || ' remaining).';
        if not exists (
          select 1 from public.notifications
          where workspace = p_workspace
            and title = 'Upcoming subscription'
            and body = notice_body
        ) then
          insert into public.notifications (workspace, title, body, type, action_target)
          values (p_workspace, 'Upcoming subscription', notice_body, 'warning', 'Subscriptions');
          created_count := created_count + 1;
        end if;
      end if;
    end loop;
  end loop;

  return created_count;
end;
$$;

revoke execute on function public.generate_subscription_reminders(text, date) from public;
grant execute on function public.generate_subscription_reminders(text, date) to anon;

select cron.schedule(
  'null-money-daily-subscriptions',
  '5 1 * * *',
  $$
    select public.generate_subscription_reminders('live', current_date);
    select public.generate_subscription_reminders('test', current_date);
    select public.process_due_subscriptions('live', current_date);
    select public.process_due_subscriptions('test', current_date);
  $$
);
