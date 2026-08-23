alter table public.notifications add column dedupe_key text;

delete from public.notifications duplicate
using public.notifications keeper
where duplicate.workspace = keeper.workspace
  and duplicate.title = 'Upcoming subscription'
  and keeper.title = duplicate.title
  and duplicate.body = keeper.body
  and duplicate.id > keeper.id;

create unique index notifications_workspace_dedupe_idx
on public.notifications (workspace, dedupe_key)
where dedupe_key is not null;

create or replace function public.generate_subscription_reminders(p_workspace text, p_as_of date default current_date)
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
  notice_key text;
  created_count integer := 0;
  affected_count integer;
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
        notice_key := 'subscription:' || subscription_row.id || ':' || due_date || ':' || reminder_day;
        insert into public.notifications (workspace, title, body, type, action_target, dedupe_key)
        values (p_workspace, 'Upcoming subscription', notice_body, 'warning', 'Subscriptions', notice_key)
        on conflict (workspace, dedupe_key) where dedupe_key is not null do nothing;
        get diagnostics affected_count = row_count;
        created_count := created_count + affected_count;
      end if;
    end loop;
  end loop;

  return created_count;
end;
$$;
