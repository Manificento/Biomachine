# DEV — инструкция разработчика Биомашина

## Команды

| Команда | Что делает |
|---------|-----------|
| `npm install` | Установить все зависимости (используй `--legacy-peer-deps` если ругается на React 19) |
| `npm run dev` | Запустить Vite dev-сервер (web preview, http://localhost:5173) |
| `npm run build` | Production build → `dist/index.html` (single-file, ~800 KB) |
| `npx cap sync android` | Скопировать `dist/` в `android/app/src/main/assets/public/` + обновить плагины |
| `npx cap run android` | Запустить на подключённом Android-устройстве (нужны Android Studio + ADB) |
| `npx cap open android` | Открыть проект `android/` в Android Studio |
| `cd android && ./gradlew assembleDebug` | Собрать debug APK локально (нужен Android SDK + JDK 21) |
| `cd android && ./gradlew clean` | Очистить кеши Gradle |

## Workflow разработки

### Цикл «изменил код → увидел в приложении»

```bash
# 1. Правишь src/...
npm run build          # собрать web assets
npx cap sync android   # положить в android/app/src/main/assets/public/
# 2. (опционально) пересобрать APK или перезапустить через Android Studio
```

### Локальный live-reload через Capacitor (опционально)

```bash
# В capacitor.config.ts добавить server.url = "http://<ваш-LAN-IP>:5173"
npm run dev          # терминал 1
npx cap run android  # терминал 2 — приложение подхватит dev-сервер
```

## Как добавить новый плагин Capacitor

```bash
npm install @capacitor/<plugin>
npx cap sync android       # обновит android/capacitor.settings.gradle
```

Если плагин требует runtime permissions — добавить в `android/app/src/main/AndroidManifest.xml` нужный `<uses-permission>`.

Если плагин требует конфигурацию — обновить `capacitor.config.ts`:

```ts
plugins: {
  LocalNotifications: {
    smallIcon: "ic_stat_icon",
    iconColor: "#FF6B35",
  },
}
```

## Структура проекта

```
biomachine/
├── src/
│   ├── App.tsx                # Все экраны (~2200 строк) — НЕ дробить без острой необходимости
│   ├── main.tsx               # entry point
│   ├── index.css              # Tailwind + custom keyframes
│   ├── data/
│   │   └── programData.ts     # ⚠️ НЕ ТРОГАТЬ — программа тренировок, мезоциклы, тесты
│   ├── store/
│   │   └── useStore.ts        # localStorage + Preferences async persistence
│   ├── lib/                   # ⭐ Native API адаптеры (Phase 2)
│   │   ├── storage.ts         # Preferences с web fallback на localStorage
│   │   ├── sound.ts           # NativeAudio + Web Audio fallback
│   │   ├── haptics.ts         # 5 паттернов вибрации
│   │   ├── wakeLock.ts        # Keep-awake + Web Wake Lock fallback
│   │   └── notifications.ts   # 4 типа напоминаний
│   ├── hooks/
│   │   └── useTimer.ts        # Background-aware countdown timer
│   └── utils/
│       └── cn.ts              # classnames helper
├── public/
│   ├── beep.mp3               # Звук таймера за 3 сек до конца
│   └── finish.mp3             # Звук конца таймера
├── resources/                 # Source-файлы для @capacitor/assets
│   ├── icon.svg / icon.png    # 1024×1024
│   └── splash.svg / splash.png # 2732×2732
├── android/                   # Нативный Android-проект (генерируется Capacitor)
│   ├── variables.gradle       # ✏️ Можно править (SDK versions)
│   ├── build.gradle           # ✏️ Можно править (AGP version)
│   └── app/src/main/
│       ├── AndroidManifest.xml         # ✏️ Permissions
│       └── res/values/colors.xml       # ✏️ Theme colors
├── capacitor.config.ts        # appId, plugin config
├── .github/workflows/
│   └── android-build.yml      # ⚠️ Управляется через GitHub UI, не через push (см. ниже)
├── INSTALL.md
├── ROADMAP.md
├── DEV.md (этот файл)
└── TESTING.md
```

## Что НЕ трогать

- `src/data/programData.ts` — это домен-логика программы, отдельный контракт с тренером
- `src/App.tsx` — большой файл, но монолит специально, не дробить
- Содержимое `node_modules/@capacitor/*` — пересоздаётся `npm install`
- `android/app/build/`, `android/.gradle/`, `dist/` — артефакты сборки

## Что МОЖНО править в `android/`

- `android/variables.gradle` — SDK versions
- `android/build.gradle` — AGP version
- `android/app/src/main/AndroidManifest.xml` — permissions, intent-filters
- `android/app/src/main/res/values/colors.xml` — theme colors
- `android/app/src/main/res/values/styles.xml` — themes (осторожно)
- `android/gradle/wrapper/gradle-wrapper.properties` — Gradle distribution

## Известные проблемы и решения

### React 19 + Capacitor peer-conflicts

```bash
npm install --legacy-peer-deps
```

### Gradle sync ошибки после обновления плагина

```bash
rm -rf android/.gradle android/build android/app/build
npx cap sync android
cd android && ./gradlew clean && ./gradlew assembleDebug
```

### Workflow permissions: GitHub App без scope `workflows`

**Симптом:** `git push` отклоняется с сообщением `refusing to allow a GitHub App to create or update workflow ... without 'workflows' permission`.

**Причина:** GitHub App user-token (`ghu_*`), которым работает агент, не имеет scope `workflows`.

**Решение:** Файл `.github/workflows/android-build.yml` редактируется **только через GitHub UI** пользователем (через `https://github.com/Manificento/Biomachine/edit/main/.github/workflows/android-build.yml`). Агент его не трогает. Если нужны изменения в workflow — попросить пользователя.

### SDK upgrade: современные androidx требуют compileSdk 36

`androidx.core 1.17.0+` требует:
- `compileSdkVersion = 36`
- `targetSdkVersion = 36`
- AGP `8.9.1+`
- Gradle Wrapper `8.11.1+`
- **JDK 21** (Capacitor 8 forces `JavaVersion.VERSION_21` в `node_modules/@capacitor/android/capacitor/build.gradle`)

В CI: `actions/setup-java@v4` с `java-version: '21'` (НЕ 17 — `:capacitor-android:compileDebugJavaWithJavac` упадёт с `error: invalid source release: 21`).

### `@capacitor/assets` regenerates files

Запуск `npx capacitor-assets generate --android` пересоздаёт:
- `android/app/src/main/res/mipmap-*/ic_launcher*.png`
- `android/app/src/main/res/drawable-*/splash.png`
- `android/app/src/main/res/values/ic_launcher_background.xml` ⚠️

**Конфликт:** если `colors.xml` уже определяет `<color name="ic_launcher_background">` — будет ошибка `Duplicate resources` на этапе `mergeDebugResources`. **Решение:** удалить `values/ic_launcher_background.xml` после регенерации, оставить определение в `colors.xml` как single source of truth.

### `npm audit` — high-severity vulnerability

Известно (vite-plugin-singlefile transitive). Пока не критично для бандла. Не запускать `npm audit fix --force` — сломает совместимость Vite 7.

## Code style

- TypeScript strict mode (`tsconfig.json`)
- Все async-операции с Capacitor обёрнуты в try/catch + web fallback
- Имена native-адаптеров в `src/lib/` — kebab-case-export через `import { playBeep } from "./lib/sound"`
- Tailwind classes — длинные строки в одну, без переносов (для grep)

## Релизный чек-лист (для v2.0)

См. `ROADMAP.md` → секцию "Публикация в Google Play".
