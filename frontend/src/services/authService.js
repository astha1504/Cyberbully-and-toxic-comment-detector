import API from './api';

export const loginUser    = (data) => API.post('/auth/login', data);
export const registerUser = (data) => API.post('/auth/register', data);
export const verifyToken  = ()     => API.get('/auth/verify');
export const logoutUser   = ()     => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
