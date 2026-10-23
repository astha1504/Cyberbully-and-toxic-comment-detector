import API from './api';

export const getPosts   = (params = {})       => API.get('/posts/', { params });
export const createPost = (data)   => API.post('/posts/', data);
export const likePost   = (id)     => API.post(`/posts/${id}/like`);
export const deletePost = (id)     => API.delete(`/posts/${id}`);
