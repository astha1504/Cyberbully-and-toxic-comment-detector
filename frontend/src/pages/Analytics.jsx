import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  AlertTriangle, ShieldCheck, MessageSquare,
  TrendingUp, TrendingDown, RefreshCw, BarChart2
} from 'lucide-react';
import { getAnalyticsOverview, getToxicComments, getToxicityTrend } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import toast from 'react-hot-toast';
import './Analytics.css';

const COLORS = {
  primary:   '#2563EB',
  accent:    '#14B8A6',
  secondary: '#0F766E',
  safe:      '#0F9F79',
  toxic:     '#DC4C4C',
  muted:     '#64748B',
};

/* ─── Stat Card ───────────────────────────────────────────────────────── */
const StatCard = ({ icon: Icon, label, value, sub, color, delay = 0 }) => (
  <motion.div
    className="analytics-stat-card"
    initial={{ opacity: 0, y: 16 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
  >
    <div className="stat-icon-wrap" style={{ background: `${color}18` }}>
      <Icon size={22} color={color} />
    </div>
    <div className="stat-info">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value?.toLocaleString() ?? '—'}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  </motion.div>
);

/* ─── Custom Tooltip ──────────────────────────────────────────────────── */
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <p className="tooltip-label">{label}</p>
      {payload.map((entry) => (
        <p key={entry.name} style={{ color: entry.color }}>
          {entry.name}: <strong>{entry.value}</strong>
        </p>
      ))}
    </div>
  );
};

/* ─── Main Component ──────────────────────────────────────────────────── */
const Analytics = () => {
  const [overview, setOverview]       = useState(null);
  const [trend, setTrend]             = useState(null);
  const [toxicComments, setToxic]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [loadError, setLoadError]     = useState('');

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [ovRes, trRes, tcRes] = await Promise.allSettled([
      getAnalyticsOverview(),
      getToxicityTrend(),
      getToxicComments(),
    ]);
    const failedSections = [];

    if (ovRes.status === 'fulfilled') {
      setOverview(ovRes.value.data);
    } else {
      setOverview(null);
      failedSections.push('summary');
    }
    if (trRes.status === 'fulfilled' && Array.isArray(trRes.value.data)) {
      setTrend(trRes.value.data.map((row) => ({
        ...row,
        date: row.date?.slice(5) ?? row.date,
      })));
    } else {
      setTrend(null);
      failedSections.push('trend');
    }
    if (tcRes.status === 'fulfilled' && Array.isArray(tcRes.value.data)) {
      setToxic(tcRes.value.data.slice(0, 5));
    } else {
      setToxic([]);
      failedSections.push('flagged comments');
    }

    const firstFailure = [ovRes, trRes, tcRes].find((result) => result.status === 'rejected');
    setLoadError(failedSections.length
      ? `Could not load ${failedSections.join(', ')}. ${getApiErrorMessage(firstFailure?.reason, 'Refresh and try again.')}`
      : '');
    setLoading(false);
    return failedSections.length === 0;
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    const refreshed = await fetchAll();
    setRefreshing(false);
    if (refreshed) toast.success('Dashboard refreshed');
  };

  /* Derived values */
  const total   = overview?.total_comments ?? 0;
  const safe    = overview?.safe_comments  ?? 0;
  const toxic   = overview?.toxic_comments ?? 0;
  const moderatedTotal = safe + toxic;
  const safeRate = moderatedTotal > 0 ? Math.round((safe / moderatedTotal) * 100) : 0;
  const toxicRate = moderatedTotal > 0 ? Math.round((toxic / moderatedTotal) * 100) : 0;
  const hasTrend = Array.isArray(trend) && trend.length > 0;

  const pieData = [
    { name: 'Safe',  value: safe },
    { name: 'Toxic', value: toxic },
  ];

  if (loading) {
    return (
      <div className="analytics-page">
        <div className="analytics-loading">
          <div className="spinner" />
          <p>Loading analytics…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="analytics-page">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <motion.div
        className="analytics-header"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="analytics-title-group">
          <BarChart2 size={24} color="var(--primary)" />
          <div>
            <h1 className="analytics-title">Analytics Dashboard</h1>
            <p className="analytics-subtitle">AI-powered content moderation insights</p>
          </div>
        </div>
        <button
          className="analytics-refresh-btn"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw size={16} className={refreshing ? 'spin-icon' : ''} />
          Refresh
        </button>
      </motion.div>

      {/* ── Stat Cards ──────────────────────────────────────────────── */}
      <div className="analytics-stats-grid">
        <StatCard
          icon={MessageSquare}
          label="Total Comments"
          value={overview ? total : null}
          sub={overview ? `${overview.unverified_comments ?? Math.max(total - moderatedTotal, 0)} awaiting or unverified` : 'Unavailable'}
          color={COLORS.secondary}
          delay={0}
        />
        <StatCard
          icon={ShieldCheck}
          label="Safe Comments"
          value={overview ? safe : null}
          sub={overview ? `${safeRate}% of moderated` : 'Unavailable'}
          color={COLORS.safe}
          delay={0.05}
        />
        <StatCard
          icon={AlertTriangle}
          label="Toxic Comments"
          value={overview ? toxic : null}
          sub={overview ? `${toxicRate}% of moderated` : 'Unavailable'}
          color={COLORS.toxic}
          delay={0.1}
        />
        <StatCard
          icon={safeRate >= 80 ? TrendingUp : TrendingDown}
          label="Safety Rate"
          value={overview ? (moderatedTotal ? `${safeRate}%` : '—') : null}
          sub={overview ? (moderatedTotal ? 'Safe moderation rate' : 'No moderation data yet') : 'Unavailable'}
          color={safeRate >= 80 ? COLORS.secondary : COLORS.toxic}
          delay={0.15}
        />
      </div>

      {loadError && <div className="analytics-error" role="alert">{loadError}</div>}

      {/* ── Charts Row ──────────────────────────────────────────────── */}
      <div className="analytics-charts-row">

        {/* Area Chart — Toxicity Trend */}
        <motion.div
          className="analytics-chart-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="chart-card-header">
            <h2 className="chart-title">Comment Trend</h2>
            <span className="chart-subtitle">Safe vs Toxic over time</span>
          </div>
          {hasTrend ? <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradSafe" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.safe}  stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.safe}  stopOpacity={0}   />
                </linearGradient>
                <linearGradient id="gradToxic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={COLORS.toxic} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={COLORS.toxic} stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="safe_count"  name="Safe"  stroke={COLORS.safe}  fill="url(#gradSafe)"  strokeWidth={2} />
              <Area type="monotone" dataKey="toxic_count" name="Toxic" stroke={COLORS.toxic} fill="url(#gradToxic)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer> : <div className="analytics-empty">{trend === null ? 'Trend data is unavailable.' : 'No moderation activity in the last 14 days.'}</div>}
        </motion.div>

        {/* Pie Chart — Distribution */}
        <motion.div
          className="analytics-chart-card analytics-chart-small"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
        >
          <div className="chart-card-header">
            <h2 className="chart-title">Content Distribution</h2>
            <span className="chart-subtitle">Safe vs Toxic split</span>
          </div>
          {overview && moderatedTotal > 0 ? <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={90}
                paddingAngle={3}
                dataKey="value"
              >
                {pieData.map((entry, i) => (
                  <Cell
                    key={entry.name}
                    fill={i === 0 ? COLORS.safe : COLORS.toxic}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(val, name) => [`${val} comments`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer> : <div className="analytics-empty">{overview ? 'No moderation data yet.' : 'Summary data is unavailable.'}</div>}
          {overview && moderatedTotal > 0 && <div className="pie-center-label">
            <span className="pie-rate">{safeRate}%</span>
            <span className="pie-rate-sub">Safe</span>
          </div>}
        </motion.div>
      </div>

      {/* Bar Chart — Daily breakdown */}
      <motion.div
        className="analytics-chart-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="chart-card-header">
          <h2 className="chart-title">Daily Toxic Comment Count</h2>
          <span className="chart-subtitle">Posts flagged per day</span>
        </div>
        {hasTrend ? <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="toxic_count" name="Toxic" fill={COLORS.primary} radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer> : <div className="analytics-empty">{trend === null ? 'Trend data is unavailable.' : 'No flagged comments in the last 14 days.'}</div>}
      </motion.div>

      {/* Recent Toxic Comments Table */}
      {toxicComments.length > 0 && (
        <motion.div
          className="analytics-table-card"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
        >
          <div className="chart-card-header">
            <h2 className="chart-title">Recent Flagged Comments</h2>
            <span className="chart-subtitle">Reviewed by AI moderation</span>
          </div>
          <div className="analytics-table-wrap">
            <table className="analytics-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Comment</th>
                  <th>Confidence</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {toxicComments.map((c, i) => (
                  <tr key={c.id ?? i}>
                    <td className="table-user">{c.user_name || 'Unknown'}</td>
                    <td className="table-content">{c.content?.slice(0, 60)}…</td>
                    <td className="table-confidence">
                      {c.toxicity_score != null
                        ? `${Math.round(c.toxicity_score * 100)}%`
                        : '—'}
                    </td>
                    <td>
                      <span className="status-badge toxic">Toxic</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </div>
  );
};

export default Analytics;
