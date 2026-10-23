import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { likePost, deletePost, addComment, getComments, deleteComment, getPost, updatePost, updateComment, rewriteText } from '../../services/api';
import { getApiErrorMessage } from '../../utils/errorMessages';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, MessageCircle, Trash2, Send, MoreHorizontal, X, Edit3, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AIInterventionModal from '../AIInterventionModal';
import LiveToxicityHint from '../LiveToxicityHint';
import './Post.css';

const PostCard = ({ post, onDelete, onPostUpdated }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  const [liked, setLiked] = useState(post.is_liked || false);
  const [likesCount, setLikesCount] = useState(post.likes?.length || 0);
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState([]);
  const [commentText, setCommentText] = useState('');
  const [pendingCommentText, setPendingCommentText] = useState('');
  const [showCommentIntervention, setShowCommentIntervention] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [loadingComments, setLoadingComments] = useState(false);
  const [currentImage, setCurrentImage] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [editCaption, setEditCaption] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const editLoadingRef = useRef(false);
  const [hoverRewrite, setHoverRewrite] = useState(false);
  const [rewriteLoading, setRewriteLoading] = useState(false);
  const [rewriteSuggestion, setRewriteSuggestion] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);
  const applyLoadingRef = useRef(false);
  const rewriteFetched = useRef(false);
  const [rewriteError, setRewriteError] = useState('');

  const [activeCommentRewriteId, setActiveCommentRewriteId] = useState(null);
  const [commentRewriteSuggestion, setCommentRewriteSuggestion] = useState('');
  const [commentRewriteLoading, setCommentRewriteLoading] = useState(false);
  const [commentRewriteError, setCommentRewriteError] = useState('');
  const commentRewriteFetched = useRef(new Set());
  const [commentTooltipPos, setCommentTooltipPos] = useState({ x: 0, y: 0 });

  const getAvatarUrl = (pic, name) => {
    if (pic && (pic.startsWith('http') || pic.startsWith('data:'))) return pic;
    return `https://ui-avatars.com/api/?background=C56E5A&color=fff&name=${encodeURIComponent(name || 'User')}`;
  };

  const postId = post.id || post._id;
  const postAuthorName = post.user?.username || 'Unknown';
  const postAuthorId = post.user?.id || post.user_id;
  const postAuthorAvatar = getAvatarUrl(post.user?.profile_picture, postAuthorName);
  const currentUserId = user?.id;
  const isOwner = currentUserId && currentUserId === postAuthorId;
  const isFlagged = post.is_blurred || post.moderation_status === 'flagged';
  const isPending = post.moderation_status === 'pending';
  const isUnverified = post.moderation_status === 'unverified';

  useEffect(() => {
    if (!isPending) return undefined;

    let active = true;
    const pollModeration = async () => {
      try {
        const { data } = await getPost(postId);
        if (active && data.moderation_status !== 'pending') {
          onPostUpdated?.({ ...post, ...data });
        }
      } catch {
        // Keep the pending state visible if the status request temporarily fails.
      }
    };

    const interval = setInterval(pollModeration, 2500);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isPending, postId, post, onPostUpdated]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => {
      if (!data || data.type !== 'MODERATION_ALERT') return;
      if (data.comment_id) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === data.comment_id
              ? { ...c, is_blurred: true, moderation_status: 'flagged' }
              : c
          )
        );
      }
      if (data.post_id && data.post_id === postId) {
        const updatedPost = {
          ...post,
          is_blurred: true,
          moderation_status: 'flagged',
        };
        onPostUpdated?.(updatedPost);
      }
    };
    socket.on('MODERATION_ALERT', handler);
    return () => {
      socket.off('MODERATION_ALERT', handler);
    };
  }, [socket, postId, post, onPostUpdated]);

  const handleLike = async () => {
    try {
      const { data } = await likePost(postId);
      setLiked(data.liked);
      setLikesCount((prev) => (data.liked ? prev + 1 : prev - 1));
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not like this post.'));
    }
  };

  const handleDelete = async () => {
    try {
      await deletePost(postId);
      toast.success('Post deleted');
      onDelete?.(postId);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not delete this post.'));
    }
    setShowMenu(false);
  };

  const startEdit = () => {
    setEditCaption(post.caption || post.content || '');
    setIsEditing(true);
  };

  const handleEditSave = async () => {
    if (!editCaption.trim()) {
      toast.error('Caption cannot be empty');
      return;
    }
    if (editLoadingRef.current) return;
    editLoadingRef.current = true;
    setEditLoading(true);
    try {
      const { data } = await updatePost(postId, { caption: editCaption });
      toast.success('Post updated! Rechecking content...');
      setIsEditing(false);
      onPostUpdated?.(data);
    } catch (err) {
      console.error('Failed to update post:', err);
      toast.error(getApiErrorMessage(err, 'Could not update this post.'));
    } finally {
      editLoadingRef.current = false;
      setEditLoading(false);
    }
  };

  const cancelEdit = () => {
    setIsEditing(false);
    setEditCaption('');
  };

  const fetchRewriteSuggestion = async () => {
    if (rewriteFetched.current) return;
    rewriteFetched.current = true;
    setRewriteLoading(true);
    setRewriteError(false);
    try {
      const { data } = await rewriteText(post.caption || post.content || '');
      setRewriteSuggestion(data.suggestion || '');
    } catch (error) {
      setRewriteSuggestion('');
      setRewriteError(getApiErrorMessage(error, 'Rewrite suggestions are unavailable. Please edit manually.'));
      rewriteFetched.current = false;
    } finally {
      setRewriteLoading(false);
    }
  };

  const applyRewrite = async () => {
    if (!rewriteSuggestion.trim() || applyLoadingRef.current) return;
    applyLoadingRef.current = true;
    setApplyLoading(true);
    try {
      const response = await updatePost(postId, { caption: rewriteSuggestion });
      const data = response?.data;
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response from server');
      }
      toast.success('Post updated!');
      setHoverRewrite(false);
      setRewriteSuggestion('');
      if (typeof onPostUpdated === 'function') {
        onPostUpdated(data);
      }
    } catch (err) {
      console.error('Failed to apply suggestion:', err);
      toast.error(getApiErrorMessage(err, 'Could not apply this suggestion.'));
    } finally {
      applyLoadingRef.current = false;
      setApplyLoading(false);
    }
  };

  const handleCaptionMouseEnter = () => {
    if (!isFlagged || applyLoadingRef.current) return;
    setHoverRewrite(true);
    fetchRewriteSuggestion();
  };

  const handleCaptionMouseLeave = () => {
    setHoverRewrite(false);
  };

  const fetchCommentRewriteSuggestion = async (commentId, text) => {
    if (commentRewriteFetched.current.has(commentId)) return;
    commentRewriteFetched.current.add(commentId);
    setCommentRewriteLoading(true);
    setCommentRewriteError(false);
    try {
      const { data } = await rewriteText(text || '');
      setCommentRewriteSuggestion(data.suggestion || '');
    } catch (error) {
      setCommentRewriteSuggestion('');
      setCommentRewriteError(getApiErrorMessage(error, 'Rewrite suggestions are unavailable. Please try again.'));
      commentRewriteFetched.current.delete(commentId);
    } finally {
      setCommentRewriteLoading(false);
    }
  };

  const applyCommentRewrite = async (commentId) => {
    if (!commentRewriteSuggestion.trim() || !commentId) return;
    try {
      const response = await updateComment(commentId, { text: commentRewriteSuggestion });
      const data = response?.data;
      if (!data || typeof data !== 'object') {
        throw new Error('Invalid response from server');
      }
      toast.success('Comment updated!');
      setActiveCommentRewriteId(null);
      setCommentRewriteSuggestion('');
      setComments((prev) =>
        prev.map((c) => (c.id === commentId ? { ...data, id: data.id || c.id } : c))
      );
    } catch (err) {
      console.error('Failed to apply comment suggestion:', err);
      toast.error(getApiErrorMessage(err, 'Could not apply this suggestion.'));
    }
  };

  const handleCommentMouseEnter = (commentId, text, e) => {
    setCommentTooltipPos({ x: e.clientX, y: e.clientY });
    setActiveCommentRewriteId(commentId);
    setCommentRewriteSuggestion('');
    setCommentRewriteError(false);
    fetchCommentRewriteSuggestion(commentId, text);
  };

  const handleCommentMouseLeave = () => {
    setActiveCommentRewriteId(null);
  };

  const fetchComments = async () => {
    setLoadingComments(true);
    try {
      const { data } = await getComments(postId);
      setComments(data);
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not load comments.'));
    }
    setLoadingComments(false);
  };

  const fetchCommentsSilent = async () => {
    try {
      const { data } = await getComments(postId);
      setComments(data);
    } catch (err) {
      // silent fail
    }
  };

  const toggleComments = () => {
    if (!showComments) fetchComments();
    setShowComments(!showComments);
  };

  useEffect(() => {
    let interval;
    if (showComments && comments.some(c => c.moderation_status === 'pending')) {
      interval = setInterval(() => {
        fetchCommentsSilent();
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [showComments, comments]);

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setPendingCommentText(commentText.trim());
    setShowCommentIntervention(true);
  };

  const submitComment = async (approvedText) => {
    try {
      const { data } = await addComment(postId, { text: approvedText });
      setComments((prev) => [data, ...prev]);
      setCommentText('');
    } catch (err) {
      const isToxic = err.response?.data?.is_toxic;
      if (isToxic) {
        toast.error('Comment flagged as toxic. Please revise your words.');
      } else {
        toast.error(getApiErrorMessage(err, 'Could not add your comment.'));
      }
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await deleteComment(commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
      toast.success('Comment deleted');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not delete this comment.'));
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
        <Link to={`/profile/${postAuthorId}`} className="post-user-info">
          <img
            src={postAuthorAvatar}
            alt={postAuthorName}
            className="post-avatar"
            onError={(e) => { e.target.src = `https://ui-avatars.com/api/?background=C56E5A&color=fff&name=User`; }}
          />
          <div>
            <span className="post-username">{postAuthorName}</span>
            <span className="post-time">{formatTime(post.created_at)}</span>
          </div>
        </Link>
        {isOwner && (
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
                  {isFlagged && (
                    <button className="menu-item" onClick={startEdit}>
                      <Edit3 size={16} /> Edit Post
                    </button>
                  )}
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
      <div className="post-caption">
        {isEditing ? (
          <div className="edit-caption-area">
            <textarea
              className="edit-caption-input"
              value={editCaption}
              onChange={(e) => setEditCaption(e.target.value)}
              rows={3}
              autoFocus
            />
            <div className="edit-caption-actions">
              <button className="btn-save-caption" onClick={handleEditSave} disabled={editLoading}>
                {editLoading ? 'Saving...' : 'Save & Recheck'}
              </button>
              <button className="btn-cancel-caption" onClick={cancelEdit}>Cancel</button>
            </div>
          </div>
        ) : (
          <div
            className="caption-main"
            onMouseEnter={handleCaptionMouseEnter}
            onMouseLeave={handleCaptionMouseLeave}
          >
            <Link to={`/profile/${postAuthorId}`} className="caption-username">
              {postAuthorName}
            </Link>
            {isPending ? (
              <span className="pending-moderation-message">Post is being checked and is hidden until review finishes.</span>
            ) : (
              <span className={isFlagged ? 'blurred-text' : ''}>{post.caption || post.content}</span>
            )}
            {isFlagged && !isPending && (
              <div className="moderation-badge">
                Flagged for toxicity
                {post.toxicity_score != null && (
                  <span className="toxicity-score">Score: {(post.toxicity_score * 100).toFixed(0)}%</span>
                )}
              </div>
            )}
            {isUnverified && (
              <div className="moderation-badge unverified">Automatic safety check unavailable</div>
            )}
            <AnimatePresence>
              {hoverRewrite && isFlagged && isOwner && (
                <motion.div
                  className="rewrite-tooltip"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                >
                  <div className="rewrite-tooltip-header">
                    <Wand2 size={14} />
                    <span>AI Rewrite Suggestion</span>
                  </div>
                  {rewriteLoading ? (
                    <div className="rewrite-tooltip-body">
                      <div className="spinner small"></div>
                      <span>Generating suggestion...</span>
                    </div>
                  ) : rewriteError || !rewriteSuggestion ? (
                    <div className="rewrite-tooltip-body">
                      <p className="rewrite-text" style={{ color: 'var(--text-secondary)' }}>
                        {rewriteError || 'Could not generate a rewrite suggestion.'}
                      </p>
                    </div>
                  ) : (
                    <div className="rewrite-tooltip-body">
                      <p className="rewrite-text">{rewriteSuggestion}</p>
                    </div>
                  )}
                  {!rewriteLoading && (rewriteSuggestion || rewriteError) && (
                    <div className="rewrite-tooltip-actions">
                      {rewriteSuggestion ? (
                        <button
                          className="btn-apply-rewrite"
                          onClick={applyRewrite}
                          disabled={applyLoading}
                        >
                          {applyLoading ? 'Applying...' : 'Apply Suggestion'}
                        </button>
                      ) : (
                        <>
                          <button
                            className="btn-edit-rewrite"
                            onClick={fetchRewriteSuggestion}
                          >
                            Try again
                          </button>
                          <button
                            className="btn-edit-rewrite"
                            onClick={() => { setHoverRewrite(false); startEdit?.(); }}
                          >
                            Edit Manually
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

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
            <LiveToxicityHint text={commentText} />
            <div className="comments-list">
              {loadingComments ? (
                <div className="comments-loading">
                  <div className="spinner small"></div>
                </div>
              ) : (
                comments.map((comment) => (
                  <div key={comment.id} className="comment-item">
                    <img
                      src={getAvatarUrl(comment.user_profile_picture, comment.user_name)}
                      alt=""
                      className="comment-avatar"
                      onError={(e) => { e.target.src = `https://ui-avatars.com/api/?background=C56E5A&color=fff&name=User`; }}
                    />
                    <div className="comment-content">
                      <span className="comment-username">{comment.user_name}</span>
                      <div
                        className="caption-main"
                        onMouseEnter={(e) => {
                          if (comment.moderation_status !== 'pending' && (comment.is_blurred || comment.is_toxic)) {
                            handleCommentMouseEnter(comment.id, comment.text, e);
                          }
                        }}
                        onMouseLeave={handleCommentMouseLeave}
                      >
                        {comment.moderation_status === 'pending' ? (
                          <span className="pending-moderation-message">Comment is being checked and is hidden until review finishes.</span>
                        ) : (
                          <span className={`comment-text ${comment.is_blurred || comment.is_toxic ? 'blurred-text' : ''}`}>
                            {comment.text}
                          </span>
                        )}
                        {comment.moderation_status === 'unverified' && (
                          <div className="moderation-badge unverified">Automatic safety check unavailable</div>
                        )}
                        {comment.moderation_status !== 'pending' && comment.moderation_status !== 'unverified' && (comment.is_blurred || comment.is_toxic) && (
                          <div className="moderation-badge">Flagged for toxicity</div>
                        )}
                        <AnimatePresence>
                          {activeCommentRewriteId === comment.id && (
                            <motion.div
                              className="rewrite-tooltip"
                              initial={{ opacity: 0, y: 8 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 8 }}
                              style={{ position: 'fixed', left: commentTooltipPos.x, top: commentTooltipPos.y + 10, zIndex: 9999 }}
                            >
                              <div className="rewrite-tooltip-header">
                                <Wand2 size={14} />
                                <span>AI Rewrite Suggestion</span>
                              </div>
                              {commentRewriteLoading ? (
                                <div className="rewrite-tooltip-body">
                                  <div className="spinner small"></div>
                                  <span>Generating suggestion...</span>
                                </div>
                              ) : commentRewriteError || !commentRewriteSuggestion ? (
                                <div className="rewrite-tooltip-body">
                                  <p className="rewrite-text" style={{ color: 'var(--text-secondary)' }}>
                                    {commentRewriteError || 'Could not generate a rewrite suggestion.'}
                                  </p>
                                </div>
                              ) : (
                                <div className="rewrite-tooltip-body">
                                  <p className="rewrite-text">{commentRewriteSuggestion}</p>
                                </div>
                              )}
                              {!commentRewriteLoading && (commentRewriteSuggestion || commentRewriteError) && (
                                <div className="rewrite-tooltip-actions">
                                  {commentRewriteSuggestion ? (
                                    <button
                                      className="btn-apply-rewrite"
                                      onClick={() => applyCommentRewrite(comment.id)}
                                    >
                                      Apply Suggestion
                                    </button>
                                  ) : (
                                    <button
                                      className="btn-edit-rewrite"
                                      onClick={() => fetchCommentRewriteSuggestion(comment.id, comment.text)}
                                    >
                                      Try again
                                    </button>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
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
      <AIInterventionModal
        isOpen={showCommentIntervention}
        onClose={() => setShowCommentIntervention(false)}
        onConfirm={submitComment}
        onEdit={setCommentText}
        text={pendingCommentText}
        title="Add Comment"
        placeholder="Write a thoughtful comment..."
      />
    </motion.div>
  );
};

export default PostCard;
