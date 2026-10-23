import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => {
  const handlers = {};
  return {
    handlers,
    user: { id: 'alice', username: 'alice' },
    socket: {
      isConnected: vi.fn(() => true),
      emit: vi.fn(() => true),
      on: vi.fn((name, callback) => { handlers[name] = callback; }),
      off: vi.fn((name) => { delete handlers[name]; }),
    },
    clearNotification: vi.fn(),
    getConversations: vi.fn(),
    getMessages: vi.fn(),
    createConversation: vi.fn(),
    getUserProfile: vi.fn(),
    searchUsers: vi.fn(),
    checkToxicity: vi.fn(),
    checkImageToxicity: vi.fn(),
    rewriteText: vi.fn(),
    checkAudioToxicity: vi.fn(),
    toast: { error: vi.fn(), success: vi.fn() },
  };
});

vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock('../context/SocketContext', () => ({
  useSocket: () => ({ socket: state.socket, clearNotification: state.clearNotification }),
}));
vi.mock('../context/ThemeContext', () => ({ useTheme: () => ({ theme: 'light', toggleTheme: vi.fn() }) }));
vi.mock('../services/api', () => ({
  getConversations: state.getConversations,
  getMessages: state.getMessages,
  createConversation: state.createConversation,
  getUserProfile: state.getUserProfile,
  searchUsers: state.searchUsers,
  checkToxicity: state.checkToxicity,
  checkImageToxicity: state.checkImageToxicity,
  rewriteText: state.rewriteText,
  checkAudioToxicity: state.checkAudioToxicity,
}));
vi.mock('react-hot-toast', () => ({ default: state.toast }));
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

import Chat from '../pages/Chat';

function renderChat() {
  return render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Chat /></MemoryRouter>);
}

describe('Chat page', () => {
  beforeEach(() => {
    Object.keys(state.handlers).forEach((key) => delete state.handlers[key]);
    state.socket.isConnected.mockReset().mockReturnValue(true);
    state.socket.emit.mockReset().mockReturnValue(true);
    state.socket.on.mockClear();
    state.socket.off.mockClear();
    state.clearNotification.mockReset();
    state.getConversations.mockReset().mockResolvedValue({ data: [] });
    state.getMessages.mockReset().mockResolvedValue({ data: [] });
    state.createConversation.mockReset().mockResolvedValue({ data: { id: 'conversation-1' } });
    state.getUserProfile.mockReset();
    state.searchUsers.mockReset().mockResolvedValue({ data: [{ id: 'bob', username: 'bob', name: 'Bob' }] });
    state.checkToxicity.mockReset().mockResolvedValue({ data: { isToxic: false, score: 0.1, verified: true } });
    state.checkImageToxicity.mockReset();
    state.rewriteText.mockReset();
    state.checkAudioToxicity.mockReset();
    state.toast.error.mockReset();
    state.toast.success.mockReset();
  });

  it('searches for a person and creates their conversation only when the first message sends', async () => {
    renderChat();
    const search = await screen.findByPlaceholderText('Search people by username...');
    fireEvent.change(search, { target: { value: 'bob' } });
    const person = await screen.findByRole('button', { name: /bob/ });
    fireEvent.click(person);

    expect(await screen.findByText('Start the conversation')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Hello Bob' } });
    fireEvent.submit(document.querySelector('.message-input-area'));
    await waitFor(() => expect(state.socket.emit).toHaveBeenCalledWith('send_message', expect.objectContaining({
      conversation_id: 'conversation-1',
      sender_id: 'alice',
      receiver_id: 'bob',
      content: 'Hello Bob',
      ignore_warning: false,
    })));
    expect(state.createConversation).toHaveBeenCalledWith('bob');
    expect(state.getMessages).not.toHaveBeenCalled();
    expect(screen.getByText('Hello Bob')).toBeTruthy();
  });

  it('reconciles an acknowledged message with the optimistic row', async () => {
    state.getConversations.mockResolvedValue({ data: [{
      id: 'conversation-1',
      user: { id: 'bob', username: 'bob' },
      last_message: 'Previous message',
      last_message_time: new Date().toISOString(),
      unread_count: 0,
    }] });
    renderChat();
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    await waitFor(() => expect(state.getMessages).toHaveBeenCalledWith('conversation-1'));
    fireEvent.change(screen.getByPlaceholderText('Type a message...'), { target: { value: 'Message now' } });
    fireEvent.submit(document.querySelector('.message-input-area'));
    await waitFor(() => expect(state.socket.emit).toHaveBeenCalledWith('send_message', expect.any(Object)));
    const payload = state.socket.emit.mock.calls.findLast(([event]) => event === 'send_message')[1];
    expect(screen.getByText('Sending…')).toBeTruthy();

    await act(async () => {
      state.handlers.new_message({
        type: 'new_message',
        id: 'message-1',
        conversation_id: 'conversation-1',
        sender_id: 'alice',
        content: 'Message now',
        client_message_id: payload.client_message_id,
        created_at: new Date().toISOString(),
      });
    });
    expect(screen.getAllByText('Message now')).toHaveLength(2);
    expect(screen.queryByText('Sending…')).toBeNull();
  });

  it('shows and accepts a toxicity warning with an explicit override', async () => {
    state.getConversations.mockResolvedValue({ data: [{
      id: 'conversation-1', user: { id: 'bob', username: 'bob' }, last_message: '', unread_count: 0,
    }] });
    renderChat();
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    await waitFor(() => expect(state.getMessages).toHaveBeenCalled());
    await act(async () => {
      state.handlers.toxicity_warning({
        client_message_id: 'blocked-1',
        original_content: 'You are stupid',
        message: 'This may be harmful. Warning 1 of 3.',
      });
    });
    expect(screen.getByText('This may be harmful. Warning 1 of 3.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Send Anyway' }));
    await waitFor(() => expect(state.socket.emit).toHaveBeenCalledWith('send_message', expect.objectContaining({
      content: 'You are stupid',
      ignore_warning: true,
    })));
  });

  it('transcribes an uploaded voice note, runs moderation, then sends the transcript', async () => {
    state.getConversations.mockResolvedValue({ data: [{
      id: 'conversation-1', user: { id: 'bob', username: 'bob' }, last_message: '', unread_count: 0,
    }] });
    state.checkAudioToxicity.mockResolvedValue({ data: { transcription: 'Please stop.' } });
    renderChat();
    fireEvent.click(await screen.findByRole('button', { name: /bob/ }));
    await waitFor(() => expect(state.getMessages).toHaveBeenCalled());
    const audioFile = new File(['voice bytes'], 'note.wav', { type: 'audio/wav' });
    fireEvent.change(document.querySelector('input[type="file"]'), { target: { files: [audioFile] } });
    await waitFor(() => expect(state.checkAudioToxicity).toHaveBeenCalledWith(audioFile));
    expect(await screen.findByDisplayValue('Please stop.')).toBeTruthy();
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'Send Message' }));
    await waitFor(() => expect(state.socket.emit).toHaveBeenCalledWith('send_message', expect.objectContaining({
      conversation_id: 'conversation-1',
      content: 'Please stop.',
    })));
  });
});
