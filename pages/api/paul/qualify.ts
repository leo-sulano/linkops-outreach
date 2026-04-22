import { NextApiRequest, NextApiResponse } from 'next';
import { qualifyDomain, type DomainScore } from '../../../lib/paul';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      domain,
      domainAuthority,
      trafficPercentile,
      niches,
      isSpam,
      niche
    } = req.body;

    // Validate required fields
    if (!domain || typeof domainAuthority !== 'number' || typeof trafficPercentile !== 'number' || !niche) {
      return res.status(400).json({
        error: 'Missing required fields: domain, domainAuthority, trafficPercentile, niche'
      });
    }

    // Call Paul Qualifier
    const result: DomainScore = qualifyDomain({
      domain,
      domainAuthority,
      trafficPercentile,
      niches: niches || [],
      isSpam: isSpam || false,
      niche
    });

    // Log to activity (mock for now - Phase 2 adds real logging)
    console.log(`[Paul] Qualified ${domain}: score=${result.score}, category=${result.category}`);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Qualify endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
