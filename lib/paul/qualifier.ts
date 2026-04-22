import { ProspectData, QualificationResult } from './types';

/**
 * Qualifies a prospect based on their company data
 * @param prospect - The prospect data to evaluate
 * @returns Qualification result with score and reasons
 */
export function qualifyProspect(prospect: ProspectData): QualificationResult {
  // TODO: Implement qualification logic
  return {
    qualified: false,
    score: 0,
    reasons: [],
  };
}
