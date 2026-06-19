import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, Bell, AlertTriangle } from 'lucide-react';
import { markNotifRead } from '../services/api';
import './NotificationCard.css';

const iconMap = {
  like:    { Icon: Heart,         color: '#C56E5A' },
  comment: { Icon: MessageCircle, color: '#8FA68E' },
  follow:  { Icon: UserPlus,      color: '#D4A373' },
  MODERATION_ALERT: { Icon: AlertTriangle, color: '#FF3B30' },
  default: { Icon: Bell,          color: '#6B7280' },
};

const NotificationCard = ({ notif, onRead }) => {
  const { Icon, color } = iconMap[notif.type] || iconMap.default;

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const ms = Date.now() - new Date(dateStr).getTime();
    const m  = Math.floor(ms / 60000);
    const h  = Math.floor(ms / 3600000);
    const d  = Math.floor(ms / 86400000);
    if (m  < 1)  return 'Just now';
    if (m  < 60) return `${m}m ago`;
    if (h  < 24) return `${h}h ago`;
    if (d  < 7)  return `${d}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const handleClick = async () => {
    if (!notif.is_read) {
      try {
        await markNotifRead(notif.id);
        onRead?.(notif.id);
      } catch { /* silent */ }
    }
  };

  return (
    <motion.div
      className={`notif-card ${notif.is_read ? 'read' : 'unread'}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 20 }}
      onClick={handleClick}
    >
      {/* Unread dot */}
      {!notif.is_read && <span className="notif-unread-dot" />}

      {/* Icon */}
      <div className="notif-icon-wrap" style={{ background: `${color}18` }}>
        <Icon size={18} color={color} />
      </div>

      {/* Avatar + Text */}
      <div className="notif-body">
        <Link
          to={`/profile/${notif.actor_id}`}
          className="notif-avatar-link"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={
              notif.actor_profile_picture ||
              `https://api.dicebear.com/7.x/avataaars/svg?seed=${notif.actor_name || 'System'}`
            }
            alt={notif.actor_name || 'System'}
            className="notif-avatar"
          />
        </Link>
        <div className="notif-text-block">
          <p className="notif-message">
            <Link
              to={notif.actor_id ? `/profile/${notif.actor_id}` : '#'}
              className="notif-actor-name"
              onClick={(e) => e.stopPropagation()}
            >
              {notif.actor_name || 'System'}
            </Link>{' '}
            {notif.message || notif.content}
          </p>
          <span className="notif-time">{formatTime(notif.created_at)}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default NotificationCard;
