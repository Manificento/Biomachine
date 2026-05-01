# DEV.md — инструкция разработчика

Документ для тех, кто будет вносить изменения в код Биомашины. Покрывает локальную разработку, добавление плагинов, структуру проекта и список граблей.

---

## 1. Окружение

| Инструмент | Версия | Зачем |
|---|---|---|
| Node.js | 20.x LTS | Vite, npm, Capacitor CLI |
| npm | ≥ 10 | менеджер зависимостей |
| JDK | 17 (Temurin) | сборка Android (CI runner использует 17) |
| Android SDK | platforms;android-36, build-tools;36.0.0 | компиляция и упаковка APK |
| Android Studio | Hedgehog (2023.1.1) или новее | для отладки native, эмулятора, layout-инспектора |
| Gradle | 8.11.1 (через wrapper) | автоматически скачивается |
| Android Gradle Plugin | 8.9.1 | в `android/build.gradle` |

Установка через `sdkmanager`:
```bash
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
```

---

## 2. Команды для разработки

### Веб-разработка (быстрый цикл)
```bash
npm install              # один раз, либо после обновления package.json
npm run dev              # vite dev server на http://localhost:5173 — все native-вызовы fallback на web
npm run build            # production build → dist/index.html (single-file через vite-plugin-singlefile)
npm run preview          # локальный preview production-сборки
```

### Цикл Capacitor → Android
```bash
npm run build                      # пересобрать web-ассеты
npx cap sync android               # скопировать dist/ в android/app/src/main/assets/public + обновить плагины
npx cap run android                # запуск на подключённом устройстве/эмуляторе
npx cap open android               # открыть проект в Android Studio для отладки
```

### Сборка APK локально
```bash
cd android
./gradlew assembleDebug            # → android/app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease            # → android/app/build/outputs/bundle/release/app-release.aab (для Play)
./gradlew clean                    # очистка артефактов
```

### Установка на устройство
```bash
adb devices                                    # проверить подключение
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
adb logcat | grep -i "biomachine\|capacitor"   # лог приложения
```

---

## 3. Добавление нового плагина Capacitor

```bash
# 1. Установить пакет
npm install @capacitor/<plugin-name>
# или для community-плагинов:
npm install @capacitor-community/<plugin-name>

# 2. Синхронизировать с Android
npx cap sync android

# 3. Если плагин требует native permissions — добавить в android/app/src/main/AndroidManifest.xml

# 4. Если плагин требует конфигурацию — обновить capacitor.config.ts
#    (пример секции plugins для @capacitor/local-notifications уже есть)
```

После каждого `npx cap sync android` Capacitor:
- копирует `dist/*` в `android/app/src/main/assets/public/`
- обновляет `android/app/capacitor.build.gradle` со списком модулей
- регистрирует плагины в `android/app/src/main/assets/capacitor.plugins.json`

**Важно:** не редактируй `capacitor.build.gradle` руками — он перезаписывается при каждом sync.

---

## 4. Структура проекта

```
biomachine/
├── src/
│   ├── App.tsx                    # 2 200+ строк, все экраны (Onboarding, Dashboard, Workout, ...)
│   ├── main.tsx                   # точка входа, ReactDOM.createRoot
│   ├── index.css                  # Tailwind + кастомные keyframes (.pb-safe)
│   ├── data/
│   │   └── programData.ts         # ⚠️ НЕ ТРОГАТЬ — описание мезоциклов, упражнений, тестов
│   ├── store/
│   │   └── useStore.ts            # глобальный store (state + auto-save в Preferences)
│   ├── lib/                       # native-API адаптеры (web fallback внутри каждого)
│   │   ├── storage.ts             # @capacitor/preferences + localStorage
│   │   ├── sound.ts               # @capacitor-community/native-audio + Web Audio API
│   │   ├── haptics.ts             # @capacitor/haptics + navigator.vibrate
│   │   ├── wakeLock.ts            # @capacitor-community/keep-awake + screen.wakeLock
│   │   └── notifications.ts       # @capacitor/local-notifications (4 типа напоминаний)
│   ├── hooks/
│   │   └── useTimer.ts            # фоновый таймер (timestamp + LocalNotification + resume listener)
│   └── utils/
│       └── cn.ts                  # className helper (clsx + tailwind-merge)
├── public/
│   ├── beep.mp3                   # 0.2с beep, генерируется ffmpeg
│   └── finish.mp3                 # 0.6с финал, генерируется ffmpeg
├── resources/
│   ├── icon.svg / icon.png        # 1024×1024 источник для @capacitor/assets
│   └── splash.svg / splash.png    # 2732×2732 источник для splash экранов
├── android/                       # ⚠️ генерируется Capacitor — НЕ редактировать руками,
│   │                              #     кроме variables.gradle, build.gradle, AndroidManifest.xml
│   ├── app/src/main/
│   │   ├── AndroidManifest.xml    # permissions, intent filters, FileProvider
│   │   └── res/                   # сгенерированные иконки и splash (87 файлов)
│   ├── variables.gradle           # SDK versions (compileSdk=36, targetSdk=36, minSdk=24)
│   └── build.gradle               # AGP 8.9.1, force Java 17 для всех subprojects
├── capacitor.config.ts            # appId, appName, плагин-конфиги
├── vite.config.ts                 # Vite + React + Tailwind + singleFile plugin
├── package.json
├── INSTALL.md                     # как установить APK на телефон
├── ROADMAP.md                     # план развития (v1.x, v2.0 Play Store, монетизация)
├── DEV.md                         # этот файл
└── TESTING.md                     # 60+ пунктов чек-листа ручного тестирования
```

### Контракты между web и native
Каждый модуль в `src/lib/` экспортирует функции, которые работают **и в браузере, и в Android WebView**. Внутри модуля — try/catch + проверка `Capacitor.isNativePlatform()`. Это означает:
- `npm run dev` → можно тестить большую часть UI без эмулятора.
- На вебе таймер и звук работают (Web Audio API, screen Wake Lock API), просто без локальных уведомлений и без NativeAudio.

---

## 5. Капкейны и решения (типичные проблемы)

### 5.1 React 19 + Capacitor peer conflicts при `npm install`
Некоторые плагины (на момент написания @capacitor-community/native-audio) объявляют peer на React 18. `npm install` может выдать `ERESOLVE`.

**Решение:**
```bash
npm install --legacy-peer-deps
```
В этом проекте `package.json` корректно работает с дефолтным install потому, что Capacitor-плагины peer-зависят на `@capacitor/core`, не на React. Но если добавишь, например, `react-native-*`-совместимый плагин — флаг понадобится.

### 5.2 Gradle sync ошибки после смены SDK / AGP
Если Gradle жалуется на несоответствие классов или `BuildException`:
```bash
rm -rf android/.gradle android/build android/app/build ~/.gradle/caches/transforms-*
npx cap sync android
cd android && ./gradlew clean && ./gradlew assembleDebug
```

### 5.3 Clean build (когда вообще ничего не собирается)
```bash
cd android
./gradlew clean
./gradlew --stop                           # остановить демоны
rm -rf .gradle build app/build
cd ..
rm -rf node_modules
npm install
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug
```

### 5.4 GitHub Actions workflow editing — permission denied
GitHub App, под которым работает агент, **не имеет scope `workflows`**. Любая попытка `git push`, изменяющая файлы в `.github/workflows/`, отклоняется со статусом 403 *«refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission»*.

**Правило:** файл `.github/workflows/android-build.yml` редактируется **только пользователем через GitHub UI** (Edit file в браузере) или через личный токен с правом `workflow`. Агент **не трогает** этот файл.

### 5.5 SDK upgrade путь
Современные `androidx.*` 1.17+ требуют `compileSdk 36` и AGP `8.9.1+`. Это уже настроено в проекте.

Если будет ошибка `"This version of androidx.core requires compileSdk = 36"`:
- проверь `android/variables.gradle` → должно быть `compileSdkVersion = 36`.
- проверь `android/build.gradle` → AGP `8.9.1` или новее.
- проверь wrapper → `gradle-8.11.1-all.zip`.

### 5.6 «invalid source release: 21» при компиляции capacitor-android
Capacitor-android модуль может декларировать `JavaVersion.VERSION_21` в `compileOptions`, что ломает сборку на runner-ах с JDK 17. Решено в `android/build.gradle` через блок `subprojects { afterEvaluate { ... } }`, который форсит Java 17 для всех модулей. Не убирай этот блок при апгрейдах.

### 5.7 Duplicate resource `ic_launcher_background`
`@capacitor/assets` генерирует `android/app/src/main/res/values/ic_launcher_background.xml` со значением `#FFFFFF`. Этот файл **должен быть удалён** — единственный источник правды для бренд-цвета это `values/colors.xml` (`#FF6B35`). После каждого запуска `npx capacitor-assets generate` проверяй и удаляй автогенерированный дубль.

### 5.8 Splash тёмная или белая полоса
`Theme.SplashScreen` parent в `styles.xml` использует `@drawable/splash`. Если splash выглядит обрезанным:
- проверь, что splash PNG сгенерирован для всех `drawable-port-*` и `drawable-land-*` плотностей.
- иначе перегенерируй: `npx capacitor-assets generate --android`.

### 5.9 Бекенд-таймер «теряется» в фоне (актуально до Phase 2.5)
До интеграции `useTimer` основанный на `Date.now()` + LocalNotification, таймер сбрасывался при выгрузке страницы из памяти WebView. Сейчас механика такая:
- При старте таймера сохраняем `targetTimestamp = Date.now() + ms`.
- Планируем `LocalNotification` на `targetTimestamp`.
- На `resume` приложения заново вычисляем remaining = `targetTimestamp - Date.now()`.
- Если приложение убито Android — сработает уведомление, при тапе — приложение откроется на нужном экране.

---

## 6. Workflow коммитов и PR

- Conventional commits: `type(scope): description` где type ∈ {feat, fix, refactor, docs, ci, chore, test}.
- Каждое изменение → коммит → push сразу.
- НЕ force-push в `main`.
- При конфликтах — `git pull --rebase origin main`, разрешать в пользу remote, если только локальный фикс не критичен.
- При больших фичах — отдельная ветка + PR через GitHub UI.

---

## 7. Чек-лист перед мерджем фичи

- [ ] `npm run build` проходит без warning-ов (новых).
- [ ] `npx cap sync android` без ошибок.
- [ ] На вебе (`npm run dev`) UI не сломан.
- [ ] Если затронуты native-API — протестировано на debug-APK на реальном устройстве.
- [ ] `package.json` обновлён, если добавлены плагины.
- [ ] `AndroidManifest.xml` обновлён, если требуются новые permissions.
- [ ] Документация (`DEV.md`, `TESTING.md`) обновлена при появлении новых граблей.
