/**
 * 测试环境初始化 - 使用内存数据库，避免污染生产数据
 */
import Database from 'better-sqlite3'
import { vi } from 'vitest'

// 创建内存数据库并初始化表
let testDb: Database.Database

export function createTestDb(): Database.Database {
  testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')

  testDb.exec(`
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
    CREATE INDEX IF NOT EXISTS idx_keyword_matches_kw ON keyword_matches(keywordId);
    CREATE INDEX IF NOT EXISTS idx_keyword_matches_news ON keyword_matches(newsId);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_keyword_matches_unique ON keyword_matches(keywordId, newsId);
    CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(read);
  `)

  return testDb
}

export function getTestDb(): Database.Database {
  return testDb
}

export function closeTestDb() {
  if (testDb) testDb.close()
}

// Mock getDb 以使用测试内存数据库
export function mockDatabase() {
  vi.mock('../models/database.js', () => ({
    getDb: () => testDb,
  }))
}

// Mock logger 以静默日志输出
export function mockLogger() {
  vi.mock('../utils/logger.js', () => ({
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
  }))
}

// Mock config
export function mockConfig() {
  vi.mock('../utils/config.js', () => ({
    getConfig: () => ({
      server: { port: 3000, host: '0.0.0.0', environment: 'test' },
      database: { type: 'sqlite', path: ':memory:' },
      api: { baseUrl: '/api', timeout: 30000 },
      datasources: {
        hackernews: { enabled: true, limit: 10 },
        bing: { enabled: true, limit: 10 },
        duckduckgo: { enabled: true, limit: 10 },
        twitter: { enabled: true, apiKey: 'test-key', limit: 10 },
        google: { enabled: true, limit: 10 },
        weibo: { enabled: true, limit: 10 },
        bili: { enabled: true, limit: 10 },
        sogou: { enabled: true, limit: 10 },
      },
      ai: {
        provider: 'test',
        apiKey: 'test-key',
        apiUrl: 'http://localhost:9999',
        model: 'test-model',
        temperature: 0.7,
        maxTokens: 500,
        timeout: 10000,
      },
      aiAlternatives: [],
      notifications: { enabled: true, types: ['keyword_match'], web: { enabled: true, useWebSocket: false } },
      crawler: {
        userAgent: 'test-agent',
        timeout: 5000,
        retries: 1,
        proxy: null,
        rateLimiting: { enabled: false, requestsPerMinute: 60 },
      },
      logging: { level: 'silent', format: 'json', file: '' },
      security: {
        cors: { enabled: true, origin: ['*'] },
        rateLimit: { enabled: false, windowMs: 60000, maxRequests: 100 },
      },
    }),
    loadConfig: vi.fn(),
    Config: {},
  }))
}
