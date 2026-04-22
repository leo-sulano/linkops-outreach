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
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_KEY

    if (!url || !key) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables')
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
