import type { Transaction } from '../data'
import type { Account, AccountTransfer, BudgetAllocation, BudgetItem, GoalContribution, MonthlyBudget } from './budget-api'

export type MonthlyFinanceSummary = {
  month: string
  income: number
  expenses: number
  savings: number
  savingsRate: number | null
  funded: number
  variance: number
}

export function accountBalance(account: Account, transactions: Transaction[], transfers: AccountTransfer[]) {
  const ledger = transactions.filter((item) => item.accountId === account.id).reduce((sum, item) => sum + item.amount, 0)
  const transferNet = transfers.reduce((sum, item) => sum + (item.toAccountId === account.id ? item.amountUsd : 0) - (item.fromAccountId === account.id ? item.amountUsd : 0), 0)
  return account.startingBalanceUsd + ledger + transferNet
}

export function totalLiquidBalance(accounts: Account[], transactions: Transaction[], transfers: AccountTransfer[]) {
  return accounts.filter((item) => item.active).reduce((sum, account) => sum + accountBalance(account, transactions, transfers), 0)
}

export function goalReserve(contributions: GoalContribution[]) {
  return contributions.reduce((sum, item) => sum + item.amountUsd, 0)
}

export function allocationAvailable(allocation: BudgetAllocation, transactions: Transaction[]) {
  const spent = transactions.filter((item) => item.kind === 'expense' && item.budgetItemId === allocation.budgetItemId && item.date.startsWith(allocation.month)).reduce((sum, item) => sum + Math.abs(item.amount), 0)
  return allocation.amountUsd + allocation.movedInUsd - allocation.movedOutUsd + allocation.rolloverUsd - spent
}

export function assignedReserve(allocations: BudgetAllocation[], months: MonthlyBudget[], transactions: Transaction[]) {
  const openMonths = new Set(months.filter((item) => item.status !== 'closed').map((item) => item.month))
  return allocations.filter((item) => openMonths.has(item.month)).reduce((sum, item) => sum + Math.max(0, allocationAvailable(item, transactions)), 0)
}

export function monthSummary(month: string, transactions: Transaction[], months: MonthlyBudget[]): MonthlyFinanceSummary {
  const entries = transactions.filter((item) => item.date.startsWith(month))
  const income = entries.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0)
  const expenses = entries.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + Math.abs(item.amount), 0)
  const funded = months.find((item) => item.month === month)?.amountUsd ?? 0
  const savings = income - expenses
  return { month, income, expenses, savings, savingsRate: income > 0 ? savings / income * 100 : null, funded, variance: funded - expenses }
}

export function monthlySeries(transactions: Transaction[], months: MonthlyBudget[], count = 12) {
  const current = new Date()
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(current.getFullYear(), current.getMonth() - (count - index - 1), 1)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    return monthSummary(key, transactions, months)
  })
}

export function budgetNameMap(items: BudgetItem[]) {
  return new Map(items.map((item) => [item.id, item.name]))
}
