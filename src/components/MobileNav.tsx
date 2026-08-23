import { Activity, Chart, Document, Home, MoreSquare, Plus, Setting, Ticket, Wallet } from 'react-iconly'
import { useEffect, useState } from 'react'

type MobileNavProps = { active: string; onSelect: (label: string) => void; onAdd: () => void }

const secondaryItems = [
  { label: 'Accounts', icon: Wallet }, { label: 'Goals', icon: Activity },
  { label: 'Subscriptions', icon: Ticket }, { label: 'Reports', icon: Chart },
  { label: 'Settings', icon: Setting },
]

export default function MobileNav({ active, onSelect, onAdd }: MobileNavProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  useEffect(() => setMoreOpen(false), [active])
  const goTo = (label: string) => { setMoreOpen(false); onSelect(label) }

  return <>
    <nav className="mobile-nav glass" aria-label="Mobile navigation">
      <button className={active === 'Dashboard' ? 'active' : ''} onClick={() => goTo('Dashboard')} aria-label="Dashboard"><Home set="curved" size={21} /><span>HOME</span></button>
      <button className={active === 'Budget' ? 'active' : ''} onClick={() => goTo('Budget')} aria-label="Budget"><Chart set="curved" size={21} /><span>BUDGET</span></button>
      <button className="mobile-nav-add" onClick={onAdd} aria-label="Add transaction"><i><Plus set="curved" size={23} /></i><span>ADD</span></button>
      <button className={active === 'Transactions' ? 'active' : ''} onClick={() => goTo('Transactions')} aria-label="Transactions"><Document set="curved" size={21} /><span>ACTIVITY</span></button>
      <button className={moreOpen || secondaryItems.some((item) => item.label === active) ? 'active' : ''} onClick={() => setMoreOpen((open) => !open)} aria-label="More" aria-expanded={moreOpen}><MoreSquare set="curved" size={21} /><span>MORE</span></button>
    </nav>
    {moreOpen ? <div className="mobile-more-layer" onMouseDown={(event) => event.target === event.currentTarget && setMoreOpen(false)}>
      <section className="mobile-more-sheet glass" role="dialog" aria-modal="true" aria-label="More destinations">
        <header><div><span>NULL / NAVIGATION</span><h2>MORE</h2></div><button onClick={() => setMoreOpen(false)} aria-label="Close menu">×</button></header>
        <div>{secondaryItems.map(({ label, icon: Icon }) => <button key={label} className={active === label ? 'active' : ''} onClick={() => goTo(label)}><Icon set="curved" size={22} /><span>{label}</span><b>→</b></button>)}</div>
      </section>
    </div> : null}
  </>
}
