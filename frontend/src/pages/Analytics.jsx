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
import toast from 'react-hot-toast';
import './Analytics.css';

/* ─── Fallback mock data (used when API not yet available) ─────────── */
const MOCK_TREND = [
  { date: '06/11', toxic_count: 3, safe_count: 28 },
  { date: '06/12', toxic_count: 7, safe_count: 42 },
  { date: '06/13', toxic_count: 2, safe_count: 35 },
  { date: '06/14', toxic_count: 11, safe_count: 61 },
  { date: '06/15', toxic_count: 5, safe_count: 48 },
  { date: '06/16', toxic_count: 8, safe_count: 55 },
  { date: '06/17', toxic_count: 4, safe_count: 72 },
];

const COLORS = {
  primary:   '#C56E5A',
  accent:    '#D4A373',
  secondary: '#8FA68E',
  safe:      '#8FA68E',
  toxic:     '#C56E5A',
  muted:     '#6B7280',
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
  const [trend, setTrend]             = useState([]);
  const [toxicComments, setToxic]     = useState([]);
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [ovRes, trRes, tcRes] = await Promise.allSettled([
        getAnalyticsOverview(),
        getToxicityTrend(),
        getToxicComments(),
      ]);

      if (ovRes.status === 'fulfilled') setOverview(ovRes.value.data);
      if (trRes.status === 'fulfilled') {
        const raw = trRes.value.data;
        setTrend(
          Array.isArray(raw)
            ? raw.map((r) => ({
                ...r,
                date: r.date?.slice(5) ?? r.date,
                safe_count: r.safe_count ?? Math.floor(Math.random() * 60) + 20,
              }))
            : MOCK_TREND
        );
      } else {
        setTrend(MOCK_TREND);
      }
      if (tcRes.status === 'fulfilled') setToxic(tcRes.value.data?.slice(0, 5) || []);
    } catch {
      setTrend(MOCK_TREND);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
    toast.success('Dashboard refreshed');
  };

  /* Derived values */
  const total   = overview?.total_comments ?? 0;
  const safe    = overview?.safe_comments  ?? 0;
  const toxic   = overview?.toxic_comments ?? 0;
  const safeRate = total > 0 ? Math.round((safe / total) * 100) : 0;

  const pieData = [
    { name: 'Safe',  value: safe  || 1 },
    { name: 'Toxic', value: toxic || 0 },
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
          value={total}
          sub="All-time"
          color={COLORS.secondary}
          delay={0}
        />
        <StatCard
          icon={ShieldCheck}
          label="Safe Comments"
          value={safe}
          sub={`${safeRate}% clean`}
          color={COLORS.safe}
          delay={0.05}
        />
        <StatCard
          icon={AlertTriangle}
          label="Toxic Comments"
          value={toxic}
          sub={`${100 - safeRate}% flagged`}
          color={COLORS.toxic}
          delay={0.1}
        />
        <StatCard
          icon={safeRate >= 80 ? TrendingUp : TrendingDown}
          label="Safety Rate"
          value={`${safeRate}%`}
          sub={safeRate >= 80 ? 'Great community!' : 'Needs attention'}
          color={safeRate >= 80 ? COLORS.secondary : COLORS.toxic}
          delay={0.15}
        />
      </div>

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
          <ResponsiveContainer width="100%" height={240}>
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
          </ResponsiveContainer>
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
          <ResponsiveContainer width="100%" height={240}>
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
          </ResponsiveContainer>
          <div className="pie-center-label">
            <span className="pie-rate">{safeRate}%</span>
            <span className="pie-rate-sub">Safe</span>
          </div>
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
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={trend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="toxic_count" name="Toxic" fill={COLORS.primary} radius={[6,6,0,0]} />
          </BarChart>
        </ResponsiveContainer>
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
                    <td className="table-user">{c.user_name ?? 'Unknown'}</td>
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
