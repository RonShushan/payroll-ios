// שירות רקע לאתר (PWA): מטמון בסיסי + התראות פוש לאתר. באפליקציית iOS לא נטען.
const C = 'payroll-ios-v1';
self.addEventListener('install', e => e.waitUntil(self.skipWaiting()));
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then(r => { const x = r.clone(); caches.open(C).then(c => c.put(e.request, x)); return r; }).catch(() => caches.match(e.request)));
});
self.addEventListener('push', e => { let d = {}; try { d = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(d.title || 'מחשבון שכר', { body: d.body || '', tag: d.tag || undefined, icon: 'icon-v3-192.png', badge: 'icon-v3-192.png', dir: 'rtl', lang: 'he', data: { url: d.url || './' } })); });
self.addEventListener('notificationclick', e => { e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || './';
  const kind = new URL(url, self.location.href).searchParams.get('remind');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(l => {
    for (const c of l) { if ('focus' in c) { c.postMessage({ type: 'remind', kind }); return c.focus(); } }
    return self.clients.openWindow(url); })); });
