-- Test-only fixture reconciliation. Live data is intentionally untouched.
delete from public.goal_contributions where workspace = 'test';

with ranked as (
  select id, row_number() over (order by id) as position
  from public.goals where workspace = 'test'
), fixture as (
  select id, case position when 1 then 800::numeric when 2 then 450::numeric else 250::numeric end as amount
  from ranked
)
update public.goals g set saved_amount_usd = fixture.amount, updated_at = now()
from fixture where fixture.id = g.id;

insert into public.goal_contributions (workspace, goal_id, contribution_date, amount_usd, note)
select 'test', id, current_date, saved_amount_usd, 'Coherent test opening reserve'
from public.goals where workspace = 'test' and saved_amount_usd > 0;

update public.monthly_budgets month
set amount_usd = allocations.total, updated_at = now()
from (
  select workspace, month_start, sum(amount_usd + moved_in_usd - moved_out_usd + rollover_usd) total
  from public.budget_allocations where workspace = 'test' group by workspace, month_start
) allocations
where month.workspace = allocations.workspace and month.month_start = allocations.month_start;
