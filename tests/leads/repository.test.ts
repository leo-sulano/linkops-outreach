process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key'

let mockExistingJobsData: { domain: string; status: string }[] = []
const mockUpdateIn = jest.fn().mockResolvedValue({ error: null })
const mockUpdate = jest.fn(() => ({ in: mockUpdateIn }))
const mockInsert = jest.fn().mockResolvedValue({ error: null })

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        in: jest.fn().mockImplementation(() =>
          Promise.resolve({ data: mockExistingJobsData, error: null })
        ),
      })),
      update: mockUpdate,
      insert: mockInsert,
    })),
  })),
}))

import { startSelectedDomains } from '@/lib/leads/repository'

describe('startSelectedDomains', () => {
  beforeEach(() => {
    mockExistingJobsData = []
    mockUpdate.mockClear()
    mockUpdateIn.mockClear()
    mockInsert.mockClear()
  })

  it('queues domains that have no existing job row', async () => {
    mockExistingJobsData = []
    const result = await startSelectedDomains(['new1.com', 'new2.com'])
    expect(result).toEqual({ resumed: 0, queued: 2 })
    expect(mockInsert).toHaveBeenCalledWith([
      expect.objectContaining({ domain: 'new1.com', status: 'pending' }),
      expect.objectContaining({ domain: 'new2.com', status: 'pending' }),
    ])
    expect(mockUpdateIn).not.toHaveBeenCalled()
  })

  it('resumes paused, failed, and needs_review domains, and skips pending/processing', async () => {
    mockExistingJobsData = [
      { domain: 'paused.com', status: 'paused' },
      { domain: 'failed.com', status: 'failed' },
      { domain: 'review.com', status: 'needs_review' },
      { domain: 'pending.com', status: 'pending' },
      { domain: 'processing.com', status: 'processing' },
    ]
    const result = await startSelectedDomains([
      'paused.com',
      'failed.com',
      'review.com',
      'pending.com',
      'processing.com',
    ])
    expect(result).toEqual({ resumed: 3, queued: 0 })
    expect(mockUpdate).toHaveBeenCalledWith({
      status: 'pending',
      retry_count: 0,
      error_log: null,
      started_at: null,
      completed_at: null,
    })
    expect(mockUpdateIn).toHaveBeenCalledWith('domain', ['paused.com', 'failed.com', 'review.com'])
    expect(mockInsert).not.toHaveBeenCalled()
  })
})
