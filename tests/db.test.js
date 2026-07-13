import { describe, it, expect, beforeEach } from 'vitest'
import { createDb, upsertSlots, getSlots, updateScrapeStatus, getScrapeStatus } from '../src/db/index.js'

let db

beforeEach(() => {
  db = createDb(':memory:')
})

const SLOTS = [
  { venue: 'Jurong East', court: 'Court 1', startTime: '19:00', endTime: '20:00', scrapedAt: '2026-07-13T10:00:00Z' },
  { venue: 'Jurong East', court: 'Court 2', startTime: '20:00', endTime: '21:00', scrapedAt: '2026-07-13T10:00:00Z' },
]

describe('upsertSlots / getSlots', () => {
  it('inserts and retrieves slots', () => {
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', SLOTS)
    const result = getSlots(db)
    expect(result).toHaveLength(2)
    expect(result[0].sport).toBe('badminton')
    expect(result[0].start_time).toBe('19:00')
    expect(result[0].day_type).toBe('weekday')
  })

  it('replaces slots for the same sport+date on re-upsert', () => {
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', SLOTS)
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', [SLOTS[0]])
    expect(getSlots(db)).toHaveLength(1)
  })

  it('keeps slots for different sports independently', () => {
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', SLOTS)
    upsertSlots(db, 'pickleball', '2026-07-14', 'weekday', [SLOTS[0]])
    expect(getSlots(db, 'badminton')).toHaveLength(2)
    expect(getSlots(db, 'pickleball')).toHaveLength(1)
  })

  it('returns slots sorted by date then start_time', () => {
    upsertSlots(db, 'badminton', '2026-07-15', 'weekday', [SLOTS[0]])
    upsertSlots(db, 'badminton', '2026-07-14', 'weekday', [SLOTS[1]])
    const result = getSlots(db)
    expect(result[0].date).toBe('2026-07-14')
    expect(result[1].date).toBe('2026-07-15')
  })
})

describe('scrape status', () => {
  it('returns null lastScrapedAt before any update', () => {
    const status = getScrapeStatus(db)
    expect(status.lastScrapedAt).toBeNull()
    expect(status.success).toBe(false)
  })

  it('stores and retrieves scrape status', () => {
    updateScrapeStatus(db, true, '2026-07-13T10:00:00Z')
    const status = getScrapeStatus(db)
    expect(status.lastScrapedAt).toBe('2026-07-13T10:00:00Z')
    expect(status.success).toBe(true)
  })

  it('overwrites previous status', () => {
    updateScrapeStatus(db, true, '2026-07-13T09:00:00Z')
    updateScrapeStatus(db, false, '2026-07-13T10:00:00Z')
    expect(getScrapeStatus(db).success).toBe(false)
    expect(getScrapeStatus(db).lastScrapedAt).toBe('2026-07-13T10:00:00Z')
  })
})
