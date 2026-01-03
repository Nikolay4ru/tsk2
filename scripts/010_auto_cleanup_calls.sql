-- Функция для автоматической очистки старых звонков
CREATE OR REPLACE FUNCTION cleanup_old_calls()
RETURNS void AS $$
BEGIN
  UPDATE calls 
  SET status = 'missed', 
      ended_at = NOW(),
      duration = EXTRACT(EPOCH FROM (NOW() - started_at))::INTEGER
  WHERE status IN ('calling', 'active') 
    AND started_at < NOW() - INTERVAL '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Создать scheduled job (если pg_cron установлен)
-- SELECT cron.schedule('cleanup-calls', '*/5 * * * *', 'SELECT cleanup_old_calls();');

COMMENT ON FUNCTION cleanup_old_calls() IS 'Автоматически завершает звонки старше 5 минут';
