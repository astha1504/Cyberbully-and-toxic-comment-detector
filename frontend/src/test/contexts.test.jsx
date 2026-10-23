import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';

function AuthProbe() {
  const { user, loading, login, logout, updateUser } = useAuth();
  return (
    <section>
      <output data-testid="auth-state">{loading ? 'loading' : user?.username || 'signed-out'}</output>
      <button onClick={() => login({ username: 'new-user' }, 'token-1')}>Log in</button>
      <button onClick={() => updateUser({ username: 'updated-user' })}>Update profile</button>
      <button onClick={logout}>Log out</button>
    </section>
  );
}

function ThemeProbe() {
  const { theme, toggleTheme } = useTheme();
  return <button onClick={toggleTheme}>Theme: {theme}</button>;
}

describe('AuthProvider', () => {
  it('restores a saved user and clears corrupt stored JSON', async () => {
    localStorage.setItem('token', 'persisted-token');
    localStorage.setItem('user', JSON.stringify({ username: 'alice' }));
    const view = render(<AuthProvider><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('alice')).toBeTruthy();
    view.unmount();

    localStorage.setItem('token', 'broken-token');
    localStorage.setItem('user', '{invalid json');
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    expect(await screen.findByText('signed-out')).toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });

  it('persists login and profile updates, then removes both values on logout', async () => {
    render(<AuthProvider><AuthProbe /></AuthProvider>);
    fireEvent.click(screen.getByText('Log in'));
    expect(await screen.findByText('new-user')).toBeTruthy();
    expect(localStorage.getItem('token')).toBe('token-1');
    expect(JSON.parse(localStorage.getItem('user')).username).toBe('new-user');

    fireEvent.click(screen.getByText('Update profile'));
    expect(await screen.findByText('updated-user')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('user')).username).toBe('updated-user');

    fireEvent.click(screen.getByText('Log out'));
    expect(await screen.findByText('signed-out')).toBeTruthy();
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});

describe('ThemeProvider', () => {
  it('loads the saved theme, updates the document, and persists toggles', async () => {
    localStorage.setItem('theme', 'dark');
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>);
    expect(await screen.findByText('Theme: dark')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByText('Theme: light')).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('theme')).toBe('light');
  });
});
