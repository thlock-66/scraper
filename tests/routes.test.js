import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import express from 'express'

vi.mock('../src/scraper/index.js', () => ({
  runScraper: vi.fn().mockResolvedValue(undefined),
}))

import { createDb, upsertSlots } from '../src/db/index.js'
import { createRouter } from '../src/server/routes.js'

let app
let db

beforeEach(() => {
  db = createDb(':memory:')
  app = express()
  app.use(express.json())
  app.use('/api', createRouter(db))
})

describe('GET /api/status', () => {
  it('returns null lastScrapedAt when nothing scraped yet', async () => {
    const res = await request(app).get('/api/status')
    expect(res.status).toBe(200)
    expect(res.body.lastScrapedAt).toBeNull()
    expect(res.body.success).toBe(false)
  })
})

describe('GET /api/slots', () => {
  it('returns empty object when no slots in DB', async () => {
    const res = await request(app).get('/api/slots')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({})
  })

  it('returns slots grouped by sport then date', async () => {
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', [
      { venue: 'Hall A', court: 'Court 1', startTime: '19:00', endTime: '20:00', scrapedAt: '2026-07-13T10:00:00Z' },
    ])
    const res = await request(app).get('/api/slots')
    expect(res.status).toBe(200)
    expect(res.body.badminton['2026-07-14']).toHaveLength(1)
    expect(res.body.badminton['2026-07-14'][0].start_time).toBe('19:00')
  })

  it('filters by sport query param', async () => {
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', [
      { venue: 'Hall A', court: 'Court 1', startTime: '19:00', endTime: '20:00', scrapedAt: '2026-07-13T10:00:00Z' },
    ])
    upsertSlots(db, 'pickleball', '2026-07-14', 'weekday', [
      { venue: 'Hall B', court: 'Court 1', startTime: '20:00', endTime: '21:00', scrapedAt: '2026-07-13T10:00:00Z' },
    ])
    const res = await request(app).get('/api/slots?sport=badminton')
    expect(res.body.badminton).toBeDefined()
    expect(res.body.pickleball).toBeUndefined()
  })
})

describe('POST /api/scrape', () => {
  it('returns ok: true and calls runScraper', async () => {
    const { runScraper } = await import('../src/scraper/index.js')
    const res = await request(app).post('/api/scrape')
    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(runScraper).toHaveBeenCalled()
  })
})
