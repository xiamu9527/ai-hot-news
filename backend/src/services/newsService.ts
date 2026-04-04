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
  keywordId?: number
  matchMode?: 'all' | 'matched' | 'unmatched'
  limit?: number
  offset?: number
  minHotness?: number
  /** 最大保留天数，默认 7，传 0 表示不限制 */
  maxAgeDays?: number
}

export function getNewsList(options: NewsQueryOptions = {}): { data: NewsItem[]; total: number } {
  const db = getDb()
  const { source, keyword, keywordId, matchMode = 'all', limit = 30, offset = 0, minHotness, maxAgeDays = 7 } = options

  let where = 'WHERE 1=1'
  const params: any[] = []

  // 默认过滤一周以前的新闻（maxAgeDays=0 不限制）
  if (maxAgeDays > 0) {
    where += ` AND n.createdAt >= datetime('now', '-${Math.floor(maxAgeDays)} days')`
  }

  if (source && source !== 'all') {
    where += ' AND n.source = ?'
    params.push(source)
  }
  if (keyword) {
    where += ' AND (n.title LIKE ? OR n.summary LIKE ?)'
    const like = `%${keyword}%`
    params.push(like, like)
  }
  if (keywordId !== undefined) {
    where += ' AND EXISTS (SELECT 1 FROM keyword_matches km WHERE km.newsId = n.id AND km.keywordId = ?)'
    params.push(keywordId)
  }
  if (matchMode === 'matched') {
    where += ' AND EXISTS (SELECT 1 FROM keyword_matches km WHERE km.newsId = n.id)'
  }
  if (matchMode === 'unmatched') {
    where += ' AND NOT EXISTS (SELECT 1 FROM keyword_matches km WHERE km.newsId = n.id)'
  }
  if (minHotness !== undefined) {
    where += ' AND n.hotness >= ?'
    params.push(minHotness)
  }

  const countRow = db.prepare(`SELECT COUNT(*) as count FROM news n ${where}`).get(...params) as any
  const total = countRow.count

  const data = db.prepare(
    `SELECT n.*, (
      SELECT 1 FROM keyword_matches km WHERE km.newsId = n.id LIMIT 1
    ) AS isMatch FROM news n ${where} ORDER BY isMatch DESC, n.hotness DESC, n.createdAt DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as NewsItem[]

  return { data, total }
}

export function getNewsById(id: number): NewsItem | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM news WHERE id = ?').get(id) as NewsItem | undefined
}

export function getNewsByIds(ids: number[]): NewsItem[] {
  if (ids.length === 0) return []

  const db = getDb()
  const placeholders = ids.map(() => '?').join(', ')
  const rows = db.prepare(`SELECT * FROM news WHERE id IN (${placeholders})`).all(...ids) as NewsItem[]
  const rowMap = new Map(rows.map((row) => [row.id, row]))
  return ids.map((id) => rowMap.get(id)).filter(Boolean) as NewsItem[]
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
