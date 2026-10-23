import axios from 'axios';
import { API_URL } from '../utils/constants';

const API = axios.create({
  baseURL: API_URL,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  const hasAuthorization = config.headers?.get?.('Authorization')
    || config.headers?.Authorization
    || config.headers?.authorization;
  if (token && !hasAuthorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    const isAuthSubmission = /^\/?auth\/(login|register)(?:$|[?#])/.test(requestUrl);

    if (error.response?.status === 401 && !isAuthSubmission) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────────────────────────
export const registerUser = (data) => API.post('/auth/register', data);
export const loginUser    = (data) => API.post('/auth/login', data);
export const verifyToken  = ()     => API.get('/auth/me');

// ── Posts ─────────────────────────────────────────────────────────────────────
export const createPost = (data)   => API.post('/posts/', data);
export const getPost = (id)        => API.get(`/posts/${id}`);
export const updatePost = (id, data) => API.patch(`/posts/${id}`, data);
export const getPosts   = (params = {}) => API.get('/posts/', { params });
export const likePost   = (id)     => API.post(`/posts/${id}/like`);
export const unlikePost = (id)     => API.delete(`/posts/${id}/like`);
export const deletePost = (id)     => API.delete(`/posts/${id}`);

// ── Comments ──────────────────────────────────────────────────────────────────
export const addComment    = (postId, data) => API.post('/comments/', { text: data.text, post_id: postId });
export const getComments   = (postId)       => API.get(`/comments/post/${postId}`);
export const updateComment = (commentId, data) => API.patch(`/comments/${commentId}`, data);
export const deleteComment = (commentId)    => API.delete(`/comments/${commentId}`);

// ── Users ─────────────────────────────────────────────────────────────────────
export const getProfile      = ()         => API.get('/users/profile');
export const getUserProfile  = (userId)   => API.get(`/users/profile/${userId}`);
export const getFollowers    = (userId)   => API.get(`/users/profile/${userId}/followers`);
export const getFollowing    = (userId)   => API.get(`/users/profile/${userId}/following`);
export const updateProfile   = (data)     => API.put('/users/profile/update', data);
export const followUser      = (userId)   => API.post(`/users/${userId}/follow`);
export const unfollowUser    = (userId)   => API.post(`/users/${userId}/unfollow`);
export const searchUsers     = (q)        => API.get('/users/search', { params: { q } });
export const getSuggestions  = ()         => API.get('/users/suggestions');

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications    = ()    => API.get('/notifications/');
export const getUnreadCount      = ()    => API.get('/notifications/unread-count');
export const markNotifRead       = (id)  => API.patch(`/notifications/${id}/read`);
export const markAllNotifsRead   = ()    => API.patch('/notifications/read-all');

// ── Chat ──────────────────────────────────────────────────────────────────────
export const getConversations   = ()           => API.get('/chat/conversations');
export const getMessages        = (convId)     => API.get(`/chat/messages/${convId}`);
export const markConversationRead = (convId)   => API.patch(`/chat/messages/${convId}/read`);
export const createConversation = (userId)     => API.post('/chat/conversation', { user_id: userId });

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getAnalyticsOverview = () => API.get('/analytics/overview');
export const getToxicComments     = () => API.get('/analytics/toxic-comments');
export const getToxicityTrend     = () => API.get('/analytics/toxicity-trend');

// ── User Behaviour ─────────────────────────────────────────────────────────────
export const getUserBehaviour    = () => API.get('/analytics/user-behaviour');

// ── Toxicity ──────────────────────────────────────────────────────────────────
export const checkToxicity = (text, conversationId) => API.post('/api/moderation/check-text', {
  text,
  ...(conversationId ? { conversation_id: conversationId } : {}),
});
export const checkImageToxicity = (imageData) => API.post('/api/moderation/check-image', { image_data: imageData });
export const checkAudioToxicity = (file) => {
  const body = new FormData();
  body.append('audio', file);
  return API.post('/api/moderation/check-audio', body);
};
export const analyzeCyberSafety = (text, moneyLost = false, credentialsShared = false) => API.post('/api/cyber-safety/analyze', {
  text,
  money_lost: moneyLost,
  credentials_shared: credentialsShared,
});
export const createSafetyReport = (data) => API.post('/api/cyber-safety/reports', data);
export const getMySafetyReports = () => API.get('/api/cyber-safety/reports/mine');
export const getSafetyReportQueue = () => API.get('/api/cyber-safety/reports/queue');
export const reviewSafetyReport = (id, data) => API.patch(`/api/cyber-safety/reports/${id}`, data);
export const appealSafetyReport = (id, note) => API.post(`/api/cyber-safety/reports/${id}/appeal`, { note });
export const getSafetyReportHistory = (id) => API.get(`/api/cyber-safety/reports/${id}/history`);
export const getSafetyEvidence = (id) => API.get(`/api/cyber-safety/reports/${id}/evidence`);
export const uploadSafetyEvidence = (id, file) => {
  const body = new FormData();
  body.append('file', file);
  return API.post(`/api/cyber-safety/reports/${id}/evidence`, body);
};
export const downloadSafetyEvidence = (id, evidenceId) => API.get(
  `/api/cyber-safety/reports/${id}/evidence/${evidenceId}`,
  { responseType: 'blob' },
);
export const deleteSafetyEvidence = (id, evidenceId) => API.delete(
  `/api/cyber-safety/reports/${id}/evidence/${evidenceId}`,
);

// ── Moderation ─────────────────────────────────────────────────────────────────
export const checkTextModeration = (text) => API.post('/api/moderation/check-text', { text });
export const rewriteText = (text, tone = 'polite') => API.post('/api/moderation/rewrite', { text, tone });

export default API;
