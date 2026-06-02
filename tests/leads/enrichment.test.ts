import {
  extractCompanyName,
  extractEmail,
  extractLinkedInCompany,
} from '@/lib/leads/enrichment'

describe('extractCompanyName', () => {
  it('extracts owned and operated by pattern', () => {
    const text = 'This site is owned and operated by Gentoo Media Ltd.'
    expect(extractCompanyName(text)).toBe('Gentoo Media Ltd')
  })

  it('extracts copyright symbol pattern', () => {
    const text = '© 2024 Catena Media Ltd. All rights reserved.'
    expect(extractCompanyName(text)).toBe('Catena Media Ltd')
  })

  it('extracts published by pattern', () => {
    const text = 'Published by Black Dog Corporation'
    expect(extractCompanyName(text)).toBe('Black Dog Corporation')
  })

  it('extracts operated by pattern', () => {
    const text = 'Operated by Gambling.com Group Limited'
    expect(extractCompanyName(text)).toBe('Gambling.com Group Limited')
  })

  it('returns null when no pattern matches', () => {
    expect(extractCompanyName('This site has no ownership info.')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(extractCompanyName('')).toBeNull()
  })
})

describe('extractEmail', () => {
  it('extracts preferred mailto link first', () => {
    const html = '<a href="mailto:info@example.com">Contact</a>'
    expect(extractEmail(html)).toBe('info@example.com')
  })

  it('prefers contact@ over generic emails', () => {
    const html = 'Email us at contact@example.com or admin@example.com'
    expect(extractEmail(html)).toBe('contact@example.com')
  })

  it('falls back to any email in text', () => {
    const html = 'Reach us at team@example.com'
    expect(extractEmail(html)).toBe('team@example.com')
  })

  it('returns null when no email found', () => {
    expect(extractEmail('<p>No contact info here</p>')).toBeNull()
  })
})

describe('extractLinkedInCompany', () => {
  it('extracts linkedin company URL', () => {
    const links = [
      'https://twitter.com/example',
      'https://www.linkedin.com/company/example-media/',
      'https://facebook.com/example',
    ]
    expect(extractLinkedInCompany(links)).toBe(
      'https://www.linkedin.com/company/example-media/'
    )
  })

  it('prefers longer slug', () => {
    const links = [
      'https://linkedin.com/company/abc',
      'https://linkedin.com/company/abc-media-group',
    ]
    expect(extractLinkedInCompany(links)).toBe(
      'https://linkedin.com/company/abc-media-group'
    )
  })

  it('returns null when no company LinkedIn found', () => {
    expect(extractLinkedInCompany(['https://linkedin.com/in/johndoe'])).toBeNull()
  })

  it('returns null for empty array', () => {
    expect(extractLinkedInCompany([])).toBeNull()
  })
})
