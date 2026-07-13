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
