import { useMemo, useState } from 'react'
import { Camera, CloseSquare, Plus } from 'react-iconly'
import type { Account, BudgetItem, Category, NewTransaction } from '../lib/budget-api'
import type { TransactionDraft } from '../lib/gemini'
import FormattedNumberInput from './FormattedNumberInput'
import { PremiumDateField, PremiumSelect } from './PremiumControls'

type ModalProps = { exchangeRate: number; accounts: Account[]; categories: Category[]; budgets: BudgetItem[]; draft?: TransactionDraft | null; onClose: () => void; onScanReceipt?: () => void; onAdd: (transaction: NewTransaction) => Promise<void> }

const current = new Date()
const today = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
const incomeCategories = ['Salary', 'Freelance', 'Bonus', 'Investment income', 'Other income', 'Custom']

export default function AddTransactionModal({ exchangeRate, accounts, categories, budgets, draft, onClose, onScanReceipt, onAdd }: ModalProps) {
  const [name, setName] = useState(draft?.name ?? '')
  const [amount, setAmount] = useState(draft?.amount ? String(draft.amount) : '')
  const [categoryId, setCategoryId] = useState(String(categories.find((item) => item.name.toLowerCase() === draft?.category?.toLowerCase())?.id ?? categories.find((item) => item.name === 'Food & dining')?.id ?? categories[0]?.id ?? ''))
  const [incomeCategory, setIncomeCategory] = useState(draft?.kind === 'income' && incomeCategories.includes(draft.category) ? draft.category : 'Salary')
  const [customIncomeCategory, setCustomIncomeCategory] = useState('')
  const [accountId, setAccountId] = useState(String(accounts.find((item) => item.active)?.id ?? ''))
  const [kind, setKind] = useState<'expense' | 'income'>(draft?.kind ?? 'expense')
  const [currency, setCurrency] = useState<'USD' | 'LBP'>(draft?.currency ?? 'USD')
  const [transactionRate, setTransactionRate] = useState(String(exchangeRate))
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(draft?.date ?? '') ? draft!.date : today)
  const [notes, setNotes] = useState(draft?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const parsedAmount = Math.abs(Number(amount))
  const parsedRate = Number(transactionRate)
  const usdPreview = useMemo(() => currency === 'LBP' && parsedRate > 0 ? parsedAmount / parsedRate : parsedAmount, [currency, parsedAmount, parsedRate])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !date || !accountId) return setError('Add a name, account, date, and amount greater than zero.')
    if (currency === 'LBP' && (!Number.isFinite(parsedRate) || parsedRate <= 0)) return setError('Enter a valid LBP exchange rate.')
    if (kind === 'income' && incomeCategory === 'Custom' && !customIncomeCategory.trim()) return setError('Name the custom income source.')
    const expenseCategory = categories.find((item) => item.id === Number(categoryId))
    const linkedBudget = kind === 'expense' ? budgets.find((item) => item.active && item.categoryId === expenseCategory?.id) : undefined
    setSubmitting(true); setError('')
    try {
      await onAdd({
        name: name.trim(),
        category: kind === 'income' ? (incomeCategory === 'Custom' ? customIncomeCategory.trim() : incomeCategory) : expenseCategory?.name ?? 'Other',
        date,
        amount: Number((usdPreview * (kind === 'expense' ? -1 : 1)).toFixed(2)),
        kind,
        originalAmount: parsedAmount,
        originalCurrency: currency,
        exchangeRate: currency === 'LBP' ? parsedRate : exchangeRate,
        notes: notes.trim(),
        accountId: Number(accountId),
        budgetItemId: linkedBudget?.id ?? null,
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save this transaction.')
      setSubmitting(false)
    }
  }

  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <form className="glass modal transaction-modal" onSubmit={submit} noValidate>
      <div className="modal-title"><div><span className="signal-dot" />{draft ? 'REVIEW TRANSACTION' : 'NEW TRANSACTION'}</div><div className="modal-title-actions">{onScanReceipt ? <button className="scan-receipt-link" type="button" onClick={onScanReceipt} aria-label="Scan receipt"><Camera set="curved" size={17} /><span>SCAN RECEIPT</span></button> : null}<button type="button" onClick={onClose} aria-label="Close"><CloseSquare set="curved" /></button></div></div>
      <div className="kind-toggle" aria-label="Transaction type">{(['expense', 'income'] as const).map((item) => <button type="button" className={kind === item ? 'active' : ''} onClick={() => setKind(item)} key={item}>{item.toUpperCase()}</button>)}</div>
      <label className="amount-field"><span>AMOUNT</span><FormattedNumberInput autoFocus value={amount} onValueChange={setAmount} allowDecimals={currency === 'USD'} placeholder={currency === 'USD' ? '0.00' : '0'} /></label>
      <div className="form-grid">
        <label><span>NAME</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={kind === 'income' ? 'e.g. August salary' : 'Transaction name'} maxLength={120} /></label>
        <label><span>CURRENCY</span><div className="modal-currency">{(['USD', 'LBP'] as const).map((item) => <button key={item} type="button" className={currency === item ? 'active' : ''} onClick={() => setCurrency(item)}>{item}</button>)}</div></label>
        <label><span>CATEGORY</span>{kind === 'expense' ? <PremiumSelect value={categoryId} onChange={setCategoryId} label="Expense category" options={categories.filter((item) => item.active).map((item) => ({ value:String(item.id), label:item.name }))} /> : <PremiumSelect value={incomeCategory} onChange={setIncomeCategory} label="Income source" options={incomeCategories.map((item) => ({ value:item, label:item.toUpperCase() }))} />}</label>
        {kind === 'income' && incomeCategory === 'Custom' ? <label><span>CUSTOM INCOME SOURCE</span><input value={customIncomeCategory} onChange={(event) => setCustomIncomeCategory(event.target.value)} placeholder="e.g. Consulting" maxLength={80} /></label> : null}
        <label><span>DATE</span><PremiumDateField value={date} onChange={setDate} label="Transaction date" /></label>
        <label><span>ACCOUNT</span><PremiumSelect value={accountId} onChange={setAccountId} label="Transaction account" options={[{ value:'', label:'SELECT ACCOUNT' },...accounts.filter((item) => item.active).map((item) => ({ value:String(item.id), label:`${item.name} · ${item.currency}` }))]} /></label>
        {currency === 'LBP' ? <label><span>LBP PER 1 USD</span><FormattedNumberInput value={transactionRate} onValueChange={setTransactionRate} allowDecimals={false} placeholder="89,500" /><small className="field-hint">DEFAULT {exchangeRate.toLocaleString('en-US')} · EDIT FOR THIS ENTRY</small></label> : null}
      </div>
      <label className="notes-field"><span>NOTES · OPTIONAL</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Add context for later" maxLength={500} /></label>
      <div className="conversion-preview"><span>{currency === 'LBP' ? 'CONVERTED VALUE' : 'RATE LOCKED FOR THIS ENTRY'}</span><strong>{currency === 'LBP' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(usdPreview || 0) : `1 USD = ${exchangeRate.toLocaleString('en-US')} LBP`}</strong><small>Future rate changes will not alter this transaction.</small></div>
      {!accounts.length ? <div className="form-error" role="alert">Create an account before adding transactions.</div> : null}
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      <button className="submit-transaction" type="submit" disabled={submitting || !accounts.length}><Plus set="curved" size={18} />{submitting ? 'SAVING…' : 'ADD TO LEDGER'}</button>
    </form>
  </div>
}
