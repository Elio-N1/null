import { Swap } from 'react-iconly'
import { Glass } from './Glass'

type ExchangePanelProps = {
  send: number
  setSend: (value: number) => void
  reversed: boolean
  setReversed: (value: boolean) => void
}

const RATE = 89500

export default function ExchangePanel({ send, setSend, reversed, setReversed }: ExchangePanelProps) {
  const converted = reversed ? send / RATE : send * RATE
  return (
    <Glass className="exchange-panel">
      <div className="panel-heading"><div><span className="signal-dot" />USD / LBP</div><span className="live-time">● LIVE</span></div>
      <div className="exchange-body">
        <label><span>YOU SEND · {reversed ? 'LBP' : 'USD'}</span><input type="number" min="0" value={send} onChange={(event) => setSend(Number(event.target.value))} /></label>
        <button className="swap-button" onClick={() => setReversed(!reversed)} aria-label="Swap currencies"><Swap set="curved" size={22} /></button>
        <label><span>YOU RECEIVE · {reversed ? 'USD' : 'LBP'}</span><strong>{converted.toLocaleString('en-US', { maximumFractionDigits: reversed ? 2 : 0 })}</strong></label>
      </div>
      <div className="exchange-meta"><span>1 USD = 89,500 LBP</span><span className="down">−0.32% ↓</span></div>
    </Glass>
  )
}
