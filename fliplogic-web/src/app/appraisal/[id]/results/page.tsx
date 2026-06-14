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
}

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const { token } = useAuthStore();
  const [results, setResults] = useState<AppraisalResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const handleCreateListing = async () => {
    router.push('/dashboard');
  };

  useEffect(() => {
    if (!token) { router.push('/login'); return; }
    const fetchResults = async () => {
      try {
        const response = await apiClient.get(`/api/appraisals/${params.id}/results`);
        setResults(response.data);
      } catch (err: any) {
        setError(err.message || 'Failed to load results');
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [params.id, token]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">Loading results...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-red-500">{error}</p>
