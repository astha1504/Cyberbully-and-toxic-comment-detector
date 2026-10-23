import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { registerUser } from '../services/api';
import { getApiErrorMessage } from '../utils/errorMessages';
import { motion } from 'framer-motion';
import { ArrowUpRight, Eye, EyeOff, HeartHandshake, ShieldCheck, ScanSearch, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import BrandLockup from '../components/BrandLockup';
import './Auth.css';

const Register = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name || !email || !password) {
      toast.error('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      const { data } = await registerUser({
          username: name,
          email: email,
          password: password
      });
      login(data.user, data.token);
      toast.success('Account created successfully!');
      navigate('/');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Registration failed. Please try again.'));
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
            <h1>Good communities make space for everyone.</h1>
            <p>Join a community built around thoughtful conversations, clearer signals, and practical safety support.</p>
            <div className="auth-feature-list">
              <div className="auth-feature"><span><ShieldCheck size={18} /></span><div><strong>Pause before you post</strong><small>Review a message and choose how to respond.</small></div></div>
              <div className="auth-feature"><span><ScanSearch size={18} /></span><div><strong>Understand scam signals</strong><small>Check suspicious texts, screenshots, and voice notes.</small></div></div>
              <div className="auth-feature"><span><HeartHandshake size={18} /></span><div><strong>Keep communities thoughtful</strong><small>Build better conversations with people around you.</small></div></div>
            </div>
          </div>
          <div className="auth-story-footer"><span><i /> A calmer corner of the internet</span><span>PEHRA · INDIA FIRST</span></div>
        </div>
        <div className="auth-orbit auth-orbit-one" /><div className="auth-orbit auth-orbit-two" />
        <div className="auth-hero-shield"><img src="/pehra-mark.svg" alt="" /></div>
      </section>

      <section className="auth-panel">
        <div className="auth-mobile-brand"><BrandLockup compact /></div>
        <motion.div className="auth-container" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
          <div className="auth-card">
            <div className="auth-header">
              <span className="auth-form-kicker">START YOUR ACCOUNT</span>
              <h2>Join your community</h2>
              <p className="auth-subtitle">Create your Pehra account.</p>
            </div>
            <form className="auth-form" onSubmit={handleSubmit} id="register-form">
              <label className="auth-field" htmlFor="register-name"><span>Full name</span>
                <input type="text" placeholder="Full Name" value={name} onChange={(e) => setName(e.target.value)} className="auth-input" id="register-name" autoComplete="name" />
              </label>
              <label className="auth-field" htmlFor="register-email"><span>Email address</span>
                <input type="email" placeholder="Email address" value={email} onChange={(e) => setEmail(e.target.value)} className="auth-input" id="register-email" autoComplete="email" />
              </label>
              <label className="auth-field" htmlFor="register-password"><span>Password</span>
                <div className="input-group">
                  <input type={showPassword ? 'text' : 'password'} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className="auth-input" id="register-password" autoComplete="new-password" />
                  <button type="button" className="password-toggle" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                <small className="auth-field-hint">Use at least 6 characters.</small>
              </label>
              <motion.button type="submit" className="auth-btn" disabled={loading} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} id="register-submit">
                {loading ? <div className="spinner" /> : <><UserPlus size={17} /><span>Sign Up</span><ArrowUpRight size={17} /> </>}
              </motion.button>
            </form>
            <p className="auth-switch">Already have an account? <Link to="/login" className="auth-link">Sign in</Link></p>
            <p className="auth-privacy-note"><ShieldCheck size={14} /> A safer community starts with people like you.</p>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default Register;
