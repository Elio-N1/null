import { useMemo, useState } from 'react'
import { Download, Plus } from 'react-iconly'
import type { Transaction } from '../data'
import type { Account, Category } from '../lib/budget-api'
import { Glass } from './Glass'
import { PremiumDateField, PremiumSelect } from './PremiumControls'
import Transactions from './Transactions'

export default function LedgerModule({ transactions, accounts, categories, formatMoney, onAdd, onSelect }: { transactions: Transaction[]; accounts: Account[]; categories: Category[]; formatMoney: (value: number) => string; onAdd: () => void; onSelect: (item: Transaction) => void }) {
  const [kind, setKind] = useState('all')
  const [accountId, setAccountId] = useState('all')
  const [category, setCategory] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const filtered = useMemo(() => transactions.filter((item) => (kind === 'all' || item.kind === kind) && (accountId === 'all' || item.accountId === Number(accountId)) && (category === 'all' || item.category === category) && (!from || item.date >= from) && (!to || item.date <= to)), [transactions, kind, accountId, category, from, to])
  const exportCsv = () => {
    const rows = [['Date', 'Name', 'Type', 'Category', 'Account', 'Original amount', 'Currency', 'USD amount', 'Locked rate', 'Notes'], ...filtered.map((item) => [item.date, item.name, item.kind, item.category, accounts.find((account) => account.id === item.accountId)?.name ?? '', item.originalAmount ?? '', item.originalCurrency ?? '', item.amount, item.exchangeRate ?? '', item.notes ?? ''])]
    const csv = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'null-money-transactions.csv'; anchor.click(); URL.revokeObjectURL(url)
  }
  return <Glass className="module-view ledger-module"><div className="module-heading"><div><span>NULL / LEDGER</span><h1>TRANSACTIONS</h1><p>Filter, inspect, export, and add activity across every liquid account.</p></div><div className="heading-actions"><button className="secondary-action" onClick={exportCsv}><Download set="curved" size={18} />EXPORT CSV</button><button onClick={onAdd}><Plus set="curved" size={18} />ADD TRANSACTION</button></div></div><div className="ledger-filters"><label><span>TYPE</span><PremiumSelect value={kind} onChange={setKind} label="Transaction type filter" options={[{value:'all',label:'ALL'},{value:'income',label:'INCOME'},{value:'expense',label:'EXPENSE'}]} /></label><label><span>ACCOUNT</span><PremiumSelect value={accountId} onChange={setAccountId} label="Account filter" options={[{value:'all',label:'ALL ACCOUNTS'},...accounts.map((item) => ({value:String(item.id),label:item.name}))]} /></label><label><span>CATEGORY</span><PremiumSelect value={category} onChange={setCategory} label="Category filter" options={[{value:'all',label:'ALL CATEGORIES'},...categories.map((item) => ({value:item.name,label:item.name}))]} /></label><label><span>FROM</span><PremiumDateField value={from} onChange={setFrom} label="Filter from date" /></label><label><span>TO</span><PremiumDateField value={to} onChange={setTo} label="Filter to date" /></label><strong>{filtered.length} ENTRIES</strong></div><Transactions transactions={filtered} formatMoney={formatMoney} onViewAll={() => undefined} onSelect={onSelect} /></Glass>
}
