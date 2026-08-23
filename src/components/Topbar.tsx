import { useEffect, useRef, useState } from 'react'
import { Notification, Plus, Search } from 'react-iconly'
import type { BudgetWorkspace } from '../lib/budget-api'
import { Glass } from './Glass'

export type ThemeName = 'silver' | 'black' | 'red'
type TopbarProps = { search: string; setSearch: (value: string) => void; theme: ThemeName; setTheme: (theme: ThemeName) => void; currency: 'USD' | 'LBP'; setCurrency: (currency: 'USD' | 'LBP') => void; workspace: BudgetWorkspace; unreadCount: number; onAdd: () => void; onNotifications: () => void; onProfile: () => void; onSwitchWorkspace: () => void }

export default function Topbar({ search, setSearch, theme, setTheme, currency, setCurrency, workspace, unreadCount, onAdd, onNotifications, onProfile, onSwitchWorkspace }: TopbarProps) {
  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!profileOpen) return
    const close = (event: PointerEvent) => { if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false) }
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [profileOpen])

  return (
    <Glass as="header" className="topbar">
      <div className="mobile-brand">NULL MONEY</div>
      <label className="search-box"><Search set="curved" size={18} label="" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search transactions, categories..." /><span>⌘ K</span></label>
      <div className="top-actions">
        <div className="currency-segment" aria-label="Display currency">{(['USD', 'LBP'] as const).map((item) => <button className={currency === item ? 'active' : ''} onClick={() => setCurrency(item)} key={item}>{item}</button>)}</div>
        <button className={`workspace-chip ${workspace}`} onClick={onSwitchWorkspace} aria-label={`Switch from ${workspace} workspace`}><i />{workspace === 'live' ? 'LIVE' : 'TEST'}</button>
        <button className="icon-button notification" onClick={onNotifications} aria-label={`${unreadCount} unread notifications`}><Notification set="curved" size={20} />{unreadCount > 0 && <i>{unreadCount > 9 ? '9+' : unreadCount}</i>}</button>
        <div className="profile-control" ref={profileRef}>
          <button className="avatar" onClick={() => setProfileOpen((open) => !open)} aria-label="Profile and appearance" aria-expanded={profileOpen}>EN</button>
          {profileOpen && <div className="profile-menu glass" role="dialog" aria-label="Profile and appearance">
            <div className="profile-identity"><span>PERSONAL WORKSPACE</span><strong>ELIO NOHRA</strong></div>
            <div className="profile-theme"><span>APPEARANCE</span><div>{([['silver', 'LIGHT'], ['black', 'DARK'], ['red', 'RED']] as [ThemeName, string][]).map(([item, label]) => <button key={item} className={theme === item ? 'active' : ''} onClick={() => setTheme(item)}><i className={item} />{label}<b>{theme === item ? '✓' : ''}</b></button>)}</div></div>
            <button className="profile-settings" onClick={() => { setProfileOpen(false); onProfile() }}>OPEN SETTINGS <span>→</span></button>
          </div>}
        </div>
        <button className="mobile-add" onClick={onAdd} aria-label="Add transaction"><Plus set="curved" /></button>
      </div>
    </Glass>
  )
}
