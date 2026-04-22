import type { OutreachGeneratorInput } from '../../../lib/paul/types';
import { generateOutreach } from '../../../lib/paul/generator';

describe('Outreach Generator', () => {
  it('should generate standard template for standard category', () => {
    const result = generateOutreach({
      domain: 'example.com',
      publisherName: 'John Smith',
      niche: 'tech',
      category: 'standard',
      domainAuthority: 45
    });

    expect(result.subject).toBeDefined();
    expect(result.subject.length).toBeGreaterThan(10);
    expect(result.body).toBeDefined();
    expect(result.body.includes('example.com')).toBe(true);
    expect(result.template).toBe('standard');
    expect(result.tone).toBe('professional');
  });

  it('should generate warm template for warm category', () => {
    const result = generateOutreach({
      domain: 'example.com',
      publisherName: 'Jane Doe',
      niche: 'tech',
      category: 'warm',
      domainAuthority: 65
    });

    expect(result.template).toBe('warm');
    expect(result.tone).toBe('friendly');
    expect(result.body.includes('appreciate')).toBe(true);
  });

  it('should generate premium template for premium category', () => {
    const result = generateOutreach({
      domain: 'example.com',
      publisherName: 'CEO Name',
      niche: 'business',
      category: 'premium',
      domainAuthority: 85
    });

    expect(result.template).toBe('premium');
    expect(result.tone).toBe('vip');
    expect(result.body.length).toBeGreaterThan(150);
  });

  it('should mention prior deals if provided', () => {
    const result = generateOutreach({
      domain: 'example.com',
      publisherName: 'Partner',
      niche: 'tech',
      category: 'warm',
      priorDeals: true
    });

    expect(result.body.toLowerCase()).toMatch(/partnership|previous|relationship|work together/);
  });

  it('should respect casino preference', () => {
    const casinoOk = generateOutreach({
      domain: 'casino.com',
      publisherName: 'Admin',
      niche: 'gambling',
      category: 'warm',
      acceptCasino: true
    });

    const casinoNo = generateOutreach({
      domain: 'casino.com',
      publisherName: 'Admin',
      niche: 'gambling',
      category: 'warm',
      acceptCasino: false
    });

    // If acceptCasino=true, body SHOULD mention gaming/casino content
    expect(casinoOk.body.toLowerCase()).toMatch(/casino|gambling|gaming/);

    // If acceptCasino=false, body should NOT mention gaming/casino content
    expect(casinoNo.body.toLowerCase()).not.toMatch(/casino|gambling|gaming/);
  });

  it('should estimate open rate based on category', () => {
    const standard = generateOutreach({
      domain: 'example.com',
      niche: 'tech',
      category: 'standard'
    });

    const premium = generateOutreach({
      domain: 'premium.com',
      niche: 'business',
      category: 'premium'
    });

    // Premium should have higher estimated open rate
    expect(premium.estimatedOpenRate).toBeGreaterThan(standard.estimatedOpenRate);
  });
});
