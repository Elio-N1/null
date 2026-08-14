import { useMemo, useState } from 'react'
import { ArrowRight, Plus } from 'react-iconly'
import AddTransactionModal from './components/AddTransactionModal'
import BudgetPulse from './components/BudgetPulse'
import CategoryPanel from './components/CategoryPanel'
import ChartPanel from './components/ChartPanel'
import ExchangePanel from './components/ExchangePanel'
import { Glass } from './components/Glass'
import Sidebar from './components/Sidebar'
import Topbar, { type ThemeName } from './components/Topbar'
import Transactions from './components/Transactions'
import { seedTransactions, type Transaction } from './data'

const RATE = 89500
const sectionCopy: Record<string, { title: string; intro: string; metrics: [string, string][] }> = {
  Accounts: { title: 'ACCOUNTS', intro: 'Your connected balances, organized in one clear view.', metrics: [['TOTAL BALANCE', '$12,840.60'], ['AVAILABLE', '$10,290.60'], ['CONNECTED', '04']] },
  Budgets: { title: 'BUDGETS', intro: 'Set limits, follow your pace, and protect what matters.', metrics: [['MONTHLY LIMIT', '$6,400'], ['USED', '68%'], ['REMAINING', '$2,047.79']] },
  Goals: { title: 'GOALS', intro: 'A focused view of the milestones you are building toward.', metrics: [['ACTIVE GOALS', '03'], ['SAVED', '$8,250'], ['NEXT TARGET', '$10,000']] },
  Categories: { title: 'CATEGORIES', intro: 'Understand where your money moves each month.', metrics: [['TOP CATEGORY', 'HOUSING'], ['TRACKED', '08'], ['AVG. USE', '57%']] },
  Subscriptions: { title: 'SUBSCRIPTIONS', intro: 'Recurring payments, surfaced before they renew.', metrics: [['MONTHLY', '$84.97'], ['ACTIVE', '06'], ['NEXT DUE', 'AUG 19']] },
  Investments: { title: 'INVESTMENTS', intro: 'Track long-term positions without losing today’s context.', metrics: [['PORTFOLIO', '$24,880'], ['RETURN', '+8.4%'], ['POSITIONS', '07']] },
  Settings: { title: 'SETTINGS', intro: 'Tune currency, appearance, alerts, and account preferences.', metrics: [['BASE CURRENCY', 'USD'], ['THEME', 'SYSTEM'], ['SYNC', 'ACTIVE']] },
}

function App() {
  const [theme, setTheme] = useState<ThemeName>('silver')
  const [currency, setCurrency] = useState<'USD' | 'LBP'>('USD')
  const [activeNav, setActiveNav] = useState('Dashboard')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [search, setSearch] = useState('')
  const [range, setRange] = useState('MONTH')
  const [month, setMonth] = useState('AUGUST')
  const [transactions, setTransactions] = useState(seedTransactions)
  const [showModal, setShowModal] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [send, setSend] = useState(100)
  const [reversed, setReversed] = useState(false)

  const filtered = useMemo(() => transactions.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(search.toLowerCase())), [transactions, search])
  const formatMoney = (value: number) => currency === 'USD' ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value) : `${Math.round(value * RATE).toLocaleString('en-US')} LBP`
  const addTransaction = (transaction: Transaction) => { setTransactions((current) => [transaction, ...current]); setShowModal(false); setNotice('TRANSACTION ADDED TO YOUR LEDGER') }
  const goTo = (section: string) => { setActiveNav(section); setSearch(''); setNotice(null) }

  return (
    <div className="app" data-theme={theme}>
      <div className="wallpaper" aria-hidden="true"><span className="orb red-orb" /><span className="orb silver-orb" /><span className="wire wire-one" /><span className="wire wire-two" /><span className="micro-grid" /></div>
      <div className={`app-shell ${sidebarCollapsed ? 'sidebar-is-collapsed' : ''}`}>
        <Sidebar active={activeNav} onSelect={goTo} collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((value) => !value)} />
        <div className="workspace">
          <Topbar search={search} setSearch={setSearch} theme={theme} setTheme={setTheme} currency={currency} setCurrency={setCurrency} onAdd={() => setShowModal(true)} onNotifications={() => setNotice('YOU ARE ALL CAUGHT UP')} onProfile={() => goTo('Settings')} />
          {activeNav === 'Dashboard' ? (
            <main>
              <div className="main-column">
                <Glass className="balance-panel"><div className="balance-copy"><span>GOOD MORNING, ELIO</span><h1>{formatMoney(12840.6)}</h1><div className="available"><i />AVAILABLE <span>+2.4% THIS MONTH</span></div></div><div className="balance-system" aria-hidden="true"><span>08 / 26</span><div>{Array.from({ length: 72 }, (_, i) => <i key={i} />)}</div><b /></div></Glass>
                <Glass className="overview-panel"><div className="panel-heading"><div><span className="signal-dot" />AUGUST OVERVIEW</div><span className="period-label">01 — 31 AUG</span></div><div className="metric-grid"><div><span>SPENT ↓</span><strong>{formatMoney(4352.21)}</strong><small><em>34%</em> vs last month</small></div><div><span>INCOME ↑</span><strong>{formatMoney(6890)}</strong><small><em>18%</em> vs last month</small></div><div><span>SAVINGS RATE</span><strong>19%</strong><small><em>+4%</em> vs last month</small></div></div></Glass>
                <ChartPanel range={range} setRange={setRange} />
                <Transactions transactions={filtered} formatMoney={formatMoney} onViewAll={() => goTo('Transactions')} onSelect={setSelectedTransaction} />
              </div>
              <div className="right-column"><BudgetPulse month={month} onMonthChange={setMonth} /><CategoryPanel onViewAll={() => goTo('Categories')} /><ExchangePanel send={send} setSend={setSend} reversed={reversed} setReversed={setReversed} /></div>
            </main>
          ) : activeNav === 'Transactions' ? (
            <Glass className="module-view"><div className="module-heading"><div><span>03 / LEDGER</span><h1>TRANSACTIONS</h1><p>Search, inspect, and add activity across your accounts.</p></div><button onClick={() => setShowModal(true)}><Plus set="curved" size={18} />ADD TRANSACTION</button></div><Transactions transactions={filtered} formatMoney={formatMoney} onViewAll={() => undefined} onSelect={setSelectedTransaction} /></Glass>
          ) : <ModuleView section={activeNav} onPrimary={() => setNotice(`${activeNav.toUpperCase()} UPDATED`)} />}
          <button className="add-transaction" onClick={() => setShowModal(true)}><i><Plus set="curved" size={20} /></i><span>ADD TRANSACTION</span><b>{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</b></button>
        </div>
      </div>
      {notice && <button className="section-toast glass" onClick={() => setNotice(null)}>{notice}<span> ×</span></button>}
      {selectedTransaction && <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setSelectedTransaction(null)}><Glass className="detail-sheet"><span>TRANSACTION DETAIL</span><h2>{selectedTransaction.name}</h2><dl><div><dt>CATEGORY</dt><dd>{selectedTransaction.category}</dd></div><div><dt>DATE</dt><dd>{selectedTransaction.date}</dd></div><div><dt>AMOUNT</dt><dd>{formatMoney(selectedTransaction.amount)}</dd></div></dl><button onClick={() => setSelectedTransaction(null)}>DONE</button></Glass></div>}
      {showModal && <AddTransactionModal onClose={() => setShowModal(false)} onAdd={addTransaction} />}
    </div>
  )
}

function ModuleView({ section, onPrimary }: { section: string; onPrimary: () => void }) {
  const copy = sectionCopy[section] ?? sectionCopy.Accounts
  return <Glass className="module-view"><div className="module-heading"><div><span>NULL / {copy.title}</span><h1>{copy.title}</h1><p>{copy.intro}</p></div><button onClick={onPrimary}>MANAGE <ArrowRight set="curved" size={17} /></button></div><div className="module-metrics">{copy.metrics.map(([label, value], index) => <div key={label}><span>0{index + 1} / {label}</span><strong>{value}</strong><i /></div>)}</div><div className="module-canvas"><div className="module-grid" /><p>SELECT AN ITEM TO VIEW ITS FULL DETAIL</p></div></Glass>
}

export default App
