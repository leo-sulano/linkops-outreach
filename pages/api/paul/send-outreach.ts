import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import { generateOutreachEmail } from '@/lib/claude';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const contacts = await prisma.prospect.findMany({
            where: { status: 'OUTREACH_SENT' },
            take: 5,
        });

        if (contacts.length === 0) {
            return res.status(200).json({
                success: true,
                message: 'No contacts to send outreach to',
                sent: 0,
            });
        }

        let sent = 0;
        for (const contact of contacts) {
            try {
                const emailBody = await generateOutreachEmail(
                    contact.name,
                    contact.email,
                    contact.websiteCategory || 'their-website.com'
                );

                console.log(`Generated email for ${contact.name}: ${emailBody.substring(0, 100)}...`);
                sent++;
            } catch (err) {
                console.error(`Failed to generate email for ${contact.email}:`, err);
            }
        }

        return res.status(200).json({
            success: true,
            message: `Generated outreach emails for ${sent} contacts`,
            sent,
            total: contacts.length,
        });
    } catch (error) {
        console.error('Paul outreach error:', error);
        return res.status(500).json({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
}
