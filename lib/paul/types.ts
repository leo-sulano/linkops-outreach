/**
 * Prospect qualification types for PAUL (Prospecting Automation Utility Logic)
 */

export interface ProspectData {
  companySize: number;
  yearsInBusiness: number;
  monthlyRevenue: number;
  hasMarketingTeam: boolean;
  hasAutomationTools: boolean;
}

export interface QualificationResult {
  qualified: boolean;
  score: number;
  reasons: string[];
}
