"use client";
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellOff, Check, CheckCheck, RefreshCw } from 'lucide-react';
import { getNotifications, markAllNotifsRead } from '../services/api';
import NotificationCard from '../components/NotificationCard';
import toast from 'react-hot-toast';
import './Notifications.css';

const TABS = ['All', 'Unread', 'Likes', 'Comments', 'Follows'];

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('All');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { data } = await getNotifications();
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      // Backend may not have mock data yet; show empty state
      setNotifications([]);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
    toast.success('Refreshed!');
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotifsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      toast.success('All marked as read');
    } catch {
      toast.error('Failed to mark all as read');
    }
  };

  const handleRead = (id) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
    );
  };

  const filtered = notifications.filter((n) => {
    if (activeTab === 'All')      return true;
    if (activeTab === 'Unread')   return !n.is_read;
    if (activeTab === 'Likes')    return n.type === 'like';
    if (activeTab === 'Comments') return n.type === 'comment';
    if (activeTab === 'Follows')  return n.type === 'follow';
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="notifs-page">
      {/* Header */}
      <div className="notifs-header">
        <div className="notifs-title-row">
          <div className="notifs-title-group">
            <Bell size={22} color="var(--primary)" />
            <h1 className="notifs-title">Notifications</h1>
            {unreadCount > 0 && (
              <span className="notifs-count-badge">{unreadCount} new</span>
            )}
          </div>
          <div className="notifs-actions">
            <button
              className="notifs-action-btn"
              onClick={handleRefresh}
              disabled={refreshing}
              title="Refresh"
            >
              <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
            </button>
            {unreadCount > 0 && (
              <button
                className="notifs-action-btn primary"
                onClick={handleMarkAllRead}
                title="Mark all as read"
              >
                <CheckCheck size={16} />
                <span>Mark all read</span>
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="notifs-tabs" role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={`notifs-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab}
              {tab === 'Unread' && unreadCount > 0 && (
                <span className="tab-badge">{unreadCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="notifs-content">
        {loading ? (
          <div className="notifs-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="notif-skeleton">
                <div className="skeleton-circle" />
                <div className="skeleton-lines">
                  <div className="skeleton-line long" />
                  <div className="skeleton-line short" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <motion.div
            className="notifs-empty"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="notifs-empty-icon">
              <BellOff size={40} color="var(--muted)" />
            </div>
            <h3>No notifications yet</h3>
            <p>
              {activeTab === 'Unread'
                ? "You're all caught up! 🎉"
                : "When someone likes or comments on your posts, you'll see it here."}
            </p>
          </motion.div>
        ) : (
          <motion.div
            className="notifs-list"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: { transition: { staggerChildren: 0.05 } },
            }}
          >
            <AnimatePresence>
              {filtered.map((notif) => (
                <NotificationCard
                  key={notif.id}
                  notif={notif}
                  onRead={handleRead}
                />
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
