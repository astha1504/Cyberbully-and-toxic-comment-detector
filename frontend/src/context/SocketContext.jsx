import { createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { API_URL } from '../utils/constants';
import toast from 'react-hot-toast';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const token = localStorage.getItem('token');
      const wsUrl = API_URL.replace(/^http/, 'ws').replace(/\/$/, '');
      const newSocket = new WebSocket(`${wsUrl}/ws/notifications?token=${token}`);

      const listeners = {};

      newSocket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const eventType = data.type || data.event;
          if (eventType === 'message_notification') {
            setNotifications((prev) => [...prev, data]);
          } else if (eventType === 'MODERATION_ALERT') {
            toast.error('One of your comments was flagged as toxic and has been blurred.', {
              duration: 5000,
            });
            setNotifications((prev) => [...prev, data]);
          }
          if (listeners[eventType]) {
            listeners[eventType](data.payload || data);
          }
        } catch (err) {
          console.error('WebSocket msg error', err);
        }
      };

      const adapter = {
        on: (event, callback) => {
          listeners[event] = callback;
        },
        off: (event) => {
          delete listeners[event];
        },
        emit: (event, payload) => {
          if (newSocket.readyState === WebSocket.OPEN) {
            newSocket.send(JSON.stringify({ event, ...payload }));
          }
        },
      };

      newSocket.onopen = () => {
        console.log('WebSocket Connected');
      };

      setSocket(adapter);

      return () => {
        newSocket.close();
      };
    }
  }, [user]);

  const clearNotification = (notificationId) => {
    setNotifications((prev) =>
      prev.filter((n) => n.conversation_id !== notificationId && n.comment_id !== notificationId)
    );
  };

  return (
    <SocketContext.Provider value={{ socket, notifications, clearNotification }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
