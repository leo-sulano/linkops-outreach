import {
  extractCompanyName,
  extractEmail,
  extractMailtoEmail,
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

  it('extracts operated by pattern with dot in name', () => {
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

describe('extractMailtoEmail', () => {
  it('extracts email from mailto href', () => {
    const html = '<a href="mailto:info@example.com">Contact</a>'
    expect(extractMailtoEmail(html)).toBe('info@example.com')
  })

  it('prefers preferred prefix over non-preferred mailto link', () => {
    const html =
      '<a href="mailto:newsletters@example.com">News</a>' +
      '<a href="mailto:info@example.com">Contact</a>'
    expect(extractMailtoEmail(html)).toBe('info@example.com')
  })

  it('strips query string from mailto href', () => {
    const html = '<a href="mailto:info@example.com?subject=Hello&body=Hi">Contact</a>'
    expect(extractMailtoEmail(html)).toBe('info@example.com')
  })

  it('returns null when no mailto link found', () => {
    expect(extractMailtoEmail('<p>No contact here</p>')).toBeNull()
  })
})

describe('extractEmail', () => {
  it('prefers contact@ over generic emails in plain text', () => {
    const text = 'Email us at contact@example.com or admin@example.com'
    expect(extractEmail(text)).toBe('contact@example.com')
  })

  it('falls back to any email in plain text', () => {
    const text = 'Reach us at team@example.com'
    expect(extractEmail(text)).toBe('team@example.com')
  })

  it('returns null when no email found', () => {
    expect(extractEmail('No contact info here')).toBeNull()
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

  it('prefers longer (more descriptive) slug over shorter one', () => {
    const links = [
      'https://linkedin.com/company/abc',
      'https://linkedin.com/company/abc-media-group',
    ]
    expect(extractLinkedInCompany(links)).toBe(
      'https://linkedin.com/company/abc-media-group'
    )
  })

  it('prefers root page over sub-paths', () => {
    const links = [
      'https://linkedin.com/company/abc-media-group/about',
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
