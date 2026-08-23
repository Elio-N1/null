import { useMemo, useState } from 'react'
import { ArrowRight, Calendar, TickSquare } from 'react-iconly'
import { activateBudgetMonth, allocateBudgetMoney, closeBudgetMonth, createBudget, moveBudgetMoney, reopenBudgetMonth, type BudgetAllocation, type BudgetItem, type BudgetWorkspace, type Category, type Goal, type MonthlyBudget } from '../lib/budget-api'
import { allocationAvailable, monthSummary } from '../lib/finance'
import type { Transaction } from '../data'
import ConfirmDialog from './ConfirmDialog'
import FormattedNumberInput from './FormattedNumberInput'
import { Glass } from './Glass'

type Props = {
  workspace: BudgetWorkspace
  month: string
  setMonth: (month: string) => void
  monthlyBudgets: MonthlyBudget[]
  allocations: BudgetAllocation[]
  budgets: BudgetItem[]
  categories: Category[]
  goals: Goal[]
  transactions: Transaction[]
  unallocatedCash: number
  onChanged: () => Promise<void>
  onNotice: (message: string) => void
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

export default function PlanModule({ workspace, month, setMonth, monthlyBudgets, allocations, budgets, categories, goals, transactions, unallocatedCash, onChanged, onNotice }: Props) {
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [busy, setBusy] = useState<number | string | null>(null)
  const [error, setError] = useState('')
  const [moveFrom, setMoveFrom] = useState('')
  const [moveTo, setMoveTo] = useState('')
  const [moveAmount, setMoveAmount] = useState('')
  const [closing, setClosing] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [toNext, setToNext] = useState('0')
  const [toGoal, setToGoal] = useState('0')
  const [goalId, setGoalId] = useState('')
  const [addingBudget, setAddingBudget] = useState(false)
  const [newName, setNewName] = useState('')
  const [newCategoryId, setNewCategoryId] = useState('')
  const [newAmount, setNewAmount] = useState('')

  const budgetMonth = monthlyBudgets.find((item) => item.month === month)
  const monthAllocations = allocations.filter((item) => item.month === month)
  const allocationByBudget = useMemo(() => new Map(monthAllocations.map((item) => [item.budgetItemId, item])), [monthAllocations])
  const summary = monthSummary(month, transactions, monthlyBudgets)
  const allocated = monthAllocations.reduce((sum, item) => sum + item.amountUsd + item.movedInUsd - item.movedOutUsd + item.rolloverUsd, 0)
  const remaining = summary.variance
  const deficit = Math.max(0, -remaining)
  const availableForClose = Math.max(0, remaining)
  const nextValue = Math.max(0, Number(toNext) || 0)
  const goalValue = Math.max(0, Number(toGoal) || 0)
  const balanceValue = Math.max(0, availableForClose - nextValue - goalValue)

  const saveAllocation = async (budget: BudgetItem) => {
    const amount = Number(drafts[budget.id] ?? allocationByBudget.get(budget.id)?.amountUsd ?? 0)
    if (!Number.isFinite(amount) || amount < 0) return setError('Enter a valid allocation.')
    setBusy(budget.id); setError('')
    try { await allocateBudgetMoney(workspace, { month, budgetItemId: budget.id, amountUsd: amount, recurring: false }); await onChanged(); onNotice(`${budget.name.toUpperCase()} FUNDED`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not fund this category.') }
    finally { setBusy(null) }
  }

  const reallocate = async () => {
    const amount = Number(moveAmount)
    if (!moveFrom || !moveTo || !Number.isFinite(amount) || amount <= 0) return setError('Choose two categories and an amount to move.')
    setBusy('move'); setError('')
    try { await moveBudgetMoney(workspace, { month, fromBudgetItemId: Number(moveFrom), toBudgetItemId: Number(moveTo), amountUsd: amount }); setMoveAmount(''); await onChanged(); onNotice('CATEGORY MONEY MOVED') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not move category money.') }
    finally { setBusy(null) }
  }

  const activate = async () => {
    setBusy('activate'); setError('')
    try { await activateBudgetMonth(workspace, month); await onChanged(); onNotice(`${month} BUDGET ACTIVE`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not activate this plan.') }
    finally { setBusy(null) }
  }

  const addBudget = async (event: React.FormEvent) => {
    event.preventDefault(); const amount = Number(newAmount)
    if (budgetMonth?.status === 'closed') return setError('Reopen this month before changing its category budgets.')
    if (!newName.trim() || !Number.isFinite(amount) || amount < 0) return setError('Add a category budget name and valid amount.')
    setBusy('new'); setError('')
    try { await createBudget(workspace, { name: newName.trim(), categoryId: newCategoryId ? Number(newCategoryId) : null, monthlyLimitUsd: amount, month, recurring: false }); setNewName(''); setNewAmount(''); setAddingBudget(false); await onChanged(); onNotice('CATEGORY BUDGET CREATED') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not create this category budget.') }
    finally { setBusy(null) }
  }

  const close = async () => {
    if (nextValue + goalValue > availableForClose) return setError('Close distributions exceed the remaining budget.')
    if (goalValue > 0 && !goalId) return setError('Choose a goal for the goal contribution.')
    setBusy('close'); setError('')
    try { await closeBudgetMonth(workspace, { month, toBalance: balanceValue, toNextMonth: nextValue, goalId: goalId ? Number(goalId) : null, toGoal: goalValue }); setClosing(false); await onChanged(); onNotice(`${month} CLOSED`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not close this month.') }
    finally { setBusy(null) }
  }

  const reopen = async () => {
    setBusy('reopen'); setError('')
    try { await reopenBudgetMonth(workspace, month); setReopening(false); await onChanged(); onNotice(`${month} REOPENED`) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not reopen this month.') }
    finally { setBusy(null) }
  }

  return <Glass className="module-view plan-module">
    <div className="module-heading"><div><span>NULL / MONTHLY BUDGET</span><h1>BUDGET</h1><p>Set each category for the selected month. Their sum is your monthly budget, while earlier months keep their original totals and breakdowns.</p></div><div className="heading-actions"><label className="month-control"><Calendar set="curved" size={18} /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label><button onClick={() => setAddingBudget((value) => !value)} disabled={budgetMonth?.status === 'closed'}>{addingBudget ? 'CLOSE' : 'ADD CATEGORY BUDGET'}</button></div></div>
    <div className="plan-status-grid">
      <div><span>AVAILABLE CASH</span><strong>{money(unallocatedCash)}</strong><small>Not reserved or assigned</small></div>
      <div><span>MONTHLY BUDGET</span><strong>{money(allocated)}</strong><small>{budgetMonth?.status?.toUpperCase() ?? 'NO BUDGET YET'}</small></div>
      <div className={remaining < 0 ? 'negative' : ''}><span>MONTH RESULT</span><strong>{remaining >= 0 ? money(remaining) : `−${money(deficit)}`}</strong><small>{remaining >= 0 ? 'Under budget so far' : 'Over budget · recovery needed'}</small></div>
      <div><span>ACTUAL SAVINGS</span><strong>{money(summary.savings)}</strong><small>{summary.savingsRate == null ? 'No income posted' : `${Math.round(summary.savingsRate)}% of income`}</small></div>
    </div>
    {error ? <div className="form-error" role="alert">{error}</div> : null}
    {addingBudget ? <form className="finance-form plan-create-form" onSubmit={addBudget}><label><span>NAME</span><input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="e.g. Groceries" autoFocus /></label><label><span>CATEGORY</span><select value={newCategoryId} onChange={(event) => setNewCategoryId(event.target.value)}><option value="">NO CATEGORY</option>{categories.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>FIRST ASSIGNMENT</span><FormattedNumberInput value={newAmount} onValueChange={setNewAmount} placeholder="0.00" /></label><button disabled={busy === 'new'}>{busy === 'new' ? 'CREATING…' : 'CREATE & FUND'}</button></form> : null}
    <div className="plan-ledger">
      <div className="plan-ledger-head"><span>CATEGORY</span><span>ASSIGNED</span><span>SPENT</span><span>AVAILABLE</span><span>ACTION</span></div>
      {budgets.filter((item) => item.active).map((budget) => {
        const allocation = allocationByBudget.get(budget.id)
        const spent = transactions.filter((item) => item.kind === 'expense' && item.budgetItemId === budget.id && item.date.startsWith(month)).reduce((sum, item) => sum + Math.abs(item.amount), 0)
        const available = allocation ? allocationAvailable(allocation, transactions) : -spent
        return <div className={`plan-ledger-row ${available < 0 ? 'over' : ''}`} key={budget.id}>
          <div><i /><strong>{budget.name}</strong><small>{available < 0 ? `OVER BY ${money(Math.abs(available))}` : 'FUNDED CATEGORY'}</small></div>
          <label><span className="sr-only">Assign to {budget.name}</span><FormattedNumberInput value={drafts[budget.id] ?? String(allocation?.amountUsd ?? 0)} onValueChange={(value) => setDrafts((current) => ({ ...current, [budget.id]: value }))} disabled={budgetMonth?.status === 'closed'} /></label>
          <strong>{money(spent)}</strong><strong>{money(available)}</strong>
          <button onClick={() => saveAllocation(budget)} disabled={busy === budget.id || budgetMonth?.status === 'closed'}>{busy === budget.id ? 'SAVING…' : 'FUND'}</button>
        </div>
      })}
      {!budgets.length ? <div className="managed-empty">CREATE A CATEGORY BUDGET TO START</div> : null}
    </div>
    {monthAllocations.length > 1 && budgetMonth?.status !== 'closed' ? <div className="move-money-panel"><div><span>ROLL WITH THE MONTH</span><strong>MOVE MONEY BETWEEN CATEGORIES</strong></div><select value={moveFrom} onChange={(event) => setMoveFrom(event.target.value)}><option value="">FROM</option>{budgets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><ArrowRight set="curved" size={18} /><select value={moveTo} onChange={(event) => setMoveTo(event.target.value)}><option value="">TO</option>{budgets.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select><FormattedNumberInput placeholder="0.00" value={moveAmount} onValueChange={setMoveAmount} /><button onClick={reallocate} disabled={busy === 'move'}>MOVE</button></div> : null}
    <div className="plan-footer-actions">
      {budgetMonth && budgetMonth.status === 'draft' ? <button className="secondary-action" onClick={activate} disabled={busy === 'activate'}><TickSquare set="curved" size={18} />ACTIVATE MONTH</button> : null}
      {budgetMonth && budgetMonth.status !== 'closed' ? <button onClick={() => setClosing(true)}>CLOSE {month}</button> : null}
      {budgetMonth?.status === 'closed' ? <button className="secondary-action" onClick={() => setReopening(true)}>REOPEN MONTH</button> : null}
    </div>
    {closing ? <div className="modal-backdrop"><Glass className="detail-sheet close-month-sheet"><span>MONTH CLOSE</span><h2>{month}</h2><p>{remaining >= 0 ? `${money(availableForClose)} remains. Decide where it should go.` : `${money(deficit)} is unfunded and will be recorded as a deficit.`}</p>{remaining >= 0 ? <div className="close-fields"><label><span>NEXT MONTH</span><FormattedNumberInput value={toNext} onValueChange={setToNext} /></label><label><span>GOAL</span><select value={goalId} onChange={(event) => setGoalId(event.target.value)}><option value="">NO GOAL</option>{goals.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label><span>TO GOAL</span><FormattedNumberInput value={toGoal} onValueChange={setToGoal} /></label><div><span>STAYS IN BALANCE</span><strong>{money(balanceValue)}</strong></div></div> : null}<div className="detail-actions"><button onClick={() => setClosing(false)}>CANCEL</button><button onClick={close} disabled={busy === 'close'}>{busy === 'close' ? 'CLOSING…' : 'CLOSE MONTH'}</button></div></Glass></div> : null}
    {reopening ? <ConfirmDialog title={`REOPEN ${month}?`} body="Closed analytics will be recalculated. Any goal contribution created by the close will be reversed." confirmLabel="REOPEN MONTH" onCancel={() => setReopening(false)} onConfirm={reopen} /> : null}
  </Glass>
}
