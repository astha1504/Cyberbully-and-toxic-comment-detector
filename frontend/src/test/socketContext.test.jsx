import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock('react-hot-toast', () => ({ default: toast }));

import { AuthProvider } from '../context/AuthContext';
import { SocketProvider, useSocket } from '../context/SocketContext';

const OriginalWebSocket = globalThis.WebSocket;

class TestWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.closed = false;
    TestWebSocket.instances.push(this);
  }

  send(value) {
    this.sent.push(value);
  }

  close() {
    this.closed = true;
  }

  receive(data) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
}

function SocketProbe() {
  const { socket, notifications, clearNotification } = useSocket();
  return (
    <section>
      <output data-testid="notification-count">{notifications.length}</output>
      <button onClick={() => socket?.emit('typing', { conversation_id: 'conv-1', is_typing: true })}>Emit typing</button>
      <button onClick={() => clearNotification('conv-1')}>Clear conversation</button>
      <button onClick={() => socket?.emit('send_message', { content: 'hello' })}>Send message</button>
    </section>
  );
}

function renderSocket() {
  localStorage.setItem('token', 'token-1');
  localStorage.setItem('user', JSON.stringify({ username: 'alice' }));
  return render(
    <AuthProvider>
      <SocketProvider><SocketProbe /></SocketProvider>
    </AuthProvider>,
  );
}

describe('SocketProvider', () => {
  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
    TestWebSocket.instances = [];
  });

  it('connects with the saved token, emits JSON only while open, and closes on unmount', async () => {
    globalThis.WebSocket = TestWebSocket;
    const view = renderSocket();
    const socket = await vi.waitFor(() => {
      expect(TestWebSocket.instances).toHaveLength(1);
      return TestWebSocket.instances[0];
    });
    expect(socket.url).toBe('ws://localhost:8000/ws/notifications?token=token-1');

    fireEvent.click(screen.getByRole('button', { name: 'Emit typing' }));
    expect(socket.sent).toEqual([]);
    socket.readyState = TestWebSocket.OPEN;
    fireEvent.click(screen.getByRole('button', { name: 'Emit typing' }));
    expect(JSON.parse(socket.sent[0])).toEqual({ event: 'typing', conversation_id: 'conv-1', is_typing: true });
    view.unmount();
    expect(socket.closed).toBe(true);
  });

  it('records notifications, displays moderation errors, and clears a conversation', async () => {
    globalThis.WebSocket = TestWebSocket;
    renderSocket();
    const socket = await vi.waitFor(() => {
      expect(TestWebSocket.instances).toHaveLength(1);
      return TestWebSocket.instances[0];
    });
    await act(async () => {
      socket.receive({ type: 'message_notification', conversation_id: 'conv-1', content: 'hello' });
    });
    expect(await screen.findByText('1')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }));
    expect(screen.getByTestId('notification-count').textContent).toBe('0');

    await act(async () => {
      socket.receive({ type: 'MODERATION_ALERT', comment_id: 'comment-1' });
    });
    expect(await screen.findByText('1')).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith(
      'One of your comments was flagged as toxic and has been blurred.',
      { duration: 5000 },
    );
    await act(async () => {
      socket.receive({ type: 'message_error', message: 'Message was blocked.' });
    });
    expect(toast.error).toHaveBeenCalledWith('Message was blocked.');
  });
});
