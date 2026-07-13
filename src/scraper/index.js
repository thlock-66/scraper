import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { SPORTS } from './sports.js'
import { isWeekend, filterSlots } from './filter.js'
import { getDb, upsertSlots, updateScrapeStatus } from '../db/index.js'

chromium.use(StealthPlugin())

function toSGT(epochMs) {
  return new Date(epochMs).toLocaleString('en-SG', {
    timeZone: 'Asia/Singapore',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).replace(',', '').trim()
}

function toSGTDate(epochMs) {
  return new Date(epochMs).toLocaleDateString('en-CA', {
    timeZone: 'Asia/Singapore',
  })
}

function getNext7Dates() {
  const dates = new Set()
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + i)
    dates.add(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' }))
  }
  return dates
}

async function captureResponse(page, urlSubstring) {
  const results = []
  const handler = async r => {
    if (r.url().includes(urlSubstring)) {
      try { results.push(await r.json()) } catch {}
    }
  }
  page.on('response', handler)
  return { results, stop: () => page.off('response', handler) }
}

async function scrapeSport(browser, sport) {
  const page = await browser.newPage()
  const db = getDb()
  const next7 = getNext7Dates()
  const today = [...next7][0]

  try {
    // Step 1: load venues page and capture venue list
    const venueCapture = await captureResponse(page, 'venue.listByActivity')
    await page.goto(sport.url, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(3000)
    venueCapture.stop()

    const venueResponse = venueCapture.results[0]
    if (!venueResponse) {
      console.warn(`[${sport.name}] No venue list response captured`)
      return
    }
    const venues = venueResponse.result.data.json
    console.log(`[${sport.name}] ${venues.length} venue(s)`)

    // Step 2: for each venue, load timeslots page and capture schedule
    for (const venue of venues) {
      const timeslotsUrl = `https://activesg.gov.sg/facility-bookings/activities/${sport.activityId}/venues/${venue.id}/timeslots?activityId=${sport.activityId}&venueId=${venue.id}&date=${today}`
      const schedCapture = await captureResponse(page, 'schedule.listAvailable')
      await page.goto(timeslotsUrl, { waitUntil: 'load', timeout: 45000 })
      await page.waitForTimeout(3000)
      schedCapture.stop()

      const schedResponse = schedCapture.results[0]
      if (!schedResponse) {
        console.warn(`  [${venue.name}] No schedule response captured`)
        continue
      }

      const dateEntries = schedResponse.result.data.json
      const slotsByDate = {}

      for (const [date, schedule] of dateEntries) {
        if (!next7.has(date)) continue
        if (schedule.type !== 'instant') continue

        for (const slot of schedule.timeslots) {
          const startTime = toSGT(slot.start)
          const endTime = toSGT(slot.end)
          const slotDate = toSGTDate(slot.start)
          const courtCount = slot.subvenues.length
          const court = `${courtCount} court${courtCount !== 1 ? 's' : ''}`

          if (!slotsByDate[slotDate]) slotsByDate[slotDate] = []
          slotsByDate[slotDate].push({
            startTime,
            endTime,
            venue: venue.name,
            court,
            scrapedAt: new Date().toISOString(),
          })
        }
      }

      for (const [date, slots] of Object.entries(slotsByDate)) {
        const dayType = isWeekend(date) ? 'weekend' : 'weekday'
        const filtered = filterSlots(slots, date)
        upsertSlots(db, sport.id, date, dayType, filtered)
        console.log(`  [${venue.name}] ${date}: ${filtered.length} slot(s)`)
      }

      // Also clear dates in next7 that had no slots (so stale data doesn't linger)
      for (const date of next7) {
        if (!slotsByDate[date]) {
          const dayType = isWeekend(date) ? 'weekend' : 'weekday'
          upsertSlots(db, sport.id, date, dayType, [])
        }
      }
    }
  } finally {
    await page.close()
  }
}

export async function runScraper() {
  const db = getDb()
  const startedAt = new Date().toISOString()
  const browser = await chromium.launch({ headless: true })
  try {
    for (const sport of SPORTS) {
      console.log(`Scraping ${sport.name}...`)
      await scrapeSport(browser, sport)
    }
    updateScrapeStatus(db, true, startedAt)
    console.log('Scrape complete')
  } catch (err) {
    console.error('Scrape error:', err.message)
    updateScrapeStatus(db, false, startedAt)
    throw err
  } finally {
    await browser.close()
  }
}
