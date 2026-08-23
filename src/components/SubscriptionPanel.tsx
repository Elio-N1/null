import { ArrowRight, Calendar } from 'react-iconly'
import type { Account, BudgetItem, Subscription } from '../lib/budget-api'
import { Glass } from './Glass'

const nextDue = (dueDay: number) => { const now = new Date(); return new Date(now.getFullYear(), now.getMonth() + (now.getDate() > dueDay ? 1 : 0), dueDay) }

export default function SubscriptionPanel({ subscriptions, accounts, budgets, onViewAll, formatMoney }: { subscriptions: Subscription[]; accounts: Account[]; budgets: BudgetItem[]; onViewAll: () => void; formatMoney: (value: number) => string }) {
  const upcoming = subscriptions.filter((item) => item.active).slice().sort((a, b) => nextDue(a.dueDay).getTime() - nextDue(b.dueDay).getTime())
  return <Glass className="subscription-panel">
    <div className="panel-heading"><div><span className="signal-dot" />UPCOMING SUBSCRIPTIONS</div><button className="view-all" onClick={onViewAll}>VIEW ALL <ArrowRight set="curved" size={15} /></button></div>
    <div className="subscription-stack">{upcoming.map((item) => <div className="subscription-card" key={item.id}><span><Calendar set="curved" size={18} /></span><div><strong>{item.name}</strong><small>{nextDue(item.dueDay).toLocaleDateString('en-LB', { month: 'short', day: 'numeric' }).toUpperCase()} · {accounts.find((account) => account.id === item.accountId)?.name ?? 'ACCOUNT'}</small>{item.budgetItemId && <em>{budgets.find((budget) => budget.id === item.budgetItemId)?.name ?? 'BUDGET'} BUDGET</em>}</div><b>−{formatMoney(item.amountUsd)}</b></div>)}{!upcoming.length && <div className="category-empty">NO UPCOMING SUBSCRIPTIONS<br /><button onClick={onViewAll}>ADD A SUBSCRIPTION</button></div>}</div>
  </Glass>
}
