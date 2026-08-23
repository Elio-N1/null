import { Activity, ArrowLeft, ArrowRight, Chart, Document, Home, Setting, Ticket, Wallet } from 'react-iconly'
import { DotMark, Glass } from './Glass'

const items = [
  { label: 'Dashboard', icon: Home }, { label: 'Budget', icon: Chart },
  { label: 'Transactions', icon: Document }, { label: 'Accounts', icon: Wallet },
  { label: 'Goals', icon: Activity }, { label: 'Subscriptions', icon: Ticket },
  { label: 'Reports', icon: Chart },
]

type SidebarProps = { active: string; onSelect: (label: string) => void; collapsed: boolean; onToggle: () => void }

export default function Sidebar({ active, onSelect, collapsed, onToggle }: SidebarProps) {
  return (
    <Glass as="aside" className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-row"><DotMark /><div><strong>NULL</strong><span>MONEY</span></div></div>
      <nav aria-label="Primary navigation">
        {items.map(({ label, icon: Icon }) => (
          <button key={label} title={collapsed ? label : undefined} className={`nav-item ${active === label ? 'active' : ''}`} onClick={() => onSelect(label)}>
            <Icon set="curved" stroke="regular" size={20} label="" /><span>{label}</span><i />
          </button>
        ))}
      </nav>
      <button className={`nav-item settings ${active === 'Settings' ? 'active' : ''}`} onClick={() => onSelect('Settings')} title={collapsed ? 'Settings' : undefined}>
        <Setting set="curved" size={20} label="" /><span>Settings</span><i />
      </button>
      <div className="sidebar-foot"><span>SYS / 08.26</span><span>● SYNCED</span></div>
      <button className="collapse-control" onClick={onToggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <ArrowRight set="curved" size={17} /> : <ArrowLeft set="curved" size={17} />}<span>{collapsed ? 'EXPAND' : 'COLLAPSE'}</span>
      </button>
    </Glass>
  )
}
