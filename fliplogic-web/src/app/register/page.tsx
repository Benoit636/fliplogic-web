'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
const router = useRouter();
const [form, setForm] = useState({
dealershipName: '',
firstName: '',
lastName: '',
email: '',
password: '',
confirmPassword: '',
});
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
setForm({ ...form, [e.target.name]: e.target.value });
};

const handleRegister = async (e: React.FormEvent) => {
e.preventDefault();
setError('');
if (form.password !== form.confirmPassword) {
setError('Passwords do not match');
return;
}
if (form.password.length < 8) {
setError('Password must be at least 8 characters');
return;
}
setLoading(true);
try {
const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/auth/register`, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
dealershipName: form.dealershipName,
firstName: form.firstName,
lastName: form.lastName,
email: form.email,
password: form.password,
}),
});
const data = await res.json();
if (!res.ok) throw new Error(data.error || 'Registration failed');
router.push('/dashboard');
} catch (err: any) {
setError(err.message);
} finally {
setLoading(false);
}
};

const inputStyle = {
width: '100%', padding: '12px 14px',
border: '1.5px solid #D1D5DB', borderRadius: '10px',
fontSize: '15px', color: '#111827',
outline: 'none', boxSizing: 'border-box' as const,
};

const labelStyle = {
display: 'block', fontSize: '14px',
fontWeight: '500' as const, color: '#374151', marginBottom: '6px',
};

return (
<div style={{
minHeight: '100vh', display: 'flex',
alignItems: 'center', justifyContent: 'center',
padding: '24px 16px',
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
width: '100%', maxWidth: '440px',
background: 'white', borderRadius: '20px',
boxShadow: '0 20px 60px rgba(13,58,107,0.12)',
padding: '40px 36px',
}}>
<div style={{ textAlign: 'center', marginBottom: '28px' }}>
<img src="/fliplogic-mark (1).png" alt="FlipLogic"
style={{ width: '64px', height: '64px', margin: '0 auto 12px' }} />
<h1 style={{ fontSize: '26px', fontWeight: '700', color: '#0D3A6B', margin: '0 0 4px' }}>
FlipLogic
</h1>
<p style={{ color: '#6B7280', fontSize: '14px', margin: 0 }}>
Vehicle Appraisal Platform
</p>
</div>
<h2 style={{ fontSize: '20px', fontWeight: '600', color: '#111827', marginBottom: '6px' }}>
Create your account
</h2>
<p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '24px' }}>
Get started with FlipLogic today
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
<form onSubmit={handleRegister} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
<div>
<label style={labelStyle}>Dealership Name</label>
<input name="dealershipName" type="text" value={form.dealershipName}
onChange={handleChange} placeholder="Boudreau Auto Group" required
style={inputStyle}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
<div>
<label style={labelStyle}>First Name</label>
<input name="firstName" type="text" value={form.firstName}
onChange={handleChange} placeholder="Benoit" required
style={inputStyle}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<div>
<label style={labelStyle}>Last Name</label>
<input name="lastName" type="text" value={form.lastName}
onChange={handleChange} placeholder="Boudreau" required
style={inputStyle}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
</div>
<div>
<label style={labelStyle}>Email</label>
<input name="email" type="email" value={form.email}
onChange={handleChange} placeholder="dealer@example.com" required
style={inputStyle}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<div>
<label style={labelStyle}>Password</label>
<input name="password" type="password" value={form.password}
onChange={handleChange} placeholder="Min. 8 characters" required
style={inputStyle}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<div>
<label style={labelStyle}>Confirm Password</label>
<input name="confirmPassword" type="password" value={form.confirmPassword}
onChange={handleChange} placeholder="Re-enter password" required
style={inputStyle}
onFocus={(e) => e.target.style.borderColor = '#0D3A6B'}
onBlur={(e) => e.target.style.borderColor = '#D1D5DB'} />
</div>
<button type="submit" disabled={loading}
style={{
width: '100%', padding: '13px',
background: loading ? '#6B8FAF' : '#00875A',
color: 'white', border: 'none', borderRadius: '10px',
fontSize: '16px', fontWeight: '600',
cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px',
}}>
{loading ? 'Creating account...' : 'Create Account'}
</button>
</form>
<p style={{ textAlign: 'center', marginTop: '24px', fontSize: '14px', color: '#6B7280' }}>
Already have an account?{' '}
<Link href="/login" style={{ color: '#0D3A6B', fontWeight: '600', textDecoration: 'none' }}>
Sign In
</Link>
</p>
<p style={{ textAlign: 'center', color: '#9CA3AF', fontSize: '12px', marginTop: '20px', marginBottom: 0 }}>
© 2026 FlipLogic. All rights reserved.
</p>
</div>
</div>
);
}
