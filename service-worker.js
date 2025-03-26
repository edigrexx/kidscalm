self.addEventListener('install', function (e) {
    e.waitUntil(
      caches.open('kidscalm').then(function (cache) {
        return cache.addAll([
          '/',
          '/index.html',
          '/sounds/whitenoise.mp3',
          '/sounds/ocean_waves.mp3',
          '/sounds/rain_summer.mp3'
        ]);
      })
    );
  });
  
  self.addEventListener('fetch', function (e) {
    e.respondWith(
      caches.match(e.request).then(function (response) {
        return response || fetch(e.request);
      })
    );
  });
  