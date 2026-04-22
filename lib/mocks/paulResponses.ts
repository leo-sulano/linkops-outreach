// Mock templates that simulate GPT-4o-mini responses for email generation
// In Phase 2, these are replaced with real OpenAI API calls

export const STANDARD_TEMPLATES = {
  subject: [
    'Potential partnership opportunity - {domain}',
    'Link partnership proposal for {niche} content',
    'Content collaboration opportunity',
    'Partnership inquiry - {domain} readership',
    'Mutual benefit proposition for your {niche} audience'
  ],
  body: [
    `Hi {publisherName},

I've been following {domain} and am impressed with your {niche} content and audience engagement.

We have high-quality, relevant content in the {niche} space that would resonate with your readers. We're exploring partnerships with publishers like you to share valuable resources with their audiences.

Would you be open to discussing a potential link partnership? We're flexible on terms and can work within your editorial standards.

Looking forward to hearing from you.

Best regards`,

    `Hello {publisherName},

I recently reviewed {domain} and noticed the excellent coverage you provide in {niche}.

I represent a team creating valuable {niche} resources, and we think there could be a mutually beneficial opportunity to collaborate with your audience.

Would a brief conversation about this partnership make sense? No pressure if the timing isn't right.

Best regards`
  ]
};

export const WARM_TEMPLATES = {
  subject: [
    'Great {niche} content at {domain} - partnership idea',
    'Appreciation for your work + quick partnership thought',
    'Collaboration opportunity for {domain} readers',
    'Potential synergy between our {niche} resources',
    'Let\'s collaborate on {niche} - {domain}'
  ],
  body: [
    `Hi {publisherName},

I really appreciate the quality work you're doing at {domain}. Your approach to {niche} is refreshingly thoughtful and well-researched.

I think there's a genuine opportunity for us to collaborate. We've created some {niche} resources that would add real value to your audience, and I'd love to explore how we might work together.

Would you be open to a brief conversation?

Best regards`,

    `Hello {publisherName},

I genuinely appreciate your work at {domain} - the {niche} perspective you bring is valuable and refreshing.

I'm reaching out because I think we could create something great together. We have {niche} content and resources that I believe your audience would find genuinely useful.

If you're open to it, I'd love to discuss how we might collaborate.

Warmly`
  ]
};

export const PREMIUM_TEMPLATES = {
  subject: [
    '{publisherName}, partnership for {domain} - premium opportunity',
    'Exclusive {niche} partnership - {domain}',
    'Premium collaboration proposal for {domain}',
    'VIP partnership opportunity',
    'Strategic partnership proposal for {domain} and audience'
  ],
  body: [
    `{publisherName},

I've been following {domain}'s trajectory in {niche}, and I'm genuinely impressed by what you've built. The authority and audience trust you've established is remarkable.

I represent a premium {niche} content platform, and I believe there's a valuable opportunity for strategic partnership. Rather than a transactional arrangement, I'm interested in exploring a collaboration that creates genuine value for both our audiences.

Your insights into {niche} + our resources could be a powerful combination. Are you open to exploring this?

I'd value the chance to discuss.

Best regards,
{senderName}`,

    `{publisherName},

I've long admired {domain} and the integrity you bring to {niche} publishing. It's rare to see that level of quality.

I'm reaching out because I think we have an opportunity for something genuinely special: a premium partnership that leverages your authority and our {niche} expertise to create something neither of us could alone.

I believe this could be mutually valuable. Would you have time for a brief conversation?

Looking forward to connecting.

Best regards`
  ]
};

export function getMockSubject(category: string, domain: string, niche: string, publisherName?: string): string {
  const templates = category === 'premium'
    ? PREMIUM_TEMPLATES.subject
    : category === 'warm'
      ? WARM_TEMPLATES.subject
      : STANDARD_TEMPLATES.subject;

  const template = templates[Math.floor(Math.random() * templates.length)];

  return template
    .replace(/\{domain\}/g, domain)
    .replace(/\{niche\}/g, niche)
    .replace(/\{publisherName\}/g, publisherName || 'there');
}

export function getMockBody(category: string, domain: string, niche: string, publisherName?: string, priorDeals?: boolean, acceptCasino?: boolean): string {
  const templates = category === 'premium'
    ? PREMIUM_TEMPLATES.body
    : category === 'warm'
      ? WARM_TEMPLATES.body
      : STANDARD_TEMPLATES.body;

  let template = templates[Math.floor(Math.random() * templates.length)];

  let body = template
    .replace(/\{publisherName\}/g, publisherName || 'there')
    .replace(/\{domain\}/g, domain)
    .replace(/\{niche\}/g, niche)
    .replace(/\{senderName\}/g, 'LinkOps Team');

  // Add prior deals mention if applicable
  if (priorDeals) {
    body = body.replace('We have', 'Following up on our previous partnership, we have');
  }

  // Filter casino content if not accepted
  if (acceptCasino === false && /casino|gambl|gaming|slots/i.test(niche)) {
    body = body.replace(/casino|gambling|gaming|slots/gi, 'entertainment');
  }

  return body;
}
