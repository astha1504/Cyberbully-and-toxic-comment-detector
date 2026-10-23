import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import Navbar from './components/Layout/Navbar';
import { Toaster } from 'react-hot-toast';
import './App.css';

const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));
const Home = lazy(() => import('./pages/Home'));
const CreatePost = lazy(() => import('./pages/CreatePost'));
const Profile = lazy(() => import('./pages/Profile'));
const Chat = lazy(() => import('./pages/Chat'));
const Explore = lazy(() => import('./pages/Explore'));
const Notifications = lazy(() => import('./pages/Notifications'));
const Analytics = lazy(() => import('./pages/Analytics'));
const UserBehaviour = lazy(() => import('./pages/UserBehaviour'));
const SafetyCenter = lazy(() => import('./pages/SafetyCenter'));
const SafetyModeratorQueue = lazy(() => import('./pages/SafetyModeratorQueue'));
const Landing = lazy(() => import('./pages/Landing'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    );
  }
  return user ? children : <Navigate to="/login" />;
};

const AppLayout = ({ children }) => {
  const location = useLocation();
  const isChat = location.pathname === '/chat';

  return (
    <div className={`app-layout ${isChat ? 'chat-layout' : ''}`}>
      <Navbar />
      <main className={`main-content ${isChat ? 'chat-content' : ''}`}>
        {children}
      </main>
    </div>
  );
};

const AppRoutes = () => {
  const { user, loading } = useAuth();

  return (
    <Suspense fallback={<div className="page-loading"><div className="spinner" /></div>}>
      <Routes>
      <Route
        path="/login"
        element={user ? <Navigate to="/" /> : <Login />}
      />
      <Route
        path="/register"
        element={user ? <Navigate to="/" /> : <Register />}
      />
      <Route
        path="/"
        element={
          loading ? (
            <div className="page-loading"><div className="spinner" /></div>
          ) : user ? (
            <AppLayout>
              <Home />
            </AppLayout>
          ) : <Landing />
        }
      />
      <Route
        path="/create"
        element={
          <ProtectedRoute>
            <AppLayout>
              <CreatePost />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/profile/:userId"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Profile />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/chat"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Chat />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/explore"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Explore />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Notifications />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/analytics"
        element={
          <ProtectedRoute>
            <AppLayout>
              <Analytics />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/behaviour"
        element={
          <ProtectedRoute>
            <AppLayout>
              <UserBehaviour />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="/safety" element={<Navigate to="/safety/scan" replace />} />
      <Route
        path="/safety/:section"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SafetyCenter />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/safety/moderation"
        element={
          <ProtectedRoute>
            <AppLayout>
              <SafetyModeratorQueue />
            </AppLayout>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Suspense>
  );
};

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3000,
              style: {
                borderRadius: '10px',
                background: 'var(--surface-light)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                fontSize: '14px',
              },
            }}
          />
          <AppRoutes />
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
