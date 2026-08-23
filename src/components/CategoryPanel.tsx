import { ArrowRight } from 'react-iconly'
import type { Transaction } from '../data'
import type { BudgetItem, Category } from '../lib/budget-api'
import { Glass } from './Glass'

export default function CategoryPanel({ onViewAll, transactions, budgets, categories, formatMoney }: { onViewAll: () => void; transactions: Transaction[]; budgets: BudgetItem[]; categories: Category[]; formatMoney: (value: number) => string }) {
  const items = budgets.filter((item) => item.active).map((budget) => {
    const category = categories.find((item) => item.id === budget.categoryId)
    const spent = transactions.filter((item) => item.kind === 'expense' && (item.budgetItemId === budget.id || (!item.budgetItemId && category && item.category === category.name))).reduce((sum, item) => sum + Math.abs(item.amount), 0)
    return { ...budget, category, spent }
  })
  return <Glass className="category-panel">
    <div className="panel-heading"><div><span className="signal-dot" />CATEGORY BUDGETS</div><button className="view-all" onClick={onViewAll}>VIEW ALL <ArrowRight set="curved" size={15} /></button></div>
    <div className="category-list">{items.map((item, index) => {
      const percent = item.monthlyLimitUsd > 0 ? Math.round(item.spent / item.monthlyLimitUsd * 100) : 0
      return <div className="category-row" key={item.id}><span className="category-index">{String(index + 1).padStart(2, '0')}</span><div><div className="category-data"><strong>{item.name}</strong><span>{formatMoney(item.spent)} / {formatMoney(item.monthlyLimitUsd)}</span></div><div className="progress"><i style={{ width: `${Math.min(100, percent)}%` }} /></div></div><span className="percent">{percent}%</span></div>
    })}{!items.length && <div className="category-empty">NO BUDGET ITEMS YET<br /><button onClick={onViewAll}>CREATE YOUR FIRST BUDGET</button></div>}</div>
  </Glass>
}
