import { useEffect, useMemo, useState } from 'react'
import { Delete, Plus } from 'react-iconly'
import { createManagedRecord, deleteManagedRecord, loadManagedRecords, updateManagedRecord, type BudgetWorkspace, type ManagedRecord } from '../lib/budget-api'
import { Glass } from './Glass'
import ActiveToggle from './ActiveToggle'

type ManagedItem = ManagedRecord
type ModuleConfig = { intro: string; action: string; detailLabel: string; valueLabel: string; metrics: [string, string][]; items: Omit<ManagedRecord, 'section'>[] }

const configs: Record<string, ModuleConfig> = {
  Accounts: { intro: 'Your connected balances, organized in one clear view.', action: 'ADD ACCOUNT', detailLabel: 'ACCOUNT TYPE', valueLabel: 'BALANCE', metrics: [['TOTAL BALANCE', '$12,840.60'], ['AVAILABLE', '$10,290.60'], ['CONNECTED', '04']], items: [{ id: 1, name: 'Main checking', detail: 'Checking · USD', value: '$8,420.60', progress: 72, active: true }, { id: 2, name: 'Emergency fund', detail: 'Savings · USD', value: '$4,420.00', progress: 48, active: true }] },
  Budgets: { intro: 'Set limits, follow your pace, and protect what matters.', action: 'ADD BUDGET', detailLabel: 'PERIOD', valueLabel: 'LIMIT', metrics: [['MONTHLY LIMIT', '$6,400'], ['USED', '68%'], ['REMAINING', '$2,047.79']], items: [{ id: 1, name: 'Essentials', detail: 'Monthly', value: '$4,200', progress: 74, active: true }, { id: 2, name: 'Flexible spending', detail: 'Monthly', value: '$1,400', progress: 52, active: true }] },
  Goals: { intro: 'A focused view of the milestones you are building toward.', action: 'ADD GOAL', detailLabel: 'TARGET DATE', valueLabel: 'TARGET', metrics: [['ACTIVE GOALS', '03'], ['SAVED', '$8,250'], ['NEXT TARGET', '$10,000']], items: [{ id: 1, name: 'Emergency reserve', detail: 'Dec 2026', value: '$10,000', progress: 82, active: true }, { id: 2, name: 'Japan trip', detail: 'Apr 2027', value: '$4,500', progress: 46, active: true }, { id: 3, name: 'New studio', detail: 'Sep 2027', value: '$18,000', progress: 21, active: true }] },
  Categories: { intro: 'Understand where your money moves each month.', action: 'ADD CATEGORY', detailLabel: 'GROUP', valueLabel: 'MONTHLY LIMIT', metrics: [['TOP CATEGORY', 'HOUSING'], ['TRACKED', '08'], ['AVG. USE', '57%']], items: [{ id: 1, name: 'Housing', detail: 'Essential', value: '$2,500', progress: 78, active: true }, { id: 2, name: 'Food & dining', detail: 'Lifestyle', value: '$900', progress: 69, active: true }, { id: 3, name: 'Transport', detail: 'Essential', value: '$500', progress: 56, active: true }] },
  Subscriptions: { intro: 'Recurring payments, surfaced before they renew.', action: 'ADD SUBSCRIPTION', detailLabel: 'NEXT BILLING', valueLabel: 'MONTHLY', metrics: [['MONTHLY', '$84.97'], ['ACTIVE', '06'], ['NEXT DUE', 'AUG 19']], items: [{ id: 1, name: 'Netflix', detail: 'Aug 19', value: '$11.99', progress: 70, active: true }, { id: 2, name: 'Spotify', detail: 'Aug 22', value: '$10.99', progress: 44, active: true }, { id: 3, name: 'iCloud+', detail: 'Aug 28', value: '$2.99', progress: 25, active: true }] },
  Investments: { intro: 'Track long-term positions without losing today’s context.', action: 'ADD POSITION', detailLabel: 'ASSET CLASS', valueLabel: 'MARKET VALUE', metrics: [['PORTFOLIO', '$24,880'], ['RETURN', '+8.4%'], ['POSITIONS', '07']], items: [{ id: 1, name: 'S&P 500 ETF', detail: 'Equity', value: '$12,480', progress: 68, active: true }, { id: 2, name: 'Bitcoin', detail: 'Digital asset', value: '$6,920', progress: 41, active: true }, { id: 3, name: 'Treasury fund', detail: 'Fixed income', value: '$5,480', progress: 54, active: true }] },
  Settings: { intro: 'Tune alerts, security, and account preferences.', action: 'ADD PREFERENCE', detailLabel: 'TYPE', valueLabel: 'VALUE', metrics: [['BASE CURRENCY', 'USD'], ['THEME', 'SYSTEM'], ['SYNC', 'ACTIVE']], items: [{ id: 1, name: 'Budget alerts', detail: 'Notification', value: 'ON', progress: 100, active: true }, { id: 2, name: 'Weekly summary', detail: 'Email', value: 'ON', progress: 100, active: true }] },
}

export default function ManagedModule({ workspace, section, onNotice }: { workspace: BudgetWorkspace; section: string; onNotice: (message: string) => void }) {
  const config = configs[section] ?? configs.Accounts
  const [items, setItems] = useState<ManagedItem[]>([])
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState('')
  const [detail, setDetail] = useState('')
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const activeCount = useMemo(() => items.filter((item) => item.active).length, [items])
  const metricValue = (label: string, seededValue: string) => {
    if (['ACTIVE GOALS', 'ACTIVE', 'CONNECTED', 'TRACKED', 'POSITIONS'].includes(label)) return String(activeCount).padStart(2, '0')
    if (workspace === 'test') return seededValue
    if (label === 'RETURN' || label === 'AVG. USE') return '0%'
    if (label === 'SYNC') return 'ACTIVE'
    if (label === 'BASE CURRENCY') return 'USD'
    if (label === 'THEME') return 'SYSTEM'
    if (label === 'NEXT DUE' || label === 'NEXT TARGET' || label === 'TOP CATEGORY') return '—'
    return '$0.00'
  }
  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    loadManagedRecords(workspace, section).then((records) => { if (active) setItems(records) }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : 'Could not load this section.') }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [section, workspace])

  const addItem = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !value.trim()) return
    setSaving(true); setError('')
    try {
      const record = await createManagedRecord(workspace, { section, name: name.trim(), detail: detail.trim() || 'Unassigned', value: value.trim(), progress: 12, active: true })
      setItems((current) => [...current, record]); setName(''); setDetail(''); setValue(''); setEditing(false); onNotice(`${section.toUpperCase()} ITEM SAVED`)
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not save this item.') }
    finally { setSaving(false) }
  }
  const updateProgress = async (item: ManagedItem, delta: number) => { try { const progress = Math.max(0, Math.min(100, item.progress + delta)); await updateManagedRecord(workspace, item.id, { progress }); setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, progress } : entry)) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update progress.') } }
  const toggle = async (item: ManagedItem) => { const next = !item.active; setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, active: next } : entry)); try { await updateManagedRecord(workspace, item.id, { active: next }) } catch (reason) { setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, active: item.active } : entry)); setError(reason instanceof Error ? reason.message : 'Could not update this item.') } }
  const remove = async (item: ManagedItem) => { if (!window.confirm(`Delete ${item.name}? This cannot be undone.`)) return; try { await deleteManagedRecord(workspace, item.id); setItems((current) => current.filter((entry) => entry.id !== item.id)); onNotice(`${item.name.toUpperCase()} REMOVED`) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not delete this item.') } }

  return <Glass className="module-view managed-module">
    <div className="module-heading"><div><span>NULL / {section.toUpperCase()}</span><h1>{section.toUpperCase()}</h1><p>{config.intro}</p></div><button onClick={() => setEditing((current) => !current)}><Plus set="curved" size={18} />{editing ? 'CLOSE' : config.action}</button></div>
    <div className="module-metrics">{config.metrics.map(([label, metric], index) => <div key={label}><span>0{index + 1} / {label}</span><strong>{metricValue(label, metric)}</strong><i /></div>)}</div>
    {editing && <form className="module-form" onSubmit={addItem}><label><span>NAME</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder={`New ${section.toLowerCase()} item`} autoFocus /></label><label><span>{config.detailLabel}</span><input value={detail} onChange={(event) => setDetail(event.target.value)} placeholder={config.detailLabel.toLowerCase()} /></label><label><span>{config.valueLabel}</span><input value={value} onChange={(event) => setValue(event.target.value)} placeholder="$0.00" /></label><button type="submit" disabled={saving}><Plus set="curved" size={17} />{saving ? 'SAVING…' : 'SAVE ITEM'}</button></form>}
    {error && <div className="data-status error" role="alert">{error}</div>}
    <div className="managed-list"><div className="managed-head"><span>ITEM</span><span>{config.detailLabel}</span><span>PROGRESS</span><span>{config.valueLabel}</span><span>ACTIONS</span></div>{loading ? <div className="managed-empty">LOADING SAVED ITEMS…</div> : items.map((item) => <div className={`managed-row ${item.active ? '' : 'inactive'}`} key={item.id}><div><i className="managed-index" /><strong>{item.name}</strong></div><span>{item.detail}</span><div className="managed-progress"><button onClick={() => updateProgress(item, -5)} aria-label={`Decrease ${item.name} progress`}>−</button><div><i style={{ width: `${item.progress}%` }} /></div><b>{item.progress}%</b><button onClick={() => updateProgress(item, 5)} aria-label={`Increase ${item.name} progress`}>+</button></div><strong>{item.value}</strong><div className="managed-actions"><ActiveToggle active={item.active} label={item.name} onToggle={() => toggle(item)} /><button onClick={() => remove(item)} aria-label={`Delete ${item.name}`}><Delete set="curved" size={18} /></button></div></div>)}{!loading && !items.length && <div className="managed-empty">NO ITEMS YET — USE {config.action}</div>}</div>
  </Glass>
}
