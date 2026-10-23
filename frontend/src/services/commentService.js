import API from './api';

export const addComment    = (postId, data) => API.post('/comments/', { text: data.text, post_id: postId });
export const getComments   = (postId)       => API.get(`/comments/post/${postId}`);
export const deleteComment = (commentId)    => API.delete(`/comments/${commentId}`);
