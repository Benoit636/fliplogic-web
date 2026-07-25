'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/auth'
import apiClient from '@/lib/api'
import { Logo } from '@/components/Logo'

export default function LoginPage() {
  const router = useRouter()
  const login = useAuthStore((state) => state.login)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.post('/api/auth/login', { email, password })
      login(data.token, data.user)
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-8">
        <div className="flex justify-center mb-6">
          <Logo height={80} priority />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 text-center mb-2">Sign in</h1>
        <p className="text-gray-500 text-center text-sm mb-6">Welcome back. Sign in to appraise vehicles.</p>
        {error && <p className="text-red-500 text-sm mb-4 text-center">{error}</p>}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@dealership.com"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition disabled:opacity-50"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <p className="text-center text-sm text-gray-500 mt-4">
          New dealer? <a href="/register" className="text-blue-600 hover:underline">Request access</a>
        </p>
      </div>
    </div>
  )
}
