import API from './api';

export const getPosts   = ()       => API.get('/posts/');
export const createPost = (data)   => API.post('/posts/', data);
export const likePost   = (id)     => API.post(`/posts/${id}/like`);
export const deletePost = (id)     => API.delete(`/posts/${id}`);
