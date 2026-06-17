import * as dotenv from 'dotenv'
dotenv.config({ path: '../.env.local' })

import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
)

async function main() {
  const { data, error } = await sb
    .from('lead_jobs')
    .select('id, domain, error_log')
    .eq('status', 'paused')
    .ilike('error_log', '%Unable to obtain browser driver%')

  if (error) {
    console.error('Failed to fetch jobs:', error.message)
    process.exit(1)
  }

  if (!data || data.length === 0) {
    console.log('No matching failed jobs found.')
    return
  }

  console.log(`Found ${data.length} job(s) to re-queue:`)
  data.forEach((j) => console.log(` - ${j.domain}`))

  const ids = data.map((j) => j.id)
  const { error: updateError } = await sb
    .from('lead_jobs')
    .update({
      status: 'pending',
      retry_count: 0,
      error_log: null,
      started_at: null,
      completed_at: null,
    })
    .in('id', ids)

  if (updateError) {
    console.error('Update failed:', updateError.message)
    process.exit(1)
  }

  console.log(`Re-queued ${ids.length} job(s) → pending.`)
}

main()
