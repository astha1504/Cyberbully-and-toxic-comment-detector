import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  Activity, BarChart3, Bell, ChevronDown, ClipboardList, Compass,
  FileText, Home, LifeBuoy, LogOut, MessageCircle,
  Moon, Plus, ShieldCheck, Sun, User
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { useSocket } from '../../context/SocketContext';
import BrandLockup from '../BrandLockup';
import './Navbar.css';

const NAV_ITEMS = [
  { path: '/', icon: Home, label: 'Home', section: 'Community' },
  { path: '/explore', icon: Compass, label: 'Explore', section: 'Community' },
  { path: '/create', icon: Plus, label: 'Create post', section: 'Community', emphasis: true },
  { path: '/chat', icon: MessageCircle, label: 'Messages', section: 'Community' },
  { path: '/notifications', icon: Bell, label: 'Notifications', section: 'Community' },
  { path: '/behaviour', icon: Activity, label: 'My behaviour', section: 'Insights' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics', section: 'Insights' },
];

const SAFETY_ITEMS = [
  { path: '/safety/scan', icon: ShieldCheck, label: 'Scan a message' },
  { path: '/safety/help', icon: LifeBuoy, label: 'Get help' },
  { path: '/safety/report', icon: FileText, label: 'Prepare a report' },
  { path: '/safety/reports', icon: ClipboardList, label: 'My reports' },
];

const MOBILE_ITEMS = [
  { path: '/', icon: Home, label: 'Home' },
  { path: '/explore', icon: Compass, label: 'Explore' },
  { path: '/create', icon: Plus, label: 'Create post' },
  { path: '/chat', icon: MessageCircle, label: 'Messages' },
  { path: '/safety/scan', icon: ShieldCheck, label: 'Safety', safetyRoot: true },
];

const getPageName = (pathname) => {
  if (pathname === '/safety/moderation') return 'Safety moderation queue';
  const safetyPage = SAFETY_ITEMS.find((item) => item.path === pathname);
  if (safetyPage) return safetyPage.label;
  if (pathname.startsWith('/safety')) return 'Safety Center';
  if (pathname.startsWith('/profile')) return 'Your profile';
  return NAV_ITEMS.find((item) => item.path === pathname)?.label || 'Community';
};

const Avatar = ({ user, small = false }) => {
  const name = user?.username || user?.name || 'Member';
  const initials = name.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  if (user?.profile_picture) {
    return <img className={`nav-avatar${small ? ' small' : ''}`} src={user.profile_picture} alt="" />;
  }
  return <span className={`nav-avatar nav-avatar-initials${small ? ' small' : ''}`} aria-hidden="true">{initials || <User size={16} />}</span>;
};

const Navbar = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { notifications = [] } = useSocket();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const unreadCount = notifications.filter((item) => !item.is_read).length;
  const currentPage = getPageName(location.pathname);
  const profilePath = `/profile/${user?.id}`;

  const isActive = (item) => item.safetyRoot
    ? location.pathname.startsWith('/safety')
    : item.path.startsWith('/safety/')
      ? location.pathname === item.path || (item.path === '/safety/reports' && location.pathname === '/safety/moderation')
    : item.path === '/profile'
      ? location.pathname.startsWith('/profile')
      : location.pathname === item.path;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const renderLink = (item, mobile = false) => {
    const Icon = item.icon;
    const active = isActive(item);
    return (
      <Link
        key={item.path}
        to={item.path === '/profile' ? profilePath : item.path}
        className={`${mobile ? 'mobile-nav-link' : 'nav-link'}${active ? ' active' : ''}${item.emphasis ? ' nav-link-emphasis' : ''}`}
        id={!mobile ? `nav-${item.label.toLowerCase().replaceAll(' ', '-')}` : undefined}
        aria-current={active ? 'page' : undefined}
        aria-label={item.label}
        title={item.label}
        onClick={() => mobile && setMobileOpen(false)}
      >
        <span className={mobile ? 'mobile-icon-wrapper' : 'nav-icon-wrapper'}>
          <Icon size={19} strokeWidth={active ? 2.25 : 1.9} />
          {item.label === 'Notifications' && unreadCount > 0 && <span className="nav-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>}
        </span>
        <span className={mobile ? 'mobile-nav-label' : 'nav-label'}>{item.label}</span>
      </Link>
    );
  };

  return (
    <>
      <aside className="navbar-sidebar" id="main-navbar" aria-label="Main navigation">
        <Link className="navbar-logo" to="/" aria-label="Pehra home">
          <BrandLockup />
        </Link>

        <div className="navbar-scroll-area">
          {['Community', 'Safety Center', 'Insights'].map((section) => (
            <section className="navbar-section" key={section}>
              <h2 className="nav-section-title">{section}</h2>
              {section === 'Safety Center' ? (
                <ul className="navbar-links navbar-safety-links">
                  {SAFETY_ITEMS.map((item) => <li key={item.path}>{renderLink(item)}</li>)}
                </ul>
              ) : (
                <ul className="navbar-links">
                  {NAV_ITEMS.filter((item) => item.section === section).map((item) => (
                    <li key={item.path}>{renderLink(item)}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <div className="navbar-bottom">
          <Link className={`nav-link profile-nav-link${isActive({ path: '/profile' }) ? ' active' : ''}`} to={profilePath} id="nav-profile">
            <Avatar user={user} small />
            <span className="profile-nav-copy"><strong>{user?.username || user?.name || 'Your profile'}</strong><small>View your profile</small></span>
            <ChevronDown size={15} className="profile-chevron" />
          </Link>
          <div className="nav-utility-row">
            <button className="nav-utility-button" onClick={toggleTheme} id="theme-toggle-btn" aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
              {theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}
              <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
            </button>
            <button className="nav-utility-button logout-button" onClick={handleLogout} id="logout-btn" aria-label="Log out">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <header className="app-topbar">
        <div className="mobile-brand"><BrandLockup compact /></div>
        <div className="topbar-context">
          <span className="topbar-kicker">COMMUNITY SAFETY WORKSPACE</span>
          <span className="topbar-title">{currentPage}</span>
        </div>
        <div className="topbar-actions">
          <Link className="topbar-scan-link" to="/safety/scan"><ShieldCheck size={17} /><span>Scan a message</span></Link>
          <button className="topbar-theme-button" onClick={toggleTheme} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <Link className="topbar-user" to={profilePath} aria-label="Open your profile"><Avatar user={user} small /></Link>
        </div>
      </header>

      <nav className="navbar-mobile" id="mobile-navbar" aria-label="Mobile navigation">
        {MOBILE_ITEMS.map((item) => {
          return renderLink(item, true);
        })}
        <button className={`mobile-nav-link mobile-more-button${mobileOpen ? ' active' : ''}`} type="button" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label="More navigation">
          <span className="mobile-more-dots" aria-hidden="true">•••</span><span className="mobile-nav-label">More</span>
        </button>
      </nav>

      {mobileOpen && (
        <div className="mobile-more-menu" role="dialog" aria-label="More navigation options">
          {[
            ...NAV_ITEMS.filter((item) => ['/notifications', '/behaviour', '/analytics'].includes(item.path)),
            ...SAFETY_ITEMS,
            { path: '/profile', icon: User, label: 'Profile' },
          ].map((item) => <div key={item.path}>{renderLink(item, true)}</div>)}
          <button className="mobile-menu-action" onClick={toggleTheme}>{theme === 'light' ? <Moon size={17} /> : <Sun size={17} />}{theme === 'light' ? 'Dark mode' : 'Light mode'}</button>
          <button className="mobile-menu-action" onClick={handleLogout}><LogOut size={17} />Log out</button>
        </div>
      )}
    </>
  );
};

export default Navbar;
