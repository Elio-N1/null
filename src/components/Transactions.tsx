import { useEffect, useState } from 'react'
import { ArrowLeft, ArrowRight, Bag, Ticket, Wallet } from 'react-iconly'
import type { Transaction } from '../data'
import { Glass } from './Glass'

type TransactionsProps = { transactions: Transaction[]; pageSize?: number; formatMoney: (value: number) => string; onViewAll: () => void; onSelect: (transaction: Transaction) => void }

export default function Transactions({ transactions, pageSize = 5, formatMoney, onViewAll, onSelect }: TransactionsProps) {
  const [page, setPage] = useState(1)
  const pageCount = Math.max(1, Math.ceil(transactions.length / pageSize))
  useEffect(() => { setPage((current) => Math.min(current, pageCount)) }, [pageCount])
  const visibleTransactions = transactions.slice((page - 1) * pageSize, page * pageSize)
  return (
    <Glass className="transactions-panel">
      <div className="panel-heading"><div><span className="signal-dot" />RECENT ACTIVITY</div><button className="view-all" onClick={onViewAll}>VIEW ALL <ArrowRight set="curved" size={15} /></button></div>
      <div className="transaction-head"><span>MERCHANT</span><span>CATEGORY</span><span>DATE</span><span>AMOUNT</span></div>
      <div className="transaction-list">
        {visibleTransactions.length ? visibleTransactions.map((item) => {
          const Icon = item.category === 'Income' ? Wallet : item.category === 'Entertainment' ? Ticket : Bag
          return (
            <button className="transaction-row" key={item.id} onClick={() => onSelect(item)}>
              <span className="merchant"><i><Icon set="curved" size={18} /></i>{item.name}</span>
              <span>{item.category}{item.originalCurrency === 'LBP' ? ' · LBP' : ''}</span><span>{new Date(`${item.date}T12:00:00`).toLocaleDateString('en-LB', { month: 'short', day: 'numeric' })}</span>
              <strong className={item.kind}>{item.amount > 0 ? '+' : ''}{formatMoney(item.amount)}</strong>
            </button>
          )
        }) : <div className="empty-state">NO MATCHING ACTIVITY</div>}
      </div>
      {transactions.length > pageSize ? <div className="activity-pagination" aria-label="Recent activity pages"><button onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1} aria-label="Previous activity page"><ArrowLeft set="curved" size={16} /></button><span>PAGE <strong>{String(page).padStart(2, '0')}</strong> / {String(pageCount).padStart(2, '0')}</span><button onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount} aria-label="Next activity page"><ArrowRight set="curved" size={16} /></button></div> : null}
    </Glass>
  )
}
