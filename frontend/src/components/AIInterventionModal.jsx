import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, X, Send, Edit3 } from 'lucide-react';
import { checkToxicity, checkImageToxicity, rewriteText } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import RewriteSuggestion from './RewriteSuggestion';
import './AIInterventionModal.css';

const EMPTY_IMAGES = [];

const renderMatchedText = (text, words = []) => {
  const alternatives = [...new Set(words)].sort((a, b) => b.length - a.length);
  if (!text || !alternatives.length) return text;
  const pattern = new RegExp(`(${alternatives.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
  return text.split(pattern).map((part, index) => (
    alternatives.some((word) => part.toLowerCase() === word.toLowerCase())
      ? <mark key={`${part}-${index}`}>{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>
  ));
};

const AIInterventionModal = ({ isOpen, onClose, onConfirm, onEdit, text = '', images = EMPTY_IMAGES, title = 'Create Post', placeholder = "What's on your mind?" }) => {
  const [inputText, setInputText] = useState(text);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState(null);
  const [textCheckUnavailable, setTextCheckUnavailable] = useState(false);
  const [textCheckError, setTextCheckError] = useState('');
  const [mediaResults, setMediaResults] = useState([]);
  const [checkingMedia, setCheckingMedia] = useState(false);
  const [rewrite, setRewrite] = useState(null);
  const [rewriteError, setRewriteError] = useState('');
  const [loadingRewrite, setLoadingRewrite] = useState(false);
  const debounceRef = useRef(null);
  const toxicityRequestRef = useRef(0);
  const rewriteRequestRef = useRef(0);
  const showWarning = Boolean(result?.isToxic || mediaResults.some((media) => media.isToxic));
  const contentType = title.toLowerCase().includes('post')
    ? 'Post'
    : title.toLowerCase().includes('comment')
      ? 'Comment'
      : 'Message';
  const submitLabel = contentType === 'Post'
    ? 'Share Post'
    : contentType === 'Comment'
      ? 'Add Comment'
      : 'Send Message';
  const submitAnywayLabel = contentType === 'Post'
    ? 'Post Anyway'
    : contentType === 'Comment'
      ? 'Comment Anyway'
      : 'Send Anyway';

  useEffect(() => () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const requestId = toxicityRequestRef.current + 1;
      toxicityRequestRef.current = requestId;
      setInputText(text);
      setChecking(false);
      setResult(null);
      setTextCheckUnavailable(false);
      setTextCheckError('');
      setMediaResults([]);
      setRewrite(null);
      setRewriteError('');
      if (images.length) {
        setCheckingMedia(true);
        Promise.all(images.map(async (imageData, index) => {
          try {
            const { data } = await checkImageToxicity(imageData);
            return { ...data, index };
          } catch (error) {
            return {
              index,
              verified: false,
              isToxic: false,
              error: getApiErrorMessage(error, 'OCR check unavailable.'),
            };
          }
        })).then(setMediaResults).finally(() => setCheckingMedia(false));
      } else {
        setCheckingMedia(false);
      }
      if (text && text.trim().length >= 3) {
        const doCheck = async () => {
          setChecking(true);
          try {
            const { data } = await checkToxicity(text);
            if (toxicityRequestRef.current === requestId) setResult(data);
          } catch (err) {
            if (toxicityRequestRef.current === requestId) {
              setTextCheckUnavailable(true);
              setTextCheckError(getApiErrorMessage(err, 'Automatic wording check is unavailable.'));
            }
          } finally {
            if (toxicityRequestRef.current === requestId) setChecking(false);
          }
        };
        doCheck();
      }
    }
  }, [isOpen, text, images]);

  const runCheck = async (currentText) => {
    const requestId = toxicityRequestRef.current + 1;
    toxicityRequestRef.current = requestId;
    if (!currentText.trim() || currentText.trim().length < 3) {
      setChecking(false);
      setResult(null);
      setTextCheckUnavailable(false);
      setTextCheckError('');
      setRewrite(null);
      setRewriteError('');
      return;
    }
    setChecking(true);
    setTextCheckUnavailable(false);
    setTextCheckError('');
    try {
      const { data } = await checkToxicity(currentText);
      if (toxicityRequestRef.current === requestId) setResult(data);
      if (toxicityRequestRef.current === requestId && !data.isToxic) {
        setRewrite(null);
      }
    } catch (err) {
      if (toxicityRequestRef.current === requestId) {
        setTextCheckUnavailable(true);
        setTextCheckError(getApiErrorMessage(err, 'Automatic wording check is unavailable.'));
      }
    } finally {
      if (toxicityRequestRef.current === requestId) setChecking(false);
    }
  };

  const fetchRewrite = async (currentText) => {
    const requestId = rewriteRequestRef.current + 1;
    rewriteRequestRef.current = requestId;
    setLoadingRewrite(true);
    setRewriteError('');
    try {
      const { data } = await rewriteText(currentText);
      if (rewriteRequestRef.current === requestId) setRewrite(data.suggestion);
    } catch (error) {
      if (rewriteRequestRef.current === requestId) {
        setRewrite(null);
        setRewriteError(getApiErrorMessage(error, 'Could not generate a rewrite. You can edit the text manually.'));
      }
    } finally {
      if (rewriteRequestRef.current === requestId) setLoadingRewrite(false);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setInputText(val);
    setChecking(val.trim().length >= 3);
    setRewrite(null);
    setRewriteError('');
    rewriteRequestRef.current += 1;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runCheck(val), 600);
  };

  const handlePostAnyway = () => {
    onConfirm?.(inputText, { warningAccepted: Boolean(showWarning) });
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
      setRewriteError('');
      runCheck(rewrite);
    }
  };

  const handleCancel = () => {
    toxicityRequestRef.current += 1;
    setChecking(false);
    setInputText(text);
    setResult(null);
    setMediaResults([]);
    setRewrite(null);
    setRewriteError('');
    setTextCheckError('');
    onClose?.();
  };

  const getSeverityColor = (severity) => {
    if (severity === 'High') return '#ef4444';
    if (severity === 'Medium') return '#f59e0b';
    return '#eab308';
  };

  const categoryScores = {
    ...(result?.categoryScores || {}),
    ...mediaResults.reduce((scores, media) => {
      Object.entries(media.categoryScores || {}).forEach(([category, value]) => {
        scores[category] = Math.max(scores[category] || 0, value);
      });
      return scores;
    }, {}),
  };
  const highlightedWords = [
    ...(result?.highlightedWords || []),
    ...mediaResults.flatMap((media) => media.highlightedWords || []),
  ].filter((word, index, words) => words.indexOf(word) === index);
  const overallScore = Math.max(result?.score || 0, ...mediaResults.map((media) => media.score || 0));
  const overallSeverity = overallScore >= 0.8 ? 'High' : overallScore >= 0.5 ? 'Medium' : 'Low';

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

              {checkingMedia && (
                <div className="modal-checking">
                  <div className="spinner small"></div>
                  <span>Reading text in attached images...</span>
                </div>
              )}

              {(textCheckUnavailable || (result && !result.verified) || mediaResults.some((media) => !media.verified)) && (
                <div className="verification-notice" role="status">
                  {textCheckError || mediaResults.find((media) => media.error)?.error || 'Some automatic checks are unavailable. Review the text and images before sharing.'}
                </div>
              )}

              <AnimatePresence>
                {showWarning && (
                  <motion.div
                    className="warning-banner"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <AlertTriangle size={20} className="warning-icon" />
                    <div className="warning-content">
                      <p className="warning-title">This content may hurt others</p>
                      <div className="warning-details">
                        <span className="severity-badge" style={{ background: getSeverityColor(overallSeverity) }}>
                          {overallSeverity} Severity
                        </span>
                        <span className="score-text">Overall toxicity score: {(overallScore * 100).toFixed(0)}%</span>
                      </div>
                      <div className="category-signals">
                        <span className="hw-label">Rule-based category signals, not model probabilities:</span>
                        {['insult', 'harassment', 'threat'].map((category) => (
                          <span key={category} className="category-signal">
                            <span>{category[0].toUpperCase() + category.slice(1)}</span>
                            <strong>{categoryScores[category] || 0}%</strong>
                          </span>
                        ))}
                      </div>
                      {highlightedWords.length > 0 && (
                        <div className="highlighted-words">
                          <span className="hw-label">Matched wording:</span>
                          {highlightedWords.map((w, i) => (
                            <span key={i} className="hw-tag">{w}</span>
                          ))}
                        </div>
                      )}
                      {result?.highlightedWords?.length > 0 && (
                        <div className="matched-text-preview">
                          <span>Matched wording in your message</span>
                          <p>{renderMatchedText(inputText, result.highlightedWords)}</p>
                        </div>
                      )}
                      {mediaResults.filter((media) => media.detectedText).map((media) => (
                        <div className="ocr-result" key={media.index}>
                          <span>Text detected in image {media.index + 1}</span>
                          <p>{renderMatchedText(media.detectedText, media.highlightedWords)}</p>
                        </div>
                      ))}
                      {mediaResults.filter((media) => media.error).map((media) => (
                        <div className="ocr-unavailable" key={`ocr-error-${media.index}`}>
                          OCR could not check image {media.index + 1}: {media.error}
                        </div>
                      ))}
                      {rewriteError && (
                        <div className="rewrite-error" role="alert">{rewriteError}</div>
                      )}
                      {!rewrite && !loadingRewrite && (
                        <button className="rewrite-trigger" onClick={() => fetchRewrite(inputText)}>
                          {rewriteError ? 'Try again' : 'Suggest a kinder rewrite'}
                        </button>
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
                    Edit {contentType}
                  </button>
                  <button className="btn btn-post-anyway" onClick={handlePostAnyway} disabled={checking || checkingMedia}>
                    {submitAnywayLabel}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={handlePostAnyway} disabled={checking || checkingMedia || (!inputText.trim() && !images.length)}>
                  <Send size={16} />
                  {submitLabel}
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
