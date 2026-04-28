import Anthropic from '@anthropic-ai/sdk';

let _client: Anthropic | null = null

function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.CLAUDE_API_KEY
    if (!apiKey) throw new Error('Missing CLAUDE_API_KEY environment variable')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

export async function generateOutreachEmail(
  prospectName: string,
  prospectEmail: string,
  prospectWebsite: string
): Promise<string> {
  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Write a professional but personalized outreach email to ${prospectName} at ${prospectWebsite} proposing a link insertion opportunity. Keep it concise (3-4 sentences). Return only the email body, no subject line.`,
    }],
  })
  return message.content[0].type === 'text' ? message.content[0].text : ''
}

export async function generateEmailSubject(
  contactName: string,
  domain: string,
  niche: string
): Promise<string> {
  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `Write a concise, specific email subject line (under 50 characters) for a link placement outreach to ${contactName} at ${domain} in the ${niche} niche. Return only the subject line, no quotes or extra text.`,
    }],
  })
  const text = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  return text || `Link placement opportunity — ${domain}`
}

export async function generateNegotiationResponse(
  prospectName: string,
  prospectMessage: string
): Promise<string> {
  const message = await getClient().messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `${prospectName} sent this response to our outreach: "${prospectMessage}". Generate a professional negotiation response that addresses their concerns. Return only the email body.`,
    }],
  })
  return message.content[0].type === 'text' ? message.content[0].text : ''
}
