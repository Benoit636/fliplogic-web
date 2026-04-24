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
<div className="min-h-screen flex items-center justify-center" style={{background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)'}}>
<div className="w-full max-w-md px-6">
<div className="text-center mb-8">
<div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{background: 'linear-gradient(135deg, #e94560, #0f3460)'}}>
<span className="text-white text-2xl font-bold">FL</span>
</div>
<h1 className="text-4xl font-bold text-white mb-2">FlipLogic</h1>
<p className="text-blue-300">Vehicle Appraisal Platform</p>
</div>
<div className="bg-white bg-opacity-10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl border border-white border-opacity-20">
<h2 className="text-xl font-semibold text-white mb-6">Welcome back</h2>
{error && (
<div className="bg-red-500 bg-opacity-20 border border-red-500 border-opacity-50 rounded-lg p-3 mb-4">
<p className="text-red-300 text-sm">{error}</p>
</div>
)}
<form onSubmit={handleLogin} className="space-y-4">
<div>
<label className="block text-blue-200 text-sm font-medium mb-2">Email</label>
<input
type="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
className="w-full bg-white bg-opacity-10 border border-white border-opacity-20 rounded-xl px-4 py-3 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
placeholder="dealer@example.com"
required
/>
</div>
<div>
<label className="block text-blue-200 text-sm font-medium mb-2">Password</label>
<input
type="password"
value={password}
onChange={(e) => setPassword(e.target.value)}
className="w-full bg-white bg-opacity-10 border border-white border-opacity-20 rounded-xl px-4 py-3 text-white placeholder-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
placeholder="••••••••"
required
/>
</div>
<button
type="submit"
disabled={loading}
className="w-full py-3 rounded-xl font-semibold text-white mt-2 transition-all"
style={{background: 'linear-gradient(135deg, #e94560, #0f3460)'}}
>
{loading ? 'Signing in...' : 'Sign In'}
</button>
</form>
</div>
<p className="text-center text-blue-400 text-sm mt-6">© 2026 FlipLogic. All rights reserved.</p>
</div>
</div>
);
}
