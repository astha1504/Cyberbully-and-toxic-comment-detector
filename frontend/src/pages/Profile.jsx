import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfile, followUser, unfollowUser, updateProfile
} from '../services/api';
import PostCard from '../components/Post/PostCard';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Camera, UserPlus, UserMinus, Grid, MessageCircle, X, Check, Edit3
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Profile.css';

const Profile = () => {
  const { userId } = useParams();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showEdit, setShowEdit] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [editData, setEditData] = useState({ name: '', email: '', bio: '', password: '' });

  const isOwn = user?.id === userId;

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setLoading(true);
    try {
      const { data } = await getUserProfile(userId);
      setProfile(data.user);
      setPosts(data.posts || []);
      setIsFollowing(data.is_following);
      setEditData({
        name: data.user.name,
        email: data.user.email || '',
        bio: data.user.bio || '',
        password: ''
      });
    } catch (err) {
      toast.error('Failed to load profile');
    }
    setLoading(false);
  };

  const handleFollow = async () => {
    try {
      if (isFollowing) {
        await unfollowUser(userId);
        setIsFollowing(false);
        setProfile((p) => ({ ...p, followers: p.followers - 1 }));
      } else {
        await followUser(userId);
        setIsFollowing(true);
        setProfile((p) => ({ ...p, followers: p.followers + 1 }));
      }
    } catch (err) {
      toast.error('Action failed');
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = {};
      if (editData.name !== profile.name) payload.name = editData.name;
      if (editData.bio !== profile.bio) payload.bio = editData.bio;
      if (editData.email !== profile.email) payload.email = editData.email;
      if (editData.password) payload.password = editData.password;

      await updateProfile(payload);
      updateUser({ ...user, name: editData.name, bio: editData.bio, email: editData.email });
      setProfile((p) => ({ ...p, ...payload }));
      setShowEdit(false);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error('Failed to update profile');
    }
  };

  const handleProfilePicChange = async (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        try {
          await updateProfile({ profile_picture: reader.result });
          setProfile((p) => ({ ...p, profile_picture: reader.result }));
          updateUser({ ...user, profile_picture: reader.result });
          toast.success('Profile picture updated!');
        } catch (err) {
          toast.error('Failed to update picture');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeletePost = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleMessage = async () => {
    navigate('/chat');
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="profile-page">
      <motion.div
        className="profile-container"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        {/* Profile Header */}
        <div className="profile-header">
          <div className="profile-pic-wrapper">
            <img
              src={profile?.profile_picture}
              alt={profile?.name}
              className="profile-pic"
            />
            {isOwn && (
              <label className="pic-change-btn" htmlFor="profile-pic-input">
                <Camera size={16} />
                <input
                  id="profile-pic-input"
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={handleProfilePicChange}
                />
              </label>
            )}
          </div>

          <div className="profile-info">
            <div className="profile-name-row">
              <h2 className="profile-name">{profile?.name}</h2>
              {isOwn ? (
                <button
                  className="edit-profile-btn"
                  onClick={() => setShowEdit(true)}
                  id="edit-profile-btn"
                >
                  <Edit3 size={16} />
                  Edit Profile
                </button>
              ) : (
                <div className="profile-actions">
                  <motion.button
                    className={`follow-btn ${isFollowing ? 'following' : ''}`}
                    onClick={handleFollow}
                    whileTap={{ scale: 0.95 }}
                  >
                    {isFollowing ? (
                      <><UserMinus size={16} /> Unfollow</>
                    ) : (
                      <><UserPlus size={16} /> Follow</>
                    )}
                  </motion.button>
                  <button className="message-btn-profile" onClick={handleMessage}>
                    <MessageCircle size={16} /> Message
                  </button>
                </div>
              )}
            </div>

            <div className="profile-stats">
              <div className="stat">
                <span className="stat-number">{posts.length}</span>
                <span className="stat-label">posts</span>
              </div>
              <div className="stat">
                <span className="stat-number">{profile?.followers || 0}</span>
                <span className="stat-label">followers</span>
              </div>
              <div className="stat">
                <span className="stat-number">{profile?.following || 0}</span>
                <span className="stat-label">following</span>
              </div>
            </div>

            {profile?.bio && (
              <p className="profile-bio">{profile.bio}</p>
            )}
          </div>
        </div>

        {/* Posts Grid */}
        <div className="profile-divider">
          <button className="tab active">
            <Grid size={14} /> Posts
          </button>
        </div>

        {posts.length === 0 ? (
          <div className="no-posts">
            <div className="no-posts-icon">📷</div>
            <h3>{isOwn ? 'Share your first post' : 'No posts yet'}</h3>
          </div>
        ) : (
          <div className="posts-grid">
            {posts.map((post) => (
              <motion.div
                key={post.id}
                className="grid-post"
                whileHover={{ opacity: 0.85 }}
                onClick={() => {}}
              >
                {post.images?.[0] ? (
                  <img src={post.images[0]} alt="" className="grid-post-image" />
                ) : (
                  <div className="grid-post-text">
                    <p>{post.caption}</p>
                  </div>
                )}
                <div className="grid-post-overlay">
                  <span>❤️ {post.likes_count || 0}</span>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Edit Profile Modal */}
      <AnimatePresence>
        {showEdit && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowEdit(false)}
          >
            <motion.div
              className="modal-content"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="modal-header">
                <h3>Edit Profile</h3>
                <button className="modal-close" onClick={() => setShowEdit(false)}>
                  <X size={20} />
                </button>
              </div>
              <form className="edit-form" onSubmit={handleEdit}>
                <div className="edit-field">
                  <label>Name</label>
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                  />
                </div>
                <div className="edit-field">
                  <label>Bio</label>
                  <textarea
                    value={editData.bio}
                    onChange={(e) => setEditData({ ...editData, bio: e.target.value })}
                    rows={3}
                    placeholder="Tell the world about yourself..."
                  />
                </div>
                <div className="edit-field">
                  <label>Email</label>
                  <input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                  />
                </div>
                <div className="edit-field">
                  <label>New Password (leave blank to keep current)</label>
                  <input
                    type="password"
                    value={editData.password}
                    onChange={(e) => setEditData({ ...editData, password: e.target.value })}
                    placeholder="Enter new password"
                  />
                </div>
                <button type="submit" className="save-btn">
                  <Check size={18} /> Save Changes
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default Profile;
