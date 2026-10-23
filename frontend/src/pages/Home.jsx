import { useState, useEffect } from 'react';
import { getPosts, getSuggestions, followUser } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { useAuth } from '../context/AuthContext';
import PostCard from '../components/Post/PostCard';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight, Plus, ShieldCheck, Sparkles, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import './Home.css';

const FALLBACK_AVATAR = '/placeholder-avatar.svg';

const Home = () => {
  const { user } = useAuth();
  const location = useLocation();
  const [posts, setPosts] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    const newPost = location.state?.newPost;
    if (newPost) {
      setPosts((prev) => {
        const exists = prev.some((p) => p.id === newPost.id);
        return exists ? prev : [newPost, ...prev];
      });
    }
  }, [location.state]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const postsRes = await getPosts({ limit: 20, skip: 0 });
      let suggestionsRes = { data: [] };
      try {
        suggestionsRes = await getSuggestions();
      } catch (err) {
        console.warn('Suggestions not available:', err.message);
      }
      // API returns arrays directly
      const postsData = Array.isArray(postsRes.data) ? postsRes.data : [];
      const suggestionsData = Array.isArray(suggestionsRes.data) ? suggestionsRes.data : [];
      setPosts(postsData);
      setSuggestions(suggestionsData);
    } catch (err) {
      console.error('Feed fetch error:', err);
      const message = getApiErrorMessage(err, 'Could not load the feed.');
      setError(message);
      toast.error(message);
    }
    setLoading(false);
  };

  const handleDeletePost = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handlePostUpdated = (updatedPost) => {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));
  };

  const handleFollow = async (userId) => {
    try {
      await followUser(userId);
      setSuggestions((prev) => prev.filter((s) => s.id !== userId));
      toast.success('Followed!');
    } catch (err) {
      console.error('Follow error:', err);
      toast.error(getApiErrorMessage(err, 'Could not follow this person.'));
    }
  };

  const getAvatarUrl = (profilePicture) => {
    if (profilePicture && profilePicture.startsWith('http')) return profilePicture;
    return FALLBACK_AVATAR;
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
        <div className="home-load-error">
          <p>{error}</p>
          <button onClick={fetchData} className="home-retry-button">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="home-page">
      <section className="home-welcome">
        <div className="home-welcome-copy">
          <span className="home-eyebrow"><Sparkles size={14} /> PEHRA COMMUNITY</span>
          <h1>Make room for better conversations.</h1>
          <p>Share what matters, connect with your community, and keep care at the heart of every interaction.</p>
        </div>
        <div className="home-welcome-actions">
          <Link to="/create" className="home-primary-action"><Plus size={17} /> Start a post</Link>
          <Link to="/safety" className="home-secondary-action"><ShieldCheck size={17} /> Check a message <ArrowUpRight size={14} /></Link>
        </div>
        <div className="home-welcome-orb home-welcome-orb-one" />
        <div className="home-welcome-orb home-welcome-orb-two" />
      </section>

      <Link to="/safety" className="home-safety-strip">
        <span className="home-safety-icon"><ShieldCheck size={19} /></span>
        <span className="home-safety-copy"><strong>Unsure about a message?</strong><small>Check a suspicious text, screenshot, or voice note in the Safety Center.</small></span>
        <ArrowUpRight size={17} />
      </Link>

      <div className="home-feed-title-row">
        <div><span className="home-section-kicker">YOUR COMMUNITY</span><h2>Community feed</h2></div>
        <Link to="/create" className="home-feed-create"><Plus size={15} /> New post</Link>
      </div>
      <div className="feed-container">
        <div className="feed-main">
          {posts.length === 0 ? (
            <div className="empty-feed">
              <div className="empty-icon"><Sparkles size={22} /></div>
              <span className="home-section-kicker">A FRESH START</span>
              <h3>Your feed is ready for a first hello.</h3>
              <p>Follow people whose ideas you value, or share something with your community.</p>
              <Link to="/create" className="create-first-btn">Create your first post <ArrowUpRight size={15} /></Link>
            </div>
          ) : (
            posts.map((post) => (
              <PostCard key={post.id} post={post} onDelete={handleDeletePost} onPostUpdated={handlePostUpdated} />
            ))
          )}
        </div>

        {/* Sidebar - User & Suggestions */}
        <div className="feed-sidebar">
          <div className="sidebar-user">
<Link to={`/profile/${user?.id}`} className="sidebar-user-info">
               <img
                 src={getAvatarUrl(user?.profile_picture, user?.username)}
                 alt={user?.username || 'You'}
                 className="sidebar-avatar"
                 onError={(e) => { e.target.src = FALLBACK_AVATAR; }}
               />
               <div>
                 <span className="sidebar-name">{user?.username || 'You'}</span>
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
                         src={getAvatarUrl(s.profile_picture, s.username)}
                         alt={s.username}
                         className="suggestion-avatar"
                         onError={(e) => { e.target.src = FALLBACK_AVATAR; }}
                       />
                       <div>
                         <span className="suggestion-name">{s.username}</span>
                        <span className="suggestion-bio">
                          {s.bio || 'New to Pehra'}
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
