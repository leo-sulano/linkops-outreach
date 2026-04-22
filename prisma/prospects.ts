import { prisma } from '../prisma';

export async function importProspects(data: any[]) {
    const operations = data.map((item) =>
        prisma.prospect.upsert({
            where: { email: item.email },
            update: {
                name: item.name,
                websiteCategory: item.website_category,
            },
            create: {
                email: item.email,
                name: item.name,
                websiteCategory: item.website_category,
                status: 'OUTREACH_SENT',
            },
        })
    );
    return await Promise.all(operations);
}