import type { NextApiRequest, NextApiResponse } from 'next'

export function requireApiKey(req: NextApiRequest, res: NextApiResponse): boolean {
  const apiKey = process.env.API_SECRET_KEY
  if (!apiKey) return true // no key configured — open in dev

  const provided =
    (req.headers['x-api-key'] as string) ||
    (req.query['api_key'] as string)

  if (provided !== apiKey) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
