import { qualifyDomain, type DomainScore } from '../../../lib/paul/qualifier';

describe('Domain Qualifier', () => {
  it('should reject low-scoring domains (score < 40)', () => {
    const input = {
      domain: 'spam-domain.com',
      domainAuthority: 15,
      trafficPercentile: 10,
      niches: ['general'],
      isSpam: true,
      niche: 'general'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeLessThan(40);
    expect(result.category).toBe('reject');
  });

  it('should categorize standard domains (score 40-59)', () => {
    const input = {
      domain: 'mediocre-site.com',
      domainAuthority: 35,
      trafficPercentile: 45,
      niches: ['tech'],
      isSpam: false,
      niche: 'tech'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(60);
    expect(result.category).toBe('standard');
  });

  it('should categorize warm domains (score 60-79)', () => {
    const input = {
      domain: 'good-site.com',
      domainAuthority: 55,
      trafficPercentile: 65,
      niches: ['tech', 'business'],
      isSpam: false,
      niche: 'tech'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
    expect(result.category).toBe('warm');
  });

  it('should categorize premium domains (score >= 80)', () => {
    const input = {
      domain: 'authority-site.com',
      domainAuthority: 80,
      trafficPercentile: 85,
      niches: ['business', 'tech'],
      isSpam: false,
      niche: 'business'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.category).toBe('premium');
  });

  it('should return factor breakdown', () => {
    const input = {
      domain: 'test-site.com',
      domainAuthority: 50,
      trafficPercentile: 50,
      niches: ['tech'],
      isSpam: false,
      niche: 'tech'
    };

    const result = qualifyDomain(input);

    expect(result.factors).toBeDefined();
    expect(result.factors.da).toBeDefined();
    expect(result.factors.traffic).toBeDefined();
    expect(result.factors.niche).toBeDefined();
    expect(result.factors.antiSpam).toBeDefined();
  });

  it('should apply anti-spam penalty', () => {
    const goodDomain = qualifyDomain({
      domain: 'good.com',
      domainAuthority: 50,
      trafficPercentile: 50,
      niches: ['tech'],
      isSpam: false,
      niche: 'tech'
    });

    const spamDomain = qualifyDomain({
      domain: 'spam.com',
      domainAuthority: 50,
      trafficPercentile: 50,
      niches: ['tech'],
      isSpam: true,
      niche: 'tech'
    });

    expect(spamDomain.score).toBeLessThan(goodDomain.score);
  });
});
