'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'

export default function LoginPage() {
const router = useRouter()
const [email, setEmail] = useState('')
const [password, setPassword] = useState('')
const [error, setError] = useState('')
const [loading, setLoading] = useState(false)

const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
e.preventDefault()
setError('')
setLoading(true)

try {
const res = await fetch(
`${process.env.NEXT_PUBLIC_API_URL}/api/auth/login`,
{
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({ email, password }),
}
)

if (!res.ok) {
const data = await res.json().catch(() => ({}))
setError(data.message || 'Invalid email or password.')
return
}

const data = await res.json()

// Store the token however your app expects (adjust key name if needed)
useAuthStore.getState().login(data.token, data.user)

router.push('/dashboard')
} catch (err) {
setError('Unable to reach the server. Please try again.')
} finally {
setLoading(false)
}
}

return (
<main className="min-h-screen flex items-center justify-center bg-gray-950 px-4">
<div className="w-full max-w-md bg-gray-900 rounded-2xl shadow-xl p-8">
<h1 className="text-3xl font-bold text-white mb-2 text-center">FlipLogic</h1>
<p className="text-gray-400 text-center mb-8 text-sm">Sign in to your account</p>

<form onSubmit={handleSubmit} className="space-y-5">
<div>
<label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-1">
Email
</label>
<input
id="email"
type="email"
required
autoComplete="email"
value={email}
onChange={(e) => setEmail(e.target.value)}
className="w-full px-4 py-2.5 rounded-lg bg-gray-800 text-white border border-gray-700
focus:outline-none focus:ring-2 focus:ring-blue-500"
placeholder="you@example.com"
/>
</div>

<div>
<label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-1">
Password
</label>
<input
id="password"
type="password"
required
autoComplete="current-password"
value={password}
onChange={(e) => setPassword(e.target.value)}
className="w-full px-4 py-2.5 rounded-lg bg-gray-800 text-white border border-gray-700
focus:outline-none focus:ring-2 focus:ring-blue-500"
placeholder="••••••••"
/>
</div>

{error && (
<p className="text-red-400 text-sm text-center">{error}</p>
)}

<button
type="submit"
disabled={loading}
className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-800
disabled:cursor-not-allowed text-white font-semibold rounded-lg
transition-colors duration-200"
>
{loading ? 'Signing in…' : 'Sign In'}
</button>
</form>
</div>
</main>
)
}
