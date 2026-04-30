'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); // CRITICAL: stops the browser from doing a native form submit / page reload
    setError('');

    if (!email || !password) {
      setError('Please enter your email and password.');
      return;
    }

    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      setError('Configuration error: API URL is not set. Contact support.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      // Try to parse JSON regardless of status, so we can show backend error messages
      let data: any = null;
      try {
        data = await res.json();
      } catch {
        // ignore non-JSON bodies
      }

      if (!res.ok) {
        const msg =
          (data && (data.message || data.error)) ||
          (res.status === 401
            ? 'Invalid email or password.'
            : `Login failed (status ${res.status}).`);
        setError(msg);
        return;
      }

      // Save the auth token if the backend returns one
      if (data?.token) {
        try {
          localStorage.setItem('fliplogic_token', data.token);
        } catch {
          // localStorage might be blocked in some browsers; not fatal
        }
      }

      // Redirect to the dashboard on success
      router.push('/dashboard');
    } catch (err: any) {
      setError(
        err?.message
          ? `Network error: ${err.message}`
          : 'Network error. Please check your connection and try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f7f8fa',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'white',
          borderRadius: 12,
          padding: '40px 32px',
          boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div
            style={{
              width: 64,
              height: 64,
              borderRadius: '50%',
              border: '3px solid #1e3a5f',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 12l5 5L20 7"
                stroke="#22c55e"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 style={{ margin: 0, color: '#1e3a5f', fontSize: 28 }}>FlipLogic</h1>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 14 }}>
            Vehicle Appraisal Platform
          </p>
        </div>

        <h2 style={{ margin: '0 0 4px', fontSize: 22, color: '#0f172a' }}>Welcome back</h2>
        <p style={{ margin: '0 0 24px', color: '#64748b', fontSize: 14 }}>
          Sign in to access your appraisals
        </p>

        {/* The onSubmit handler is what makes the form work. e.preventDefault() inside
            handleSubmit stops the browser from reloading the page. */}
        <form onSubmit={handleSubmit} noValidate>
          <label
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 500,
              color: '#0f172a',
              marginBottom: 6,
            }}
          >
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="dealer@example.com"
            autoComplete="email"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 15,
              marginBottom: 16,
              boxSizing: 'border-box',
            }}
          />

          <label
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 500,
              color: '#0f172a',
              marginBottom: 6,
            }}
          >
            Password
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            disabled={loading}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 8,
              border: '1px solid #d1d5db',
              fontSize: 15,
              marginBottom: 16,
              boxSizing: 'border-box',
            }}
          />

          {error && (
            <div
              style={{
                background: '#fef2f2',
                color: '#b91c1c',
                border: '1px solid #fecaca',
                borderRadius: 8,
                padding: '10px 12px',
                fontSize: 14,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 8,
              border: 'none',
              background: loading ? '#64748b' : '#1e3a5f',
              color: 'white',
              fontSize: 16,
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 14, color: '#64748b' }}>
          Don&apos;t have an account?{' '}
          <Link href="/register" style={{ color: '#1e3a5f', fontWeight: 600 }}>
            Create Account
          </Link>
        </p>
      </div>
    </div>
  );
}
