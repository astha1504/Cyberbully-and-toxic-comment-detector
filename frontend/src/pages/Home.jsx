import { useState, useEffect } from 'react';
import { getPosts, getSuggestions, followUser } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/Post/PostCard';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import './Home.css';

const FALLBACK_AVATAR = 'https://ui-avatars.com/api/?background=C56E5A&color=fff&name=User';

const Home = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [postsRes, suggestionsRes] = await Promise.all([
        getPosts(),
        getSuggestions(),
      ]);
      // API returns arrays directly
      const postsData = Array.isArray(postsRes.data) ? postsRes.data : [];
      const suggestionsData = Array.isArray(suggestionsRes.data) ? suggestionsRes.data : [];
      setPosts(postsData);
      setSuggestions(suggestionsData);
    } catch (err) {
      console.error('Feed fetch error:', err);
      setError('Failed to load feed. Please check your connection.');
      toast.error('Failed to load feed');
    }
    setLoading(false);
  };

  const handleDeletePost = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleFollow = async (userId) => {
    try {
      await followUser(userId);
      setSuggestions((prev) => prev.filter((s) => s.id !== userId));
      toast.success('Followed!');
    } catch (err) {
      console.error('Follow error:', err);
      toast.error('Failed to follow');
    }
  };

  const getAvatarUrl = (profilePicture, name) => {
    if (profilePicture && profilePicture.startsWith('http')) return profilePicture;
    const displayName = name || 'User';
    return `https://ui-avatars.com/api/?background=C56E5A&color=fff&name=${encodeURIComponent(displayName)}`;
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="page-loading">
        <div style={{ textAlign: 'center', color: '#C56E5A' }}>
          <p>{error}</p>
          <button onClick={fetchData} style={{ marginTop: '1rem', padding: '0.5rem 1.5rem', borderRadius: '8px', background: '#C56E5A', color: '#fff', border: 'none', cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <div className="feed-container">
        <div className="feed-main">
          {posts.length === 0 ? (
            <div className="empty-feed">
              <div className="empty-icon">📷</div>
              <h3>No Posts Yet</h3>
              <p>Follow some people or create your first post!</p>
              <Link to="/create" className="create-first-btn">Create Post</Link>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard key={post.id} post={post} onDelete={handleDeletePost} />
            ))
          )}
        </div>

        {/* Sidebar - User & Suggestions */}
        <div className="feed-sidebar">
          <div className="sidebar-user">
            <Link to={`/profile/${user?.id}`} className="sidebar-user-info">
              <img
                src={getAvatarUrl(user?.profile_picture, user?.name)}
                alt={user?.name || 'You'}
                className="sidebar-avatar"
                onError={(e) => { e.target.src = FALLBACK_AVATAR; }}
              />
              <div>
                <span className="sidebar-name">{user?.name || user?.username || 'You'}</span>
                <span className="sidebar-email">{user?.email}</span>
              </div>
            </Link>
          </div>

          {suggestions.length > 0 && (
            <div className="suggestions-section">
              <div className="suggestions-header">
                <span className="suggestions-title">Suggested for you</span>
              </div>
              <div className="suggestions-list">
                {suggestions.slice(0, 3).map((s) => (
                  <motion.div
                    key={s.id}
                    className="suggestion-item"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Link to={`/profile/${s.id}`} className="suggestion-info">
                      <img
                        src={getAvatarUrl(s.profile_picture, s.name || s.username)}
                        alt={s.name || s.username}
                        className="suggestion-avatar"
                        onError={(e) => { e.target.src = FALLBACK_AVATAR; }}
                      />
                      <div>
                        <span className="suggestion-name">{s.name || s.username}</span>
                        <span className="suggestion-bio">
                          {s.bio || 'New to Socialite'}
                        </span>
                      </div>
                    </Link>
                    <button
                      className="follow-btn-small"
                      onClick={() => handleFollow(s.id)}
                    >
                      <UserPlus size={14} />
                      Follow
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;
