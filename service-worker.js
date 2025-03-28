// Версия кэша оболочки (меняй её, если обновляешь Service Worker или основные файлы оболочки)
const CACHE_NAME = 'kidscalm-shell-v3'; // ИЗМЕНЕНИЕ: Версия оболочки
// Имя кэша для медиа-файлов
const MEDIA_CACHE_NAME = 'kidscalm-media-v1'; // ИЗМЕНЕНИЕ: Отдельный кэш для медиа

// Файлы, необходимые для работы оболочки приложения (БЕЗ АУДИО)
const urlsToCache = [
  '/',
  '/index.html', // Основной HTML
  '/style.css',  // Стили
  '/script.js', // Логика
  '/data.json', // Данные звуков/сказок
  '/manifest.json', // Манифест PWA

  // Основные изображения и иконки интерфейса
  '/logo.png',
  '/bg.jpg', // Фон кэшируется как часть оболочки
  '/minimize.svg',
  '/loop.svg',
  '/prev.svg',
  '/play.svg',
  '/pause.svg',
  '/next.svg',
  '/timer.svg',
  '/volume-down.svg',
  '/volume-up.svg',

  // Иконки PWA из манифеста
  '/icon-192.png',
  '/icon-512.png'

  // НИКАКИХ .MP3 ФАЙЛОВ ЗДЕСЬ!
];

// Установка Service Worker и кэширование оболочки приложения
self.addEventListener('install', function (event) {
  console.log('[SW] Install event, caching app shell');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        console.log('[SW] Opened cache for app shell:', CACHE_NAME);
        // Кэшируем основные файлы оболочки
        return cache.addAll(urlsToCache).catch(error => {
           console.error('[SW] Failed to cache app shell during install:', error);
           throw error; // Провалить установку, если кэширование оболочки не удалось
        });
      })
      .then(() => {
         console.log('[SW] App shell cached, skipping waiting.');
         return self.skipWaiting(); // Активируем новый SW сразу после установки
      })
  );
});

// Активация Service Worker и удаление старых кэшей
self.addEventListener('activate', function(event) {
  console.log('[SW] Activate event');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          // ИЗМЕНЕНИЕ: Удаляем все кэши kidscalm, кроме ТЕКУЩИХ shell и media
          return cacheName.startsWith('kidscalm-') &&
                 cacheName !== CACHE_NAME &&
                 cacheName !== MEDIA_CACHE_NAME;
        }).map(function(cacheName) {
          console.log('[SW] Deleting old cache:', cacheName);
          return caches.delete(cacheName);
        })
      );
    }).then(() => {
        console.log('[SW] Claiming clients');
        return self.clients.claim(); // Берем контроль над открытыми страницами
    })
  );
});

// Обработка запросов
self.addEventListener('fetch', function(event) {
  // Игнорируем не-GET запросы
  if (event.request.method !== 'GET') {
     // console.log('[SW] Ignoring non-GET request:', event.request.method, event.request.url);
     return;
  }

  const url = new URL(event.request.url);

  // --- Стратегия для HTML (Navigation): NetworkFirst ---
  if (event.request.mode === 'navigate') {
    // console.log('[SW] Handling navigation request:', url.pathname);
    event.respondWith(
      fetch(event.request)
        .then(function(networkResponse) {
          // console.log('[SW] Navigation request successful from network:', url.pathname);
          // Кэшируем свежую версию HTML в кэш оболочки
          if (networkResponse.ok) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
          }
          return networkResponse;
        })
        .catch(function() {
          // Если сети нет, пытаемся достать из кэша оболочки
          console.log('[SW] Network fetch failed for navigation, trying cache for:', url.pathname);
          return caches.match(event.request, { cacheName: CACHE_NAME })
            .then(response => {
                 if (response) {
                     console.log('[SW] Returning navigation request from cache:', url.pathname);
                     return response;
                 }
                 // TODO: Можно добавить возврат кастомной офлайн-страницы, если она есть в кэше
                 console.error('[SW] Navigation request failed: Not in cache and network unavailable.', url.pathname);
                 // Возвращаем стандартный ответ об ошибке, если и в кэше нет
                 return new Response("Network error and not in cache", { status: 503, statusText: "Service Unavailable" });
             });
        })
    );
    return;
  }

  // --- ИЗМЕНЕНИЕ: Стратегия для АУДИО (.mp3): CacheFirst, then Network, and cache on success ---
  const isAudioRequest = url.pathname.endsWith('.mp3');
  if (isAudioRequest) {
    // console.log('[SW] Handling audio request:', url.pathname);
    event.respondWith(
        caches.open(MEDIA_CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(event.request);
            if (cachedResponse) {
                // console.log('[SW] Returning audio from Media Cache:', url.pathname);
                return cachedResponse;
            }

            // console.log('[SW] Audio not in media cache, fetching from Network:', url.pathname);
            try {
                const networkResponse = await fetch(event.request);
                // Проверяем, что ответ валидный и это не ошибка сервера
                // Для аудио часто используются Range Requests (206 Partial Content)
                if (networkResponse.ok || networkResponse.status === 206) {
                     // console.log('[SW] Audio fetched successfully from network:', url.pathname, networkResponse.status);
                     // Клонируем ответ, т.к. его можно использовать только один раз
                     const responseToCache = networkResponse.clone();
                     // Кэшируем полученный аудиофайл в медиа-кэш
                     await cache.put(event.request, responseToCache);
                     console.log('[SW] Audio cached in media cache:', url.pathname);
                } else {
                     console.warn('[SW] Network request for audio failed with status:', networkResponse.status, url.pathname);
                }
                // Возвращаем оригинальный ответ сети
                return networkResponse;
            } catch (error) {
                console.error('[SW] Network fetch failed for audio:', url.pathname, error);
                // Если и сети нет, и в кэше нет - вернуть ошибку
                return new Response(JSON.stringify({ error: "Offline and not cached" }), {
                    status: 404,
                    statusText: "Offline and not cached",
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        })
    );
    return; // Важно выйти после обработки аудио запроса
  }

  // --- Стратегия для ОСТАЛЬНЫХ ресурсов (CSS, JS, JSON, изображения...): CacheFirst, update in background ---
  // console.log('[SW] Handling other asset request:', url.pathname);
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) { // Используем кэш оболочки
      return cache.match(event.request).then(function(cachedResponse) {
        // Пытаемся обновить ресурс из сети в фоне
        const fetchPromise = fetch(event.request).then(function(networkResponse) {
          if (networkResponse.ok) {
            // Клонируем и кэшируем свежий ответ в кэш оболочки
            const responseToCache = networkResponse.clone();
            cache.put(event.request, responseToCache);
             // console.log('[SW] Updated asset in cache from network:', url.pathname);
          } else {
             // console.warn('[SW] Network fetch failed for asset update:', networkResponse.status, url.pathname);
          }
          return networkResponse; // Возвращаем свежий ответ (может не использоваться, если кэш сработал)
        }).catch(error => {
           // console.log('[SW] Network fetch failed for asset:', url.pathname, error);
           // Ошибку сети для не-навигационных запросов можно игнорировать, если есть кэш
           // Возвращаем undefined или пустой промис, чтобы не сломать Promise.resolve ниже
           return undefined;
        });

        // Если ресурс есть в кэше, возвращаем его немедленно
        if (cachedResponse) {
          // console.log('[SW] Returning asset from Cache:', url.pathname);
          return cachedResponse;
        }

        // Если ресурса нет в кэше, ждем ответа от сети (он будет закэширован выше, если успешен)
        // console.log('[SW] Asset not in Cache, waiting for Network:', url.pathname);
        return fetchPromise.then(response => {
            if (response) {
                 // console.log('[SW] Returning asset from Network (was not cached):', url.pathname);
                 return response;
            }
             // Если и сети нет, и в кэше не было
            console.error('[SW] Asset request failed: Not in cache and network unavailable.', url.pathname);
            return new Response("Network error and not in cache", { status: 503, statusText: "Service Unavailable" });
        });

      }).catch(error => {
           console.error('[SW] Error during cache match or fetch for asset:', url.pathname, error);
           // В случае серьезной ошибки возвращаем стандартный ответ об ошибке
            return new Response("Error handling fetch", { status: 500, statusText: "Internal Server Error" });
      });
    })
  );
});

// Можно добавить обработчики для 'message' для более сложного взаимодействия с клиентом
// self.addEventListener('message', (event) => {
//   console.log(`[SW] Received message: ${event.data}`);
//   // Пример: event.data === 'SKIP_WAITING' -> self.skipWaiting();
// });