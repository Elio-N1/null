import { CloseSquare, Notification, TickSquare } from 'react-iconly'
import type { NotificationItem } from '../lib/budget-api'
import { Glass } from './Glass'

type Props = {
  items: NotificationItem[]
  onClose: () => void
  onMarkAll: () => Promise<void>
  onOpen: (item: NotificationItem) => Promise<void>
}

export default function NotificationDrawer({ items, onClose, onMarkAll, onOpen }: Props) {
  const unread = items.filter((item) => !item.readAt).length
  return <div className="notification-layer" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <Glass as="aside" className="notification-drawer">
      <div className="notification-title"><div><span>NULL / INBOX</span><h2>NOTIFICATIONS</h2><p>{unread ? `${unread} item${unread === 1 ? '' : 's'} need your attention.` : 'Everything is up to date.'}</p></div><button onClick={onClose} aria-label="Close notifications"><CloseSquare set="curved" /></button></div>
      <button className="mark-all" onClick={onMarkAll} disabled={!unread}><TickSquare set="curved" size={18} />MARK ALL READ</button>
      <div className="notification-list">{items.length ? items.map((item) => <button key={item.id} className={`notification-item ${item.readAt ? 'read' : ''} ${item.type}`} onClick={() => onOpen(item)}><i><Notification set="curved" size={17} /></i><span><strong>{item.title}</strong><small>{item.body}</small><time>{new Date(item.createdAt).toLocaleString('en-LB', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time></span>{!item.readAt && <b />}</button>) : <div className="notification-empty">NO NOTIFICATIONS YET</div>}</div>
    </Glass>
  </div>
}
