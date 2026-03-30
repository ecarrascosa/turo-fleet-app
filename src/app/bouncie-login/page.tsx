'use client';

import { useState } from 'react';

export default function BouncieLogin() {
  const [status, setStatus] = useState('');
  const [token, setToken] = useState('');

  const handleGoogleLogin = () => {
    // Redirect to Bouncie's auth page - this time as a full navigation
    const clientId = 'eduardo-carrascosa';
    const redirectUri = encodeURIComponent('http://localhost:3000/api/bouncie/callback');
    window.location.href = `https://auth.bouncie.com/dialog/authorize?response_type=code&client_id=${clientId}&redirect_uri=${redirectUri}`;
  };

  return (
    <div style={{ 
      minHeight: '100vh', display: 'flex', justifyContent: 'center', 
      alignItems: 'center', fontFamily: '-apple-system, sans-serif',
      background: '#f5f5f5'
    }}>
      <div style={{
        background: 'white', padding: 40, borderRadius: 12,
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)', textAlign: 'center',
        maxWidth: 400
      }}>
        <h2>Connect Bouncie</h2>
        <p style={{ color: '#666' }}>
          If the Bouncie login page shows a 404, try opening it in a different browser 
          or clearing your cache.
        </p>
        <button 
          onClick={handleGoogleLogin}
          style={{
            padding: '12px 24px', background: '#4285f4', color: 'white',
            border: 'none', borderRadius: 6, fontSize: 16, cursor: 'pointer',
            marginBottom: 16
          }}
        >
          Connect with Bouncie →
        </button>
        <p style={{ fontSize: 12, color: '#999', marginTop: 20 }}>
          This will redirect you to Bouncie&apos;s login page.
        </p>
      </div>
    </div>
  );
}
