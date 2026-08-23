create or replace function public.set_exchange_rate(p_rate numeric)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_rate is null or p_rate <= 0 then
    raise exception 'Exchange rate must be greater than zero';
  end if;

  update public.app_settings
  set exchange_rate_lbp_per_usd = p_rate,
      updated_at = now()
  where id = true;

  insert into public.exchange_rates (lbp_per_usd, note)
  values (p_rate, 'Updated from budget app');

  insert into public.notifications (title, body, type, action_target)
  values (
    'Exchange rate updated',
    'New transactions will use 1 USD = ' || trim(to_char(p_rate, 'FM999,999,999,990.######')) || ' LBP. Historical entries were not changed.',
    'info',
    'Settings'
  );

  return p_rate;
end;
$$;

revoke execute on function public.set_exchange_rate(numeric) from public;
grant execute on function public.set_exchange_rate(numeric) to anon;
