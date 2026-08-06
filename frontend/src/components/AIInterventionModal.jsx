import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Send, Edit3 } from 'lucide-react';
import { checkToxicity, rewriteText } from '../services/api';
import RewriteSuggestion from './RewriteSuggestion';
import './AIInterventionModal.css';

const AIInterventionModal = ({ isOpen, onClose, onConfirm, onEdit, text = '', title = 'Create Post', placeholder = "What's on your mind?" }) => {
  const [inputText, setInputText] = useState(text);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [rewrite, setRewrite] = useState(null);
  const [loadingRewrite, setLoadingRewrite] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setInputText(text);
      setResult(null);
      setShowWarning(false);
      setRewrite(null);
    }
  }, [isOpen, text]);

  const runCheck = async (currentText) => {
    if (!currentText.trim() || currentText.trim().length < 3) {
      setResult(null);
      setShowWarning(false);
      setRewrite(null);
      return;
    }
    setChecking(true);
    try {
      const { data } = await checkToxicity(currentText);
      setResult(data);
      setShowWarning(data.isToxic);
      if (data.isToxic) {
        fetchRewrite(currentText);
      } else {
        setRewrite(null);
      }
    } catch (err) {
      console.error('Toxicity check failed:', err);
    } finally {
      setChecking(false);
    }
  };

  const fetchRewrite = async (currentText) => {
    setLoadingRewrite(true);
    try {
      const { data } = await rewriteText(currentText);
      setRewrite(data.suggestion);
    } catch {
      setRewrite(null);
    } finally {
      setLoadingRewrite(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runCheck(val), 600);
  };

  const handlePostAnyway = () => {
    onConfirm?.(inputText);
    onClose?.();
  };

  const handleEdit = () => {
    onEdit?.(inputText);
    onClose?.();
  };

  const handleAcceptRewrite = () => {
    if (rewrite) {
      setInputText(rewrite);
      setRewrite(null);
      setShowWarning(false);
    }
  };

  const handleCancel = () => {
    setInputText(text);
    setResult(null);
    setShowWarning(false);
    setRewrite(null);
    onClose?.();
  };

  const getSeverityColor = (severity) => {
    if (severity === 'High') return '#ef4444';
    if (severity === 'Medium') return '#f59e0b';
    return '#eab308';
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="modal-container"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
          >
            <div className="modal-header">
              <h3>{title}</h3>
              <button className="modal-close" onClick={handleCancel}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <textarea
                className="modal-textarea"
                placeholder={placeholder}
                value={inputText}
                onChange={handleChange}
                rows={5}
                autoFocus
              />

              {checking && (
                <div className="modal-checking">
                  <div className="spinner small"></div>
                  <span>Checking content...</span>
                </div>
              )}

              <AnimatePresence>
                {showWarning && result && (
                  <motion.div
                    className="warning-banner"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <AlertTriangle size={20} className="warning-icon" />
                    <div className="warning-content">
                      <p className="warning-title">Your message may hurt others</p>
                      <div className="warning-details">
                        <span className="severity-badge" style={{ background: getSeverityColor(result.severity) }}>
                          {result.severity} Severity
                        </span>
                        <span className="score-text">Score: {(result.score * 100).toFixed(0)}%</span>
                      </div>
                      {result.highlightedWords?.length > 0 && (
                        <div className="highlighted-words">
                          <span className="hw-label">Flagged words:</span>
                          {result.highlightedWords.map((w, i) => (
                            <span key={i} className="hw-tag">{w}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {loadingRewrite && (
                <div className="modal-checking">
                  <div className="spinner small"></div>
                  <span>Generating rewrite suggestion...</span>
                </div>
              )}

              {rewrite && !loadingRewrite && (
                <RewriteSuggestion
                  originalText={inputText}
                  suggestion={rewrite}
                  onAccept={handleAcceptRewrite}
                  onDismiss={() => setRewrite(null)}
                />
              )}
            </div>

            <div className="modal-footer">
              <button className="btn btn-cancel" onClick={handleCancel}>
                Cancel
              </button>
              {showWarning ? (
                <>
                  <button className="btn btn-edit" onClick={handleEdit}>
                    <Edit3 size={16} />
                    Edit Message
                  </button>
                  <button className="btn btn-post-anyway" onClick={handlePostAnyway}>
                    Post Anyway
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={handlePostAnyway} disabled={!inputText.trim()}>
                  <Send size={16} />
                  {title === 'Create Post' ? 'Share Post' : 'Send Message'}
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default AIInterventionModal;
