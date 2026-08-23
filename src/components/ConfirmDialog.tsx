import { Delete, ShieldDone } from 'react-iconly'

type Props = { title: string; body: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }

export default function ConfirmDialog({ title, body, confirmLabel = 'CONFIRM', destructive = false, onConfirm, onCancel }: Props) {
  return <div className="modal-backdrop confirm-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onCancel()}><div className="confirm-dialog glass" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-body"><span className={`confirm-symbol ${destructive ? 'danger' : ''}`}>{destructive ? <Delete set="curved" size={25} /> : <ShieldDone set="curved" size={25} />}</span><div><span>NULL / CONFIRMATION</span><h2 id="confirm-title">{title}</h2><p id="confirm-body">{body}</p></div><footer><button onClick={onCancel}>CANCEL</button><button className={destructive ? 'danger' : ''} onClick={onConfirm}>{confirmLabel}</button></footer></div></div>
}
