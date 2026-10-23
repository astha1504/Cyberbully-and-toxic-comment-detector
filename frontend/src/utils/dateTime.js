const INDIA_TIME_ZONE = 'Asia/Kolkata';

export const parseApiTimestamp = (value) => {
  if (value == null || value === '') return null;

  const timestamp = value instanceof Date ? value.toISOString() : String(value).trim();
  if (!timestamp) return null;

  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const normalized = (hasTimezone ? timestamp : `${timestamp}Z`)
    .replace(/(\.\d{3})\d+(?=Z|[+-]\d{2}:?\d{2}$)/, '$1');
  const parsed = new Date(normalized);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

export const formatIndiaDate = (value, options = {}) => {
  const date = parseApiTimestamp(value);
  if (!date) return '';

  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    ...options,
    timeZone: INDIA_TIME_ZONE,
  }).format(date);
};

export const formatIndiaDateTime = (value, options = {}) => {
  const date = parseApiTimestamp(value);
  if (!date) return '';

  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
    timeZoneName: 'short',
    ...options,
    timeZone: INDIA_TIME_ZONE,
  }).format(date);
};

export const formatIndiaTime = (value, options = {}) => {
  const date = parseApiTimestamp(value);
  if (!date) return '';

  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...options,
    timeZone: INDIA_TIME_ZONE,
  }).format(date);
};

export const formatRelativeTime = (value, now = Date.now()) => {
  const date = parseApiTimestamp(value);
  if (!date) return '';

  const elapsedMs = Math.max(0, now - date.getTime());
  const elapsedMinutes = Math.floor(elapsedMs / 60000);
  const elapsedHours = Math.floor(elapsedMs / 3600000);
  const elapsedDays = Math.floor(elapsedMs / 86400000);

  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`;
  if (elapsedHours < 24) return `${elapsedHours}h ago`;
  if (elapsedDays < 7) return `${elapsedDays}d ago`;
  return formatIndiaDate(value);
};
