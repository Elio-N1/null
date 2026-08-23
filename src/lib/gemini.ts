import type { Account, BudgetItem, BudgetWorkspace, Category, Currency, Goal, Subscription } from './budget-api'
import type { Transaction } from '../data'
import { supabase } from './supabase'

export const DEFAULT_GEMINI_MODEL = 'gemini-1.5-flash'

export const AVAILABLE_GEMINI_MODELS = [
  { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: 'Fast multimodal model' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', description: 'High reasoning model' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast 2.0 model' },
  { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite', description: 'Lightweight low latency model' },
]

/** Pass through the model string exactly as chosen by the user without overrides. */
export const sanitizeModel = (model: string): string => model || DEFAULT_GEMINI_MODEL

export type GeminiStatus = { configured: boolean; model: string; capabilities: string[] }
export type TransactionDraft = { kind: 'expense' | 'income'; name: string; amount: number; currency: Currency; category: string; date: string; notes: string; accountId?: number }
export type ReceiptResult = TransactionDraft & { confidence: number; lineItems: Array<{ name: string; amount: number }> }
type RawReceiptResult = { merchant: string; total: number; currency: Currency; date: string; category: string; notes: string; confidence: number; lineItems: Array<{ name: string; amount: number }> }
export type GeminiAction = { type: 'none' | 'open_route' | 'draft_transaction'; route?: string; transaction?: TransactionDraft }
export type GeminiAnswer = { answer: string; action: GeminiAction; model: string }

export type FinanceAssistantContext = {
  workspace: BudgetWorkspace
  displayCurrency: Currency
  exchangeRate: number
  month: string
  summary?: {
    totalLiquidBalanceUsd: number
    mainAccountBalanceUsd: number
    unallocatedCashUsd: number
    spentThisMonthUsd: number
    incomeThisMonthUsd: number
    monthlyBudgetUsd: number
  }
  accounts: Array<Pick<Account, 'id' | 'name' | 'currency' | 'active'> & { balanceUsd?: number; primary?: boolean }>
  categories: Pick<Category, 'id' | 'name' | 'group' | 'active'>[]
  budgets: Pick<BudgetItem, 'id' | 'name' | 'categoryId' | 'monthlyLimitUsd' | 'active'>[]
  goals: Pick<Goal, 'id' | 'name' | 'targetAmountUsd' | 'savedAmountUsd' | 'targetDate' | 'active'>[]
  subscriptions: Pick<Subscription, 'id' | 'name' | 'amountUsd' | 'originalAmount' | 'originalCurrency' | 'dueDay' | 'active'>[]
  transactions: Pick<Transaction, 'id' | 'name' | 'category' | 'date' | 'amount' | 'kind' | 'originalAmount' | 'originalCurrency' | 'exchangeRate' | 'notes' | 'accountId'>[]
  transfers?: Array<{ id: number; fromAccountId: number; toAccountId: number; amount: number; date: string }>
}

const invoke = async <T>(body: Record<string, unknown>): Promise<T> => {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.functions.invoke('gemini-finance', { body })
  if (error) {
    let message = error.message
    try {
      const context = (error as { context?: Response }).context
      const payload = context ? await context.json() as { error?: string } : null
      if (payload?.error) message = payload.error
    } catch { /* use the function error */ }
    throw new Error(message)
  }
  return data as T
}

export type GeminiModelOption = { id: string; name: string; description: string }

export const getGeminiStatus = () => invoke<GeminiStatus>({ mode: 'status' })
export const fetchAvailableGeminiModels = (apiKey?: string) =>
  invoke<{ models: GeminiModelOption[] }>({ mode: 'list_models', apiKey }).then((res) => res.models)

export const saveGeminiKey = (apiKey: string, model?: string) => invoke<GeminiStatus>({ mode: 'configure', apiKey, model })
export const saveGeminiModel = (model: string) => invoke<GeminiStatus>({ mode: 'configure_model', model })

export const scanReceipt = (input: { image: string; mimeType: string; categories: string[] }) =>
  invoke<{ receipt: RawReceiptResult; model: string }>({ mode: 'receipt', ...input }).then(({ receipt }) => ({
    kind: 'expense' as const, name: receipt.merchant, amount: receipt.total, currency: receipt.currency,
    category: receipt.category, date: receipt.date, notes: receipt.notes, confidence: receipt.confidence, lineItems: receipt.lineItems,
  }))

export const askGemini = (prompt: string, context: FinanceAssistantContext) =>
  invoke<GeminiAnswer>({ mode: 'assistant', prompt, context })
