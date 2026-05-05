import { google } from 'googleapis'
import type { Sender } from './types'
import { SenderAuthError } from './errors'

export function buildGmailClient(sender: Sender) {
  const creds = sender.credential_json

  if (sender.credential_type === 'oauth') {
    if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
      throw new SenderAuthError(`Missing OAuth2 credentials for sender: ${sender.email}`)
    }

    const auth = new google.auth.OAuth2(creds.client_id, creds.client_secret)
    auth.setCredentials({ refresh_token: creds.refresh_token })
    return google.gmail({ version: 'v1', auth })
  }

  if (sender.credential_type === 'service_account') {
    if (!creds.client_email || !creds.private_key) {
      throw new SenderAuthError(`Invalid service account JSON for sender: ${sender.email}`)
    }

    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: sender.email,
    })
    return google.gmail({ version: 'v1', auth })
  }

  throw new SenderAuthError(`Credential type '${sender.credential_type}' is not supported`)
}

export async function sendWithClient(
  gmail: ReturnType<typeof google.gmail>,
  to: string,
  subject: string,
  body: string,
  fromEmail: string
): Promise<string> {
  const raw = [
    `From: ${fromEmail}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    body,
  ].join('\n')

  const encoded = Buffer.from(raw)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: encoded },
  })

  return response.data.id || ''
}
