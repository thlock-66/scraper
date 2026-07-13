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
