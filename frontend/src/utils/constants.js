// API & Socket URLs
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || 'http://localhost:8000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws';

// Design Tokens (mirrored from CSS for JS use)
export const COLORS = {
  background: '#F8F5F0',
  card: '#FFFFFF',
  primary: '#C56E5A',
  accent: '#D4A373',
  secondary: '#8FA68E',
  text: '#1F2937',
  muted: '#6B7280',
};

// App constants
export const APP_NAME = 'Socialite';
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
