import { useEffect, useState } from 'react'
import { Download } from 'react-iconly'

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

export default function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  useEffect(() => {
    const capture = (next: Event) => { next.preventDefault(); setEvent(next as InstallEvent) }
    const installed = () => setEvent(null)
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', installed)
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', installed) }
  }, [])
  if (!event) return null
  const install = async () => { await event.prompt(); await event.userChoice; setEvent(null) }
  return <aside className="install-prompt glass" aria-label="Install NULL Money">
    <img src="/icons/null-money-192.png" alt="" /><span><strong>INSTALL NULL MONEY</strong><small>Faster launch and offline access</small></span>
    <button onClick={install}><Download set="curved" size={18} />INSTALL</button><button className="install-dismiss" onClick={() => setEvent(null)} aria-label="Dismiss install prompt">×</button>
  </aside>
}
