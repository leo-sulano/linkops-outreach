import type { OutreachGeneratorInput, OutreachGeneratorOutput } from './types';
import { getMockSubject, getMockBody } from '../mocks/paulResponses';

const ESTIMATED_OPEN_RATES: Record<string, number> = {
  standard: 18,
  warm: 28,
  premium: 35
};

const TEMPLATE_TONES: Record<string, string> = {
  standard: 'professional',
  warm: 'friendly',
  premium: 'vip'
};

/**
 * Generates personalized outreach email based on domain category and niche.
 * Uses template selection and variable interpolation.
 *
 * In Phase 2, getMockSubject/getMockBody are replaced with real GPT-4o-mini calls.
 */
export function generateOutreach(input: OutreachGeneratorInput): OutreachGeneratorOutput {
  const { domain, publisherName, niche, category, priorDeals, acceptCasino } = input;

  // Validate category
  const validCategory = ['standard', 'warm', 'premium'].includes(category) ? category : 'standard';

  // Generate subject and body using mock templates
  const subject = getMockSubject(validCategory, domain, niche, publisherName);
  const body = getMockBody(validCategory, domain, niche, publisherName, priorDeals, acceptCasino);

  // Get tone and estimated open rate
  const tone = TEMPLATE_TONES[validCategory] || 'professional';
  const estimatedOpenRate = ESTIMATED_OPEN_RATES[validCategory] || 18;

  return {
    subject,
    body,
    tone,
    template: validCategory as 'standard' | 'warm' | 'premium',
    estimatedOpenRate
  };
}

export type { OutreachGeneratorOutput } from './types';
