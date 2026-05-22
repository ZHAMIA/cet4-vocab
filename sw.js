/**
 * sw.js — Service Worker（v4.0）
 * 离线缓存策略 + 每日提醒通知
 */
const CACHE_NAME = 'cet4-vocab-v4';

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

// ========== v4.0: 每日提醒通知 ==========

/**
 * 检查是否需要发送每日提醒
 * 根据存储的提醒设置，只在设定的时间附近发送一次
 */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'CHECK_REMINDER') {
    checkAndSendReminder();
  }
});

/** 处理定期同步事件（如果浏览器支持） */
self.addEventListener('periodicsync', event => {
  if (event.tag === 'cet4-reminder') {
    event.waitUntil(checkAndSendReminder());
  }
});

/** 检查并发送提醒 */
async function checkAndSendReminder() {
  try {
    // 从 IndexedDB 或通过客户端获取提醒设置
    const setting = await getReminderSetting();
    if (!setting || !setting.enabled) return;

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const targetMinutes = setting.hour * 60 + setting.minute;

    // 在目标时间前后 30 分钟内触发
    if (Math.abs(currentMinutes - targetMinutes) <= 30) {
      // 检查今天是否已经发送过
      const today = now.toISOString().split('T')[0];
      const sentKey = 'cet4_reminder_sent_' + today;
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(sentKey);
      if (cachedResponse) return; // 今天已发送过

      // 获取学习统计
      const stats = await getStudyStats();

      // 发送通知
      const title = '📚 四级单词 · 该复习了！';
      let body = '今天的学习正在等你～';
      if (stats && stats.due > 0) {
        body = `你有 ${stats.due} 个单词等待复习，今天已学 ${stats.todayLearned} 个`;
      }

      self.registration.showNotification(title, {
        body: body,
        icon: './icons/icon-192.svg',
        badge: './icons/icon-192.svg',
        vibrate: [200, 100, 200],
        tag: 'cet4-daily-reminder',
        requireInteraction: true,
        actions: [
          { action: 'open', title: '📖 去学习' },
          { action: 'dismiss', title: '稍后提醒' }
        ]
      });

      // 标记今天已发送
      await cache.put(sentKey, new Response('sent'));
    }
  } catch (e) {
    console.warn('SW 提醒检查失败:', e);
  }
}

/** 通过客户端获取提醒设置 */
async function getReminderSetting() {
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length === 0) return null;

  // 向客户端发送消息获取设置
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 1000);
    const handler = (event) => {
      if (event.data && event.data.type === 'REMINDER_SETTING') {
        clearTimeout(timeout);
        resolve(event.data.setting);
        self.removeEventListener('message', handler);
      }
    };
    self.addEventListener('message', handler);

    clients[0].postMessage({ type: 'GET_REMINDER_SETTING' });
  });
}

/** 获取学习统计 */
async function getStudyStats() {
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.length === 0) return null;

  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 1000);
    const handler = (event) => {
      if (event.data && event.data.type === 'STUDY_STATS') {
        clearTimeout(timeout);
        resolve(event.data.stats);
        self.removeEventListener('message', handler);
      }
    };
    self.addEventListener('message', handler);

    clients[0].postMessage({ type: 'GET_STUDY_STATS' });
  });
}

/** 通知点击处理 */
self.addEventListener('notificationclick', event => {
  event.notification.close();

  if (event.action === 'open' || !event.action) {
    // 打开应用
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(windowClients => {
        if (windowClients.length > 0) {
          // 聚焦已打开的窗口
          const client = windowClients[0];
          client.focus();
          client.postMessage({ type: 'NAVIGATE', hash: '#study' });
          return client;
        }
        // 打开新窗口
        return clients.openWindow('./index.html#study');
      })
    );
  }
});
