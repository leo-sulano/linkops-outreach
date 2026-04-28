import { google } from 'googleapis'
import { AuthError, TimeoutError } from './errors'
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
