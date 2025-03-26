// Версия кэша (меняй её, если обновляешь Service Worker или основные файлы)
const CACHE_NAME = 'kidscalm-v2'; // Изменил версию на v2

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
  '/bg.jpg', // Если фон важен для офлайн-работы, но он может быть большим! Подумай.
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
        console.log('[SW] Opened cache:', CACHE_NAME);
        // Кэшируем основные файлы
        return cache.addAll(urlsToCache).catch(error => {
           console.error('[SW] Failed to cache app shell during install:', error);
           // Важно отследить эту ошибку, если она возникнет
           throw error; // Провалить установку, если кэширование не удалось
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
          // Удаляем все кэши, относящиеся к этому приложению, кроме текущего
          return cacheName.startsWith('kidscalm-') && cacheName !== CACHE_NAME;
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

// Обработка запросов (Стратегия: Cache falling back to Network, with Cache Update)
self.addEventListener('fetch', function(event) {
  // Игнорируем не-GET запросы
  if (event.request.method !== 'GET') {
     return;
  }

  // Для навигационных запросов (HTML) используем стратегию NetworkFirst, чтобы пользователь видел свежую версию, если онлайн
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(function(networkResponse) {
        // Если сеть работает, клонируем ответ, кэшируем его и возвращаем
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseToCache));
        return networkResponse;
      }).catch(function() {
        // Если сети нет, пытаемся достать из кэша
        console.log('[SW] Network fetch failed for navigation, trying cache for:', event.request.url);
        return caches.match(event.request);
        // Тут можно добавить возврат кастомной офлайн-страницы, если она есть в кэше
        // .then(response => response || caches.match('/offline.html'));
      })
    );
    return; // Важно выйти после обработки navigate запроса
  }

  // Для остальных запросов (CSS, JS, JSON, изображения, шрифты и т.д.) используем CacheFirst, обновляя кэш из сети
  event.respondWith(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.match(event.request).then(function(cachedResponse) {
        // Пытаемся обновить ресурс из сети в фоне, независимо от того, есть ли он в кэше
        const fetchPromise = fetch(event.request).then(function(networkResponse) {
          // Клонируем и кэшируем свежий ответ
          const responseToCache = networkResponse.clone();
          cache.put(event.request, responseToCache);
          return networkResponse; // Возвращаем свежий ответ для обновления (хотя он может не использоваться, если кэш сработал первым)
        }).catch(error => {
           console.log('[SW] Network fetch failed for non-navigation request:', event.request.url, error);
           // Ошибку сети для не-навигационных запросов можно игнорировать, если есть кэш
        });

        // Если ресурс есть в кэше, возвращаем его немедленно
        if (cachedResponse) {
          // console.log('[SW] Returning from Cache:', event.request.url);
          return cachedResponse;
        }

        // Если ресурса нет в кэше, ждем ответа от сети (и он будет закэширован выше)
        // console.log('[SW] Not in Cache, waiting for Network:', event.request.url);
        return fetchPromise; // Возвращаем промис сетевого запроса

      }).catch(error => {
           console.error('[SW] Error during cache match or fetch:', error);
           throw error;
      });
    })
  );
});