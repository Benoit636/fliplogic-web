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
  condition_data: { condition?: 'excellent' | 'good' | 'average' | 'rough' } | null;
  custom_recon_cost: string | number | null;
  target_gross_profit: string | number | null;
  target_gross_profit_mode: 'dollar' | 'percentage' | null;
  notes: string | null;
  buy_decision_report: {
    verdict: { decision: Verdict };
    profitCalculation: {
      recommendedMaxBuyPrice: number | null;
      expectedGrossProfit: number | null;
    };
    riskAndConfidence: { confidenceScore: number };
    marketSnapshot: {
      lowRetail: number | null;
      avgRetail: number | null;
      highRetail: number | null;
      comparablesUsed: number | null;
    };
    appraisalInput: {
      appraisalToolValue: number | null;
      knownRisks: string | null;
    };
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

function toNumberOrNull(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Shapes one captured appraisal into a parity-test fixture case, matching
// the { label, testA, testB } format scripts/parity-batch.mjs expects in
// the backend repo. testB is a deep copy of testA rather than a second,
// independently-entered appraisal — the same real numbers, submitted the
// way the Phase 5 test actually calls for ("identical data entered
// manually"), not a second live observation of the vehicle.
function buildFixtureCase(a: AppraisalRow) {
  const report = a.buy_decision_report!; // caller has already checked this is non-null
  const vehicleTitle = [a.vehicle_year, a.vehicle_make, a.vehicle_model].filter(Boolean).join(' ') || 'Vehicle';

  const testA = {
    vin: a.vin,
    year: a.vehicle_year,
    make: a.vehicle_make,
    model: a.vehicle_model,
    trim: a.vehicle_trim,
    mileage: a.vehicle_mileage,
    condition: a.condition_data?.condition ?? null,
    appraisalToolValue: report.appraisalInput.appraisalToolValue,
    lowRetail: report.marketSnapshot.lowRetail,
    avgRetail: report.marketSnapshot.avgRetail,
    highRetail: report.marketSnapshot.highRetail,
    comparableCount: report.marketSnapshot.comparablesUsed,
    estimatedReconCost: toNumberOrNull(a.custom_recon_cost),
    targetGrossProfit: toNumberOrNull(a.target_gross_profit),
    targetGrossProfitMode: a.target_gross_profit_mode,
    notes: a.notes,
    knownRisks: report.appraisalInput.knownRisks,
  };

  return {
    label: `${vehicleTitle} — ${a.vin} — captured ${new Date(a.created_at).toLocaleDateString()}`,
    testA,
    testB: JSON.parse(JSON.stringify(testA)),
  };
}

function buildFixturesFile(rows: AppraisalRow[]) {
  const cases: ReturnType<typeof buildFixtureCase>[] = [];
  const skipped: string[] = [];

  for (const a of rows) {
    const report = a.buy_decision_report;
    if (!report || report.marketSnapshot.lowRetail == null || report.marketSnapshot.avgRetail == null || report.marketSnapshot.highRetail == null) {
      skipped.push(`${a.vin || a.id} — incomplete, no retail range on this report`);
      continue;
    }
    if (a.vehicle_year == null || !a.vehicle_make || !a.vehicle_model) {
      skipped.push(`${a.vin || a.id} — missing year/make/model`);
      continue;
    }
    cases.push(buildFixtureCase(a));
  }

  const file = {
    _note: `Exported from FlipLogic /listings on ${new Date().toISOString()} — real captured appraisals, not example data. testB mirrors testA's values (identical data, entered the other way), per the Phase 5 parity definition.`,
    cases,
  };

  return { file, skipped };
}

export default function ListingsPage() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const hasHydrated = useAuthStore((state) => state.hasHydrated);

  const [appraisals, setAppraisals] = useState<AppraisalRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exportOutput, setExportOutput] = useState<{ json: string; caseCount: number; skipped: string[] } | null>(null);
  const [copied, setCopied] = useState(false);

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

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllOnPage = () => {
    setSelected((prev) => {
      const allSelected = appraisals.every((a) => prev.has(a.id));
      if (allSelected) return new Set();
      return new Set(appraisals.map((a) => a.id));
    });
  };

  const handleExport = () => {
    const rows = appraisals.filter((a) => selected.has(a.id));
    const { file, skipped } = buildFixturesFile(rows);
    setExportOutput({ json: JSON.stringify(file, null, 2), caseCount: file.cases.length, skipped });
    setCopied(false);
  };

  const copyExport = async () => {
    if (!exportOutput) return;
    try {
      await navigator.clipboard.writeText(exportOutput.json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-secure context) —
      // the textarea below is the fallback: click in, select all, copy.
    }
  };

  const downloadExport = () => {
    if (!exportOutput) return;
    const blob = new Blob([exportOutput.json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'parity-fixtures.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!hasHydrated || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <p className="text-neutral-500">Loading your appraisals...</p>
      </div>
    );
  }

  const allOnPageSelected = appraisals.length > 0 && appraisals.every((a) => selected.has(a.id));

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
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-primary-900">My Appraisals</h1>
            <p className="text-neutral-500 mt-1">
              {total === 0
                ? 'Every Buy Decision Report FlipLogic generates for your account will show up here.'
                : `${total} appraisal${total === 1 ? '' : 's'} captured.`}
            </p>
          </div>

          {appraisals.length > 0 && (
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-neutral-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={selectAllOnPage}
                  className="rounded border-neutral-300"
                />
                Select all on page
              </label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={selected.size === 0}
              >
                Export {selected.size > 0 ? selected.size : ''} as Parity Fixture
              </Button>
            </div>
          )}
        </div>

        {error && (
          <Card className="p-4 mb-6 bg-danger-50 border-danger-100">
            <p className="text-sm text-danger-700">{error}</p>
          </Card>
        )}

        {exportOutput && (
          <Card className="p-5 mb-6 border-accent-200 bg-accent-50">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="font-semibold text-neutral-900">
                  {exportOutput.caseCount} case{exportOutput.caseCount === 1 ? '' : 's'} ready
                </p>
                <p className="text-xs text-neutral-500">
                  Paste this into <code className="font-mono">parity-fixtures.json</code>, or send it directly.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportOutput(null)}
                className="text-neutral-400 hover:text-neutral-600 text-sm"
              >
                Close
              </button>
            </div>

            {exportOutput.skipped.length > 0 && (
              <div className="mb-3 text-xs text-amber-800 bg-amber-100 rounded-md p-3">
                <p className="font-medium mb-1">Skipped {exportOutput.skipped.length} (incomplete data):</p>
                <ul className="list-disc list-inside space-y-0.5">
                  {exportOutput.skipped.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}

            {exportOutput.caseCount > 0 && (
              <>
                <textarea
                  readOnly
                  value={exportOutput.json}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full h-64 font-mono text-xs bg-white border border-neutral-200 rounded-md p-3 mb-3"
                />
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" onClick={copyExport}>
                    {copied ? 'Copied ✓' : 'Copy to Clipboard'}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadExport}>
                    Download parity-fixtures.json
                  </Button>
                </div>
              </>
            )}
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
                <div key={a.id} className="grid grid-cols-2 md:grid-cols-[repeat(13,minmax(0,1fr))] gap-3 md:gap-4 items-center p-5 hover:bg-neutral-50 transition-colors">
                  <div className="flex items-center md:col-span-1">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelected(a.id)}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Select ${vehicleTitle} for export`}
                      className="rounded border-neutral-300"
                    />
                  </div>

                  <Link href={`/appraisal/${a.id}/results`} className="contents">
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
                </div>
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
