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

const handleLogin = async (e: React.FormEvent) => {
e.preventDefault();
setError('');
setLoading(true);
try {
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ email, password }),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Sign in failed');
router.push('/dashboard');
} catch (err: any) {
setError(err.message);
} finally {
setLoading(false);
}
};

return (
<div style={{
minHeight: '100vh', display: 'flex',
alignItems: 'center', justifyContent: 'center',
padding: '16px',
background: 'linear-gradient(135deg, #EEF2FF 0%, #ffffff 50%, #ECFDF5 100%)',
position: 'relative', overflow: 'hidden',
}}>
<div style={{
position: 'absolute', top: '-80px', right: '-80px',
width: '320px', height: '320px', borderRadius: '50%',
background: '#0D3A6B', opacity: 0.07,
}} />
<div style={{
position: 'absolute', bottom: '-80px', left: '-80px',
width: '320px', height: '320px', borderRadius: '50%',
background: '#00875A', opacity: 0.07,
}} />
<div style={{
position: 'relative', zIndex: 10,
width: '100%', maxWidth: '420px',
background: 'white', borderRadius: '20px',
boxShadow: '0 20px 60px rgba(13,58,107,0.12)',
padding: '40px 36px',
}}>
<div style={{ textAlign: 'center', marginBottom: '32px' }}>
<img src="/fliplogic-mark.png" alt="FlipLogic"
style={{ width: '72px', height: '72px', margin: '0 auto 16px' }} />
<h1 style={{ fontSize: '28px', fontWeight: '700', color: '#0D3A6B', margin: '0 0 4px' }}>
FlipLogic
</h1>
<p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
Vehicle Appraisal Platform
</p>
</div>
<h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}>
Welcome back
</h2>
<p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
Sign in to access your appraisals
</p>
{error && (
<div style={{
background: '#FEF2F2', border: '1px solid #FECACA',
borderRadius: '10px', padding: '12px 16px',
marginBottom: '16px', color: '#DC2626', fontSize: '14px',
}}>
{error}
</div>
)}
<form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
<div>
<label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
Email
</label>
<input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
placeholder="dealer@example.com" required
style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #D1D5DB',
borderRadius: '10px', fontSize: '15px', color: '#111827',
outline: 'none', boxSizing: 'border-box' }}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<div>
<label style={{ display: 'block', fontSize: '14px', fontWeight: '500', color: '#374151', marginBottom: '6px' }}>
Password
</label>
<input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
placeholder="••••••••" required
style={{ width: '100%', padding: '12px 14px', border: '1.5px solid #D1D5DB',
borderRadius: '10px', fontSize: '15px', color: '#111827',
outline: 'none', boxSizing: 'border-box' }}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<button type="submit" disabled={loading}
style={{ width: '100%', padding: '13px',
background: loading ? '#6B8FAF' : '#0D3A6B',
color: 'white', border: 'none', borderRadius: '10px',
fontSize: '16px', fontWeight: '600',
cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px' }}>
{loading ? 'Signing in...' : 'Sign In'}
</button>
</form>
<p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#6B7280' }}>
Don't have an account?{' '}
<Link href="/register" style={{ color: '#00875A', fontWeight: '600', textDecoration: 'none' }}>
Create Account
</Link>
</p>
<p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '12px', marginTop: '20px', marginBottom: 0 }}>
© 2026 FlipLogic. All rights reserved.
</p>
</div>
</div>
);
}
