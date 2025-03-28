// --- DOM Элементы ---
const tabSounds = document.getElementById("tab-sounds");
const tabStories = document.getElementById("tab-stories");
const soundSection = document.getElementById("sound-section");
const storySection = document.getElementById("story-section");
const categoriesContainer = document.querySelector('#sound-section .categories');
const soundList = document.getElementById("sound-list");
const storyList = document.getElementById("story-list");
const playerControls = document.getElementById("playerControls");
const player = document.getElementById("mainPlayer");
const nowPlaying = document.getElementById("nowPlaying");
const currentCategoryEl = document.getElementById("currentCategory");
const playPauseButton = document.getElementById('playPauseButton');
const loopButton = document.getElementById('loopButton');
const prevButton = document.getElementById('prevButton');
const nextButton = document.getElementById('nextButton');
const progressBar = document.getElementById('progressBar');
const progress = document.getElementById('progress');
const volumeSlider = document.getElementById('volumeSlider');
const minimizeButton = document.getElementById("minimizeButton");
const miniPlayer = document.getElementById("miniPlayer");
const sleepTimerBtn = document.getElementById('sleepTimerBtn');
const timerMenu = document.getElementById('timerMenu');

// --- Переменные для данных (будут загружены) ---
let sounds = [];
let stories = [];
let categories = [];
let storyDurationsCache = null; // Кэш для хранения загруженных длительностей

// --- Состояние приложения ---
let currentSound = null;
let currentStory = null;
let isPlaying = false;
let currentCategoryFilter = "all";
let isLoopEnabled = true;
let activeTimer = null;
let countdownInterval = null;
let timerEndTime = null;
let originalVolume = 1;
let isTimerMenuOpen = false;
let currentPlaylist = [];
let currentIndexInPlaylist = -1;
let durationsFetched = false;

// --- Вспомогательные функции ---
function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
        return "--:--";
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- Функции рендеринга ---
function renderCategories() {
    if (!categoriesContainer) return;
    categoriesContainer.innerHTML = '';
    categories.forEach(category => {
        const div = document.createElement("div");
        div.className = "category";
        div.dataset.id = category.id;
        if (category.id === currentCategoryFilter) {
            div.classList.add("active");
        }
        div.innerHTML = `<span class="category-icon">${category.icon}</span>${category.name}`;
        div.addEventListener("click", () => filterSounds(category.id));
        categoriesContainer.appendChild(div);
    });
}

function renderSounds(soundsToRender) {
    if (!soundList) return;
    soundList.innerHTML = '';
    soundsToRender.forEach((sound) => {
        const div = document.createElement("div");
        div.className = "card";
        div.dataset.file = `sounds/${sound.file}`;
        div.innerHTML = `
            <span class='card-icon'>${sound.icon}</span>
            <div class="card-content">
               <span class="card-title">${sound.title}</span>
            </div>`;
        if (currentSound && `sounds/${currentSound.file}` === `sounds/${sound.file}`) {
             div.classList.add('active');
        }
        div.addEventListener("click", () => playItem(sound, 'sound'));
        soundList.appendChild(div);
    });
    if (tabSounds.classList.contains('active')) {
        updateCurrentPlaylist(soundsToRender, 'sound');
    }
}

function renderStories() {
    if (!storyList) return;
    storyList.innerHTML = '';
    stories.forEach((story) => {
        const div = document.createElement("div");
        div.className = "card";
        div.dataset.file = story.file;
        div.innerHTML = `
             <div class="card-content" style="width: 100%;">
                <span class="card-title">${story.title}</span>
                <span class="card-duration" data-duration-for="${story.file}">--:--</span>
             </div>`;
        if (currentStory && currentStory.file === story.file) {
             div.classList.add('active');
        }
        div.addEventListener("click", () => playItem(story, 'story'));
        storyList.appendChild(div);
    });

    if (!durationsFetched) {
         console.log("renderStories: Вызываю fetchAndDisplayDurations...");
         fetchAndDisplayDurations();
         durationsFetched = true;
    } else {
         console.log("renderStories: Длительности уже были загружены, вызываю updateDisplayedDurations...");
         updateDisplayedDurations();
    }

     if (tabStories.classList.contains('active')) {
         updateCurrentPlaylist(stories, 'story');
     }
}

// --- Функции загрузки данных и инициализации ---
async function fetchAndDisplayDurations() {
    console.log("--- fetchAndDisplayDurations: НАЧАЛО ---");
    const durationPromises = stories.map(story => {
        return new Promise((resolve) => { // Убрал reject, чтобы Promise.all не падал при одной ошибке
            const audioElement = new Audio();
            audioElement.preload = "metadata";
            const onLoadedMetadata = () => {
                console.log(`[${story.file}] Метаданные ЗАГРУЖЕНЫ. Длительность: ${audioElement.duration}`);
                resolve({ file: story.file, duration: audioElement.duration });
                cleanup();
            };
            const onError = (e) => {
                console.error(`[${story.file}] ОШИБКА загрузки метаданных:`, e);
                resolve({ file: story.file, duration: null }); // Резолвим с null при ошибке
                cleanup();
            };
            const cleanup = () => {
                audioElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                audioElement.removeEventListener('error', onError);
                audioElement.src = "";
            };
            audioElement.addEventListener('loadedmetadata', onLoadedMetadata);
            audioElement.addEventListener('error', onError);
            console.log(`[${story.file}] Запрашиваю метаданные...`);
            try {
                 audioElement.src = story.file;
            } catch (err) {
                 console.error(`[${story.file}] КРИТИЧЕСКАЯ ОШИБКА установки src:`, err);
                 onError(err); // Вызываем обработчик ошибки если даже src не установился
            }
        });
    });

    try {
        const durations = await Promise.all(durationPromises);
        const durationMap = new Map(durations.map(d => [d.file, d.duration]));
        storyDurationsCache = durationMap; // Сохраняем карту в кэш
        updateDisplayedDurations(durationMap); // Передаем карту в первый раз
    } catch (error) {
        // Сюда не должны попасть, т.к. promise не режектится, но оставим на всякий случай
        console.error("fetchAndDisplayDurations: Ошибка при ожидании Promise.all (неожиданно):", error);
    }
}

function updateDisplayedDurations(durationMap = null) {
    if (!durationMap) {
        console.log("updateDisplayedDurations: Карта не передана, пытаюсь использовать кэш...");
        durationMap = storyDurationsCache;
    }

    console.log("--- updateDisplayedDurations: НАЧАЛО --- Карта длительностей:", durationMap);

    if (!storyList || !durationMap) {
        console.warn("updateDisplayedDurations: Нет storyList или актуальной durationMap, выход.");
        return;
    }

    stories.forEach(story => {
         const durationSpan = storyList.querySelector(`.card-duration[data-duration-for="${story.file}"]`);
         const duration = durationMap.get(story.file);
         const formattedTime = formatTime(duration);
         console.log(`[${story.file}] Обновляю DOM. Найден span: ${durationSpan ? 'Да' : 'Нет'}, Длительность: ${duration}, Форматировано: ${formattedTime}`);
         if (durationSpan) {
              durationSpan.textContent = formattedTime;
         } else {
              console.warn(`[${story.file}] Не найден span для обновления длительности!`);
         }
    });
    console.log("--- updateDisplayedDurations: ЗАВЕРШЕНО ---");
}

function filterSounds(categoryId) {
    currentCategoryFilter = categoryId;
    renderCategories();
    const filteredSounds = categoryId === "all"
        ? sounds
        : sounds.filter(s => s.categoryId === categoryId);
    renderSounds(filteredSounds);
    const activeStoryCard = storyList.querySelector('.card.active');
    if (activeStoryCard) activeStoryCard.classList.remove('active');
}

 function updateCurrentPlaylist(items, type) {
     currentPlaylist = items.map(item => ({ ...item, type }));
     const playingItem = type === 'sound' ? currentSound : currentStory;
     if (playingItem) {
         const pathKey = type === 'sound' ? `sounds/${playingItem.file}` : playingItem.file;
         currentIndexInPlaylist = currentPlaylist.findIndex(item => {
             const itemPath = item.type === 'sound' ? `sounds/${item.file}` : item.file;
             return itemPath === pathKey;
         });
     } else {
         currentIndexInPlaylist = -1;
     }
 }

// --- Функции управления плеером ---
function updatePlayPauseButton() {
    const img = playPauseButton.querySelector('img');
    const miniPlayerImg = miniPlayer.querySelector('img');
    if (!img || !miniPlayerImg) return;
    if (isPlaying) {
        img.src = 'pause.svg'; img.alt = 'Pause';
        miniPlayerImg.src = 'pause.svg'; miniPlayerImg.alt = 'Pause';
        playPauseButton.setAttribute('aria-label', 'Пауза');
    } else {
        img.src = 'play.svg'; img.alt = 'Play';
        miniPlayerImg.src = 'play.svg'; miniPlayerImg.alt = 'Play';
         playPauseButton.setAttribute('aria-label', 'Воспроизвести');
    }
}

function updateActiveCard() {
    document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));
    const playingItem = currentSound || currentStory;
    if (playingItem) {
        const filePath = currentSound ? `sounds/${playingItem.file}` : playingItem.file;
        const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        try {
            const activeCard = document.querySelector(`.card[data-file="${escapedFilePath}"]`);
            if (activeCard) activeCard.classList.add('active');
        } catch (e) { console.error("Error selecting active card:", e); }
    }
}

function showPlayer() {
    if (!playerControls || !miniPlayer) return;
    playerControls.classList.add("show");
    document.body.classList.add("player-open");
    miniPlayer.classList.remove("show");
}

function hidePlayer() {
    if (!playerControls || !miniPlayer || !player) return;
    playerControls.classList.remove("show");
    document.body.classList.remove("player-open");
    setTimeout(() => {
        if (player.src && !playerControls.classList.contains('show') && (currentSound || currentStory)) {
             miniPlayer.classList.add("show");
        }
    }, 400);
}

function playItem(item, type) {
     if (!player || !nowPlaying || !currentCategoryEl) return;
     nowPlaying.textContent = "Загрузка...";
     currentCategoryEl.textContent = "";
     progress.style.width = '0%';
     let path, categoryName, isCurrentlyPlayingThis = false;

     if (type === 'sound') {
        path = `sounds/${item.file}`;
        const categoryData = categories.find(c => c.id === item.categoryId);
        categoryName = categoryData ? categoryData.name : 'Звук';
        currentSound = item; currentStory = null;
        player.loop = isLoopEnabled;
        loopButton.classList.toggle('active', isLoopEnabled);
        loopButton.disabled = false;
     } else {
         path = item.file; categoryName = 'Сказка';
         currentStory = item; currentSound = null;
         player.loop = false;
         loopButton.classList.remove('active');
         loopButton.disabled = true;
     }
      const currentPathEnd = player.src ? player.src.substring(player.src.lastIndexOf('/') + 1) : null;
      const newPathEnd = path.substring(path.lastIndexOf('/') + 1);
      isCurrentlyPlayingThis = player.src && currentPathEnd === newPathEnd;

     if (isCurrentlyPlayingThis && isPlaying) {
          nowPlaying.textContent = item.title;
          currentCategoryEl.textContent = categoryName;
         if (!playerControls.classList.contains('show')) showPlayer();
         return;
     }
     if (isCurrentlyPlayingThis && !isPlaying) {
         nowPlaying.textContent = item.title;
         currentCategoryEl.textContent = categoryName;
         togglePlayPause();
          if (!playerControls.classList.contains('show')) showPlayer();
         return;
     }

     try {
        player.src = path;
     } catch (err) {
          console.error(`КРИТИЧЕСКАЯ ОШИБКА установки src в плеер: ${path}`, err);
          nowPlaying.textContent = "Ошибка загрузки трека";
          currentCategoryEl.textContent = item.title;
          // Можно показать alert или другое уведомление
          return; // Прерываем воспроизведение
     }

     nowPlaying.textContent = item.title;
     currentCategoryEl.textContent = categoryName;

     if (type === 'sound') {
         const currentVisibleSounds = currentCategoryFilter === "all" ? sounds : sounds.filter(s => s.categoryId === currentCategoryFilter);
         updateCurrentPlaylist(currentVisibleSounds, 'sound');
     } else { updateCurrentPlaylist(stories, 'story'); }
     currentIndexInPlaylist = currentPlaylist.findIndex(i => {
          const itemPath = i.type === 'sound' ? `sounds/${i.file}` : i.file;
          return itemPath === path;
     });

     player.volume = volumeSlider.value;
     const playPromise = player.play();

     if (playPromise !== undefined) {
        playPromise.then(_ => {
            updateActiveCard(); showPlayer(); updateMediaSessionMetadata(item.title, categoryName);
        }).catch(error => {
            console.error("Playback start failed:", error);
             nowPlaying.textContent = "Ошибка воспроизведения";
             currentCategoryEl.textContent = item.title;
             isPlaying = false; updatePlayPauseButton();
             if (error.name === 'NotAllowedError') alert('Воспроизведение заблокировано браузером. Пожалуйста, нажмите кнопку Play.');
             else if (error.name === 'NotSupportedError') alert('Формат аудиофайла не поддерживается вашим браузером.');
             else alert(`Не удалось воспроизвести "${item.title}". Попробуйте другой трек.`);
             currentSound = null; currentStory = null; updateActiveCard();
        });
     }
}

 function togglePlayPause() {
    if (!player || !player.src || (!currentSound && !currentStory)) {
        console.warn("Toggle play/pause with no source or item."); return;
    }
    try {
        if (isPlaying) player.pause();
        else {
            const playPromise = player.play();
             if (playPromise !== undefined) {
                playPromise.catch(error => {
                    console.error("Playback toggle failed:", error);
                    nowPlaying.textContent = "Ошибка воспроизведения";
                    isPlaying = false; updatePlayPauseButton();
                     if (error.name === 'NotAllowedError') alert('Не удалось возобновить воспроизведение.');
                });
            }
        }
    } catch (e) {
         console.error("Error during togglePlayPause:", e);
         nowPlaying.textContent = "Ошибка плеера"; isPlaying = false; updatePlayPauseButton();
    }
}

function playNext() {
    if (currentPlaylist.length === 0) return;
     if (currentIndexInPlaylist === -1 && currentPlaylist.length > 0) { playItem(currentPlaylist[0], currentPlaylist[0].type); return; }
     if (currentIndexInPlaylist < 0) return;
    let nextIndex = currentIndexInPlaylist + 1;
    if (currentStory && nextIndex >= currentPlaylist.length) {
          isPlaying = false; updatePlayPauseButton(); progress.style.width = '0%'; player.currentTime = 0; return;
    }
     if (currentSound && nextIndex >= currentPlaylist.length) nextIndex = 0;
     if (nextIndex < currentPlaylist.length) playItem(currentPlaylist[nextIndex], currentPlaylist[nextIndex].type);
     else { isPlaying = false; updatePlayPauseButton(); }
}

function playPrevious() {
    if (currentPlaylist.length === 0) return;
     if (player.currentTime > 3 && currentIndexInPlaylist !== -1) { player.currentTime = 0; return; }
    if (currentIndexInPlaylist === -1 && currentPlaylist.length > 0) { const lastIndex = currentPlaylist.length - 1; playItem(currentPlaylist[lastIndex], currentPlaylist[lastIndex].type); return; }
     if (currentIndexInPlaylist < 0) return;
    let prevIndex = currentIndexInPlaylist - 1;
    if (currentStory && prevIndex < 0) { player.currentTime = 0; return; }
    if (currentSound && prevIndex < 0) prevIndex = currentPlaylist.length - 1;
    if (prevIndex >= 0 && prevIndex < currentPlaylist.length) playItem(currentPlaylist[prevIndex], currentPlaylist[prevIndex].type);
    else { if (currentIndexInPlaylist !== -1) player.currentTime = 0; }
}

function toggleLoop() {
    if (!loopButton || loopButton.disabled) return;
    isLoopEnabled = !isLoopEnabled;
    loopButton.classList.toggle('active', isLoopEnabled);
    if (currentSound && player) player.loop = isLoopEnabled;
     loopButton.setAttribute('aria-pressed', isLoopEnabled);
}

 function updateMediaSessionMetadata(title, category) {
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: title, artist: category || 'KidsCalm',
                artwork: [ { src: 'icon-192.png', sizes: '192x192', type: 'image/png' }, { src: 'icon-512.png', sizes: '512x512', type: 'image/png' } ]});
             navigator.mediaSession.setActionHandler('play', togglePlayPause);
             navigator.mediaSession.setActionHandler('pause', togglePlayPause);
             navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
             navigator.mediaSession.setActionHandler('nexttrack', playNext);
        } catch (error) { console.error("Failed to update Media Session:", error); }
    }
}

// --- Таймер сна ---
function clearSleepTimer(restoreVolume = true) {
    if (activeTimer) clearTimeout(activeTimer); if (countdownInterval) clearInterval(countdownInterval);
    activeTimer = null; countdownInterval = null; timerEndTime = null;
    if (sleepTimerBtn) { sleepTimerBtn.classList.remove('active'); sleepTimerBtn.title = "Таймер сна"; sleepTimerBtn.removeAttribute('aria-pressed'); }
     if (restoreVolume && player && player.volume < originalVolume) {
        let vol = player.volume;
        const fadeUpInterval = setInterval(() => {
             if (!player) { clearInterval(fadeUpInterval); return; }
            vol += 0.05;
            if (vol >= originalVolume) { player.volume = originalVolume; clearInterval(fadeUpInterval); }
             else player.volume = vol;
        }, 50);
     } else if (restoreVolume && player) player.volume = originalVolume;
}

function startSleepTimer(minutes) {
    clearSleepTimer(false);
    if (minutes <= 0) { toggleTimerMenu(); if (player) player.volume = originalVolume; return; }
    if (!player || !sleepTimerBtn || !isPlaying) { console.log("Timer not started: inactive."); toggleTimerMenu(); return; }
    originalVolume = player.volume;
    sleepTimerBtn.classList.add('active'); sleepTimerBtn.setAttribute('aria-pressed', 'true');
    const fadeDuration = 5000; const totalDuration = minutes * 60000; timerEndTime = Date.now() + totalDuration;
     function updateTimerButtonTitle() {
        if (!timerEndTime || !sleepTimerBtn) { if(countdownInterval) clearInterval(countdownInterval); return; }
        const remaining = Math.max(0, timerEndTime - Date.now());
        if (remaining === 0 && countdownInterval) clearInterval(countdownInterval);
        const mins = Math.floor(remaining / 60000); const secs = Math.floor((remaining % 60000) / 1000);
        sleepTimerBtn.title = `Таймер: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
     }
     updateTimerButtonTitle(); countdownInterval = setInterval(updateTimerButtonTitle, 1000);
    activeTimer = setTimeout(() => {
        const steps = 50; const stepTime = fadeDuration / steps; let currentStep = 0; const startVolume = player.volume;
        const fadeInterval = setInterval(() => {
             if (!player) { clearInterval(fadeInterval); clearSleepTimer(false); return; }
            currentStep++; const newVolume = Math.max(0, startVolume * (1 - (currentStep / steps)));
            if (newVolume <= 0 || currentStep >= steps) { player.volume = 0; player.pause(); clearInterval(fadeInterval); clearSleepTimer(false); }
             else player.volume = newVolume;
        }, stepTime);
    }, Math.max(0, totalDuration - fadeDuration));
     toggleTimerMenu();
}

function toggleTimerMenu(event) {
    if (event) event.stopPropagation();
    isTimerMenuOpen = !isTimerMenuOpen;
    if (timerMenu) timerMenu.classList.toggle('show', isTimerMenuOpen);
     if(sleepTimerBtn) sleepTimerBtn.setAttribute('aria-expanded', isTimerMenuOpen);
}

// --- Функция инициализации приложения ---
async function initializeApp() {
    nowPlaying.textContent = "Загрузка данных...";
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
        const data = await response.json();
        sounds = data.sounds; stories = data.stories; categories = data.categories;
        console.log("Data loaded successfully");
        nowPlaying.textContent = "Выберите звук или сказку";
        setupEventListeners(); renderCategories(); filterSounds("all"); renderStories();
        loopButton.classList.toggle('active', isLoopEnabled); loopButton.setAttribute('aria-pressed', isLoopEnabled);
         prevButton.setAttribute('aria-label', 'Предыдущий трек'); nextButton.setAttribute('aria-label', 'Следующий трек'); loopButton.setAttribute('aria-label', 'Зациклить'); minimizeButton.setAttribute('aria-label', 'Свернуть плеер'); sleepTimerBtn.setAttribute('aria-label', 'Таймер сна'); sleepTimerBtn.setAttribute('aria-expanded', 'false');
        console.log("KidsCalm App Initialized");
        // PWA Service Worker Registration
        if ('serviceWorker' in navigator) {
           window.addEventListener('load', () => {
             navigator.serviceWorker.register('/service-worker.js').then(reg => {
                 console.log('[SW] Registered: ', reg.scope);
                 reg.onupdatefound = () => { const worker = reg.installing; if (!worker) return; worker.onstatechange = () => { if (worker.state === 'installed') { if (navigator.serviceWorker.controller) console.log('[SW] New content available; refresh.'); else console.log('[SW] Content cached for offline.'); } }; };
               }).catch(error => console.log('[SW] Registration failed: ', error));
           });
             navigator.serviceWorker.addEventListener('controllerchange', () => { console.log('[SW] Controller changed, reloading.'); window.location.reload(); });
        }
    } catch (error) {
        console.error("Could not load application data:", error);
        nowPlaying.textContent = "Ошибка загрузки данных"; currentCategoryEl.textContent = "Проверьте интернет или попробуйте позже";
        if(playPauseButton) playPauseButton.disabled = true; if(nextButton) nextButton.disabled = true; if(prevButton) prevButton.disabled = true;
    }
}

// --- Настройка обработчиков событий ---
function setupEventListeners() {
    tabSounds.addEventListener("click", () => {
      if (!tabSounds.classList.contains('active')) {
        tabSounds.classList.add("active"); tabStories.classList.remove("active");
        soundSection.classList.add("active-section"); storySection.classList.remove("active-section");
        filterSounds(currentCategoryFilter);
         const activeStoryCard = storyList.querySelector('.card.active'); if (activeStoryCard) activeStoryCard.classList.remove('active');
         updateActiveCard();
      }
    });
    tabStories.addEventListener("click", () => {
       if (!tabStories.classList.contains('active')) {
        tabSounds.classList.remove("active"); tabStories.classList.add("active");
        soundSection.classList.remove("active-section"); storySection.classList.add("active-section");
         updateCurrentPlaylist(stories, 'story');
         const activeSoundCard = soundList.querySelector('.card.active'); if (activeSoundCard) activeSoundCard.classList.remove('active');
         renderStories(); // Вызываем для обновления подсветки и длительностей (из кэша)
      }
    });
    playPauseButton.addEventListener('click', togglePlayPause);
    nextButton.addEventListener('click', playNext);
    prevButton.addEventListener('click', playPrevious);
    loopButton.addEventListener('click', toggleLoop);
    minimizeButton.addEventListener("click", hidePlayer);
    miniPlayer.addEventListener("click", showPlayer);
    volumeSlider.addEventListener('input', () => { if(player) { player.volume = volumeSlider.value; if (!activeTimer) originalVolume = player.volume; } });
    if(player) {
        player.addEventListener('timeupdate', () => { if (player.duration && isFinite(player.duration)) { const perc = (player.currentTime / player.duration) * 100; if (progress) progress.style.width = `${perc}%`; } else if (progress) progress.style.width = '0%'; });
        player.addEventListener('ended', () => { console.log("Track ended"); if (currentStory || (currentSound && !player.loop)) playNext(); else if (currentSound && player.loop) console.log("Looping sound"); else { isPlaying = false; updatePlayPauseButton(); console.log("Ended unexpectedly"); } });
        player.addEventListener('play', () => { isPlaying = true; updatePlayPauseButton(); if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'playing'; } catch(e){} console.log("Player state: playing"); });
        player.addEventListener('pause', () => { isPlaying = false; updatePlayPauseButton(); if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'paused'; } catch(e){} console.log("Player state: paused"); if (activeTimer && player.volume > 0) { console.log("Paused manually, clearing timer."); clearSleepTimer(); } });
        player.addEventListener('error', (e) => { console.error("Audio Player Error:", e, player.error); isPlaying = false; updatePlayPauseButton(); let msg = "Ошибка воспроизведения"; if (player.error) switch (player.error.code) { case 1: msg='Загрузка прервана'; break; case 2: msg='Ошибка сети'; break; case 3: msg='Ошибка декодирования'; break; case 4: msg='Формат не поддерживается'; break; default: msg='Неизвестная ошибка'; } nowPlaying.textContent = msg; currentCategoryEl.textContent = (currentSound?.title || currentStory?.title || ''); progress.style.width = '0%'; currentSound = null; currentStory = null; updateActiveCard(); clearSleepTimer(); });
        player.addEventListener('canplay', () => console.log("Player canplay"));
        player.addEventListener('canplaythrough', () => console.log("Player canplaythrough"));
        player.addEventListener('seeking', () => { console.log("Player seeking..."); if(progressBar) progressBar.style.opacity = '0.7'; });
        player.addEventListener('seeked', () => { console.log("Player seeked complete."); if(progressBar) progressBar.style.opacity = '1'; });
    }
    if(progressBar) {
        progressBar.addEventListener('click', (e) => {
          if (!player || !player.duration || !isFinite(player.duration) || (!currentSound && !currentStory)) { console.log("Seek aborted."); return; }
          const rect = progressBar.getBoundingClientRect(); const pos = (e.clientX - rect.left) / rect.width; const targetTime = Math.max(0, Math.min(player.duration, pos * player.duration)); let canSeek = false;
          if (player.seekable) { try { for (let i = 0; i < player.seekable.length; i++) { if (targetTime >= player.seekable.start(i) && targetTime <= player.seekable.end(i)) { canSeek = true; break; } } } catch (err) { console.warn("Seekable check error", err); canSeek = true; } }
          else { console.warn("seekable not supported."); canSeek = true; }
          if (canSeek) { console.log(`Seek to: ${targetTime.toFixed(2)}`); player.currentTime = targetTime; const perc = (targetTime / player.duration) * 100; if (progress) progress.style.width = `${perc}%`; }
          else console.warn(`Cannot seek to ${targetTime.toFixed(2)}.`);
        });
    }
     if(sleepTimerBtn) sleepTimerBtn.addEventListener('click', toggleTimerMenu);
     document.querySelectorAll('.timer-option').forEach(option => { option.addEventListener('click', (e) => { try { const min = parseInt(e.target.dataset.minutes); startSleepTimer(min); } catch (error) { console.error("Timer option error:", error); } }); });
     document.addEventListener('click', (e) => { if (isTimerMenuOpen && timerMenu && sleepTimerBtn && !timerMenu.contains(e.target) && !sleepTimerBtn.contains(e.target)) toggleTimerMenu(); });
}

// --- Запуск приложения ---
initializeApp();