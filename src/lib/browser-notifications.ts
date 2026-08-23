export const browserNotificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator

export const browserNotificationPermission = () => browserNotificationsSupported() ? Notification.permission : 'unsupported'

async function registration() {
  if (!browserNotificationsSupported()) throw new Error('Browser notifications are not supported here.')
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/notification-sw.js')
}

export async function requestBrowserNotifications() {
  if (!browserNotificationsSupported()) throw new Error('Browser notifications are not supported here.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Notification permission was not granted in this browser.')
  await registration()
  return permission
}

export async function showBrowserNotification(title: string, body: string, url = '/app/subscriptions') {
  if (!browserNotificationsSupported() || Notification.permission !== 'granted') return false
  const worker = await registration()
  await worker.showNotification(title, { body, tag: `${title}:${body}`, data: { url } })
  return true
}
