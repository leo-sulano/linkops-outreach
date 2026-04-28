import { google } from 'googleapis'
import { SendError, AuthError, TimeoutError, ValidationError } from './errors'
import * as crypto from 'crypto'

let gmailClient: any = null

function getGmailClient() {
  if (!gmailClient) {
    const auth = process.env.GMAIL_SERVICE_ACCOUNT
      ? JSON.parse(process.env.GMAIL_SERVICE_ACCOUNT)
      : null

    if (!auth) {
      throw new AuthError('Gmail credentials not configured')
    }

    gmailClient = google.gmail({
      version: 'v1',
      auth: new google.auth.GoogleAuth({
        credentials: auth,
        scopes: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/gmail.readonly',
        ],
      }),
    })
  }
  return gmailClient
}

export interface EmailMessage {
  id: string
  threadId: string
  from: string
  to: string
  subject: string
  body: string
  timestamp: string
}

export async function sendEmail(
  to: string,
  subject: string,
  body: string
): Promise<string> {
  if (!to || to.trim() === '') {
    throw new ValidationError('Recipient email is required', 'to')
  }

  if (!subject || subject.trim() === '') {
    throw new ValidationError('Subject is required', 'subject')
  }

  try {
    const gmail = getGmailClient()
    const email = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'MIME-Version: 1.0',
      '',
      body,
    ].join('\n')

    const encodedMessage = Buffer.from(email)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    })

    return response.data.id || ''
  } catch (error: any) {
    if (error.message.includes('unauthenticated')) {
      throw new AuthError('Gmail authentication failed')
    }
    throw new SendError(`Failed to send email: ${error.message}`, error)
  }
}

export async function readInbox(maxResults: number = 10): Promise<EmailMessage[]> {
  try {
    const gmail = getGmailClient()
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: 'in:inbox',
      maxResults,
    })

    if (!response.data.messages) {
      return []
    }

    const messages = await Promise.all(
      response.data.messages.map((msg: any) => getEmailBody(msg.id))
    )

    return messages.filter((msg): msg is EmailMessage => msg !== null)
  } catch (error: any) {
    throw new AuthError(`Failed to read inbox: ${error.message}`)
  }
}

export async function getEmailBody(messageId: string): Promise<EmailMessage | null> {
  try {
    const gmail = getGmailClient()
    const response = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    })

    const msg = response.data
    const headers = msg.payload.headers || []
    const from = headers.find((h: any) => h.name === 'From')?.value || ''
    const to = headers.find((h: any) => h.name === 'To')?.value || ''
    const subject = headers.find((h: any) => h.name === 'Subject')?.value || ''

    let body = ''
    if (msg.payload.parts) {
      const textPart = msg.payload.parts.find((p: any) => p.mimeType === 'text/plain')
      if (textPart && textPart.body.data) {
        body = Buffer.from(textPart.body.data, 'base64').toString('utf-8')
      }
    } else if (msg.payload.body.data) {
      body = Buffer.from(msg.payload.body.data, 'base64').toString('utf-8')
    }

    return {
      id: msg.id,
      threadId: msg.threadId,
      from,
      to,
      subject,
      body,
      timestamp: msg.internalDate,
    }
  } catch (error: any) {
    if (error.message.includes('timeout')) {
      throw new TimeoutError('Gmail request timed out')
    }
    throw new AuthError(`Failed to get message: ${error.message}`)
  }
}

export async function verifyWebhookSignature(
  signature: string,
  body: string
): Promise<boolean> {
  try {
    const webhookSecret = process.env.GMAIL_WEBHOOK_SECRET
    if (!webhookSecret) {
      return false
    }

    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex')

    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expectedSignature)
    if (sigBuf.length !== expBuf.length) return false
    return crypto.timingSafeEqual(sigBuf, expBuf)
  } catch (error) {
    return false
  }
}
