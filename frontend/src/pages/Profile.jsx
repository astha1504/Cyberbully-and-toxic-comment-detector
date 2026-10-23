import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getApiErrorMessage } from '../utils/errorMessages';
import {
  getUserProfile, getFollowers, getFollowing, followUser, unfollowUser, updateProfile
} from '../services/api';
import PostCard from '../components/Post/PostCard';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Camera, UserPlus, UserMinus, Grid, MessageCircle, X, Check, Edit3
} from 'lucide-react';
import toast from 'react-hot-toast';
import './Profile.css';

const FALLBACK_AVATAR = '/placeholder-avatar.svg';

const getAvatarUrl = (pic) => {
  if (pic && (pic.startsWith('http') || pic.startsWith('data:'))) return pic;
  return FALLBACK_AVATAR;
};

const Profile = () => {
  const { userId } = useParams();
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [showEdit, setShowEdit] = useState(false);
  const [relationshipModal, setRelationshipModal] = useState('');
  const [relationshipUsers, setRelationshipUsers] = useState([]);
  const [relationshipLoading, setRelationshipLoading] = useState(false);
  const [relationshipError, setRelationshipError] = useState('');
  const [editData, setEditData] = useState({ name: '', email: '', bio: '', password: '' });

  const isOwn = (user?.id || user?._id) === userId;

  useEffect(() => {
    fetchProfile();
  }, [userId]);

  const fetchProfile = async () => {
    setLoading(true);
    setProfileError('');
    try {
      const { data } = await getUserProfile(userId);
      setProfile(data.user);
      setPosts(Array.isArray(data.posts) ? data.posts : []);
      setIsFollowing(data.is_following || false);
      setEditData({
         name: data.user?.name || data.user?.username || '',
         email: data.user?.email || '',
         bio: data.user?.bio || '',
         password: ''
       });
    } catch (err) {
      console.error('Profile fetch error:', err);
      const message = getApiErrorMessage(err, 'Could not load this profile.');
      setProfileError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
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
      toast.error(getApiErrorMessage(err, 'Could not update the follow status.'));
    }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    try {
      const payload = {};
      const currentName = profile?.name || profile?.username || '';
      if (editData.name !== currentName) payload.name = editData.name;
      if (editData.bio !== (profile?.bio || '')) payload.bio = editData.bio;
      if (editData.email !== profile?.email) payload.email = editData.email;
      if (editData.password) payload.password = editData.password;

      await updateProfile(payload);
      updateUser({ ...user, ...payload, name: editData.name, bio: editData.bio, email: editData.email });
      setProfile((p) => ({ ...p, ...payload }));
      setShowEdit(false);
      toast.success('Profile updated!');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Could not update your profile.'));
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
          toast.error(getApiErrorMessage(err, 'Could not update your profile picture.'));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeletePost = (postId) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleMessage = (person = profile) => {
    if (!person?.id) return;
    setRelationshipModal('');
    navigate(`/chat?userId=${encodeURIComponent(person.id)}`);
  };

  const openRelationshipModal = async (relationship) => {
    setRelationshipModal(relationship);
    setRelationshipUsers([]);
    setRelationshipError('');
    setRelationshipLoading(true);
    try {
      const { data } = relationship === 'followers'
        ? await getFollowers(userId)
        : await getFollowing(userId);
      setRelationshipUsers(Array.isArray(data) ? data : []);
    } catch (error) {
      setRelationshipError(getApiErrorMessage(error, `Could not load ${relationship}.`));
    } finally {
      setRelationshipLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="page-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="profile-page">
        <div className="profile-load-error" role="alert">
          <p>{profileError}</p>
          <button className="edit-profile-btn" onClick={fetchProfile}>Try again</button>
        </div>
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
               src={getAvatarUrl(profile?.profile_picture)}
               alt={profile?.username ? `${profile.username}'s profile` : 'Profile avatar'}
               className="profile-pic"
               onError={(e) => { e.target.src = FALLBACK_AVATAR; }}
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
              <h2 className="profile-name">{profile?.username}</h2>
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
                  <button className="message-btn-profile" onClick={() => handleMessage(profile)}>
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
              <button
                type="button"
                className="stat stat-button"
                onClick={() => openRelationshipModal('followers')}
                aria-label={`View ${profile?.followers || 0} followers`}
              >
                <span className="stat-number">{profile?.followers || 0}</span>
                <span className="stat-label">followers</span>
              </button>
              <button
                type="button"
                className="stat stat-button"
                onClick={() => openRelationshipModal('following')}
                aria-label={`View ${profile?.following || 0} following`}
              >
                <span className="stat-number">{profile?.following || 0}</span>
                <span className="stat-label">following</span>
              </button>
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

      {/* Followers / Following Modal */}
      <AnimatePresence>
        {relationshipModal && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setRelationshipModal('')}
          >
            <motion.div
              className="modal-content relationship-modal"
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              role="dialog"
              aria-modal="true"
              aria-labelledby="relationship-modal-title"
            >
              <div className="modal-header">
                <h3 id="relationship-modal-title">
                  {relationshipModal === 'followers' ? 'Followers' : 'Following'}
                </h3>
                <button
                  type="button"
                  className="modal-close"
                  onClick={() => setRelationshipModal('')}
                  aria-label="Close list"
                >
                  <X size={20} />
                </button>
              </div>
              <div className="relationship-list">
                {relationshipLoading ? (
                  <div className="relationship-empty">Loading people…</div>
                ) : relationshipError ? (
                  <div className="relationship-empty relationship-error" role="alert">
                    {relationshipError}
                  </div>
                ) : relationshipUsers.length === 0 ? (
                  <div className="relationship-empty">
                    No {relationshipModal} yet.
                  </div>
                ) : relationshipUsers.map((person) => (
                  <div className="relationship-person" key={person.id}>
                    <button
                      type="button"
                      className="relationship-person-profile"
                      onClick={() => {
                        setRelationshipModal('');
                        navigate(`/profile/${person.id}`);
                      }}
                    >
                      <img
                        src={getAvatarUrl(person.profile_picture)}
                        alt=""
                        className="relationship-avatar"
                        onError={(event) => { event.currentTarget.src = FALLBACK_AVATAR; }}
                      />
                      <span className="relationship-person-info">
                        <strong>{person.username || 'Unknown user'}</strong>
                        {person.name && person.name !== person.username && <small>{person.name}</small>}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="relationship-message-btn"
                      onClick={() => handleMessage(person)}
                    >
                      <MessageCircle size={15} /> Message
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
