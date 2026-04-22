import { saveContact, createMetadata } from '../lib/integrations/supabase'

const phase1TestData = [
  {
    domain: 'techblog.com',
    niche: 'tech',
    email_account: 'contact@techblog.com',
    email1: 'john@techblog.com',
    name1: 'John Smith',
    status: 'pending' as const,
    follow_up_count: 0,
    notes: 'Migrated from Phase 1',
  },
  {
    domain: 'financeplus.io',
    niche: 'finance',
    email_account: 'hello@financeplus.io',
    email1: 'sarah@financeplus.io',
    name1: 'Sarah Johnson',
    status: 'pending' as const,
    follow_up_count: 0,
    notes: 'Migrated from Phase 1',
  },
  {
    domain: 'gamingzone.net',
    niche: 'gaming',
    email_account: 'info@gamingzone.net',
    email1: 'mike@gamingzone.net',
    name1: 'Mike Davis',
    status: 'pending' as const,
    follow_up_count: 0,
    notes: 'Migrated from Phase 1',
  },
]

async function migratePhase1Data() {
  console.log('Starting Phase 1 → Supabase migration...')
  let created = 0
  let errors = 0

  for (const contact of phase1TestData) {
    try {
      const savedContact = await saveContact(contact)
      console.log(`✓ Created contact: ${savedContact.domain}`)
      await createMetadata(savedContact.id, {
        domain_authority: 50,
        traffic_percentage: 2.5,
        sentiment: 0,
        tags: ['migrated-phase1'],
      })
      created++
    } catch (error: any) {
      console.error(`✗ Failed to migrate ${contact.domain}: ${error.message}`)
      errors++
    }
  }

  console.log(`Migration complete: ${created} created, ${errors} errors`)
  if (errors === 0) {
    console.log('✓ All Phase 1 data successfully migrated!')
  }
}

migratePhase1Data().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
