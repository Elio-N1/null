import { useEffect, useState } from 'react'
import { Swap } from 'react-iconly'
import { Glass } from './Glass'

type ExchangePanelProps = {
  send: number
  setSend: (value: number) => void
  reversed: boolean
  setReversed: (value: boolean) => void
  rate: number
  onSaveRate: (rate: number) => Promise<void>
}

export default function ExchangePanel({ send, setSend, reversed, setReversed, rate, onSaveRate }: ExchangePanelProps) {
  const [draftRate, setDraftRate] = useState(String(rate))
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setDraftRate(String(rate)), [rate])
  const converted = reversed ? send / rate : send * rate

  const saveRate = async () => {
    const numeric = Number(draftRate)
    if (!Number.isFinite(numeric) || numeric <= 0) { setError('Enter a valid rate greater than zero.'); return }
    setSaving(true)
    setError('')
    try { await onSaveRate(numeric); setEditing(false) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update the rate.') }
    finally { setSaving(false) }
  }

  return (
    <Glass className="exchange-panel">
      <div className="panel-heading"><div><span className="signal-dot" />USD / LBP</div><button className="rate-edit" onClick={() => setEditing((value) => !value)}>{editing ? 'CANCEL' : 'EDIT RATE'}</button></div>
      <div className="exchange-body">
        <label><span>YOU SEND · {reversed ? 'LBP' : 'USD'}</span><input type="number" min="0" value={send} onChange={(event) => setSend(Number(event.target.value))} /></label>
        <button className="swap-button" onClick={() => setReversed(!reversed)} aria-label="Swap currencies"><Swap set="curved" size={22} /></button>
        <label><span>YOU RECEIVE · {reversed ? 'USD' : 'LBP'}</span><strong>{converted.toLocaleString('en-US', { maximumFractionDigits: reversed ? 2 : 0 })}</strong></label>
      </div>
      {editing ? <div className="rate-editor"><label><span>LBP PER 1 USD</span><input type="number" min="1" step="1" value={draftRate} onChange={(event) => setDraftRate(event.target.value)} /></label><button onClick={saveRate} disabled={saving}>{saving ? 'SAVING…' : 'SAVE RATE'}</button>{error && <small role="alert">{error}</small>}</div> : <div className="exchange-meta"><span>1 USD = {rate.toLocaleString()} LBP</span><span>MANUAL RATE</span></div>}
    </Glass>
  )
}
