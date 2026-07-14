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

if (!process.env.DISABLE_SCRAPER) {
  cron.schedule('*/10 * * * *', () => {
    runScraper().catch(err => console.error('Scheduled scrape failed:', err.message))
  })
}

app.listen(PORT, () => {
  console.log(`Listening on port ${PORT}`)
  if (!process.env.DISABLE_SCRAPER) {
    runScraper().catch(err => console.error('Initial scrape failed:', err.message))
  }
})
