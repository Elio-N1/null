import { Download } from 'react-iconly'
import type { BudgetItem, MonthlyBudget } from '../lib/budget-api'
import { monthlySeries } from '../lib/finance'
import type { Transaction } from '../data'
import { Glass } from './Glass'

const money = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value)

export default function ReportsModule({ transactions, months, budgets }: { transactions: Transaction[]; months: MonthlyBudget[]; budgets: BudgetItem[] }) {
  const series = monthlySeries(transactions, months)
  const latest = series[series.length - 1]
  const max = Math.max(1, ...series.flatMap((item) => [item.income, item.expenses]))
  const categoryRows = budgets.map((budget) => {
    const spent = transactions.filter((item) => item.kind === 'expense' && item.budgetItemId === budget.id && item.date.startsWith(latest.month)).reduce((sum, item) => sum + Math.abs(item.amount), 0)
    return { id: budget.id, name: budget.name, planned: budget.monthlyLimitUsd, spent, variance: budget.monthlyLimitUsd - spent }
  }).sort((a, b) => b.spent - a.spent)
  const cumulativeSavings = series.reduce((sum, item) => sum + item.savings, 0)
  const exportCsv = () => {
    const rows = [['Month', 'Income', 'Expenses', 'Savings', 'Savings rate', 'Budget variance'], ...series.map((item) => [item.month, item.income, item.expenses, item.savings, item.savingsRate ?? '', item.variance])]
    const blob = new Blob([rows.map((row) => row.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'null-money-monthly-report.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Glass className="module-view reports-module">
    <div className="module-heading"><div><span>NULL / ANALYTICS</span><h1>REPORTS</h1><p>One reconciled view of income, spending, savings, budget variance, and the decisions made at month close.</p></div><button onClick={exportCsv}><Download set="curved" size={18} />EXPORT CSV</button></div>
    <div className="report-metrics"><div><span>THIS MONTH SAVED</span><strong className={latest.savings < 0 ? 'negative-text' : ''}>{money(latest.savings)}</strong><small>{latest.savingsRate == null ? 'NO INCOME POSTED' : `${Math.round(latest.savingsRate)}% SAVINGS RATE`}</small></div><div><span>BUDGET VARIANCE</span><strong className={latest.variance < 0 ? 'negative-text' : ''}>{money(latest.variance)}</strong><small>{latest.variance >= 0 ? 'UNDER BUDGET' : 'OVER BUDGET'}</small></div><div><span>12-MONTH SAVINGS</span><strong>{money(cumulativeSavings)}</strong><small>POSTED INCOME − EXPENSES</small></div></div>
    <div className="reports-grid"><section><div className="panel-heading"><div><span className="signal-dot" />INCOME VS EXPENSES</div><span>12 MONTHS</span></div><div className="trend-bars">{series.map((item) => <div className="trend-month" key={item.month}><div><i className="income-bar" style={{ height: `${Math.max(2, item.income / max * 100)}%` }} /><i className="expense-bar" style={{ height: `${Math.max(2, item.expenses / max * 100)}%` }} /></div><span>{item.month.slice(5)}</span></div>)}</div><div className="report-legend"><span><i className="income-key" />INCOME</span><span><i className="expense-key" />EXPENSES</span></div></section><section><div className="panel-heading"><div><span className="signal-dot" />SAVINGS TREND</div><span>ACTUAL</span></div><div className="savings-list">{series.slice(-6).map((item) => <div key={item.month}><span>{new Date(`${item.month}-01T12:00:00`).toLocaleDateString('en-LB', { month: 'short', year: '2-digit' }).toUpperCase()}</span><div><i className={item.savings < 0 ? 'loss' : ''} style={{ width: `${Math.min(100, Math.abs(item.savings) / Math.max(1, ...series.map((entry) => Math.abs(entry.savings))) * 100)}%` }} /></div><strong>{money(item.savings)}</strong></div>)}</div></section></div>
    <section className="variance-table"><div className="panel-heading"><div><span className="signal-dot" />CATEGORY VARIANCE</div><span>{latest.month}</span></div><div className="variance-head"><span>CATEGORY</span><span>PLANNED</span><span>ACTUAL</span><span>VARIANCE</span></div>{categoryRows.map((item) => <div className={item.variance < 0 ? 'over' : ''} key={item.id}><strong>{item.name}</strong><span>{money(item.planned)}</span><span>{money(item.spent)}</span><strong>{money(item.variance)}</strong></div>)}{!categoryRows.length ? <div className="managed-empty">NO CATEGORY DATA FOR THIS MONTH</div> : null}</section>
  </Glass>
}
