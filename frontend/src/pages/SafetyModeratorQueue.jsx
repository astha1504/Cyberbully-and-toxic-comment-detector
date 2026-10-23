import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Clock3, FileSearch, ShieldCheck } from 'lucide-react';
import {
  downloadSafetyEvidence, getSafetyEvidence, getSafetyReportHistory,
  getSafetyReportQueue, reviewSafetyReport,
} from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { formatIndiaDateTime } from '../utils/dateTime';
import './SafetyModeratorQueue.css';

const SafetyModeratorQueue = () => {
  const [reports, setReports] = useState([]);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [evidenceByCase, setEvidenceByCase] = useState({});
  const [evidenceBusy, setEvidenceBusy] = useState('');

  const loadReports = useCallback(async () => {
    setError('');
    try {
      const { data } = await getSafetyReportQueue();
      setReports(Array.isArray(data) ? data : []);
    } catch (loadError) {
      setError(getApiErrorMessage(loadError, 'Could not load the moderator queue.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadReports(); }, [loadReports]);

  const updateCase = async (report, status) => {
    setBusyId(report.id);
    setError('');
    setNotice('');
    try {
      const { data } = await reviewSafetyReport(report.id, { status, note: notes[report.id] || '' });
      if (status === 'under_review') {
        setReports((current) => current.map((item) => item.id === report.id ? { ...item, ...data } : item));
      } else {
        setReports((current) => current.filter((item) => item.id !== report.id));
      }
      setNotice(`${report.case_id} marked ${status.replaceAll('_', ' ')}.`);
      setNotes((current) => ({ ...current, [report.id]: '' }));
    } catch (reviewError) {
      setError(getApiErrorMessage(reviewError, 'Could not update this case.'));
    } finally {
      setBusyId('');
    }
  };

  const toggleEvidence = async (report) => {
    if (evidenceByCase[report.id]) {
      setEvidenceByCase((current) => ({ ...current, [report.id]: null }));
      return;
    }
    setEvidenceBusy(report.id);
    setError('');
    try {
      const { data } = await getSafetyEvidence(report.id);
      setEvidenceByCase((current) => ({ ...current, [report.id]: data || [] }));
      const { data: events } = await getSafetyReportHistory(report.id);
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, events } : item));
    } catch (evidenceError) {
      setError(getApiErrorMessage(evidenceError, 'Could not load private evidence.'));
    } finally {
      setEvidenceBusy('');
    }
  };

  const downloadEvidence = async (report, evidence) => {
    setEvidenceBusy(report.id);
    setError('');
    try {
      const { data } = await downloadSafetyEvidence(report.id, evidence.id);
      const url = URL.createObjectURL(data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = evidence.display_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const { data: events } = await getSafetyReportHistory(report.id);
      setReports((current) => current.map((item) => item.id === report.id ? { ...item, events } : item));
    } catch (downloadError) {
      setError(getApiErrorMessage(downloadError, 'Could not download this evidence file.'));
    } finally {
      setEvidenceBusy('');
    }
  };

  return (
    <div className="app-page-shell moderator-page">
      <div className="moderator-page-top"><Link to="/safety/reports"><ArrowLeft size={15} /> My safety reports</Link><span><ShieldCheck size={15} /> Restricted moderator view</span></div>
      <section className="moderator-hero">
        <div className="moderator-hero-icon"><FileSearch size={24} /></div>
        <div><span>Private case management</span><h1>Safety review queue</h1><p>Review reports submitted to the Pehra safety team. Case data expires after 30 days.</p></div>
        <button type="button" onClick={loadReports}><Clock3 size={15} /> Refresh queue</button>
      </section>

      {error && <p className="moderator-message moderator-error" role="alert">{error}</p>}
      {notice && <p className="moderator-message moderator-success" role="status">{notice}</p>}

      {loading ? <div className="moderator-loading">Loading cases…</div> : reports.length === 0 ? (
        <div className="moderator-empty"><Check size={23} /><h2>No open cases</h2><p>New reports and review requests appear here.</p></div>
      ) : (
        <div className="moderator-case-list">
          {reports.map((report) => (
            <article className="moderator-case-card" key={report.id}>
              <header><div><span className="moderator-case-id">{report.case_id}</span><span className={`case-status status-${report.status}`}>{report.status.replaceAll('_', ' ')}</span></div><small>Submitted by {report.reporter_username} · {formatIndiaDateTime(report.created_at)}</small></header>
              <h2>{report.category}</h2>
              {(report.incident_date || report.state_or_ut) && <p className="moderator-case-context">{report.incident_date || 'Date not provided'}{report.state_or_ut ? ` · ${report.state_or_ut}` : ''}</p>}
              <p className="moderator-case-summary">{report.summary}</p>
              {report.events?.length > 0 && (
                <details className="moderator-history"><summary>Case history ({report.events.length})</summary>
                  {report.events.map((event, index) => <p key={`${report.id}-event-${index}`}>{event.action.replaceAll('_', ' ')} · {event.actor_role === 'reporter' ? 'Reporter' : 'Moderator'}{event.note ? `: ${event.note}` : ''}{event.created_at ? ` · ${formatIndiaDateTime(event.created_at)}` : ''}</p>)}
                </details>
              )}
              <div className="moderator-evidence">
                <button type="button" onClick={() => toggleEvidence(report)} disabled={evidenceBusy === report.id}>
                  {evidenceBusy === report.id ? 'Loading evidence…' : `${evidenceByCase[report.id] ? 'Hide' : 'View'} private evidence (${report.evidence_count || 0})`}
                </button>
                {Array.isArray(evidenceByCase[report.id]) && (
                  evidenceByCase[report.id].length === 0 ? <p>No evidence files attached.</p> : (
                    <ul>{evidenceByCase[report.id].map((evidence) => (
                      <li key={evidence.id}>
                        <span>{evidence.display_name} · {(evidence.size_bytes / 1024 / 1024).toFixed(2)} MB</span>
                        <button type="button" onClick={() => downloadEvidence(report, evidence)} disabled={evidenceBusy === report.id}>Download private file</button>
                      </li>
                    ))}</ul>
                  )
                )}
              </div>
              <label className="moderator-note-label">Internal review note<textarea value={notes[report.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [report.id]: event.target.value }))} rows={2} maxLength={1000} placeholder="Record a concise action or reason. This note stays in moderator history." /></label>
              <footer>
                <button type="button" className="case-action-review" onClick={() => updateCase(report, 'under_review')} disabled={busyId === report.id}>Mark under review</button>
                <button type="button" className="case-action-resolve" onClick={() => updateCase(report, 'resolved')} disabled={busyId === report.id}>Resolve</button>
                <button type="button" className="case-action-close" onClick={() => updateCase(report, 'closed')} disabled={busyId === report.id}>Close</button>
              </footer>
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default SafetyModeratorQueue;
