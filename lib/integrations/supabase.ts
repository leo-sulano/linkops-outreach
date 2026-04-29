import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NotFoundError,
  ValidationError,
  SupabaseConnectionError,
  DuplicateError,
} from './errors'

let supabaseClient: SupabaseClient | null = null

export function getSupabaseClient(): SupabaseClient {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables')
    }

    supabaseClient = createClient(url, key)
  }
  return supabaseClient
}

export interface Contact {
  id: string
  domain: string
  niche: string
  email_account?: string
  email1?: string
  name1?: string
  email2?: string
  name2?: string
  email3?: string
  name3?: string
  status: 'pending' | 'under_negotiation' | 'approved' | 'no_deal' | 'follow_up'
  date_confirmed?: string
  last_outreach_at?: string
  follow_up_count: number
  notes?: string
  created_at: string
  updated_at: string
}

export interface ContactMetadata {
  id: string
  contact_id: string
  domain_authority?: number
  traffic_percentage?: number
  sentiment?: number
  tags?: string[]
  last_qualified_at?: string
  last_qualification_score?: number
  created_at: string
  updated_at: string
}

export interface Message {
  id: string
  contact_id: string
  direction: 'outbound' | 'inbound'
  from_email: string
  to_email: string
  subject: string
  body: string
  gmail_message_id?: string
  classification?: string
  sent_at: string
  created_at: string
}

export async function getContact(domain: string): Promise<Contact> {
  if (!domain || domain.trim() === '') {
    throw new ValidationError('Domain cannot be empty', 'domain')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('contacts')
    .select()
    .eq('domain', domain)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError(`Contact not found for domain: ${domain}`)
    }
    throw new SupabaseConnectionError(error.message)
  }

  return data as Contact
}

export async function saveContact(data: Partial<Contact>): Promise<Contact> {
  if (!data.domain || data.domain.trim() === '') {
    throw new ValidationError('Domain is required', 'domain')
  }

  const client = getSupabaseClient()

  if (data.id) {
    const { data: result, error } = await client
      .from('contacts')
      .update(data)
      .eq('id', data.id)
      .select()
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        throw new NotFoundError(`Contact not found: ${data.id}`)
      }
      throw new SupabaseConnectionError(error.message)
    }
    return result as Contact
  } else {
    const { data: result, error } = await client
      .from('contacts')
      .insert([data])
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        throw new DuplicateError(`Contact already exists for domain: ${data.domain}`)
      }
      throw new SupabaseConnectionError(error.message)
    }
    return result as Contact
  }
}

export async function createMessage(message: Omit<Message, 'id' | 'created_at'>): Promise<Message> {
  if (!message.contact_id) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }
  if (!message.to_email) {
    throw new ValidationError('to_email is required', 'to_email')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('messages')
    .insert([message])
    .select()
    .single()

  if (error) {
    throw new SupabaseConnectionError(error.message)
  }

  return data as Message
}

export async function getMessages(contactId: string): Promise<Message[]> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('messages')
    .select()
    .eq('contact_id', contactId)
    .order('sent_at', { ascending: false })

  if (error) {
    throw new SupabaseConnectionError(error.message)
  }

  return (data || []) as Message[]
}

export async function getMetadata(contactId: string): Promise<ContactMetadata> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('contacts_metadata')
    .select()
    .eq('contact_id', contactId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError(`Metadata not found for contact: ${contactId}`)
    }
    throw new SupabaseConnectionError(error.message)
  }

  return data as ContactMetadata
}

export async function saveMetadata(
  contactId: string,
  updates: Partial<ContactMetadata>
): Promise<ContactMetadata> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data, error } = await client
    .from('contacts_metadata')
    .update(updates)
    .eq('contact_id', contactId)
    .select()
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      throw new NotFoundError(`Metadata not found for contact: ${contactId}`)
    }
    throw new SupabaseConnectionError(error.message)
  }

  return data as ContactMetadata
}

function toSupabaseStatus(pipelineStatus: string): string {
  const map: Record<string, string> = {
    start_outreach:    'pending',
    outreach_sent:     'pending',
    send_followup:     'follow_up',
    response_received: 'pending',
    under_negotiation: 'under_negotiation',
    negotiated:        'under_negotiation',
    approved:          'approved',
    payment_sent:      'approved',
    live:              'approved',
  }
  return map[pipelineStatus] ?? 'pending'
}

export async function upsertContactsFromSheet(contacts: import('@/components/dashboard/types').Contact[]): Promise<{ upserted: number; errors: number }> {
  if (contacts.length === 0) return { upserted: 0, errors: 0 }

  const client = getSupabaseClient()
  const now = new Date().toISOString()

  const rows = contacts.map(c => ({
    domain:          c.domain,
    niche:           c.niche || '',
    email1:          c.email || null,
    name1:           c.contact || null,
    email_account:   c.senderEmail || null,
    notes:           c.notes || null,
    date_confirmed:  c.publishDate || null,
    status:          toSupabaseStatus(c.status),
    follow_up_count: 0,
    updated_at:      now,
  }))

  // Batch in chunks of 100 to avoid payload limits
  const CHUNK = 100
  let upserted = 0
  let errors = 0

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await client
      .from('contacts')
      .upsert(chunk, { onConflict: 'domain', ignoreDuplicates: false })

    if (error) {
      console.error('Supabase upsert error:', error.message)
      errors += chunk.length
    } else {
      upserted += chunk.length
    }
  }

  return { upserted, errors }
}

type SheetContact = import('@/components/dashboard/types').Contact

export async function upsertSheetContacts(contacts: SheetContact[]): Promise<void> {
  if (contacts.length === 0) return
  const client = getSupabaseClient()
  const now = new Date().toISOString()
  const rows = contacts.map(c => ({
    domain:    c.domain,
    row_index: parseInt(c.id, 10) || 0,
    data:      c,
    synced_at: now,
  }))
  const CHUNK = 100
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await client
      .from('sheet_contacts')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'row_index' })
    if (error) console.error('sheet_contacts upsert error:', error.message)
  }
}

export async function getSheetContacts(): Promise<SheetContact[]> {
  const client = getSupabaseClient()
  const { data, error } = await client
    .from('sheet_contacts')
    .select('data')
    .order('row_index', { ascending: true })
  if (error) throw new Error(error.message)
  return (data || []).map((row: any) => row.data as SheetContact)
}

export async function updateSheetContact(rowIndex: number, contact: SheetContact): Promise<void> {
  const client = getSupabaseClient()
  const { error } = await client
    .from('sheet_contacts')
    .update({ data: contact, synced_at: new Date().toISOString() })
    .eq('row_index', rowIndex)
  if (error) console.error('sheet_contacts update error:', error.message)
}

export async function createMetadata(
  contactId: string,
  data: Partial<ContactMetadata>
): Promise<ContactMetadata> {
  if (!contactId) {
    throw new ValidationError('contact_id is required', 'contact_id')
  }

  const client = getSupabaseClient()
  const { data: result, error } = await client
    .from('contacts_metadata')
    .insert([{ ...data, contact_id: contactId }])
    .select()
    .single()

  if (error) {
    throw new SupabaseConnectionError(error.message)
  }

  return result as ContactMetadata
}
