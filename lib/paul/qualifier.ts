import type { QualifyInput, DomainScore } from './types';

const NICHE_KEYWORDS: Record<string, string[]> = {
  tech: ['technology', 'software', 'ai', 'saas', 'startup', 'code', 'dev', 'tech', 'computer'],
  business: ['business', 'finance', 'corporate', 'enterprise', 'b2b', 'sales', 'marketing'],
  gambling: ['casino', 'gambling', 'betting', 'poker', 'slots', 'gaming', 'sports betting'],
  sports: ['sports', 'fitness', 'athletics', 'gym', 'training', 'health', 'exercise'],
  general: []
};

function calculateNicheMatch(inputNiches: string[], targetNiche: string): number {
  if (!inputNiches || inputNiches.length === 0) return 0.3;

  const targetKeywords = NICHE_KEYWORDS[targetNiche.toLowerCase()] || [];
  if (targetKeywords.length === 0) return 0.5; // generic niche

  // Count direct niche matches
  const matchedNiches = inputNiches.filter((niche) =>
    niche.toLowerCase() === targetNiche.toLowerCase()
  );

  if (matchedNiches.length > 0) return 1.0; // Direct match

  // Count keyword-based matches
  const matchedKeywords = inputNiches.filter((niche) =>
    targetKeywords.some(keyword => niche.toLowerCase().includes(keyword) || keyword.includes(niche.toLowerCase()))
  );

  // If we have at least one match, return a high score proportional to matches
  if (matchedKeywords.length > 0) {
    return Math.min(1, 0.7 + (matchedKeywords.length * 0.3));
  }

  // No match found
  return 0.3;
}

export function qualifyDomain(input: QualifyInput): DomainScore {
  // Normalize inputs to 0-1 scale
  const daNormalized = Math.min(1, input.domainAuthority / 100);
  const trafficNormalized = input.trafficPercentile / 100;

  // Niche match: 0-1
  const nicheMatch = calculateNicheMatch(input.niches, input.niche);

  // Anti-spam: 1.0 if clean, 0.5 if suspicious, 0.0 if spam
  const antiSpamScore = input.isSpam ? 0 : 1;

  // Calculate composite score: (DA × 0.4) + (Traffic × 0.3) + (Niche × 0.2) + (AntiSpam × 0.1)
  const rawScore =
    (daNormalized * 0.4) +
    (trafficNormalized * 0.3) +
    (nicheMatch * 0.2) +
    (antiSpamScore * 0.1);

  const score = Math.round(rawScore * 100); // Convert to 0-100 scale

  let category: 'reject' | 'standard' | 'warm' | 'premium';
  if (score < 40) {
    category = 'reject';
  } else if (score < 60) {
    category = 'standard';
  } else if (score < 80) {
    category = 'warm';
  } else {
    category = 'premium';
  }

  const factors = {
    da: daNormalized,
    traffic: trafficNormalized,
    niche: nicheMatch,
    antiSpam: antiSpamScore
  };

  // Generate recommendation
  const recommendation = getRecommendation(score, category, factors);

  return {
    score,
    category,
    factors,
    recommendation
  };
}

function getRecommendation(score: number, category: string, factors: any): string {
  if (category === 'reject') {
    return `Domain score too low (${score}). Consider finding higher-authority publishers.`;
  }

  const strengths = [];
  const weaknesses = [];

  if (factors.da > 0.6) strengths.push('high authority');
  if (factors.da < 0.3) weaknesses.push('low authority');

  if (factors.traffic > 0.6) strengths.push('good traffic');
  if (factors.traffic < 0.3) weaknesses.push('low traffic');

  if (factors.niche > 0.7) strengths.push('niche match');
  if (factors.niche < 0.3) weaknesses.push('poor niche match');

  if (factors.antiSpam < 1) weaknesses.push('spam signals detected');

  let rec = `${category.toUpperCase()} domain (${score}). `;
  if (strengths.length > 0) rec += `Strengths: ${strengths.join(', ')}. `;
  if (weaknesses.length > 0) rec += `Consider: ${weaknesses.join(', ')}.`;

  return rec;
}

export type { DomainScore } from './types';
