import { ArrowRight } from 'react-iconly'
import { categoryBudgets } from '../data'
import { Glass } from './Glass'

export default function CategoryPanel({ onViewAll }: { onViewAll: () => void }) {
  return (
    <Glass className="category-panel">
      <div className="panel-heading"><div><span className="signal-dot" />CATEGORY BUDGETS</div><button className="view-all" onClick={onViewAll}>VIEW ALL <ArrowRight set="curved" size={15} /></button></div>
      <div className="category-list">
        {categoryBudgets.map((item, index) => {
          const percent = Math.round(item.spent / item.limit * 100)
          return (
            <div className="category-row" key={item.name}>
              <span className="category-index">0{index + 1}</span>
              <div><div className="category-data"><strong>{item.name}</strong><span>${item.spent.toLocaleString()} / ${item.limit.toLocaleString()}</span></div><div className="progress"><i style={{ width: `${percent}%` }} /></div></div>
              <span className="percent">{percent}%</span>
            </div>
          )
        })}
      </div>
    </Glass>
  )
}
