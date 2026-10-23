const BrandLockup = ({ compact = false, light = false }) => (
  <span className={`brand-lockup${compact ? ' compact' : ''}${light ? ' on-dark' : ''}`}>
    <img className="brand-logo-full" src="/pehra-logo.png" alt="Pehra" />
    <span className="brand-mark-crop" aria-hidden="true"><img src="/pehra-mark.svg" alt="" /></span>
    {!compact && <span className="brand-copy"><small>Safety, kept in sight</small></span>}
  </span>
);

export default BrandLockup;
