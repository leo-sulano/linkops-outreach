/**
 * Integration tests for Paul Logic API endpoints
 * Tests the full flow: qualify → generate outreach
 */

describe('Paul Logic API Integration', () => {
  it('should qualify domain and generate outreach for qualified result', async () => {
    // Step 1: Qualify the domain
    const qualifyResponse = await fetch('/api/paul/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'example.com',
        domainAuthority: 65,
        trafficPercentile: 70,
        niches: ['tech', 'business'],
        isSpam: false,
        niche: 'tech'
      })
    });

    expect(qualifyResponse.status).toBe(200);
    const qualifyData = await qualifyResponse.json();
    expect(qualifyData.success).toBe(true);
    expect(qualifyData.data.score).toBeGreaterThan(40);
    expect(qualifyData.data.category).toBe('warm');

    // Step 2: Generate outreach using qualified category
    const generateResponse = await fetch('/api/paul/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'example.com',
        publisherName: 'Jane Smith',
        niche: 'tech',
        category: qualifyData.data.category,
        domainAuthority: 65
      })
    });

    expect(generateResponse.status).toBe(200);
    const generateData = await generateResponse.json();
    expect(generateData.success).toBe(true);
    expect(generateData.data.subject).toBeDefined();
    expect(generateData.data.body).toBeDefined();
    expect(generateData.data.body.includes('example.com')).toBe(true);
    expect(generateData.data.body.includes('Jane Smith')).toBe(true);
  });

  it('should handle rejected domains gracefully', async () => {
    const qualifyResponse = await fetch('/api/paul/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'spam-site.com',
        domainAuthority: 10,
        trafficPercentile: 5,
        niches: [],
        isSpam: true,
        niche: 'general'
      })
    });

    expect(qualifyResponse.status).toBe(200);
    const qualifyData = await qualifyResponse.json();
    expect(qualifyData.data.score).toBeLessThan(40);
    expect(qualifyData.data.category).toBe('reject');
    expect(qualifyData.data.recommendation).toContain('too low');
  });

  it('should validate required fields on qualify endpoint', async () => {
    const response = await fetch('/api/paul/qualify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'example.com'
        // Missing domainAuthority, trafficPercentile, niche
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Missing required fields');
  });

  it('should validate category on generate-outreach endpoint', async () => {
    const response = await fetch('/api/paul/generate-outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        domain: 'example.com',
        niche: 'tech',
        category: 'invalid-category'
      })
    });

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('Invalid category');
  });

  it('should reject non-POST requests', async () => {
    const getResponse = await fetch('/api/paul/qualify', { method: 'GET' });
    const putResponse = await fetch('/api/paul/generate-outreach', { method: 'PUT' });

    expect(getResponse.status).toBe(405);
    expect(putResponse.status).toBe(405);
  });
});
