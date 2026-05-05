export type CredentialType = 'service_account' | 'oauth' | 'smtp'
export type SenderStatus = 'active' | 'inactive' | 'error'
export type LogStatus = 'sent' | 'failed'

export interface ServiceAccountCredential {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
  [key: string]: any
}

export interface OAuthCredential {
  client_id: string
  client_secret: string
  refresh_token: string
}

export interface SmtpCredential {
  app_password: string
}

export interface Sender {
  id: string
  name: string
  email: string
  credential_type: CredentialType
  credential_json: ServiceAccountCredential | OAuthCredential | SmtpCredential | Record<string, any>
  daily_limit: number
  timezone: string
  status: SenderStatus
  last_error: string | null
  last_used_at: string | null
  created_at: string
}

export interface SenderPublic extends Omit<Sender, 'credential_json'> {
  // credential_json is stripped before sending to any client
}

export interface SenderDailyStat {
  id: string
  sender_id: string
  date: string
  sent_count: number
}

export interface OutreachLog {
  id: string
  sender_id: string
  contact_domain: string | null
  contact_email: string | null
  subject: string | null
  status: LogStatus
  error: string | null
  sent_at: string
}

export interface SenderWithStats extends SenderPublic {
  sent_today: number
  recent_logs: Pick<OutreachLog, 'contact_email' | 'subject' | 'status' | 'sent_at' | 'error'>[]
}
