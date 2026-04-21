'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

export default function DashboardPage() {
  const router = useRouter();
  const { authUser, firebaseUser } = useAuthStore();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!authUser || !firebaseUser) {
      router.push('/login');
    }
  }, [authUser, firebaseUser, router]);

  if (!authUser) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="font-display text-2xl font-bold text-primary-900">
              FlipLogic
            </h1>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-neutral-600">
                Welcome, {authUser?.displayName || 'Dealer'}
              </span>
              <Button variant="outline" size="sm">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Welcome section */}
        <div className="mb-12">
          <div className="grid grid-cols-1 gap-6">
            {/* Trial status */}
            {authUser.subscriptionStatus === 'trial' && (
              <Card className="p-6 bg-accent-50 border-accent-200">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-semibold text-accent-900">
                      🎉 Your 14-Day Free Trial is Active
                    </h3>
                    <p className="text-accent-700 mt-1">
                      Expires on {new Date(authUser.trialEndsAt!).toLocaleDateString()}
                    </p>
                  </div>
                  <Link href="/subscription">
                    <Button variant="primary">Upgrade Plan</Button>
                  </Link>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {/* New Appraisal */}
          <Card className="p-8 hover:shadow-md transition-shadow cursor-pointer" elevated>
            <Link href="/appraisal/new" className="block">
              <div className="text-4xl mb-4">📋</div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                New Appraisal
              </h2>
              <p className="text-neutral-600 mb-6">
                Start a new vehicle appraisal. Get instant market value and pricing strategy.
              </p>
              <Button variant="primary">Create Appraisal →</Button>
            </Link>
          </Card>

          {/* View Listings */}
          <Card className="p-8 hover:shadow-md transition-shadow cursor-pointer" elevated>
            <Link href="/listings" className="block">
              <div className="text-4xl mb-4">📊</div>
              <h2 className="text-2xl font-bold text-neutral-900 mb-2">
                My Listings
              </h2>
              <p className="text-neutral-600 mb-6">
                View all active listings, track sales, and monitor profitability.
              </p>
              <Button variant="primary">View Listings →</Button>
            </Link>
          </Card>
        </div>

        {/* Stats section */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Total Appraisals
            </div>
            <div className="text-3xl font-bold text-primary-900">0</div>
            <p className="text-neutral-500 text-xs mt-2">this month</p>
          </Card>

          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Active Listings
            </div>
            <div className="text-3xl font-bold text-primary-900">0</div>
            <p className="text-neutral-500 text-xs mt-2">ready to sell</p>
          </Card>

          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Sold Vehicles
            </div>
            <div className="text-3xl font-bold text-accent-600">0</div>
            <p className="text-neutral-500 text-xs mt-2">this month</p>
          </Card>

          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Total Profit
            </div>
            <div className="text-3xl font-bold text-accent-600">$0</div>
            <p className="text-neutral-500 text-xs mt-2">lifetime</p>
          </Card>
        </div>
      </main>
    </div>
  );
}
