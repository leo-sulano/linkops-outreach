import { NextApiRequest, NextApiResponse } from 'next';
import { qualifyDomain, type DomainScore } from '../../../lib/paul';
import { getContact, saveMetadata, createMetadata, getMetadata } from '@/lib/integrations/supabase';
import { NotFoundError } from '@/lib/integrations/errors';
import { requireApiKey } from '@/lib/api-auth';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireApiKey(req, res)) return

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

    // Get contact from Supabase
    let contact;
    try {
      contact = await getContact(domain);
    } catch (error) {
      if (error instanceof NotFoundError) {
        return res.status(404).json({ error: `Contact not found for domain: ${domain}` });
      }
      throw error;
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

    // Save score to Supabase
    try {
      await saveMetadata(contact.id, {
        last_qualified_at: new Date().toISOString(),
        last_qualification_score: result.score,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        await createMetadata(contact.id, {
          last_qualified_at: new Date().toISOString(),
          last_qualification_score: result.score,
        });
      } else {
        throw error;
      }
    }

    console.log(`[Paul] Qualified ${domain}: score=${result.score}, category=${result.category}`);

    return res.status(200).json({
      success: true,
      domain,
      score: result.score,
      category: result.category,
      recommendation: result.recommendation,
      contactId: contact.id,
    });
  } catch (error: any) {
    console.error('Qualify endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
