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
