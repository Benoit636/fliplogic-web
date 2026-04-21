'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/api';
import { Button } from '@/components/Button';
import { Input } from '@/components/Input';
import { Card } from '@/components/Card';

const appraisalSchema = z.object({
  vin: z.string().length(17, 'VIN must be exactly 17 characters'),
  appraisalType: z.enum(['on-site', 'sight-unseen']),
  searchRadiusKm: z.number().min(0).max(1500),
  paint: z.enum(['good', 'fair', 'poor']),
  tires: z.enum(['good', 'fair', 'poor']),
  brakes: z.enum(['good', 'fair', 'poor']),
  glass: z.enum(['good', 'fair', 'poor']),
  body: z.enum(['good', 'fair', 'poor']),
  interior: z.enum(['good', 'fair', 'poor']),
  warningLights: z.boolean().default(false),
  notes: z.string().optional(),
});

type AppraisalFormData = z.infer<typeof appraisalSchema>;

export default function NewAppraisalPage() {
  const router = useRouter();
  const { authUser } = useAuthStore();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [appraisalId, setAppraisalId] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
  } = useForm<AppraisalFormData>({
    resolver: zodResolver(appraisalSchema),
    defaultValues: {
      appraisalType: 'on-site',
      searchRadiusKm: 400,
    },
  });

  const appraisalType = watch('appraisalType');

  useEffect(() => {
    if (!authUser) {
      router.push('/login');
    }
  }, [authUser, router]);

  const onSubmit = async (data: AppraisalFormData) => {
    try {
      setIsSubmitting(true);

      // Step 1: Create appraisal
      if (step === 1) {
        const response = await apiClient.post('/appraisals', {
          vin: data.vin,
          appraisalType: data.appraisalType,
          searchRadiusKm: data.searchRadiusKm,
          conditionData: {
            paint: data.paint,
            tires: data.tires,
            brakes: data.brakes,
            glass: data.glass,
            body: data.body,
            interior: data.interior,
            warningLights: data.warningLights,
          },
        });

        setAppraisalId(response.data.id);
        setStep(2);
        return;
      }

      // Step 2: Analyze appraisal
      if (step === 2 && appraisalId) {
        const response = await apiClient.post(`/appraisals/${appraisalId}/analyze`);
        
        // Redirect to results
        router.push(`/appraisal/${appraisalId}/results`);
      }
    } catch (error: any) {
      console.error('Appraisal error:', error);
      alert(error.response?.data?.error || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!authUser) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="font-display text-2xl font-bold text-primary-900">
            New Appraisal
          </h1>
          <p className="text-neutral-600 mt-1">
            Enter vehicle details and condition assessment
          </p>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Progress indicator */}
        <div className="mb-12">
          <div className="flex items-center justify-between">
            <div
              className={`flex-1 h-2 rounded-full ${
                step >= 1 ? 'bg-primary-500' : 'bg-neutral-300'
              } mr-2`}
            ></div>
            <div
              className={`flex-1 h-2 rounded-full ${
                step >= 2 ? 'bg-primary-500' : 'bg-neutral-300'
              }`}
            ></div>
          </div>
          <div className="flex justify-between mt-3 text-xs font-medium text-neutral-600">
            <span>Step 1: Vehicle Info</span>
            <span>Step 2: Analysis</span>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {/* Step 1: Vehicle & Condition */}
          {step === 1 && (
            <Card className="p-8 space-y-6">
              <div>
                <h2 className="text-xl font-bold text-neutral-900 mb-6">
                  Vehicle Information
                </h2>

                {/* VIN Input */}
                <div className="mb-6">
                  <Input
                    {...register('vin')}
                    label="Vehicle Identification Number (VIN)"
                    placeholder="e.g., 3G1YY22G965452168"
                    error={errors.vin?.message}
                    maxLength={17}
                  />
                  <p className="text-xs text-neutral-500 mt-2">
                    17-character VIN from vehicle documents
                  </p>
                </div>

                {/* Appraisal Type */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-neutral-700 mb-3">
                    Appraisal Type
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-primary-50 transition-colors" style={{borderColor: appraisalType === 'on-site' ? '#4169b4' : '#e5e5e5'}}>
                      <input
                        type="radio"
                        value="on-site"
                        {...register('appraisalType')}
                        className="w-4 h-4"
                      />
                      <span className="ml-3 text-sm font-medium text-neutral-700">
                        🔍 On-Site<br/>
                        <span className="text-xs text-neutral-500">Photos required</span>
                      </span>
                    </label>
                    <label className="flex items-center p-4 border rounded-lg cursor-pointer hover:bg-primary-50 transition-colors" style={{borderColor: appraisalType === 'sight-unseen' ? '#4169b4' : '#e5e5e5'}}>
                      <input
                        type="radio"
                        value="sight-unseen"
                        {...register('appraisalType')}
                        className="w-4 h-4"
                      />
                      <span className="ml-3 text-sm font-medium text-neutral-700">
                        📍 Sight-Unseen<br/>
                        <span className="text-xs text-neutral-500">No photos needed</span>
                      </span>
                    </label>
                  </div>
                </div>

                {/* Search Radius */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Search Radius (km)
                  </label>
                  <div className="flex items-center space-x-4">
                    <input
                      type="range"
                      {...register('searchRadiusKm', { valueAsNumber: true })}
                      min="0"
                      max="1500"
                      step="50"
                      className="flex-1"
                    />
                    <span className="text-lg font-bold text-primary-900 min-w-20">
                      {watch('searchRadiusKm')} km
                    </span>
                  </div>
                  <p className="text-xs text-neutral-500 mt-2">
                    Wider radius = more comparables, longer analysis time
                  </p>
                </div>
              </div>

              {/* Condition Assessment */}
              <div className="pt-8 border-t">
                <h3 className="text-lg font-bold text-neutral-900 mb-6">
                  Condition Assessment
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Paint */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Paint Condition
                    </label>
                    <select
                      {...register('paint')}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select condition...</option>
                      <option value="good">✓ Good</option>
                      <option value="fair">~ Fair</option>
                      <option value="poor">✗ Poor</option>
                    </select>
                    {errors.paint && <p className="text-xs text-danger mt-1">{errors.paint.message}</p>}
                  </div>

                  {/* Tires */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Tire Condition
                    </label>
                    <select
                      {...register('tires')}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select condition...</option>
                      <option value="good">✓ Good</option>
                      <option value="fair">~ Fair</option>
                      <option value="poor">✗ Poor</option>
                    </select>
                    {errors.tires && <p className="text-xs text-danger mt-1">{errors.tires.message}</p>}
                  </div>

                  {/* Brakes */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Brake Condition
                    </label>
                    <select
                      {...register('brakes')}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select condition...</option>
                      <option value="good">✓ Good</option>
                      <option value="fair">~ Fair</option>
                      <option value="poor">✗ Poor</option>
                    </select>
                    {errors.brakes && <p className="text-xs text-danger mt-1">{errors.brakes.message}</p>}
                  </div>

                  {/* Glass */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Glass Condition
                    </label>
                    <select
                      {...register('glass')}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select condition...</option>
                      <option value="good">✓ Good</option>
                      <option value="fair">~ Fair</option>
                      <option value="poor">✗ Poor</option>
                    </select>
                    {errors.glass && <p className="text-xs text-danger mt-1">{errors.glass.message}</p>}
                  </div>

                  {/* Body */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Body Condition
                    </label>
                    <select
                      {...register('body')}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select condition...</option>
                      <option value="good">✓ Good</option>
                      <option value="fair">~ Fair</option>
                      <option value="poor">✗ Poor</option>
                    </select>
                    {errors.body && <p className="text-xs text-danger mt-1">{errors.body.message}</p>}
                  </div>

                  {/* Interior */}
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                      Interior Condition
                    </label>
                    <select
                      {...register('interior')}
                      className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">Select condition...</option>
                      <option value="good">✓ Good</option>
                      <option value="fair">~ Fair</option>
                      <option value="poor">✗ Poor</option>
                    </select>
                    {errors.interior && <p className="text-xs text-danger mt-1">{errors.interior.message}</p>}
                  </div>
                </div>

                {/* Warning Lights */}
                <div className="mt-6">
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      {...register('warningLights')}
                      className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                    />
                    <span className="ml-2 text-sm text-neutral-700">
                      Any warning lights or error codes?
                    </span>
                  </label>
                </div>

                {/* Notes */}
                <div className="mt-6">
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Additional Notes (optional)
                  </label>
                  <textarea
                    {...register('notes')}
                    placeholder="Any mechanical issues, rust, or other details..."
                    rows={3}
                    className="w-full px-4 py-2 border border-neutral-300 rounded-md focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              {/* Button */}
              <div className="flex justify-end pt-6">
                <Button
                  type="submit"
                  isLoading={isSubmitting}
                  disabled={isSubmitting}
                  size="lg"
                >
                  Continue to Analysis →
                </Button>
              </div>
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
                  We're scraping market data, analyzing comparables, and calculating your pricing strategy. This usually takes 5-10 seconds.
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
        </form>
      </main>
    </div>
  );
}
