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
      useAuthStore.getState().login(data.token, data.user)
      router.push('/dashboard')
    } catch (err) {
      setError('Unable to reach the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-10">
        <div className="flex justify-center mb-6">
          <img
            src="/fliplogic_logo.png"
            alt="FlipLogic"
            className="w-44 h-auto"
          />
        </div>

        <h2 className="text-2xl font-semibold text-center text-slate-900 mb-1">
          Sign in
        </h2>
        <p className="text-sm text-slate-500 text-center mb-7">
          Welcome back — let&apos;s appraise some vehicles.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white text-slate-900 border border-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800 transition"
              placeholder="you@dealership.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="password"
                className="block text-xs font-medium text-slate-600"
              >
                Password
              </label>
              
                href="#"
                className="text-xs font-medium text-blue-800 hover:text-blue-900"
              >
                Forgot?
              </a>
            </div>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-white text-slate-900 border border-slate-300 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-800 focus:border-blue-800 transition"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-800 hover:bg-blue-900 disabled:bg-blue-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors duration-200"
          >
            {loading ? 'Signing in…' : 'Sign in →'}
          </button>
        </form>

        <div className="text-center mt-6 text-sm text-slate-500">
          New dealer?{' '}
          
            href="/register"
            className="text-blue-800 hover:text-blue-900 font-semibold"
          >
            Request access
          </a>
        </div>
      </div>
    </main>
  )
}
