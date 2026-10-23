import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import API from '../services/api';

const originalAdapter = API.defaults.adapter;

function successAdapter(responseData = { ok: true }) {
  return async (config) => ({
    data: responseData,
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  });
}

describe('API client', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState({}, '', '/login');
    API.defaults.adapter = successAdapter();
  });

  afterEach(() => {
    API.defaults.adapter = originalAdapter;
  });

  it('adds the persisted bearer token to requests', async () => {
    localStorage.setItem('token', 'session-token');
    let sentConfig;
    API.defaults.adapter = async (config) => {
      sentConfig = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await API.get('/users/profile');
    expect(sentConfig.headers.get('Authorization')).toBe('Bearer session-token');
  });

  it('preserves an explicit authorization header', async () => {
    localStorage.setItem('token', 'stored-token');
    let sentConfig;
    API.defaults.adapter = async (config) => {
      sentConfig = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    };
    await API.get('/users/profile', { headers: { Authorization: 'Bearer custom-token' } });
    expect(sentConfig.headers.get('Authorization')).toBe('Bearer custom-token');
  });

  it.each(['/auth/login', '/auth/register'])('does not erase a saved session after failed auth submission %s', async (url) => {
    localStorage.setItem('token', 'old-token');
    localStorage.setItem('user', '{"username":"alice"}');
    API.defaults.adapter = async (config) => Promise.reject({
      config,
      response: { status: 401, data: { detail: 'Incorrect username or password' } },
    });
    await expect(API.post(url, {})).rejects.toHaveProperty('response.status', 401);
    expect(localStorage.getItem('token')).toBe('old-token');
    expect(localStorage.getItem('user')).toContain('alice');
  });

  it('clears stale credentials after a protected route returns 401', async () => {
    localStorage.setItem('token', 'expired-token');
    localStorage.setItem('user', '{"username":"alice"}');
    API.defaults.adapter = async (config) => Promise.reject({
      config,
      response: { status: 401, data: { detail: 'Could not validate credentials' } },
    });
    await expect(API.get('/users/profile')).rejects.toHaveProperty('response.status', 401);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
