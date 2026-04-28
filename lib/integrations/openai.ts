import OpenAI from 'openai'
import { getMockBody } from '@/lib/mocks/paulResponses'
import { ValidationError, AuthError } from './errors'

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new AuthError('OpenAI API key not configured')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

export interface EmailGenerationParams {
  domain: string
  niche: string
  contactName: string
  relationshipTier: 'new' | 'warm' | 'trusted' | 'vip'
  priceRange: string
  previousEmails?: string[]
}

export async function generateEmailBody(
  params: EmailGenerationParams
): Promise<string> {
  const { domain, niche, contactName, relationshipTier, priceRange, previousEmails } = params

  if (!domain || domain.trim() === '') {
    throw new ValidationError('Domain is required', 'domain')
  }

  if (!niche || niche.trim() === '') {
    throw new ValidationError('Niche is required', 'niche')
  }

  const toneMap: Record<string, string> = {
    new: 'professional and formal',
    warm: 'friendly and appreciative',
    trusted: 'collaborative and casual',
    vip: 'personalized and high-touch',
  }

  const tone = toneMap[relationshipTier] || 'professional'

  const systemPrompt = `You are an expert link insertion outreach specialist. Write personalized, persuasive emails for link placements. 
The tone should be ${tone}. 
Keep emails concise (150-200 words), highlight mutual benefit, and include a clear call-to-action.
Never mention specific prices in the email body; that comes later in negotiation.`

  const userPrompt = `Write an outreach email to ${contactName} at ${domain} (niche: ${niche}). 
They may be interested in a link placement opportunity worth ${priceRange}.
${previousEmails ? `Previous emails sent: ${previousEmails.join('\n')}` : 'This is a first contact.'}
Make it feel personal and relevant to their site.`

  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 300,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      throw new Error('Empty response from OpenAI')
    }

    return content
  } catch (error: any) {
    console.warn(`OpenAI failed, falling back to mock template: ${error.message}`)

    try {
      const mockBody = getMockBody('standard', domain, niche, contactName)
      return mockBody
    } catch (fallbackError) {
      console.error('Fallback also failed:', fallbackError)
      return `Hi ${contactName},

We've been following ${domain} and think there's a great opportunity for a mutually beneficial link partnership.

Would you be open to a quick conversation about how we can help each other?

Best regards`
    }
  }
}

export async function generateEmailSubject(
  params: Omit<EmailGenerationParams, 'priceRange'>
): Promise<string> {
  const { domain, niche, contactName } = params

  const systemPrompt = `You are an expert email marketer. Write compelling, click-worthy email subject lines for outreach emails.
Keep them under 50 characters. Make them specific and personal, not generic.`

  const userPrompt = `Write a subject line for an outreach email to ${contactName} at ${domain} (${niche} niche). 
This is about a link placement opportunity.`

  try {
    const client = getOpenAIClient()
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userPrompt,
        },
      ],
      temperature: 0.7,
      max_tokens: 50,
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return `Link Opportunity for ${domain}`
    }

    return content.replace(/^["']|["']$/g, '')
  } catch (error: any) {
    console.warn(`OpenAI subject generation failed, using fallback: ${error.message}`)
    return `Link Opportunity for ${domain}`
  }
}
