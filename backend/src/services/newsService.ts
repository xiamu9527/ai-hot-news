import { getDb } from '../models/database.js'
import { logger } from '../utils/logger.js'

export interface NewsItem {
  id: number
  title: string
  summary: string
  content: string
  url: string | null
  source: string
  hotness: number
  verified: number | null
  verifyConfidence: number
  verifyWarnings: string
  aiAnalysis: string
  publishedAt: string | null
  createdAt: string
}

export interface NewsQueryOptions {
  source?: string
  keyword?: string
  limit?: number
  offset?: number
  minHotness?: number
}

export function getNewsList(options: NewsQueryOptions = {}): { data: NewsItem[]; total: number } {
  const db = getDb()
  const { source, keyword, limit = 30, offset = 0, minHotness } = options

  let where = 'WHERE 1=1'
  const params: any[] = []

  if (source && source !== 'all') {
    where += ' AND source = ?'
    params.push(source)
  }
  if (keyword) {
    where += ' AND (title LIKE ? OR summary LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like)
  }
  if (minHotness !== undefined) {
    where += ' AND hotness >= ?'
    params.push(minHotness)
  }

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM news ${where}`).get(...params) as any
  const total = countRow.count

  const data = db.prepare(
    `SELECT * FROM news ${where} ORDER BY hotness DESC, createdAt DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as NewsItem[]

  return { data, total }
}

export function getNewsById(id: number): NewsItem | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM news WHERE id = ?').get(id) as NewsItem | undefined
}

export function upsertNews(item: {
  title: string
  summary?: string
  content?: string
  url?: string
  source: string
  hotness?: number
  verified?: boolean | null
  verifyConfidence?: number
  verifyWarnings?: string[]
  aiAnalysis?: Record<string, any>
  publishedAt?: string
}): NewsItem {
  const db = getDb()

  // 通过 title+source 去重
  const existing = db.prepare('SELECT * FROM news WHERE title = ? AND source = ?').get(item.title, item.source) as NewsItem | undefined
  if (existing) {
    // 更新已有记录
    db.prepare(`
      UPDATE news SET 
        hotness = CASE WHEN ? > hotness THEN ? ELSE hotness END,
        verified = COALESCE(?, verified),
        verifyConfidence = CASE WHEN ? > 0 THEN ? ELSE verifyConfidence END,
        verifyWarnings = CASE WHEN ? != '[]' THEN ? ELSE verifyWarnings END,
        aiAnalysis = CASE WHEN ? != '{}' THEN ? ELSE aiAnalysis END
      WHERE id = ?
    `).run(
      item.hotness ?? 0, item.hotness ?? 0,
      item.verified !== undefined ? (item.verified ? 1 : 0) : null,
      item.verifyConfidence ?? 0, item.verifyConfidence ?? 0,
      JSON.stringify(item.verifyWarnings ?? []), JSON.stringify(item.verifyWarnings ?? []),
      JSON.stringify(item.aiAnalysis ?? {}), JSON.stringify(item.aiAnalysis ?? {}),
      existing.id
    )
    return getNewsById(existing.id)!
  }

  const stmt = db.prepare(`
    INSERT INTO news (title, summary, content, url, source, hotness, verified, verifyConfidence, verifyWarnings, aiAnalysis, publishedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const result = stmt.run(
    item.title,
    item.summary ?? '',
    item.content ?? '',
    item.url ?? null,
    item.source,
    item.hotness ?? 0,
    item.verified !== undefined && item.verified !== null ? (item.verified ? 1 : 0) : null,
    item.verifyConfidence ?? 0,
    JSON.stringify(item.verifyWarnings ?? []),
    JSON.stringify(item.aiAnalysis ?? {}),
    item.publishedAt ?? null
  )

  return getNewsById(result.lastInsertRowid as number)!
}

export function recordKeywordMatch(keywordId: number, newsId: number): boolean {
  const db = getDb()
  try {
    db.prepare('INSERT OR IGNORE INTO keyword_matches (keywordId, newsId) VALUES (?, ?)').run(keywordId, newsId)
    return true
  } catch {
    return false
  }
}

export function getKeywordMatches(keywordId: number, limit = 20): NewsItem[] {
  const db = getDb()
  return db.prepare(`
    SELECT n.* FROM news n
    INNER JOIN keyword_matches km ON km.newsId = n.id
    WHERE km.keywordId = ?
    ORDER BY km.matchedAt DESC
    LIMIT ?
  `).all(keywordId, limit) as NewsItem[]
}

export function getNewsStats(): { total: number; sources: Record<string, number>; avgHotness: number } {
  const db = getDb()
  const totalRow = db.prepare('SELECT COUNT(*) as count FROM news').get() as any
  const sourceRows = db.prepare('SELECT source, COUNT(*) as count FROM news GROUP BY source').all() as any[]
  const avgRow = db.prepare('SELECT AVG(hotness) as avg FROM news WHERE hotness > 0').get() as any

  const sources: Record<string, number> = {}
  for (const row of sourceRows) {
    sources[row.source] = row.count
  }

  return {
    total: totalRow.count,
    sources,
    avgHotness: Math.round(avgRow.avg ?? 0)
  }
}
