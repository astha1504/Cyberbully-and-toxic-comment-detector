import { Eye } from 'lucide-react';

const BrandLockup = ({ compact = false, light = false }) => (
  <span className={`brand-lockup${compact ? ' compact' : ''}${light ? ' on-dark' : ''}`}>
    <span className="brand-mark" aria-hidden="true"><Eye size={21} strokeWidth={2.1} /></span>
    <span className="brand-copy">
      <strong>Pehra</strong>
      {!compact && <small>Safety, kept in sight</small>}
    </span>
  </span>
);

export default BrandLockup;
