import { useState } from 'react'
import { ArrowRight, CloseSquare } from 'react-iconly'
import { createAccountTransfer, type Account, type BudgetWorkspace, type Currency } from '../lib/budget-api'
import FormattedNumberInput from './FormattedNumberInput'

const today = new Date().toISOString().slice(0, 10)

export default function AccountTransferModal({ workspace, accounts, exchangeRate, onClose, onSaved }: { workspace: BudgetWorkspace; accounts: Account[]; exchangeRate: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const active = accounts.filter((item) => item.active)
  const [from, setFrom] = useState(String(active[0]?.id ?? ''))
  const [to, setTo] = useState(String(active[1]?.id ?? ''))
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState<Currency>('USD')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); const parsed = Number(amount)
    if (!from || !to || from === to || !Number.isFinite(parsed) || parsed <= 0) return setError('Choose two different accounts and enter a valid amount.')
    setBusy(true); setError('')
    try { await createAccountTransfer(workspace, { fromAccountId: Number(from), toAccountId: Number(to), date, originalAmount: parsed, originalCurrency: currency, exchangeRate, note: note.trim() }); await onSaved(); onClose() }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this transfer.') }
    finally { setBusy(false) }
  }
  return <div className="modal-backdrop"><form className="glass modal transfer-modal" onSubmit={submit}><div className="modal-title"><div><span className="signal-dot" />ACCOUNT TRANSFER</div><button type="button" onClick={onClose} aria-label="Close"><CloseSquare set="curved" /></button></div><div className="transfer-route"><label><span>FROM</span><select value={from} onChange={(event) => setFrom(event.target.value)}><option value="">SELECT ACCOUNT</option>{active.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><ArrowRight set="curved" size={22} /><label><span>TO</span><select value={to} onChange={(event) => setTo(event.target.value)}><option value="">SELECT ACCOUNT</option>{active.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label></div><div className="form-grid"><label><span>AMOUNT</span><FormattedNumberInput value={amount} onValueChange={setAmount} allowDecimals={currency === 'USD'} /></label><label><span>CURRENCY</span><select value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}><option>USD</option><option>LBP</option></select></label><label><span>DATE</span><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label></div><label className="notes-field"><span>NOTE</span><textarea value={note} onChange={(event) => setNote(event.target.value)} /></label>{error ? <div className="form-error" role="alert">{error}</div> : null}<button className="submit-transaction" disabled={busy}>{busy ? 'SAVING…' : 'TRANSFER MONEY'}</button></form></div>
}
