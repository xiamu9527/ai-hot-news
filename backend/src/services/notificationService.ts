import { getDb } from '../models/database.js'
import { logger } from '../utils/logger.js'
import { Response } from 'express'

export interface Notification {
  id: number
  type: string
  title: string
  message: string
  data: string
  read: number
  createdAt: string
}

// SSE 客户端管理
const sseClients: Set<Response> = new Set()

export function addSSEClient(res: Response) {
  sseClients.add(res)
  logger.info(`SSE client connected. Total: ${sseClients.size}`)
}

export function removeSSEClient(res: Response) {
  sseClients.delete(res)
  logger.info(`SSE client disconnected. Total: ${sseClients.size}`)
}

export function broadcastSSE(event: string, data: any) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(message)
    } catch {
      sseClients.delete(client)
    }
  }
}

export function createNotification(params: {
  type: string
  title: string
  message?: string
  data?: Record<string, any>
}): Notification {
  const db = getDb()
  const stmt = db.prepare(
    'INSERT INTO notifications (type, title, message, data) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(
    params.type,
    params.title,
    params.message ?? '',
    JSON.stringify(params.data ?? {})
  )

  const notification = db.prepare('SELECT * FROM notifications WHERE id = ?')
    .get(result.lastInsertRowid) as Notification

  // 实时推送到所有 SSE 客户端
  broadcastSSE('notification', notification)
  logger.info(`Notification created: [${params.type}] ${params.title}`)

  return notification
}

export function getNotifications(options: { limit?: number; unreadOnly?: boolean } = {}): Notification[] {
  const db = getDb()
  const { limit = 50, unreadOnly = false } = options
  const where = unreadOnly ? 'WHERE read = 0' : ''
  return db.prepare(
    `SELECT * FROM notifications ${where} ORDER BY createdAt DESC LIMIT ?`
  ).all(limit) as Notification[]
}

export function markAsRead(id: number): boolean {
  const db = getDb()
  const result = db.prepare('UPDATE notifications SET read = 1 WHERE id = ?').run(id)
  return result.changes > 0
}

export function markAllAsRead(): number {
  const db = getDb()
  const result = db.prepare('UPDATE notifications SET read = 0 WHERE read = 0').run()
  return result.changes
}

export function getUnreadCount(): number {
  const db = getDb()
  const row = db.prepare('SELECT COUNT(*) as count FROM notifications WHERE read = 0').get() as any
  return row.count
}

export function clearNotifications(): number {
  const db = getDb()
  const result = db.prepare('DELETE FROM notifications').run()
  return result.changes
}
