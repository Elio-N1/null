export default function ActiveToggle({ active, label, onToggle, disabled = false }: { active: boolean; label: string; onToggle: () => void; disabled?: boolean }) {
  return <button type="button" className={`active-toggle ${active ? 'active' : ''}`} role="switch" aria-checked={active} aria-label={`${active ? 'Deactivate' : 'Activate'} ${label}`} onClick={onToggle} disabled={disabled}><i /><span className="sr-only">{active ? 'Active' : 'Inactive'}</span></button>
}
