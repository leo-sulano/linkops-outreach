import { NextApiRequest, NextApiResponse } from 'next';
import { generateOutreach, type OutreachGeneratorOutput } from '../../../lib/paul';

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
      publisherName,
      niche,
      category,
      domainAuthority,
      priorDeals,
      acceptCasino,
      acceptBetting
    } = req.body;

    // Validate required fields
    if (!domain || !niche || !category) {
      return res.status(400).json({
        error: 'Missing required fields: domain, niche, category'
      });
    }

    // Validate category
    if (!['standard', 'warm', 'premium'].includes(category)) {
      return res.status(400).json({
        error: 'Invalid category. Must be: standard, warm, or premium'
      });
    }

    // Call Paul Generator
    const result: OutreachGeneratorOutput = generateOutreach({
      domain,
      publisherName: publisherName || 'there',
      niche,
      category,
      domainAuthority,
      priorDeals: priorDeals || false,
      acceptCasino: acceptCasino || false,
      acceptBetting: acceptBetting || false
    });

    // Log to activity (mock for now - Phase 2 adds real logging)
    console.log(`[Paul] Generated outreach for ${domain}: template=${result.template}, tone=${result.tone}`);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Generate outreach endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
