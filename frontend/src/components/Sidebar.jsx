import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus, TrendingUp, Flame } from 'lucide-react';
import { getSuggestions, followUser } from '../services/api';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import './Sidebar.css';

const Sidebar = () => {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState([]);

  useEffect(() => {
    getSuggestions()
      .then(({ data }) => setSuggestions(data?.slice(0, 5) || []))
      .catch(() => {});
  }, []);

  const handleFollow = async (userId) => {
    try {
      await followUser(userId);
      setSuggestions((prev) => prev.filter((s) => s.id !== userId));
      toast.success('Followed!');
    } catch {
      toast.error('Failed to follow');
    }
  };

  const trending = [
    { tag: '#ToxicFree', posts: '12.4K' },
    { tag: '#SafeSpace', posts: '8.9K' },
    { tag: '#AIModeration', posts: '6.2K' },
    { tag: '#PositiveVibes', posts: '4.8K' },
    { tag: '#Community', posts: '3.1K' },
  ];

  return (
    <aside className="sidebar-container">
      {/* Current user */}
      {user && (
        <div className="sidebar-user-card">
          <Link to={`/profile/${user.id}`} className="sidebar-user-row">
            <img
              src={user.profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.name}`}
              alt={user.name}
              className="sidebar-avatar"
            />
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{user.name}</span>
              <span className="sidebar-user-email">{user.email}</span>
            </div>
          </Link>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="sidebar-section">
          <div className="sidebar-section-header">
            <span>Suggested for you</span>
            <Link to="/explore" className="sidebar-see-all">See all</Link>
          </div>
          <div className="sidebar-suggestions">
            {suggestions.map((s, i) => (
              <motion.div
                key={s.id}
                className="sidebar-suggestion-row"
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.07 }}
              >
                <Link to={`/profile/${s.id}`} className="sidebar-suggestion-info">
                  <img
                    src={s.profile_picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.name}`}
                    alt={s.name}
                    className="sidebar-suggestion-avatar"
                  />
                  <div>
                    <span className="sidebar-suggestion-name">{s.name}</span>
                    <span className="sidebar-suggestion-bio">{s.bio || 'New to Socialite'}</span>
                  </div>
                </Link>
                <button
                  className="sidebar-follow-btn"
                  onClick={() => handleFollow(s.id)}
                >
                  <UserPlus size={13} />
                  Follow
                </button>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* Trending */}
      <div className="sidebar-section">
        <div className="sidebar-section-header">
          <span><Flame size={14} style={{ display:'inline', marginRight:6, color:'var(--primary)' }} />Trending</span>
        </div>
        <div className="sidebar-trending">
          {trending.map((t, i) => (
            <motion.div
              key={t.tag}
              className="sidebar-trend-item"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: i * 0.05 + 0.2 }}
            >
              <span className="sidebar-trend-tag">{t.tag}</span>
              <span className="sidebar-trend-count"><TrendingUp size={11} /> {t.posts} posts</span>
            </motion.div>
          ))}
        </div>
      </div>

      <p className="sidebar-footer">© 2026 Socialite · Privacy · Terms</p>
    </aside>
  );
};

export default Sidebar;
