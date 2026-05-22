/**
 * sw.js — Service Worker（v3.0）
 * 离线缓存策略：安装时预缓存所有静态资源，运行时网络优先+缓存回退
 */
const CACHE_NAME = 'cet4-vocab-v3';

// 预缓存资源列表
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/data.js',
  './js/store.js',
  './js/sm2.js',
  './js/calendar.js',
  './js/app.js',
  './manifest.json'
];

// 安装事件：预缓存核心资源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(PRECACHE_URLS);
    }).then(() => self.skipWaiting())
  );
});

// 激活事件：清理旧缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(name => {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 拦截请求：网络优先，缓存兜底
self.addEventListener('fetch', event => {
  // 仅缓存同源 GET 请求
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 成功响应则更新缓存
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(() => {
        // 离线时从缓存读取
        return caches.match(event.request);
      })
  );
});
