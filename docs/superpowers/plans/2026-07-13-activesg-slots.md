# ActiveSG Slot Checker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a server-hosted web app that scrapes ActiveSG every 10 minutes for available badminton and pickleball slots (weekdays 19:00+, weekends all day) and displays them on a React dashboard.

**Architecture:** A single Express + Node.js process on Railway — node-cron triggers a Playwright scraper every 10 minutes, writes results to SQLite via better-sqlite3, and Express serves both the REST API and the built React dashboard from the same process.

**Tech Stack:** Node.js 20 (ESM), Express 4, Playwright (headless Chromium), better-sqlite3, node-cron, React 18, Vite 5, Vitest, Supertest, Railway

## Global Constraints

- `"type": "module"` in package.json — ESM throughout; always use `.js` extensions on local imports
- All dates are `YYYY-MM-DD` strings; all times are `HH:MM` 24-hour strings
- SQLite DB lives at `data/slots.db`; tests use `createDb(':memory:')`
- Scraper checks next 7 days from today's date
- Filter rule: weekday = start_time >= `'19:00'`; weekend = all slots
- ActiveSG pages are publicly visible — no login required
- React build outputs to `dist/`; Express serves it as static files

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `vite.config.js`
- Create: `vitest.config.js`
- Create: `railway.toml`
- Create: `src/client/index.html`
- Create: `src/client/src/main.jsx`

**Interfaces:**
- Produces: working `npm install`, `npm test`, `npm run build`, `npm start` commands

- [ ] **Step 1: Create package.json**

```json
{
  "name": "activesg-slots",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node src/server/index.js",
    "build": "vite build",
    "dev:server": "node --watch src/server/index.js",
    "dev:client": "vite",
    "test": "vitest run --config vitest.config.js",
    "postinstall": "playwright install chromium --with-deps"
  },
  "dependencies": {
    "better-sqlite3": "^9.6.0",
    "express": "^4.19.2",
    "node-cron": "^3.0.3",
    "playwright": "^1.44.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "supertest": "^7.0.0",
    "vite": "^5.2.11",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
data/
scripts/discover-*.png
```

- [ ] **Step 3: Create vite.config.js**

```js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
})
```

- [ ] **Step 4: Create vitest.config.js**

```js
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
```

- [ ] **Step 5: Create railway.toml**

```toml
[build]
builder = "NIXPACKS"
buildCommand = "npm run build"

[deploy]
startCommand = "npm start"
restartPolicyType = "ON_FAILURE"
```

- [ ] **Step 6: Create src/client/index.html**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>ActiveSG Slots</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create src/client/src/main.jsx**

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

ReactDOM.createRoot(document.getElementById('root')).render(<App />)
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: node_modules installed, Chromium downloaded (~1-2 min due to `postinstall`)

- [ ] **Step 9: Commit**

```bash
git add package.json .gitignore vite.config.js vitest.config.js railway.toml src/client/
git commit -m "chore: project scaffold"
```

---

### Task 2: Filter logic

**Files:**
- Create: `src/scraper/filter.js`
- Create: `tests/filter.test.js`

**Interfaces:**
- Produces:
  - `isWeekend(dateStr: string): boolean` — true if Saturday or Sunday
  - `filterSlots(slots: Array<{startTime: string, ...}>, dateStr: string): Array` — weekday: keep startTime >= '19:00'; weekend: keep all

- [ ] **Step 1: Create tests/filter.test.js**

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/scraper/filter.js'`

- [ ] **Step 3: Create src/scraper/filter.js**

```js
export function isWeekend(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay()
  return day === 0 || day === 6
}

export function filterSlots(slots, dateStr) {
  if (isWeekend(dateStr)) return slots
  return slots.filter(slot => slot.startTime >= '19:00')
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test`
Expected: PASS — 7 tests green

- [ ] **Step 5: Commit**

```bash
git add src/scraper/filter.js tests/filter.test.js
git commit -m "feat: weekday/weekend slot filter"
```

---

### Task 3: DB layer

**Files:**
- Create: `src/db/index.js`
- Create: `tests/db.test.js`

**Interfaces:**
- Produces:
  - `createDb(dbPath: string): Database` — creates tables, returns better-sqlite3 instance
  - `getDb(): Database` — singleton using `process.env.DB_PATH` or `data/slots.db`
  - `upsertSlots(db, sport: string, date: string, dayType: string, slots: SlotRow[]): void`
  - `getSlots(db, sport?: string): DbSlot[]` — ordered by sport, date, start_time
  - `updateScrapeStatus(db, success: boolean, lastScrapedAt: string): void`
  - `getScrapeStatus(db): { lastScrapedAt: string|null, success: boolean }`
  - `SlotRow = { venue: string, court: string, startTime: string, endTime: string, scrapedAt: string }`
  - `DbSlot = { id, sport, date, day_type, venue, court, start_time, end_time, scraped_at }`

- [ ] **Step 1: Create tests/db.test.js**

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/db/index.js'`

- [ ] **Step 3: Create src/db/index.js**

```js
import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'
import { mkdirSync } from 'fs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export function createDb(dbPath) {
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true })
  }
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.exec(`
    CREATE TABLE IF NOT EXISTS slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sport TEXT NOT NULL,
      date TEXT NOT NULL,
      day_type TEXT NOT NULL,
      venue TEXT NOT NULL,
      court TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      scraped_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scrape_status (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_scraped_at TEXT,
      success INTEGER DEFAULT 0
    );
    INSERT OR IGNORE INTO scrape_status (id) VALUES (1);
  `)
  return db
}

let _db = null

export function getDb() {
  if (!_db) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/slots.db')
    _db = createDb(dbPath)
  }
  return _db
}

export function upsertSlots(db, sport, date, dayType, slots) {
  const del = db.prepare('DELETE FROM slots WHERE sport = ? AND date = ?')
  const ins = db.prepare(`
    INSERT INTO slots (sport, date, day_type, venue, court, start_time, end_time, scraped_at)
    VALUES (@sport, @date, @dayType, @venue, @court, @startTime, @endTime, @scrapedAt)
  `)
  db.transaction(() => {
    del.run(sport, date)
    for (const slot of slots) {
      ins.run({ sport, date, dayType, ...slot })
    }
  })()
}

export function getSlots(db, sport = null) {
  if (sport) {
    return db.prepare('SELECT * FROM slots WHERE sport = ? ORDER BY date, start_time').all(sport)
  }
  return db.prepare('SELECT * FROM slots ORDER BY sport, date, start_time').all()
}

export function updateScrapeStatus(db, success, lastScrapedAt) {
  db.prepare('UPDATE scrape_status SET last_scraped_at = ?, success = ? WHERE id = 1')
    .run(lastScrapedAt, success ? 1 : 0)
}

export function getScrapeStatus(db) {
  const row = db.prepare('SELECT * FROM scrape_status WHERE id = 1').get()
  return {
    lastScrapedAt: row?.last_scraped_at ?? null,
    success: row?.success === 1,
  }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test`
Expected: PASS — all 14 tests green (7 filter + 7 db)

- [ ] **Step 5: Commit**

```bash
git add src/db/index.js tests/db.test.js
git commit -m "feat: SQLite DB layer with slot storage and scrape status"
```

---

### Task 4: Scraper page discovery

**Files:**
- Create: `scripts/discover.js`

**Interfaces:**
- Produces: console output and screenshots documenting the ActiveSG page structure, selector names, and any JSON API calls

Run this task manually before Task 5 to learn the exact selectors and/or API endpoints the scraper needs.

- [ ] **Step 1: Create scripts/discover.js**

```js
import { chromium } from 'playwright'

const URLS = {
  badminton: 'https://activesg.gov.sg/facility-bookings/activities/YLONatwvqJfikKOmB5N9U/venues',
}

const browser = await chromium.launch({ headless: false })
const context = await browser.newContext()

// Capture all JSON API responses
const apiCalls = []
context.on('response', async (response) => {
  const ct = response.headers()['content-type'] || ''
  if (ct.includes('application/json')) {
    try {
      const body = await response.json()
      apiCalls.push({ url: response.url(), body })
      console.log('\n[API]', response.url())
      console.log(JSON.stringify(body).slice(0, 400))
    } catch {}
  }
})

const page = await context.newPage()
console.log('Opening', URLS.badminton)
await page.goto(URLS.badminton, { waitUntil: 'networkidle' })
await page.screenshot({ path: 'scripts/discover-venues.png', fullPage: true })
console.log('Screenshot: scripts/discover-venues.png')

// Print all anchor tags that look like venue links
const links = await page.$$eval('a[href]', els =>
  els.map(el => ({ href: el.href, text: el.textContent.trim().slice(0, 60) }))
    .filter(l => l.href.includes('venue') || l.href.includes('facilit') || l.href.includes('booking'))
)
console.log('\n=== VENUE / BOOKING LINKS ===')
console.log(JSON.stringify(links.slice(0, 20), null, 2))

// Print all buttons
const buttons = await page.$$eval('button', els =>
  els.map(el => ({ text: el.textContent.trim().slice(0, 60), class: el.className.slice(0, 80) }))
)
console.log('\n=== BUTTONS ===')
console.log(JSON.stringify(buttons.slice(0, 20), null, 2))

// If venue links found, click the first one
if (links.length > 0) {
  const firstVenueUrl = links[0].href
  console.log('\nNavigating to first venue:', firstVenueUrl)
  await page.goto(firstVenueUrl, { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'scripts/discover-venue-detail.png', fullPage: true })
  console.log('Screenshot: scripts/discover-venue-detail.png')

  // Look for date picker elements
  const datePicker = await page.$$eval(
    '[role="gridcell"], [aria-label*="date"], input[type="date"], [class*="calendar"], [class*="date"]',
    els => els.map(el => ({
      tag: el.tagName,
      role: el.getAttribute('role'),
      ariaLabel: el.getAttribute('aria-label'),
      class: el.className.slice(0, 80),
      text: el.textContent.trim().slice(0, 30),
    })).slice(0, 20)
  )
  console.log('\n=== DATE PICKER ELEMENTS ===')
  console.log(JSON.stringify(datePicker, null, 2))

  // Look for slot/time elements
  const slotEls = await page.$$eval(
    '[data-status], [class*="slot"], [class*="time"], [class*="available"], [class*="book"]',
    els => els.map(el => ({
      tag: el.tagName,
      class: el.className.slice(0, 80),
      dataStatus: el.dataset.status,
      text: el.textContent.trim().slice(0, 60),
    })).slice(0, 30)
  )
  console.log('\n=== SLOT / TIME ELEMENTS ===')
  console.log(JSON.stringify(slotEls, null, 2))
}

console.log('\n=== ALL API CALLS SEEN ===')
apiCalls.forEach(c => console.log(c.url))

console.log('\nBrowser left open — explore manually. Ctrl+C when done.')
await new Promise(() => {})
```

- [ ] **Step 2: Run discovery**

```bash
mkdir -p scripts
node scripts/discover.js
```

Expected: Browser opens. Review the console output and screenshots. Note:
1. What do the venue link URLs look like? (e.g. `/venues/abc123` or query params)
2. How does the date picker work — calendar gridcells, an `<input type="date">`, or custom buttons?
3. What class names / data attributes do available slots have?
4. Are there API calls that return slot data as JSON?

- [ ] **Step 3: Record findings as a comment in discover.js**

Add this block at the top of `scripts/discover.js` and fill it in:

```js
/*
DISCOVERY FINDINGS:
- Venue links selector: ___
- Individual venue page URL pattern: ___
- Date picker mechanism: ___ (e.g. "calendar gridcells with role=gridcell and aria-label='July 14'")
- Available slot selector: ___
- Slot time format in text: ___ (e.g. "7:00 PM - 8:00 PM" or "19:00 - 20:00")
- Court/hall name location: ___
- API endpoint returning availability (if found): ___
*/
```

- [ ] **Step 4: Commit**

```bash
git add scripts/discover.js
git commit -m "chore: scraper discovery script with page findings"
```

---

### Task 5: Playwright scraper

**Files:**
- Create: `src/scraper/sports.js`
- Create: `src/scraper/index.js`

**Interfaces:**
- Consumes:
  - `isWeekend(dateStr)`, `filterSlots(slots, dateStr)` from `./filter.js`
  - `getDb()`, `upsertSlots(db, sport, date, dayType, slots)`, `updateScrapeStatus(db, success, ts)` from `../db/index.js`
- Produces:
  - `runScraper(): Promise<void>` — scrapes all sports for next 7 days, writes to DB, updates scrape status

**Before starting:** Update the `SELECTORS` constant in `src/scraper/index.js` using findings from Task 4.

- [ ] **Step 1: Create src/scraper/sports.js**

```js
export const SPORTS = [
  {
    id: 'badminton',
    name: 'Badminton',
    url: 'https://activesg.gov.sg/facility-bookings/activities/YLONatwvqJfikKOmB5N9U/venues',
  },
  {
    id: 'pickleball',
    name: 'Pickleball',
    url: 'https://activesg.gov.sg/facility-bookings/activities/BPQihVHITc7IPGorVeB2Y/venues',
  },
]
```

- [ ] **Step 2: Create src/scraper/index.js**

Update `SELECTORS` with findings from Task 4 before running.

```js
import { chromium } from 'playwright'
import { SPORTS } from './sports.js'
import { isWeekend, filterSlots } from './filter.js'
import { getDb, upsertSlots, updateScrapeStatus } from '../db/index.js'

// UPDATE these selectors using Task 4 discovery findings
const SELECTORS = {
  venueLink: 'a[href*="/venues/"]',
  dateGridCell: '[role="gridcell"]',
  availableSlot: '[data-status="available"], button[class*="available"], .slot-available',
}

function getNext7Days() {
  const dates = []
  const today = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    dates.push(d.toISOString().slice(0, 10))
  }
  return dates
}

// Converts "7:00 PM", "19:00", "7:30PM" → "07:00", "19:00", "07:30"
function parseTime(text) {
  const pmMatch = text.match(/(\d{1,2}):(\d{2})\s*PM/i)
  if (pmMatch) {
    let h = parseInt(pmMatch[1])
    if (h !== 12) h += 12
    return `${String(h).padStart(2, '0')}:${pmMatch[2]}`
  }
  const amMatch = text.match(/(\d{1,2}):(\d{2})\s*AM/i)
  if (amMatch) {
    let h = parseInt(amMatch[1])
    if (h === 12) h = 0
    return `${String(h).padStart(2, '0')}:${amMatch[2]}`
  }
  const h24 = text.match(/^(\d{1,2}):(\d{2})$/)
  if (h24) return `${String(parseInt(h24[1])).padStart(2, '0')}:${h24[2]}`
  return null
}

async function scrapeVenueDate(page, venueUrl, dateStr) {
  await page.goto(venueUrl, { waitUntil: 'networkidle', timeout: 30000 })

  // Click the correct day on the calendar
  const dayNum = String(new Date(dateStr + 'T00:00:00').getDate())
  const cells = await page.locator(SELECTORS.dateGridCell).all()
  let clicked = false
  for (const cell of cells) {
    const text = (await cell.textContent()).trim()
    const ariaLabel = await cell.getAttribute('aria-label') || ''
    if (text === dayNum || ariaLabel.includes(dayNum)) {
      await cell.click()
      clicked = true
      break
    }
  }
  if (!clicked) {
    console.warn(`  Could not find date ${dateStr} on calendar at ${venueUrl}`)
    return []
  }

  await page.waitForTimeout(1500)

  // Extract available slot text
  const slotEls = await page.locator(SELECTORS.availableSlot).all()
  const slots = []
  for (const el of slotEls) {
    const text = await el.textContent()
    // Match "7:00 PM - 8:00 PM" or "19:00 - 20:00" or "19:00–20:00"
    const match = text.match(/(\d{1,2}:\d{2}(?:\s*[AP]M)?)\s*[-–]\s*(\d{1,2}:\d{2}(?:\s*[AP]M)?)/i)
    if (!match) continue
    const startTime = parseTime(match[1].trim())
    const endTime = parseTime(match[2].trim())
    if (!startTime || !endTime) continue
    // Court name: first non-empty line of text before the time, or the element's label
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean)
    const court = lines.find(l => !l.match(/\d{1,2}:\d{2}/)) || 'Court'
    slots.push({ startTime, endTime, court, venue: '', scrapedAt: new Date().toISOString() })
  }
  return slots
}

async function scrapeSport(browser, sport) {
  const page = await browser.newPage()
  const db = getDb()
  try {
    await page.goto(sport.url, { waitUntil: 'networkidle', timeout: 30000 })
    const venueLinks = await page.$$eval(
      SELECTORS.venueLink,
      els => [...new Set(els.map(el => el.href))].filter(Boolean)
    )
    if (venueLinks.length === 0) {
      console.warn(`[${sport.name}] No venue links found at ${sport.url}`)
      return
    }
    console.log(`[${sport.name}] ${venueLinks.length} venue(s) found`)

    for (const dateStr of getNext7Days()) {
      const dayType = isWeekend(dateStr) ? 'weekend' : 'weekday'
      const allSlots = []
      for (const venueUrl of venueLinks) {
        const venueName = decodeURIComponent(venueUrl.split('/').pop().split('?')[0])
        const raw = await scrapeVenueDate(page, venueUrl, dateStr)
        const filtered = filterSlots(raw, dateStr)
        allSlots.push(...filtered.map(s => ({ ...s, venue: venueName })))
      }
      upsertSlots(db, sport.id, dateStr, dayType, allSlots)
      console.log(`[${sport.name}] ${dateStr}: ${allSlots.length} slot(s)`)
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
```

- [ ] **Step 3: Smoke test the scraper**

```bash
node -e "import('./src/scraper/index.js').then(m => m.runScraper()).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })"
```

Expected: Playwright launches (headless), scrapes both sports, logs slot counts per date, exits 0.

If selector mismatches occur (0 venue links or 0 slots when you know there are some), run `node scripts/discover.js` again with the browser open, inspect the DOM manually, update `SELECTORS` in `src/scraper/index.js`, and retry.

- [ ] **Step 4: Commit**

```bash
git add src/scraper/
git commit -m "feat: Playwright scraper for badminton and pickleball"
```

---

### Task 6: Express API

**Files:**
- Create: `src/server/routes.js`
- Create: `src/server/index.js`
- Create: `tests/routes.test.js`

**Interfaces:**
- Consumes:
  - `createDb(':memory:')`, `getSlots(db, sport?)`, `getScrapeStatus(db)` from `../db/index.js`
  - `runScraper()` from `../scraper/index.js`
- Produces:
  - `createRouter(db): express.Router`
  - `GET /api/slots[?sport=badminton|pickleball]` → `{ [sport]: { [date]: DbSlot[] } }`
  - `GET /api/status` → `{ lastScrapedAt: string|null, success: boolean }`
  - `POST /api/scrape` → `{ ok: true }` or `500 { ok: false, error: string }`

- [ ] **Step 1: Create tests/routes.test.js**

```js
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
```

- [ ] **Step 2: Run test to confirm it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module '../src/server/routes.js'`

- [ ] **Step 3: Create src/server/routes.js**

```js
import { Router } from 'express'
import { getSlots, getScrapeStatus } from '../db/index.js'
import { runScraper } from '../scraper/index.js'

export function createRouter(db) {
  const router = Router()

  router.get('/slots', (req, res) => {
    const { sport } = req.query
    const rows = getSlots(db, sport || null)
    const grouped = {}
    for (const row of rows) {
      if (!grouped[row.sport]) grouped[row.sport] = {}
      if (!grouped[row.sport][row.date]) grouped[row.sport][row.date] = []
      grouped[row.sport][row.date].push(row)
    }
    res.json(grouped)
  })

  router.get('/status', (req, res) => {
    res.json(getScrapeStatus(db))
  })

  router.post('/scrape', async (req, res) => {
    try {
      await runScraper()
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  return router
}
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npm test`
Expected: PASS — all tests green (including filter + db + routes)

- [ ] **Step 5: Create src/server/index.js**

```js
import express from 'express'
import path from 'path'
import { fileURLToPath } from 'url'
import cron from 'node-cron'
import { createRouter } from './routes.js'
import { getDb } from '../db/index.js'
import { runScraper } from '../scraper/index.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PORT = process.env.PORT || 3000
const db = getDb()

const app = express()
app.use(express.json())
app.use('/api', createRouter(db))

const distPath = path.join(__dirname, '../../dist')
app.use(express.static(distPath))
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')))

cron.schedule('*/10 * * * *', () => {
  runScraper().catch(err => console.error('Scheduled scrape failed:', err.message))
})

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
  runScraper().catch(err => console.error('Initial scrape failed:', err.message))
})
```

- [ ] **Step 6: Commit**

```bash
git add src/server/ tests/routes.test.js
git commit -m "feat: Express API with slot and status endpoints"
```

---

### Task 7: React dashboard

**Files:**
- Create: `src/client/src/App.jsx`
- Create: `src/client/src/components/StatusHeader.jsx`
- Create: `src/client/src/components/SportTabs.jsx`
- Create: `src/client/src/components/SlotCard.jsx`

**Interfaces:**
- Consumes: `GET /api/slots`, `GET /api/status`, `POST /api/scrape` from the Express server
- Produces: A React SPA served from `dist/` showing available slots grouped by date

- [ ] **Step 1: Create src/client/src/components/StatusHeader.jsx**

```jsx
export default function StatusHeader({ status, onRefresh, refreshing }) {
  const lastSeen = status.lastScrapedAt
    ? new Date(status.lastScrapedAt).toLocaleString('en-SG')
    : 'Never'

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
      <div>
        <h1 style={{ margin: 0, fontSize: 22 }}>ActiveSG Slots</h1>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: status.success ? '#666' : '#c00' }}>
          {status.success
            ? `Last updated: ${lastSeen}`
            : `Last check failed — showing stale data from ${lastSeen}`}
        </p>
      </div>
      <button
        onClick={onRefresh}
        disabled={refreshing}
        style={{ padding: '8px 16px', cursor: refreshing ? 'not-allowed' : 'pointer', marginTop: 4 }}
      >
        {refreshing ? 'Refreshing…' : 'Refresh Now'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Create src/client/src/components/SportTabs.jsx**

```jsx
const SPORT_ORDER = ['badminton', 'pickleball']

export default function SportTabs({ active, onChange, availableSports }) {
  const tabs = ['all', ...SPORT_ORDER.filter(s => availableSports.includes(s))]

  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => onChange(tab)}
          style={{
            padding: '6px 14px',
            borderRadius: 4,
            border: '1px solid #ccc',
            background: active === tab ? '#222' : '#fff',
            color: active === tab ? '#fff' : '#333',
            cursor: 'pointer',
            textTransform: 'capitalize',
          }}
        >
          {tab === 'all' ? 'All Sports' : tab}
        </button>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create src/client/src/components/SlotCard.jsx**

```jsx
export default function SlotCard({ sport, date, slots }) {
  const dateObj = new Date(date + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1)

  const formatted = dateObj.toLocaleDateString('en-SG', { weekday: 'long', month: 'short', day: 'numeric' })
  let prefix = ''
  if (dateObj.getTime() === today.getTime()) prefix = 'Today — '
  else if (dateObj.getTime() === tomorrow.getTime()) prefix = 'Tomorrow — '

  const dayType = slots[0]?.day_type
  const isWeekendDay = dayType === 'weekend'

  return (
    <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <strong style={{ fontSize: 15 }}>{prefix}{formatted}</strong>
        <div style={{ display: 'flex', gap: 6 }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: isWeekendDay ? '#e8f5e9' : '#e3f2fd',
            color: isWeekendDay ? '#2e7d32' : '#1565c0',
          }}>
            {isWeekendDay ? 'Weekend' : 'Weekday'}
          </span>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 10,
            background: '#f5f5f5', color: '#555', textTransform: 'capitalize',
          }}>
            {sport}
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {slots.map((slot, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, fontSize: 14 }}>
            <span style={{ color: '#444', minWidth: 130, fontVariantNumeric: 'tabular-nums' }}>
              {slot.start_time} – {slot.end_time}
            </span>
            <span style={{ color: '#222' }}>{slot.venue}</span>
            <span style={{ color: '#888' }}>{slot.court}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create src/client/src/App.jsx**

```jsx
import { useState, useEffect, useCallback } from 'react'
import StatusHeader from './components/StatusHeader.jsx'
import SportTabs from './components/SportTabs.jsx'
import SlotCard from './components/SlotCard.jsx'

export default function App() {
  const [slots, setSlots] = useState({})
  const [status, setStatus] = useState({ lastScrapedAt: null, success: false })
  const [activeSport, setActiveSport] = useState('all')
  const [refreshing, setRefreshing] = useState(false)

  const fetchData = useCallback(async () => {
    const [slotsRes, statusRes] = await Promise.all([
      fetch('/api/slots'),
      fetch('/api/status'),
    ])
    setSlots(await slotsRes.json())
    setStatus(await statusRes.json())
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 5 * 60 * 1000)
    return () => clearInterval(id)
  }, [fetchData])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await fetch('/api/scrape', { method: 'POST' })
      await fetchData()
    } finally {
      setRefreshing(false)
    }
  }

  const availableSports = Object.keys(slots)
  const sportsToShow = activeSport === 'all' ? availableSports : [activeSport]

  const entries = sportsToShow.flatMap(sport =>
    Object.entries(slots[sport] || {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dateSlots]) => ({ sport, date, slots: dateSlots }))
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <StatusHeader status={status} onRefresh={handleRefresh} refreshing={refreshing} />
      <SportTabs active={activeSport} onChange={setActiveSport} availableSports={availableSports} />
      {entries.length === 0 ? (
        <p style={{ color: '#999', marginTop: 32 }}>No available slots found.</p>
      ) : (
        entries.map(({ sport, date, slots: dateSlots }) => (
          <SlotCard key={`${sport}-${date}`} sport={sport} date={date} slots={dateSlots} />
        ))
      )}
    </div>
  )
}
```

- [ ] **Step 5: Build the React app**

Run: `npm run build`
Expected: `dist/` created with `index.html` and JS/CSS assets

- [ ] **Step 6: Verify locally**

Run the server in one terminal and open the dashboard:

```bash
npm start
```

Open `http://localhost:3000` — dashboard loads, shows "Last updated: Never", Refresh button triggers a scrape, slots appear after the scrape completes.

- [ ] **Step 7: Commit**

```bash
git add src/client/src/
git commit -m "feat: React dashboard with sport tabs, slot cards, and auto-refresh"
```

---

### Task 8: Deploy to Railway

**Files:**
- No new files — uses `railway.toml` from Task 1

**Interfaces:**
- Produces: live URL on Railway serving the dashboard

- [ ] **Step 1: Push to GitHub**

Create a new GitHub repo named `activesg-slots` and push:

```bash
git remote add origin https://github.com/<your-username>/activesg-slots.git
git push -u origin main
```

- [ ] **Step 2: Create Railway project**

Go to https://railway.app → New Project → Deploy from GitHub repo → select `activesg-slots`.

Railway will auto-detect `railway.toml` and:
- Run `npm ci` (triggers `postinstall` → installs Chromium)
- Run `npm run build` (builds React to `dist/`)
- Start with `npm start`

- [ ] **Step 3: Verify deployment**

Once the deploy completes, open the Railway-provided URL (e.g. `https://activesg-slots-production.up.railway.app`).

Verify:
- Dashboard loads
- "Refresh Now" button triggers a scrape and slots appear within ~2 minutes
- Status header updates to show last scraped time
- Both Badminton and Pickleball tabs show data

- [ ] **Step 4: Check Railway logs**

In Railway dashboard → Deployments → Logs — confirm you see:
```
Listening on port XXXX
Scraping Badminton...
[Badminton] N venue(s) found
...
Scrape complete
```

If you see selector errors (0 venue links), SSH into the service or add `PWDEBUG=1` env var and re-run to debug.
