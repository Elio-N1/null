import { useMemo, useState } from 'react'
import { MoreSquare } from 'react-iconly'
import type { Transaction } from '../data'
import { Glass } from './Glass'

type ChartPanelProps = { range: string; setRange: (range: string) => void; transactions: Transaction[]; month: string }
type Point = { x: number; date: string; incomeY: number; expenseY: number; netY: number; income: number; expense: number; net: number }

const windowDays: Record<string, number> = { DAY: 1, WEEK: 7, MONTH: 31, YEAR: 365 }
const makePath = (points: Point[], key: 'incomeY' | 'expenseY' | 'netY') => points.map((point, index) => `${index ? 'L' : 'M'}${point.x} ${point[key]}`).join(' ')
const usd = (value: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)

export default function ChartPanel({ range, setRange, transactions, month }: ChartPanelProps) {
  const [hovered, setHovered] = useState<number | null>(null)
  const points = useMemo<Point[]>(() => {
    const valid = transactions.map((item) => ({ ...item, timestamp: new Date(`${item.date}T12:00:00`).getTime() })).filter((item) => Number.isFinite(item.timestamp)).sort((a, b) => a.timestamp - b.timestamp)
    const [year, monthNumber] = month.split('-').map(Number)
    const monthStart = new Date(year, monthNumber - 1, 1, 12).getTime()
    const monthEnd = new Date(year, monthNumber, 0, 12).getTime()
    const today = new Date(); today.setHours(12, 0, 0, 0)
    const end = month === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` ? Math.min(today.getTime(), monthEnd) : monthEnd
    const start = range === 'MONTH' ? monthStart : range === 'YEAR' ? new Date(year, 0, 1, 12).getTime() : end - (windowDays[range] - 1) * 86400000
    const ticks = Array.from({ length: 7 }, (_, index) => start + (end - start) * index / 6)
    const values = ticks.map((tick, index) => {
      const entries = valid.filter((item) => item.timestamp >= start && item.timestamp <= tick)
      const income = entries.filter((item) => item.kind === 'income').reduce((sum, item) => sum + item.amount, 0)
      const expense = entries.filter((item) => item.kind === 'expense').reduce((sum, item) => sum + Math.abs(item.amount), 0)
      return { x: 8 + index * 824 / 6, tick, income, expense, net: income - expense }
    })
    const scale = Math.max(1, ...values.flatMap((point) => [point.income, point.expense, Math.abs(point.net)]))
    return values.map((point) => ({ ...point, date: new Date(point.tick).toLocaleDateString('en-LB', range === 'YEAR' ? { month: 'short', year: '2-digit' } : { month: 'short', day: 'numeric' }).toUpperCase(), incomeY: 190 - point.income / scale * 150, expenseY: 190 - point.expense / scale * 150, netY: Math.min(211, 190 - point.net / scale * 150) }))
  }, [range, transactions, month])
  const activePoint = hovered === null ? null : points[hovered]
  const incomePath = makePath(points, 'incomeY')
  const expensePath = makePath(points, 'expenseY')
  const netPath = makePath(points, 'netY')

  return (
    <Glass className="chart-panel">
      <div className="panel-heading chart-heading"><div><span className="signal-dot" />CASH FLOW</div><div className="range-tabs">{['DAY', 'WEEK', 'MONTH', 'YEAR'].map((item) => <button className={range === item ? 'active' : ''} onClick={() => setRange(item)} key={item}>{item}</button>)}<button className="more" onClick={() => setRange(range === 'YEAR' ? 'DAY' : 'YEAR')} aria-label="Toggle extended chart range"><MoreSquare size={18} set="curved" /></button></div></div>
      <div className="legend"><span className="income" />Income <span className="expense" />Expenses <span className="net" />Net</div>
      <div className="chart-wrap" onMouseLeave={() => setHovered(null)}>
        <div className="y-axis"><span>HIGH</span><span /><span /><span>MID</span><span /><span /><span>ZERO</span></div>
        <svg key={`${range}-${transactions.length}`} data-range={range} viewBox="0 0 840 220" preserveAspectRatio="none" role="img" aria-label={`${range.toLowerCase()} cash flow chart based on saved transactions`}>
          <defs><linearGradient id="area-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".18" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient></defs>
          <g className="grid-lines">{[28, 58, 88, 118, 148, 178, 208].map((y) => <line key={y} x1="0" x2="840" y1={y} y2={y} />)}</g>
          <path d={`${expensePath} L832 220 L8 220 Z`} fill="url(#area-red)" />
          <path className="line income" d={incomePath} /><path className="line expense" d={expensePath} /><path className="line net" d={netPath} />
          <path className="motion-line income-motion" d={incomePath} /><path className="motion-line expense-motion" d={expensePath} /><path className="motion-line net-motion" d={netPath} />
          {points.map((point, index) => <g key={`${point.date}-${index}`} className={hovered === index ? 'point-group active' : 'point-group'}><line className="point-guide" x1={point.x} x2={point.x} y1="24" y2="208" /><circle className="chart-point income-point" cx={point.x} cy={point.incomeY} r="3.5" /><circle className="chart-point expense-point" cx={point.x} cy={point.expenseY} r="4" /><circle className="chart-point net-point" cx={point.x} cy={point.netY} r="3.5" /><circle className="hover-target" cx={point.x} cy={(point.incomeY + point.expenseY + point.netY) / 3} r="28" tabIndex={0} role="button" aria-label={`Cash flow details ${point.date}`} onMouseEnter={() => setHovered(index)} onFocus={() => setHovered(index)} onBlur={() => setHovered(null)} /></g>)}
        </svg>
        {activePoint && <div className="chart-tooltip" role="status" style={{ left: `${Math.min(86, Math.max(12, activePoint.x / 840 * 100))}%`, top: `${Math.max(4, activePoint.expenseY / 220 * 76 - 18)}%` }}><strong>{activePoint.date}</strong><span><i className="income" />Income <b>{usd(activePoint.income)}</b></span><span><i className="expense" />Expenses <b>{usd(activePoint.expense)}</b></span><span><i className="net" />Net <b>{usd(activePoint.net)}</b></span></div>}
        <div className="x-axis">{points.map((point, index) => <span key={`${point.date}-${index}`}>{point.date}</span>)}</div>
      </div>
    </Glass>
  )
}
