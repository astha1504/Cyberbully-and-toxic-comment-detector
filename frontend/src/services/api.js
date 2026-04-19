import axios from 'axios';

const API = axios.create({
  baseURL: 'http://localhost:5000/api',
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

// Auth
export const registerUser = (data) => API.post('/auth/register', data);
export const loginUser = (data) => API.post('/auth/login', data);
export const verifyToken = () => API.get('/auth/verify');

// Posts
export const createPost = (data) => API.post('/posts/', data);
export const getPosts = () => API.get('/posts/');
export const likePost = (postId) => API.post(`/posts/${postId}/like`);
export const deletePost = (postId) => API.delete(`/posts/${postId}`);

// Comments
export const addComment = (postId, data) => API.post(`/posts/${postId}/comments`, data);
export const getComments = (postId) => API.get(`/posts/${postId}/comments`);
export const deleteComment = (commentId) => API.delete(`/posts/comments/${commentId}`);

// Users
export const getProfile = () => API.get('/users/profile');
export const getUserProfile = (userId) => API.get(`/users/profile/${userId}`);
export const updateProfile = (data) => API.put('/users/profile/update', data);
export const followUser = (userId) => API.post(`/users/${userId}/follow`);
export const unfollowUser = (userId) => API.post(`/users/${userId}/unfollow`);
export const searchUsers = (query) => API.get(`/users/search?q=${query}`);
export const getSuggestions = () => API.get('/users/suggestions');

// Chat
export const getConversations = () => API.get('/chat/conversations');
export const getMessages = (conversationId) => API.get(`/chat/messages/${conversationId}`);
export const createConversation = (userId) => API.post('/chat/conversation', { user_id: userId });

export default API;
