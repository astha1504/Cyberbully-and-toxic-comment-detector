import axios from 'axios';
import { API_URL } from '../utils/constants';

const API = axios.create({
  baseURL: API_URL,
});

API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
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
export const getPosts   = ()       => API.get('/posts/');
export const likePost   = (id)     => API.post(`/posts/${id}/like`);
export const unlikePost = (id)     => API.delete(`/posts/${id}/like`);
export const deletePost = (id)     => API.delete(`/posts/${id}`);

// ── Comments ──────────────────────────────────────────────────────────────────
export const addComment    = (postId, data) => API.post(`/comments/post/${postId}`, data);
export const getComments   = (postId)       => API.get(`/comments/post/${postId}`);
export const deleteComment = (commentId)    => API.delete(`/posts/comments/${commentId}`);

// ── Users ─────────────────────────────────────────────────────────────────────
export const getProfile      = ()         => API.get('/users/profile');
export const getUserProfile  = (userId)   => API.get(`/users/profile/${userId}`);
export const updateProfile   = (data)     => API.put('/users/profile/update', data);
export const followUser      = (userId)   => API.post(`/users/${userId}/follow`);
export const unfollowUser    = (userId)   => API.post(`/users/${userId}/unfollow`);
export const searchUsers     = (q)        => API.get(`/users/search?q=${q}`);
export const getSuggestions  = ()         => API.get('/users/suggestions');

// ── Notifications ─────────────────────────────────────────────────────────────
export const getNotifications    = ()    => API.get('/notifications/');
export const getUnreadCount      = ()    => API.get('/notifications/unread-count');
export const markNotifRead       = (id)  => API.patch(`/notifications/${id}/read`);
export const markAllNotifsRead   = ()    => API.patch('/notifications/read-all');

// ── Chat ──────────────────────────────────────────────────────────────────────
export const getConversations   = ()           => API.get('/chat/conversations');
export const getMessages        = (convId)     => API.get(`/chat/messages/${convId}`);
export const createConversation = (userId)     => API.post('/chat/conversation', { user_id: userId });

// ── Analytics ─────────────────────────────────────────────────────────────────
export const getAnalyticsOverview = () => API.get('/analytics/overview');
export const getToxicComments     = () => API.get('/analytics/toxic-comments');
export const getToxicityTrend     = () => API.get('/analytics/toxicity-trend');

// ── User Behaviour ─────────────────────────────────────────────────────────────
export const getUserBehaviour    = () => API.get('/analytics/user-behaviour');
export const recordViolation     = () => API.post('/analytics/record-violation');
export const recordEdit          = () => API.post('/analytics/record-edit');

// ── Toxicity ──────────────────────────────────────────────────────────────────
export const checkToxicity = (text) => API.post('/toxicity/check', { text });

// ── Moderation ─────────────────────────────────────────────────────────────────
export const checkTextModeration = (text) => API.post('/api/moderation/check-text', { text });
export const rewriteText = (text, tone = 'polite') => API.post('/api/moderation/rewrite', { text, tone });

export default API;
