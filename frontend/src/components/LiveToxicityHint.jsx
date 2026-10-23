import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { checkToxicity } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import './LiveToxicityHint.css';

const LiveToxicityHint = ({ text = '' }) => {
  const [result, setResult] = useState(null);
  const [checking, setChecking] = useState(false);
  const [unavailable, setUnavailable] = useState('');

  useEffect(() => {
    const content = text.trim();
    if (content.length < 3) {
      setResult(null);
      setChecking(false);
      setUnavailable('');
      return undefined;
    }

    let current = true;
    setResult(null);
    setUnavailable('');
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const { data } = await checkToxicity(content);
        if (current) {
          setResult(data);
          setUnavailable(data.verified === false
            ? 'Automatic wording check could not verify this text. Review it before sending.'
            : '');
        }
      } catch (error) {
        if (current) {
          setUnavailable(getApiErrorMessage(error, 'Automatic wording check is unavailable.'));
        }
      } finally {
        if (current) setChecking(false);
      }
    }, 650);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [text]);

  if (!checking && !result?.isToxic && !unavailable) return null;

  return (
    <div className={`live-toxicity-hint ${result?.isToxic ? 'is-flagged' : ''}`} role="status" aria-live="polite">
      {checking ? (
        <><span className="live-hint-spinner" /> Checking wording…</>
      ) : unavailable ? (
        <>{unavailable}</>
      ) : (
        <>
          <AlertTriangle size={15} />
          <span>This wording may hurt others ({Math.round((result.score || 0) * 100)}% overall score).</span>
          {result.highlightedWords?.length > 0 && (
            <span className="live-hint-words">Matched: {result.highlightedWords.join(', ')}</span>
          )}
        </>
      )}
    </div>
  );
};

export default LiveToxicityHint;
