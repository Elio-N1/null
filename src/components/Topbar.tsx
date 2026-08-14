import { Notification, Plus, Search } from 'react-iconly'
import { Glass } from './Glass'

export type ThemeName = 'silver' | 'black' | 'red'
type TopbarProps = { search: string; setSearch: (value: string) => void; theme: ThemeName; setTheme: (theme: ThemeName) => void; currency: 'USD' | 'LBP'; setCurrency: (currency: 'USD' | 'LBP') => void; onAdd: () => void; onNotifications: () => void; onProfile: () => void }

export default function Topbar({ search, setSearch, theme, setTheme, currency, setCurrency, onAdd, onNotifications, onProfile }: TopbarProps) {
  return (
    <Glass as="header" className="topbar">
      <div className="mobile-brand">NULL MONEY</div>
      <label className="search-box"><Search set="curved" size={18} label="" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions, categories..." /><span>⌘ K</span></label>
      <div className="top-actions">
        <div className="currency-segment" aria-label="Display currency">{(['USD', 'LBP'] as const).map((item) => <button className={currency === item ? 'active' : ''} onClick={() => setCurrency(item)} key={item}>{item}</button>)}</div>
        <div className="theme-switch" aria-label="Theme">{(['silver', 'black', 'red'] as ThemeName[]).map((item) => <button key={item} title={`${item} theme`} aria-label={`${item} theme`} className={`${item} ${theme === item ? 'active' : ''}`} onClick={() => setTheme(item)} />)}</div>
        <button className="icon-button notification" onClick={onNotifications} aria-label="Notifications"><Notification set="curved" size={20} /><i /></button>
        <button className="avatar" onClick={onProfile} aria-label="Profile">EN</button>
        <button className="mobile-add" onClick={onAdd} aria-label="Add transaction"><Plus set="curved" /></button>
      </div>
    </Glass>
  )
}
