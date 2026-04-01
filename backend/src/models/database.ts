import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import { logger } from '../utils/logger.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

let db: Database.Database | null = null

export function getDb(): Database.Database {
  if (db) return db

  const dbDir = path.resolve(__dirname, '../../../data')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }

  const dbPath = path.resolve(dbDir, 'news.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  initTables()
  logger.info('✅ Database initialized')
  return db
}

function initTables() {
  if (!db) return

  db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL UNIQUE,
      scope TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      lastCheckedAt TEXT,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      content TEXT DEFAULT '',
      url TEXT,
      source TEXT NOT NULL,
      hotness INTEGER DEFAULT 0,
      verified INTEGER DEFAULT NULL,
      verifyConfidence REAL DEFAULT 0,
      verifyWarnings TEXT DEFAULT '[]',
      aiAnalysis TEXT DEFAULT '{}',
      publishedAt TEXT,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS keyword_matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keywordId INTEGER NOT NULL,
      newsId INTEGER NOT NULL,
      notified INTEGER DEFAULT 0,
      matchedAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (keywordId) REFERENCES keywords(id) ON DELETE CASCADE,
      FOREIGN KEY (newsId) REFERENCES news(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT DEFAULT '',
      data TEXT DEFAULT '{}',
      read INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_news_source ON news(source);
    CREATE INDEX IF NOT EXISTS idx_news_hotness ON news(hotness DESC);
    CREATE INDEX IF NOT EXISTS idx_news_createdAt ON news(createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(active);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_match ON keyword_matches(keywordId, newsId);
  `)
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}
