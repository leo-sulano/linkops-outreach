import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method === 'GET') {
            const contacts = await prisma.prospect.findMany({
                take: 100,
            });

            return res.status(200).json({
                success: true,
                count: contacts.length,
                data: contacts,
            });
        }

        if (req.method === 'POST') {
            const { email, name, websiteCategory } = req.body;

            if (!email || !name) {
                return res.status(400).json({ error: 'Email and name are required' });
            }

            const contact = await prisma.prospect.create({
                data: {
                    email,
                    name,
                    websiteCategory: websiteCategory || 'general',
                    status: 'OUTREACH_SENT',
                },
            });

            return res.status(201).json({
                success: true,
                data: contact,
            });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Contacts API error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
