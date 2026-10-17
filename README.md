# IronLog

Приложение для силовых тренировок с точным таймером отдыха: ход тренировки
сохраняется, а время отдыха остаётся верным даже при выключенном экране и работе
приложения в фоне.

**Приложение полностью локальное.** Аккаунта, входа и облачной синхронизации нет:
локальная база SQLite — единственный источник данных, приложение работает без сети
вообще, а резервная копия делается экспортом и импортом файла JSON.

- Рабочая PWA: https://tmksdm.github.io/IronLog/
- Тестовый стенд: https://ironlog-test.github.io/ (отдельный origin, сборка из ветки `test-deploy`)
- Платформы: PWA и Android через Capacitor (`npm run build:android`)

## Разработка

```bash
npm install
npm run dev            # локальный сервер разработки
npm run lint           # ESLint
npm test               # Vitest
npm run build          # web-сборка
npm run build:ghpages  # сборка для GitHub Pages (base /IronLog/)
npm run build:test     # сборка для тестового стенда (CSP, адрес стенда)
npm run build:android  # web-сборка и Capacitor sync
```

Ветки: работа идёт в `develop`, на стенд публикуется `test-deploy`, `main` —
выпущенная версия. Публикация production выполняется только вручную
(`workflow_dispatch` в `deploy.yml`), публикация стенда — только вручную и только
после одобрения окружения `github-pages`.

Правила работы — `AGENTS.md`, текущее состояние — `docs/HANDOFF.md`, принятые
решения — `docs/DECISIONS.md`.
