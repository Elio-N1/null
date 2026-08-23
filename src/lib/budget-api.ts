import type { Transaction } from '../data'
import { supabase } from './supabase'

export type BudgetWorkspace = string
export type WorkspaceRecord = { id: string; slug: BudgetWorkspace; name: string; createdAt: string }
export type Currency = 'USD' | 'LBP'
export type AppSettings = { exchangeRate: number; monthlyBudget: number; openingBalance: number; subscriptionRemindersEnabled: boolean; subscriptionReminderDays: number[]; browserNotifications: boolean }
export type NotificationItem = { id: number; title: string; body: string; type: 'info' | 'success' | 'warning'; actionTarget: string | null; readAt: string | null; createdAt: string }
export type ManagedRecord = { id: number; section: string; name: string; detail: string; value: string; progress: number; active: boolean }
export type Account = { id: number; name: string; accountType: string; currency: Currency; originalBalance: number; exchangeRate: number; startingBalanceUsd: number; active: boolean }
export type Category = { id: number; name: string; group: string; isDefault: boolean; active: boolean }
export type BudgetItem = { id: number; name: string; categoryId: number | null; monthlyLimitUsd: number; active: boolean }
export type BudgetMonthStatus = 'draft' | 'active' | 'closed' | 'reopened'
export type MonthlyBudget = { id: number; month: string; amountUsd: number; recurring: boolean; status: BudgetMonthStatus; savingsTargetUsd: number; nextMonthTargetUsd: number; closedAt: string | null; closingBalanceUsd: number | null; closingIncomeUsd: number | null; closingExpenseUsd: number | null; closingSavingsUsd: number | null; closingVarianceUsd: number | null; reopenCount: number; createdAt: string }
export type BudgetAllocation = { id: number; budgetItemId: number; month: string; amountUsd: number; recurring: boolean; movedInUsd: number; movedOutUsd: number; rolloverUsd: number }
export type Goal = { id: number; name: string; targetAmountUsd: number; savedAmountUsd: number; targetDate: string | null; active: boolean }
export type Subscription = { id: number; name: string; originalAmount: number; originalCurrency: Currency; exchangeRate: number; amountUsd: number; dueDay: number; accountId: number; budgetItemId: number | null; active: boolean; lastChargedMonth: string | null }
export type GoalContribution = { id: number; goalId: number; date: string; amountUsd: number; note: string }
export type AccountTransfer = { id: number; fromAccountId: number; toAccountId: number; date: string; amountUsd: number; originalAmount: number; originalCurrency: Currency; exchangeRate: number; note: string }
export type MonthCloseDistribution = { id: number; monthlyBudgetId: number; type: 'balance' | 'next_month' | 'goal' | 'deficit'; goalId: number | null; amountUsd: number }
export type WorkspaceSnapshot = { settings: AppSettings; monthlyBudgets: MonthlyBudget[]; budgetAllocations: BudgetAllocation[]; transactions: Transaction[]; notifications: NotificationItem[]; accounts: Account[]; categories: Category[]; budgets: BudgetItem[]; goals: Goal[]; subscriptions: Subscription[]; goalContributions: GoalContribution[]; transfers: AccountTransfer[]; closeDistributions: MonthCloseDistribution[] }
export type NewTransaction = Omit<Transaction, 'id'> & Required<Pick<Transaction, 'originalAmount' | 'originalCurrency' | 'exchangeRate' | 'accountId'>>

const ensureClient = () => { if (!supabase) throw new Error('Supabase environment is not configured'); return supabase }
const number = (value: unknown) => Number(value ?? 0)
const localDateKey = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}` }

export async function loadUserWorkspaces(): Promise<WorkspaceRecord[]> {
  const { data, error } = await ensureClient().from('user_workspaces').select('id,slug,name,created_at').order('created_at')
  if (error) throw error
  return data.map((row) => ({ id: row.id, slug: row.slug, name: row.name, createdAt: row.created_at }))
}

export async function createUserWorkspace(name: string): Promise<WorkspaceRecord> {
  const { data, error } = await ensureClient().rpc('create_user_workspace', { p_name: name.trim() })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { id: row.id, slug: row.slug, name: row.name, createdAt: row.created_at }
}

export async function clearUserWorkspace(workspace: BudgetWorkspace) {
  const { error } = await ensureClient().rpc('clear_user_workspace', { p_workspace: workspace })
  if (error) throw error
}

export async function deleteUserWorkspace(workspace: BudgetWorkspace) {
  const { error } = await ensureClient().rpc('delete_user_workspace', { p_workspace: workspace })
  if (error) throw error
}

export async function loadSettings(workspace: BudgetWorkspace): Promise<AppSettings> {
  const { data, error } = await ensureClient().from('app_settings').select('exchange_rate_lbp_per_usd,monthly_budget_usd,opening_balance_usd,subscription_reminders_enabled,subscription_reminder_days,browser_notifications').eq('workspace', workspace).single()
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    const legacy = await ensureClient().from('app_settings').select('exchange_rate_lbp_per_usd,monthly_budget_usd,opening_balance_usd').eq('workspace', workspace).single()
    if (legacy.error) throw legacy.error
    return { exchangeRate: number(legacy.data.exchange_rate_lbp_per_usd), monthlyBudget: number(legacy.data.monthly_budget_usd), openingBalance: number(legacy.data.opening_balance_usd), subscriptionRemindersEnabled: true, subscriptionReminderDays: [7, 3, 1], browserNotifications: false }
  }
  if (error) throw error
  return { exchangeRate: number(data.exchange_rate_lbp_per_usd), monthlyBudget: number(data.monthly_budget_usd), openingBalance: number(data.opening_balance_usd), subscriptionRemindersEnabled: data.subscription_reminders_enabled ?? true, subscriptionReminderDays: data.subscription_reminder_days ?? [7, 3, 1], browserNotifications: data.browser_notifications ?? false }
}

export async function saveMonthlyBudget(workspace: BudgetWorkspace, input: { month: string; amountUsd: number; recurring: boolean }) {
  const { data, error } = await ensureClient().rpc('set_monthly_budget', { p_workspace: workspace, p_month: `${input.month}-01`, p_amount: input.amountUsd, p_recurring: input.recurring })
  if (error) throw error
  if (!data) throw new Error('Monthly budget was not saved.')
}

export async function loadMonthlyBudgets(workspace: BudgetWorkspace): Promise<MonthlyBudget[]> {
  const { data, error } = await ensureClient().from('monthly_budgets').select('*').eq('workspace', workspace).order('month_start', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return []
  if (error) throw error
  return data.map((row) => ({ id: row.id, month: String(row.month_start).slice(0, 7), amountUsd: number(row.amount_usd), recurring: row.recurring, status: row.status ?? 'active', savingsTargetUsd: number(row.savings_target_usd), nextMonthTargetUsd: number(row.next_month_target_usd), closedAt: row.closed_at, closingBalanceUsd: row.closing_balance_usd == null ? null : number(row.closing_balance_usd), closingIncomeUsd: row.closing_income_usd == null ? null : number(row.closing_income_usd), closingExpenseUsd: row.closing_expense_usd == null ? null : number(row.closing_expense_usd), closingSavingsUsd: row.closing_savings_usd == null ? null : number(row.closing_savings_usd), closingVarianceUsd: row.closing_variance_usd == null ? null : number(row.closing_variance_usd), reopenCount: number(row.reopen_count), createdAt: row.created_at }))
}

export async function loadBudgetAllocations(workspace: BudgetWorkspace): Promise<BudgetAllocation[]> {
  const { data, error } = await ensureClient().from('budget_allocations').select('*').eq('workspace', workspace).order('month_start', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return []
  if (error) throw error
  return data.map((row) => ({ id: row.id, budgetItemId: row.budget_item_id, month: String(row.month_start).slice(0, 7), amountUsd: number(row.amount_usd), recurring: row.recurring, movedInUsd: number(row.moved_in_usd), movedOutUsd: number(row.moved_out_usd), rolloverUsd: number(row.rollover_usd) }))
}

export async function allocateBudgetMoney(workspace: BudgetWorkspace, input: { month: string; budgetItemId: number; amountUsd: number; recurring: boolean }) {
  const { error } = await ensureClient().rpc('allocate_budget_money', { p_workspace: workspace, p_month: `${input.month}-01`, p_budget_item_id: input.budgetItemId, p_amount: input.amountUsd, p_recurring: input.recurring })
  if (error) throw error
}

export async function moveBudgetMoney(workspace: BudgetWorkspace, input: { month: string; fromBudgetItemId: number; toBudgetItemId: number; amountUsd: number }) {
  const { error } = await ensureClient().rpc('move_budget_money', { p_workspace: workspace, p_month: `${input.month}-01`, p_from_budget_item_id: input.fromBudgetItemId, p_to_budget_item_id: input.toBudgetItemId, p_amount: input.amountUsd })
  if (error) throw error
}

export async function closeBudgetMonth(workspace: BudgetWorkspace, input: { month: string; toBalance: number; toNextMonth: number; goalId: number | null; toGoal: number }) {
  const { error } = await ensureClient().rpc('close_budget_month', { p_workspace: workspace, p_month: `${input.month}-01`, p_to_balance: input.toBalance, p_to_next_month: input.toNextMonth, p_goal_id: input.goalId, p_to_goal: input.toGoal })
  if (error) throw error
}

export async function reopenBudgetMonth(workspace: BudgetWorkspace, month: string) {
  const { error } = await ensureClient().rpc('reopen_budget_month', { p_workspace: workspace, p_month: `${month}-01` })
  if (error) throw error
}

export async function activateBudgetMonth(workspace: BudgetWorkspace, month: string) {
  const { error } = await ensureClient().rpc('activate_budget_month', { p_workspace: workspace, p_month: `${month}-01` })
  if (error) throw error
}

export function effectiveMonthlyBudget(entries: MonthlyBudget[], month: string, fallback = 0) {
  return entries.filter((entry) => entry.month === month || (entry.recurring && entry.month < month)).sort((a, b) => b.month.localeCompare(a.month))[0]?.amountUsd ?? fallback
}

export function effectiveBudgetAllocation(entries: BudgetAllocation[], budgetItemId: number, month: string, fallback = 0) {
  return entries.filter((entry) => entry.budgetItemId === budgetItemId && (entry.month === month || (entry.recurring && entry.month < month))).sort((a, b) => b.month.localeCompare(a.month))[0]?.amountUsd ?? fallback
}

export async function saveExchangeRate(workspace: BudgetWorkspace, rate: number) {
  const { error } = await ensureClient().rpc('set_exchange_rate', { p_workspace: workspace, p_rate: rate })
  if (error) throw error
}

export async function saveNotificationPreferences(workspace: BudgetWorkspace, input: { enabled: boolean; reminderDays: number[]; browserNotifications: boolean }) {
  const reminderDays = [...new Set(input.reminderDays.map((day) => Math.round(day)).filter((day) => day >= 0 && day <= 30))].sort((a, b) => b - a)
  if (!reminderDays.length) throw new Error('Choose at least one reminder day.')
  const { error } = await ensureClient().from('app_settings').update({ subscription_reminders_enabled: input.enabled, subscription_reminder_days: reminderDays, browser_notifications: input.browserNotifications, updated_at: new Date().toISOString() }).eq('workspace', workspace)
  if (error && error.code !== '42703' && error.code !== 'PGRST204') throw error
  if (input.enabled) await generateSubscriptionReminders(workspace)
}

export async function generateSubscriptionReminders(workspace: BudgetWorkspace) {
  const { data, error } = await ensureClient().rpc('generate_subscription_reminders', { p_workspace: workspace, p_as_of: localDateKey() })
  if (error && (error.code === '42883' || error.code === 'PGRST202')) return 0
  if (error) throw error
  return number(data)
}

export async function processDueSubscriptions(workspace: BudgetWorkspace) {
  const { data, error } = await ensureClient().rpc('process_due_subscriptions', { p_workspace: workspace, p_as_of: localDateKey() })
  if (error?.message?.includes('Unknown workspace')) return 0
  if (error) throw error
  return number(data)
}

export async function loadTransactions(workspace: BudgetWorkspace): Promise<Transaction[]> {
  const { data, error } = await ensureClient().from('transactions').select('*').eq('workspace', workspace).order('transaction_date', { ascending: false }).order('created_at', { ascending: false })
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, category: row.category, date: row.transaction_date, amount: number(row.amount_usd), kind: row.kind, originalAmount: number(row.original_amount), originalCurrency: row.original_currency, exchangeRate: number(row.exchange_rate_lbp_per_usd), notes: row.notes, accountId: row.account_id, budgetItemId: row.budget_item_id, subscriptionId: row.subscription_id }))
}

export async function createTransaction(workspace: BudgetWorkspace, transaction: NewTransaction): Promise<Transaction> {
  const { data, error } = await ensureClient().from('transactions').insert({ workspace, name: transaction.name, category: transaction.category, transaction_date: transaction.date, kind: transaction.kind, original_amount: transaction.originalAmount, original_currency: transaction.originalCurrency, exchange_rate_lbp_per_usd: transaction.exchangeRate, amount_usd: transaction.amount, notes: transaction.notes ?? '', account_id: transaction.accountId, budget_item_id: transaction.kind === 'expense' ? transaction.budgetItemId ?? null : null }).select().single()
  if (error) throw error
  await createNotification(workspace, { title: `${transaction.kind === 'expense' ? 'Expense' : 'Income'} saved`, body: `${transaction.name} was added in ${transaction.originalCurrency} and locked at ${transaction.exchangeRate.toLocaleString()} LBP/USD.`, type: 'success', actionTarget: 'Transactions' })
  return { id: data.id, name: data.name, category: data.category, date: data.transaction_date, amount: number(data.amount_usd), kind: data.kind, originalAmount: number(data.original_amount), originalCurrency: data.original_currency, exchangeRate: number(data.exchange_rate_lbp_per_usd), notes: data.notes, accountId: data.account_id, budgetItemId: data.budget_item_id, subscriptionId: data.subscription_id }
}

export async function deleteTransaction(workspace: BudgetWorkspace, id: number) {
  const { error } = await ensureClient().from('transactions').delete().eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function loadNotifications(workspace: BudgetWorkspace): Promise<NotificationItem[]> {
  const { data, error } = await ensureClient().from('notifications').select('*').eq('workspace', workspace).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data.map((row) => ({ id: row.id, title: row.title, body: row.body, type: row.type, actionTarget: row.action_target, readAt: row.read_at, createdAt: row.created_at }))
}

export async function createNotification(workspace: BudgetWorkspace, input: { title: string; body: string; type: NotificationItem['type']; actionTarget?: string | null; dedupeKey?: string | null }) {
  const { error } = await ensureClient().from('notifications').insert({ workspace, title: input.title, body: input.body, type: input.type, action_target: input.actionTarget ?? null, dedupe_key: input.dedupeKey ?? null })
  if (error?.code === '23505' && input.dedupeKey) return
  if (error) throw error
}

export async function markNotificationRead(workspace: BudgetWorkspace, id: number) {
  const { error } = await ensureClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function markAllNotificationsRead(workspace: BudgetWorkspace) {
  const { error } = await ensureClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('workspace', workspace).is('read_at', null)
  if (error) throw error
}

export async function loadAccounts(workspace: BudgetWorkspace): Promise<Account[]> {
  const { data, error } = await ensureClient().from('accounts').select('*').eq('workspace', workspace).order('created_at')
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, accountType: row.account_type, currency: row.currency, originalBalance: number(row.original_balance), exchangeRate: number(row.exchange_rate_lbp_per_usd), startingBalanceUsd: number(row.starting_balance_usd), active: row.active }))
}

export async function createAccount(workspace: BudgetWorkspace, input: { name: string; accountType: string; currency: Currency; originalBalance: number; exchangeRate: number }) {
  const startingBalanceUsd = input.currency === 'LBP' ? input.originalBalance / input.exchangeRate : input.originalBalance
  const { data, error } = await ensureClient().from('accounts').insert({ workspace, name: input.name, account_type: input.accountType, currency: input.currency, original_balance: input.originalBalance, exchange_rate_lbp_per_usd: input.exchangeRate, starting_balance_usd: startingBalanceUsd }).select().single()
  if (error) throw error
  return { id: data.id, name: data.name, accountType: data.account_type, currency: data.currency, originalBalance: number(data.original_balance), exchangeRate: number(data.exchange_rate_lbp_per_usd), startingBalanceUsd: number(data.starting_balance_usd), active: data.active } as Account
}

export async function loadCategories(workspace: BudgetWorkspace): Promise<Category[]> {
  const { data, error } = await ensureClient().from('categories').select('*').eq('workspace', workspace).order('is_default', { ascending: false }).order('created_at')
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, group: row.category_group, isDefault: row.is_default, active: row.active }))
}

export async function createCategory(workspace: BudgetWorkspace, input: { name: string; group: string }) {
  const { data, error } = await ensureClient().from('categories').insert({ workspace, name: input.name, category_group: input.group }).select().single()
  if (error) throw error
  return { id: data.id, name: data.name, group: data.category_group, isDefault: data.is_default, active: data.active } as Category
}

export async function loadBudgets(workspace: BudgetWorkspace): Promise<BudgetItem[]> {
  const { data, error } = await ensureClient().from('budget_items').select('*').eq('workspace', workspace).order('created_at')
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, categoryId: row.category_id, monthlyLimitUsd: number(row.monthly_limit_usd), active: row.active }))
}

export async function createBudget(workspace: BudgetWorkspace, input: { name: string; categoryId: number | null; monthlyLimitUsd: number; month: string; recurring: boolean }) {
  const { data, error } = await ensureClient().rpc('create_budget_with_allocation', { p_workspace: workspace, p_name: input.name, p_category_id: input.categoryId, p_month: `${input.month}-01`, p_amount: input.monthlyLimitUsd, p_recurring: input.recurring })
  if (error) throw error
  return data as number
}

export async function loadGoals(workspace: BudgetWorkspace): Promise<Goal[]> {
  const { data, error } = await ensureClient().from('goals').select('*').eq('workspace', workspace).order('target_date', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, targetAmountUsd: number(row.target_amount_usd), savedAmountUsd: number(row.saved_amount_usd), targetDate: row.target_date, active: row.active }))
}

export async function createGoal(workspace: BudgetWorkspace, input: { name: string; targetAmountUsd: number; savedAmountUsd: number; targetDate: string | null }) {
  const { data, error } = await ensureClient().from('goals').insert({ workspace, name: input.name, target_amount_usd: input.targetAmountUsd, saved_amount_usd: input.savedAmountUsd, target_date: input.targetDate }).select().single()
  if (error) throw error
  return { id: data.id, name: data.name, targetAmountUsd: number(data.target_amount_usd), savedAmountUsd: number(data.saved_amount_usd), targetDate: data.target_date, active: data.active } as Goal
}

export async function updateGoal(workspace: BudgetWorkspace, id: number, savedAmountUsd: number) {
  const { error } = await ensureClient().from('goals').update({ saved_amount_usd: savedAmountUsd, updated_at: new Date().toISOString() }).eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function contributeToGoal(workspace: BudgetWorkspace, goalId: number, amountUsd: number, note = '') {
  const { error } = await ensureClient().rpc('contribute_to_goal', { p_workspace: workspace, p_goal_id: goalId, p_amount: amountUsd, p_note: note })
  if (error) throw error
}

export async function createAccountTransfer(workspace: BudgetWorkspace, input: { fromAccountId: number; toAccountId: number; date: string; originalAmount: number; originalCurrency: Currency; exchangeRate: number; note: string }) {
  const { error } = await ensureClient().rpc('create_account_transfer', { p_workspace: workspace, p_from_account_id: input.fromAccountId, p_to_account_id: input.toAccountId, p_date: input.date, p_original_amount: input.originalAmount, p_original_currency: input.originalCurrency, p_rate: input.exchangeRate, p_note: input.note })
  if (error) throw error
}

async function loadGoalContributions(workspace: BudgetWorkspace): Promise<GoalContribution[]> {
  const { data, error } = await ensureClient().from('goal_contributions').select('*').eq('workspace', workspace).order('contribution_date', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return []
  if (error) throw error
  return data.map((row) => ({ id: row.id, goalId: row.goal_id, date: row.contribution_date, amountUsd: number(row.amount_usd), note: row.note }))
}

async function loadTransfers(workspace: BudgetWorkspace): Promise<AccountTransfer[]> {
  const { data, error } = await ensureClient().from('account_transfers').select('*').eq('workspace', workspace).order('transfer_date', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return []
  if (error) throw error
  return data.map((row) => ({ id: row.id, fromAccountId: row.from_account_id, toAccountId: row.to_account_id, date: row.transfer_date, amountUsd: number(row.amount_usd), originalAmount: number(row.original_amount), originalCurrency: row.original_currency, exchangeRate: number(row.exchange_rate_lbp_per_usd), note: row.note }))
}

async function loadCloseDistributions(workspace: BudgetWorkspace): Promise<MonthCloseDistribution[]> {
  const { data, error } = await ensureClient().from('month_close_distributions').select('*').eq('workspace', workspace).order('created_at', { ascending: false })
  if (error && (error.code === '42P01' || error.code === 'PGRST205')) return []
  if (error) throw error
  return data.map((row) => ({ id: row.id, monthlyBudgetId: row.monthly_budget_id, type: row.distribution_type, goalId: row.goal_id, amountUsd: number(row.amount_usd) }))
}

export async function loadSubscriptions(workspace: BudgetWorkspace): Promise<Subscription[]> {
  const { data, error } = await ensureClient().from('subscriptions').select('*').eq('workspace', workspace).order('due_day')
  if (error) throw error
  return data.map((row) => ({ id: row.id, name: row.name, originalAmount: number(row.original_amount), originalCurrency: row.original_currency, exchangeRate: number(row.exchange_rate_lbp_per_usd), amountUsd: number(row.amount_usd), dueDay: row.due_day, accountId: row.account_id, budgetItemId: row.budget_item_id, active: row.active, lastChargedMonth: row.last_charged_month }))
}

export async function createSubscription(workspace: BudgetWorkspace, input: { name: string; originalAmount: number; originalCurrency: Currency; exchangeRate: number; dueDay: number; accountId: number; budgetItemId: number | null }) {
  const amountUsd = input.originalCurrency === 'LBP' ? input.originalAmount / input.exchangeRate : input.originalAmount
  const { data, error } = await ensureClient().from('subscriptions').insert({ workspace, name: input.name, original_amount: input.originalAmount, original_currency: input.originalCurrency, exchange_rate_lbp_per_usd: input.exchangeRate, amount_usd: amountUsd, due_day: input.dueDay, account_id: input.accountId, budget_item_id: input.budgetItemId }).select().single()
  if (error) throw error
  return { id: data.id, name: data.name, originalAmount: number(data.original_amount), originalCurrency: data.original_currency, exchangeRate: number(data.exchange_rate_lbp_per_usd), amountUsd: number(data.amount_usd), dueDay: data.due_day, accountId: data.account_id, budgetItemId: data.budget_item_id, active: data.active, lastChargedMonth: data.last_charged_month } as Subscription
}

type ToggleTable = 'accounts' | 'categories' | 'budget_items' | 'goals' | 'subscriptions'
export async function toggleFinanceRecord(workspace: BudgetWorkspace, table: ToggleTable, id: number, active: boolean) {
  const { error } = await ensureClient().from(table).update({ active, updated_at: new Date().toISOString() }).eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function deleteFinanceRecord(workspace: BudgetWorkspace, table: ToggleTable, id: number) {
  const { error } = await ensureClient().from(table).delete().eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function loadManagedRecords(workspace: BudgetWorkspace, section: string): Promise<ManagedRecord[]> {
  const { data, error } = await ensureClient().from('managed_items').select('*').eq('workspace', workspace).eq('section', section).order('created_at')
  if (error) throw error
  return data.map((row) => ({ id: row.id, section: row.section, name: row.name, detail: row.detail, value: row.value, progress: row.progress, active: row.active }))
}

export async function createManagedRecord(workspace: BudgetWorkspace, record: Omit<ManagedRecord, 'id'>): Promise<ManagedRecord> {
  const { data, error } = await ensureClient().from('managed_items').insert({ ...record, workspace }).select().single()
  if (error) throw error
  return { id: data.id, section: data.section, name: data.name, detail: data.detail, value: data.value, progress: data.progress, active: data.active }
}

export async function updateManagedRecord(workspace: BudgetWorkspace, id: number, patch: Partial<Pick<ManagedRecord, 'progress' | 'active'>>) {
  const { error } = await ensureClient().from('managed_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function deleteManagedRecord(workspace: BudgetWorkspace, id: number) {
  const { error } = await ensureClient().from('managed_items').delete().eq('workspace', workspace).eq('id', id)
  if (error) throw error
}

export async function loadWorkspaceSnapshot(workspace: BudgetWorkspace): Promise<WorkspaceSnapshot> {
  await Promise.all([generateSubscriptionReminders(workspace), processDueSubscriptions(workspace)])
  const [settings, monthlyBudgets, budgetAllocations, transactions, loadedNotifications, accounts, categories, budgets, goals, subscriptions, goalContributions, transfers, closeDistributions] = await Promise.all([
    loadSettings(workspace), loadMonthlyBudgets(workspace), loadBudgetAllocations(workspace), loadTransactions(workspace), loadNotifications(workspace), loadAccounts(workspace), loadCategories(workspace), loadBudgets(workspace), loadGoals(workspace), loadSubscriptions(workspace), loadGoalContributions(workspace), loadTransfers(workspace), loadCloseDistributions(workspace),
  ])
  let notifications = loadedNotifications
  if (settings.subscriptionRemindersEnabled) {
    const today = new Date(`${localDateKey()}T12:00:00`)
    let created = false
    for (const subscription of subscriptions.filter((item) => item.active)) {
      let due = new Date(today.getFullYear(), today.getMonth(), subscription.dueDay, 12)
      if (due < today) due = new Date(today.getFullYear(), today.getMonth() + 1, subscription.dueDay, 12)
      const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000)
      if (!settings.subscriptionReminderDays.includes(daysUntil)) continue
      const body = `${subscription.name} is due on ${due.toLocaleDateString('en-LB', { month: 'short', day: '2-digit', year: 'numeric' })} (${daysUntil} ${daysUntil === 1 ? 'day' : 'days'} remaining).`
      if (notifications.some((item) => item.title === 'Upcoming subscription' && item.body === body)) continue
      await createNotification(workspace, { title: 'Upcoming subscription', body, type: 'warning', actionTarget: 'Subscriptions', dedupeKey: `subscription:${subscription.id}:${due.toISOString().slice(0, 10)}:${daysUntil}` })
      created = true
    }
    if (created) notifications = await loadNotifications(workspace)
  }
  return { settings, monthlyBudgets, budgetAllocations, transactions, notifications, accounts, categories, budgets, goals, subscriptions, goalContributions, transfers, closeDistributions }
}

const cacheVersion = 5
const cacheKey = (userId: string, workspace: BudgetWorkspace) => `null-money:data:v${cacheVersion}:${userId}:${workspace}`
export function readWorkspaceCache(userId: string, workspace: BudgetWorkspace): WorkspaceSnapshot | null {
  try { const raw = localStorage.getItem(cacheKey(userId, workspace)); if (!raw) return null; const parsed = JSON.parse(raw); return Date.now() - Number(parsed.savedAt ?? 0) <= 300000 ? parsed.data as WorkspaceSnapshot : null } catch { return null }
}
export function writeWorkspaceCache(userId: string, workspace: BudgetWorkspace, data: WorkspaceSnapshot) {
  try { localStorage.setItem(cacheKey(userId, workspace), JSON.stringify({ savedAt: Date.now(), data })) } catch { /* cache is optional */ }
}
export function removeWorkspaceCache(userId: string, workspace: BudgetWorkspace) {
  try { localStorage.removeItem(cacheKey(userId, workspace)) } catch { /* cache is optional */ }
}
