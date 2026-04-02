import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { createTestDb, closeTestDb, mockDatabase, mockLogger } from './setup.js'

mockLogger()
mockDatabase()

const {
  createNotification,
  getNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
} = await import('../services/notificationService.js')

describe('notificationService', () => {
  beforeEach(() => {
    const db = createTestDb()
    db.exec('DELETE FROM notifications;')
  })

  afterAll(() => closeTestDb())

  it('createNotification - 应成功创建通知', () => {
    const n = createNotification({
      type: 'keyword_match',
      title: '测试通知',
      message: '这是一条测试通知',
      data: { keywordId: 1 },
    })
    expect(n).toBeDefined()
    expect(n.id).toBeGreaterThan(0)
    expect(n.title).toBe('测试通知')
    expect(n.read).toBe(0)
  })

  it('getNotifications - 应返回全部通知', () => {
    createNotification({ type: 'test', title: 'N1', message: '' })
    createNotification({ type: 'test', title: 'N2', message: '' })
    createNotification({ type: 'test', title: 'N3', message: '' })

    const list = getNotifications()
    expect(list).toHaveLength(3)
    const titles = list.map(n => n.title).sort()
    expect(titles).toEqual(['N1', 'N2', 'N3'])
  })

  it('getNotifications - 支持 limit', () => {
    for (let i = 0; i < 5; i++) {
      createNotification({ type: 'test', title: `N${i}`, message: '' })
    }
    const list = getNotifications({ limit: 2 })
    expect(list).toHaveLength(2)
  })

  it('markAsRead - 应将通知标为已读', () => {
    const n = createNotification({ type: 'test', title: 'N1', message: '' })
    expect(n.read).toBe(0)

    markAsRead(n.id)

    const list = getNotifications()
    const updated = list.find(x => x.id === n.id)
    expect(updated?.read).toBe(1)
  })

  it('markAllAsRead - 应将所有通知标为已读', () => {
    createNotification({ type: 'test', title: 'N1', message: '' })
    createNotification({ type: 'test', title: 'N2', message: '' })

    expect(getUnreadCount()).toBe(2)
    markAllAsRead()
    expect(getUnreadCount()).toBe(0)
  })

  it('getUnreadCount - 应返回正确的未读计数', () => {
    createNotification({ type: 'test', title: 'N1', message: '' })
    createNotification({ type: 'test', title: 'N2', message: '' })
    const n3 = createNotification({ type: 'test', title: 'N3', message: '' })

    expect(getUnreadCount()).toBe(3)
    markAsRead(n3.id)
    expect(getUnreadCount()).toBe(2)
  })
})
