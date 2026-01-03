-- reset_db.sql
-- Полная очистка базы chatapp_db
-- Работает без superuser прав

BEGIN;

TRUNCATE TABLE
  sessions,
  document_collaborators,
  documents,
  task_watchers,
  messages,
  room_members,
  rooms,
  tasks,
  users
CASCADE;

COMMIT;

-- Проверка (опционально)
-- SELECT
--   (SELECT count(*) FROM users)    AS users,
--   (SELECT count(*) FROM rooms)    AS rooms,
--   (SELECT count(*) FROM messages) AS messages,
--   (SELECT count(*) FROM tasks)    AS tasks;
