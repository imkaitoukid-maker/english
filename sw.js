const CACHE = 'say-it-1.0.1';
const BASE = new URL('./', self.location.href);
const SHELL = ['./index.html','./styles.css','./app.js','./audio-utils.js','./capture-worklet.js','./recognizer-worker.js','./icon.svg','./sample.wav','./asset-manifest.json'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL.map(path => new URL(path, BASE).href))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  // Scope-specific matching prevents one Pages project from deleting another's cache.
  event.waitUntil(self.clients.claim());
});
let lastNotification = 0;
async function notify() {
  if (Date.now() - lastNotification < 1000) return;
  lastNotification = Date.now();
  const clients = await self.clients.matchAll(); clients.forEach(client => client.postMessage({ type: 'cached' }));
}
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const relative = url.pathname.slice(BASE.pathname.length);
  const known = SHELL.includes('./' + relative) || /^vendor\/model-\d{2}\.data$/.test(relative) || ['','vendor/sherpa-onnx-asr.js','vendor/sherpa-onnx-wasm-main-asr.js','vendor/sherpa-onnx-wasm-main-asr.wasm'].includes(relative);
  if (!known) return;
  const key = event.request.mode === 'navigate' ? new URL('./index.html', BASE).href : event.request;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(key);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response.ok && response.type !== 'opaque') {
      const storing = cache.put(key, response.clone()).then(notify).catch(() => {});
      event.waitUntil(storing);
    }
    return response;
  })());
});
