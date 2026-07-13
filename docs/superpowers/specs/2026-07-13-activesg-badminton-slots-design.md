# ActiveSG Sport Slot Checker — Design Spec

**Date:** 2026-07-13  
**Status:** Approved

## Overview

A web app that periodically scrapes ActiveSG facility booking pages for available badminton and pickleball slots and displays them on a dashboard. Runs on a server so it checks continuously, even when the user's laptop is off.

Target URLs:
- **Badminton:** https://activesg.gov.sg/facility-bookings/activities/YLONatwvqJfikKOmB5N9U/venues
- **Pickleball:** https://activesg.gov.sg/facility-bookings/activities/BPQihVHITc7IPGorVeB2Y/venues

Slot filter criteria (same for both sports):
- **Weekdays** (Mon–Fri): slots starting at 19:00 or later
- **Weekends** (Sat–Sun): all available slots

## Architecture

A single Node.js process deployed to Railway with four layers:

```
[node-cron scheduler]
      │ triggers every 10 minutes
[Playwright scraper]  ──► scrapes both sports sequentially
      │ writes results
[SQLite database]
      │ read by
[Express server]  ──► serves static React build + REST API
```

- One Railway service, one `npm start` command
- Express serves the React build from `dist/` and exposes REST endpoints
- node-cron runs inside the same process and triggers the scraper
- SQLite persists slot data across restarts

## Tech Stack

- **Runtime:** Node.js
- **Scraper:** Playwright (headless Chromium) — required because ActiveSG is a JS SPA
- **Scheduler:** node-cron (every 10 minutes)
- **Database:** SQLite via `better-sqlite3`
- **Backend:** Express
- **Frontend:** React (built as static bundle, served by Express)
- **Hosting:** Railway

## Project Structure

```
activesg-slots/
  src/
    scraper/
      index.js        # Playwright scrape logic (handles both sports)
      filter.js       # Weekday/weekend slot filtering
      sports.js       # Sport definitions (name + URL)
    db/
      index.js        # SQLite setup and queries
    server/
      index.js        # Express app + cron scheduler startup
      routes.js       # API route handlers
    client/           # React app
      src/
        App.jsx
        components/
          SlotCard.jsx
          StatusHeader.jsx
          SportTabs.jsx
  dist/               # Built React output (gitignored)
  package.json
  railway.toml
```

## Scraper

The scraper runs every 10 minutes. It processes each sport sequentially using a single shared Chromium instance to minimise memory usage. For each sport, it checks the next 7 days. For each date:

1. Navigate to the sport's ActiveSG venue page (no login required — publicly visible)
2. Select the date using the date picker
3. Wait for slot data to load
4. Extract all available time slots (venue, court, start time, end time)
5. Apply the weekday/weekend filter
6. Write to SQLite (delete existing rows for that sport+date, then insert fresh results)

Sport definitions live in `sports.js` as a simple array, so adding a third sport later only requires adding one entry there.

## Data Model

SQLite table: `slots`

| column | type | description |
|--------|------|-------------|
| `id` | integer PK | auto-increment |
| `sport` | text | `badminton` or `pickleball` |
| `date` | text | ISO date e.g. `2026-07-14` |
| `day_type` | text | `weekday` or `weekend` |
| `venue` | text | Venue name |
| `court` | text | Court identifier |
| `start_time` | text | e.g. `19:00` |
| `end_time` | text | e.g. `20:00` |
| `scraped_at` | text | ISO timestamp of the scrape run |

Each scrape run replaces all rows for the (sport, date) pairs it checked.

## API

- `GET /api/slots` — returns all available slots grouped by sport then date, sorted chronologically
- `GET /api/slots?sport=badminton` — filter by sport
- `GET /api/status` — returns `{ lastScrapedAt, success }` for dashboard header
- `POST /api/scrape` — triggers an immediate scrape run; used by the dashboard's manual Refresh button

## Dashboard

Single-page React app:

- **Header:** app title + last scraped time + manual "Refresh" button (triggers `POST /api/scrape`)
- **Sport tabs:** toggle between Badminton / Pickleball / All
- **Slot list:** cards grouped by date, with "Today"/"Tomorrow" labels and weekday/weekend badge; each card lists court name + time range
- **Empty state:** "No available slots found" message when nothing matches
- **Auto-refresh:** polls `/api/slots` every 5 minutes

No authentication — single-user tool, accessible on the Railway-provided URL.

## Error Handling

- If a scrape run fails (network error, page structure changed), the error is logged and the previous results remain in SQLite — the dashboard keeps showing stale data with the last-scraped timestamp so the user knows something is wrong
- The `/api/status` endpoint returns `success: false` on a failed run so the dashboard can surface a warning
- If one sport fails and the other succeeds, only the failed sport's data goes stale; the other updates normally

## Deployment

- **Platform:** Railway
- **Start command:** `npm start` (runs Express + cron in one process)
- **Build command:** `npm run build` (builds React to `dist/`)
- **Environment variables:** none required (no login needed)
- **`railway.toml`** configures the build and start commands
