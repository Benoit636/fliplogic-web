'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function ResultsPage() {
  const router = useRouter();
  const params = useParams();
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/login'); return; }
    const fetchResults = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/appraisals/${params.id}/results`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Failed to load');
        setResults(data);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchResults();
  }, [params.id]);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500 text-lg">Loading results...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-red-500">{error}</p>
    </div>
  );

  const analysis = results?.pricingStrategy || {};
  const appraisal = results?.appraisal || {};
  const wholesaleValue = analysis.wholesaleValue || 0;
  const retailValue = analysis.retailValue || 0;
  const margin = analysis.margin || 0;

  const recommendation = margin >= 12 ? 'BUY' : margin >= 6 ? 'CONSIDER' : margin >= 2 ? 'LOW MARGIN' : 'PASS';
  const recColor = margin >= 12 ? 'text-green-600' : margin >= 6 ? 'text-yellow-600' : margin >= 2 ? 'text-orange-500' : 'text-red-600';

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Appraisal Results</h1>
          <button onClick={() => router.push('/dashboard')} className="text-sm text-blue-600 hover:underline">
            Back to Dashboard
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 mb-4 text-center">
          <p className="text-sm text-gray-500 mb-1">Recommendation</p>
          <p className={`text-4xl font-bold ${recColor}`}>{recommendation}</p>
          <p className="text-sm text-gray-400 mt-1">Margin: {margin.toFixed(1)}%</p>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-2xl shadow p-6">
            <p className="text-sm text-gray-500 font-medium mb-2">Wholesale Value</p>
            <p className="text-3xl font-bold text-gray-900">${wholesaleValue.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-2">Max you should pay</p>
          </div>
          <div className="bg-white rounded-2xl shadow p-6">
            <p className="text-sm text-gray-500 font-medium mb-2">Retail Value</p>
            <p className="text-3xl font-bold text-blue-600">${retailValue.toLocaleString()}</p>
            <p className="text-xs text-gray-400 mt-2">Expected selling price</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow p-6 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Vehicle Details</h2>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-gray-500">VIN</span>
            <span className="font-medium">{appraisal.vin || '—'}</span>
            <span className="text-gray-500">Year</span>
            <span className="font-medium">{appraisal.year || '—'}</span>
            <span className="text-gray-500">Make</span>
            <span className="font-medium">{appraisal.make || '—'}</span>
            <span className="text-gray-500">Model</span>
            <span className="font-medium">{appraisal.model || '—'}</span>
            <span className="text-gray-500">Mileage</span>
            <span className="font-medium">{appraisal.mileage?.toLocaleString() || '—'} km</span>
          </div>
        </div>

        <button
          onClick={() => router.push('/dashboard')}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 rounded-xl transition"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
