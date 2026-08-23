self.addEventListener('install', (event) => {
  event.waitUntil(caches.open('null-money-shell-v1').then((cache) => cache.addAll([
    '/', '/index.html', '/manifest.webmanifest',
    '/icons/null-money-192.png', '/icons/null-money-512.png'
  ])).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('null-money-') && key !== 'null-money-shell-v1').map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then((response) => {
      const copy = response.clone()
      caches.open('null-money-shell-v1').then((cache) => cache.put(request, copy))
      return response
    }).catch(async () => (await caches.match(request)) || (await caches.match('/index.html'))))
    return
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) caches.open('null-money-shell-v1').then((cache) => cache.put(request, response.clone()))
    return response
  })))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = event.notification.data?.url || '/app/subscriptions'
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => 'focus' in client)
    return existing ? existing.focus().then(() => existing.navigate(target)) : self.clients.openWindow(target)
  }))
})
