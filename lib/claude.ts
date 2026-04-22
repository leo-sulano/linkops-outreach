import Anthropic from '@anthropic-ai/sdk';

const apiKey = process.env.CLAUDE_API_KEY;

if (!apiKey) {
    throw new Error('Missing CLAUDE_API_KEY in environment variables.');
}

export const claude = new Anthropic({
    apiKey,
});

export async function generateOutreachEmail(
    prospectName: string,
    prospectEmail: string,
    prospectWebsite: string
): Promise<string> {
    const message = await claude.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 1024,
        messages: [
            {
                role: 'user',
                content: `Write a professional but personalized email to ${prospectName} at ${prospectWebsite} to propose a link insertion opportunity. Keep it concise (3-4 sentences). Return only the email body.`,
            },
        ],
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
}

export async function generateNegotiationResponse(
    prospectName: string,
    prospectMessage: string
): Promise<string> {
    const message = await claude.messages.create({
        model: 'claude-opus-4-1',
        max_tokens: 1024,
        messages: [
            {
                role: 'user',
                content: `${prospectName} sent this response to our outreach: "${prospectMessage}". Generate a professional negotiation response that addresses their concerns. Return only the email body.`,
            },
        ],
    });

    return message.content[0].type === 'text' ? message.content[0].text : '';
}
