import { useState, useEffect } from 'react';
import { getPosts, getSuggestions, followUser } from '../services/api';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/Post/PostCard';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import './Home.css';

const Home = () => {
  const { user } = useAuth();
  const [posts, setPosts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [postsRes, suggestionsRes] = await Promise.all([
        getPosts(),
        getSuggestions(),
      ]);
      setPosts(postsRes.data);
      setSuggestions(suggestionsRes.data);
    } catch (err) {
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
      toast.error('Failed to follow');
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
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

        {/* Sidebar - Suggestions */}
        <div className="feed-sidebar">
          <div className="sidebar-user">
            <Link to={`/profile/${user?.id}`} className="sidebar-user-info">
              <img
                src={user?.profile_picture}
                alt={user?.name}
                className="sidebar-avatar"
              />
              <div>
                <span className="sidebar-name">{user?.name}</span>
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
                {suggestions.map((s) => (
                  <motion.div
                    key={s.id}
                    className="suggestion-item"
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Link to={`/profile/${s.id}`} className="suggestion-info">
                      <img
                        src={s.profile_picture}
                        alt={s.name}
                        className="suggestion-avatar"
                      />
                      <div>
                        <span className="suggestion-name">{s.name}</span>
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
