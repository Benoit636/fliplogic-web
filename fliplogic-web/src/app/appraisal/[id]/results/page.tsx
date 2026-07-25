'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';

interface Comparable {
  title: string;
  price: number;
  mileage: number | null;
  location: string;
  url: string;
  source: string;
}

type Verdict = 'Buy' | 'Negotiate' | 'Walk Away';
type GrossProfitRating = 'Strong' | 'Acceptable' | 'Thin' | 'Negative / Avoid' | 'Unknown';
type RiskLevel = 'Low' | 'Medium' | 'High';

interface BuyDecisionReport {
  vehicle: {
    vin: string;
    year: number | null;
    make: string | null;
    model: string | null;
    mileage: number | null;
    condition: string | null;
  };
  marketSnapshot: {
    lowRetail: number | null;
    avgRetail: number | null;
    highRetail: number | null;
    comparablesUsed: number;
    sufficientData: boolean;
  };
  reconEstimate: {
    amount: number;
    source: 'manual' | 'estimated';
    notes: string[];
  };
  profitCalculation: {
    conservativeRetailValue: number | null;
    targetGrossProfit: number;
    riskBufferPct: number;
    riskBuffer: number | null;
    recommendedMaxBuyPrice: number | null;
    expectedGrossProfit: number | null;
    grossProfitRating: GrossProfitRating;
  };
  riskAndConfidence: {
    daysToSellRisk: RiskLevel;
    confidenceScore: number;
    confidenceReasons: string[];
    missingData: string[];
  };
  verdict: {
    decision: Verdict;
    explanation: string;
  };
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
  buyDecisionReport: BuyDecisionReport | null;
}

const currency = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

const fmt = (n: number | null) => (n == null ? '—' : currency.format(n));

const VERDICT_STYLES: Record<Verdict, { badge: string; card: string; heading: string }> = {
  Buy: {
    badge: 'bg-accent-100 text-accent-800',
    card: 'bg-accent-50 border-accent-200',
    heading: 'text-accent-800',
  },
  Negotiate: {
    badge: 'bg-amber-100 text-amber-800',
    card: 'bg-amber-50 border-amber-200',
    heading: 'text-amber-800',
  },
  'Walk Away': {
    badge: 'bg-danger-100 text-danger-700',
    card: 'bg-danger-50 border-danger-100',
    heading: 'text-danger-700',
  },
};

const RISK_STYLES: Record<RiskLevel, string> = {
  Low: 'bg-accent-100 text-accent-800',
  Medium: 'bg-amber-100 text-amber-800',
  High: 'bg-danger-100 text-danger-700',
};

const GROSS_PROFIT_STYLES: Record<GrossProfitRating, string> = {
  Strong: 'bg-accent-100 text-accent-800',
  Acceptable: 'bg-accent-100 text-accent-800',
  Thin: 'bg-amber-100 text-amber-800',
  'Negative / Avoid': 'bg-danger-100 text-danger-700',
  Unknown: 'bg-neutral-100 text-neutral-600',
};

function ConfidenceBar({ score }: { score: number }) {
  const color = score >= 70 ? 'bg-accent-500' : score >= 40 ? 'bg-amber-500' : 'bg-danger-500';
  return (
    <div className="w-full h-2 bg-neutral-200 rounded-full overflow-hidden">
      <div className={`h-full ${color}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
    </div>
  );
}

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

  const { appraisal, buyDecisionReport: report } = results;
  const vehicleTitle = [appraisal.vehicle_year, appraisal.vehicle_make, appraisal.vehicle_model]
    .filter(Boolean)
    .join(' ') || 'Vehicle';

  if (appraisal.status !== 'complete' || !report) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
        <Card className="p-8 max-w-md text-center">
          <h2 className="text-lg font-bold text-neutral-900 mb-2">
            Report not ready yet
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

  const verdictStyle = VERDICT_STYLES[report.verdict.decision];

  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <Link href="/dashboard" className="inline-block mb-4">
            <Logo height={52} />
          </Link>
          <div className="flex items-center justify-between">
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
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10 space-y-8">
        {/* Final Verdict — prominent, at the top */}
        <Card className={`p-6 border-2 ${verdictStyle.card}`}>
          <div className="flex items-center gap-3 mb-3">
            <span className={`inline-flex px-3 py-1 rounded-full text-sm font-bold uppercase tracking-wide ${verdictStyle.badge}`}>
              {report.verdict.decision}
            </span>
            {report.profitCalculation.recommendedMaxBuyPrice != null && (
              <span className="text-sm text-neutral-500">
                Recommended max buy price:{' '}
                <span className="font-semibold text-neutral-900">
                  {fmt(report.profitCalculation.recommendedMaxBuyPrice)}
                </span>
              </span>
            )}
          </div>
          <p className={`text-lg font-medium ${verdictStyle.heading}`}>
            {report.verdict.explanation}
          </p>
        </Card>

        {/* Vehicle Summary */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Vehicle Summary</h2>
          <Card className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-neutral-500">VIN</p>
                <p className="font-mono text-neutral-900">{report.vehicle.vin}</p>
              </div>
              <div>
                <p className="text-neutral-500">Year / Make / Model</p>
                <p className="text-neutral-900">
                  {[report.vehicle.year, report.vehicle.make, report.vehicle.model].filter(Boolean).join(' ') || 'Incomplete'}
                </p>
              </div>
              <div>
                <p className="text-neutral-500">Mileage</p>
                <p className="text-neutral-900">
                  {report.vehicle.mileage != null ? `${report.vehicle.mileage.toLocaleString()} km` : 'Not provided'}
                </p>
              </div>
              <div>
                <p className="text-neutral-500">Condition</p>
                <p className="text-neutral-900 capitalize">
                  {report.vehicle.condition || 'Not provided'}
                </p>
              </div>
            </div>
          </Card>
        </div>

        {/* Market Snapshot */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Market Snapshot</h2>
          <Card className="p-5">
            {report.marketSnapshot.sufficientData ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Low Retail</p>
                  <p className="text-xl font-bold text-neutral-900">{fmt(report.marketSnapshot.lowRetail)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Avg Retail</p>
                  <p className="text-xl font-bold text-neutral-900">{fmt(report.marketSnapshot.avgRetail)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">High Retail</p>
                  <p className="text-xl font-bold text-neutral-900">{fmt(report.marketSnapshot.highRetail)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Comparables Used</p>
                  <p className="text-xl font-bold text-neutral-900">{report.marketSnapshot.comparablesUsed}</p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-danger font-medium">
                Insufficient market data — no comparable listings were found for this vehicle.
              </p>
            )}
          </Card>
        </div>

        {/* Recon Estimate */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Recon Estimate</h2>
          <Card className="p-5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-2xl font-bold text-neutral-900">{fmt(report.reconEstimate.amount)}</p>
              <span className="text-xs font-medium px-2 py-1 rounded-full bg-neutral-100 text-neutral-600 uppercase tracking-wide">
                {report.reconEstimate.source === 'manual' ? 'Manually entered' : 'Estimated'}
              </span>
            </div>
            {report.reconEstimate.notes.length > 0 && (
              <ul className="text-sm text-neutral-500 list-disc list-inside space-y-0.5 mt-2">
                {report.reconEstimate.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        {/* Profit Calculation */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Profit Calculation</h2>
          <Card className="p-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Conservative Retail Value</p>
                <p className="text-lg font-bold text-neutral-900">{fmt(report.profitCalculation.conservativeRetailValue)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Recommended Max Buy Price</p>
                <p className="text-lg font-bold text-primary-900">{fmt(report.profitCalculation.recommendedMaxBuyPrice)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">Target Gross Profit</p>
                <p className="text-lg font-bold text-neutral-900">{fmt(report.profitCalculation.targetGrossProfit)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">
                  Risk Buffer ({(report.profitCalculation.riskBufferPct * 100).toFixed(1)}%)
                </p>
                <p className="text-lg font-bold text-neutral-900">{fmt(report.profitCalculation.riskBuffer)}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-4 border-t border-neutral-100">
              <p className="text-sm text-neutral-500">Expected Gross Profit:</p>
              <p className="text-xl font-bold text-neutral-900">{fmt(report.profitCalculation.expectedGrossProfit)}</p>
              <span className={`text-xs font-medium px-2 py-1 rounded-full uppercase tracking-wide ${GROSS_PROFIT_STYLES[report.profitCalculation.grossProfitRating]}`}>
                {report.profitCalculation.grossProfitRating}
              </span>
            </div>
          </Card>
        </div>

        {/* Risk + Confidence */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Risk &amp; Confidence</h2>
          <Card className="p-5 space-y-5">
            <div className="flex items-center gap-3">
              <p className="text-sm text-neutral-500">Days-to-Sell Risk:</p>
              <span className={`text-xs font-medium px-2 py-1 rounded-full uppercase tracking-wide ${RISK_STYLES[report.riskAndConfidence.daysToSellRisk]}`}>
                {report.riskAndConfidence.daysToSellRisk}
              </span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-neutral-500">Confidence Score</p>
                <p className="text-sm font-semibold text-neutral-900">
                  {report.riskAndConfidence.confidenceScore} / 100
                </p>
              </div>
              <ConfidenceBar score={report.riskAndConfidence.confidenceScore} />
              <ul className="text-sm text-neutral-500 list-disc list-inside space-y-0.5 mt-3">
                {report.riskAndConfidence.confidenceReasons.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
            </div>

            {report.riskAndConfidence.missingData.length > 0 && (
              <div>
                <p className="text-sm text-neutral-500 mb-1">Missing data</p>
                <div className="flex flex-wrap gap-2">
                  {report.riskAndConfidence.missingData.map((item, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-full bg-neutral-100 text-neutral-600">
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Recommended Action */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">Recommended Action</h2>
          <Card className={`p-5 border ${verdictStyle.card}`}>
            <p className={`font-medium ${verdictStyle.heading}`}>{report.verdict.explanation}</p>
          </Card>
        </div>

        {/* Comparables */}
        <div>
          <h2 className="text-lg font-bold text-neutral-900 mb-4">
            Comparable Listings
            <span className="text-neutral-400 font-normal text-sm ml-2">
              ({report.marketSnapshot.comparablesUsed} analyzed)
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
