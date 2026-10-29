// Mở từ màn hình chính phải nhanh: lấy bản đã lưu ngay, cập nhật ngầm phía sau.
// Riêng lần hỏi bản mới (?nocache=) thì đi mạng và cất luôn làm bản chính.
const C = 'chitieu-v4';
const SHELL = ['./', './manifest.json', './icon-180.png', './icon-512.png', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(C).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

const keyOf = req => req.mode === 'navigate' || new URL(req.url).pathname.endsWith('/') ? './' : req;

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const mine = url.origin === location.origin, font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!mine && !font) return;

  if (mine && url.searchParams.has('nocache')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).then(r => {
      if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put('./', cp)); }
      return r;
    }));
    return;
  }

  const key = mine ? keyOf(req) : req;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(key, { ignoreSearch: true });
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') c.put(key, r.clone()); return r; });
    if (hit) { if (mine) e.waitUntil(net.catch(() => {})); return hit; }
    return net;
  }));
});
