import { getDb } from '../models/database.js'
import { logger } from '../utils/logger.js'

export interface Keyword {
  id: number
  keyword: string
  scope: string
  active: number
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

export function getAllKeywords(): Keyword[] {
  const db = getDb()
  return db.prepare('SELECT * FROM keywords ORDER BY createdAt DESC').all() as Keyword[]
}

export function getActiveKeywords(): Keyword[] {
  const db = getDb()
  return db.prepare('SELECT * FROM keywords WHERE active = 1 ORDER BY createdAt DESC').all() as Keyword[]
}

export function getKeywordById(id: number): Keyword | undefined {
  const db = getDb()
  return db.prepare('SELECT * FROM keywords WHERE id = ?').get(id) as Keyword | undefined
}

export function createKeyword(keyword: string, scope: string = ''): Keyword {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM keywords WHERE keyword = ?').get(keyword) as Keyword | undefined
  if (existing) {
    throw new Error(`关键词 "${keyword}" 已存在`)
  }
  const stmt = db.prepare('INSERT INTO keywords (keyword, scope) VALUES (?, ?)')
  const result = stmt.run(keyword, scope)
  logger.info(`Keyword created: "${keyword}" (scope: ${scope || 'none'})`)
  return getKeywordById(result.lastInsertRowid as number)!
}

export function deleteKeyword(id: number): boolean {
  const db = getDb()
  const result = db.prepare('DELETE FROM keywords WHERE id = ?').run(id)
  return result.changes > 0
}

export function toggleKeyword(id: number, active: boolean): Keyword | undefined {
  const db = getDb()
  db.prepare('UPDATE keywords SET active = ?, updatedAt = datetime("now") WHERE id = ?').run(active ? 1 : 0, id)
  return getKeywordById(id)
}

export function updateLastChecked(id: number) {
  const db = getDb()
  db.prepare('UPDATE keywords SET lastCheckedAt = datetime("now") WHERE id = ?').run(id)
}
