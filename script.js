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

// --- Функции ---

// Генерация категорий
function renderCategories() {
    if (!categoriesContainer) return; // Добавим проверку
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

// Генерация карточек звуков
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
    updateCurrentPlaylist(soundsToRender, 'sound');
}

// Генерация карточек сказок
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
                <span class="card-duration">${story.duration}</span>
             </div>`;
         if (currentStory && currentStory.file === story.file) {
             div.classList.add('active');
         }
        div.addEventListener("click", () => playItem(story, 'story'));
        storyList.appendChild(div);
    });
     if (tabStories.classList.contains('active')) {
         updateCurrentPlaylist(stories, 'story');
     }
}

// Фильтрация и отображение звуков
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

 // Обновление текущего плейлиста для Next/Prev
 function updateCurrentPlaylist(items, type) {
     currentPlaylist = items.map(item => ({ ...item, type }));
     const playingItem = type === 'sound' ? currentSound : currentStory;
     if (playingItem) {
         const pathKey = type === 'sound' ? `sounds/${playingItem.file}` : playingItem.file;
         currentIndexInPlaylist = currentPlaylist.findIndex(item => (item.type === 'sound' ? `sounds/${item.file}` : item.file) === pathKey);
     } else {
         currentIndexInPlaylist = -1;
     }
 }

// Обновление иконки Play/Pause
function updatePlayPauseButton() {
    const img = playPauseButton.querySelector('img');
    const miniPlayerImg = miniPlayer.querySelector('img');
    if (!img || !miniPlayerImg) return;
    if (isPlaying) {
        img.src = 'pause.svg';
        img.alt = 'Pause';
        miniPlayerImg.src = 'pause.svg';
        miniPlayerImg.alt = 'Pause';
    } else {
        img.src = 'play.svg';
        img.alt = 'Play';
        miniPlayerImg.src = 'play.svg';
        miniPlayerImg.alt = 'Play';
    }
}

// Обновление подсветки активной карточки
function updateActiveCard() {
    document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));
    const playingItem = currentSound || currentStory;
    if (playingItem) {
        const filePath = currentSound ? `sounds/${playingItem.file}` : playingItem.file;
        // Экранируем кавычки и другие спецсимволы в пути, если они могут там быть
        const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        const activeCard = document.querySelector(`.card[data-file="${escapedFilePath}"]`);
        if (activeCard) {
            activeCard.classList.add('active');
        }
    }
}

// Показать основной плеер
function showPlayer() {
    if (!playerControls || !miniPlayer) return;
    playerControls.classList.add("show");
    document.body.classList.add("player-open");
    miniPlayer.classList.remove("show");
}

// Скрыть основной плеер (показать мини-плеер, если что-то играет)
function hidePlayer() {
    if (!playerControls || !miniPlayer || !player) return;
    playerControls.classList.remove("show");
    document.body.classList.remove("player-open");
    setTimeout(() => {
        if (player.src && !playerControls.classList.contains('show')) {
             miniPlayer.classList.add("show");
        }
    }, 400);
}

// Воспроизведение элемента (звук или сказка)
function playItem(item, type) {
     if (!player || !nowPlaying || !currentCategoryEl) return;
     let path, categoryName;

     if (type === 'sound') {
        path = `sounds/${item.file}`;
        const categoryData = categories.find(c => c.id === item.categoryId);
        categoryName = categoryData ? categoryData.name : 'Звук';
        player.loop = isLoopEnabled;
        currentSound = item;
        currentStory = null;
     } else { // type === 'story'
         path = item.file;
         categoryName = 'Сказка';
         player.loop = false;
         currentStory = item;
         currentSound = null;
     }

     // Используем player.src.endsWith() для проверки, чтобы избежать проблем с полным путем
     const currentPathEnd = player.src.substring(player.src.lastIndexOf('/') + 1);
     const newPathEnd = path.substring(path.lastIndexOf('/') + 1);

     if (player.src && currentPathEnd === newPathEnd) {
         if (!playerControls.classList.contains('show')) {
             showPlayer();
         }
         return;
     }

     player.src = path;
     nowPlaying.textContent = item.title;
     currentCategoryEl.textContent = categoryName;

     if (type === 'sound') {
         const currentVisibleSounds = currentCategoryFilter === "all"
             ? sounds
             : sounds.filter(s => s.categoryId === currentCategoryFilter);
         updateCurrentPlaylist(currentVisibleSounds, 'sound');
     } else {
          updateCurrentPlaylist(stories, 'story');
     }
     currentIndexInPlaylist = currentPlaylist.findIndex(i => (i.type === 'sound' ? `sounds/${i.file}` : i.file) === path);

     player.volume = volumeSlider.value;
     const playPromise = player.play();

     if (playPromise !== undefined) {
        playPromise.then(_ => {
            isPlaying = true;
            updatePlayPauseButton();
            updateActiveCard();
            showPlayer();
            updateMediaSessionMetadata(item.title, categoryName);
        }).catch(error => {
            console.error("Playback failed:", error);
            isPlaying = false;
            updatePlayPauseButton();
        });
     }
}

 // Переключить Play/Pause
function togglePlayPause() {
    if (!player || !player.src) return;

    if (isPlaying) {
        player.pause();
    } else {
        const playPromise = player.play();
         if (playPromise !== undefined) {
            playPromise.catch(error => {
                console.error("Playback failed:", error);
                isPlaying = false;
                updatePlayPauseButton();
            });
        }
    }
    // isPlaying будет обновлен событиями 'play'/'pause' плеера
}

// Следующий трек
function playNext() {
    if (currentPlaylist.length === 0 || currentIndexInPlaylist < 0) return;

    let nextIndex = currentIndexInPlaylist + 1;
    if (currentStory && nextIndex >= currentPlaylist.length) {
         // Останавливаемся на последней сказке
         return;
    }
    if (nextIndex >= currentPlaylist.length) {
        nextIndex = 0; // Цикл для звуков или если сказки нужно зациклить
    }

     if (nextIndex < currentPlaylist.length) {
         const nextItem = currentPlaylist[nextIndex];
         playItem(nextItem, nextItem.type);
     }
}

// Предыдущий трек
function playPrevious() {
    // Разрешаем переход к предыдущему даже с первого трека (на последний)
    if (currentPlaylist.length === 0) return;

    let prevIndex = currentIndexInPlaylist - 1;
    if (prevIndex < 0) {
         // Если это сказка и мы на первом треке, не переходим назад
         if (currentStory) return;
         // Для звуков переходим на последний трек
         prevIndex = currentPlaylist.length - 1;
    }

    if (prevIndex >= 0 && prevIndex < currentPlaylist.length) {
        const prevItem = currentPlaylist[prevIndex];
        playItem(prevItem, prevItem.type);
    }
}


// Переключить зацикливание трека (только для звуков)
function toggleLoop() {
    if (!loopButton) return;
    isLoopEnabled = !isLoopEnabled;
    loopButton.classList.toggle('active', isLoopEnabled);
    if (currentSound && player) { // Применяем только если играет звук
        player.loop = isLoopEnabled;
    }
}

 // Обновление метаданных Media Session
function updateMediaSessionMetadata(title, category) {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
            title: title,
            artist: category || 'KidsCalm',
            artwork: [
                { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
                { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
            ]
        });
    }
}

// --- Таймер сна ---
function clearSleepTimer() {
    if (activeTimer) clearTimeout(activeTimer);
    if (countdownInterval) clearInterval(countdownInterval);
    activeTimer = null;
    countdownInterval = null;
    timerEndTime = null;
    if (sleepTimerBtn) sleepTimerBtn.classList.remove('active');

    const currentVolume = player ? player.volume : 0;
     if (player && currentVolume < originalVolume) {
        let vol = currentVolume;
        const fadeUpInterval = setInterval(() => {
            vol += 0.05;
            if (vol >= originalVolume) {
                player.volume = originalVolume;
                clearInterval(fadeUpInterval);
            } else {
                player.volume = vol;
            }
        }, 50);
     } else if (player) {
          player.volume = originalVolume;
     }
     if(sleepTimerBtn) sleepTimerBtn.title = "Таймер сна";
}

function startSleepTimer(minutes) {
    clearSleepTimer();

    if (minutes <= 0) {
         toggleTimerMenu();
         return;
    }
    if (!player || !sleepTimerBtn) return;

    originalVolume = player.volume;
    sleepTimerBtn.classList.add('active');
    const fadeDuration = 5000;
    const totalDuration = minutes * 60000;
    timerEndTime = Date.now() + totalDuration;

     function updateTimerButtonTitle() {
        if (!timerEndTime || !sleepTimerBtn) return;
        const remaining = Math.max(0, timerEndTime - Date.now());
        const mins = Math.floor(remaining / 60000);
        const secs = Math.floor((remaining % 60000) / 1000);
        sleepTimerBtn.title = `Таймер: ${mins}:${secs < 10 ? '0' : ''}${secs}`;
     }
     updateTimerButtonTitle();
     countdownInterval = setInterval(updateTimerButtonTitle, 1000);


    activeTimer = setTimeout(() => {
        const steps = 50;
        const stepTime = fadeDuration / steps;
        let currentStep = 0;

        const fadeInterval = setInterval(() => {
            currentStep++;
            const newVolume = originalVolume * (1 - (currentStep / steps));

            if (newVolume <= 0 || currentStep >= steps) {
                if(player) {
                    player.volume = 0;
                    player.pause(); // pause обновит isPlaying через событие
                }
                clearInterval(fadeInterval);
                clearSleepTimer();
            } else if (player) {
                player.volume = newVolume;
            }
        }, stepTime);
    }, Math.max(0, totalDuration - fadeDuration));

     toggleTimerMenu();
}

function toggleTimerMenu(event) {
    if (event) event.stopPropagation();
    isTimerMenuOpen = !isTimerMenuOpen;
    if (timerMenu) timerMenu.classList.toggle('show', isTimerMenuOpen);
}

// --- Функция инициализации приложения ---
async function initializeApp() {
    // Загружаем данные
    try {
        const response = await fetch('data.json');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        sounds = data.sounds;
        stories = data.stories;
        categories = data.categories;

        console.log("Data loaded successfully");

        // Инициализация после загрузки данных
        setupEventListeners();
        renderCategories();
        filterSounds("all"); // Показываем все звуки при старте
        renderStories();
        loopButton.classList.toggle('active', isLoopEnabled);

         // Инициализация Media Session
         if ('mediaSession' in navigator) {
            navigator.mediaSession.setActionHandler('play', togglePlayPause);
            navigator.mediaSession.setActionHandler('pause', togglePlayPause);
            navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
         }

        console.log("KidsCalm App Initialized");

        // PWA Service Worker Registration (если нужно)
        if ('serviceWorker' in navigator) {
           window.addEventListener('load', () => {
             navigator.serviceWorker.register('/service-worker.js')
               .then(registration => {
                 console.log('ServiceWorker registration successful with scope: ', registration.scope);
               })
               .catch(error => {
                 console.log('ServiceWorker registration failed: ', error);
        });
        });
        }

    } catch (error) {
        console.error("Could not load application data:", error);
        // Отобразить сообщение об ошибке пользователю?
        nowPlaying.textContent = "Ошибка загрузки данных";
    }
}

// --- Настройка обработчиков событий (выносим в отдельную функцию) ---
function setupEventListeners() {
    // Переключение вкладок
    tabSounds.addEventListener("click", () => {
      if (!tabSounds.classList.contains('active')) {
        tabSounds.classList.add("active");
        tabStories.classList.remove("active");
        soundSection.classList.add("active-section");
        storySection.classList.remove("active-section");
        filterSounds(currentCategoryFilter);
      }
    });

    tabStories.addEventListener("click", () => {
       if (!tabStories.classList.contains('active')) {
        tabSounds.classList.remove("active");
        tabStories.classList.add("active");
        soundSection.classList.remove("active-section");
        storySection.classList.add("active-section");
         updateCurrentPlaylist(stories, 'story');
          const activeSoundCard = soundList.querySelector('.card.active');
         if (activeSoundCard) activeSoundCard.classList.remove('active');
         renderStories(); // Перерисовываем, чтобы подсветить активную сказку, если она есть
      }
    });

    // Управление плеером
    playPauseButton.addEventListener('click', togglePlayPause);
    nextButton.addEventListener('click', playNext);
    prevButton.addEventListener('click', playPrevious);
    loopButton.addEventListener('click', toggleLoop);
    minimizeButton.addEventListener("click", hidePlayer);
    miniPlayer.addEventListener("click", showPlayer);

    // Громкость
    volumeSlider.addEventListener('input', () => {
        if(player) {
            player.volume = volumeSlider.value;
            originalVolume = player.volume;
        }
    });

    // Прогресс
    if(player) {
        player.addEventListener('timeupdate', () => {
          if (player.duration && isFinite(player.duration)) {
            const percentage = (player.currentTime / player.duration) * 100;
            if (progress) progress.style.width = `${percentage}%`;
          } else if (progress) {
              progress.style.width = '0%';
          }
        });

        // Завершение трека
        player.addEventListener('ended', () => {
            if (currentStory || (currentSound && !player.loop)) {
                 playNext();
            } else {
                 // Если звук с loop=true, он зациклится сам
                 // Если трек был последний и не зациклен, нужно обновить кнопку Play
                 if(!player.loop) {
                     isPlaying = false;
                     updatePlayPauseButton();
                 }
            }
        });

         // Статус плеера
         player.addEventListener('play', () => {
             isPlaying = true;
             updatePlayPauseButton();
             if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
         });
         player.addEventListener('pause', () => {
             isPlaying = false;
             updatePlayPauseButton();
              if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused';
         });
    } // end if(player)

    if(progressBar) {
        progressBar.addEventListener('click', (e) => {
          if (!player || !player.duration || !isFinite(player.duration)) return;
          const rect = progressBar.getBoundingClientRect();
          const pos = (e.clientX - rect.left) / rect.width;
          player.currentTime = Math.max(0, Math.min(player.duration, pos * player.duration));
        });
    }

     // Таймер сна
     if(sleepTimerBtn) sleepTimerBtn.addEventListener('click', toggleTimerMenu);
     document.querySelectorAll('.timer-option').forEach(option => {
         option.addEventListener('click', (e) => {
             const minutes = parseInt(e.target.dataset.minutes);
             startSleepTimer(minutes);
         });
     });
     document.addEventListener('click', (e) => {
        if (isTimerMenuOpen && timerMenu && sleepTimerBtn && !timerMenu.contains(e.target) && e.target !== sleepTimerBtn && !sleepTimerBtn.contains(e.target)) {
            toggleTimerMenu();
        }
     });
}

// --- Запуск приложения ---
initializeApp();