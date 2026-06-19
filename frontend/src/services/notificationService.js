import API from './api';

export const getNotifications  = ()    => API.get('/notifications/');
export const getUnreadCount    = ()    => API.get('/notifications/unread-count');
export const markNotifRead     = (id)  => API.patch(`/notifications/${id}/read`);
export const markAllNotifsRead = ()    => API.patch('/notifications/read-all');
