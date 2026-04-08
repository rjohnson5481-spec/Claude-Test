import React, { useEffect } from 'react';
import { auth, googleProvider } from '../../firebase.js';
import { signInWithPopup, signOut } from 'firebase/auth';

export function LoadingScreen() {
  return (
    <div className="p-fullscreen">
      <div className="p-spinner" />
      <div style={{fontFamily:"'Lexend',sans-serif",color:'var(--forest)',fontSize:'1rem'}}>Iron &amp; Light Johnson Academy</div>
    </div>
  );
}

export function LoginScreen() {
  const handleLogin = () => signInWithPopup(auth, googleProvider).catch(console.error);
  return (
    <div className="p-fullscreen">
      <div className="p-login-card">
        <div className="p-school-hero">Iron &amp; Light<br />Johnson Academy</div>
        <div className="p-tagline-hero">Faith · Knowledge · Strength</div>
        <p className="p-login-title">Sign in to access the Daily Planner</p>
        <button className="p-btn p-google-btn p-btn-block" onClick={handleLogin}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{marginRight:8}}><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/><path fill="#FBBC05" d="M10.53 28.59c-.5-1.45-.79-3-.79-4.59s.29-3.14.79-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/></svg>
          Sign in with Google
        </button>
        <p style={{marginTop:'1.25rem',fontSize:'0.75rem',color:'var(--text-muted)'}}>Access is restricted to authorized users</p>
      </div>
      <a href="/" className="p-home-link">← Home</a>
    </div>
  );
}

export function AccessDeniedScreen({ user }) {
  return (
    <div className="p-fullscreen">
      <div className="p-login-card">
        <div style={{fontSize:'2rem',marginBottom:'0.75rem'}}>🚫</div>
        <div className="p-school-hero">Access Denied</div>
        <p style={{margin:'0.75rem 0',fontSize:'0.875rem',color:'var(--text-secondary)'}}>
          {user?.email} is not authorized to access this application.
        </p>
        <button className="p-btn p-btn-outline p-btn-block" onClick={() => signOut(auth)}>
          Sign Out
        </button>
      </div>
    </div>
  );
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 3000);
    return () => clearTimeout(t);
  }, [onDone]);
  return <div className="p-toast">{message}</div>;
}

// Chat bubble renderer — handles <button> tags from AI responses
export function renderChatBubble(text, onApply) {
  const displayText = text.replace(/\s*\[APPLY_DATA\][\s\S]*?\[\/APPLY_DATA\]\s*/g, '').trim();
  const parts = displayText.split(/(<button[^>]*>[\s\S]*?<\/button>)/gi);
  return parts.map((part, i) => {
    const m = part.match(/<button[^>]*>([\s\S]*?)<\/button>/i);
    if (m) {
      return (
        <button
          key={i}
          style={{
            display:'inline-block', marginTop:'0.6rem',
            background:'var(--navy)', color:'white', border:'none',
            borderRadius:'7px', padding:'0.45rem 1rem',
            fontFamily:'inherit', fontSize:'0.85rem',
            fontWeight:600, cursor:'pointer'
          }}
          onClick={onApply}
        >{m[1]}</button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}
