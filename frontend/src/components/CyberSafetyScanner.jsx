import { useRef, useState } from 'react';
import {
  AlertTriangle, ArrowUpRight, Check, FileImage, Loader2,
  MessageSquare, Mic, ShieldCheck, Upload, X
} from 'lucide-react';
import { analyzeCyberSafety, checkAudioToxicity, checkImageToxicity } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import './CyberSafetyScanner.css';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/tiff': ['tif', 'tiff'],
  'image/bmp': ['bmp'],
};
const MODES = [
  { id: 'text', label: 'Message', icon: MessageSquare },
  { id: 'image', label: 'Screenshot', icon: FileImage },
  { id: 'audio', label: 'Voice note', icon: Mic },
];

const readAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Could not read this file. Choose another file.'));
  reader.readAsDataURL(file);
});

const getImageMimeType = (file) => {
  const mimeType = file.type?.toLowerCase();
  if (Object.hasOwn(IMAGE_TYPES, mimeType)) return mimeType;
  const extension = file.name.split('.').pop()?.toLowerCase();
  return Object.entries(IMAGE_TYPES).find(([, extensions]) => extensions.includes(extension))?.[0] || '';
};

const formatFileSize = (size) => size < 1024 * 1024
  ? `${Math.max(1, Math.round(size / 1024))} KB`
  : `${(size / (1024 * 1024)).toFixed(1)} MB`;

const CyberSafetyScanner = () => {
  const [mode, setMode] = useState('text');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState(null);
  const [moneyLost, setMoneyLost] = useState(false);
  const [credentialsShared, setCredentialsShared] = useState(false);
  const [appInstalled, setAppInstalled] = useState(false);
  const [voiceConsent, setVoiceConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState('Checking signals…');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [scannedText, setScannedText] = useState('');
  const fileInputRef = useRef(null);

  const changeMode = (nextMode) => {
    setMode(nextMode);
    setFile(null);
    setError('');
    setResult(null);
    setScannedText('');
    setVoiceConsent(false);
    setCredentialsShared(false);
    setMoneyLost(false);
    setAppInstalled(false);
  };

  const selectFile = (event, fileMode) => {
    const selectedFile = event.target.files?.[0] || null;
    if (!selectedFile) return;

    if (!selectedFile.size) {
      setFile(null);
      setError('This file is empty. Choose another file.');
      event.target.value = '';
      return;
    }
    if (fileMode === 'image' && !getImageMimeType(selectedFile)) {
      setFile(null);
      setError('Choose a JPEG, PNG, WEBP, TIFF, or BMP screenshot.');
      event.target.value = '';
      return;
    }
    if (fileMode === 'image' && selectedFile.size > MAX_IMAGE_BYTES) {
      setFile(null);
      setError('Screenshots must be 8 MB or smaller.');
      event.target.value = '';
      return;
    }
    if (fileMode === 'audio' && selectedFile.size > MAX_AUDIO_BYTES) {
      setFile(null);
      setError('Voice notes must be 20 MB or smaller.');
      event.target.value = '';
      return;
    }

    setFile(selectedFile);
    setError('');
    setResult(null);
    setScannedText('');
    if (fileMode === 'audio') setVoiceConsent(false);
  };

  const removeSelectedFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');
    setResult(null);
    setScannedText('');
  };

  const scan = async (event) => {
    event.preventDefault();
    setError('');
    setResult(null);
    setScannedText('');

    if (mode === 'text' && !message.trim()) {
      setError('Paste a message before scanning.');
      return;
    }
    if (mode !== 'text' && !file) {
      setError(`Choose a ${mode === 'image' ? 'screenshot' : 'voice note'} first.`);
      return;
    }
    if (mode === 'audio' && !voiceConsent) {
      setError('Confirm voice processing before uploading the recording.');
      return;
    }

    setLoading(true);
    setLoadingLabel(mode === 'image' ? 'Uploading and reading screenshot…' : mode === 'audio' ? 'Transcribing voice note…' : 'Checking signals…');
    let requestStage = mode === 'image' ? 'image-ocr' : mode === 'audio' ? 'voice-transcription' : 'analysis';
    try {
      let textToScan = message.trim();
      if (mode === 'image') {
        const imageMimeType = getImageMimeType(file);
        if (!imageMimeType || file.size > MAX_IMAGE_BYTES) {
          throw new Error('Choose a supported image up to 8 MB.');
        }
        const imageData = (await readAsDataUrl(file)).replace(/^data:[^,]*,/, `data:${imageMimeType};base64,`);
        const { data } = await checkImageToxicity(imageData);
        requestStage = 'analysis';
        textToScan = data?.detectedText?.trim() || '';
        if (!textToScan) {
          throw new Error('No readable text found. Try a clearer screenshot or paste the message.');
        }
      } else if (mode === 'audio') {
        if (file.size > MAX_AUDIO_BYTES) throw new Error('Choose an audio file up to 20 MB.');
        const { data } = await checkAudioToxicity(file);
        requestStage = 'analysis';
        textToScan = data?.transcription?.trim() || '';
        if (!textToScan) throw new Error('No speech was transcribed. Try a clearer recording or paste the message.');
      }

      if (mode !== 'text') setLoadingLabel('Checking scam signals…');
      setScannedText(textToScan);
      const { data } = await analyzeCyberSafety(textToScan, moneyLost, credentialsShared);
      setResult(data);
    } catch (scanError) {
      const apiMessage = scanError?.response
        ? getApiErrorMessage(scanError, 'The scan could not be completed.')
        : scanError.message || 'The scan could not be completed.';
      if (requestStage === 'image-ocr' && scanError?.response?.status === 503 && apiMessage === 'This service is temporarily unavailable. Please try again shortly.') {
        setError('Pehra received the screenshot, but OCR is unavailable. Check TESSERACT_CMD and TESSERACT_LANG in backend/.env, then restart FastAPI.');
      } else {
        setError(apiMessage);
      }
    } finally {
      setLoading(false);
    }
  };

  const clear = () => {
    setMessage('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setMoneyLost(false);
    setCredentialsShared(false);
    setAppInstalled(false);
    setVoiceConsent(false);
    setError('');
    setResult(null);
    setScannedText('');
  };

  return (
    <section className="cyber-scan-section" aria-labelledby="cyber-scan-title">
      <div className="cyber-scan-heading">
        <div className="cyber-scan-heading-icon"><ShieldCheck size={19} /></div>
        <div>
          <span className="safety-kicker">India-first cyber safety</span>
          <h2 id="cyber-scan-title">Check a suspicious message</h2>
          <p>Review a message, screenshot, or voice note for common fraud signals. Text rules cover English, Hindi, Hinglish, and selected Marathi, Bengali, Tamil, and Telugu phrases. OCR and voice language coverage depends on the installed language pack and transcription provider.</p>
        </div>
      </div>

      <form className="cyber-scan-card" onSubmit={scan}>
        <div className="cyber-scan-tabs" role="tablist" aria-label="Choose what to scan">
          {MODES.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              role="tab"
              aria-selected={mode === id}
              className={`cyber-scan-tab ${mode === id ? 'active' : ''}`}
              key={id}
              onClick={() => changeMode(id)}
            >
              <Icon size={16} /> {label}
            </button>
          ))}
          <button type="button" className="cyber-scan-clear" onClick={clear}>Clear</button>
        </div>

        <div className="cyber-scan-input-area">
          {mode === 'text' && (
            <label className="cyber-scan-text-label">
              <span>Paste the suspicious SMS, WhatsApp, email, or social message</span>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={4000}
                rows={5}
                placeholder={'Example: Your SIM will be blocked today. Update KYC at this link and share the OTP.'}
              />
              <small>{message.length}/4000 characters. Remove passwords, OTPs, and account numbers first.</small>
            </label>
          )}

          {mode === 'image' && (
            <div className="cyber-screenshot-upload">
              <label className="cyber-scan-file-picker">
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/tiff,image/bmp"
                  ref={fileInputRef}
                  onChange={(event) => selectFile(event, 'image')}
                />
                <span className="cyber-file-icon"><Upload size={19} /></span>
                <strong>{file ? 'Replace screenshot' : 'Choose a screenshot'}</strong>
                <span>JPEG, PNG, WEBP, TIFF, or BMP. Maximum 8 MB.</span>
              </label>
              {file && (
                <div className="cyber-selected-file" aria-live="polite">
                  <span className="cyber-selected-file-icon"><FileImage size={18} /></span>
                  <span className="cyber-selected-file-copy">
                    <strong>{file.name}</strong>
                    <small>{formatFileSize(file.size)}. Ready for OCR when you select Check for scam signals.</small>
                  </span>
                  <button type="button" className="cyber-remove-file" onClick={removeSelectedFile} aria-label="Remove selected screenshot"><X size={16} /></button>
                </div>
              )}
            </div>
          )}

          {mode === 'audio' && (
            <div className="cyber-scan-audio-picker">
              <label className="cyber-scan-file-picker">
                <input
                  type="file"
                  accept="audio/flac,audio/mpeg,audio/mp4,audio/mp4a-latm,audio/ogg,audio/wav,audio/webm,video/mp4,video/webm"
                  ref={fileInputRef}
                  onChange={(event) => selectFile(event, 'audio')}
                />
                <span className="cyber-file-icon"><Mic size={19} /></span>
                <strong>{file?.name || 'Choose a voice note or recording'}</strong>
                <span>Audio/video file up to 20 MB.</span>
              </label>
              <label className="cyber-consent-row">
                <input type="checkbox" checked={voiceConsent} onChange={(event) => setVoiceConsent(event.target.checked)} />
                <span>I agree to send this recording to the configured transcription provider for speech-to-text. I have removed private details where possible.</span>
              </label>
            </div>
          )}

          <label className="cyber-money-lost">
            <input type="checkbox" checked={moneyLost} onChange={(event) => setMoneyLost(event.target.checked)} />
            <span><strong>Money has left my account</strong><small>Show urgent financial fraud steps.</small></span>
          </label>
          <label className="cyber-money-lost cyber-credentials-shared">
            <input type="checkbox" checked={credentialsShared} onChange={(event) => setCredentialsShared(event.target.checked)} />
            <span><strong>I shared an OTP, PIN, or password</strong><small>Show account recovery steps.</small></span>
          </label>

          <div className="cyber-scan-actions">
            <button className="cyber-scan-submit" type="submit" disabled={loading}>
              {loading ? <Loader2 className="cyber-spin" size={17} /> : <ShieldCheck size={17} />}
              {loading ? loadingLabel : 'Check for scam signals'}
            </button>
            <span>Signal-based guidance. No message is a confirmed scam from this scan alone.</span>
          </div>
        </div>

        {error && <div className="cyber-scan-error" role="alert"><AlertTriangle size={16} />{error}</div>}

        {result && (
          <div className={`cyber-scan-result risk-${result.risk_level}`} aria-live="polite">
            <div className="cyber-result-topline">
              <div className="cyber-result-mark">{result.risk_level === 'no_strong_signals' ? <Check size={18} /> : <AlertTriangle size={18} />}</div>
              <div><span className="cyber-result-overline">Signal-based advisory</span><h3>{result.risk_label}</h3></div>
              <span className="cyber-signal-count">{result.signal_count} {result.signal_count === 1 ? 'signal' : 'signals'}</span>
            </div>
            <p className="cyber-result-category">{result.category}</p>

            {result.signals.length > 0 ? (
              <div className="cyber-result-signals">
                {result.signals.map((signal) => (
                  <article className="cyber-signal" key={signal.code}>
                    <h4>{signal.title}</h4>
                    <p>{signal.explanation}</p>
                    {signal.matched_terms?.length > 0 && <div className="cyber-matched-terms">{signal.matched_terms.map((term, index) => <span key={`${signal.code}-${index}`}>{term}</span>)}</div>}
                  </article>
                ))}
              </div>
            ) : (
              <p className="cyber-no-match">No configured warning pattern matched. This does not prove the message is safe. Verify through an official source.</p>
            )}

            {result.signals.some((signal) => signal.code === 'e_challan_theme' || signal.matched_terms?.some((term) => /\bapk\b/i.test(term))) && (
              <div className="cyber-installed-check">
                <label>
                  <input type="checkbox" checked={appInstalled} onChange={(event) => setAppInstalled(event.target.checked)} />
                  <span>I installed the APK from this message</span>
                </label>
                {appInstalled && (
                  <div role="alert">
                    <strong>Take device safety steps now.</strong>
                    <p>Disconnect mobile data and Wi-Fi. Uninstall the suspicious app. Run a trusted mobile security scan. From a separate trusted device, change affected passwords and UPI PINs, then review recent transactions. Call 1930 if money moved.</p>
                    {result.signals.some((signal) => signal.code === 'e_challan_theme') && <a href="https://www.cert-in.org.in/s2cMainServlet?CACODE=CICA-2026-3492&pageid=PUBADV01" target="_blank" rel="noreferrer">Read CERT-In’s fake e-Challan response steps <ArrowUpRight size={13} /></a>}
                  </div>
                )}
              </div>
            )}

            <div className="cyber-guidance">
              <h4>Suggested next steps</h4>
              {result.guidance.map((item, index) => <p key={index}><Check size={14} />{item}</p>)}
            </div>

            {result.official_links?.length > 0 && (
              <div className="cyber-official-links">
                {result.official_links.map((link) => (
                  <a key={link.url} href={link.url} target={link.url.startsWith('https:') ? '_blank' : undefined} rel={link.url.startsWith('https:') ? 'noreferrer' : undefined}>
                    {link.label}<ArrowUpRight size={14} />
                  </a>
                ))}
              </div>
            )}

            {scannedText && <details className="cyber-transcript"><summary>Review text sent for analysis</summary><pre>{scannedText}</pre></details>}
            <p className="cyber-result-note">{result.assessment_note}</p>
          </div>
        )}

        <p className="cyber-data-note">Screenshots upload for OCR when you select Check for scam signals. Pehra does not save scan screenshots. To keep a screenshot with a case, add it separately under Prepare a report.</p>
      </form>
    </section>
  );
};

export default CyberSafetyScanner;
