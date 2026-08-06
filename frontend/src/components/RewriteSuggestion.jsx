import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import './RewriteSuggestion.css';

const RewriteSuggestion = ({ originalText, suggestion, onAccept, onDismiss, tone = 'polite' }) => {
  if (!suggestion || suggestion === originalText) return null;

  const toneLabels = {
    polite: 'Polite',
    neutral: 'Neutral',
    friendly: 'Friendly',
  };

  return (
    <motion.div
      className="rewrite-card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
    >
      <div className="rewrite-header">
        <Sparkles size={16} />
        <span>AI Suggestion ({toneLabels[tone] || tone})</span>
      </div>
      <p className="rewrite-suggestion">{suggestion}</p>
      <div className="rewrite-actions">
        <button className="btn-accept" onClick={onAccept}>
          Replace
        </button>
        <button className="btn-dismiss" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
    </motion.div>
  );
};

export default RewriteSuggestion;
