import { Glass } from './Glass'

export default function BudgetPulse({ month, onMonthChange }: { month: string; onMonthChange: (month: string) => void }) {
  return (
    <Glass className="pulse-panel">
      <div className="panel-heading"><div><span className="signal-dot" />BUDGET PULSE</div><select className="text-control" value={month} onChange={(event) => onMonthChange(event.target.value)} aria-label="Budget month"><option>AUGUST</option><option>JULY</option><option>JUNE</option></select></div>
      <div className="pulse-visual">
        <svg viewBox="0 0 180 180" aria-hidden="true">
          <circle className="pulse-track" cx="90" cy="90" r="72" />
          <circle className="pulse-value" cx="90" cy="90" r="72" />
        </svg>
        <div><strong>68%</strong><span>OF BUDGET USED</span></div>
      </div>
      <div className="pulse-caption"><strong>$4,352.21</strong><span>of $6,400.00</span></div>
    </Glass>
  )
}
