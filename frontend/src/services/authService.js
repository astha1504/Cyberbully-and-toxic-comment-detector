import API from './api';
import axios from 'axios';

export const loginUser = (data) => {
  const params = new URLSearchParams();
  // Ensure data.email holds your input value from Login.jsx
  params.append('username', data.email || ''); 
  params.append('password', data.password || '');

  // CRITICAL: 'params' MUST be the 2nd argument. The headers object is the 3rd argument.
  return axios.post('http://localhost:8000/auth/login', params, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });
};


export const registerUser = (data) => API.post('/auth/register', data);
export const verifyToken  = ()     => API.get('/auth/verify');
export const logoutUser   = ()     => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
};
