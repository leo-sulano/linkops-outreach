import { qualifyProspect } from '../../../lib/paul/qualifier';
import { ProspectData } from '../../../lib/paul/types';

describe('qualifyProspect', () => {
  describe('High-quality prospects', () => {
    it('should qualify a company with strong fundamentals (large, established, profitable)', () => {
      const prospect: ProspectData = {
        companySize: 500,
        yearsInBusiness: 15,
        monthlyRevenue: 250000,
        hasMarketingTeam: true,
        hasAutomationTools: true,
      };

      const result = qualifyProspect(prospect);

      expect(result.qualified).toBe(true);
      expect(result.score).toBeGreaterThan(70);
      expect(result.reasons).toContain('Company has strong size and revenue');
      expect(result.reasons).toContain('Established business with marketing capability');
    });

    it('should qualify a growing company with marketing potential', () => {
      const prospect: ProspectData = {
        companySize: 150,
        yearsInBusiness: 8,
        monthlyRevenue: 85000,
        hasMarketingTeam: true,
        hasAutomationTools: false,
      };

      const result = qualifyProspect(prospect);

      expect(result.qualified).toBe(true);
      expect(result.score).toBeGreaterThan(60);
      expect(result.reasons).toContain('Company has marketing team');
    });
  });

  describe('Low-quality prospects', () => {
    it('should not qualify a startup that is too young and unprofitable', () => {
      const prospect: ProspectData = {
        companySize: 5,
        yearsInBusiness: 1,
        monthlyRevenue: 8000,
        hasMarketingTeam: false,
        hasAutomationTools: false,
      };

      const result = qualifyProspect(prospect);

      expect(result.qualified).toBe(false);
      expect(result.score).toBeLessThan(40);
      expect(result.reasons).toContain('Company too early stage');
      expect(result.reasons).toContain('Revenue too low');
    });

    it('should not qualify a very small company without marketing', () => {
      const prospect: ProspectData = {
        companySize: 3,
        yearsInBusiness: 2,
        monthlyRevenue: 5000,
        hasMarketingTeam: false,
        hasAutomationTools: true,
      };

      const result = qualifyProspect(prospect);

      expect(result.qualified).toBe(false);
      expect(result.score).toBeLessThan(35);
      expect(result.reasons).toContain('Company size too small');
      expect(result.reasons).toContain('No dedicated marketing team');
    });
  });

  describe('Edge cases', () => {
    it('should handle a company at the qualification boundary', () => {
      const prospect: ProspectData = {
        companySize: 50,
        yearsInBusiness: 5,
        monthlyRevenue: 30000,
        hasMarketingTeam: true,
        hasAutomationTools: false,
      };

      const result = qualifyProspect(prospect);

      expect(result.qualified).toBe(true);
      expect(result.score).toBeGreaterThanOrEqual(50);
      expect(result.score).toBeLessThanOrEqual(70);
    });

    it('should return a valid score between 0 and 100', () => {
      const prospect: ProspectData = {
        companySize: 100,
        yearsInBusiness: 7,
        monthlyRevenue: 50000,
        hasMarketingTeam: true,
        hasAutomationTools: true,
      };

      const result = qualifyProspect(prospect);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
      expect(Array.isArray(result.reasons)).toBe(true);
    });
  });
});
