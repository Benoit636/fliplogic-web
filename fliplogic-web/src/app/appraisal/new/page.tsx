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
import { Card } from '@/components/Card';
import { Logo } from '@/components/Logo';

const appraisalSchema = z.object({
  vin: z.string().length(17, 'VIN must be exactly 17 characters'),
  mileage: z
    .number({ invalid_type_error: 'Enter the current mileage' })
    .min(0, 'Mileage must be 0 or greater')
    .max(999999, 'Enter a valid mileage'),
  reconCostEstimate: z.preprocess((val) => {
    if (val === '' || val === undefined || val === null) return undefined;
    const num = typeof val === 'string' ? Number(val) : val;
    return typeof num === 'number' && Number.isNaN(num) ? undefined : num;
  }, z
    .number({ invalid_type_error: 'Enter a valid recon cost' })
    .min(0, 'Recon cost must be 0 or greater')
    .max(999999, 'Enter a valid recon cost')
    .optional()),
});

type AppraisalFormData = z.infer<typeof appraisalSchema>;

export default function NewAppraisalPage() {
  const router = useRouter();
  const { authUser, hasHydrated } = useAuthStore();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appraisalId, setAppraisalId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AppraisalFormData>({
    resolver: zodResolver(appraisalSchema),
  });

  useEffect(() => {
    if (hasHydrated && !authUser) {
      router.push('/login');
    }
  }, [hasHydrated, authUser, router]);

  // Auto-trigger analyze step when appraisal is created
  useEffect(() => {
    if (step === 2 && appraisalId && !isSubmitting) {
      const analyzeAppraisal = async () => {
        try {
          setIsSubmitting(true);
          // Scraping comparables can legitimately take well over the
          // client's default 30s timeout, especially across retries —
          // give this specific request more room before giving up.
          await apiClient.post(`/api/appraisals/${appraisalId}/analyze`, undefined, {
            timeout: 150000,
          });
          router.push(`/appraisal/${appraisalId}/results`);
        } catch (error: any) {
          console.error('Analyze error:', error);
          alert(error.response?.data?.error || 'An error occurred during analysis');
          setIsSubmitting(false);
        }
      };
      analyzeAppraisal();
    }
  }, [step, appraisalId]);

  const onSubmit = async (data: AppraisalFormData) => {
    try {
      setIsSubmitting(true);

      const response = await apiClient.post('/api/appraisals', {
        vin: data.vin,
        mileage: data.mileage,
        customReconCost: data.reconCostEstimate,
        appraisalType: 'on-site',
        searchRadiusKm: 400,
      });

      setAppraisalId(response.data.id);
      setStep(2);
    } catch (error: any) {
      console.error('Appraisal error:', error);
      alert(error.response?.data?.error || 'An error occurred');
    } finally {
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
            New Appraisal
          </h1>
          <p className="text-neutral-600 mt-1">
            Enter a VIN to get an instant market-based appraisal
          </p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-12">
        {/* Step 1: VIN */}
        {step === 1 && (
          <Card className="p-8">
            <form onSubmit={handleSubmit(onSubmit)}>
              <Input
                {...register('vin')}
                label="Vehicle Identification Number (VIN)"
                placeholder="e.g., 3G1YY22G965452168"
                error={errors.vin?.message}
                maxLength={17}
                autoFocus
                className="text-lg tracking-wide"
              />
              <p className="text-xs text-neutral-500 mt-2 mb-6">
                17-character VIN, found on the dashboard, door jamb, or registration
              </p>

              <Input
                {...register('mileage', { valueAsNumber: true })}
                type="number"
                label="Current Mileage (km)"
                placeholder="e.g., 62000"
                error={errors.mileage?.message}
                min={0}
                className="text-lg"
              />
              <p className="text-xs text-neutral-500 mt-2 mb-6">
                Used to find comparable listings at a similar mileage
              </p>

              <Input
                {...register('reconCostEstimate')}
                type="number"
                label="Recon Cost Estimate ($)"
                placeholder="e.g., 1500"
                error={errors.reconCostEstimate?.message}
                min={0}
                className="text-lg"
              />
              <p className="text-xs text-neutral-500 mt-2 mb-8">
                Estimated cost to get this vehicle sale-ready. Leave blank to use a default estimate.
              </p>

              <Button
                type="submit"
                isLoading={isSubmitting}
                disabled={isSubmitting}
                size="lg"
                className="w-full"
              >
                Get Appraisal →
              </Button>
            </form>
          </Card>
        )}

        {/* Step 2: Analysis in progress */}
        {step === 2 && (
          <Card className="p-12 text-center">
            <div className="mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                <svg className="w-8 h-8 text-primary-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              </div>
              <h3 className="text-2xl font-bold text-neutral-900 mb-2">
                Analyzing Your Appraisal
              </h3>
              <p className="text-neutral-600 max-w-md mx-auto">
                We're decoding the VIN, scraping market data, and calculating your pricing strategy. This usually takes 15-30 seconds, but can take a couple of minutes if comparables are hard to find.
              </p>
            </div>

            {/* Status steps */}
            <div className="mt-8 space-y-3 text-left max-w-xs mx-auto">
              <div className="flex items-center text-sm text-neutral-600">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-accent-100 text-accent-600 rounded-full text-xs font-bold mr-3">✓</span>
                Fetching vehicle data
              </div>
              <div className="flex items-center text-sm text-neutral-600">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-primary-100 text-primary-600 rounded-full animate-pulse mr-3">•</span>
                Scraping market comparables
              </div>
              <div className="flex items-center text-sm text-neutral-400">
                <span className="inline-flex items-center justify-center w-6 h-6 bg-neutral-200 text-neutral-400 rounded-full text-xs font-bold mr-3">3</span>
                Calculating pricing strategy
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
