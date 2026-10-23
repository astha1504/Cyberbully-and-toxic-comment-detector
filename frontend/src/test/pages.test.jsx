import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  loginUser: vi.fn(),
  verifyToken: vi.fn(),
  get: vi.fn(),
  registerUser: vi.fn(),
  createPost: vi.fn(),
  checkToxicity: vi.fn(),
  checkImageToxicity: vi.fn(),
  rewriteText: vi.fn(),
  getNotifications: vi.fn(),
  markAllNotifsRead: vi.fn(),
  markNotifRead: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('../services/api', () => ({
  default: { get: mocks.get },
  verifyToken: mocks.verifyToken,
  registerUser: mocks.registerUser,
  createPost: mocks.createPost,
  checkToxicity: mocks.checkToxicity,
  checkImageToxicity: mocks.checkImageToxicity,
  rewriteText: mocks.rewriteText,
  getNotifications: mocks.getNotifications,
  markAllNotifsRead: mocks.markAllNotifsRead,
  markNotifRead: mocks.markNotifRead,
}));

vi.mock('../services/authService', () => ({ loginUser: mocks.loginUser }));
vi.mock('react-hot-toast', () => ({ default: mocks.toast }));
vi.mock('framer-motion', async () => {
  const { createElement, Fragment } = await import('react');
  const elements = new Map();
  const motion = new Proxy({}, {
    get: (_target, tag) => {
      if (!elements.has(tag)) {
        elements.set(tag, ({ children, initial, animate, exit, transition, variants, whileHover, whileTap, ...props }) => {
          void initial; void animate; void exit; void transition; void variants; void whileHover; void whileTap;
          return createElement(tag, props, children);
        });
      }
      return elements.get(tag);
    },
  });
  return { motion, AnimatePresence: ({ children }) => createElement(Fragment, null, children) };
});

import { AuthProvider } from '../context/AuthContext';
import CreatePost from '../pages/CreatePost';
import Login from '../pages/Login';
import Notifications from '../pages/Notifications';
import Register from '../pages/Register';

const SAFE_RESULT = {
  isToxic: false,
  score: 0.1,
  highlightedWords: [],
  severity: 'Low',
  verified: true,
  categoryScores: { insult: 0, harassment: 0, threat: 0 },
};

function renderRoute(path, element) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <Routes>
          <Route path={path} element={element} />
          <Route path="/" element={<h1>Home screen</h1>} />
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('sign-in and registration pages', () => {
  beforeEach(() => {
    mocks.loginUser.mockReset();
    mocks.verifyToken.mockReset();
    mocks.get.mockReset();
    mocks.registerUser.mockReset();
    mocks.toast.error.mockReset();
    mocks.toast.success.mockReset();
  });

  it('validates required sign-in fields and completes the token plus profile flow', async () => {
    mocks.loginUser.mockResolvedValue({ data: { access_token: 'login-token' } });
    mocks.get.mockResolvedValue({ data: { id: 'user-1', username: 'alice' } });
    renderRoute('/login', <Login />);

    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(mocks.toast.error).toHaveBeenCalledWith('Please fill in all fields');

    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'alice@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log In' }));
    expect(await screen.findByText('Home screen')).toBeTruthy();
    expect(mocks.loginUser).toHaveBeenCalledWith({ email: 'alice@example.com', password: 'secret-1' });
    expect(mocks.get).toHaveBeenCalledWith('/auth/me', { headers: { Authorization: 'Bearer login-token' } });
    expect(JSON.parse(localStorage.getItem('user')).username).toBe('alice');
    expect(localStorage.getItem('token')).toBe('login-token');
  });

  it('validates registration fields and persists the created account', async () => {
    mocks.registerUser.mockResolvedValue({ data: {
      user: { id: 'user-2', username: 'bob' },
      token: 'register-token',
    } });
    renderRoute('/register', <Register />);

    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(mocks.toast.error).toHaveBeenCalledWith('Please fill in all fields');

    fireEvent.change(screen.getByPlaceholderText('Full Name'), { target: { value: 'bob' } });
    fireEvent.change(screen.getByPlaceholderText('Email address'), { target: { value: 'bob@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(mocks.toast.error).toHaveBeenCalledWith('Password must be at least 6 characters');

    fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'long-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(await screen.findByText('Home screen')).toBeTruthy();
    expect(mocks.registerUser).toHaveBeenCalledWith({ username: 'bob', email: 'bob@example.com', password: 'long-password' });
    expect(localStorage.getItem('token')).toBe('register-token');
  });
});

describe('post creation page', () => {
  beforeEach(() => {
    mocks.createPost.mockReset();
    mocks.createPost.mockResolvedValue({ data: { id: 'post-1' } });
    mocks.checkToxicity.mockReset();
    mocks.checkToxicity.mockResolvedValue({ data: SAFE_RESULT });
    mocks.checkImageToxicity.mockResolvedValue({ data: { detectedText: '', isToxic: false, score: 0, verified: true } });
    mocks.toast.error.mockReset();
  });

  it('checks a caption before posting and publishes the approved text', async () => {
    renderRoute('/create', <CreatePost />);
    fireEvent.click(screen.getByRole('button', { name: 'Share Post' }));
    expect(mocks.toast.error).toHaveBeenCalledWith('Add a caption or image');
    expect(mocks.createPost).not.toHaveBeenCalled();

    fireEvent.change(screen.getByPlaceholderText('Write a caption...'), { target: { value: 'A new project update' } });
    fireEvent.click(screen.getByRole('button', { name: 'Share Post' }));
    await waitFor(() => expect(screen.getByPlaceholderText("What's on your mind?")).toBeTruthy());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const shareButtons = screen.getAllByRole('button', { name: 'Share Post' });
    fireEvent.click(shareButtons.at(-1));
    expect(await screen.findByText('Home screen')).toBeTruthy();
    expect(mocks.checkToxicity).toHaveBeenCalledWith('A new project update');
    expect(mocks.createPost).toHaveBeenCalledWith({ caption: 'A new project update', images: [] });
  });
});

describe('notifications page', () => {
  beforeEach(() => {
    mocks.getNotifications.mockReset();
    mocks.markAllNotifsRead.mockReset();
    mocks.markNotifRead.mockReset();
    mocks.toast.success.mockReset();
    mocks.getNotifications.mockResolvedValue({ data: [
      { id: 'n-1', type: 'like', actor_id: 'user-2', actor_name: 'Bob', message: 'liked your post', is_read: false, created_at: new Date().toISOString() },
      { id: 'n-2', type: 'follow', actor_id: 'user-3', actor_name: 'Casey', message: 'followed you', is_read: true, created_at: new Date().toISOString() },
    ] });
    mocks.markAllNotifsRead.mockResolvedValue({ data: { message: 'ok' } });
    mocks.markNotifRead.mockResolvedValue({ data: { message: 'ok' } });
  });

  it('filters unread items and marks every notification as read', async () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Notifications /></MemoryRouter>,
    );
    expect(await screen.findByText('liked your post')).toBeTruthy();
    expect(screen.getByText('1 new')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Unread/ }));
    expect(screen.getByText('liked your post')).toBeTruthy();
    expect(screen.queryByText('followed you')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    await waitFor(() => expect(mocks.markAllNotifsRead).toHaveBeenCalledOnce());
    expect(screen.queryByText('1 new')).toBeNull();
    expect(mocks.toast.success).toHaveBeenCalledWith('All marked as read');
  });
});
