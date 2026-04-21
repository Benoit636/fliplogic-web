'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import apiClient, { setAuthToken } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

const googleProvider = new GoogleAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

export default function LoginPage() {
  const router = useRouter();
  const { setFirebaseUser, setAuthUser, setToken, setLoading, setError, isLoading } =
    useAuthStore();
  const [error, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    // Check if already logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.push('/dashboard');
      }
    });

    return unsubscribe;
  }, [router]);

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setLocalError(null);

      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;

      // Send to backend
      const response = await apiClient.post('/auth/login', {
        firebaseUid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoUrl: user.photoURL,
      });

      const { user: authUser, token } = response.data;

      // Store in auth state
      setFirebaseUser(user);
      setAuthUser(authUser);
      setToken(token);
      setAuthToken(token);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Sign in failed';
      setLocalError(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    try {
      setLoading(true);
      setLocalError(null);

      const result = await signInWithPopup(auth, appleProvider);
      const user = result.user;

      // Send to backend
      const response = await apiClient.post('/auth/login', {
        firebaseUid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoUrl: user.photoURL,
      });

      const { user: authUser, token } = response.data;

      // Store in auth state
      setFirebaseUser(user);
      setAuthUser(authUser);
      setToken(token);
      setAuthToken(token);

      // Redirect to dashboard
      router.push('/dashboard');
    } catch (err: any) {
      const message = err.response?.data?.error || err.message || 'Sign in failed';
      setLocalError(message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary-50 via-white to-primary-50 flex items-center justify-center px-4">
      {/* Background decorative elements */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-primary-100 rounded-full opacity-20 -mr-48 -mt-48"></div>
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-100 rounded-full opacity-20 -ml-48 -mb-48"></div>

      {/* Main content */}
      <div className="relative z-10 w-full max-w-md">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-bold text-primary-900 mb-2">
            FlipLogic
          </h1>
          <p className="text-neutral-600">
            Professional Vehicle Appraisal Platform
          </p>
        </div>

        {/* Card */}
        <Card className="p-8 space-y-6" elevated>
          <div>
            <h2 className="text-2xl font-bold text-neutral-900 mb-2">
              Sign In
            </h2>
            <p className="text-neutral-600">
              Access your appraisals and listings
            </p>
          </div>

          {/* Error message */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-danger">{error}</p>
            </div>
          )}

          {/* Sign in options */}
          <div className="space-y-3">
            <Button
              onClick={handleGoogleSignIn}
              isLoading={isLoading}
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              <svg
                className="w-5 h-5 mr-2"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </Button>

            <Button
              onClick={handleAppleSignIn}
              isLoading={isLoading}
              disabled={isLoading}
              className="w-full"
              variant="outline"
            >
              <svg
                className="w-5 h-5 mr-2"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M17.05 13.5c-.91 2.18-.39 4.18 1.3 5.88 1.02 1.02 2.05 1.61 3.3 1.61.26-1.59-.04-2.89-1.3-4.15-1.27-1.27-3.39-1.96-3.3-3.34zm-4.5-4c1.74 0 3.25-.87 4-2.24-.55.13-1.24.23-2.05.23-3.31 0-6.04-2.45-6.04-5.45 0-1.65.67-3.16 1.75-4.25C8.35 0 7.85 0 7.12 0c-2.47 0-4.77 1.29-6.07 3.41C.27 5.18-.43 7.95.67 11.01c1.16 3.15 4.43 5.22 7.93 5.22 1.77 0 3.4-.39 4.75-1.05z" />
              </svg>
              Sign in with Apple
            </Button>
          </div>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-300"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-neutral-500">
                Professional dealers trust FlipLogic
              </span>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div className="text-center">
              <div className="text-2xl mb-1">⚡</div>
              <p className="text-neutral-600">Fast Appraisals</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">📊</div>
              <p className="text-neutral-600">Market Data</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">🔒</div>
              <p className="text-neutral-600">Secure</p>
            </div>
            <div className="text-center">
              <div className="text-2xl mb-1">💰</div>
              <p className="text-neutral-600">Profitable</p>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <p className="text-center text-xs text-neutral-500 mt-6">
          By signing in, you agree to our Terms of Service and Privacy Policy
        </p>
      </div>
    </div>
  );
}
