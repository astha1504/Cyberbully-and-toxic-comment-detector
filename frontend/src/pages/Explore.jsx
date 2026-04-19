import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { searchUsers } from '../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X } from 'lucide-react';
import './Explore.css';

const Explore = () => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (query.length > 0) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        performSearch(query);
      }, 300);
    } else {
      setResults([]);
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const performSearch = async (q) => {
    setLoading(true);
    try {
      const { data } = await searchUsers(q);
      setResults(data);
    } catch (err) {
      setResults([]);
    }
    setLoading(false);
  };

  return (
    <div className="explore-page">
      <div className="explore-container">
        <div className="explore-search-wrapper">
          <div className="explore-search-bar">
            <Search size={20} className="explore-search-icon" />
            <input
              type="text"
              placeholder="Search people..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="explore-search-input"
              id="explore-search"
              autoFocus
            />
            {query && (
              <button className="clear-search" onClick={() => setQuery('')}>
                <X size={16} />
              </button>
            )}
          </div>
        </div>

        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              className="explore-results"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {results.map((user, index) => (
                <motion.div
                  key={user.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                >
                  <Link to={`/profile/${user.id}`} className="result-item">
                    <img
                      src={user.profile_picture}
                      alt={user.name}
                      className="result-avatar"
                    />
                    <div className="result-info">
                      <span className="result-name">{user.name}</span>
                      <span className="result-bio">{user.bio || 'Socialite user'}</span>
                    </div>
                    {user.is_following && (
                      <span className="following-tag">Following</span>
                    )}
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {query && results.length === 0 && !loading && (
          <div className="no-results">
            <p>No users found for "{query}"</p>
          </div>
        )}

        {loading && (
          <div className="explore-loading">
            <div className="spinner"></div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Explore;
