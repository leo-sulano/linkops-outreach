export interface QualifyInput {
  domain: string;
  domainAuthority: number; // 0-100
  trafficPercentile: number; // 0-100
  niches: string[]; // ["tech", "business", etc.] - all publisher niches
  isSpam: boolean;
  niche: string; // Primary niche for this campaign - used for scoring factor
}

export interface DomainFactors {
  da: number; // 0-1, DA contribution
  traffic: number; // 0-1, traffic contribution
  niche: number; // 0-1, niche match
  antiSpam: number; // 0-1, anti-spam score
}

export interface DomainScore {
  score: number; // 0-100
  category: 'reject' | 'standard' | 'warm' | 'premium';
  factors: DomainFactors;
  recommendation: string;
}

export interface OutreachGeneratorInput {
  domain: string;
  publisherName?: string;
  niche: string;
  category: 'standard' | 'warm' | 'premium';
  domainAuthority?: number;
  priorDeals?: boolean;
  acceptCasino?: boolean;
  acceptBetting?: boolean;
}

export interface OutreachGeneratorOutput {
  subject: string;
  body: string;
  tone: string;
  template: 'standard' | 'warm' | 'premium';
  estimatedOpenRate: number;
}
