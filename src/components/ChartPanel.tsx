import { MoreSquare } from 'react-iconly'
import { chartPaths } from '../data'
import { Glass } from './Glass'

type ChartPanelProps = {
  range: string
  setRange: (range: string) => void
}

export default function ChartPanel({ range, setRange }: ChartPanelProps) {
  return (
    <Glass className="chart-panel">
      <div className="panel-heading chart-heading">
        <div><span className="signal-dot" />CASH FLOW</div>
        <div className="range-tabs">
          {['DAY', 'WEEK', 'MONTH', 'YEAR'].map((item) => <button className={range === item ? 'active' : ''} onClick={() => setRange(item)} key={item}>{item}</button>)}
          <button className="more" aria-label="More chart options"><MoreSquare size={18} set="curved" /></button>
        </div>
      </div>
      <div className="legend"><span className="income" />Income <span className="expense" />Expenses <span className="net" />Net</div>
      <div className="chart-wrap">
        <div className="y-axis"><span>$8K</span><span>$6K</span><span>$4K</span><span>$2K</span><span>$0</span><span>−$2K</span><span>−$4K</span></div>
        <svg viewBox="0 0 840 220" preserveAspectRatio="none" role="img" aria-label="Monthly cash flow chart">
          <defs>
            <linearGradient id="area-red" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".15" /><stop offset="1" stopColor="var(--accent)" stopOpacity="0" /></linearGradient>
          </defs>
          <g className="grid-lines">{[28, 58, 88, 118, 148, 178, 208].map((y) => <line key={y} x1="0" x2="840" y1={y} y2={y} />)}</g>
          <path d={`${chartPaths.expense} L840 220 L0 220 Z`} fill="url(#area-red)" />
          <path className="line income" d={chartPaths.income} />
          <path className="line expense" d={chartPaths.expense} />
          <path className="line net" d={chartPaths.net} />
          {[0, 168, 336, 504, 672, 840].map((x, index) => <circle key={x} className="expense-point" cx={x} cy={[142, 117, 120, 103, 81, 64][index]} r="3" />)}
        </svg>
        <div className="x-axis"><span>AUG 1</span><span>AUG 6</span><span>AUG 11</span><span>AUG 16</span><span>AUG 21</span><span>AUG 26</span><span>AUG 31</span></div>
      </div>
    </Glass>
  )
}
