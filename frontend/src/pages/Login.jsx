import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUser } from '../services/authService';  // was '../services/api'
import API from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { motion } from 'framer-motion';
import { ArrowUpRight, Eye, EyeOff, LogIn, HeartHandshake, ShieldCheck, ScanSearch } from 'lucide-react';
import toast from 'react-hot-toast';
import BrandLockup from '../components/BrandLockup';
import './Auth.css';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    setLoading(true);
    try {
      const { data } = await loginUser({ email: email, password: password });
      const userRes = await API.get('/auth/me', {
        headers: { Authorization: `Bearer ${data.access_token}` }
      });
      login(userRes.data, data.access_token);
      toast.success('Welcome back!');
      navigate('/');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Login failed. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="auth-story-panel">
        <div className="auth-story-content">
          <BrandLockup light />
          <div className="auth-story-message">
            <span className="auth-eyebrow"><span /> DIGITAL SAFETY, BUILT FOR PEOPLE</span>
            <h1>A safer space starts with the way we connect.</h1>
            <p>Share with care, spot suspicious messages, and know where to turn when something feels wrong.</p>
            <div className="auth-feature-list">
              <div className="auth-feature"><span><ShieldCheck size={18} /></span><div><strong>Pause before you post</strong><small>Review a message and choose how to respond.</small></div></div>
              <div className="auth-feature"><span><ScanSearch size={18} /></span><div><strong>Understand scam signals</strong><small>Check suspicious texts, screenshots, and voice notes.</small></div></div>
              <div className="auth-feature"><span><HeartHandshake size={18} /></span><div><strong>Keep communities thoughtful</strong><small>Build better conversations with people around you.</small></div></div>
            </div>
          </div>
          <div className="auth-story-footer"><span><i /> A calmer corner of the internet</span><span>PEHRA · INDIA FIRST</span></div>
        </div>
        <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
        <div className="auth-hero-shield"><ShieldCheck size={68} strokeWidth={1.2} /></div>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand"><BrandLockup compact /></div>
        <motion.div className="auth-container" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="auth-card">
            <div className="auth-header">
              <span className="auth-form-kicker">WELCOME BACK</span>
              <h2>Sign in to your space</h2>
              <p className="auth-subtitle">Continue to your Pehra community.</p>
            </div>
            <form className="auth-form" onSubmit={handleSubmit} id="login-form">
              <label className="auth-field" htmlFor="login-email"><span>Email address</span>
                <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" id="login-email" autoComplete="email" />
              </label>
              <label className="auth-field" htmlFor="login-password"><span>Password</span>
                <div className="input-group">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" id="login-password" autoComplete="current-password" />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
              </label>
              <motion.button type="submit" className="auth-btn" disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} id="login-submit">
                {loading ? <div className="spinner" /> : <><span>Log In</span><ArrowUpRight size={17} /></>}
              </motion.button>
            </form>
            <p className="auth-switch">New to Pehra? <Link to="/register" className="auth-link">Create an account</Link></p>
            <p className="auth-privacy-note"><ShieldCheck size={14} /> Your community space is ready when you are.</p>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default Login;
