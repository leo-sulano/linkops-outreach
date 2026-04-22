import { useState } from 'react';
import type { DomainScore, OutreachGeneratorOutput } from '../paul';

interface UsePaulQualifyState {
  loading: boolean;
  error: string | null;
  result: DomainScore | null;
}

interface UsePaulGenerateState {
  loading: boolean;
  error: string | null;
  result: OutreachGeneratorOutput | null;
}

/**
 * Hook to qualify a domain via Paul API
 */
export function usePaulQualify() {
  const [state, setState] = useState<UsePaulQualifyState>({
    loading: false,
    error: null,
    result: null
  });

  const qualify = async (input: {
    domain: string;
    domainAuthority: number;
    trafficPercentile: number;
    niches?: string[];
    isSpam?: boolean;
    niche: string;
  }) => {
    setState({ loading: true, error: null, result: null });

    try {
      const response = await fetch('/api/paul/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      setState({ loading: false, error: null, result: data.data });
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: errorMessage, result: null });
      throw err;
    }
  };

  return { ...state, qualify };
}

/**
 * Hook to generate outreach email via Paul API
 */
export function usePaulGenerateOutreach() {
  const [state, setState] = useState<UsePaulGenerateState>({
    loading: false,
    error: null,
    result: null
  });

  const generate = async (input: {
    domain: string;
    publisherName?: string;
    niche: string;
    category: 'standard' | 'warm' | 'premium';
    domainAuthority?: number;
    priorDeals?: boolean;
    acceptCasino?: boolean;
    acceptBetting?: boolean;
  }) => {
    setState({ loading: true, error: null, result: null });

    try {
      const response = await fetch('/api/paul/generate-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      setState({ loading: false, error: null, result: data.data });
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: errorMessage, result: null });
      throw err;
    }
  };

  return { ...state, generate };
}
