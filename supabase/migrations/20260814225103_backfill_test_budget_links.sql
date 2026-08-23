update public.transactions as transactions
set budget_item_id = budget_items.id
from public.budget_items as budget_items
where transactions.workspace = 'test'
  and transactions.kind = 'expense'
  and transactions.budget_item_id is null
  and budget_items.workspace = transactions.workspace
  and budget_items.name = transactions.category;
