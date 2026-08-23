import { useEffect, useMemo, useRef, useState } from 'react'

export type PremiumOption = { value: string; label: string }

function useOutsideClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: PointerEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose() }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [onClose])
  return ref
}

export function PremiumSelect({ value, options, onChange, label, disabled = false, compact = false }: { value: string; options: PremiumOption[]; onChange: (value: string) => void; label: string; disabled?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  const ref = useOutsideClose(close)
  const selected = options.find((item) => item.value === value)
  return <div className={`premium-control premium-select ${compact ? 'compact' : ''} ${open ? 'open' : ''}`} ref={ref}>
    <button type="button" className="premium-trigger" onClick={() => !disabled && setOpen((current) => !current)} aria-haspopup="listbox" aria-expanded={open} aria-label={label} disabled={disabled}><span>{selected?.label ?? 'SELECT'}</span><i /></button>
    {open ? <div className="premium-menu glass" role="listbox" aria-label={label}>{options.map((item) => <button type="button" role="option" aria-selected={item.value === value} className={item.value === value ? 'selected' : ''} key={item.value} onClick={() => { onChange(item.value); close() }}><span>{item.label}</span>{item.value === value ? <b>✓</b> : null}</button>)}</div> : null}
  </div>
}

const toDateValue = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

export function PremiumDateField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const selectedDate = useMemo(() => new Date(`${value}T12:00:00`), [value])
  const initialDate = Number.isNaN(selectedDate.getTime()) ? new Date() : selectedDate
  const [open, setOpen] = useState(false)
  const [cursor, setCursor] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1))
  const close = () => setOpen(false)
  const ref = useOutsideClose(close)
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay()
  const days = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = index - firstDay + 1
    return day > 0 && day <= days ? day : null
  })
  const formatted = Number.isNaN(selectedDate.getTime()) ? 'SELECT DATE' : selectedDate.toLocaleDateString('en-LB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
  return <div className={`premium-control premium-date ${open ? 'open' : ''}`} ref={ref}>
    <button type="button" className="premium-trigger" onClick={() => setOpen((current) => !current)} aria-haspopup="dialog" aria-expanded={open} aria-label={label}><span>{formatted}</span><b className="calendar-mark">□</b></button>
    {open ? <div className="premium-calendar glass" role="dialog" aria-label={label}>
      <header><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month">←</button><strong>{cursor.toLocaleDateString('en-LB', { month: 'long', year: 'numeric' }).toUpperCase()}</strong><button type="button" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month">→</button></header>
      <div className="calendar-week">{['S','M','T','W','T','F','S'].map((day, index) => <span key={`${day}-${index}`}>{day}</span>)}</div>
      <div className="calendar-grid">{cells.map((day, index) => day ? <button type="button" className={value === toDateValue(new Date(cursor.getFullYear(), cursor.getMonth(), day)) ? 'selected' : ''} key={index} onClick={() => { onChange(toDateValue(new Date(cursor.getFullYear(), cursor.getMonth(), day))); close() }}>{day}</button> : <span key={index} />)}</div>
    </div> : null}
  </div>
}
