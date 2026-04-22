import type { QualifyInput, DomainScore } from './types';

export type { DomainScore } from './types';

/**
 * Qualifies a domain based on composite scoring:
 * Score = (DA × 0.4) + (Traffic% × 0.3) + (Niche × 0.2) + (AntiSpam × 0.1)
 *
 * Categories:
 * - reject: score < 40
 * - standard: 40-59
 * - warm: 60-79
 * - premium: >= 80
 */
export function qualifyDomain(input: QualifyInput): DomainScore {
  // TODO: implement
  return {
    score: 0,
    category: 'reject',
    factors: {
      da: 0,
      traffic: 0,
      niche: 0,
      antiSpam: 0
    },
    recommendation: ''
  };
}
