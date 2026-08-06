import './SeverityBadge.css';

const SeverityBadge = ({ severity }) => {
  const map = {
    High: { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
    Medium: { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
    Low: { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' },
  };

  const style = map[severity] || map.Low;

  return (
    <span className="severity-badge" style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
      {severity}
    </span>
  );
};

export default SeverityBadge;
