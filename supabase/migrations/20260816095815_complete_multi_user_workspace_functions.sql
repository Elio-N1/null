create or replace function public.delete_user_workspace(p_workspace text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.clear_user_workspace(p_workspace);
  delete from public.exchange_rates where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.app_settings where user_id = (select auth.uid()) and workspace = p_workspace;
  delete from public.user_workspaces where user_id = (select auth.uid()) and slug = p_workspace;
end $$;

create or replace function public.process_due_subscriptions(p_workspace text, p_as_of date default current_date)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  subscription_row public.subscriptions%rowtype;
  charge_date date;
  processed_count integer := 0;
  month_start date := date_trunc('month', p_as_of)::date;
begin
  for subscription_row in
    select * from public.subscriptions
    where workspace = p_workspace and active = true and due_day <= extract(day from p_as_of)
      and (last_charged_month is null or last_charged_month < month_start)
    order by due_day, id for update skip locked
  loop
    charge_date := make_date(extract(year from p_as_of)::integer, extract(month from p_as_of)::integer, subscription_row.due_day);
    insert into public.transactions (
      user_id, workspace, name, category, transaction_date, kind, original_amount,
      original_currency, exchange_rate_lbp_per_usd, amount_usd, notes, account_id,
      budget_item_id, subscription_id
    ) values (
      (select auth.uid()), p_workspace, subscription_row.name,
      coalesce((select c.name from public.budget_items b left join public.categories c on c.id = b.category_id where b.id = subscription_row.budget_item_id), 'Subscriptions'),
      charge_date, 'expense', subscription_row.original_amount, subscription_row.original_currency,
      subscription_row.exchange_rate_lbp_per_usd, -subscription_row.amount_usd,
      'Automatic monthly subscription charge', subscription_row.account_id,
      subscription_row.budget_item_id, subscription_row.id
    );
    update public.subscriptions set last_charged_month = month_start, updated_at = now() where id = subscription_row.id;
    insert into public.notifications (user_id, workspace, title, body, type, action_target)
    values ((select auth.uid()), p_workspace, 'Subscription charged', subscription_row.name || ' was deducted automatically on ' || to_char(charge_date, 'Mon DD') || '.', 'info', 'Subscriptions');
    processed_count := processed_count + 1;
  end loop;
  return processed_count;
end $$;

revoke all on function public.delete_user_workspace(text) from public, anon;
revoke all on function public.process_due_subscriptions(text, date) from public, anon;
grant execute on function public.delete_user_workspace(text) to authenticated;
grant execute on function public.process_due_subscriptions(text, date) to authenticated;
