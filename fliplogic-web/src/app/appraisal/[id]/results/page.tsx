'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

interface Comparable {
  title: string;
  price: number;
  mileage: number | null;
  location: string;
  url: string;
  source: string;
}

interface PricingTier {
  price: number;
  profitMargin: number;
  profit: number;
}

interface AppraisalResults {
  appraisal: {
    id: string;
    vin: string;
    vehicle_year: number | null;
    vehicle_make: string | null;
    vehicle_model: string | null;
    status: string;
    comps_analyzed: number | null;
    comps_data: Comparable[] | null;
    created_at: string;
  };
  pricingStrategy: {
    day0to20: PricingTier;
    day21to30: PricingTier;
    day31plus: PricingTier;
  } | null;
  analysis: {
    acquisitionCost: number;
    reconCost: number;
    marketValue: number;
    totalInvestment: number;
    comparablesAnalyzed: number;
  } | null;
}

const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const token = useAuthStore((state) => state.token);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const [results, setResults] = useState<AppraisalResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!hasHydrated) return; // wait until the store has checked localStorage

    if (!token) {
      router.push('/login');
      return;
    }

    const fetchResults = async () => {
      try {
        const { data } = await apiClient.get(`/api/appraisals/${params.id}`);
        setResults(data);
      } catch (err: any) {
        setError(err.response?.data?.message || err.message || 'Something went wrong');
      } finally {
        setLoading(false);
      }
    };

    fetchResults();
  }, [hasHydrated, token, params.id, router]);

  if (!hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Loading results...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <Card className="p-8 max-w-md text-center">
          <p className="text-danger font-medium mb-4">{error}</p>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (!results) return null;

  const { appraisal, pricingStrategy, analysis } = results;
  const vehicleTitle = [appraisal.vehicle_year, appraisal.vehicle_make, appraisal.vehicle_model]
    .filter(Boolean)
    .join(' ') || 'Vehicle';

  if (appraisal.status !== 'complete' || !analysis || !pricingStrategy) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-neutral-900 mb-2">
            Analysis not ready yet
          </h2>
          <p className="text-neutral-600 mb-6">
            This appraisal hasn't finished analyzing. Try submitting it again from the dashboard.
          </p>
          <Link href="/dashboard">
            <Button variant="outline">Back to Dashboard</Button>
          </Link>
        </Card>
      </div>
    );
  }

  const tiers: { key: keyof typeof pricingStrategy; label: string; sub: string; highlight?: boolean }[] = [
    { key: 'day0to20', label: 'Day 0–20', sub: 'Fast turn', highlight: true },
    { key: 'day21to30', label: 'Day 21–30', sub: 'Standard' },
    { key: 'day31plus', label: 'Day 31+', sub: 'Clear it out' },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-6 flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-primary-900">
              {vehicleTitle}
            </h1>
            <p className="text-sm text-neutral-500 mt-1 font-mono">{appraisal.vin}</p>
          </div>
          <Link href="/appraisal/new">
            <Button variant="outline" size="sm">New Appraisal</Button>
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="p-5">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
              Market Value
            </p>
            <p className="text-2xl font-bold text-primary-900">
              {currency.format(analysis.marketValue)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
              Acquisition Cost
            </p>
            <p className="text-2xl font-bold text-neutral-900">
              {currency.format(analysis.acquisitionCost)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
              Recon Cost
            </p>
            <p className="text-2xl font-bold text-neutral-900">
              {currency.format(analysis.reconCost)}
            </p>
          </Card>
          <Card className="p-5">
            <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
              Total Investment
            </p>
            <p className="text-2xl font-bold text-neutral-900">
              {currency.format(analysis.totalInvestment)}
            </p>
          </Card>
        </div>

        {/* Pricing strategy */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Pricing Strategy</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tiers.map(({ key, label, sub, highlight }) => {
              const tier = pricingStrategy[key];
              return (
                <Card
                  key={key}
                  elevated={highlight}
                  className={`p-6 ${highlight ? 'border-primary-300 border-2' : ''}`}
                >
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide">
                    {label}
                  </p>
                  <p className="text-xs text-neutral-400 mb-3">{sub}</p>
                  <p className="text-3xl font-bold text-neutral-900 mb-2">
                    {currency.format(tier.price)}
                  </p>
                  <p className="text-sm text-accent-600 font-medium">
                    +{currency.format(tier.profit)} profit ({(tier.profitMargin * 100).toFixed(0)}%)
                  </p>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Comparables */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">
            Comparable Listings
            <span className="text-neutral-400 font-normal text-sm ml-2">
              ({analysis.comparablesAnalyzed} analyzed)
            </span>
          </h2>
          <Card className="divide-y divide-neutral-100">
            {appraisal.comps_data && appraisal.comps_data.length > 0 ? (
              appraisal.comps_data.slice(0, 10).map((comp, i) => (
                <div key={i} className="p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-900 truncate">
                      {comp.title}
                    </p>
                    <p className="text-xs text-neutral-500 truncate">
                      {comp.mileage ? `${comp.mileage.toLocaleString()} km` : 'Mileage unknown'}
                      {comp.location ? ` · ${comp.location}` : ''}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-neutral-900">
                      {currency.format(comp.price)}
                    </p>
                    {comp.url && (
                      <a
                        href={comp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary-600 hover:underline"
                      >
                        View listing
                      </a>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="p-6 text-sm text-neutral-500 text-center">
                No comparable listings recorded.
              </p>
            )}
          </Card>
        </div>
      </main>
    </div>
  );
}
