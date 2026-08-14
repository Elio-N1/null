import { useState } from 'react'
import { CloseSquare, Plus } from 'react-iconly'
import type { Transaction } from '../data'

type ModalProps = { onClose: () => void; onAdd: (transaction: Transaction) => void }

export default function AddTransactionModal({ onClose, onAdd }: ModalProps) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState('Food & dining')
  const [kind, setKind] = useState<'expense' | 'income'>('expense')

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (!name || !amount) return
    const numeric = Math.abs(Number(amount)) * (kind === 'expense' ? -1 : 1)
    onAdd({ id: Date.now(), name, category: kind === 'income' ? 'Income' : category, date: 'Aug 16', amount: numeric, kind })
  }

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form className="glass modal" onSubmit={submit}>
        <div className="modal-title"><div><span className="signal-dot" />NEW TRANSACTION</div><button type="button" onClick={onClose} aria-label="Close"><CloseSquare set="curved" /></button></div>
        <div className="kind-toggle">
          {(['expense', 'income'] as const).map((item) => <button type="button" className={kind === item ? 'active' : ''} onClick={() => setKind(item)} key={item}>{item.toUpperCase()}</button>)}
        </div>
        <label><span>NAME</span><input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Transaction name" /></label>
        <div className="form-grid">
          <label><span>AMOUNT · USD</span><input type="number" step="0.01" min="0" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label>
          <label><span>CATEGORY</span><select value={category} onChange={(event) => setCategory(event.target.value)} disabled={kind === 'income'}><option>Food & dining</option><option>Housing</option><option>Transport</option><option>Entertainment</option><option>Utilities</option><option>Shopping</option></select></label>
        </div>
        <button className="submit-transaction" type="submit"><Plus set="curved" size={18} />ADD TO LEDGER</button>
      </form>
    </div>
  )
}
