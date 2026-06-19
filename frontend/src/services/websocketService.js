import { WS_URL } from '../utils/constants';

let socket = null;

/**
 * Connect to the backend WebSocket endpoint.
 * Returns the WebSocket instance.
 * @param {string} [room] - Optional room identifier
 */
export const connectSocket = (room) => {
  const url = room ? `${WS_URL}/ws/${room}` : `${WS_URL}/ws`;
  socket = new WebSocket(url);
  return socket;
};

/**
 * Send a JSON message through the active socket.
 */
export const sendMessage = (payload) => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
};

/**
 * Disconnect the active socket.
 */
export const disconnectSocket = () => {
  if (socket) {
    socket.close();
    socket = null;
  }
};

export const getSocket = () => socket;
