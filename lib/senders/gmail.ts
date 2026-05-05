import { google } from 'googleapis'
import nodemailer from 'nodemailer'
import type { Sender } from './types'
import { SenderAuthError } from './errors'

export async function sendEmail(
  sender: Sender,
  to: string,
  subject: string,
  body: string
): Promise<string> {
  const creds = sender.credential_json as any

  if (sender.credential_type === 'smtp') {
    if (!creds.app_password) {
      throw new SenderAuthError(`Missing app password for sender: ${sender.email}`)
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: sender.email,
        pass: creds.app_password as string,
      },
    })

    const info = await transporter.sendMail({
      from: sender.email,
      to,
      subject,
      text: body,
    })

    return info.messageId || ''
  }

  if (sender.credential_type === 'oauth') {
    if (!creds.client_id || !creds.client_secret || !creds.refresh_token) {
      throw new SenderAuthError(`Missing OAuth2 credentials for sender: ${sender.email}`)
    }

    const auth = new google.auth.OAuth2(
      creds.client_id as string,
      creds.client_secret as string
    )
    auth.setCredentials({ refresh_token: creds.refresh_token as string })
    const gmail = google.gmail({ version: 'v1', auth })
    return sendWithGmailClient(gmail, to, subject, body, sender.email)
  }

  if (sender.credential_type === 'service_account') {
    if (!creds.client_email || !creds.private_key) {
      throw new SenderAuthError(`Invalid service account JSON for sender: ${sender.email}`)
    }

    const auth = new google.auth.JWT({
      email: creds.client_email as string,
      key: creds.private_key as string,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject: sender.email,
    })
    const gmail = google.gmail({ version: 'v1', auth })
    return sendWithGmailClient(gmail, to, subject, body, sender.email)
  }

  throw new SenderAuthError(`Credential type '${sender.credential_type}' is not supported`)
}

async function sendWithGmailClient(
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
