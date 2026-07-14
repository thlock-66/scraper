import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { SPORTS } from './sports.js'
import { isWeekend, filterSlots } from './filter.js'
import { getDb, upsertSlots, updateScrapeStatus } from '../db/index.js'

chromium.use(StealthPlugin())

function toSGT(epochMs) {
  const d = new Date(epochMs + 8 * 60 * 60 * 1000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function toSGTDate(epochMs) {
  const d = new Date(epochMs + 8 * 60 * 60 * 1000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

function getNext7Dates() {
  const dates = new Set()
  const nowSGT = new Date(Date.now() + 8 * 60 * 60 * 1000)
  for (let i = 0; i < 7; i++) {
    const d = new Date(nowSGT)
    d.setUTCDate(nowSGT.getUTCDate() + i)
    dates.add(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`)
  }
  return dates
}

async function captureResponse(page, urlSubstring) {
  const results = []
  const handler = async r => {
    if (r.url().includes(urlSubstring)) {
      try { results.push(await r.json()) } catch (e) { console.warn('captureResponse parse error:', e.message) }
    }
  }
  page.on('response', handler)
  return { results, stop: () => page.off('response', handler) }
}

async function scrapeSport(browser, sport) {
  const page = await browser.newPage()
  const next7 = getNext7Dates()

  try {
    // Load venues page and capture venue list
    const venueCapture = await captureResponse(page, 'venue.listByActivity')
    await page.goto(sport.url, { waitUntil: 'load', timeout: 45000 })
    await page.waitForTimeout(3000)
    venueCapture.stop()

    const venueResponse = venueCapture.results[0]
    if (!venueResponse) {
      throw new Error(`[${sport.name}] No venue list response captured`)
    }
    const venues = venueResponse.result.data.json
    console.log(`[${sport.name}] ${venues.length} venue(s) — fetching schedules in parallel`)

    // Fetch all schedules in parallel via in-browser fetch (Cloudflare cookies already set)
    const scheduleResults = await page.evaluate(async ({ venues, activityId }) => {
      const out = {}
      await Promise.all(venues.map(async v => {
        const input = encodeURIComponent(JSON.stringify({ json: { venueId: v.id, activityId } }))
        try {
          const r = await fetch(`/api/trpc/schedule.listAvailable?input=${input}`)
          out[v.id] = await r.json()
        } catch (e) {
          out[v.id] = null
        }
      }))
      return out
    }, { venues, activityId: sport.activityId })

    // Accumulate ALL slots across all venues before any DB writes
    const allSlotsByDate = {}

    for (const venue of venues) {
      const schedResponse = scheduleResults[venue.id]
      if (!schedResponse) {
        console.warn(`  [${venue.name}] No schedule data`)
        continue
      }

      let dateEntries
      try {
        dateEntries = schedResponse.result.data.json
      } catch {
        console.warn(`  [${venue.name}] Unexpected schedule response shape`)
        continue
      }

      for (const [date, schedule] of dateEntries) {
        if (!next7.has(date)) continue
        if (schedule.type !== 'instant') continue

        for (const slot of schedule.timeslots) {
          const startTime = toSGT(slot.start)
          const endTime = toSGT(slot.end)
          const slotDate = toSGTDate(slot.start)
          const courtCount = slot.subvenues.length
          const court = `${courtCount} court${courtCount !== 1 ? 's' : ''}`

          if (!allSlotsByDate[slotDate]) allSlotsByDate[slotDate] = []
          allSlotsByDate[slotDate].push({
            startTime,
            endTime,
            venue: venue.name,
            court,
            scrapedAt: new Date().toISOString(),
          })
        }
      }
    }

    // Return slot data grouped by date — caller handles DB write or remote POST
    const results = []
    for (const date of next7) {
      const dayType = isWeekend(date) ? 'weekend' : 'weekday'
      const slots = allSlotsByDate[date] || []
      const filtered = filterSlots(slots, date)
      results.push({ sport: sport.id, date, dayType, slots: filtered })
      console.log(`  [${sport.name}] ${date}: ${filtered.length} slot(s)`)
    }
    return results
  } finally {
    await page.close()
  }
}

let _scraperRunning = false

export async function runScraper() {
  if (_scraperRunning) {
    console.log('Scrape already in progress, skipping')
    return
  }
  _scraperRunning = true
  const startedAt = new Date().toISOString()
  const browser = await chromium.launch({ headless: true })
  try {
    const allResults = []
    for (const sport of SPORTS) {
      console.log(`Scraping ${sport.name}...`)
      const results = await scrapeSport(browser, sport)
      allResults.push(...results)
    }

    if (process.env.RAILWAY_URL) {
      // Remote mode: POST results to Railway dashboard
      const res = await fetch(`${process.env.RAILWAY_URL}/api/slots`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SCRAPER_API_KEY || ''}`,
        },
        body: JSON.stringify(allResults),
      })
      if (!res.ok) throw new Error(`Remote API responded ${res.status}`)
      console.log('Scrape complete — data posted to Railway')
    } else {
      // Local mode: write directly to SQLite
      const db = getDb()
      for (const { sport, date, dayType, slots } of allResults) {
        upsertSlots(db, sport, date, dayType, slots)
      }
      updateScrapeStatus(db, true, startedAt)
      console.log('Scrape complete')
    }
  } catch (err) {
    console.error('Scrape error:', err.message)
    if (!process.env.RAILWAY_URL) {
      const db = getDb()
      updateScrapeStatus(db, false, startedAt)
    }
    throw err
  } finally {
    await browser.close()
    _scraperRunning = false
  }
}
