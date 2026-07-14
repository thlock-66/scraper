import { runScraper } from '../src/scraper/index.js'

runScraper()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Scrape failed:', err.message)
    process.exit(1)
  })
