import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Heart, MessageCircle, UserPlus, Bell, AlertTriangle } from 'lucide-react';
import { markNotifRead } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { formatRelativeTime } from '../utils/dateTime';
import toast from 'react-hot-toast';
import './NotificationCard.css';

const iconMap = {
  like:    { Icon: Heart,         color: '#286A5D' },
  comment: { Icon: MessageCircle, color: '#287252' },
  follow:  { Icon: UserPlus,      color: '#527D6B' },
  MODERATION_ALERT: { Icon: AlertTriangle, color: '#FF3B30' },
  default: { Icon: Bell,          color: '#6B7280' },
};

const NotificationCard = ({ notif, onRead }) => {
  const { Icon, color } = iconMap[notif.type] || iconMap.default;

  const handleClick = async () => {
    if (!notif.is_read) {
      try {
        await markNotifRead(notif.id);
        onRead?.(notif.id);
      } catch (error) {
        toast.error(getApiErrorMessage(error, 'Could not mark this notification as read.'));
      }
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
            src={notif.actor_profile_picture || '/placeholder-avatar.svg'}
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
          <span className="notif-time">{formatRelativeTime(notif.created_at)}</span>
        </div>
      </div>
    </motion.div>
  );
};

export default NotificationCard;
