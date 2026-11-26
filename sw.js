/* Service Worker لتطبيق كمّي: يحفظ نسخة من التطبيق على الجهاز ليعمل بدون إنترنت.
   عند تعديل التطبيق يكفي رفع index.html ، فالصفحة تُجلب من الشبكة أولاً عند توفرها.
   ارفع رقم الإصدار V فقط إذا غيّرت قائمة CORE أو أردت مسح النسخ القديمة. */
const V = "kammi-v1";
const CDN = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
const CORE = ["./", "index.html", "icon.png"];
const EXTRA = [CDN + "pdf.min.js", CDN + "pdf.worker.min.js"];
const RUNTIME_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const c = await caches.open(V);
    await c.addAll(CORE);
    // ملفات قارئ PDF من خارج الموقع: لا نُفشل التثبيت إذا تعذّر تحميل أحدها
    await Promise.all(EXTRA.map(u => c.add(new Request(u, { mode: "cors" })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== V) await caches.delete(k);
    await self.clients.claim();
  })());
});

// الشبكة أولاً مع مهلة، ثم النسخة المحفوظة: ليصل كل تحديث للتطبيق متى توفر الإنترنت
async function networkFirst(req) {
  const c = await caches.open(V);
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))
    ]);
    if (res && res.ok) c.put(req.mode === "navigate" ? "index.html" : req, res.clone());
    return res;
  } catch (err) {
    return (await c.match(req, { ignoreSearch: true })) || (await c.match("index.html")) || Response.error();
  }
}

// المحفوظ أولاً: للخطوط وملفات المكتبات التي لا تتغير
async function cacheFirst(req) {
  const c = await caches.open(V);
  const hit = await c.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) c.put(req, res.clone());
    return res;
  } catch (err) {
    return Response.error();
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;
  if (req.mode === "navigate" || (same && /\/(index\.html)?$/.test(url.pathname))) {
    e.respondWith(networkFirst(req));
  } else if (same || RUNTIME_HOSTS.includes(url.hostname)) {
    e.respondWith(cacheFirst(req));
  }
});
