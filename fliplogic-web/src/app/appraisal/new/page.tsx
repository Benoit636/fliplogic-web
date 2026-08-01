'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/api';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Select } from '@/components/Select';
import { Textarea } from '@/components/Textarea';
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';
import { VinScanner } from '@/components/VinScanner';

// Shared with the backend's condition-based recon cost defaults
// (excellent/good/average/rough) — see buyDecisionReport.js.
const CONDITION_OPTIONS = [
  { value: '', label: 'Not sure / skip' },
  { value: 'excellent', label: 'Excellent' },
  { value: 'good', label: 'Good' },
  { value: 'average', label: 'Average' },
  { value: 'rough', label: 'Rough' },
];

const currentYear = new Date().getFullYear();

const optionalPositiveNumber = (invalidMessage: string) =>
  z.preprocess((val) => {
    if (val === '' || val === undefined || val === null) return undefined;
    const num = typeof val === 'string' ? Number(val) : val;
    return typeof num === 'number' && Number.isNaN(num) ? undefined : num;
  }, z
    .number({ invalid_type_error: invalidMessage })
    .min(0, `${invalidMessage} (must be 0 or greater)`)
    .max(999999, `${invalidMessage} (too large)`)
    .optional());

const requiredPositiveNumber = (invalidMessage: string) =>
  z.preprocess((val) => {
    if (val === '' || val === undefined || val === null) return undefined;
    const num = typeof val === 'string' ? Number(val) : val;
    return typeof num === 'number' && Number.isNaN(num) ? undefined : num;
  }, z
    .number({ invalid_type_error: invalidMessage })
    .min(0, `${invalidMessage} (must be 0 or greater)`)
    .max(999999, `${invalidMessage} (too large)`));

const appraisalSchema = z
  .object({
    vin: z.string().length(17, 'VIN must be exactly 17 characters'),
    year: z.preprocess((val) => {
      if (val === '' || val === undefined || val === null) return undefined;
      const num = typeof val === 'string' ? Number(val) : val;
      return typeof num === 'number' && Number.isNaN(num) ? undefined : num;
    }, z
      .number({ invalid_type_error: 'Enter the model year' })
      .int()
      .min(1980, 'Enter a valid year')
      .max(currentYear + 1, 'Enter a valid year')),
    make: z.string().min(1, 'Make is required'),
    model: z.string().min(1, 'Model is required'),
    trim: z.string().optional(),
    mileage: requiredPositiveNumber('Enter the current mileage'),
    condition: z.enum(['', 'excellent', 'good', 'average', 'rough']).optional(),
    appraisalToolValue: optionalPositiveNumber('Enter a valid appraisal tool value'),
    lowRetail: requiredPositiveNumber('Enter the low retail value'),
    avgRetail: requiredPositiveNumber('Enter the average retail value'),
    highRetail: requiredPositiveNumber('Enter the high retail value'),
    comparableCount: optionalPositiveNumber('Enter a valid comparable count'),
    reconCostEstimate: optionalPositiveNumber('Enter a valid recon cost'),
    targetGrossProfit: optionalPositiveNumber('Enter a valid target profit'),
    notes: z.string().max(2000).optional(),
    knownRisks: z.string().max(2000).optional(),
  })
  .refine((data) => data.lowRetail <= data.avgRetail && data.avgRetail <= data.highRetail, {
    message: 'Retail values must satisfy low ≤ average ≤ high',
    path: ['avgRetail'],
  });

type AppraisalFormData = z.infer<typeof appraisalSchema>;

export default function NewAppraisalPage() {
  const router = useRouter();
  const { authUser, hasHydrated } = useAuthStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profitMode, setProfitMode] = useState<'dollar' | 'percentage'>('dollar');

  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [vinDecodeStatus, setVinDecodeStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<AppraisalFormData>({
    resolver: zodResolver(appraisalSchema),
  });

  useEffect(() => {
    if (hasHydrated && !authUser) {
      router.push('/login');
    }
  }, [hasHydrated, authUser, router]);

  // Best-effort — a dealer scanning/typing a VIN shouldn't have to also
  // type Year/Make/Model when the VIN already tells us that. Silently
  // leaves those fields alone (for manual entry) if the decode fails.
  const decodeVin = async (vin: string) => {
    if (!/^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)) return;

    setVinDecodeStatus('loading');
    try {
      const { data } = await apiClient.get(`/api/appraisals/decode-vin/${vin}`);
      setValue('year', data.year, { shouldValidate: true });
      setValue('make', data.make, { shouldValidate: true });
      if (data.model) setValue('model', data.model, { shouldValidate: true });
      if (data.trim) setValue('trim', data.trim);
      setVinDecodeStatus('done');
    } catch {
      setVinDecodeStatus('error');
    }
  };

  const onSubmit = async (data: AppraisalFormData) => {
    if (profitMode === 'percentage' && data.targetGrossProfit != null && data.targetGrossProfit > 100) {
      alert('Target gross profit percentage must be 100 or less');
      return;
    }

    try {
      setIsSubmitting(true);

      const response = await apiClient.post('/api/appraisals/manual', {
        vin: data.vin,
        year: data.year,
        make: data.make,
        model: data.model,
        trim: data.trim || undefined,
        mileage: data.mileage,
        condition: data.condition || undefined,
        appraisalToolValue: data.appraisalToolValue,
        lowRetail: data.lowRetail,
        avgRetail: data.avgRetail,
        highRetail: data.highRetail,
        comparableCount: data.comparableCount,
        estimatedReconCost: data.reconCostEstimate,
        targetGrossProfit: data.targetGrossProfit,
        targetGrossProfitMode: data.targetGrossProfit != null ? profitMode : undefined,
        notes: data.notes || undefined,
        knownRisks: data.knownRisks || undefined,
      });

      router.push(`/appraisal/${response.data.id}/results`);
    } catch (error: any) {
      console.error('Appraisal error:', error);
      alert(error.response?.data?.error || 'An error occurred');
      setIsSubmitting(false);
    }
  };

  if (!hasHydrated || !authUser) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <Link href="/dashboard" className="inline-block mb-3">
            <Logo height={52} />
          </Link>
          <h1 className="font-display text-2xl font-bold text-primary-900">
            Buy Decision Report
          </h1>
          <p className="text-neutral-600 mt-1">
            Enter this vehicle's appraisal data — should you buy it, and what's the max you can pay?
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <Card className="p-8">
          <form onSubmit={handleSubmit(onSubmit)}>
            <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4">
              Vehicle
            </h2>

            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-neutral-700">
                  VIN<span className="text-danger ml-1">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="text-xs font-medium text-primary-600 hover:text-primary-700"
                >
                  Scan VIN Barcode
                </button>
              </div>
              {(() => {
                const vinField = register('vin');
                return (
                  <Input
                    {...vinField}
                    onBlur={(e) => {
                      vinField.onBlur(e);
                      decodeVin(e.target.value.trim().toUpperCase());
                    }}
                    placeholder="e.g., 3G1YY22G965452168"
                    error={errors.vin?.message}
                    maxLength={17}
                    autoFocus
                    required
                    className="text-lg tracking-wide"
                  />
                );
              })()}
              {vinDecodeStatus === 'loading' && (
                <p className="text-xs text-neutral-400 mt-1">Looking up Year/Make/Model from VIN...</p>
              )}
              {vinDecodeStatus === 'done' && (
                <p className="text-xs text-accent-700 mt-1">Year/Make/Model filled in from VIN — double-check before submitting.</p>
              )}
              {vinDecodeStatus === 'error' && (
                <p className="text-xs text-neutral-400 mt-1">Couldn't decode this VIN — enter Year/Make/Model manually.</p>
              )}
            </div>

            {isScannerOpen && (
              <VinScanner
                onScan={(vin) => {
                  setValue('vin', vin, { shouldValidate: true });
                  setIsScannerOpen(false);
                  decodeVin(vin);
                }}
                onClose={() => setIsScannerOpen(false)}
              />
            )}

            <div className="grid grid-cols-2 gap-4 mb-6">
              <Input
                {...register('year', { valueAsNumber: true })}
                type="number"
                label="Year"
                placeholder="e.g., 2022"
                error={errors.year?.message}
                required
              />
              <Input
                {...register('mileage', { valueAsNumber: true })}
                type="number"
                label="Mileage (km)"
                placeholder="e.g., 42000"
                error={errors.mileage?.message}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <Input
                {...register('make')}
                label="Make"
                placeholder="e.g., Lincoln"
                error={errors.make?.message}
                required
              />
              <Input
                {...register('model')}
                label="Model"
                placeholder="e.g., Nautilus"
                error={errors.model?.message}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <Input
                {...register('trim')}
                label="Trim"
                placeholder="e.g., Reserve"
                error={errors.trim?.message}
              />
              <Select
                {...register('condition')}
                label="Condition"
                error={errors.condition?.message}
              >
                {CONDITION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Select>
            </div>

            <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4 mt-8">
              Appraisal Data
            </h2>
            <p className="text-xs text-neutral-500 -mt-2 mb-4">
              Enter the values from your dealership's appraisal tool (vAuto, AutoTrader, Dealertrack, etc.)
            </p>

            <Input
              {...register('appraisalToolValue')}
              type="number"
              label="Appraisal Tool Value ($)"
              placeholder="e.g., 39500"
              error={errors.appraisalToolValue?.message}
              helpText="Shown for reference only — not used in the buy calculation."
              className="mb-6"
            />

            <div className="grid grid-cols-3 gap-4 mb-2">
              <Input
                {...register('lowRetail')}
                type="number"
                label="Low Retail Value"
                placeholder="e.g., 38888"
                error={errors.lowRetail?.message}
                required
              />
              <Input
                {...register('avgRetail')}
                type="number"
                label="Average Retail Value"
                placeholder="e.g., 40988"
                error={errors.avgRetail?.message}
                required
              />
              <Input
                {...register('highRetail')}
                type="number"
                label="High Retail Value"
                placeholder="e.g., 52490"
                error={errors.highRetail?.message}
                required
              />
            </div>
            <p className="text-xs text-neutral-500 mt-1 mb-6">
              The retail price range for comparable vehicles, from your appraisal tool.
            </p>

            <Input
              {...register('comparableCount')}
              type="number"
              label="Comparable Count"
              placeholder="e.g., 8"
              error={errors.comparableCount?.message}
              helpText="Number of comparable listings behind the retail range above."
              className="mb-6"
            />

            <Input
              {...register('reconCostEstimate')}
              type="number"
              label="Estimated Recon Cost ($)"
              placeholder="e.g., 1500"
              error={errors.reconCostEstimate?.message}
              helpText="Leave blank to use a condition-based estimate."
              className="mb-6"
            />

            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-neutral-700">
                Target Gross Profit
              </label>
              <div className="inline-flex rounded-md border border-neutral-300 overflow-hidden text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setProfitMode('dollar')}
                  className={`px-3 py-1 transition-colors ${
                    profitMode === 'dollar'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  $ Amount
                </button>
                <button
                  type="button"
                  onClick={() => setProfitMode('percentage')}
                  className={`px-3 py-1 border-l border-neutral-300 transition-colors ${
                    profitMode === 'percentage'
                      ? 'bg-primary-600 text-white'
                      : 'bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  % of Value
                </button>
              </div>
            </div>
            <Input
              {...register('targetGrossProfit')}
              type="number"
              placeholder={profitMode === 'percentage' ? 'e.g., 10' : 'e.g., 3000'}
              error={errors.targetGrossProfit?.message}
              min={0}
              max={profitMode === 'percentage' ? 100 : undefined}
            />
            <p className="text-xs text-neutral-500 mt-2 mb-8">
              {profitMode === 'percentage'
                ? "Target profit as a percentage of the vehicle's retail value. Leave blank to use $3,000."
                : 'Minimum profit you want on this deal. Leave blank to use $3,000.'}
            </p>

            <h2 className="text-sm font-bold text-neutral-500 uppercase tracking-wide mb-4">
              Notes
            </h2>

            <Textarea
              {...register('notes')}
              label="Buyer Notes"
              placeholder="Anything worth remembering about this vehicle or deal..."
              error={errors.notes?.message}
              rows={2}
              className="mb-6"
            />

            <Textarea
              {...register('knownRisks')}
              label="Known Risks"
              placeholder="e.g., accident history, mechanical concerns, title issues..."
              error={errors.knownRisks?.message}
              rows={2}
              className="mb-8"
            />

            <Button
              type="submit"
              isLoading={isSubmitting}
              disabled={isSubmitting}
              size="lg"
              className="w-full"
            >
              Get Buy Decision →
            </Button>
          </form>
        </Card>
      </main>
    </div>
  );
}
