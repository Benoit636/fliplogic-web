'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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
if (res.ok) {
router.push('/dashboard');
} else {
setError('Invalid email or password');
}
} catch {
setError('Connection error. Please try again.');
} finally {
setLoading(false);
}
};

return (
<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'}}>
<div style={{width:'100%',maxWidth:'420px',padding:'0 24px'}}>
<div style={{textAlign:'center',marginBottom:'32px'}}>
<div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:'64px',height:'64px',borderRadius:'16px',background:'linear-gradient(135deg, #e94560, #0f3460)',marginBottom:'16px'}}>
<span style={{color:'white',fontSize:'24px',fontWeight:'bold'}}>FL</span>
</div>
<h1 style={{fontSize:'36px',fontWeight:'bold',color:'white',margin:'0 0 8px 0'}}>FlipLogic</h1>
<p style={{color:'#93c5fd',margin:0}}>Vehicle Appraisal Platform</p>
</div>
<div style={{background:'rgba(255,255,255,0.1)',backdropFilter:'blur(10px)',borderRadius:'24px',padding:'32px',border:'1px solid rgba(255,255,255,0.2)'}}>
<h2 style={{color:'white',fontSize:'20px',fontWeight:'600',marginBottom:'24px'}}>Welcome back</h2>
{error && <div style={{background:'rgba(239,68,68,0.2)',border:'1px solid rgba(239,68,68,0.5)',borderRadius:'8px',padding:'12px',marginBottom:'16px'}}><p style={{color:'#fca5a5',margin:0,fontSize:'14px'}}>{error}</p></div>}
<form onSubmit={handleLogin}>
<div style={{marginBottom:'16px'}}>
<label style={{display:'block',color:'#bfdbfe',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Email</label>
<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="dealer@example.com" required style={{width:'100%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:'12px',padding:'12px 16px',color:'white',fontSize:'16px',outline:'none',boxSizing:'border-box'}} />
</div>
<div style={{marginBottom:'24px'}}>
<label style={{display:'block',color:'#bfdbfe',fontSize:'14px',fontWeight:'500',marginBottom:'8px'}}>Password</label>
<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={{width:'100%',background:'rgba(255,255,255,0.1)',border:'1px solid rgba(255,255,255,0.2)',borderRadius:'12px',padding:'12px 16px',color:'white',fontSize:'16px',outline:'none',boxSizing:'border-box'}} />
</div>
<button type="submit" disabled={loading} style={{width:'100%',padding:'14px',borderRadius:'12px',border:'none',background:'linear-gradient(135deg, #e94560, #0f3460)',color:'white',fontSize:'16px',fontWeight:'600',cursor:'pointer'}}>
{loading ? 'Signing in...' : 'Sign In'}
</button>
</form>
</div>
<p style={{textAlign:'center',color:'#60a5fa',fontSize:'14px',marginTop:'24px'}}>© 2026 FlipLogic. All rights reserved.</p>
</div>
</div>
);
}
