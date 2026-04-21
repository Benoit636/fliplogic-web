'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/auth';
import apiClient from '@/lib/api';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';

interface AppraisalResults {
  appraisal: any;
  pricingStrategy: any;
  analysis: any;
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const { authUser } = useAuthStore();
  const [results, setResults] = useState<AppraisalResults | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCopying, setIsCopying] = useState(false);

  const appraisalId = params.id as string;

  useEffect(() => {
    if (!authUser) {
      router.push('/login');
      return;
    }

    fetchResults();
  }, [authUser, appraisalId]);

  const fetchResults = async () => {
    try {
      const response = await apiClient.get(`/appraisals/${appraisalId}`);
      // In production, you'd also fetch pricing strategy from the analysis endpoint
      setResults({
        appraisal: response.data,
        pricingStrategy: response.data.pricingStrategy || {},
        analysis: response.data.analysis || {},
      });
    } catch (error) {
      console.error('Error fetching results:', error);
      alert('Failed to load appraisal results');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateListing = async () => {
    try {
      await apiClient.post('/listings', { appraisalId });
      router.push(`/listings`);
    } catch (error) {
      console.error('Error creating listing:', error);
      alert('Failed to create listing');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Card className="p-12 text-center">
          <svg className="w-12 h-12 text-primary-600 animate-spin mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-neutral-600">Loading appraisal results...</p>
        </Card>
      </div>
    );
  }

  if (!results) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <Card className="p-8 text-center">
          <p className="text-neutral-600 mb-4">Appraisal not found</p>
          <Button onClick={() => router.push('/dashboard')}>Back to Dashboard</Button>
        </Card>
      </div>
    );
  }

  const {
    appraisal,
    pricingStrategy,
    analysis,
  } = results;

  const totalInvestment =
    (analysis.acquisitionCost || 0) + (analysis.reconCost || 0);

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="bg-white border-b border-neutral-200">
        <div className="max-w-6xl mx-auto px-4 py-8">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="font-display text-3xl font-bold text-primary-900">
                Appraisal Results
              </h1>
              <p className="text-neutral-600 mt-1">
                {appraisal.vehicle_year} {appraisal.vehicle_make} {appraisal.vehicle_model}
              </p>
            </div>
            <div className="flex space-x-3">
              <Button variant="outline" onClick={() => router.back()}>
                ← Back
              </Button>
              <Button onClick={handleCreateListing}>
                Create Listing →
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-12">
        {/* Key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
          {/* Acquisition */}
          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Acquisition Cost
            </div>
            <div className="text-3xl font-bold text-primary-900">
              ${analysis.acquisitionCost?.toLocaleString() || 0}
            </div>
            <p className="text-neutral-500 text-xs mt-2">
              What to pay for this vehicle
            </p>
          </Card>

          {/* Recon */}
          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Recon Cost
            </div>
            <div className="text-3xl font-bold text-warning">
              ${(appraisal.custom_recon_cost || analysis.reconCost)?.toLocaleString() || 0}
            </div>
            <p className="text-neutral-500 text-xs mt-2">
              Cost to get market-ready
            </p>
          </Card>

          {/* Market Value */}
          <Card className="p-6">
            <div className="text-neutral-500 text-sm font-medium mb-2">
              Market Value
            </div>
            <div className="text-3xl font-bold text-accent-600">
              ${analysis.marketValue?.toLocaleString() || 0}
            </div>
            <p className="text-neutral-500 text-xs mt-2">
              What buyers will pay
            </p>
          </Card>

          {/* Total Investment */}
          <Card className="p-6 bg-primary-50 border-primary-200">
            <div className="text-primary-700 text-sm font-medium mb-2">
              Total Investment
            </div>
            <div className="text-3xl font-bold text-primary-900">
              ${totalInvestment.toLocaleString()}
            </div>
            <p className="text-primary-600 text-xs mt-2">
              Acq. + Recon
            </p>
          </Card>
        </div>

        {/* Pricing Strategy */}
        <Card className="p-8 mb-12">
          <h2 className="text-2xl font-bold text-neutral-900 mb-8">
            Dynamic Pricing Strategy
          </h2>

          <p className="text-neutral-600 mb-8">
            Maximize turn speed and profitability with our proven pricing strategy.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Days 0-20 */}
            <div className="border-2 border-accent-300 rounded-lg p-6 bg-accent-50">
              <div className="text-center">
                <div className="text-sm font-medium text-accent-700 mb-2">
                  Days 0-20
                </div>
                <div className="text-3xl font-bold text-accent-900 mb-2">
                  ${pricingStrategy.day0to20?.price?.toLocaleString() || 0}
                </div>
                <div className="inline-block bg-accent-200 px-3 py-1 rounded text-sm font-bold text-accent-900">
                  {(pricingStrategy.day0to20?.profitMargin * 100).toFixed(0)}% profit
                </div>
              </div>
              <p className="text-xs text-accent-700 text-center mt-4">
                List at premium price. Hunt for buyer willing to pay top dollar.
              </p>
            </div>

            {/* Days 21-30 */}
            <div className="border-2 border-warning rounded-lg p-6 bg-yellow-50">
              <div className="text-center">
                <div className="text-sm font-medium text-warning mb-2">
                  Days 21-30
                </div>
                <div className="text-3xl font-bold text-yellow-900 mb-2">
                  ${pricingStrategy.day21to30?.price?.toLocaleString() || 0}
                </div>
                <div className="inline-block bg-warning px-3 py-1 rounded text-sm font-bold text-white">
                  {(pricingStrategy.day21to30?.profitMargin * 100).toFixed(0)}% profit
                </div>
              </div>
              <p className="text-xs text-yellow-700 text-center mt-4">
                Lower price. Broaden audience. Create urgency.
              </p>
            </div>

            {/* Days 31+ */}
            <div className="border-2 border-info rounded-lg p-6 bg-blue-50">
              <div className="text-center">
                <div className="text-sm font-medium text-info mb-2">
                  Days 31+
                </div>
                <div className="text-3xl font-bold text-blue-900 mb-2">
                  ${pricingStrategy.day31plus?.price?.toLocaleString() || 0}
                </div>
                <div className="inline-block bg-info px-3 py-1 rounded text-sm font-bold text-white">
                  {(pricingStrategy.day31plus?.profitMargin * 100).toFixed(0)}% profit
                </div>
              </div>
              <p className="text-xs text-blue-700 text-center mt-4">
                Liquidation mode. Move capital. Reinvest.
              </p>
            </div>
          </div>
        </Card>

        {/* Analysis Details */}
        <Card className="p-8 mb-12">
          <h2 className="text-2xl font-bold text-neutral-900 mb-6">
            Appraisal Details
          </h2>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase">Comparables Analyzed</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1">
                {analysis.comparablesAnalyzed || 0}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase">Search Radius</div>
              <div className="text-2xl font-bold text-neutral-900 mt-1">
                {appraisal.search_radius_km} km
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase">Appraisal Type</div>
              <div className="text-lg font-bold text-neutral-900 mt-1 capitalize">
                {appraisal.appraisal_type?.replace('-', ' ')}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-neutral-500 uppercase">Status</div>
              <div className="text-lg font-bold text-accent-600 mt-1 capitalize">
                Complete
              </div>
            </div>
          </div>
        </Card>

        {/* Call to action */}
        <div className="text-center">
          <Button size="lg" onClick={handleCreateListing}>
            Create Listing & Start Selling →
          </Button>
          <p className="text-neutral-600 text-sm mt-4">
            This appraisal is valid for 7 days
          </p>
        </div>
      </main>
    </div>
  );
}
