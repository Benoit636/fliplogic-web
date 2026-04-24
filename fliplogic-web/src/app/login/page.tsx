'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
const router = useRouter();
const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [error, setError] = useState('');

const handleLogin = async (e: React.FormEvent) => {
e.preventDefault();
setError('');
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
}
};

return (
<div className="min-h-screen bg-gray-50 flex items-center justify-center">
<div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
<h1 className="text-3xl font-bold text-center text-blue-600 mb-2">FlipLogic</h1>
<p className="text-center text-gray-500 mb-6">Vehicle Appraisal Platform</p>
{error && <p className="text-red-500 text-sm mb-4">{error}</p>}
<form onSubmit={handleLogin}>
<div className="mb-4">
<label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
<input
type="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
required
/>
</div>
<div className="mb-6">
<label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
<input
type="password"
value={password}
onChange={(e) => setPassword(e.target.value)}
className="w-full border rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
required
/>
</div>
<button
type="submit"
className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium"
>
Sign In
</button>
</form>
</div>
</div>
);
}
