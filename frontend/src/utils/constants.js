// API & Socket URLs
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

// Design Tokens (mirrored from CSS for JS use)
export const COLORS = {
  background: '#F3F6FB',
  card: '#FFFFFF',
  primary: '#2563EB',
  accent: '#14B8A6',
  secondary: '#0F766E',
  text: '#122033',
  muted: '#64748B',
};

// App constants
export const APP_NAME = 'Pehra';
export const APP_VERSION = '1.0.0';

// Pagination
export const POSTS_PER_PAGE = 10;
export const MESSAGES_PER_PAGE = 30;
export const NOTIFICATIONS_PER_PAGE = 20;

// Media upload
export const MAX_IMAGE_SIZE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

// Toxicity labels
export const TOXICITY_LABELS = {
  safe: 'Safe',
  toxic: 'Toxic',
  flagged: 'Flagged',
};
