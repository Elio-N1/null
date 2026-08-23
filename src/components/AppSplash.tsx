import { useEffect, useState } from 'react'

export default function AppSplash() {
  const [visible, setVisible] = useState(true)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    const leave = window.setTimeout(() => setLeaving(true), 650)
    const remove = window.setTimeout(() => setVisible(false), 980)
    return () => { window.clearTimeout(leave); window.clearTimeout(remove) }
  }, [])
  if (!visible) return null
  return <div className={`app-splash ${leaving ? 'leaving' : ''}`} aria-hidden="true">
    <div className="splash-glow" /><img src="/icons/null-money-192.png" alt="" />
    <div><strong>NULL MONEY</strong><span>PERSONAL FINANCE SYSTEM</span></div><i><b /></i>
  </div>
}
