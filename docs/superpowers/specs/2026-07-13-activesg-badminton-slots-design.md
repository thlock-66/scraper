# ActiveSG Badminton Slot Checker — Design Spec

**Date:** 2026-07-13  
**Status:** Approved

## Overview

A web app that periodically scrapes the ActiveSG facility booking page for available badminton slots and displays them on a dashboard. Runs on a server so it checks continuously, even when the user's laptop is off.

Target URL: https://activesg.gov.sg/facility-bookings/activities/YLONatwvqJfikKOmB5N9U/venues

Slot filter criteria:
- **Weekdays** (Mon–Fri): slots starting at 19:00 or later
- **Weekends** (Sat–Sun): all available slots

## Architecture

A single Node.js process deployed to Railway with four layers:

```
[node-cron scheduler]
      │ triggers every 10 minutes
[Playwright scraper]
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
activesg-badminton/
  src/
    scraper/
      index.js        # Playwright scrape logic
      filter.js       # Weekday/weekend slot filtering
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
  dist/               # Built React output (gitignored)
  package.json
  railway.toml
```

## Scraper

The scraper runs every 10 minutes and checks the next 7 days. For each date:

1. Navigate to the ActiveSG venue page (no login required — publicly visible)
2. Select the date using the date picker
3. Wait for slot data to load
4. Extract all available time slots (venue, court, start time, end time)
5. Apply the weekday/weekend filter
6. Write to SQLite (delete existing rows for that date, then insert fresh results)

A single Chromium instance is reused across all date checks within one scrape run to minimise memory usage.

## Data Model

SQLite table: `slots`

| column | type | description |
|--------|------|-------------|
| `id` | integer PK | auto-increment |
| `date` | text | ISO date e.g. `2026-07-14` |
| `day_type` | text | `weekday` or `weekend` |
| `venue` | text | Venue name |
| `court` | text | Court identifier |
| `start_time` | text | e.g. `19:00` |
| `end_time` | text | e.g. `20:00` |
| `scraped_at` | text | ISO timestamp of the scrape run |

Each scrape run replaces all rows for the dates it checked.

## API

- `GET /api/slots` — returns available slots grouped by date, sorted chronologically
- `GET /api/status` — returns `{ lastScrapedAt, success }` for dashboard header

## Dashboard

Single-page React app:

- **Header:** app title + last scraped time + manual "Refresh" button (triggers an immediate scrape via `POST /api/scrape`)
- **Slot list:** cards grouped by date, with "Today"/"Tomorrow" labels and weekday/weekend badge; each card lists court name + time range
- **Empty state:** "No available slots found" message
- **Auto-refresh:** polls `/api/slots` every 5 minutes

No authentication — single-user tool, accessible on the Railway-provided URL.

## Error Handling

- If a scrape run fails (network error, page structure changed), the error is logged and the previous results remain in SQLite — the dashboard keeps showing stale data with the last-scraped timestamp so the user knows something is wrong
- The `/api/status` endpoint returns `success: false` on a failed run so the dashboard can surface a warning

## Deployment

- **Platform:** Railway
- **Start command:** `npm start` (runs Express + cron in one process)
- **Build command:** `npm run build` (builds React to `dist/`)
- **Environment variables:** none required (no login needed)
- **`railway.toml`** configures the build and start commands
