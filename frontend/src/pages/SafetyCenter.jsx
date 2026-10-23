import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowUpRight, CalendarClock, Check,
  Clipboard, ExternalLink, FileText, HeartHandshake, LifeBuoy,
  Mail, MapPin, MessageSquare, Phone, ShieldAlert, ShieldCheck,
  Smartphone, Sparkles, Users
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  appealSafetyReport, createSafetyReport, deleteSafetyEvidence,
  downloadSafetyEvidence, getMySafetyReports, getSafetyEvidence,
  getSafetyReportHistory, uploadSafetyEvidence,
} from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { formatIndiaDate, formatIndiaDateTime } from '../utils/dateTime';
import CyberSafetyScanner from '../components/CyberSafetyScanner';
import './SafetyCenter.css';

const OFFICIAL_LINKS = {
  cybercrime: 'https://cybercrime.gov.in/',
  contacts: 'https://cybercrime.gov.in/Webform/Crime_NodalGrivanceList.aspx',
  sancharSaathi: 'https://sancharsaathi.gov.in/sfc/',
  pratibimbInfo: 'https://www.mha.gov.in/MHA1/Par2017/pdfs/par2026-pdfs/RS11032026/2161.pdf'
};

const INCIDENT_TYPES = [
  'Online harassment or abuse',
  'Threats or stalking',
  'Non-consensual image sharing',
  'Impersonation or account misuse',
  'Financial cyber fraud',
  'Fraud call, SMS, or WhatsApp message',
  'Other online safety concern'
];

const SAFETY_SECTIONS = [
  { id: 'scan', label: 'Scan a message', icon: ShieldCheck, description: 'Check a suspicious SMS, WhatsApp message, screenshot, or voice note.' },
  { id: 'help', label: 'Get help', icon: LifeBuoy, description: 'Find emergency contacts and official cyber reporting services.' },
  { id: 'report', label: 'Prepare a report', icon: FileText, description: 'Organize incident details before contacting an authority.' },
  { id: 'reports', label: 'My reports', icon: Clipboard, description: 'Review private case status, action history, evidence, and appeals.' },
];

const SafetyCenter = () => {
  const { user } = useAuth();
  const { section: routeSection } = useParams();
  const navigate = useNavigate();
  const currentSection = SAFETY_SECTIONS.find(({ id }) => id === routeSection);
  const activeSection = currentSection?.id || 'scan';
  const [incidentType, setIncidentType] = useState(INCIDENT_TYPES[0]);
  const [incidentDate, setIncidentDate] = useState('');
  const [stateOrUt, setStateOrUt] = useState('');
  const [recipient, setRecipient] = useState('');
  const [summary, setSummary] = useState('');
  const [report, setReport] = useState('');
  const [copied, setCopied] = useState(false);
  const [formError, setFormError] = useState('');
  const [caseConsent, setCaseConsent] = useState(false);
  const [caseSubmitting, setCaseSubmitting] = useState(false);
  const [caseMessage, setCaseMessage] = useState('');
  const [caseError, setCaseError] = useState('');
  const [safetyReports, setSafetyReports] = useState([]);
  const [appealNotes, setAppealNotes] = useState({});
  const [expandedCases, setExpandedCases] = useState({});
  const [caseHistory, setCaseHistory] = useState({});
  const [caseEvidence, setCaseEvidence] = useState({});
  const [evidenceFiles, setEvidenceFiles] = useState({});
  const [evidenceConsent, setEvidenceConsent] = useState({});
  const [evidenceBusy, setEvidenceBusy] = useState('');

  useEffect(() => {
    let active = true;
    getMySafetyReports()
      .then(({ data }) => { if (active) setSafetyReports(Array.isArray(data) ? data : []); })
      .catch((error) => { if (active) setCaseError(getApiErrorMessage(error, 'Could not load your safety reports.')); });
    return () => { active = false; };
  }, []);

  const reportSubject = useMemo(
    () => `Online safety report: ${incidentType}`,
    [incidentType]
  );

  const buildReport = (event) => {
    event.preventDefault();
    setFormError('');
    setCopied(false);

    if (!summary.trim()) {
      setFormError('Add a short factual description before preparing the report.');
      return;
    }

    const lines = [
      'ONLINE SAFETY INCIDENT REPORT',
      '',
      `Incident type: ${incidentType}`,
      `Incident date and time: ${incidentDate || 'Not provided'}`,
      `State or Union Territory: ${stateOrUt || 'Not provided'}`,
      `Prepared by: ${user?.name || 'Not provided'}`,
      `Platform: Pehra`,
      '',
      'Incident summary:',
      summary.trim(),
      '',
      'Evidence available: Please contact me for evidence or submission instructions.',
      '',
      'I request guidance on the appropriate next steps and reporting process.'
    ];
    setReport(lines.join('\n'));
  };

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setFormError('Clipboard access failed. Select and copy the report text.');
    }
  };

  const openEmailDraft = () => {
    if (!recipient.trim() || !report) return;
    const emailField = document.getElementById('cyber-cell-email');
    if (!emailField?.checkValidity()) {
      setFormError('Enter a valid email address from the official directory.');
      emailField?.focus();
      return;
    }
    const params = new URLSearchParams({ subject: reportSubject, body: report });
    window.location.href = `mailto:${recipient.trim()}?${params.toString()}`;
  };

  const clearForm = () => {
    setIncidentDate('');
    setStateOrUt('');
    setRecipient('');
    setSummary('');
    setReport('');
    setFormError('');
    setCopied(false);
    setCaseConsent(false);
    setCaseMessage('');
    setCaseError('');
  };

  const submitPehraCase = async () => {
    setCaseError('');
    setCaseMessage('');
    if (!caseConsent) {
      setCaseError('Consent is required before submitting a private report.');
      return;
    }
    if (!summary.trim()) {
      setCaseError('Add a factual summary before submitting a report.');
      return;
    }
    setCaseSubmitting(true);
    try {
      const { data } = await createSafetyReport({
        category: incidentType,
        summary: summary.trim(),
        incident_date: incidentDate || null,
        state_or_ut: stateOrUt.trim() || null,
        consent: true,
      });
      setSafetyReports((current) => [data, ...current]);
      setCaseMessage(`Report received. Your case reference is ${data.case_id}.`);
      setCaseConsent(false);
      navigate('/safety/reports');
    } catch (error) {
      setCaseError(getApiErrorMessage(error, 'Could not submit your report.'));
    } finally {
      setCaseSubmitting(false);
    }
  };

  const submitAppeal = async (reportId) => {
    const note = appealNotes[reportId]?.trim();
    if (!note) return;
    setCaseError('');
    try {
      const { data } = await appealSafetyReport(reportId, note);
      setSafetyReports((current) => current.map((item) => item.id === reportId ? { ...item, ...data } : item));
      setAppealNotes((current) => ({ ...current, [reportId]: '' }));
      const { data: history } = await getSafetyReportHistory(reportId);
      setCaseHistory((current) => ({ ...current, [reportId]: history || [] }));
      setCaseMessage(`Review requested for ${data.case_id}.`);
    } catch (error) {
      setCaseError(getApiErrorMessage(error, 'Could not request another review.'));
    }
  };

  const toggleCaseDetails = async (item) => {
    const isOpen = Boolean(expandedCases[item.id]);
    setExpandedCases((current) => ({ ...current, [item.id]: !isOpen }));
    if (isOpen || (caseHistory[item.id] && caseEvidence[item.id])) return;
    setEvidenceBusy(item.id);
    setCaseError('');
    try {
      const evidenceResponse = await getSafetyEvidence(item.id);
      const historyResponse = await getSafetyReportHistory(item.id);
      setCaseHistory((current) => ({ ...current, [item.id]: historyResponse.data || [] }));
      setCaseEvidence((current) => ({ ...current, [item.id]: evidenceResponse.data || [] }));
      setSafetyReports((current) => current.map((report) => report.id === item.id ? { ...report, evidence_count: evidenceResponse.data?.length || 0 } : report));
    } catch (error) {
      setCaseError(getApiErrorMessage(error, 'Could not load case history or evidence.'));
    } finally {
      setEvidenceBusy('');
    }
  };

  const uploadCaseEvidence = async (item) => {
    const files = Array.from(evidenceFiles[item.id] || []);
    const currentEvidence = caseEvidence[item.id] || [];
    if (!evidenceConsent[item.id]) {
      setCaseError('Consent is required before sharing evidence with moderators.');
      return;
    }
    if (files.length === 0 || files.length + currentEvidence.length > 5) {
      setCaseError('Choose up to five evidence files in total.');
      return;
    }
    if (files.some((file) => file.size > 8 * 1024 * 1024)) {
      setCaseError('Each evidence file must be 8 MB or smaller.');
      return;
    }

    setEvidenceBusy(item.id);
    setCaseError('');
    let uploaded = 0;
    try {
      for (const file of files) {
        await uploadSafetyEvidence(item.id, file);
        uploaded += 1;
      }
      const { data } = await getSafetyEvidence(item.id);
      setCaseEvidence((current) => ({ ...current, [item.id]: data || [] }));
      setSafetyReports((current) => current.map((report) => report.id === item.id ? { ...report, evidence_count: data?.length || 0 } : report));
      setEvidenceFiles((current) => ({ ...current, [item.id]: [] }));
      setEvidenceConsent((current) => ({ ...current, [item.id]: false }));
      const { data: history } = await getSafetyReportHistory(item.id);
      setCaseHistory((current) => ({ ...current, [item.id]: history || [] }));
      setCaseMessage(`${uploaded} evidence ${uploaded === 1 ? 'file was' : 'files were'} added to ${item.case_id}.`);
    } catch (error) {
      const detail = getApiErrorMessage(error, 'Evidence upload failed.');
      setCaseError(uploaded > 0 ? `${uploaded} file(s) uploaded. ${detail}` : detail);
      const { data } = await getSafetyEvidence(item.id).catch(() => ({ data: [] }));
      setCaseEvidence((current) => ({ ...current, [item.id]: data || [] }));
      setSafetyReports((current) => current.map((report) => report.id === item.id ? { ...report, evidence_count: data?.length || 0 } : report));
      if (uploaded > 0) {
        setEvidenceFiles((current) => ({ ...current, [item.id]: [] }));
        setEvidenceConsent((current) => ({ ...current, [item.id]: false }));
      }
    } finally {
      setEvidenceBusy('');
    }
  };

  const downloadEvidence = async (item, evidence) => {
    setEvidenceBusy(item.id);
    try {
      const { data } = await downloadSafetyEvidence(item.id, evidence.id);
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = evidence.display_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const { data: history } = await getSafetyReportHistory(item.id);
      setCaseHistory((current) => ({ ...current, [item.id]: history || [] }));
    } catch (error) {
      setCaseError(getApiErrorMessage(error, 'Could not download this evidence file.'));
    } finally {
      setEvidenceBusy('');
    }
  };

  const removeEvidence = async (item, evidence) => {
    setEvidenceBusy(item.id);
    setCaseError('');
    try {
      await deleteSafetyEvidence(item.id, evidence.id);
      const [{ data: evidenceData }, { data: historyData }] = await Promise.all([
        getSafetyEvidence(item.id),
        getSafetyReportHistory(item.id),
      ]);
      setCaseEvidence((current) => ({ ...current, [item.id]: evidenceData || [] }));
      setCaseHistory((current) => ({ ...current, [item.id]: historyData || [] }));
      setSafetyReports((current) => current.map((report) => report.id === item.id ? { ...report, evidence_count: evidenceData?.length || 0 } : report));
    } catch (error) {
      setCaseError(getApiErrorMessage(error, 'Could not remove this evidence file.'));
    } finally {
      setEvidenceBusy('');
    }
  };

  if (!currentSection) return <Navigate to="/safety/scan" replace />;
  const SectionIcon = currentSection.icon;

  return (
    <div className="app-page-shell safety-page">
      <header className="safety-page-heading">
        <span className="safety-kicker safety-page-kicker"><SectionIcon size={14} /> Safety Center</span>
        <h1>{currentSection.label}</h1>
        <p>{currentSection.description}</p>
      </header>

      {activeSection === 'scan' && (
        <section className="safety-section-page">
          <CyberSafetyScanner />
        </section>
      )}

      {activeSection === 'help' && (
      <section className="safety-section-page">
        <section className="safety-urgent" aria-labelledby="urgent-help-title">
          <div className="safety-urgent-heading">
            <div className="safety-section-icon urgent-icon"><LifeBuoy size={19} /></div>
            <div><h2 id="urgent-help-title">Need help now?</h2><p>Contact emergency services for immediate danger.</p></div>
          </div>
          <a className="urgent-contact" href="tel:112"><span className="urgent-number">112</span><span>Police emergency</span><Phone size={16} /></a>
          <a className="urgent-contact" href="tel:181"><span className="urgent-number">181</span><span>Women’s helpline</span><Phone size={16} /></a>
          <a className="urgent-contact" href="tel:1930"><span className="urgent-number">1930</span><span>Financial cyber fraud</span><Phone size={16} /></a>
        </section>

        <section className="safety-section" aria-labelledby="safety-actions-title">
          <div className="safety-section-heading">
            <div><span className="safety-kicker">Official support</span><h2 id="safety-actions-title">Choose the right response</h2></div>
            <p>Use verified government channels for reports that need official action.</p>
          </div>
          <div className="safety-resource-grid">
            <article className="safety-resource-card resource-women">
              <div className="resource-icon"><HeartHandshake size={21} /></div>
              <span className="resource-label">For women and children</span>
              <h3>Report online abuse</h3>
              <p>Use the National Cyber Crime Reporting Portal for online harassment, stalking, threats, or non-consensual content.</p>
              <a href={OFFICIAL_LINKS.cybercrime} target="_blank" rel="noreferrer">Open cybercrime.gov.in <ExternalLink size={15} /></a>
            </article>
            <article className="safety-resource-card resource-telecom">
              <div className="resource-icon"><Smartphone size={21} /></div>
              <span className="resource-label">Fraud call, SMS, or WhatsApp</span>
              <h3>Report with Chakshu</h3>
              <p>Send suspected fraud communications to DoT’s Chakshu service through Sanchar Saathi.</p>
              <a href={OFFICIAL_LINKS.sancharSaathi} target="_blank" rel="noreferrer">Open Chakshu on Sanchar Saathi <ExternalLink size={15} /></a>
            </article>
            <article className="safety-resource-card resource-evidence">
              <div className="resource-icon"><FileText size={21} /></div>
              <span className="resource-label">Before you report</span>
              <h3>Keep useful evidence</h3>
              <p>Save dates, profile links, message URLs, and screenshots. Avoid editing originals or sharing private images further.</p>
              <button className="resource-tab-link" type="button" onClick={() => navigate('/safety/report')}>Prepare a factual summary <ArrowUpRight size={15} /></button>
            </article>
          </div>
        </section>

        <section className="safety-integrity">
          <div className="integrity-main">
            <div className="safety-section-icon integrity-icon"><Users size={20} /></div>
            <div><span className="safety-kicker">Built around human review</span><h2>Automation should support people.</h2><p>Our moderation signals help people pause and review harmful content. A score is not a legal finding, and Pehra does not file reports with authorities.</p></div>
          </div>
          <div className="integrity-side">
            <div className="pratibimb-mark"><ShieldCheck size={16} /> Public service context</div>
            <h3>Pratibimb is for law enforcement.</h3>
            <p>Pratibimb is part of I4C’s Samanvaya platform for authorized agencies. Pehra has no access to it. Citizens should report through the official portal.</p>
            <a href={OFFICIAL_LINKS.pratibimbInfo} target="_blank" rel="noreferrer">See the official MHA description <ExternalLink size={14} /></a>
          </div>
        </section>
      </section>
      )}

      {activeSection === 'report' && (
      <section className="safety-section-page">
      <section className="safety-report-layout" id="incident-report-form">
        <div className="report-intro">
          <div className="report-intro-icon"><Sparkles size={20} /></div>
          <span className="safety-kicker">Local report assistant</span>
          <h2>Turn your notes into a clear report.</h2>
          <p>Enter the key facts. The report builder formats them into a simple timeline for a cyber cell or other authority.</p>
          <div className="report-privacy"><ShieldAlert size={18} /><span>Your details are not saved to Pehra or sent to a server. Clear the form when finished.</span></div>
          <div className="report-steps">
            <span><i>1</i> Add incident details</span>
            <span><i>2</i> Review the report</span>
            <span><i>3</i> Copy or open an email draft</span>
          </div>
        </div>

        <div className="report-form-card">
          <div className="report-form-heading"><div><MessageSquare size={19} /><h3>Incident details</h3></div><button type="button" className="report-clear" onClick={clearForm}>Clear form</button></div>
          <form onSubmit={buildReport}>
            <label className="safety-field">
              <span>What happened?</span>
              <select value={incidentType} onChange={(event) => setIncidentType(event.target.value)}>
                {INCIDENT_TYPES.map((type) => <option key={type}>{type}</option>)}
              </select>
            </label>
            <div className="safety-form-row">
              <label className="safety-field">
                <span><CalendarClock size={14} /> Approximate date and time</span>
                <input type="datetime-local" value={incidentDate} onChange={(event) => setIncidentDate(event.target.value)} />
              </label>
              <label className="safety-field">
                <span><MapPin size={14} /> State or Union Territory</span>
                <input value={stateOrUt} onChange={(event) => setStateOrUt(event.target.value)} placeholder="For example, Uttar Pradesh" maxLength={80} />
              </label>
            </div>
            <label className="safety-field">
              <span>Factual summary</span>
              <textarea value={summary} onChange={(event) => setSummary(event.target.value)} placeholder="Describe what happened, where it happened, and any relevant profile or message links. Avoid adding passwords, OTPs, or banking PINs." maxLength={1800} rows={5} />
              <small>{summary.length}/1800 characters</small>
            </label>
            <div className="safety-field">
              <label htmlFor="cyber-cell-email">Cyber cell or authority email</label>
              <input id="cyber-cell-email" type="email" value={recipient} onChange={(event) => setRecipient(event.target.value)} placeholder="Enter an official email address" maxLength={254} />
              <small>Check the address in the official <a href={OFFICIAL_LINKS.contacts} target="_blank" rel="noreferrer">State/UT cyber cell directory <ExternalLink size={12} /></a>.</small>
            </div>
            {formError && <p className="report-error" role="alert">{formError}</p>}
            <button className="report-generate" type="submit"><Sparkles size={16} /> Prepare report preview</button>
          </form>

          {report && (
            <div className="report-preview" aria-live="polite">
              <div className="report-preview-heading"><div><Check size={17} /><h4>Report preview</h4></div><span>Review before sharing</span></div>
              <pre>{report}</pre>
              <div className="report-preview-actions">
                <button type="button" className="report-copy" onClick={copyReport}>{copied ? <Check size={15} /> : <Clipboard size={15} />}{copied ? 'Copied' : 'Copy report'}</button>
                <button type="button" className="report-email" onClick={openEmailDraft} disabled={!recipient.trim()}><Mail size={15} /> Open email draft</button>
              </div>
              <p className="report-send-note">Your mail app opens with a draft. Review it and choose Send there.</p>
              <div className="social-case-submit">
                <div><h5>Send a private report to Pehra</h5><p>Authorized safety moderators review reports. Case details expire after 30 days. This does not contact police or government services.</p></div>
                <label className="social-case-consent">
                  <input type="checkbox" checked={caseConsent} onChange={(event) => setCaseConsent(event.target.checked)} />
                  <span>I agree to share this incident type, date, state, and summary with Pehra moderators for review. I have removed passwords, OTPs, and bank credentials.</span>
                </label>
                {caseError && <p className="report-error" role="alert">{caseError}</p>}
                {caseMessage && <p className="case-success" role="status">{caseMessage}</p>}
                <button type="button" className="case-submit-button" onClick={submitPehraCase} disabled={!caseConsent || caseSubmitting}>
                  {caseSubmitting ? 'Submitting…' : 'Submit private report'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      </section>
      )}

      {activeSection === 'reports' && (
      <section className="safety-section-page">
      <section className="safety-cases" aria-labelledby="safety-cases-title">
        <div className="safety-cases-heading">
          <div><span className="safety-kicker">Private case tracking</span><h2 id="safety-cases-title">Your safety reports</h2></div>
          {user?.is_safety_moderator && <Link to="/safety/moderation" className="moderator-queue-link">Open moderator queue <ArrowUpRight size={14} /></Link>}
        </div>
        {caseError && <p className="case-list-error" role="alert">{caseError}</p>}
        {caseMessage && <p className="case-success" role="status">{caseMessage}</p>}
        {safetyReports.length === 0 ? (
          <p className="safety-cases-empty">No private reports yet. Submitted case references and status updates appear here.</p>
        ) : (
          <div className="safety-case-list">
            {safetyReports.map((item) => (
              <article className="safety-case-item" key={item.id}>
                <div className="safety-case-main">
                  <span className="case-reference">{item.case_id}</span>
                  <strong>{item.category}</strong>
                  <small>Submitted {item.created_at ? formatIndiaDate(item.created_at) : 'recently'}</small>
                </div>
                <span className={`case-status status-${item.status}`}>{item.status.replaceAll('_', ' ')}</span>
                <button type="button" className="case-details-toggle" onClick={() => toggleCaseDetails(item)}>
                  {expandedCases[item.id] ? 'Hide case history and evidence' : `View case history and evidence (${item.evidence_count || 0})`}
                </button>
                {expandedCases[item.id] && (
                  <div className="case-private-details">
                    <section className="case-history-panel">
                      <h4>Case action history</h4>
                      {evidenceBusy === item.id && !caseHistory[item.id] ? <p>Loading case history…</p> : (caseHistory[item.id] || []).length === 0 ? <p>No case actions recorded yet.</p> : (
                        <ol>
                          {caseHistory[item.id].map((event, index) => (
                            <li key={`${item.id}-history-${index}`}>
                              <strong>{event.action.replaceAll('_', ' ')} · {event.actor_role === 'moderator' ? 'Safety team' : 'You'}</strong>
                              <small>{event.created_at ? formatIndiaDateTime(event.created_at) : ''}</small>
                              {event.note && <p>{event.note}</p>}
                            </li>
                          ))}
                        </ol>
                      )}
                    </section>
                    <section className="case-evidence-panel">
                      <h4>Private evidence</h4>
                      <p>Only you and allowlisted safety moderators can access these files. Files expire with the case after 30 days. Files receive type and size checks, not malware scanning. Do not upload passwords, OTPs, bank credentials, or intimate images.</p>
                      {(caseEvidence[item.id] || []).length > 0 && (
                        <ul>
                          {caseEvidence[item.id].map((evidence) => (
                            <li key={evidence.id}>
                              <span>{evidence.display_name} · {(evidence.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                              <button type="button" onClick={() => downloadEvidence(item, evidence)} disabled={evidenceBusy === item.id}>Download</button>
                              <button type="button" onClick={() => removeEvidence(item, evidence)} disabled={evidenceBusy === item.id}>Remove</button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {!['resolved', 'closed'].includes(item.status) && (
                        <div className="case-evidence-upload">
                          <label>
                            Add files
                            <input
                              key={`${item.id}-${(evidenceFiles[item.id] || []).length}-${(caseEvidence[item.id] || []).length}`}
                              type="file"
                              accept="image/jpeg,image/png,image/webp,application/pdf"
                              multiple
                              onChange={(event) => setEvidenceFiles((current) => ({ ...current, [item.id]: Array.from(event.target.files || []) }))}
                            />
                          </label>
                          <small>JPEG, PNG, WEBP, or PDF. Up to five files per case, 8 MB each, with a 40 MB account limit.</small>
                          <label className="social-case-consent">
                            <input type="checkbox" checked={Boolean(evidenceConsent[item.id])} onChange={(event) => setEvidenceConsent((current) => ({ ...current, [item.id]: event.target.checked }))} />
                            <span>I agree to share selected files with Pehra moderators for this case.</span>
                          </label>
                          <button type="button" onClick={() => uploadCaseEvidence(item)} disabled={evidenceBusy === item.id || !(evidenceFiles[item.id] || []).length || !evidenceConsent[item.id]}>
                            {evidenceBusy === item.id ? 'Working…' : 'Upload private evidence'}
                          </button>
                        </div>
                      )}
                    </section>
                  </div>
                )}
                {(item.status === 'resolved' || item.status === 'closed') && (
                  <div className="case-appeal">
                    <textarea value={appealNotes[item.id] || ''} onChange={(event) => setAppealNotes((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Why do you want another review?" maxLength={1000} rows={2} />
                    <button type="button" onClick={() => submitAppeal(item.id)} disabled={!appealNotes[item.id]?.trim()}>Request another review</button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
      </section>
      )}

      <footer className="safety-footer"><ShieldCheck size={16} /><span>Safety resources link to official services. For immediate danger, call 112.</span></footer>
    </div>
  );
};

export default SafetyCenter;
