import { useContext } from 'react';
import SocketContext from '../context/SocketContext';

/**
 * useSocket — convenience hook that exposes { socket, notifications, clearNotification }
 * Usage: const { socket, notifications } = useSocket();
 */
export const useSocket = () => useContext(SocketContext);

export default useSocket;
