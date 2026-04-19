import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import {
  Home, Search, PlusSquare, Heart, MessageCircle,
  User, LogOut, Sun, Moon, Menu, X, Compass
} from 'lucide-react';
import './Navbar.css';

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notifications } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const unreadCount = notifications.length;

  const navItems = [
    { path: '/', icon: Home, label: 'Home' },
    { path: '/explore', icon: Compass, label: 'Explore' },
    { path: '/create', icon: PlusSquare, label: 'Create' },
    { path: '/chat', icon: MessageCircle, label: 'Messages', badge: unreadCount },
    { path: `/profile/${user?.id}`, icon: User, label: 'Profile' },
  ];

  return (
    <>
      {/* Desktop Sidebar */}
      <nav className="navbar-sidebar" id="main-navbar">
        <div className="navbar-logo">
          <Link to="/">
            <span className="logo-text">Socialite</span>
          </Link>
        </div>

        <ul className="navbar-links">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`nav-link ${isActive ? 'active' : ''}`}
                  id={`nav-${item.label.toLowerCase()}`}
                >
                  <div className="nav-icon-wrapper">
                    <Icon size={24} />
                    {item.badge > 0 && (
                      <span className="nav-badge">{item.badge}</span>
                    )}
                  </div>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="navbar-bottom">
          <button className="nav-link theme-toggle" onClick={toggleTheme} id="theme-toggle-btn">
            <div className="nav-icon-wrapper">
              {theme === 'light' ? <Moon size={24} /> : <Sun size={24} />}
            </div>
            <span className="nav-label">{theme === 'light' ? 'Dark' : 'Light'} Mode</span>
          </button>
          <button className="nav-link logout-btn" onClick={handleLogout} id="logout-btn">
            <div className="nav-icon-wrapper">
              <LogOut size={24} />
            </div>
            <span className="nav-label">Log out</span>
          </button>
        </div>
      </nav>

      {/* Mobile Bottom Nav */}
      <nav className="navbar-mobile" id="mobile-navbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`mobile-nav-link ${isActive ? 'active' : ''}`}
            >
              <div className="mobile-icon-wrapper">
                <Icon size={22} />
                {item.badge > 0 && (
                  <span className="nav-badge">{item.badge}</span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </>
  );
};

export default Navbar;
