import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { likePost, deletePost, addComment, getComments, deleteComment, checkToxicity } from '../../services/api';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Trash2, Send, MoreHorizontal, X } from 'lucide-react';
import toast from 'react-hot-toast';
import './Post.css';

const PostCard = ({ post, onDelete }) => {
  const { user } = useAuth();
  const [liked, setLiked] = useState(post.is_liked);
  const [likesCount, setLikesCount] = useState(post.likes?.length || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [showMenu, setShowMenu] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);

  const handleLike = async () => {
    try {
      const { data } = await likePost(post.id);
      setLiked(data.liked);
      setLikesCount((prev) => (data.liked ? prev + 1 : prev - 1));
    } catch (err) {
      toast.error('Failed to like post');
    }
  };

  const handleDelete = async () => {
    try {
      await deletePost(post.id);
      toast.success('Post deleted');
      onDelete?.(post.id);
    } catch (err) {
      toast.error('Failed to delete post');
    }
    setShowMenu(false);
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data } = await getComments(post.id);
      setComments(data);
    } catch (err) {
      toast.error('Failed to load comments');
    }
    setLoadingComments(false);
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments(!showComments);
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    try {
      const { data } = await addComment(post.id, { content: commentText });
      if (data.is_toxic === false) {
        setComments((prev) => [data, ...prev]);
        setCommentText('');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || 'Failed to add comment';
      const isToxic = err.response?.data?.is_toxic;
      if (isToxic) {
        toast.error('Comment flagged as toxic. Please revise your words.');
      } else {
        toast.error(errorMsg);
      }
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success('Comment deleted');
    } catch (err) {
      toast.error('Failed to delete comment');
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <motion.div
      className="post-card"
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -15 }}
      transition={{ duration: 0.3 }}
    >
      {/* Header */}
      <div className="post-header">
        <Link to={`/profile/${post.user?.id}`} className="post-user-info">
          <img
            src={post.user?.profile_picture}
            alt={post.user?.name}
            className="post-avatar"
          />
          <div>
            <span className="post-username">{post.user?.name}</span>
            <span className="post-time">{formatTime(post.created_at)}</span>
          </div>
        </Link>
        {user?.id === post.user?.id && (
          <div className="post-menu-wrapper">
            <button className="post-menu-btn" onClick={() => setShowMenu(!showMenu)}>
              <MoreHorizontal size={20} />
            </button>
            <AnimatePresence>
              {showMenu && (
                <motion.div
                  className="post-menu"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                >
                  <button className="menu-item danger" onClick={handleDelete}>
                    <Trash2 size={16} /> Delete Post
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Image(s) */}
      {post.images?.length > 0 && (
        <div className="post-images">
          <img
            src={post.images[currentImage]}
            alt="Post"
            className="post-image"
            onDoubleClick={handleLike}
          />
          {post.images.length > 1 && (
            <div className="image-dots">
              {post.images.map((_, i) => (
                <button
                  key={i}
                  className={`dot ${i === currentImage ? 'active' : ''}`}
                  onClick={() => setCurrentImage(i)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="post-actions">
        <div className="action-left">
          <motion.button
            className={`action-btn like-btn ${liked ? 'liked' : ''}`}
            onClick={handleLike}
            whileTap={{ scale: 0.85 }}
          >
            <Heart size={22} fill={liked ? '#ed4956' : 'none'} />
          </motion.button>
          <button className="action-btn" onClick={toggleComments}>
            <MessageCircle size={22} />
          </button>
        </div>
      </div>

      {/* Likes */}
      <div className="post-likes">
        <span>{likesCount} {likesCount === 1 ? 'like' : 'likes'}</span>
      </div>

      {/* Caption */}
      {post.caption && (
        <div className="post-caption">
          <Link to={`/profile/${post.user?.id}`} className="caption-username">
            {post.user?.name}
          </Link>
          <span>{post.caption}</span>
        </div>
      )}

      {/* Comments count */}
      {post.comments_count > 0 && !showComments && (
        <button className="view-comments-btn" onClick={toggleComments}>
          View all {post.comments_count} comments
        </button>
      )}

      {/* Comments Section */}
      <AnimatePresence>
        {showComments && (
          <motion.div
            className="comments-section"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <form className="comment-form" onSubmit={handleAddComment}>
              <input
                type="text"
                placeholder="Add a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="comment-input"
              />
              <button
                type="submit"
                className="comment-submit"
                disabled={!commentText.trim()}
              >
                <Send size={18} />
              </button>
            </form>
            <div className="comments-list">
              {loadingComments ? (
                <div className="comments-loading">
                  <div className="spinner small"></div>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="comment-item">
                    <img
                      src={comment.user_profile_picture}
                      alt=""
                      className="comment-avatar"
                    />
                    <div className="comment-content">
                      <span className="comment-username">{comment.user_name}</span>
                      <span className="comment-text">{comment.content}</span>
                    </div>
                    {(comment.user_id === user?.id) && (
                      <button
                        className="comment-delete"
                        onClick={() => handleDeleteComment(comment.id)}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

export default PostCard;
