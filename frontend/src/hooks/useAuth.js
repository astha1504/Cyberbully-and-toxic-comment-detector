import { useContext } from 'react';
import AuthContext from '../context/AuthContext';

/**
 * useAuth — convenience hook that exposes { user, loading, login, logout, updateUser }
 * Usage: const { user, logout } = useAuth();
 */
export const useAuth = () => useContext(AuthContext);

export default useAuth;
