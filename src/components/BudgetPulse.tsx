import { Glass } from './Glass'
import { PremiumSelect } from './PremiumControls'

export default function BudgetPulse({ month, onMonthChange, spent, budget, formatMoney }: { month: string; onMonthChange: (month: string) => void; spent: number; budget: number; formatMoney: (value: number) => string }) {
  const percent = budget > 0 ? Math.min(100, Math.round(spent / budget * 100)) : 0
  const months = Array.from({ length: 18 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() + 3 - index); const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; return { value, label: date.toLocaleDateString('en-LB', { month: 'long', year: 'numeric' }).toUpperCase() } })
  return (
    <Glass className="pulse-panel">
      <div className="panel-heading"><div><span className="signal-dot" />BUDGET PULSE</div><PremiumSelect compact value={month} onChange={onMonthChange} label="Budget month" options={months} /></div>
      <div className="pulse-visual">
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle className="pulse-track" cx="90" cy="90" r="72" />
          <circle className="pulse-value" cx="90" cy="90" r="72" style={{ strokeDasharray: `${percent / 100 * 452} 452` }} />
        </svg>
        <div><strong>{percent}%</strong><span>OF BUDGET USED</span></div>
      </div>
      <div className="pulse-caption"><strong>{formatMoney(Math.max(0, budget - spent))}</strong><span>remaining of {formatMoney(budget)}</span></div>
    </Glass>
  )
}
