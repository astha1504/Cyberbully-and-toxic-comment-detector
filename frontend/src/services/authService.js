import API from './api';

export const loginUser = (data) => {
  const params = new URLSearchParams();
  params.append('username', data.email || ''); 
  params.append('password', data.password || '');

  return API.post('/auth/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
};


export const registerUser = (data) => API.post('/auth/register', data);
export const verifyToken  = ()     => API.get('/auth/me');
export const logoutUser   = ()     => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
