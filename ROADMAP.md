# ROADMAP.md — план развития Биомашины

Документ описывает, что планируется добавить после первого работающего debug‑APK (v0.1). Разбит на три горизонта: **личное использование (v1.x)**, **публикация в Google Play (v2.0)** и **монетизация / экосистема (v2.x+)**. В конце — реестр техдолга.

---

## v1.x — личное использование (debug‑APK, без Play Store)

Цель: довести приложение до состояния, в котором его комфортно использовать самому и поделиться с 3–10 друзьями через прямую ссылку на APK.

### v1.1 — Health Connect интеграция
**Статус:** отложен в Phase 2 (требует физического Android‑устройства с установленным Health Connect и приложением‑источником данных вроде Mi Fit / Samsung Health для тестирования).

**Что нужно сделать:**
- Установить плагин: `npm install capacitor-health-connect` (или альтернативный — на момент написания самый зрелый — `@kiwi-health/capacitor-health-connect`).
- Запросить permissions для:
  - `android.permission.health.READ_STEPS` → автозаполнение поля «Шаги» в Dashboard.
  - `android.permission.health.READ_HEART_RATE` → подтянуть среднюю ЧСС покоя для overtraining‑маркера.
  - `android.permission.health.READ_SLEEP` → автоматически заполнять SleepScreen на основе данных трекера.
  - `android.permission.health.READ_BODY_FAT` (опционально).
- Добавить в Dashboard раздел *«Импорт из Health Connect»* с кнопкой «Синхронизировать».
- В `AndroidManifest.xml`: `<queries>` блок с `<package android:name="com.google.android.apps.healthdata" />`.

### v1.2 — Wear OS компаньон
- Создать модуль `wear/` через Android Studio → New → Wear OS Module.
- Минимальный функционал: запуск таймера отдыха с часов, виброотклик в момент окончания, показ текущего упражнения и подхода.
- Связь через DataLayer API (Wearable Data Client).
- Ограничение: требует Kotlin + native Android разработки, выходит за рамки чистого Capacitor‑воркфлоу.

### v1.3 — Виджет на главный экран
- AppWidget‑провайдер, показывающий: текущая неделя/мезоцикл, тренировка дня, кнопка «Начать».
- Нужно native Java/Kotlin: `AppWidgetProvider`, `RemoteViews`, deep‑link в Capacitor через `appUrlOpen` listener.

### v1.4 — Экспорт во внешние форматы
- **Strong** (`.csv` с колонками `Date | Workout Name | Exercise Name | Set Order | Weight | Reps | RPE`).
- **Hevy** (`.csv` со схожей структурой).
- **Google Sheets** через Share Intent с уже сформированным CSV.
- Импорт из Strong/Hevy — для миграции существующих пользователей.

### v1.5 — Голосовые заметки к подходам
- Плагин: `@capacitor-community/voice-recorder` или native AudioRecord.
- 5–10 секундная заметка после сложного подхода («колено отдавало», «нагрузка на 9 RPE»).
- Хранение: Filesystem.Directory.Data, ссылка в SetLog.

### v1.6 — Темная/светлая тема, локализация
- Переключатель темы в Settings (сейчас зашит в `slate-900`).
- Английский UI (i18n через простой словарь, без библиотек).
- RTL уже включён в манифесте.

---

## v2.0 — публикация в Google Play

Переход с debug‑APK на signed AAB, прохождение модерации Google.

### Чек‑лист релиза

| Шаг | Действие | Стоимость / сроки |
|---|---|---|
| 1 | Регистрация **Google Play Console** | $25 разово |
| 2 | Подтверждение личности (D‑U‑N‑S или паспорт) | 1–3 дня |
| 3 | Создать **release keystore** (`keytool -genkey -v -keystore biomachine-release.keystore -alias biomachine -keyalg RSA -keysize 2048 -validity 10000`) | сразу |
| 4 | Включить **Play App Signing** в Console (Google хранит upload key и подписывает финальный AAB) | сразу |
| 5 | Настроить `android/app/build.gradle` со signing config через переменные окружения / `signingProperties` | 1 день |
| 6 | Иконки всех размеров: `mipmap-mdpi/hdpi/xhdpi/xxhdpi/xxxhdpi` ic_launcher (48–192 px) + adaptive icon | уже есть из Phase 4 |
| 7 | **Feature graphic** 1024×500 px (Play Store карточка) | 2 часа в Figma |
| 8 | Скриншоты: 4–8 штук, каждое в портрете 1080×1920 (минимум 2, соотношение 16:9) | 1 день |
| 9 | Описание Store Listing: short (80 знаков), full (4000), на русском и английском | 1 день |
| 10 | **Privacy Policy** на публичной странице (GitHub Pages / personal website). Обязательно для приложений с разрешениями POST_NOTIFICATIONS, CAMERA, RECORD_AUDIO | 1 день |
| 11 | **Data safety form** в Console — что собираем, что отправляем (для Биомашины: ничего внешне; всё локально) | 30 мин |
| 12 | Сборка signed AAB: `cd android && ./gradlew bundleRelease` | сразу |
| 13 | **Closed testing track** с 12+ тестерами в течение **минимум 14 дней непрерывно** (требование Google для новых аккаунтов с 2024 года) | 2 недели |
| 14 | Заявка на production release | review 2–7 дней |

### Подписи и keystore — security
- Keystore **никогда** не коммитить в git. Хранить локально + офлайн‑бэкап (USB‑флешка в сейф / зашифрованный архив в облаке).
- Пароли — в менеджере паролей, не в `gradle.properties` плейном виде. Использовать `~/.gradle/gradle.properties` или env переменные.
- Утрата keystore = утрата возможности обновлять приложение в Play. Только новый appId с миграцией пользователей.

### Что не пройдёт review без правок
- Иконка: оранжевая на оранжевом фоне без «дыхания» — Google требует читаемости иконки на любых обоях.
- `WAKE_LOCK` — обоснование в Data Safety: «удержание экрана активным во время тренировки и таймера отдыха».
- `SCHEDULE_EXACT_ALARM` (Android 14+): нужно либо обоснование «alarm clock / calendar / reminder use case» в Console, либо переход на `USE_EXACT_ALARM` (только для будильников и календарей). Для нашего use case (напоминания о тренировках) подходит инексактный `setWindow()` — стоит рассмотреть downgrade до `setExactAndAllowWhileIdle` без exact‑permission.
- Ограничение API 35+: к 31 августа 2026 все новые приложения должны таргетить API 36 (у нас уже 36 после Phase 5 — ✅).

---

## v2.x — монетизация и экосистема

### Freemium модель
- **Бесплатно:** базовая 12‑недельная программа, метрики, таймер, экспорт JSON.
- **Premium ($3.99/мес или $24.99/год):**
  - Кастомные программы (создание собственных мезоциклов).
  - Облачная синхронизация между устройствами.
  - PDF‑отчёт прогресса по итогам мезоцикла (графики, сравнение тестов).
  - Голосовой коучинг во время подходов (TTS обратный отсчёт).
- **Lifetime:** $59.99 разово.

### Google Play Billing
- Плагин `@capacitor-community/in-app-review` + native интеграция Billing Library 7.
- Обработка subscription lifecycle: PURCHASED → ACKNOWLEDGED → renewals → cancellations.
- Server‑side validation через Google Play Developer API (если будем держать backend).

### Облачная синхронизация
**Вариант A — Supabase** (рекомендую):
- Бесплатный tier: 500 MB DB, 1 GB storage, 50K MAU.
- Auth: email magic link или Google OAuth.
- Postgres + Row Level Security: каждый юзер видит только свои строки.
- Realtime подписка для Wear OS.
- Хранение прогресс‑фото в Storage bucket с CDN.

**Вариант B — Firebase:**
- Firestore + Firebase Auth + Cloud Storage.
- Дороже на масштабе, проще DX, лучше документация для Capacitor.

### Экспорт PDF
- `pdf-lib` (чистый JS, работает в WebView без нативных зависимостей).
- Шаблон: обложка (имя, период) → графики прогресса → таблица тестов → итоги.
- Делиться через `@capacitor/share`.

---

## Техдолг

| ID | Описание | Приоритет |
|---|---|---|
| TD‑01 | Unit‑тесты для `useStore` (`getWeekNumber`, `currentWeek`, миграции) — Vitest | P1 |
| TD‑02 | E2E тесты основного flow через **Maestro** (онбординг → таймер → экспорт) | P1 |
| TD‑03 | **Sentry** для отлова крашей (бесплатный tier 5K событий/мес) | P1 |
| TD‑04 | Аналитика без трекинга — **Plausible** или **Umami** (только агрегаты) | P2 |
| TD‑05 | Splash screen API 12+ (`androidx.core:core-splashscreen`) — уже подключён, но нужно убрать кастомный splash drawable и использовать векторную иконку | P2 |
| TD‑06 | Заменить `flatDir` репозиторий в `app/build.gradle` на нормальные artifact‑зависимости (warning в каждом build) | P2 |
| TD‑07 | Миграция со staticly‑bundled `data/programData.ts` на сетевую загрузку — позволит обновлять программы без релиза APK | P3 |
| TD‑08 | A11y‑аудит: contrast ratio, screen reader labels, font size scaling | P2 |
| TD‑09 | i18n инфраструктура (сейчас всё хардкод по‑русски в App.tsx) | P3 |
| TD‑10 | React 19 → migration audit: проверить, не использует ли что‑то deprecated useEffect cleanup pattern | P3 |
| TD‑11 | App size optimization: вынести Recharts в lazy chunk (он добавляет ~100 КБ к bundle) | P2 |
| TD‑12 | Оффлайн‑first проверка: WebView должен работать без сети сразу после первого запуска | P1 |
