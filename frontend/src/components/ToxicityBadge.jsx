import './ToxicityBadge.css';

const ToxicityBadge = ({ isToxic, isBlurred, onClick }) => {
  if (!isToxic) return null;

  return (
    <span className="toxicity-badge" onClick={onClick} title={isBlurred ? 'Content blurred due to toxicity' : 'Flagged for toxicity'}>
      {isBlurred ? 'Flagged & Blurred' : 'Flagged'}
    </span>
  );
};

export default ToxicityBadge;
