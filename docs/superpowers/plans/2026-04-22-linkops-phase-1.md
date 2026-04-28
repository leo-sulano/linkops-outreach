# LinkOps Phase 1 (Core Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build domain qualification scoring, outreach email generation, and basic API routes to enable the dashboard "Start Outreach" button to call Paul Logic for real decisions.

**Architecture:** Paul Logic is a pure TypeScript module (no API routes embedded in it). Domain Qualifier scores contacts 0-100 based on DA/traffic/niche/spam. Outreach Generator calls mock GPT-4o-mini to write personalized emails. API routes orchestrate these modules and return JSON. Dashboard calls `/api/paul/qualify` and `/api/paul/generate-outreach` when user clicks buttons.

**Tech Stack:** TypeScript, Next.js API routes, Jest for testing, mock responses (no real GPT/Gmail yet)

---

## File Structure

```
lib/paul/
├── qualifier.ts          (Pure logic: domain scoring)
├── generator.ts          (Pure logic: email generation)
└── index.ts              (Exports)

pages/api/paul/
├── qualify.ts            (POST endpoint)
└── generate-outreach.ts  (POST endpoint)

lib/mocks/
├── paulResponses.ts      (Mock GPT-4o-mini templates)
└── gmailResponses.ts     (Mock Gmail send responses)

lib/hooks/
└── usePaul.ts            (Custom hook for API calls)

tests/unit/paul/
├── qualifier.test.ts
└── generator.test.ts

tests/integration/api/
└── paul.test.ts
```

---

## Task 1: Qualifier Module Types & Structure

**Files:**
- Create: `lib/paul/types.ts`
- Create: `tests/unit/paul/qualifier.test.ts`
- Test: Full test suite

**Context:** Domain Qualifier takes external data (DA, traffic, etc.) and returns a score 0-100 with category. This is the foundation for all downstream decisions.

- [ ] **Step 1: Write the failing test**

Create `tests/unit/paul/qualifier.test.ts`:

```typescript
import { qualifyDomain, DomainScore } from '../../lib/paul/qualifier';

describe('Domain Qualifier', () => {
  it('should reject low-scoring domains (score < 40)', () => {
    const input = {
      domain: 'spam-domain.com',
      domainAuthority: 15,
      trafficPercentile: 10,
      niches: ['general'],
      isSpam: true,
      niche: 'general'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeLessThan(40);
    expect(result.category).toBe('reject');
  });

  it('should categorize standard domains (score 40-59)', () => {
    const input = {
      domain: 'mediocre-site.com',
      domainAuthority: 35,
      trafficPercentile: 45,
      niches: ['tech'],
      isSpam: false,
      niche: 'tech'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(60);
    expect(result.category).toBe('standard');
  });

  it('should categorize warm domains (score 60-79)', () => {
    const input = {
      domain: 'good-site.com',
      domainAuthority: 55,
      trafficPercentile: 65,
      niches: ['tech', 'business'],
      isSpam: false,
      niche: 'tech'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.score).toBeLessThan(80);
    expect(result.category).toBe('warm');
  });

  it('should categorize premium domains (score >= 80)', () => {
    const input = {
      domain: 'authority-site.com',
      domainAuthority: 80,
      trafficPercentile: 85,
      niches: ['business', 'tech'],
      isSpam: false,
      niche: 'business'
    };

    const result = qualifyDomain(input);

    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.category).toBe('premium');
  });

  it('should return factor breakdown', () => {
    const input = {
      domain: 'test-site.com',
      domainAuthority: 50,
      trafficPercentile: 50,
      niches: ['tech'],
      isSpam: false,
      niche: 'tech'
    };

    const result = qualifyDomain(input);

    expect(result.factors).toBeDefined();
    expect(result.factors.da).toBeDefined();
    expect(result.factors.traffic).toBeDefined();
    expect(result.factors.niche).toBeDefined();
    expect(result.factors.antiSpam).toBeDefined();
  });

  it('should apply anti-spam penalty', () => {
    const goodDomain = qualifyDomain({
      domain: 'good.com',
      domainAuthority: 50,
      trafficPercentile: 50,
      niches: ['tech'],
      isSpam: false,
      niche: 'tech'
    });

    const spamDomain = qualifyDomain({
      domain: 'spam.com',
      domainAuthority: 50,
      trafficPercentile: 50,
      niches: ['tech'],
      isSpam: true,
      niche: 'tech'
    });

    expect(spamDomain.score).toBeLessThan(goodDomain.score);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/paul/qualifier.test.ts
```

Expected: FAIL with "Cannot find module '../../lib/paul/qualifier'"

- [ ] **Step 3: Create qualifier types**

Create `lib/paul/types.ts`:

```typescript
export interface QualifyInput {
  domain: string;
  domainAuthority: number; // 0-100
  trafficPercentile: number; // 0-100
  niches: string[]; // ["tech", "business", etc.]
  isSpam: boolean;
  niche: string; // Primary niche for this campaign
}

export interface DomainFactors {
  da: number; // 0-1, DA contribution
  traffic: number; // 0-1, traffic contribution
  niche: number; // 0-1, niche match
  antiSpam: number; // 0-1, anti-spam score
}

export interface DomainScore {
  score: number; // 0-100
  category: 'reject' | 'standard' | 'warm' | 'premium';
  factors: DomainFactors;
  recommendation: string;
}

export interface OutreachGeneratorInput {
  domain: string;
  publisherName?: string;
  niche: string;
  category: 'standard' | 'warm' | 'premium';
  domainAuthority?: number;
  priorDeals?: boolean;
  acceptCasino?: boolean;
  acceptBetting?: boolean;
}

export interface OutreachGeneratorOutput {
  subject: string;
  body: string;
  tone: string;
  template: 'standard' | 'warm' | 'premium';
  estimatedOpenRate: number;
}
```

- [ ] **Step 4: Create empty qualifier module**

Create `lib/paul/qualifier.ts`:

```typescript
import { QualifyInput, DomainScore } from './types';

/**
 * Qualifies a domain based on composite scoring:
 * Score = (DA × 0.4) + (Traffic% × 0.3) + (Niche × 0.2) + (AntiSpam × 0.1)
 * 
 * Categories:
 * - reject: score < 40
 * - standard: 40-59
 * - warm: 60-79
 * - premium: >= 80
 */
export function qualifyDomain(input: QualifyInput): DomainScore {
  // TODO: implement
  return {
    score: 0,
    category: 'reject',
    factors: {
      da: 0,
      traffic: 0,
      niche: 0,
      antiSpam: 0
    },
    recommendation: ''
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add tests/unit/paul/qualifier.test.ts lib/paul/types.ts lib/paul/qualifier.ts
git commit -m "test: add domain qualifier test suite and type definitions"
```

---

## Task 2: Implement Domain Qualifier Logic

**Files:**
- Modify: `lib/paul/qualifier.ts`
- Test: `tests/unit/paul/qualifier.test.ts`

- [ ] **Step 1: Implement qualifier scoring**

Replace `lib/paul/qualifier.ts` with complete implementation:

```typescript
import { QualifyInput, DomainScore } from './types';

const NICHE_KEYWORDS: Record<string, string[]> = {
  tech: ['technology', 'software', 'ai', 'saas', 'startup', 'code', 'dev', 'tech', 'computer'],
  business: ['business', 'finance', 'corporate', 'enterprise', 'b2b', 'sales', 'marketing'],
  gambling: ['casino', 'gambling', 'betting', 'poker', 'slots', 'gaming', 'sports betting'],
  sports: ['sports', 'fitness', 'athletics', 'gym', 'training', 'health', 'exercise'],
  general: []
};

function calculateNicheMatch(inputNiches: string[], targetNiche: string): number {
  if (!inputNiches || inputNiches.length === 0) return 0.3;
  
  const targetKeywords = NICHE_KEYWORDS[targetNiche.toLowerCase()] || [];
  if (targetKeywords.length === 0) return 0.5; // generic niche
  
  const matchedKeywords = inputNiches.filter((niche) =>
    targetKeywords.some(keyword => niche.toLowerCase().includes(keyword) || keyword.includes(niche.toLowerCase()))
  );
  
  return Math.min(1, (matchedKeywords.length / targetKeywords.length) * 1.2);
}

export function qualifyDomain(input: QualifyInput): DomainScore {
  // Normalize inputs to 0-1 scale
  const daNormalized = Math.min(1, input.domainAuthority / 100);
  const trafficNormalized = input.trafficPercentile / 100;
  
  // Niche match: 0-1
  const nicheMatch = calculateNicheMatch(input.niches, input.niche);
  
  // Anti-spam: 1.0 if clean, 0.5 if suspicious, 0.0 if spam
  const antiSpamScore = input.isSpam ? 0 : 1;
  
  // Calculate composite score: (DA × 0.4) + (Traffic × 0.3) + (Niche × 0.2) + (AntiSpam × 0.1)
  const rawScore = 
    (daNormalized * 0.4) + 
    (trafficNormalized * 0.3) + 
    (nicheMatch * 0.2) + 
    (antiSpamScore * 0.1);
  
  const score = Math.round(rawScore * 100); // Convert to 0-100 scale
  
  let category: 'reject' | 'standard' | 'warm' | 'premium';
  if (score < 40) {
    category = 'reject';
  } else if (score < 60) {
    category = 'standard';
  } else if (score < 80) {
    category = 'warm';
  } else {
    category = 'premium';
  }
  
  const factors = {
    da: daNormalized,
    traffic: trafficNormalized,
    niche: nicheMatch,
    antiSpam: antiSpamScore
  };
  
  // Generate recommendation
  const recommendation = getRecommendation(score, category, factors);
  
  return {
    score,
    category,
    factors,
    recommendation
  };
}

function getRecommendation(score: number, category: string, factors: any): string {
  if (category === 'reject') {
    return `Domain score too low (${score}). Consider finding higher-authority publishers.`;
  }
  
  const strengths = [];
  const weaknesses = [];
  
  if (factors.da > 0.6) strengths.push('high authority');
  if (factors.da < 0.3) weaknesses.push('low authority');
  
  if (factors.traffic > 0.6) strengths.push('good traffic');
  if (factors.traffic < 0.3) weaknesses.push('low traffic');
  
  if (factors.niche > 0.7) strengths.push('niche match');
  if (factors.niche < 0.3) weaknesses.push('poor niche match');
  
  if (factors.antiSpam < 1) weaknesses.push('spam signals detected');
  
  let rec = `${category.toUpperCase()} domain (${score}). `;
  if (strengths.length > 0) rec += `Strengths: ${strengths.join(', ')}. `;
  if (weaknesses.length > 0) rec += `Consider: ${weaknesses.join(', ')}.`;
  
  return rec;
}
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
npm test -- tests/unit/paul/qualifier.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 3: Commit**

```bash
git add lib/paul/qualifier.ts
git commit -m "feat: implement domain qualifier with composite scoring"
```

---

## Task 3: Generator Module Types & Structure

**Files:**
- Create: `tests/unit/paul/generator.test.ts`
- Modify: `lib/paul/types.ts` (already has types)

- [ ] **Step 1: Write failing test**

Create `tests/unit/paul/generator.test.ts`:

```typescript
import { generateOutreach } from '../../lib/paul/generator';

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

    // If acceptCasino=false, body should not mention gaming/casino content
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- tests/unit/paul/generator.test.ts
```

Expected: FAIL with "Cannot find module '../../lib/paul/generator'"

- [ ] **Step 3: Create empty generator module**

Create `lib/paul/generator.ts`:

```typescript
import { OutreachGeneratorInput, OutreachGeneratorOutput } from './types';

/**
 * Generates personalized outreach email based on domain category and niche.
 * Uses template selection and variable interpolation.
 */
export function generateOutreach(input: OutreachGeneratorInput): OutreachGeneratorOutput {
  // TODO: implement
  return {
    subject: '',
    body: '',
    tone: 'professional',
    template: 'standard',
    estimatedOpenRate: 0
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add tests/unit/paul/generator.test.ts lib/paul/generator.ts
git commit -m "test: add outreach generator test suite"
```

---

## Task 4: Implement Outreach Generator Logic

**Files:**
- Modify: `lib/paul/generator.ts`
- Create: `lib/mocks/paulResponses.ts`

- [ ] **Step 1: Create mock GPT responses**

Create `lib/mocks/paulResponses.ts`:

```typescript
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

Following your work at {domain} has been genuinely enjoyable - the {niche} perspective you bring is valuable.

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
    .replace('{domain}', domain)
    .replace('{niche}', niche)
    .replace('{publisherName}', publisherName || 'there');
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
  if (acceptCasino === false && niche.toLowerCase().includes('gambl')) {
    body = body.replace(/casino|gambling|gaming|slots/gi, 'entertainment');
  }
  
  return body;
}
```

- [ ] **Step 2: Implement generator logic**

Replace `lib/paul/generator.ts`:

```typescript
import { OutreachGeneratorInput, OutreachGeneratorOutput } from './types';
import { getMockSubject, getMockBody } from '../mocks/paulResponses';

const ESTIMATED_OPEN_RATES: Record<string, number> = {
  standard: 18,
  warm: 28,
  premium: 35
};

const TEMPLATE_TONES: Record<string, string> = {
  standard: 'professional',
  warm: 'friendly',
  premium: 'vip'
};

/**
 * Generates personalized outreach email based on domain category and niche.
 * Uses template selection and variable interpolation.
 * 
 * In Phase 2, getMockSubject/getMockBody are replaced with real GPT-4o-mini calls.
 */
export function generateOutreach(input: OutreachGeneratorInput): OutreachGeneratorOutput {
  const { domain, publisherName, niche, category, priorDeals, acceptCasino } = input;
  
  // Validate category
  const validCategory = ['standard', 'warm', 'premium'].includes(category) ? category : 'standard';
  
  // Generate subject and body using mock templates
  const subject = getMockSubject(validCategory, domain, niche, publisherName);
  const body = getMockBody(validCategory, domain, niche, publisherName, priorDeals, acceptCasino);
  
  // Get tone and estimated open rate
  const tone = TEMPLATE_TONES[validCategory] || 'professional';
  const estimatedOpenRate = ESTIMATED_OPEN_RATES[validCategory] || 18;
  
  return {
    subject,
    body,
    tone,
    template: validCategory as 'standard' | 'warm' | 'premium',
    estimatedOpenRate
  };
}
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test -- tests/unit/paul/generator.test.ts
```

Expected: PASS (all 6 tests)

- [ ] **Step 4: Commit**

```bash
git add lib/paul/generator.ts lib/mocks/paulResponses.ts
git commit -m "feat: implement outreach generator with mock templates"
```

---

## Task 5: Create Paul Module Exports

**Files:**
- Create: `lib/paul/index.ts`

- [ ] **Step 1: Create module exports**

Create `lib/paul/index.ts`:

```typescript
export { qualifyDomain } from './qualifier';
export type { DomainScore, QualifyInput, DomainFactors } from './types';

export { generateOutreach } from './generator';
export type { OutreachGeneratorInput, OutreachGeneratorOutput } from './types';

export type { QualifyInput, OutreachGeneratorInput, OutreachGeneratorOutput, DomainScore } from './types';
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/paul/index.ts
git commit -m "feat: add Paul module exports"
```

---

## Task 6: API Route - /api/paul/qualify

**Files:**
- Create: `pages/api/paul/qualify.ts`

- [ ] **Step 1: Create API endpoint**

Create `pages/api/paul/qualify.ts`:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { qualifyDomain, DomainScore } from '../../../lib/paul';

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
```

- [ ] **Step 2: Test endpoint manually**

```bash
curl -X POST http://localhost:3007/api/paul/qualify \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "domainAuthority": 65,
    "trafficPercentile": 70,
    "niches": ["tech", "business"],
    "isSpam": false,
    "niche": "tech"
  }'
```

Expected response: 
```json
{
  "success": true,
  "data": {
    "score": 68,
    "category": "warm",
    "factors": { ... },
    "recommendation": "..."
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add pages/api/paul/qualify.ts
git commit -m "feat: add /api/paul/qualify endpoint"
```

---

## Task 7: API Route - /api/paul/generate-outreach

**Files:**
- Create: `pages/api/paul/generate-outreach.ts`

- [ ] **Step 1: Create API endpoint**

Create `pages/api/paul/generate-outreach.ts`:

```typescript
import { NextApiRequest, NextApiResponse } from 'next';
import { generateOutreach, OutreachGeneratorOutput } from '../../../lib/paul';

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
```

- [ ] **Step 2: Test endpoint manually**

```bash
curl -X POST http://localhost:3007/api/paul/generate-outreach \
  -H "Content-Type: application/json" \
  -d '{
    "domain": "example.com",
    "publisherName": "John Smith",
    "niche": "tech",
    "category": "warm",
    "domainAuthority": 65,
    "priorDeals": false
  }'
```

Expected response:
```json
{
  "success": true,
  "data": {
    "subject": "Great tech content at example.com - partnership idea",
    "body": "Hi John Smith,\n\nI really appreciate...",
    "tone": "friendly",
    "template": "warm",
    "estimatedOpenRate": 28
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add pages/api/paul/generate-outreach.ts
git commit -m "feat: add /api/paul/generate-outreach endpoint"
```

---

## Task 8: Custom Hook for Paul API Calls

**Files:**
- Create: `lib/hooks/usePaul.ts`

- [ ] **Step 1: Create custom hook**

Create `lib/hooks/usePaul.ts`:

```typescript
import { useState } from 'react';
import { DomainScore, OutreachGeneratorOutput } from '../paul';

interface UsePaulQualifyState {
  loading: boolean;
  error: string | null;
  result: DomainScore | null;
}

interface UsePaulGenerateState {
  loading: boolean;
  error: string | null;
  result: OutreachGeneratorOutput | null;
}

/**
 * Hook to qualify a domain via Paul API
 */
export function usePaulQualify() {
  const [state, setState] = useState<UsePaulQualifyState>({
    loading: false,
    error: null,
    result: null
  });

  const qualify = async (input: {
    domain: string;
    domainAuthority: number;
    trafficPercentile: number;
    niches?: string[];
    isSpam?: boolean;
    niche: string;
  }) => {
    setState({ loading: true, error: null, result: null });

    try {
      const response = await fetch('/api/paul/qualify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      setState({ loading: false, error: null, result: data.data });
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: errorMessage, result: null });
      throw err;
    }
  };

  return { ...state, qualify };
}

/**
 * Hook to generate outreach email via Paul API
 */
export function usePaulGenerateOutreach() {
  const [state, setState] = useState<UsePaulGenerateState>({
    loading: false,
    error: null,
    result: null
  });

  const generate = async (input: {
    domain: string;
    publisherName?: string;
    niche: string;
    category: 'standard' | 'warm' | 'premium';
    domainAuthority?: number;
    priorDeals?: boolean;
    acceptCasino?: boolean;
    acceptBetting?: boolean;
  }) => {
    setState({ loading: true, error: null, result: null });

    try {
      const response = await fetch('/api/paul/generate-outreach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input)
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Unknown error');
      }

      setState({ loading: false, error: null, result: data.data });
      return data.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setState({ loading: false, error: errorMessage, result: null });
      throw err;
    }
  };

  return { ...state, generate };
}
```

- [ ] **Step 2: Verify types**

```bash
npx tsc --noEmit
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add lib/hooks/usePaul.ts
git commit -m "feat: add custom hooks for Paul API integration"
```

---

## Task 9: Dashboard Integration - Wire Qualify & Generate

**Files:**
- Modify: `pages/dashboard/index.tsx`
- Modify: `components/dashboard/ContactTableRow.tsx`

- [ ] **Step 1: Update ContactTableRow to show qualify button and status**

Modify `components/dashboard/ContactTableRow.tsx` (find the return statement and update):

```typescript
import React, { useState } from 'react';
import { Contact } from './types';
import { usePaulQualify, usePaulGenerateOutreach } from '../../lib/hooks/usePaul';

interface ContactTableRowProps {
  contact: Contact;
  isExpanded: boolean;
  onClick: () => void;
  onQualify?: (contactId: string, score: any) => void;
}

export function ContactTableRow({ contact, isExpanded, onClick, onQualify }: ContactTableRowProps) {
  const { qualify, loading: qualifyLoading } = usePaulQualify();
  const [qualifiedScore, setQualifiedScore] = useState<any>(null);

  const handleQualify = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const result = await qualify({
        domain: contact.domain,
        domainAuthority: 50, // Mock value - Phase 2: real DA lookup
        trafficPercentile: 50, // Mock value - Phase 2: real traffic lookup
        niches: [contact.niche],
        isSpam: false,
        niche: contact.niche
      });
      setQualifiedScore(result);
      onQualify?.(contact.id, result);
    } catch (error) {
      console.error('Qualification failed:', error);
    }
  };

  const statusColor = {
    pending: 'bg-blue-500/10 text-blue-300',
    under_negotiation: 'bg-purple-500/10 text-purple-300',
    confirmed: 'bg-green-500/10 text-green-300',
    no_deal: 'bg-red-500/10 text-red-300',
    follow_up: 'bg-yellow-500/10 text-yellow-300'
  }[contact.status] || 'bg-slate-500/10 text-slate-300';

  return (
    <tr className={isExpanded ? 'bg-slate-750' : 'hover:bg-slate-750/50'}>
      <td className="px-4 py-3 text-sm text-slate-100 font-medium">{contact.domain}</td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.niche}</td>
      <td className="px-4 py-3 text-sm">
        <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${statusColor}`}>
          {contact.status}
        </span>
        {qualifiedScore && (
          <span className="ml-2 text-xs text-emerald-400">
            Score: {qualifiedScore.score}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.email1}</td>
      <td className="px-4 py-3 text-sm text-slate-300">€{contact.standardPrice}</td>
      <td className="px-4 py-3 text-sm text-slate-300">€{contact.gamblingPrice}</td>
      <td className="px-4 py-3 text-sm text-slate-300">{contact.dateConfirmed || '—'}</td>
      <td className="px-4 py-3 text-sm">
        <button
          onClick={handleQualify}
          disabled={qualifyLoading}
          className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-600 text-xs rounded text-white font-medium"
        >
          {qualifyLoading ? 'Scoring...' : 'Qualify'}
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: Update dashboard index to pass onQualify callback and handle results**

Modify `pages/dashboard/index.tsx` (update the ContactTable component call):

```typescript
// Find the ContactTable render section and update it:

<ContactTable
  contacts={contacts}
  onUpdateContact={handleUpdateContact}
  onDeleteContact={handleDeleteContact}
  onQualify={(contactId, score) => {
    // Update contact with qualification score
    setContacts(contacts.map(c => 
      c.id === contactId 
        ? { ...c, qualificationScore: score.score, qualificationCategory: score.category }
        : c
    ));
  }}
/>

// Also update ContactTable component definition to accept onQualify prop:
interface ContactTableProps {
  contacts: Contact[];
  onUpdateContact: (contact: Contact) => void;
  onDeleteContact: (contactId: string) => void;
  onQualify?: (contactId: string, score: any) => void;
}

// And pass it to ContactTableRow:
<ContactTableRow
  contact={contact}
  isExpanded={expandedId === contact.id}
  onClick={() =>
    setExpandedId(
      expandedId === contact.id ? null : contact.id
    )
  }
  onQualify={onQualify}
/>
```

- [ ] **Step 3: Update mock data to include qualification score fields (optional)**

Modify `lib/mockData.ts` to add two new fields to each contact:

```typescript
// In each contact object, add:
qualificationScore?: number;
qualificationCategory?: 'reject' | 'standard' | 'warm' | 'premium';

// Example:
{
  id: '1',
  domain: 'techblog.com',
  niche: 'Tech',
  status: 'pending',
  email1: 'editor@techblog.com',
  // ... other fields
  qualificationScore: undefined,
  qualificationCategory: undefined
}
```

- [ ] **Step 4: Commit**

```bash
git add components/dashboard/ContactTableRow.tsx pages/dashboard/index.tsx lib/mockData.ts
git commit -m "feat: integrate Paul Qualifier into dashboard contact rows"
```

---

## Task 10: Integration Test - Full Qualify + Generate Flow

**Files:**
- Create: `tests/integration/api/paul.test.ts`

- [ ] **Step 1: Write integration test**

Create `tests/integration/api/paul.test.ts`:

```typescript
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
```

- [ ] **Step 2: Note on test execution**

These tests require the dev server running. For Phase 2, we'll add Jest setup for API mocking.

Run manually with:
```bash
npm run dev
# In another terminal:
npm test -- tests/integration/api/paul.test.ts
```

Or run a simple fetch test:
```bash
curl -X POST http://localhost:3007/api/paul/qualify \
  -H "Content-Type: application/json" \
  -d '{"domain":"example.com","domainAuthority":65,"trafficPercentile":70,"niches":["tech"],"isSpam":false,"niche":"tech"}'
```

- [ ] **Step 3: Commit**

```bash
git add tests/integration/api/paul.test.ts
git commit -m "test: add integration tests for Paul API endpoints"
```

---

## Final: Test All Pieces Together

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Expected output: Server running on http://localhost:3007 (or similar available port)

- [ ] **Step 2: Navigate to dashboard**

Open http://localhost:3007/dashboard in browser

- [ ] **Step 3: Click "Qualify" button on a contact row**

Expected: 
- Button shows "Scoring..." while loading
- Qualification score appears next to status badge (e.g., "Score: 68")
- No errors in browser console

- [ ] **Step 4: Test API directly**

```bash
# Test Qualify
curl -X POST http://localhost:3007/api/paul/qualify \
  -H "Content-Type: application/json" \
  -d '{
    "domain":"example.com",
    "domainAuthority":65,
    "trafficPercentile":70,
    "niches":["tech"],
    "isSpam":false,
    "niche":"tech"
  }'

# Test Generate Outreach
curl -X POST http://localhost:3007/api/paul/generate-outreach \
  -H "Content-Type: application/json" \
  -d '{
    "domain":"example.com",
    "publisherName":"John Smith",
    "niche":"tech",
    "category":"warm"
  }'
```

Expected: Both return 200 with success=true and data payloads

- [ ] **Step 5: Run unit tests**

```bash
npm test -- tests/unit/paul
```

Expected: All tests pass (10+ tests from qualifier + generator)

- [ ] **Step 6: Final commit**

```bash
git status
# Verify all changes are staged
git log --oneline -10
# Verify commits are clean and descriptive
```

---

## Success Criteria

✅ Domain Qualifier module implemented with 6+ tests passing  
✅ Outreach Generator module implemented with 6+ tests passing  
✅ `/api/paul/qualify` endpoint working (manual curl test passes)  
✅ `/api/paul/generate-outreach` endpoint working (manual curl test passes)  
✅ Dashboard "Qualify" button calls API and displays score  
✅ All TypeScript types compile without errors  
✅ All 10 tasks committed with clear commit messages  
✅ No mock data hardcoded in Paul Logic (uses proper inputs)  
✅ Error handling in API routes returns proper status codes  
✅ Integration test suite documents full flow  

---

## Notes for Phase 2

- Replace mock GPT responses in `lib/mocks/paulResponses.ts` with real OpenAI API calls
- Add Gmail API integration for actual email sending (currently mock)
- Add n8n webhook setup for reply monitoring
- Wire up `/api/paul/classify-reply` endpoint for incoming mail processing
- Add negotiation engine (`lib/paul/negotiator.ts`)
- Add deal closure engine (`lib/paul/validator.ts`)
- Create `/dashboard/deals` page for approved deals + negotiation tracking

---

**Plan Status:** ✅ Complete and ready for execution
