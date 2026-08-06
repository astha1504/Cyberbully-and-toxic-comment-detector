import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUserBehaviour } from '../services/api';
import { motion } from 'framer-motion';
import {
  UserX, Shield, AlertTriangle, Edit3, Clock, Ban,
  TrendingUp, Activity
} from 'lucide-react';
import toast from 'react-hot-toast';
import './UserBehaviour.css';

const UserBehaviour = () => {
  const { user } = useAuth();
  const [behaviour, setBehaviour] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBehaviour();
  }, []);

  const fetchBehaviour = async () => {
    setLoading(true);
    try {
      const { data } = await getUserBehaviour();
      setBehaviour(data);
    } catch {
      toast.error('Failed to load behaviour data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="behaviour-page">
        <div className="behaviour-loading">
          <div className="spinner"></div>
          <p>Loading your behaviour profile…</p>
        </div>
      </div>
    );
  }

  const safeComments = Math.max(0, (behaviour?.toxic_comments || 0) * 5);
  const totalEstimated = safeComments + (behaviour?.toxic_comments || 0) + (behaviour?.edited_comments || 0) || 1;
  const safeRate = Math.round((safeComments / totalEstimated) * 100);

  const isMuted = behaviour?.mute_until && new Date(behaviour.mute_until) > new Date();

  const statCards = [
    { label: 'Warnings', value: behaviour?.warning_count || 0, icon: AlertTriangle, color: '#f59e0b' },
    { label: 'Toxic Comments', value: behaviour?.toxic_comments || 0, icon: UserX, color: '#ef4444' },
    { label: 'Edited Comments', value: behaviour?.edited_comments || 0, icon: Edit3, color: '#3b82f6' },
    { label: 'Bans', value: behaviour?.ban_count || 0, icon: Ban, color: '#991b1b' },
    { label: 'Risk Score', value: behaviour?.risk_score ?? 0, icon: Activity, color: '#8b5cf6' },
    { label: 'Safety Rate', value: `${safeRate}%`, icon: Shield, color: '#10b981' },
  ];

  return (
    <div className="behaviour-page">
      <motion.div
        className="behaviour-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="behaviour-title-group">
          <Activity size={24} color="var(--primary)" />
          <div>
            <h1 className="behaviour-title">My Behaviour Profile</h1>
            <p className="behaviour-subtitle">Track your moderation history and community standing</p>
          </div>
        </div>
        <button className="behaviour-refresh-btn" onClick={fetchBehaviour}>
          <TrendingUp size={16} />
          Refresh
        </button>
      </motion.div>

      {isMuted && (
        <motion.div
          className="mute-banner"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Clock size={20} />
          <div>
            <strong>You are currently muted</strong>
            <p>You cannot post or comment until {new Date(behaviour.mute_until).toLocaleString()}</p>
          </div>
        </motion.div>
      )}

      <div className="behaviour-stats-grid">
        {statCards.map((card, i) => (
          <motion.div
            key={card.label}
            className="behaviour-stat-card"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <div className="behaviour-stat-icon" style={{ background: card.color }}>
              <card.icon size={24} color="#fff" />
            </div>
            <div className="behaviour-stat-info">
              <span className="behaviour-stat-value">{card.value}</span>
              <span className="behaviour-stat-label">{card.label}</span>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        className="behaviour-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <h3 className="behaviour-card-title">Safety Tips</h3>
        <ul className="behaviour-tips">
          <li>Keep your comments respectful and constructive</li>
          <li>Edit messages flagged by AI instead of posting anyway</li>
          <li>Use the AI rewrite assistant to improve your tone</li>
          <li>Repeated violations will result in temporary mutes</li>
          <li>Severe or repeated abuse leads to account bans</li>
        </ul>
      </motion.div>
    </div>
  );
};

export default UserBehaviour;
