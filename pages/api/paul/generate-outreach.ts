import { NextApiRequest, NextApiResponse } from 'next';
import { generateOutreach, type OutreachGeneratorOutput } from '../../../lib/paul';
import { generateEmailBody, generateEmailSubject } from '@/lib/integrations/openai';
import { getContact, createMessage } from '@/lib/integrations/supabase';
import { NotFoundError } from '@/lib/integrations/errors';

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
      acceptBetting,
      contactName,
      relationshipTier,
      priceRange,
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

    // Generate email using OpenAI
    const tier = (relationshipTier || 'new') as 'new' | 'warm' | 'trusted' | 'vip';
    const range = priceRange || '500-2000';
    const subject = await generateEmailSubject({
      domain,
      niche,
      contactName: contactName || publisherName || 'there',
      relationshipTier: tier,
    });
    const body = await generateEmailBody({
      domain,
      niche,
      contactName: contactName || publisherName || 'there',
      relationshipTier: tier,
      priceRange: range,
    });

    // Log message to Supabase
    const message = await createMessage({
      contact_id: contact.id,
      direction: 'outbound',
      from_email: 'outreach@yourcompany.com',
      to_email: contact.email1 || contact.email_account || '',
      subject,
      body,
    });

    // Also call Paul Generator for backward compatibility
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

    console.log(`[Paul] Generated outreach for ${domain}: subject="${subject}"`);

    return res.status(200).json({
      success: true,
      domain,
      subject,
      body,
      messageId: message.id,
      createdAt: message.created_at,
      tone: tier,
      data: result,
    });
  } catch (error: any) {
    console.error('Generate outreach endpoint error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
