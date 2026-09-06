'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';

type Verdict = 'Buy' | 'Negotiate' | 'Walk Away';

interface AppraisalRow {
  id: string;
  vin: string;
  vehicle_year: number | null;
  vehicle_make: string | null;
  vehicle_model: string | null;
  vehicle_trim: string | null;
  vehicle_mileage: number | null;
  status: string;
  created_at: string;
  buy_decision_report: {
    verdict: { decision: Verdict };
    profitCalculation: {
      recommendedMaxBuyPrice: number | null;
      expectedGrossProfit: number | null;
    };
    riskAndConfidence: { confidenceScore: number };
  } | null;
}

const PAGE_SIZE = 25;

const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

const fmt = (n: number | null | undefined) => (n == null ? '—' : currency.format(n));

const VERDICT_BADGE: Record<Verdict, string> = {
  Buy: 'bg-accent-100 text-accent-800',
  Negotiate: 'bg-amber-100 text-amber-800',
  'Walk Away': 'bg-danger-100 text-danger-700',
};

export default function ListingsPage() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const fetchPage = useCallback(async (offset: number) => {
    const { data } = await apiClient.get('/api/appraisals', {
      params: { limit: PAGE_SIZE, offset },
    });
    return data as { appraisals: AppraisalRow[]; total: number };
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;

    if (!token) {
      router.push('/login');
      return;
    }

    fetchPage(0)
      .then(({ appraisals: rows, total: count }) => {
        setAppraisals(rows);
        setTotal(count);
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message || 'Something went wrong');
      })
      .finally(() => setLoading(false));
  }, [hasHydrated, token, router, fetchPage]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const { appraisals: rows } = await fetchPage(appraisals.length);
      setAppraisals((prev) => [...prev, ...rows]);
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Something went wrong');
    } finally {
      setLoadingMore(false);
    }
  };

  if (!hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Loading your appraisals...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link href="/dashboard">
              <Logo height={44} />
            </Link>
            <Link href="/appraisal/new">
              <Button variant="primary" size="sm">New Appraisal</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold text-primary-900">My Appraisals</h1>
          <p className="text-neutral-500 mt-1">
            {total === 0
              ? 'Every Buy Decision Report FlipLogic generates for your account will show up here.'
              : `${total} appraisal${total === 1 ? '' : 's'} captured.`}
          </p>
        </div>

        {error && (
          <Card className="p-4 mb-6 bg-danger-50 border-danger-100">
            <p className="text-sm text-danger-700">{error}</p>
          </Card>
        )}

        {appraisals.length === 0 && !error ? (
          <Card className="p-10 text-center">
            <p className="text-neutral-600 mb-6">
              No appraisals yet — submit one manually or capture one straight from vAuto with
              FlipLogic Capture, and it'll show up here.
            </p>
            <Link href="/appraisal/new">
              <Button variant="primary">Create Your First Appraisal →</Button>
            </Link>
          </Card>
        ) : (
          <Card className="divide-y divide-neutral-100">
            {appraisals.map((a) => {
              const vehicleTitle = [a.vehicle_year, a.vehicle_make, a.vehicle_model].filter(Boolean).join(' ') || 'Vehicle';
              const subtitleParts = [
                a.vehicle_trim,
                a.vehicle_mileage != null ? `${a.vehicle_mileage.toLocaleString()} km` : null,
              ].filter(Boolean);
              const report = a.buy_decision_report;

              return (
                <Link
                  key={a.id}
                  href={`/appraisal/${a.id}/results`}
                  className="grid grid-cols-2 md:grid-cols-12 gap-3 md:gap-4 items-center p-5 hover:bg-neutral-50 transition-colors"
                >
                  <div className="col-span-2 md:col-span-4 min-w-0">
                    <p className="font-medium text-neutral-900 truncate">{vehicleTitle}</p>
                    <p className="text-xs text-neutral-500 font-mono truncate">{a.vin}</p>
                    {subtitleParts.length > 0 && (
                      <p className="text-xs text-neutral-400 truncate">{subtitleParts.join(' · ')}</p>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Verdict</p>
                    {report ? (
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wide ${VERDICT_BADGE[report.verdict.decision]}`}>
                        {report.verdict.decision}
                      </span>
                    ) : (
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-neutral-100 text-neutral-500">
                        {a.status === 'draft' ? 'Incomplete' : a.status}
                      </span>
                    )}
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Max Buy</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {fmt(report?.profitCalculation.recommendedMaxBuyPrice)}
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <p className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Expected Gross</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {fmt(report?.profitCalculation.expectedGrossProfit)}
                    </p>
                  </div>

                  <div className="md:col-span-1">
                    <p className="text-xs text-neutral-400 uppercase tracking-wide mb-0.5">Confidence</p>
                    <p className="text-sm font-semibold text-neutral-900">
                      {report ? `${report.riskAndConfidence.confidenceScore}/100` : '—'}
                    </p>
                  </div>

                  <div className="md:col-span-1 text-right">
                    <p className="text-xs text-neutral-400">
                      {new Date(a.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              );
            })}
          </Card>
        )}

        {appraisals.length < total && (
          <div className="flex justify-center mt-6">
            <Button variant="outline" onClick={loadMore} isLoading={loadingMore}>
              Load more
            </Button>
          </div>
        )}
      </main>
    </div>
  );
}
