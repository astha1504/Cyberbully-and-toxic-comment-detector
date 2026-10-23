import { Link } from 'react-router-dom';
import {
  ArrowDownRight, ArrowRight, ArrowUpRight, Check, Eye,
  FileImage, HeartHandshake, MessageSquare, Mic, ShieldCheck,
  Smartphone
} from 'lucide-react';
import BrandLockup from '../components/BrandLockup';
import './Landing.css';

const LOOP_STEPS = [
  {
    number: '01',
    icon: MessageSquare,
    title: 'Pause before a post',
    copy: 'Review flagged wording, see the matched terms, edit your message, or ask for a kinder rewrite.',
  },
  {
    number: '02',
    icon: Eye,
    title: 'Understand the signal',
    copy: 'Check suspicious text, screenshots, and voice notes. Pehra shows the cues behind each result.',
  },
  {
    number: '03',
    icon: Smartphone,
    title: 'Choose a next step',
    copy: 'Get practical guidance and links to the right Indian service for the situation.',
  },
  {
    number: '04',
    icon: HeartHandshake,
    title: 'Follow up with people',
    copy: 'Share a report with consent, track its status, and request another review when needed.',
  },
];

const Landing = () => (
  <div className="landing-shell">
    <header className="landing-nav">
      <Link className="landing-brand" to="/" aria-label="Pehra home">
        <BrandLockup compact />
        <span className="landing-brand-note">Digital safety for communities</span>
      </Link>
      <nav className="landing-nav-links" aria-label="Page navigation">
        <a href="#pehra-loop">How Pehra works</a>
        <a href="#real-world-help">Get help</a>
      </nav>
      <div className="landing-nav-actions">
        <Link className="landing-sign-in" to="/login">Sign in</Link>
        <Link className="landing-nav-cta" to="/register">Join Pehra <ArrowUpRight size={15} /></Link>
      </div>
    </header>

    <main>
      <section className="landing-hero" aria-labelledby="landing-title">
        <div className="landing-hero-copy">
          <div className="landing-issue"><span /> FOR CAMPUS AND COMMUNITY</div>
          <h1 id="landing-title">Pause before you send.<br /><em>See the signal.</em></h1>
          <p className="landing-lede">Pehra helps people make safer choices in the moments that matter: before a harmful post goes live, when a message looks like a scam, and when someone needs a clear next step.</p>
          <div className="landing-hero-actions">
            <a className="landing-primary-action" href="#pehra-loop">See how Pehra works <ArrowDownRight size={17} /></a>
            <Link className="landing-secondary-action" to="/register">Create an account <ArrowUpRight size={16} /></Link>
          </div>
          <div className="landing-hero-notes">
            <span><Check size={14} /> Prevention before posting</span>
            <span><Check size={14} /> India-focused response paths</span>
          </div>
        </div>

        <div className="landing-scene" aria-label="Example Pehra scam-signal review">
          <div className="landing-scene-index"><span>PEHRA FIELD NOTE</span><span>01 / MESSAGE CHECK</span></div>
          <div className="landing-sms-card">
            <div className="landing-sms-head">
              <div className="landing-sms-avatar">SMS</div>
              <div><strong>Unknown sender</strong><small>Sample message</small></div>
              <span>09:41</span>
            </div>
            <div className="landing-sms-bubble">
              <p>Final e-Challan notice. <mark>Pay now</mark> to avoid a legal hold. Install <mark>echallan-update.apk</mark></p>
              <span className="landing-fake-url">echallan-pay.example</span>
            </div>
            <div className="landing-sms-caption"><FileImage size={13} /> DEMONSTRATION MESSAGE, NOT A LIVE SCAN</div>
          </div>

          <div className="landing-signal-card">
            <div className="landing-signal-heading">
              <span className="landing-signal-icon"><Eye size={16} /></span>
              <div><strong>Signals to review</strong><small>Example result</small></div>
              <span className="landing-signal-total">03 CUES</span>
            </div>
            <div className="landing-signal-row"><span>01</span><div><strong>Urgent pressure</strong><small>“Pay now” asks for quick action</small></div><i /></div>
            <div className="landing-signal-row"><span>02</span><div><strong>Official identity mentioned</strong><small>e-Challan claim needs checking</small></div><i /></div>
            <div className="landing-signal-row"><span>03</span><div><strong>APK install requested</strong><small>Unexpected app downloads are risky</small></div><i /></div>
            <div className="landing-signal-foot"><ShieldCheck size={15} /><span>These cues are warnings, not proof.</span></div>
          </div>
          <div className="landing-scene-stamp" aria-hidden="true"><span>CHECK</span><strong>FIRST</strong></div>
        </div>
      </section>

      <div className="landing-loop-ribbon" aria-label="Pehra safety loop">
        <span>THE PEHRA SAFETY LOOP</span>
        <strong>PAUSE</strong><i />
        <strong>UNDERSTAND</strong><i />
        <strong>RESPOND</strong><i />
        <strong>CONNECT</strong>
      </div>

      <section className="landing-loop-section" id="pehra-loop" aria-labelledby="loop-title">
        <div className="landing-section-heading">
          <div>
            <span className="landing-kicker">The Pehra difference</span>
            <h2 id="loop-title">From the first pause<br />to a useful next step.</h2>
          </div>
          <p>Pehra brings prevention, explainable checks, practical response guidance, and private community follow-up into one student-safety platform.</p>
        </div>
        <div className="landing-loop-grid">
          {LOOP_STEPS.map(({ number, icon: Icon, title, copy }) => (
            <article className="landing-loop-card" key={number}>
              <div className="landing-loop-card-top"><span>{number}</span><Icon size={19} strokeWidth={1.8} /></div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-checks-section" aria-labelledby="checks-title">
        <div className="landing-checks-intro">
          <span className="landing-kicker">Built for real messages</span>
          <h2 id="checks-title">Two kinds of harm.<br /><em>One place to act.</em></h2>
          <p>The same community space supports a better reply and a more informed response to suspicious messages.</p>
          <Link to="/register" className="landing-inline-link">Explore Pehra <ArrowRight size={16} /></Link>
        </div>
        <div className="landing-checks-list">
          <article className="landing-check-card">
            <div className="landing-check-index">01 <span>COMMUNITY CARE</span></div>
            <div className="landing-check-icon"><MessageSquare size={19} /></div>
            <div><h3>Before a post reaches people</h3><p>Flag concerning wording, highlight matched terms, and offer a rewrite. People choose whether to edit or continue.</p></div>
            <span className="landing-check-tag">PAUSE BEFORE POSTING</span>
          </article>
          <article className="landing-check-card">
            <div className="landing-check-index">02 <span>CYBER SAFETY</span></div>
            <div className="landing-check-icon"><ShieldCheck size={19} /></div>
            <div><h3>When a message feels wrong</h3><p>Check an SMS, WhatsApp message, screenshot, or voice note for cues such as urgency, credential requests, and APK installs.</p></div>
            <div className="landing-media-types"><span><MessageSquare size={13} /> TEXT</span><span><FileImage size={13} /> IMAGE</span><span><Mic size={13} /> VOICE</span></div>
          </article>
        </div>
          <p className="landing-capability-note">Image text reading and voice transcription depend on available services and language packs. Results guide review. They do not prove fraud.</p>
      </section>

      <section className="landing-help-section" id="real-world-help" aria-labelledby="help-title">
        <div className="landing-help-heading">
          <span className="landing-kicker">When the next step matters</span>
          <h2 id="help-title">Reach the right place<br />for help in India.</h2>
          <p>Pehra helps you prepare. Official services handle reports and urgent action.</p>
        </div>
        <div className="landing-help-grid">
          <a className="landing-help-card landing-helpline" href="tel:1930">
            <span className="landing-help-label">MONEY LOST TO FRAUD</span>
            <strong>1930</strong>
            <span className="landing-help-description">Call the cyber financial fraud helpline quickly.</span>
            <span className="landing-help-link">Call now <ArrowUpRight size={15} /></span>
          </a>
          <a className="landing-help-card" href="https://cybercrime.gov.in/" target="_blank" rel="noreferrer">
            <span className="landing-help-label">CYBERCRIME REPORTING</span>
            <strong>National Cyber Crime Portal</strong>
            <span className="landing-help-description">Report cybercrime through the official government portal.</span>
            <span className="landing-help-link">Open portal <ArrowUpRight size={15} /></span>
          </a>
          <a className="landing-help-card" href="https://sancharsaathi.gov.in/sfc/" target="_blank" rel="noreferrer">
            <span className="landing-help-label">SUSPECTED FRAUD COMMUNICATION</span>
            <strong>Sanchar Saathi Chakshu</strong>
            <span className="landing-help-description">Report suspected fraud calls, SMS, and WhatsApp messages.</span>
            <span className="landing-help-link">Open Chakshu <ArrowUpRight size={15} /></span>
          </a>
        </div>
      </section>

      <section className="landing-privacy-band">
        <div className="landing-privacy-mark"><ShieldCheck size={21} /></div>
        <div><span className="landing-kicker">People stay in control</span><h2>A signal is a reason to review, not a verdict.</h2></div>
        <p>Pehra does not confirm guilt, verify a link, or file a police complaint. Choose whether to edit, report, or ask a community moderator for review.</p>
      </section>
    </main>

    <footer className="landing-footer">
      <Link to="/" className="landing-footer-brand"><BrandLockup compact /></Link>
      <span>For safer campus conversations and everyday digital life.</span>
      <div><Link to="/login">Sign in</Link><Link to="/register">Join Pehra</Link></div>
    </footer>
  </div>
);

export default Landing;
