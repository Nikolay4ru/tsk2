export function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;

  return date.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' });
}

export function formatLastSeen(timestamp) {
  if (!timestamp) return 'последний раз был(а) давно';
  
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'только что';
  if (diffMins < 60) return `последний раз был(а) ${diffMins} минут назад`;
  if (diffHours < 24) return `последний раз был(а) ${diffHours} часов назад`;
  if (diffDays === 1) return 'последний раз был(а) вчера';
  if (diffDays < 7) return `последний раз был(а) ${diffDays} дней назад`;

  return `последний раз был(а) ${date.toLocaleDateString('ru-RU', { month: 'short', day: 'numeric' })}`;
}

export function getInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].charAt(0).toUpperCase();
  return (words[0].charAt(0) + words[words.length - 1].charAt(0)).toUpperCase();
}

export function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
