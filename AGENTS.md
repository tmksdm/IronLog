# IronLog: правила работы с проектом

- Общаться с пользователем по-русски; комментарии в коде писать по-английски.
- Приложение offline-first: локальная SQLite — источник истины, Supabase — фоновый резервный бэкап. Ошибка сети или отсутствие VPN не должны блокировать локальное сохранение.
- SQL держать в `src/db/` и репозиториях; компоненты и stores не должны обращаться к SQLite напрямую.
- Любые удаления синхронизировать через `cloud_delete_queue`; до облачного pull очередь должна быть успешно обработана.
- Standalone-бег, турник и скакалка имеют `workout_session_id = null` и собственную `date`; не смешивать их с силовыми сессиями и не удалять через «удалить все силовые».
- Для DDL/PRAGMA-миграций jeep-sqlite каждый шаг выполнять отдельным `execute(sql, false)`. Простые новые таблицы добавлять через `CREATE TABLE IF NOT EXISTS` в `CREATE_TABLES_SQL`.
- Native-проект `android/` не хранится в Git. `npm run build:android` создаёт его при отсутствии и выполняет Capacitor sync.
- Перед релизом обновлять одинаковую версию в `package.json` и `src/version.ts`, добавлять запись в `CHANGELOG`.
- Обязательные проверки: `npm run lint`, `npm test`, `npm run build`, `npm run build:ghpages`, `npm run build:android`, `npm audit --audit-level=high`.
- Не коммитить и не пушить без явной просьбы пользователя.

Долговременные цели находятся в `APP_BRIEF.md`, текущее состояние — в `docs/PROJECT_STATE.md`, значимые архитектурные решения — в `docs/DECISIONS.md`.
