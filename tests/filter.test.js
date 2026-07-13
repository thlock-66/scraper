import { describe, it, expect } from 'vitest'
import { isWeekend, filterSlots } from '../src/scraper/filter.js'

const SLOTS = [
  { startTime: '08:00', endTime: '09:00', venue: 'Hall A', court: 'Court 1' },
  { startTime: '18:00', endTime: '19:00', venue: 'Hall A', court: 'Court 1' },
  { startTime: '19:00', endTime: '20:00', venue: 'Hall A', court: 'Court 2' },
  { startTime: '21:00', endTime: '22:00', venue: 'Hall A', court: 'Court 2' },
]

describe('isWeekend', () => {
  it('returns true for Saturday (2026-07-11)', () => {
    expect(isWeekend('2026-07-11')).toBe(true)
  })
  it('returns true for Sunday (2026-07-12)', () => {
    expect(isWeekend('2026-07-12')).toBe(true)
  })
  it('returns false for Monday (2026-07-13)', () => {
    expect(isWeekend('2026-07-13')).toBe(false)
  })
  it('returns false for Friday (2026-07-17)', () => {
    expect(isWeekend('2026-07-17')).toBe(false)
  })
})

describe('filterSlots', () => {
  it('returns all slots on a weekend', () => {
    expect(filterSlots(SLOTS, '2026-07-11')).toHaveLength(4)
  })
  it('returns only slots at 19:00 or later on a weekday', () => {
    const result = filterSlots(SLOTS, '2026-07-13')
    expect(result).toHaveLength(2)
    expect(result[0].startTime).toBe('19:00')
    expect(result[1].startTime).toBe('21:00')
  })
  it('excludes the 18:00 slot on a weekday', () => {
    const result = filterSlots(SLOTS, '2026-07-13')
    expect(result.every(s => s.startTime >= '19:00')).toBe(true)
  })
})
