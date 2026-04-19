import { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const useSocket = () => useContext(SocketContext);

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      const newSocket = io('http://localhost:5000', {
        transports: ['websocket', 'polling'],
      });

      newSocket.on('connect', () => {
        newSocket.emit('join', { user_id: user.id });
      });

      newSocket.on('message_notification', (data) => {
        setNotifications((prev) => [...prev, data]);
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [user]);

  const clearNotification = (conversationId) => {
    setNotifications((prev) =>
      prev.filter((n) => n.conversation_id !== conversationId)
    );
  };

  return (
    <SocketContext.Provider value={{ socket, notifications, clearNotification }}>
      {children}
    </SocketContext.Provider>
  );
};

export default SocketContext;
