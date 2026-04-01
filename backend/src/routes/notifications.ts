import { Router, Request, Response } from 'express'
import {
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  clearNotifications,
  addSSEClient,
  removeSSEClient
} from '../services/notificationService.js'

const router = Router()

// GET /api/notifications/stream - SSE实时推送
router.get('/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  })

  // 发送初始连接确认
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'ok' })}\n\n`)

  addSSEClient(res)

  // 心跳保活
  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`)
  }, 30000)

  req.on('close', () => {
    clearInterval(heartbeat)
    removeSSEClient(res)
  })
})

// GET /api/notifications - 获取通知列表
router.get('/', (req: Request, res: Response) => {
  const { limit, unreadOnly } = req.query
  const notifications = getNotifications({
    limit: limit ? parseInt(limit as string) : undefined,
    unreadOnly: unreadOnly === 'true'
  })
  const unread = getUnreadCount()
  res.json({ notifications, unreadCount: unread })
})

// PUT /api/notifications/:id/read - 标记已读
router.put('/:id/read', (req: Request, res: Response) => {
  const id = parseInt(req.params.id)
  const success = markAsRead(id)
  res.json({ success })
})

// PUT /api/notifications/read-all - 全部标记已读
router.put('/read-all', (_req: Request, res: Response) => {
  const count = markAllAsRead()
  res.json({ success: true, count })
})

// DELETE /api/notifications - 清空通知
router.delete('/', (_req: Request, res: Response) => {
  const count = clearNotifications()
  res.json({ success: true, count })
})

export default router
