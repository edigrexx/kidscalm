// --- DOM Элементы ---
const tabSounds = document.getElementById("tab-sounds");
const tabStories = document.getElementById("tab-stories");
const tabFavorites = document.getElementById("tab-favorites"); // Добавлено для избранного
const soundSection = document.getElementById("sound-section");
const storySection = document.getElementById("story-section");
const favoritesSection = document.getElementById("favorites-section"); // Добавлено для избранного
const categoriesContainer = document.querySelector('#sound-section .categories');
const soundList = document.getElementById("sound-list");
const storyList = document.getElementById("story-list");
const favoritesList = document.getElementById("favorites-list"); // Добавлено для избранного
const noFavoritesMsg = document.getElementById("no-favorites"); // Добавлено для избранного
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

// --- Переменные для данных ---
let sounds = [];
let stories = [];
let categories = [];
let storyDurationsCache = null;

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
let lastTimeUpdateSave = 0; // Для троттлинга сохранения времени

// --- Состояние избранного и LocalStorage ключи ---
let favorites = []; // Массив идентификаторов (file)
const FAVORITES_KEY = 'kidscalm_favorites';
const LAST_STATE_KEY = 'kidscalm_lastState';
const VOLUME_KEY = 'kidscalm_volume';

// --- Вспомогательные функции ---
function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
        return "--:--";
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// --- Функции для работы с Избранным (localStorage) ---
function loadFavorites() {
    const saved = localStorage.getItem(FAVORITES_KEY);
    favorites = saved ? JSON.parse(saved) : [];
    console.log("Favorites loaded:", favorites);
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function isFavorite(fileId) {
    // Убедимся, что fileId не содержит путь 'sounds/' если это звук
    const baseFileId = fileId.includes('/') ? fileId.substring(fileId.lastIndexOf('/') + 1) : fileId;
    return favorites.includes(baseFileId);
}

function toggleFavorite(fileId, type, element) {
     // fileId здесь должен быть базовым именем файла (без папки)
    const baseFileId = fileId.includes('/') ? fileId.substring(fileId.lastIndexOf('/') + 1) : fileId;
    const index = favorites.indexOf(baseFileId);

    if (index > -1) { // Уже в избранном - удаляем
         favorites.splice(index, 1);
         console.log(`Removed ${baseFileId} from favorites`);
    } else { // Нет в избранном - добавляем
         favorites.push(baseFileId);
         console.log(`Added ${baseFileId} to favorites`);
    }
    saveFavorites();

    // Обновляем вид кнопки, которую нажали (если она передана)
    if (element) {
         element.classList.toggle('is-favorite', index === -1);
         element.setAttribute('aria-label', index === -1 ? 'Удалить из избранного' : 'Добавить в избранное');
    }

    // Обновляем вид ВСЕХ кнопок с этим ID в DOM
    updateFavoriteStatusInDOM(baseFileId);

    // Если открыта вкладка "Избранное", перерисовываем ее
    if (tabFavorites.classList.contains('active')) {
         renderFavorites();
    }
}

// Обновляет статус звезд на ВСЕХ карточках с этим fileId
function updateFavoriteStatusInDOM(baseFileId) {
    const isFav = isFavorite(baseFileId);
    // Ищем кнопки по data-file-id, который должен содержать базовое имя файла
    document.querySelectorAll(`.favorite-button[data-file-id="${baseFileId}"]`).forEach(btn => {
         btn.classList.toggle('is-favorite', isFav);
         btn.setAttribute('aria-label', isFav ? 'Удалить из избранного' : 'Добавить в избранное');
     });
    // TODO: Можно добавить обновление звезды в плеере, если она там будет
}
// --- Конец функций Избранного ---

// --- Функции сохранения/загрузки состояния плеера ---
function saveLastPlayerState() {
    const currentItem = currentSound || currentStory;
    if (currentItem && player && player.currentTime > 0 && player.duration > 0 && isFinite(player.duration)) { // Добавлена проверка isFinite
        const state = {
            file: currentItem.file, // Базовое имя файла
            type: currentSound ? 'sound' : 'story',
            time: player.currentTime,
            duration: player.duration, // Сохраним и длительность
            title: currentItem.title,
            category: currentCategoryEl.textContent
        };
        localStorage.setItem(LAST_STATE_KEY, JSON.stringify(state));
        // console.log('Saved last state:', state);
    } else {
        // Если ничего не играет или время 0 или длительность невалидна, очищаем состояние
        localStorage.removeItem(LAST_STATE_KEY);
        // console.log('Cleared last state');
    }
}

function loadLastPlayerState() {
    const savedStateString = localStorage.getItem(LAST_STATE_KEY);
    if (savedStateString) {
        try {
            const savedState = JSON.parse(savedStateString);
            console.log('Loading last state:', savedState);

            let itemToLoad = null;
            if (savedState.type === 'sound') {
                itemToLoad = sounds.find(s => s.file === savedState.file);
            } else {
                itemToLoad = stories.find(s => s.file === savedState.file);
            }

            // Проверяем, что трек найден и время/длительность валидны
            if (itemToLoad && player && savedState.time > 0 && savedState.duration > 0 && savedState.time < savedState.duration) {
                // НЕ вызываем playItem, чтобы избежать автоплея
                // Просто настраиваем плеер и UI

                // Устанавливаем источник
                const path = savedState.type === 'sound' ? `sounds/${itemToLoad.file}` : itemToLoad.file;
                try {
                     // preload="metadata" должен быть у audio тега
                     player.src = path;
                     console.log(`Set player src to: ${path}`);
                } catch (err) {
                     console.error("Error setting src from saved state:", err);
                     localStorage.removeItem(LAST_STATE_KEY);
                     return;
                }

                // Устанавливаем текущий элемент
                if (savedState.type === 'sound') {
                    currentSound = itemToLoad;
                    currentStory = null;
                    player.loop = isLoopEnabled;
                    loopButton.classList.toggle('active', isLoopEnabled);
                    loopButton.disabled = false;
                } else {
                    currentStory = itemToLoad;
                    currentSound = null;
                    player.loop = false;
                    loopButton.classList.remove('active');
                    loopButton.disabled = true;
                }

                // Обновляем UI плеера
                nowPlaying.textContent = savedState.title || itemToLoad.title;
                currentCategoryEl.textContent = savedState.category || (savedState.type === 'sound' ? 'Звук' : 'Сказка');

                 // Показываем плеер
                 showPlayer();

                 // Устанавливаем время и прогресс-бар ТОЛЬКО когда плеер готов
                 const setTimeHandler = () => {
                     // Проверяем, что src все еще тот, который мы установили
                     // И что сохраненное время меньше актуальной длительности плеера
                     if (player.src && player.src.endsWith(savedState.file) && player.duration > 0 && savedState.time < player.duration) {
                        player.currentTime = savedState.time;
                        const perc = (player.currentTime / player.duration) * 100;
                        if (progress) progress.style.width = `${perc}%`;
                        console.log(`Restored time to ${savedState.time.toFixed(2)}`);
                        updateActiveCard(); // Обновить подсветку карточки после установки времени
                     } else {
                         console.warn(`Could not restore time. Saved time: ${savedState.time}, Player duration: ${player.duration}`);
                          localStorage.removeItem(LAST_STATE_KEY); // Очистить невалидное состояние
                          if(progress) progress.style.width = '0%';
                     }
                 };

                 // Ждем события 'loadedmetadata' ИЛИ 'canplay'
                 // Используем флаг, чтобы обработчик сработал только один раз
                 let timeSet = false;
                 const handler = () => {
                     if (!timeSet) {
                         setTimeHandler();
                         timeSet = true;
                     }
                 };
                 player.addEventListener('loadedmetadata', handler, { once: true });
                 player.addEventListener('canplay', handler, { once: true });


                // Обновляем плейлист и индекс (ВАЖНО для next/prev)
                 if (savedState.type === 'sound') {
                    const currentVisibleSounds = currentCategoryFilter === "all" ? sounds : sounds.filter(s => s.categoryId === currentCategoryFilter);
                    updateCurrentPlaylist(currentVisibleSounds, 'sound');
                } else {
                    updateCurrentPlaylist(stories, 'story');
                }
                 currentIndexInPlaylist = currentPlaylist.findIndex(i => i.file === savedState.file);
                 console.log("Restored playlist index:", currentIndexInPlaylist);


            } else {
                console.log("Saved state invalid, item not found, or time invalid. Clearing.");
                localStorage.removeItem(LAST_STATE_KEY);
            }
        } catch (e) {
            console.error("Error loading last player state:", e);
            localStorage.removeItem(LAST_STATE_KEY);
        }
    } else {
         console.log("No saved player state found.");
    }

     // Восстановить громкость в любом случае
     const savedVolume = localStorage.getItem(VOLUME_KEY);
     if (savedVolume !== null && player) {
         const volumeValue = parseFloat(savedVolume);
         if (!isNaN(volumeValue)) {
             volumeSlider.value = volumeValue;
             player.volume = volumeValue;
             originalVolume = volumeValue; // Установить как исходную для таймера
             console.log(`Restored volume to ${volumeValue}`);
         }
     }
}
// --- Конец функций сохранения/загрузки ---


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
        const filePath = `sounds/${sound.file}`;
        const baseFileId = sound.file; // Используем имя файла как ID для избранного
        const isFav = isFavorite(baseFileId);
        div.dataset.file = filePath; // Полный путь для воспроизведения и подсветки
        const icon = sound.icon || '🎵'; // Иконка по умолчанию

        // ИСПРАВЛЕНО: Символ звезды удален из HTML кнопки
        div.innerHTML = `
            <span class='card-icon'>${icon}</span>
            <div class="card-content">
               <span class="card-title">${sound.title}</span>
            </div>
             <button class="favorite-button ${isFav ? 'is-favorite' : ''}"
                     data-file-id="${baseFileId}"
                     aria-label="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}"></button>
        `;

        // Подсветка активной карточки
        if (currentSound && filePath === `sounds/${currentSound.file}`) {
             div.classList.add('active');
        }

        // Обработчик клика по карточке (для воспроизведения)
        div.addEventListener("click", () => playItem(sound, 'sound'));

        // Обработчик клика по кнопке "Избранное"
        const favButton = div.querySelector('.favorite-button');
        favButton.addEventListener('click', (e) => {
             e.stopPropagation(); // Предотвратить запуск playItem
             toggleFavorite(baseFileId, 'sound', e.currentTarget);
         });

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
        const baseFileId = story.file; // Используем полный путь как ID для сказок
        const isFav = isFavorite(baseFileId);
        div.dataset.file = story.file; // Полный путь для воспроизведения и подсветки
        const icon = '📖'; // Иконка для сказок

        // ИСПРАВЛЕНО: Символ звезды удален из HTML кнопки
        div.innerHTML = `
             <span class='card-icon'>${icon}</span>
             <div class="card-content" style="width: 100%;">
                <span class="card-title">${story.title}</span>
                <span class="card-duration" data-duration-for="${story.file}">--:--</span>
             </div>
              <button class="favorite-button ${isFav ? 'is-favorite' : ''}"
                     data-file-id="${baseFileId}"
                     aria-label="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}"></button>
        `;

         // Подсветка активной карточки
        if (currentStory && currentStory.file === story.file) {
             div.classList.add('active');
        }

        // Обработчик клика по карточке (для воспроизведения)
        div.addEventListener("click", () => playItem(story, 'story'));

        // Обработчик клика по кнопке "Избранное"
        const favButton = div.querySelector('.favorite-button');
        favButton.addEventListener('click', (e) => {
             e.stopPropagation(); // Предотвратить запуск playItem
             toggleFavorite(baseFileId, 'story', e.currentTarget);
         });

        storyList.appendChild(div);
    });

    // Обновление или загрузка длительностей
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

// --- Функция рендеринга избранного ---
function renderFavorites() {
    if (!favoritesList || !noFavoritesMsg) return;

    favoritesList.innerHTML = ''; // Очищаем список
    loadFavorites(); // Убедимся, что массив favorites актуален

    if (favorites.length === 0) {
        noFavoritesMsg.style.display = 'block';
        favoritesList.style.display = 'none'; // Скрыть grid, если пуст
        return;
    } else {
        noFavoritesMsg.style.display = 'none';
        favoritesList.style.display = 'grid'; // Показать grid
    }

    // Получаем полные данные для избранных треков
    const favoriteItems = favorites.map(fileId => {
        // Ищем сначала в сказках (по полному пути), потом в звуках (по имени файла)
        let item = stories.find(s => s.file === fileId);
        if (item) return { ...item, type: 'story' };
        item = sounds.find(s => s.file === fileId);
        if (item) return { ...item, type: 'sound' };
        return null; // Если элемент не найден
    }).filter(item => item !== null); // Убираем ненайденные

     // Сортировка (опционально, например, по названию)
     favoriteItems.sort((a, b) => a.title.localeCompare(b.title));

    // Рендерим карточки
    favoriteItems.forEach((item) => {
         const div = document.createElement("div");
         div.className = "card";
         const baseFileId = item.file; // ID для избранного
         const path = item.type === 'sound' ? `sounds/${item.file}` : item.file;
         div.dataset.file = path; // Полный путь для воспроизведения и подсветки
         const isFav = true; // Все здесь - избранные
         const icon = item.type === 'sound' ? (item.icon || '🎵') : '📖'; // Иконка

         // ИСПРАВЛЕНО: Символ звезды удален из HTML кнопки
         div.innerHTML = `
             <span class='card-icon'>${icon}</span>
             <div class="card-content" style="width: 100%;">
                <span class="card-title">${item.title}</span>
                ${item.type === 'story' ? `<span class="card-duration" data-duration-for="${item.file}">--:--</span>` : ''}
             </div>
             <button class="favorite-button is-favorite"
                     data-file-id="${baseFileId}"
                     aria-label="Удалить из избранного"></button>
         `;

         // Подсветка активной карточки
         const playingItem = currentSound || currentStory;
         if (playingItem && path === (currentSound ? `sounds/${currentSound.file}` : currentStory.file)) {
            div.classList.add('active');
         }

         // Обработчик клика по карточке
         div.addEventListener("click", () => playItem(item, item.type));

         // Обработчик клика по звезде (удаление из избранного)
         const favButton = div.querySelector('.favorite-button');
         favButton.addEventListener('click', (e) => {
             e.stopPropagation();
             toggleFavorite(baseFileId, item.type, e.currentTarget);
             // Перерисовываем список избранного после удаления
             // Это проще, чем удалять элемент из DOM вручную
             renderFavorites();
         });

         favoritesList.appendChild(div);
     });

     // Обновляем длительность для сказок в избранном
      updateDisplayedDurations();
      // Обновляем плейлист, если вкладка активна
      if (tabFavorites.classList.contains('active')) {
           // Передаем тип 'favorites', чтобы отличать от других плейлистов, если нужно
           // или передаем тип из самого item, если он есть
           updateCurrentPlaylist(favoriteItems.map(i => ({...i, type: i.type || (sounds.some(s => s.file === i.file) ? 'sound' : 'story')})), 'favorites');
       }
}
// --- Конец рендеринга избранного ---


// --- Функции загрузки данных и инициализации ---
async function fetchAndDisplayDurations() {
     console.log("--- fetchAndDisplayDurations: НАЧАЛО ---");
    const durationPromises = stories.map(story => {
        return new Promise((resolve) => {
            const audioElement = new Audio();
            audioElement.preload = "metadata";
            let cleanupCalled = false; // Флаг для предотвращения двойного вызова cleanup
            const cleanup = () => {
                if (cleanupCalled) return;
                cleanupCalled = true;
                audioElement.removeEventListener('loadedmetadata', onLoadedMetadata);
                audioElement.removeEventListener('error', onError);
                audioElement.src = ""; // Очистка src для освобождения ресурсов
                // audioElement.load(); // Вызов load() после очистки src может вызвать новую ошибку/событие - не нужно
                console.log(`[${story.file}] Cleanup executed.`);
            };
            const onLoadedMetadata = () => {
                // Доп. проверка на валидность длительности
                if (isFinite(audioElement.duration)) {
                    console.log(`[${story.file}] Метаданные ЗАГРУЖЕНЫ. Длительность: ${audioElement.duration}`);
                    resolve({ file: story.file, duration: audioElement.duration });
                } else {
                    console.warn(`[${story.file}] Метаданные загружены, но длительность невалидна: ${audioElement.duration}`);
                    resolve({ file: story.file, duration: null });
                }
                cleanup();
            };
            const onError = (e) => {
                console.error(`[${story.file}] ОШИБКА загрузки метаданных:`, e);
                resolve({ file: story.file, duration: null });
                cleanup();
            };

            audioElement.addEventListener('loadedmetadata', onLoadedMetadata);
            audioElement.addEventListener('error', onError);

            // Таймер на случай, если событие loadedmetadata не сработает
            const timeoutId = setTimeout(() => {
                 console.warn(`[${story.file}] Тайм-аут ожидания метаданных.`);
                 resolve({ file: story.file, duration: null });
                 cleanup();
             }, 10000); // 10 секунд ожидания

            console.log(`[${story.file}] Запрашиваю метаданные...`);
            try {
                 audioElement.src = story.file;
            } catch (err) {
                 console.error(`[${story.file}] КРИТИЧЕСКАЯ ОШИБКА установки src:`, err);
                 clearTimeout(timeoutId); // Очистить таймер при ошибке
                 onError(err); // Вызвать обработчик ошибки
            }
        });
    });

    try {
        const durations = await Promise.all(durationPromises);
        const durationMap = new Map(durations.map(d => [d.file, d.duration]));
        storyDurationsCache = durationMap;
        updateDisplayedDurations(durationMap);
    } catch (error) {
        // Promise.all не должен падать, т.к. мы используем resolve(null) при ошибках
        console.error("fetchAndDisplayDurations: Неожиданная ошибка Promise.all:", error);
    }
     console.log("--- fetchAndDisplayDurations: ЗАВЕРШЕНО ---");
}

function updateDisplayedDurations(durationMap = null) {
    if (!durationMap && storyDurationsCache) {
        durationMap = storyDurationsCache;
    }
    if (!durationMap) {
        console.warn("updateDisplayedDurations: Нет карты длительностей для обновления.");
        return;
    }
    // console.log("--- updateDisplayedDurations: НАЧАЛО ---");

    // Обновляем во всех списках, где могут быть сказки
    [storyList, favoritesList].forEach(list => {
        if (!list) return;
        list.querySelectorAll('.card-duration[data-duration-for]').forEach(durationSpan => {
             const file = durationSpan.dataset.durationFor;
             const duration = durationMap.get(file);
             const formattedTime = formatTime(duration);
             if (durationSpan.textContent !== formattedTime) {
                durationSpan.textContent = formattedTime;
             }
        });
    });
    // console.log("--- updateDisplayedDurations: ЗАВЕРШЕНО ---");
}

function filterSounds(categoryId) {
    currentCategoryFilter = categoryId;
    renderCategories();
    const filteredSounds = categoryId === "all"
        ? sounds
        : sounds.filter(s => s.categoryId === categoryId);
    renderSounds(filteredSounds);
    // Плейлист обновляется внутри renderSounds
}

// Обновляет текущий плейлист для кнопок Next/Prev
function updateCurrentPlaylist(items, type) {
    // Сохраняем оригинальный тип элемента (sound/story), если он есть
    currentPlaylist = items.map(item => ({ ...item, originalType: item.type || (type === 'favorites' ? (sounds.some(s => s.file === item.file) ? 'sound' : 'story') : type) }));

    const playingItem = currentSound || currentStory;
    if (playingItem) {
        const playingPath = currentSound ? `sounds/${playingItem.file}` : playingItem.file;
        currentIndexInPlaylist = currentPlaylist.findIndex(item => {
            const itemPath = item.originalType === 'sound' ? `sounds/${item.file}` : item.file;
            return itemPath === playingPath;
        });
        // console.log(`Updated playlist (${type}). Current index: ${currentIndexInPlaylist} for item: ${playingPath}`);
    } else {
        currentIndexInPlaylist = -1;
        // console.log(`Updated playlist (${type}). No item playing, index: ${currentIndexInPlaylist}`);
    }
}


// --- Функции управления плеером ---
function updatePlayPauseButton() {
    // ... (код без изменений) ...
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
    // ... (код без изменений) ...
     document.querySelectorAll('.card').forEach(card => card.classList.remove('active'));
    const playingItem = currentSound || currentStory;
    if (playingItem) {
        const filePath = currentSound ? `sounds/${playingItem.file}` : playingItem.file;
        const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        try {
            const activeCard = document.querySelector(`.card[data-file="${escapedFilePath}"]`);
            if (activeCard) {
                activeCard.classList.add('active');
                // console.log("Activated card:", escapedFilePath);
            } else {
                // console.log("Active card not found in DOM for:", escapedFilePath);
            }
        } catch (e) {
            console.error("Error selecting active card:", e, "Selector:", `.card[data-file="${escapedFilePath}"]`);
        }
    }
}

function showPlayer() {
    // ... (код без изменений) ...
    if (!playerControls || !miniPlayer) return;
    playerControls.classList.add("show");
    document.body.classList.add("player-open");
    miniPlayer.classList.remove("show");
}

function hidePlayer() {
    // ... (код без изменений) ...
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
     // ... (код без изменений, как в предыдущем ответе) ...
      if (!player || !nowPlaying || !currentCategoryEl || !item) {
         console.error("playItem aborted: Missing player elements or item.");
         return;
     }
     console.log(`playItem called for type: ${type}, title: ${item.title}`);

     let path, categoryName, baseFileId;
     const originalItemType = item.type || type; // Запомним исходный тип для плейлиста

     if (originalItemType === 'sound') {
        path = `sounds/${item.file}`;
        baseFileId = item.file;
        const categoryData = categories.find(c => c.id === item.categoryId);
        categoryName = categoryData ? categoryData.name : 'Звук';
        type = 'sound'; // Нормализуем для логики плеера
     } else { // 'story'
         path = item.file;
         baseFileId = item.file;
         categoryName = 'Сказка';
         type = 'story'; // Нормализуем для логики плеера
     }

     const isCurrentlyPlayingThis = (currentSound && type === 'sound' && currentSound.file === item.file) ||
                                  (currentStory && type === 'story' && currentStory.file === item.file);

     if (isCurrentlyPlayingThis && isPlaying) {
          console.log("Already playing this item.");
          if (!playerControls.classList.contains('show')) showPlayer();
          return;
     }
     if (isCurrentlyPlayingThis && !isPlaying) {
          console.log("Resuming this item.");
          togglePlayPause();
          if (!playerControls.classList.contains('show')) showPlayer();
          return;
     }

     console.log("Starting new item:", path);
     nowPlaying.textContent = "Загрузка...";
     currentCategoryEl.textContent = "";
     progress.style.width = '0%';

     if (type === 'sound') {
        currentSound = item; currentStory = null;
        player.loop = isLoopEnabled;
        loopButton.classList.toggle('active', isLoopEnabled);
        loopButton.disabled = false;
     } else {
         currentStory = item; currentSound = null;
         player.loop = false;
         loopButton.classList.remove('active');
         loopButton.disabled = true;
     }

     try { player.src = path; }
     catch (err) { /* ... обработка ошибки ... */ return; }

     nowPlaying.textContent = item.title;
     currentCategoryEl.textContent = categoryName;

     // Обновляем текущий плейлист В ЗАВИСИМОСТИ ОТ АКТИВНОЙ ВКЛАДКИ
     const activeTab = document.querySelector('.tab.active');
     if (activeTab) {
         if (activeTab.id === 'tab-sounds') {
             const currentVisibleSounds = currentCategoryFilter === "all" ? sounds : sounds.filter(s => s.categoryId === currentCategoryFilter);
             updateCurrentPlaylist(currentVisibleSounds, 'sound');
         } else if (activeTab.id === 'tab-stories') {
             updateCurrentPlaylist(stories, 'story');
         } else if (activeTab.id === 'tab-favorites') {
              const favItemsData = favorites.map(favId => stories.find(s => s.file === favId) || sounds.find(s => s.file === favId)).filter(i => i).sort((a, b) => a.title.localeCompare(b.title));
              updateCurrentPlaylist(favItemsData, 'favorites');
         }
     }
      currentIndexInPlaylist = currentPlaylist.findIndex(i => {
           const itemPath = i.originalType === 'sound' ? `sounds/${i.file}` : i.file;
           return itemPath === path;
       });
       // console.log("After playItem, new playlist index:", currentIndexInPlaylist);

     player.volume = volumeSlider.value;
     const playPromise = player.play();

     if (playPromise !== undefined) {
        playPromise.then(_ => { /* ... успех ... */ }).catch(error => { /* ... ошибка ... */ });
     } else { /* ... старые браузеры ... */ }
}

 function togglePlayPause() {
    // ... (код без изменений, как в предыдущем ответе) ...
    if (!player || !player.src || (!currentSound && !currentStory)) return;
    try {
        if (isPlaying) {
            player.pause();
        } else {
            const playPromise = player.play();
             if (playPromise !== undefined) {
                playPromise.then(() => {
                    isPlaying = true; updatePlayPauseButton();
                     updateMediaSessionMetadata((currentSound || currentStory).title, currentCategoryEl.textContent);
                }).catch(error => { /* ... обработка ошибки ... */ });
            } else {
                 isPlaying = true; updatePlayPauseButton(); updateMediaSessionMetadata((currentSound || currentStory).title, currentCategoryEl.textContent);
            }
        }
    } catch (e) { /* ... обработка ошибки ... */ }
}

function playNext() {
    // ... (код без изменений, как в предыдущем ответе) ...
    console.log("playNext called. Current index:", currentIndexInPlaylist, "Playlist length:", currentPlaylist.length);
    if (currentPlaylist.length === 0) return;
    let nextIndex = currentIndexInPlaylist + 1;
    const currentItem = currentPlaylist[currentIndexInPlaylist]; // Текущий элемент

    // Для сказок: если дошли до конца, останавливаемся
     // Используем originalType для проверки
    if (currentItem && currentItem.originalType === 'story' && nextIndex >= currentPlaylist.length) {
          console.log("End of story playlist.");
          player.pause(); player.currentTime = 0; isPlaying = false;
          updatePlayPauseButton(); progress.style.width = '0%';
          return;
    }
     if (nextIndex >= currentPlaylist.length) nextIndex = 0;

     if (nextIndex >= 0 && nextIndex < currentPlaylist.length) {
         const nextItem = currentPlaylist[nextIndex];
         // Тип передаем из originalType
         playItem(nextItem, nextItem.originalType);
     } else { /* ... остановка ... */ }
}

function playPrevious() {
    // ... (код без изменений, как в предыдущем ответе) ...
     console.log("playPrevious called. Current index:", currentIndexInPlaylist, "Playlist length:", currentPlaylist.length);
    if (currentPlaylist.length === 0) return;
     if (player.currentTime > 3 && currentIndexInPlaylist !== -1) {
         player.currentTime = 0; return;
     }
    let prevIndex = currentIndexInPlaylist - 1;
    const currentItem = currentPlaylist[currentIndexInPlaylist]; // Текущий элемент

     // Для сказок: если в начале, просто перематываем на 0
     // Используем originalType для проверки
    if (currentItem && currentItem.originalType === 'story' && prevIndex < 0) {
         player.currentTime = 0; return;
     }
    if (prevIndex < 0) prevIndex = currentPlaylist.length - 1;

    if (prevIndex >= 0 && prevIndex < currentPlaylist.length) {
         const prevItem = currentPlaylist[prevIndex];
         // Тип передаем из originalType
         playItem(prevItem, prevItem.originalType);
    } else { /* ... перемотка на 0 ... */ }
}

function toggleLoop() {
    // ... (код без изменений) ...
     if (!loopButton || loopButton.disabled) return;
    isLoopEnabled = !isLoopEnabled;
    loopButton.classList.toggle('active', isLoopEnabled);
    loopButton.setAttribute('aria-pressed', isLoopEnabled);
    if (currentSound && player) player.loop = isLoopEnabled;
}

 function updateMediaSessionMetadata(title, category) {
    // ... (код без изменений, как в предыдущем ответе) ...
    if ('mediaSession' in navigator) {
        try {
            navigator.mediaSession.metadata = new MediaMetadata({ /* ... */ });
            navigator.mediaSession.setActionHandler('play', togglePlayPause);
            navigator.mediaSession.setActionHandler('pause', togglePlayPause);
            navigator.mediaSession.setActionHandler('previoustrack', playPrevious);
            navigator.mediaSession.setActionHandler('nexttrack', playNext);
            navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
        } catch (error) { console.error("Failed to update Media Session:", error); }
    }
}

// --- Таймер сна ---
function clearSleepTimer(restoreVolume = true) {
    // ... (код без изменений) ...
}

function startSleepTimer(minutes) {
    // ... (код без изменений, как в предыдущем ответе) ...
}

function toggleTimerMenu(event) {
    // ... (код без изменений) ...
}

// --- Функция инициализации приложения ---
async function initializeApp() {
    // ... (код без изменений, как в предыдущем ответе) ...
     console.log("Initializing KidsCalm App...");
    nowPlaying.textContent = "Загрузка данных...";
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status} ${response.statusText}`);
        const data = await response.json();
        sounds = data.sounds; stories = data.stories; categories = data.categories;
        console.log("Data loaded successfully");

        loadFavorites();
        loadLastPlayerState(); // Попытка загрузить состояние

        if (!player.src) nowPlaying.textContent = "Выберите звук или сказку"; // Текст по умолчанию

        setupEventListeners();
        renderCategories();
        filterSounds("all"); // Рендерит звуки
        renderStories(); // Рендерит сказки

        loopButton.classList.toggle('active', isLoopEnabled);
        loopButton.setAttribute('aria-pressed', isLoopEnabled);
        prevButton.disabled = false;
        nextButton.disabled = false;
        // Установка ARIA
        // ...

        console.log("KidsCalm App Initialized");

        // PWA Service Worker Registration
        if ('serviceWorker' in navigator) {
           window.addEventListener('load', () => {
             navigator.serviceWorker.register('/service-worker.js').then(reg => { /* ... */ }).catch(error => console.log('[SW] Registration failed: ', error));
             navigator.serviceWorker.addEventListener('controllerchange', () => { /* ... перезагрузка ... */ });
           });
        }
    } catch (error) { /* ... обработка ошибки загрузки ... */ }
}

// --- Настройка обработчиков событий ---
function setupEventListeners() {
    // ... (код без изменений, как в предыдущем ответе, включая переключение вкладок, кнопки плеера, события player, progressBar, таймер, beforeunload) ...

     // --- Переключение вкладок ---
    const tabs = [tabSounds, tabStories, tabFavorites];
    const sections = [soundSection, storySection, favoritesSection];

    tabs.forEach((tab, index) => {
        if (!tab) return;
        tab.addEventListener('click', () => {
            if (tab.classList.contains('active')) return;
            tabs.forEach(t => t?.classList.remove('active'));
            sections.forEach(s => s?.classList.remove('active-section'));
            tab.classList.add('active');
            const currentSection = sections[index];
            if (currentSection) currentSection.classList.add('active-section');
            else { console.error("Section not found for tab:", tab.id); return; }

            if (tab.id === 'tab-sounds') filterSounds(currentCategoryFilter);
            else if (tab.id === 'tab-stories') { renderStories(); updateCurrentPlaylist(stories, 'story'); }
            else if (tab.id === 'tab-favorites') renderFavorites(); // Плейлист обновляется внутри

             updateActiveCard();
        });
    });

     // --- Управление плеером ---
    playPauseButton.addEventListener('click', togglePlayPause);
    nextButton.addEventListener('click', playNext);
    prevButton.addEventListener('click', playPrevious);
    loopButton.addEventListener('click', toggleLoop);
    minimizeButton.addEventListener("click", hidePlayer);
    miniPlayer.addEventListener("click", showPlayer);

     // Громкость + Сохранение
    volumeSlider.addEventListener('input', () => {
        if(player) {
            const newVolume = parseFloat(volumeSlider.value);
            player.volume = newVolume;
            localStorage.setItem(VOLUME_KEY, newVolume);
            if (!activeTimer) originalVolume = newVolume;
        }
    });

     // --- События аудиоплеера ---
    if(player) {
        player.addEventListener('timeupdate', () => { /* ... обновление UI + троттлинг saveLastPlayerState() ... */
             const now = Date.now();
             if (player.duration && isFinite(player.duration)) {
                 const perc = (player.currentTime / player.duration) * 100;
                 if (progress) progress.style.width = `${perc}%`;
             } else if (progress) { progress.style.width = '0%'; }
             if (isPlaying && now - lastTimeUpdateSave > 5000) {
                 saveLastPlayerState();
                 lastTimeUpdateSave = now;
             }
        });
        player.addEventListener('ended', () => { /* ... playNext() или ничего если loop ... */
            localStorage.removeItem(LAST_STATE_KEY);
             progress.style.width = '0%';
            if (currentStory || (currentSound && !player.loop)) playNext();
            else if (currentSound && player.loop) console.log("Looping sound.");
            else { isPlaying = false; updatePlayPauseButton(); }
        });
        player.addEventListener('play', () => { /* ... isPlaying = true, update UI, mediaSession ... */
            isPlaying = true; updatePlayPauseButton();
            if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'playing'; } catch(e){}
        });
         player.addEventListener('pause', () => { /* ... isPlaying = false, update UI, mediaSession, saveLastPlayerState(), clearSleepTimer() ... */
             isPlaying = false; updatePlayPauseButton();
            if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'paused'; } catch(e){}
             saveLastPlayerState();
            if (activeTimer && player.volume > 0) clearSleepTimer();
        });
        player.addEventListener('error', (e) => { /* ... обработка ошибок, сброс состояния ... */
            console.error("Audio Player Error:", e, player.error);
            isPlaying = false; updatePlayPauseButton(); let msg = "Ошибка"; /* ... определение msg ... */
            nowPlaying.textContent = msg; currentCategoryEl.textContent = (currentSound?.title || currentStory?.title || '');
            progress.style.width = '0%'; currentSound = null; currentStory = null;
            updateActiveCard(); clearSleepTimer(); localStorage.removeItem(LAST_STATE_KEY); player.src = "";
        });
        // player.addEventListener('loadstart', ...);
        // player.addEventListener('loadedmetadata', ...);
        // player.addEventListener('canplay', ...);
        // player.addEventListener('canplaythrough', ...);
        // player.addEventListener('seeking', ...);
        // player.addEventListener('seeked', ...);
        // player.addEventListener('stalled', ...);
        // player.addEventListener('waiting', ...);
    }

    // --- Перемотка по прогресс-бару ---
    if(progressBar) {
        progressBar.addEventListener('click', (e) => { /* ... расчет targetTime, проверка seekable, player.currentTime = targetTime, saveLastPlayerState() ... */
            if (!player || !player.duration || !isFinite(player.duration) || player.readyState < player.HAVE_METADATA) return;
            const rect = progressBar.getBoundingClientRect(); const pos = (e.clientX - rect.left) / rect.width;
            const targetTime = Math.max(0, Math.min(player.duration, pos * player.duration));
            // Простая проверка, можно ли мотать (readyState >= HAVE_CURRENT_DATA)
             if (player.readyState >= 2) {
                 console.log(`Seeking to: ${targetTime.toFixed(2)}s`);
                 player.currentTime = targetTime;
                 const perc = (targetTime / player.duration) * 100; if (progress) progress.style.width = `${perc}%`;
                 saveLastPlayerState();
             } else { console.warn(`Cannot seek: player not ready (state ${player.readyState})`); }
        });
    }

     // --- Таймер сна ---
     if(sleepTimerBtn) sleepTimerBtn.addEventListener('click', toggleTimerMenu);
     document.querySelectorAll('.timer-option').forEach(option => { option.addEventListener('click', (e) => { try { startSleepTimer(parseInt(e.target.dataset.minutes)); } catch (error) {} }); });
     document.addEventListener('click', (e) => { if (isTimerMenuOpen && timerMenu && sleepTimerBtn && !timerMenu.contains(e.target) && !sleepTimerBtn.contains(e.target)) toggleTimerMenu(); });

     // --- Сохранение состояния перед закрытием/обновлением ---
     window.addEventListener('beforeunload', () => {
         if(isPlaying) { // Сохранять только если что-то играет (или было на паузе с временем > 0)
             saveLastPlayerState();
         } else {
              localStorage.removeItem(LAST_STATE_KEY); // Очистить если ничего не играло
         }
     });
}

// --- Запуск приложения ---
initializeApp();