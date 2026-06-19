import API from './api';

export const addComment    = (postId, data) => API.post(`/posts/${postId}/comments`, data);
export const getComments   = (postId)       => API.get(`/posts/${postId}/comments`);
export const deleteComment = (commentId)    => API.delete(`/posts/comments/${commentId}`);
