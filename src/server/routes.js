import { Router } from 'express'
import { getSlots, getScrapeStatus, upsertSlots, updateScrapeStatus } from '../db/index.js'
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

  router.post('/slots', (req, res) => {
    const apiKey = process.env.SCRAPER_API_KEY
    if (apiKey && req.headers.authorization !== `Bearer ${apiKey}`) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    const entries = req.body
    if (!Array.isArray(entries)) return res.status(400).json({ error: 'Expected array' })
    for (const { sport, date, dayType, slots } of entries) {
      upsertSlots(db, sport, date, dayType, slots)
    }
    updateScrapeStatus(db, true, new Date().toISOString())
    res.json({ ok: true })
  })

  router.post('/scrape', async (req, res) => {
    if (process.env.DISABLE_SCRAPER) {
      return res.status(503).json({ ok: false, error: 'Scraper runs on a separate machine' })
    }
    try {
      await runScraper()
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ ok: false, error: err.message })
    }
  })

  return router
}
