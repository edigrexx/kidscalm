// ========================================================================
// KidsCalm PWA - script.js (ПОЛНАЯ ВЕРСИЯ)
// ========================================================================

// --- DOM Элементы ---
const tabSounds = document.getElementById("tab-sounds");
const tabStories = document.getElementById("tab-stories");
const tabFavorites = document.getElementById("tab-favorites");
const soundSection = document.getElementById("sound-section");
const storySection = document.getElementById("story-section");
const favoritesSection = document.getElementById("favorites-section");
const categoriesContainer = document.querySelector('#sound-section .categories');
const soundList = document.getElementById("sound-list");
const storyList = document.getElementById("story-list");
const favoritesList = document.getElementById("favorites-list");
const noFavoritesMsg = document.getElementById("no-favorites");
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
// PWA Install Banner Elements
const installPromptContainer = document.getElementById('install-prompt');
const installButton = document.getElementById('install-button');
const dismissInstallButton = document.getElementById('dismiss-install-button');
const iosInstallInstructions = document.getElementById('ios-install-instructions');

// --- Переменные для данных ---
let sounds = [];
let stories = [];
let categories = [];
let storyDurationsCache = null; // Кэш для длительностей сказок

// --- Состояние приложения ---
let currentSound = null;
let currentStory = null;
let isPlaying = false;
let currentCategoryFilter = "all"; // Текущий фильтр для звуков
let isLoopEnabled = true; // Состояние кнопки зацикливания
let activeTimer = null; // ID таймера сна (setTimeout)
let countdownInterval = null; // ID интервала для обновления отображения таймера
let timerEndTime = null; // Время окончания таймера сна
let originalVolume = 1; // Громкость до активации таймера сна
let isTimerMenuOpen = false; // Открыто ли меню таймера
let currentPlaylist = []; // Текущий плейлист для next/prev
let currentIndexInPlaylist = -1; // Индекс текущего трека в плейлисте
let durationsFetched = false; // Флаг: загружены ли длительности сказок
let lastTimeUpdateSave = 0; // Timestamp последнего сохранения времени (для троттлинга)

// --- Состояние избранного и LocalStorage ключи ---
let favorites = []; // Массив ID избранных треков (базовые имена файлов)
const FAVORITES_KEY = 'kidscalm_favorites'; // Ключ для localStorage (избранное)
const LAST_STATE_KEY = 'kidscalm_lastState'; // Ключ для localStorage (последнее состояние плеера)
const VOLUME_KEY = 'kidscalm_volume'; // Ключ для localStorage (громкость)
const INSTALL_PROMPT_DISMISSED_KEY = 'kidscalm_install_dismissed'; // Ключ для localStorage (баннер установки)

// --- PWA Установка ---
let deferredPrompt = null; // Сохраненное событие 'beforeinstallprompt'

// ========================================================================
// Вспомогательные функции
// ========================================================================

function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds) || seconds < 0) {
        return "--:--";
    }
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// ========================================================================
// Функции для работы с Избранным
// ========================================================================

function loadFavorites() {
    const saved = localStorage.getItem(FAVORITES_KEY);
    try {
        favorites = saved ? JSON.parse(saved) : [];
        if (!Array.isArray(favorites)) favorites = []; // Гарантируем, что это массив
    } catch (e) {
        console.error("Error parsing favorites from localStorage:", e);
        favorites = [];
    }
    console.log("Favorites loaded:", favorites);
}

function saveFavorites() {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
}

function isFavorite(fileId) {
    // Работаем с базовым именем файла для унификации ID
    const baseFileId = fileId.includes('/') ? fileId.substring(fileId.lastIndexOf('/') + 1) : fileId;
    return favorites.includes(baseFileId);
}

function toggleFavorite(fileId, type, element) {
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

    // Обновляем вид ВСЕХ кнопок с этим ID в DOM (на случай дублирования на разных вкладках)
    updateFavoriteStatusInDOM(baseFileId);

    // Если открыта вкладка "Избранное", перерисовываем ее
    if (tabFavorites && tabFavorites.classList.contains('active')) {
         renderFavorites();
    }
}

// Обновляет статус звезд на ВСЕХ карточках с этим fileId
function updateFavoriteStatusInDOM(baseFileId) {
    const isFav = isFavorite(baseFileId);
    document.querySelectorAll(`.favorite-button[data-file-id="${baseFileId}"]`).forEach(btn => {
         btn.classList.toggle('is-favorite', isFav);
         btn.setAttribute('aria-label', isFav ? 'Удалить из избранного' : 'Добавить в избранное');
     });
    // TODO: Обновить звезду в самом плеере, если она там будет добавлена
}

// ========================================================================
// Функции сохранения/загрузки состояния плеера
// ========================================================================

function saveLastPlayerState() {
    const currentItem = currentSound || currentStory;
    // Сохраняем только если что-то загружено, время > 0 и длительность валидна
    if (currentItem && player && player.currentTime > 0 && player.duration > 0 && isFinite(player.duration)) {
        const state = {
            file: currentItem.file, // Базовое имя файла
            type: currentSound ? 'sound' : 'story',
            time: player.currentTime,
            duration: player.duration,
            title: currentItem.title,
            category: currentCategoryEl ? currentCategoryEl.textContent : '' // Проверка на существование
        };
        localStorage.setItem(LAST_STATE_KEY, JSON.stringify(state));
        // console.log('Saved last state:', state);
    } else {
        // Очищаем состояние, если условия не выполнены
        localStorage.removeItem(LAST_STATE_KEY);
        // console.log('Cleared last state (invalid conditions or no item)');
    }
}

function loadLastPlayerState() {
    const savedStateString = localStorage.getItem(LAST_STATE_KEY);
    if (savedStateString) {
        try {
            const savedState = JSON.parse(savedStateString);
            console.log('Attempting to load last state:', savedState);

            let itemToLoad = null;
            if (savedState.type === 'sound') {
                itemToLoad = sounds.find(s => s.file === savedState.file);
            } else { // 'story'
                itemToLoad = stories.find(s => s.file === savedState.file);
            }

            // Проверяем, что трек найден и время/длительность валидны
            if (itemToLoad && player && savedState.time > 0 && savedState.duration > 0 && savedState.time < savedState.duration) {
                console.log('Saved state seems valid. Applying...');
                // Настраиваем плеер и UI БЕЗ автозапуска

                const path = savedState.type === 'sound' ? `sounds/${itemToLoad.file}` : itemToLoad.file;
                try {
                     player.src = path; // Устанавливаем src
                     console.log(`Set player src to: ${path}`);
                } catch (err) {
                     console.error("Error setting src from saved state:", err);
                     localStorage.removeItem(LAST_STATE_KEY); // Очистить невалидное состояние
                     return;
                }

                // Устанавливаем текущий элемент
                if (savedState.type === 'sound') {
                    currentSound = itemToLoad; currentStory = null; player.loop = isLoopEnabled;
                    if(loopButton) { loopButton.classList.toggle('active', isLoopEnabled); loopButton.disabled = false; }
                } else {
                    currentStory = itemToLoad; currentSound = null; player.loop = false;
                    if(loopButton) { loopButton.classList.remove('active'); loopButton.disabled = true; }
                }

                // Обновляем UI плеера
                if(nowPlaying) nowPlaying.textContent = savedState.title || itemToLoad.title;
                if(currentCategoryEl) currentCategoryEl.textContent = savedState.category || (savedState.type === 'sound' ? 'Звук' : 'Сказка');

                 // Показываем плеер
                 showPlayer();

                 // Устанавливаем время и прогресс-бар ПОСЛЕ загрузки метаданных
                 let timeSet = false;
                 const setTimeHandler = () => {
                    if (timeSet) return;
                    // Проверяем src на всякий случай и валидность времени/длительности
                     if (player.src && player.src.endsWith(savedState.file) && player.duration > 0 && savedState.time < player.duration) {
                        player.currentTime = savedState.time;
                        const perc = (player.currentTime / player.duration) * 100;
                        if (progress) progress.style.width = `${perc}%`;
                        console.log(`Restored time to ${savedState.time.toFixed(2)}`);
                        updateActiveCard(); // Обновить подсветку карточки
                        timeSet = true;
                     } else {
                         console.warn(`Could not restore time. Saved time: ${savedState.time}, Player src: ${player.src}, Player duration: ${player.duration}`);
                          localStorage.removeItem(LAST_STATE_KEY); // Очистить невалидное состояние
                          if(progress) progress.style.width = '0%';
                     }
                 };
                 // Слушаем оба события на всякий случай
                 player.addEventListener('loadedmetadata', setTimeHandler, { once: true });
                 player.addEventListener('canplay', setTimeHandler, { once: true });

                // Обновляем плейлист и индекс
                // Индекс будет корректно установлен при первом вызове playItem или при перемотке
                currentIndexInPlaylist = -1;
                console.log("Restored state, playlist index reset, will update on play.");

            } else {
                console.log("Saved state invalid, item not found, or time/duration invalid. Clearing.");
                localStorage.removeItem(LAST_STATE_KEY);
            }
        } catch (e) {
            console.error("Error parsing last player state:", e);
            localStorage.removeItem(LAST_STATE_KEY); // Очистить при ошибке парсинга
        }
    } else {
         console.log("No saved player state found.");
    }

     // Восстановить громкость в любом случае
     const savedVolume = localStorage.getItem(VOLUME_KEY);
     if (savedVolume !== null && player && volumeSlider) {
         const volumeValue = parseFloat(savedVolume);
         if (!isNaN(volumeValue) && volumeValue >= 0 && volumeValue <= 1) {
             volumeSlider.value = volumeValue;
             player.volume = volumeValue;
             originalVolume = volumeValue; // Установить как исходную для таймера
             console.log(`Restored volume to ${volumeValue}`);
         }
     }
}

// ========================================================================
// Функции PWA установки
// ========================================================================

function isIosSafari() {
  const platformIOS = /iPad|iPhone|iPod/.test(navigator.platform) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isNotOtherBrowsersOnIOS = !/CriOS/.test(navigator.userAgent) && !/FxiOS/.test(navigator.userAgent);
  // typeof window !== 'undefined' - проверка на случай запуска в среде без window
  const isBrowser = typeof window !== 'undefined' && !window.navigator.standalone; // Проверка что не standalone
  return platformIOS && isNotOtherBrowsersOnIOS && isBrowser;
}

function showInstallPrompt(isIOS = false) {
    if (!installPromptContainer || !installButton || !iosInstallInstructions || !dismissInstallButton) {
        console.warn("Install prompt elements not found in DOM.");
        return;
    }
    // Проверяем, не был ли баннер уже отклонен в этой сессии или ранее
    if (installPromptContainer.dataset.dismissed === 'true' || localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) === 'true') {
        console.log("Install prompt previously dismissed.");
        return;
    }

    console.log(`Showing install prompt. iOS mode: ${isIOS}`);

    // Показываем/скрываем нужные элементы
    if (isIOS) {
        installButton.style.display = 'none'; installButton.classList.remove('show');
        iosInstallInstructions.style.display = 'inline-flex'; iosInstallInstructions.classList.add('show');
    } else {
        installButton.style.display = 'block'; installButton.classList.add('show');
        iosInstallInstructions.style.display = 'none'; iosInstallInstructions.classList.remove('show');
    }
    installPromptContainer.classList.add('show'); // Показываем сам баннер

    // Вешаем обработчики кнопкам только один раз
    if (!dismissInstallButton.dataset.listenerAttached) {
        dismissInstallButton.addEventListener('click', () => {
            installPromptContainer.classList.remove('show');
            installPromptContainer.dataset.dismissed = 'true'; // Отклонено в этой сессии
            localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true'); // Отклонено навсегда (или до сброса)
            console.log("Install prompt dismissed by user.");
        });
        dismissInstallButton.dataset.listenerAttached = 'true';
    }
    if (!installButton.dataset.listenerAttached && !isIOS) {
         installButton.addEventListener('click', handleInstallClick);
         installButton.dataset.listenerAttached = 'true';
    }
}

async function handleInstallClick() {
    if (!deferredPrompt) {
        console.log("Deferred prompt not available or already used.");
        // Можно скрыть кнопку или выдать сообщение
        if (installButton) installButton.disabled = true;
        return;
    }
    console.log("Install button clicked. Triggering browser prompt...");
    if (installPromptContainer) installPromptContainer.classList.remove('show'); // Скрыть наш баннер

    deferredPrompt.prompt(); // Показать системное окно установки

    try {
        const { outcome } = await deferredPrompt.userChoice;
        console.log(`User response to the install prompt: ${outcome}`);
        if (outcome === 'accepted') {
            console.log('User accepted the install prompt');
            localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true'); // Больше не показывать баннер
        } else {
            console.log('User dismissed the install prompt');
            // Можно решить, показывать ли баннер снова позже
            // localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true'); // Пока тоже скрываем навсегда при отклонении
        }
    } catch (error) {
        console.error('Error handling install prompt choice:', error);
    } finally {
        // Важно! Очистить ссылку на событие в любом случае
        deferredPrompt = null;
        console.log("Deferred prompt cleared.");
    }
}

function checkAndShowIOSInstallPrompt() {
  // Проверяем iOS Safari И что приложение еще НЕ установлено И баннер не был отклонен
  if (isIosSafari() && localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY) !== 'true') {
    console.log("Detected iOS Safari (browser mode), scheduling instructions show.");
    // Показать с задержкой для лучшего UX
    setTimeout(() => showInstallPrompt(true), 3500); // Например, 3.5 секунды
  } else {
      console.log(`iOS check: isIosSafari=${isIosSafari()}, dismissed=${localStorage.getItem(INSTALL_PROMPT_DISMISSED_KEY)}`);
  }
}

// ========================================================================
// Функции рендеринга UI
// ========================================================================

function renderCategories() {
    if (!categoriesContainer) return;
    categoriesContainer.innerHTML = '';
    categories.forEach(category => {
        const div = document.createElement("div"); div.className = "category";
        div.dataset.id = category.id;
        if (category.id === currentCategoryFilter) div.classList.add("active");
        div.innerHTML = `<span class="category-icon">${category.icon}</span><span class="category-name">${category.name}</span>`;
        div.addEventListener("click", () => filterSounds(category.id));
        categoriesContainer.appendChild(div);
    });
}

function renderSounds(soundsToRender) {
    if (!soundList) { console.error("renderSounds: soundList element not found"); return; }
    soundList.innerHTML = '';
    soundsToRender.forEach((sound) => {
        const div = document.createElement("div"); div.className = "card";
        const filePath = `sounds/${sound.file}`; const baseFileId = sound.file;
        const isFav = isFavorite(baseFileId); div.dataset.file = filePath;
        const icon = sound.icon || '🎵';
        // Кнопка без символа звезды внутри
        div.innerHTML = `
            <span class='card-icon'>${icon}</span>
            <div class="card-content"> <span class="card-title">${sound.title}</span> </div>
            <button class="favorite-button ${isFav ? 'is-favorite' : ''}"
                    data-file-id="${baseFileId}" aria-label="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}"></button>`;
        if (currentSound && filePath === `sounds/${currentSound.file}`) div.classList.add('active');
        div.addEventListener("click", () => {
            playItem(sound, 'sound');
          });          
        const favButton = div.querySelector('.favorite-button');
        if (favButton) { // Добавим проверку на случай ошибки в innerHTML
             favButton.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(baseFileId, 'sound', e.currentTarget); });
        }
        soundList.appendChild(div);
    });
    // Обновляем плейлист ТОЛЬКО если эта вкладка активна
    if (tabSounds && tabSounds.classList.contains('active')) {
        updateCurrentPlaylist(soundsToRender, 'sound');
    }
}

function renderStories() {
    if (!storyList) { console.error("renderStories: storyList element not found"); return; }
    storyList.innerHTML = '';
    stories.forEach((story) => {
        const div = document.createElement("div"); div.className = "card";
        const baseFileId = story.file; const isFav = isFavorite(baseFileId);
        div.dataset.file = story.file; const icon = '📖';
        // Кнопка без символа звезды внутри
        div.innerHTML = `
             <span class='card-icon'>${icon}</span>
             <div class="card-content" style="width: 100%;"> <span class="card-title">${story.title}</span> <span class="card-duration" data-duration-for="${story.file}">--:--</span> </div>
             <button class="favorite-button ${isFav ? 'is-favorite' : ''}"
                     data-file-id="${baseFileId}" aria-label="${isFav ? 'Удалить из избранного' : 'Добавить в избранное'}"></button>`;
        if (currentStory && currentStory.file === story.file) div.classList.add('active');
        div.addEventListener("click", () => {
            playItem(story, 'story');
          });          
        const favButton = div.querySelector('.favorite-button');
         if (favButton) {
            favButton.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(baseFileId, 'story', e.currentTarget); });
         }
        storyList.appendChild(div);
    });
    // Обновление/загрузка длительностей
    if (!durationsFetched) { if (stories.length > 0) fetchAndDisplayDurations(); durationsFetched = true; }
    else { updateDisplayedDurations(); } // Обновляем из кэша при рендеринге
    // Обновляем плейлист ТОЛЬКО если эта вкладка активна
    if (tabStories && tabStories.classList.contains('active')) {
         updateCurrentPlaylist(stories, 'story');
     }
}

// --- Функция рендеринга избранного (С ИСПРАВЛЕНИЕМ ПОИСКА) ---
function renderFavorites() {
    if (!favoritesList || !noFavoritesMsg) { console.error("renderFavorites: favoritesList or noFavoritesMsg element not found"); return; }
    favoritesList.innerHTML = ''; loadFavorites(); // Загружаем актуальный список ID

    if (favorites.length === 0) {
        noFavoritesMsg.style.display = 'block'; favoritesList.style.display = 'none';
        updateCurrentPlaylist([], 'favorites'); // Очистить плейлист, если он был от избранного
        return;
    } else {
        noFavoritesMsg.style.display = 'none'; favoritesList.style.display = 'grid';
    }

    // Получаем полные данные для избранных треков
    const favoriteItems = favorites.map(fileId => {
        // ИСПРАВЛЕНИЕ: Ищем сказку по ПОЛНОМУ ПУТИ или по КОНЦУ ПУТИ
        // fileId должен быть базовым именем (например, kolobok.mp3)
        let item = stories.find(s => s.file === fileId || s.file.endsWith('/' + fileId));
        if (item) return { ...item, originalType: 'story' }; // Добавляем originalType
        // Ищем звук по БАЗОВОМУ ИМЕНИ ФАЙЛА
        item = sounds.find(s => s.file === fileId);
        if (item) return { ...item, originalType: 'sound' }; // Добавляем originalType
        console.warn(`Favorite item not found in data for ID: ${fileId}`);
        return null;
    }).filter(item => item !== null).sort((a, b) => a.title.localeCompare(b.title));

    console.log("Items to render in favorites:", favoriteItems); // Логирование найденных элементов

    favoriteItems.forEach((item) => {
        const div = document.createElement("div"); div.className = "card";
        // Используем оригинальный item.file (который может быть с путем или без) для data-атрибута кнопки
        const baseFileIdForButton = item.originalType === 'sound' ? item.file : item.file.substring(item.file.lastIndexOf('/') + 1);
        const path = item.originalType === 'sound' ? `sounds/${item.file}` : item.file;
        div.dataset.file = path; // Полный путь для воспроизведения
        const isFav = true; // Все здесь избранные
        const icon = item.originalType === 'sound' ? (item.icon || '🎵') : '📖';
        // Кнопка без символа звезды внутри
        div.innerHTML = `
             <span class='card-icon'>${icon}</span>
             <div class="card-content" style="width: 100%;"> <span class="card-title">${item.title}</span> ${item.originalType === 'story' ? `<span class="card-duration" data-duration-for="${item.file}">--:--</span>` : ''} </div>
             <button class="favorite-button is-favorite" data-file-id="${baseFileIdForButton}" aria-label="Удалить из избранного"></button>`; // Используем правильный ID для кнопки
        const playingItem = currentSound || currentStory;
        if (playingItem && path === (currentSound ? `sounds/${currentSound.file}` : currentStory.file)) div.classList.add('active');
        div.addEventListener("click", () => {
            playItem(item, item.originalType);
          });
          // Передаем originalType
        const favButton = div.querySelector('.favorite-button');
        if (favButton) {
             favButton.addEventListener('click', (e) => {
                 e.stopPropagation();
                 // Используем тот же ID, что и в data-file-id кнопки
                 toggleFavorite(baseFileIdForButton, item.originalType, e.currentTarget);
                 renderFavorites(); // Перерисовываем список после удаления
            });
        }
        favoritesList.appendChild(div);
     });
     updateDisplayedDurations(); // Обновляем длительности (если сказки попали в избранное)
     // Обновляем плейлист ТОЛЬКО если эта вкладка активна
     if (tabFavorites && tabFavorites.classList.contains('active')) {
          updateCurrentPlaylist(favoriteItems, 'favorites');
      }
}


// ========================================================================
// Функции загрузки данных и инициализации
// ========================================================================

// --- Функция получения длительностей (С ЛОГИРОВАНИЕМ И УВЕЛИЧЕННЫМ ТАЙМАУТОМ) ---
async function fetchAndDisplayDurations() {
     console.log("--- fetchAndDisplayDurations: START ---");
     if (!stories || stories.length === 0) { console.log("No stories found."); return; }
     const promises = stories.map(story => {
         return new Promise((resolve) => {
             const audio = new Audio(); audio.preload = "metadata"; let resolved = false;
             const resolveWithError = (reason) => { if (resolved) return; resolved = true; console.warn(`[${story.file}] Resolving duration with NULL. Reason: ${reason}`); resolve({ file: story.file, duration: null }); audio.removeEventListener('loadedmetadata', onMeta); audio.removeEventListener('error', onError); audio.src = ""; audio.removeAttribute('src'); }; // Добавлено removeAttribute
             const onMeta = () => { if (resolved) return; if (isFinite(audio.duration) && audio.duration > 0) { resolved = true; console.log(`[${story.file}] Duration OK: ${audio.duration}`); resolve({ file: story.file, duration: audio.duration }); } else { resolveWithError(`Invalid duration: ${audio.duration}`); } audio.removeEventListener('loadedmetadata', onMeta); audio.removeEventListener('error', onError); audio.src = ""; audio.removeAttribute('src'); };
             const onError = (e) => { resolveWithError(`Audio error event (${e ? e.type : 'unknown'})`); };
             audio.addEventListener('loadedmetadata', onMeta); audio.addEventListener('error', onError);
             const timer = setTimeout(() => resolveWithError("Timeout"), 15000); // 15 секунд
             try { console.log(`[${story.file}] Setting src...`); audio.src = story.file; }
             catch (err) { console.error(`[${story.file}] CRITICAL src setting error:`, err); clearTimeout(timer); resolveWithError("Src exception"); }
         }).catch(err => { console.error(`[${story.file}] UNEXPECTED PROMISE ERROR:`, err); return { file: story.file, duration: null }; });
     });
     try {
         console.log("Waiting for duration promises..."); const results = await Promise.all(promises); console.log("Raw duration results:", results);
         const validResults = results.filter(d => d && d.duration !== null && isFinite(d.duration) && d.duration > 0); // Только > 0
         console.log("Valid duration results:", validResults);
         const durationMap = new Map(validResults.map(d => [d.file, d.duration]));
         storyDurationsCache = durationMap; console.log("Updated storyDurationsCache:", storyDurationsCache);
         updateDisplayedDurations(durationMap); // Обновляем UI сразу
     } catch (error) { console.error("fetchAndDisplayDurations: Error during Promise.all:", error); }
     console.log("--- fetchAndDisplayDurations: FINISHED ---");
 }

// --- Функция обновления отображения длительностей (С ЛОГИРОВАНИЕМ) ---
function updateDisplayedDurations(durationMap = null) {
    const mapToUse = durationMap || storyDurationsCache; // Используем переданную карту или кэш
    if (!mapToUse) { console.warn("updateDisplayedDurations: No duration map available."); return; }
    console.log("--- updateDisplayedDurations: Updating UI ---");
    [storyList, favoritesList].forEach(list => { // Обновляем в обоих списках
        if (!list) return;
        console.log(`Checking durations in list: #${list.id}`);
        list.querySelectorAll('.card-duration[data-duration-for]').forEach(span => {
             const file = span.dataset.durationFor;
             const duration = mapToUse.get(file); // Получаем длительность из актуальной карты
             const timeStr = formatTime(duration); // Формат вернет '--:--' если duration невалидный
             console.log(`  [${file}]: Duration from map=${duration}, Formatted=${timeStr}`);
             if (span.textContent !== timeStr) {
                console.log(`    Updating span content for ${file}.`);
                span.textContent = timeStr;
             }
        });
    });
    console.log("--- updateDisplayedDurations: FINISHED ---");
}

function filterSounds(categoryId) {
    if (categoriesContainer) {
        categoriesContainer.querySelectorAll('.category').forEach(cat => { cat.classList.toggle('active', cat.dataset.id === categoryId); });
    }
    currentCategoryFilter = categoryId;
    const filteredSounds = categoryId === "all" ? sounds : sounds.filter(s => s.categoryId === categoryId);
    renderSounds(filteredSounds);
}

function updateCurrentPlaylist(items, type) {
    currentPlaylist = items.map(item => ({ ...item, originalType: item.originalType || type }));
    const playingItem = currentSound || currentStory;
    if (playingItem) {
        const playingPath = currentSound ? `sounds/${playingItem.file}` : playingItem.file;
        currentIndexInPlaylist = currentPlaylist.findIndex(itemInList => {
            const itemPath = itemInList.originalType === 'sound' ? `sounds/${itemInList.file}` : itemInList.file;
            return itemPath === playingPath;
        });
    } else { currentIndexInPlaylist = -1; }
    // console.log(`Playlist updated (${type}). Length: ${currentPlaylist.length}, CurrentIndex: ${currentIndexInPlaylist}`);
}

// ========================================================================
// Функции управления плеером
// ========================================================================

function updatePlayPauseButton() {
    if (!playPauseButton) return; const img = playPauseButton.querySelector('img'); const miniImg = miniPlayer?.querySelector('img'); if (!img) return;
    if (isPlaying) { img.src = 'pause.svg'; img.alt = 'Pause'; playPauseButton.setAttribute('aria-label', 'Пауза'); if(miniImg) { miniImg.src = 'pause.svg'; miniImg.alt = 'Pause'; }}
    else { img.src = 'play.svg'; img.alt = 'Play'; playPauseButton.setAttribute('aria-label', 'Воспроизвести'); if(miniImg) { miniImg.src = 'play.svg'; miniImg.alt = 'Play'; }}
}

function updateActiveCard() {
    document.querySelectorAll('.card.active').forEach(card => card.classList.remove('active'));
    const playingItem = currentSound || currentStory;
    if (playingItem) {
        const filePath = currentSound ? `sounds/${playingItem.file}` : playingItem.file;
        try { const escapedFilePath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"'); const activeCard = document.querySelector(`.card[data-file="${escapedFilePath}"]`); if (activeCard) activeCard.classList.add('active'); }
        catch (e) { console.error("Error selecting active card:", e); }
    }
}

function showPlayer() {
    if (!playerControls || !miniPlayer || !document.body) return;
    playerControls.classList.add("show"); document.body.classList.add("player-open"); miniPlayer.classList.remove("show");
}

function hidePlayer() {
    if (!playerControls || !miniPlayer || !player || !document.body) return;
    playerControls.classList.remove("show"); document.body.classList.remove("player-open");
    setTimeout(() => { if (player.src && !playerControls.classList.contains('show') && (currentSound || currentStory)) miniPlayer.classList.add("show"); }, 400);
}

function playItem(item, itemType) { // itemType - 'sound' или 'story'
     if (!player || !nowPlaying || !currentCategoryEl || !item) { console.error("playItem: Missing elements or item."); return; }
     console.log(`playItem called. Type: ${itemType}, Title: ${item.title}`);

     let path, categoryName, baseFileId;
     if (itemType === 'sound') {
        path = `sounds/${item.file}`; baseFileId = item.file; const categoryData = categories.find(c => c.id === item.categoryId); categoryName = categoryData ? categoryData.name : 'Звук';
     } else { path = item.file; baseFileId = item.file; categoryName = 'Сказка'; }

     const isCurrentlyPlayingThis = (currentSound && itemType === 'sound' && currentSound.file === item.file) || (currentStory && itemType === 'story' && currentStory.file === item.file);
     if (isCurrentlyPlayingThis && isPlaying) { showPlayer(); return; }
     if (isCurrentlyPlayingThis && !isPlaying) { togglePlayPause(); showPlayer(); return; }

     console.log("Starting new item:", path);
     nowPlaying.textContent = "Загрузка..."; currentCategoryEl.textContent = ""; if(progress) progress.style.width = '0%';

     if (itemType === 'sound') { currentSound = item; currentStory = null; player.loop = isLoopEnabled; if(loopButton) { loopButton.classList.toggle('active', isLoopEnabled); loopButton.disabled = false; }}
     else { currentStory = item; currentSound = null; player.loop = false; if(loopButton) { loopButton.classList.remove('active'); loopButton.disabled = true; }}

     try { player.src = path; } catch (err) { console.error(`CRITICAL src setting error: ${path}`, err); nowPlaying.textContent = "Ошибка"; currentCategoryEl.textContent = item.title; currentSound = null; currentStory = null; updateActiveCard(); return; }
     nowPlaying.textContent = item.title; currentCategoryEl.textContent = categoryName;

     // Обновление плейлиста
     const activeTab = document.querySelector('.tab.active');
     if (activeTab) {
         if (activeTab.id === 'tab-sounds') updateCurrentPlaylist(currentCategoryFilter === "all" ? sounds : sounds.filter(s => s.categoryId === currentCategoryFilter), 'sound');
         else if (activeTab.id === 'tab-stories') updateCurrentPlaylist(stories, 'story');
         else if (activeTab.id === 'tab-favorites') renderFavorites(); // Обновит плейлист внутри
     }
     // Пересчет индекса
     currentIndexInPlaylist = currentPlaylist.findIndex(i => { const itemPath = i.originalType === 'sound' ? `sounds/${i.file}` : i.file; return itemPath === path; });
     console.log("Playlist index after playItem:", currentIndexInPlaylist);

     if (volumeSlider) player.volume = volumeSlider.value;
     const playPromise = player.play();
     if (playPromise !== undefined) { playPromise.then(_ => { updateActiveCard(); showPlayer(); updateMediaSessionMetadata(item.title, categoryName); }).catch(error => { /* ... обработка ошибки старта ... */ }); }
}

 function togglePlayPause() {
    if (!player || !player.src || (!currentSound && !currentStory)) return;
    try { if (isPlaying) player.pause(); else { const p = player.play(); if (p !== undefined) p.catch(e => { /* ... */ }); }}
    catch (e) { /* ... */ }
}

function playNext() {
    if (currentPlaylist.length === 0) return; let nextIndex = currentIndexInPlaylist + 1;
    const currentItem = currentPlaylist[currentIndexInPlaylist]; const currentItemType = currentItem?.originalType || (currentStory ? 'story' : 'sound');
    if (currentItemType === 'story' && nextIndex >= currentPlaylist.length) { player.pause(); player.currentTime = 0; isPlaying = false; updatePlayPauseButton(); if(progress) progress.style.width = '0%'; return; }
    if (nextIndex >= currentPlaylist.length) nextIndex = 0;
    if (nextIndex >= 0 && nextIndex < currentPlaylist.length) playItem(currentPlaylist[nextIndex], currentPlaylist[nextIndex].originalType);
    else { player.pause(); isPlaying = false; updatePlayPauseButton(); }
}

function playPrevious() {
    if (currentPlaylist.length === 0) return;
    if (player.currentTime > 3 && currentIndexInPlaylist !== -1) { player.currentTime = 0; return; }
    let prevIndex = currentIndexInPlaylist - 1; const currentItem = currentPlaylist[currentIndexInPlaylist];
    const currentItemType = currentItem?.originalType || (currentStory ? 'story' : 'sound');
    if (currentItemType === 'story' && prevIndex < 0) { player.currentTime = 0; return; }
    if (prevIndex < 0) prevIndex = currentPlaylist.length - 1;
    if (prevIndex >= 0 && prevIndex < currentPlaylist.length) playItem(currentPlaylist[prevIndex], currentPlaylist[prevIndex].originalType);
    else if (currentIndexInPlaylist !== -1) player.currentTime = 0;
}

function toggleLoop() {
    if (!loopButton || loopButton.disabled) return;
    isLoopEnabled = !isLoopEnabled; loopButton.classList.toggle('active', isLoopEnabled); loopButton.setAttribute('aria-pressed', isLoopEnabled);
    if (currentSound && player) player.loop = isLoopEnabled;
}

 function updateMediaSessionMetadata(title, category) {
    if (!('mediaSession' in navigator)) return;
    try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: title, artist: category || 'KidsCalm', album: 'KidsCalm', artwork: [ /* ... */ ] });
        navigator.mediaSession.setActionHandler('play', togglePlayPause); navigator.mediaSession.setActionHandler('pause', togglePlayPause);
        navigator.mediaSession.setActionHandler('previoustrack', playPrevious); navigator.mediaSession.setActionHandler('nexttrack', playNext);
        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch (error) { console.error("Media Session update failed:", error); }
}

// ========================================================================
// Таймер сна
// ========================================================================

function clearSleepTimer(restoreVolume = true) {
    if (activeTimer) clearTimeout(activeTimer); if (countdownInterval) clearInterval(countdownInterval);
    activeTimer = null; countdownInterval = null; timerEndTime = null;
    if (sleepTimerBtn) { sleepTimerBtn.classList.remove('active'); sleepTimerBtn.title = "Таймер сна"; sleepTimerBtn.removeAttribute('aria-pressed'); }
    if (restoreVolume && player && player.volume < originalVolume && volumeSlider) { player.volume = originalVolume; volumeSlider.value = originalVolume; localStorage.setItem(VOLUME_KEY, originalVolume); }
    else if (restoreVolume && player && volumeSlider) { player.volume = originalVolume; volumeSlider.value = originalVolume; localStorage.setItem(VOLUME_KEY, originalVolume); }
    console.log("Sleep timer cleared.");
}

function startSleepTimer(minutes) {
    clearSleepTimer(false);
    if (minutes <= 0) { toggleTimerMenu(); if (player && volumeSlider) { player.volume = originalVolume; volumeSlider.value = originalVolume; localStorage.setItem(VOLUME_KEY, originalVolume); } return; }
    if (!player || !sleepTimerBtn || !isPlaying) { toggleTimerMenu(); alert("Таймер можно установить только во время воспроизведения."); return; }
    console.log(`Starting sleep timer for ${minutes} minutes.`);
    originalVolume = player.volume; sleepTimerBtn.classList.add('active'); sleepTimerBtn.setAttribute('aria-pressed', 'true');
    const fadeDuration = 5000; const totalDuration = minutes * 60000; timerEndTime = Date.now() + totalDuration;
    function updateTimerTitle() { if (!timerEndTime || !sleepTimerBtn) { if(countdownInterval) clearInterval(countdownInterval); return; } const remaining = Math.max(0, timerEndTime - Date.now()); if (remaining === 0 && countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; } const mins = Math.floor(remaining / 60000); const secs = Math.floor((remaining % 60000) / 1000); sleepTimerBtn.title = `Таймер: ${mins}:${secs < 10 ? '0' : ''}${secs}`; }
    updateTimerTitle(); countdownInterval = setInterval(updateTimerTitle, 1000);
    activeTimer = setTimeout(() => { console.log("Sleep timer expired, starting fade."); const steps = 50; const stepTime = fadeDuration / steps; let currentStep = 0; const startVolume = player.volume; const fadeInterval = setInterval(() => { if (!player || !isPlaying) { clearInterval(fadeInterval); clearSleepTimer(false); return; } currentStep++; const newVolume = Math.max(0, startVolume * (1 - (currentStep / steps))); player.volume = newVolume; if (newVolume <= 0 || currentStep >= steps) { player.volume = 0; player.pause(); clearInterval(fadeInterval); clearSleepTimer(false); player.volume = originalVolume; if(volumeSlider) volumeSlider.value = originalVolume; localStorage.setItem(VOLUME_KEY, originalVolume); console.log("Fade complete, player paused."); } }, stepTime); }, Math.max(0, totalDuration - fadeDuration));
    toggleTimerMenu();
}

function toggleTimerMenu(event) {
    if (event) event.stopPropagation(); isTimerMenuOpen = !isTimerMenuOpen;
    if (timerMenu) timerMenu.classList.toggle('show', isTimerMenuOpen);
    if(sleepTimerBtn) sleepTimerBtn.setAttribute('aria-expanded', isTimerMenuOpen);
}

// ========================================================================
// Инициализация приложения
// ========================================================================

async function initializeApp() {
    console.log("Initializing KidsCalm App...");
    if(nowPlaying) nowPlaying.textContent = "Загрузка...";
    try {
        const response = await fetch('data.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        sounds = data.sounds || []; stories = data.stories || []; categories = data.categories || [];
        console.log("Data loaded successfully");

        loadFavorites();
        loadLastPlayerState(); // Восстанавливаем состояние ДО первого рендеринга

        // Текст по умолчанию, если плеер не был восстановлен
        if (nowPlaying && (!player || !player.src)) nowPlaying.textContent = "Выберите звук или сказку";

        setupEventListeners(); // Настройка ВСЕХ обработчиков событий

        renderCategories();
        filterSounds("all"); // Рендерит звуки (установит плейлист звуков по умолчанию)
        renderStories(); // Рендерит сказки (не установит плейлист, т.к. вкладка не активна)

        // Начальная настройка UI плеера
        if(loopButton) { loopButton.classList.toggle('active', isLoopEnabled); loopButton.setAttribute('aria-pressed', isLoopEnabled); loopButton.disabled = true; } // Изначально disabled, включается при выборе звука
        if(prevButton) { prevButton.disabled = true; prevButton.setAttribute('aria-label', 'Предыдущий трек'); } // Изначально disabled
        if(nextButton) { nextButton.disabled = true; nextButton.setAttribute('aria-label', 'Следующий трек'); } // Изначально disabled
        if(minimizeButton) minimizeButton.setAttribute('aria-label', 'Свернуть плеер');
        if(sleepTimerBtn) { sleepTimerBtn.setAttribute('aria-label', 'Таймер сна'); sleepTimerBtn.setAttribute('aria-expanded', 'false'); sleepTimerBtn.disabled = true; } // Изначально disabled

        console.log("KidsCalm App Initialized");

        // Регистрация Service Worker
        if ('serviceWorker' in navigator) {
           window.addEventListener('load', () => {
             navigator.serviceWorker.register('/service-worker.js')
               .then(reg => { console.log('[SW] Registered: ', reg.scope); reg.onupdatefound = () => { const worker = reg.installing; if(!worker) return; worker.onstatechange = () => { if(worker.state === 'installed'){ if(navigator.serviceWorker.controller) console.log('[SW] New content available'); else console.log('[SW] Content cached'); }}};})
               .catch(error => console.log('[SW] Registration failed: ', error));
             let refreshing; navigator.serviceWorker.addEventListener('controllerchange', () => { if (refreshing) return; window.location.reload(); refreshing = true; });
           });
        }

        // Показ баннера iOS
        checkAndShowIOSInstallPrompt();

    } catch (error) {
        console.error("Could not load application data:", error);
        if(nowPlaying) nowPlaying.textContent = "Ошибка загрузки данных";
        if(currentCategoryEl) currentCategoryEl.textContent = "Проверьте соединение";
        [playPauseButton, nextButton, prevButton, loopButton, volumeSlider, sleepTimerBtn].forEach(btn => { if(btn) btn.disabled = true; });
    }
}

// ========================================================================
// Настройка обработчиков событий
// ========================================================================

function setupEventListeners() {
    // Проверка наличия основных элементов
    if (!tabSounds || !tabStories || !tabFavorites || !soundSection || !storySection || !favoritesSection || !player || !progressBar || !playPauseButton) {
        console.error("Core UI elements missing, cannot setup listeners properly.");
        return; // Прервать настройку, если критические элементы отсутствуют
    }

     // --- Переключение вкладок ---
    const tabs = [tabSounds, tabStories, tabFavorites];
    const sections = [soundSection, storySection, favoritesSection];
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => {
            if (tab.classList.contains('active')) return;
            tabs.forEach(t => t?.classList.remove('active')); // Используем optional chaining
            sections.forEach(s => s?.classList.remove('active-section'));
            tab.classList.add('active'); const section = sections[index];
            if (section) section.classList.add('active-section'); else return;

            // Обновление плейлиста и рендеринг при переключении
            if (tab.id === 'tab-sounds') filterSounds(currentCategoryFilter);
            else if (tab.id === 'tab-stories') { renderStories(); updateCurrentPlaylist(stories, 'story'); }
            else if (tab.id === 'tab-favorites') renderFavorites(); // renderFavorites сама обновит плейлист

             updateActiveCard(); // Обновить подсветку после смены вкладки
        });
    });

     // --- Управление плеером ---
    playPauseButton.addEventListener('click', togglePlayPause);
    if (nextButton) nextButton.addEventListener('click', playNext);
    if (prevButton) prevButton.addEventListener('click', playPrevious);
    if (loopButton) loopButton.addEventListener('click', toggleLoop);
    if (minimizeButton) minimizeButton.addEventListener("click", hidePlayer);
    if (miniPlayer) miniPlayer.addEventListener("click", showPlayer);

     // Громкость + Сохранение
    if (volumeSlider && player) {
        volumeSlider.addEventListener('input', () => {
            const newVolume = parseFloat(volumeSlider.value); player.volume = newVolume;
            localStorage.setItem(VOLUME_KEY, newVolume);
            if (!activeTimer) originalVolume = newVolume; // Обновляем originalVolume, если таймер не активен
        });
    }

     // --- События аудиоплеера ---
    if(player) {
        player.addEventListener('timeupdate', () => {
             const now = Date.now();
             if (player.duration && isFinite(player.duration)) { const perc = (player.currentTime / player.duration) * 100; if (progress) progress.style.width = `${perc}%`; }
             else if (progress) { progress.style.width = '0%'; }
             // Сохраняем не чаще раз в 5 сек И только если играет или на паузе с временем > 0
             if ((isPlaying || (!player.paused && player.currentTime > 0)) && now - lastTimeUpdateSave > 5000) { saveLastPlayerState(); lastTimeUpdateSave = now; }
        });
        player.addEventListener('ended', () => {
            localStorage.removeItem(LAST_STATE_KEY); if(progress) progress.style.width = '0%';
            const currentItem = currentPlaylist[currentIndexInPlaylist];
            const currentItemType = currentItem?.originalType || (currentStory ? 'story' : 'sound');
            if (currentItemType === 'story' || (currentItemType === 'sound' && !player.loop)) { playNext(); }
            else if (currentItemType === 'sound' && player.loop) { console.log("Looping sound."); player.play(); /* Явно запускаем снова для надежности */ }
            else { isPlaying = false; updatePlayPauseButton(); }
        });
        player.addEventListener('play', () => {
            isPlaying = true; updatePlayPauseButton();
            // Включаем кнопки навигации и таймера при начале воспроизведения
            if(nextButton) nextButton.disabled = false; if(prevButton) prevButton.disabled = false; if(sleepTimerBtn) sleepTimerBtn.disabled = false;
            // Включаем loop только для звуков
            if(loopButton && currentSound) loopButton.disabled = false;
            if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'playing'; } catch(e){} console.log("Player state: playing");
        });
        player.addEventListener('pause', () => {
            isPlaying = false; updatePlayPauseButton();
            // Не выключаем кнопки навигации при паузе
            if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = 'paused'; } catch(e){} console.log("Player state: paused");
            saveLastPlayerState(); // Сохраняем при любой паузе
            if (activeTimer && player.volume > 0) clearSleepTimer(); // Сброс таймера только при ручной паузе
        });
        player.addEventListener('error', (e) => {
            console.error("Audio Player Error:", player.error); isPlaying = false; updatePlayPauseButton(); let msg = "Ошибка воспроизведения"; /* ... определение msg ... */
            if(nowPlaying) nowPlaying.textContent = msg; if(currentCategoryEl) currentCategoryEl.textContent = (currentSound?.title || currentStory?.title || '');
            if(progress) progress.style.width = '0%'; currentSound = null; currentStory = null;
            updateActiveCard(); clearSleepTimer(); localStorage.removeItem(LAST_STATE_KEY); player.src = "";
            // Отключаем кнопки при ошибке
            if(nextButton) nextButton.disabled = true; if(prevButton) prevButton.disabled = true; if(sleepTimerBtn) sleepTimerBtn.disabled = true; if(loopButton) loopButton.disabled = true;
        });
        // Можно добавить 'emptied' для сброса состояния, если src очищается
        player.addEventListener('emptied', () => {
             console.log("Player source cleared (emptied event)");
             if (!isPlaying && !currentSound && !currentStory) { // Если действительно ничего не должно играть
                if(nextButton) nextButton.disabled = true; if(prevButton) prevButton.disabled = true; if(sleepTimerBtn) sleepTimerBtn.disabled = true; if(loopButton) loopButton.disabled = true;
                if(nowPlaying) nowPlaying.textContent = "Выберите звук или сказку"; if(currentCategoryEl) currentCategoryEl.textContent = ""; if(progress) progress.style.width = '0%';
             }
        });
    }

    // --- Перемотка по прогресс-бару ---
    if(progressBar && player) {
        progressBar.addEventListener('click', (e) => {
            if (!player.duration || !isFinite(player.duration) || player.readyState < 1) return; // HAVE_METADATA
            const rect = progressBar.getBoundingClientRect(); const pos = (e.clientX - rect.left) / rect.width;
            const targetTime = Math.max(0, Math.min(player.duration, pos * player.duration));
             try { player.currentTime = targetTime; if (progress) progress.style.width = `${(targetTime / player.duration) * 100}%`; saveLastPlayerState(); }
             catch (err) { console.error("Seek failed:", err); }
        });
    }

     // --- Таймер сна ---
     if(sleepTimerBtn) sleepTimerBtn.addEventListener('click', toggleTimerMenu);
     document.querySelectorAll('.timer-option').forEach(option => { option.addEventListener('click', (e) => { try { startSleepTimer(parseInt(e.target.dataset.minutes)); } catch (error) {} }); });
     document.addEventListener('click', (e) => { if (isTimerMenuOpen && timerMenu && sleepTimerBtn && !timerMenu.contains(e.target) && !sleepTimerBtn.contains(e.target)) toggleTimerMenu(); });

     // --- Сохранение состояния перед закрытием ---
     window.addEventListener('beforeunload', () => { if(isPlaying || (player && player.currentTime > 0 && !player.paused)) saveLastPlayerState(); else localStorage.removeItem(LAST_STATE_KEY); });

     // --- Слушатели для PWA установки ---
     window.addEventListener('beforeinstallprompt', (e) => {
         e.preventDefault(); console.log('`beforeinstallprompt` event fired.');
         deferredPrompt = e;
         // Показываем баннер с небольшой задержкой
         setTimeout(() => showInstallPrompt(false), 2000); // 2 секунды
     });
     window.addEventListener('appinstalled', () => {
         console.log('App was successfully installed!');
         if (installPromptContainer) installPromptContainer.classList.remove('show');
         deferredPrompt = null; localStorage.setItem(INSTALL_PROMPT_DISMISSED_KEY, 'true');
     });

} // Конец setupEventListeners

function forcePlayImmediately(callback) {
    const userInteracted = () => {
        document.removeEventListener('touchstart', userInteracted);
        document.removeEventListener('click', userInteracted);
        callback(); // вызываем playItem только после прямого взаимодействия
    };

    if (document.readyState === 'complete') {
        userInteracted(); // уже можно
    } else {
        document.addEventListener('touchstart', userInteracted, { once: true });
        document.addEventListener('click', userInteracted, { once: true });
    }
}


// ========================================================================
// Запуск приложения
// ========================================================================
initializeApp();