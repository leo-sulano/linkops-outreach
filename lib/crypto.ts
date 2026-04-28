import * as crypto from 'crypto'

const ALGO = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.SENDER_ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('SENDER_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

// Returns { encrypted: "<base64>" } suitable for storing in the credential_json JSONB column
export function encryptCredential(obj: object): { encrypted: string } {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const plain = JSON.stringify(obj)
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: iv(12) || tag(16) || ciphertext
  const payload = Buffer.concat([iv, tag, ciphertext]).toString('base64')
  return { encrypted: payload }
}

// Decrypts an encrypted credential. If json lacks the `encrypted` key (legacy plaintext row),
// returns it unchanged so existing senders keep working until re-saved.
export function decryptCredential(json: any): any {
  if (!json?.encrypted || typeof json.encrypted !== 'string') return json
  const key = getKey()
  const buf = Buffer.from(json.encrypted, 'base64')
  const iv = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const ciphertext = buf.subarray(28)
  const decipher = crypto.createDecipheriv(ALGO, key, iv)
  decipher.setAuthTag(tag)
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
  return JSON.parse(plain)
}
