import { useMemo, useState } from 'react'
import { Delete, Plus, TickSquare } from 'react-iconly'
import { contributeToGoal, createAccount, createBudget, createCategory, createGoal, createSubscription, deleteFinanceRecord, toggleFinanceRecord, type Account, type AccountTransfer, type BudgetItem, type BudgetWorkspace, type Category, type Currency, type Goal, type Subscription } from '../lib/budget-api'
import { accountBalance } from '../lib/finance'
import type { Transaction } from '../data'
import { Glass } from './Glass'
import ConfirmDialog from './ConfirmDialog'
import ActiveToggle from './ActiveToggle'
import FormattedNumberInput from './FormattedNumberInput'
import { PremiumSelect } from './PremiumControls'

type Section = 'Accounts' | 'Budgets' | 'Goals' | 'Categories' | 'Subscriptions'
type Props = { workspace: BudgetWorkspace; section: Section; exchangeRate: number; monthlyBudget: number; month: string; accounts: Account[]; categories: Category[]; budgets: BudgetItem[]; goals: Goal[]; subscriptions: Subscription[]; transactions: Transaction[]; transfers: AccountTransfer[]; unallocatedCash: number; onTransfer: () => void; onChanged: () => Promise<void>; onOptimisticToggle: (section: Section, id: number, active: boolean) => void; onNotice: (message: string) => void }

const suggestions: Record<Exclude<Section, 'Accounts' | 'Categories'>, string[]> = {
  Budgets: ['Housing', 'Food & dining', 'Transport', 'Utilities', 'Entertainment'],
  Goals: ['Emergency fund', 'Travel', 'Big purchase', 'Debt payoff'],
  Subscriptions: ['Netflix', 'Spotify', 'iCloud+', 'Mobile plan', 'Internet'],
}

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)
const nextDueDate = (dueDay: number) => { const now = new Date(); const date = new Date(now.getFullYear(), now.getMonth() + (now.getDate() > dueDay ? 1 : 0), dueDay); return date.toLocaleDateString('en-LB', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() }

export default function FinanceModule({ workspace, section, exchangeRate, monthlyBudget, month, accounts, categories, budgets, goals, subscriptions, transactions, transfers, unallocatedCash, onTransfer, onChanged, onOptimisticToggle, onNotice }: Props) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [detail, setDetail] = useState(section === 'Categories' ? 'Flexible' : 'Checking')
  const [amount, setAmount] = useState('')
  const [secondaryAmount, setSecondaryAmount] = useState('0')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [linkedId, setLinkedId] = useState('')
  const [budgetId, setBudgetId] = useState('')
  const [dueDay, setDueDay] = useState('15')
  const [date, setDate] = useState('')
  const [recurring, setRecurring] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null)

  const accountBalances = useMemo(() => new Map(accounts.map((account) => [account.id, accountBalance(account, transactions, transfers)])), [accounts, transactions, transfers])
  const budgetSpent = (id: number) => transactions.filter((item) => item.kind === 'expense' && item.budgetItemId === id && item.date.startsWith(month)).reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const reset = () => { setName(''); setDetail(section === 'Categories' ? 'Flexible' : 'Checking'); setAmount(''); setSecondaryAmount('0'); setCurrency('USD'); setLinkedId(''); setBudgetId(''); setDueDay('15'); setDate(''); setRecurring(true); setEditing(false) }

  const chooseSuggestion = (value: string) => {
    if (!value) return
    setName(value)
    if (section === 'Budgets') { const category = categories.find((item) => item.name === value); setLinkedId(category ? String(category.id) : '') }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    const primary = Number(amount); const secondary = Number(secondaryAmount)
    if (!name.trim()) { setError('Add a name.'); return }
    setSaving(true)
    try {
      if (section === 'Accounts') {
        if (!Number.isFinite(primary) || primary < 0) throw new Error('Enter a valid starting balance.')
        await createAccount(workspace, { name: name.trim(), accountType: detail, currency, originalBalance: primary, exchangeRate })
      } else if (section === 'Categories') {
        await createCategory(workspace, { name: name.trim(), group: detail })
      } else if (section === 'Budgets') {
        if (!Number.isFinite(primary) || primary < 0) throw new Error('Enter a valid monthly limit.')
        const allocated = budgets.filter((item) => item.active).reduce((sum, item) => sum + item.monthlyLimitUsd, 0)
        if (allocated + primary > monthlyBudget) throw new Error(`Category budgets cannot exceed ${money(monthlyBudget)}. ${money(Math.max(0, monthlyBudget - allocated))} remains for ${month}.`)
        await createBudget(workspace, { name: name.trim(), categoryId: linkedId ? Number(linkedId) : null, monthlyLimitUsd: primary, month, recurring })
      } else if (section === 'Goals') {
        if (!Number.isFinite(primary) || primary <= 0 || !Number.isFinite(secondary) || secondary < 0) throw new Error('Enter a target greater than zero and a valid saved amount.')
        await createGoal(workspace, { name: name.trim(), targetAmountUsd: primary, savedAmountUsd: secondary, targetDate: date || null })
      } else {
        if (!accounts.length) throw new Error('Create an account before adding a subscription.')
        if (!Number.isFinite(primary) || primary <= 0) throw new Error('Enter a subscription amount greater than zero.')
        await createSubscription(workspace, { name: name.trim(), originalAmount: primary, originalCurrency: currency, exchangeRate, dueDay: Number(dueDay), accountId: Number(linkedId || accounts[0].id), budgetItemId: budgetId ? Number(budgetId) : null })
      }
      await onChanged(); onNotice(`${section.toUpperCase()} SAVED`); reset()
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Could not save ${section.toLowerCase()}.`) }
    finally { setSaving(false) }
  }

  const toggle = async (id: number, active: boolean) => { const next = !active; onOptimisticToggle(section, id, next); try { const table = section === 'Budgets' ? 'budget_items' : section.toLowerCase() as 'accounts' | 'categories' | 'goals' | 'subscriptions'; await toggleFinanceRecord(workspace, table, id, next); void onChanged() } catch (reason) { onOptimisticToggle(section, id, active); setError(reason instanceof Error ? reason.message : 'Could not update the item.') } }
  const remove = async () => { if (!deleteTarget) return; try { const table = section === 'Budgets' ? 'budget_items' : section.toLowerCase() as 'accounts' | 'categories' | 'goals' | 'subscriptions'; await deleteFinanceRecord(workspace, table, deleteTarget.id); await onChanged(); onNotice(`${deleteTarget.name.toUpperCase()} REMOVED`); setDeleteTarget(null) } catch { setError('This item is linked to existing activity. Pause it instead to preserve your ledger history.'); setDeleteTarget(null) } }
  const adjustGoal = async (goal: Goal, delta: number) => { try { await contributeToGoal(workspace, goal.id, delta, delta > 0 ? 'Manual goal contribution' : 'Goal reserve released'); await onChanged(); onNotice(delta > 0 ? 'GOAL MONEY RESERVED' : 'GOAL MONEY RELEASED') } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update goal reserve.') } }

  const intro = section === 'Accounts' ? 'Create an account and set the money currently available in it.' : section === 'Budgets' ? 'Set monthly limits and link expenses or subscriptions to them.' : section === 'Goals' ? 'Track targets with real saved amounts and dates.' : section === 'Categories' ? 'Use the default categories or add your own.' : 'Schedule recurring deductions and optionally assign them to a budget.'
  const items = section === 'Accounts' ? accounts : section === 'Budgets' ? budgets : section === 'Goals' ? goals : section === 'Categories' ? categories : subscriptions

  return <Glass className="module-view finance-module">
    <div className="module-heading"><div><span>NULL / {section.toUpperCase()}</span><h1>{section.toUpperCase()}</h1><p>{intro}</p></div><div className="heading-actions">{section === 'Accounts' && accounts.length > 1 ? <button className="secondary-action" onClick={onTransfer}>TRANSFER</button> : null}<button onClick={() => setEditing((value) => !value)}><Plus set="curved" size={18} />{editing ? 'CLOSE' : `ADD ${section === 'Categories' ? 'CATEGORY' : section.slice(0, -1).toUpperCase()}`}</button></div></div>
    <div className="module-metrics">
      <div><span>01 / ACTIVE</span><strong>{String(items.filter((item) => item.active).length).padStart(2, '0')}</strong><i /></div>
      <div><span>02 / {section === 'Accounts' ? 'TOTAL BALANCE' : section === 'Budgets' ? 'MONTHLY LIMIT' : section === 'Goals' ? 'SAVED' : section === 'Subscriptions' ? 'MONTHLY' : 'DEFAULTS'}</span><strong>{section === 'Accounts' ? money([...accountBalances.values()].reduce((sum, value) => sum + value, 0)) : section === 'Budgets' ? money(budgets.filter((item) => item.active).reduce((sum, item) => sum + item.monthlyLimitUsd, 0)) : section === 'Goals' ? money(goals.reduce((sum, item) => sum + item.savedAmountUsd, 0)) : section === 'Subscriptions' ? money(subscriptions.filter((item) => item.active).reduce((sum, item) => sum + item.amountUsd, 0)) : String(categories.filter((item) => item.isDefault).length).padStart(2, '0')}</strong><i /></div>
      <div><span>03 / {section === 'Accounts' ? 'UNALLOCATED' : section === 'Budgets' ? 'REMAINING' : section === 'Goals' ? 'TARGET' : section === 'Subscriptions' ? 'NEXT DUE' : 'CUSTOM'}</span><strong>{section === 'Accounts' ? money(unallocatedCash) : section === 'Budgets' ? money(budgets.reduce((sum, item) => sum + Math.max(0, item.monthlyLimitUsd - budgetSpent(item.id)), 0)) : section === 'Goals' ? money(goals.reduce((sum, item) => sum + item.targetAmountUsd, 0)) : section === 'Subscriptions' ? (subscriptions.filter((item) => item.active)[0] ? nextDueDate(subscriptions.filter((item) => item.active)[0].dueDay) : '—') : String(categories.filter((item) => !item.isDefault).length).padStart(2, '0')}</strong><i /></div>
    </div>
    {editing && <form className="finance-form" onSubmit={submit} noValidate>
      {section !== 'Accounts' && section !== 'Categories' && <label><span>STARTER ITEM</span><PremiumSelect value="" onChange={chooseSuggestion} label="Starter item" options={[{ value:'', label:'CUSTOM' },...suggestions[section].map((item) => ({ value:item, label:item }))]} /></label>}
      <label><span>NAME</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={`New ${section.toLowerCase()} item`} autoFocus /></label>
      {section === 'Accounts' && <><label><span>ACCOUNT TYPE</span><select value={detail} onChange={(event) => setDetail(event.target.value)}><option>Checking</option><option>Savings</option><option>Cash</option><option>Wallet</option><option>Other</option></select></label><label><span>STARTING BALANCE</span><FormattedNumberInput value={amount} onValueChange={setAmount} allowDecimals={currency === 'USD'} placeholder="0.00" /></label><label><span>CURRENCY</span><PremiumSelect value={currency} onChange={(value) => setCurrency(value as Currency)} label="Account currency" options={[{ value:'USD', label:'USD' },{ value:'LBP', label:'LBP' }]} /></label></>}
      {section === 'Categories' && <label><span>GROUP</span><select value={detail} onChange={(event) => setDetail(event.target.value)}><option>Essential</option><option>Flexible</option><option>Financial</option><option>Lifestyle</option><option>Other</option></select></label>}
      {section === 'Budgets' && <><label><span>MONTHLY LIMIT · USD</span><FormattedNumberInput value={amount} onValueChange={setAmount} placeholder="0.00" /></label><label><span>CATEGORY</span><select value={linkedId} onChange={(event) => setLinkedId(event.target.value)}><option value="">NO CATEGORY</option>{categories.filter((item) => item.active).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><label className="app-checkbox compact-check"><input type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} /><i><TickSquare set="curved" size={17} /></i><span><strong>RECUR MONTHLY</strong><small>Starting {month}</small></span></label><div className="allocation-status"><span>AVAILABLE TO ALLOCATE</span><strong>{money(Math.max(0, monthlyBudget - budgets.filter((item) => item.active).reduce((sum, item) => sum + item.monthlyLimitUsd, 0)))}</strong><small>of {money(monthlyBudget)} for {month}</small></div></>}
      {section === 'Goals' && <><label><span>TARGET · USD</span><FormattedNumberInput value={amount} onValueChange={setAmount} placeholder="0.00" /></label><label><span>ALREADY SAVED · USD</span><FormattedNumberInput value={secondaryAmount} onValueChange={setSecondaryAmount} /></label><label><span>TARGET DATE</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></>}
      {section === 'Subscriptions' && <><label><span>AMOUNT</span><FormattedNumberInput value={amount} onValueChange={setAmount} allowDecimals={currency === 'USD'} placeholder={currency === 'USD' ? '0.00' : '0'} /></label><label><span>CURRENCY</span><PremiumSelect value={currency} onChange={(value) => setCurrency(value as Currency)} label="Subscription currency" options={[{ value:'USD', label:'USD' },{ value:'LBP', label:'LBP' }]} /></label><label><span>DUE DAY</span><input type="number" min="1" max="28" value={dueDay} onChange={(event) => setDueDay(event.target.value)} /></label><label><span>PAY FROM ACCOUNT</span><PremiumSelect value={linkedId} onChange={setLinkedId} label="Pay from account" options={[{ value:'', label:'SELECT ACCOUNT' },...accounts.filter((item) => item.active).map((item) => ({ value:String(item.id), label:item.name }))]} /></label><label><span>LINK TO BUDGET · OPTIONAL</span><PremiumSelect value={budgetId} onChange={setBudgetId} label="Link to budget" options={[{ value:'', label:'NO BUDGET' },...budgets.filter((item) => item.active).map((item) => ({ value:String(item.id), label:item.name }))]} /></label><div className="subscription-due-preview"><span>NEXT PAYMENT</span><strong>{nextDueDate(Math.min(28, Math.max(1, Number(dueDay) || 1)))}</strong><small>Reminder timing is managed in Settings.</small></div></>}
      {error && <div className="form-error" role="alert">{error}</div>}<button type="submit" disabled={saving}><Plus set="curved" size={17} />{saving ? 'SAVING…' : 'SAVE ITEM'}</button>
    </form>}
    {!editing && error && <div className="data-status error" role="alert">{error}</div>}
    <div className="finance-list">{items.map((raw) => {
      const item = raw as Account | BudgetItem | Goal | Category | Subscription
      const isAccount = section === 'Accounts'; const isBudget = section === 'Budgets'; const isGoal = section === 'Goals'; const isCategory = section === 'Categories';
      const primary = isAccount ? money(accountBalances.get(item.id) ?? 0) : isBudget ? `${money(budgetSpent(item.id))} / ${money((item as BudgetItem).monthlyLimitUsd)}` : isGoal ? `${money((item as Goal).savedAmountUsd)} / ${money((item as Goal).targetAmountUsd)}` : isCategory ? ((item as Category).isDefault ? 'DEFAULT' : 'CUSTOM') : `${money((item as Subscription).amountUsd)} / MONTH`
      const detailText = isAccount ? `${(item as Account).accountType} · ${(item as Account).currency}` : isBudget ? (categories.find((category) => category.id === (item as BudgetItem).categoryId)?.name ?? 'No category') : isGoal ? ((item as Goal).targetDate ? new Date(`${(item as Goal).targetDate}T12:00:00`).toLocaleDateString('en-LB', { month: 'short', year: 'numeric' }) : 'No target date') : isCategory ? (item as Category).group : `${nextDueDate((item as Subscription).dueDay)} · ${accounts.find((account) => account.id === (item as Subscription).accountId)?.name ?? 'Account'}`
      const progress = isBudget ? ((item as BudgetItem).monthlyLimitUsd ? Math.min(100, Math.round(budgetSpent(item.id) / (item as BudgetItem).monthlyLimitUsd * 100)) : 0) : isGoal ? ((item as Goal).targetAmountUsd ? Math.min(100, Math.round((item as Goal).savedAmountUsd / (item as Goal).targetAmountUsd * 100)) : 0) : 0
      return <div className={`finance-row ${item.active ? '' : 'inactive'}`} key={item.id}><div className="finance-copy"><i /><div><strong>{item.name}</strong><span>{detailText}</span></div></div><div className="finance-value"><strong>{primary}</strong>{(isBudget || isGoal) && <div className="finance-progress"><i style={{ width: `${progress}%` }} /><span>{progress}%</span></div>}</div>{isGoal && <div className="goal-adjust"><button onClick={() => adjustGoal(item as Goal, -100)} aria-label={`Subtract 100 from ${item.name}`}>−</button><button onClick={() => adjustGoal(item as Goal, 100)} aria-label={`Add 100 to ${item.name}`}>+</button></div>}<div className="finance-actions"><ActiveToggle active={item.active} label={item.name} onToggle={() => toggle(item.id, item.active)} /><button onClick={() => setDeleteTarget({ id: item.id, name: item.name })} aria-label={`Delete ${item.name}`}><Delete set="curved" size={18} /></button></div></div>
    })}{!items.length && <div className="managed-empty">NO ITEMS YET — USE ADD {section.slice(0, -1).toUpperCase()}</div>}</div>{deleteTarget && <ConfirmDialog destructive title={`DELETE ${deleteTarget.name.toUpperCase()}?`} body="Linked ledger records may prevent deletion. Pausing an item is safer when you want to preserve historical reporting." confirmLabel="DELETE ITEM" onCancel={() => setDeleteTarget(null)} onConfirm={remove} />}
  </Glass>
}
