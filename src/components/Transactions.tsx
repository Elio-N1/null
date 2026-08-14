import { ArrowRight, Bag, Ticket, Wallet } from 'react-iconly'
import type { Transaction } from '../data'
import { Glass } from './Glass'

type TransactionsProps = { transactions: Transaction[]; formatMoney: (value: number) => string; onViewAll: () => void; onSelect: (transaction: Transaction) => void }

export default function Transactions({ transactions, formatMoney, onViewAll, onSelect }: TransactionsProps) {
  return (
    <Glass className="transactions-panel">
      <div className="panel-heading"><div><span className="signal-dot" />RECENT ACTIVITY</div><button className="view-all" onClick={onViewAll}>VIEW ALL <ArrowRight set="curved" size={15} /></button></div>
      <div className="transaction-head"><span>MERCHANT</span><span>CATEGORY</span><span>DATE</span><span>AMOUNT</span></div>
      <div className="transaction-list">
        {transactions.length ? transactions.map((item) => {
          const Icon = item.category === 'Income' ? Wallet : item.category === 'Entertainment' ? Ticket : Bag
          return (
            <button className="transaction-row" key={item.id} onClick={() => onSelect(item)}>
              <span className="merchant"><i><Icon set="curved" size={18} /></i>{item.name}</span>
              <span>{item.category}</span><span>{item.date}</span>
              <strong className={item.kind}>{item.amount > 0 ? '+' : ''}{formatMoney(item.amount)}</strong>
            </button>
          )
        }) : <div className="empty-state">NO MATCHING ACTIVITY</div>}
      </div>
    </Glass>
  )
}
