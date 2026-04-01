import { useState, useEffect, useCallback } from 'react'
import { useSSE } from '@/hooks/useSSE'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/utils/api'
import type { Notification } from '@/types'
import NewsPage from '@/pages/NewsPage'
import MonitorPage from '@/pages/MonitorPage'
import SettingsPage from '@/pages/SettingsPage'

type Tab = 'news' | 'monitor' | 'settings'

function NotificationPanel({
  notifications,
  unreadCount,
  onClose,
  onMarkRead,
  onMarkAllRead,
}: {
  notifications: Notification[]
  unreadCount: number
  onClose: () => void
  onMarkRead: (id: number) => void
  onMarkAllRead: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm h-full bg-slate-900/95 border-l border-slate-800 shadow-2xl
          overflow-y-auto animate-slide-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur p-4 border-b border-slate-800/60 z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              通知中心
              {unreadCount > 0 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                  {unreadCount}
                </span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-[10px] text-cyan-500 hover:text-cyan-400"
                >
                  全部已读
                </button>
              )}
              <button onClick={onClose} className="text-slate-500 hover:text-slate-300 text-lg">✕</button>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-2">🔔</div>
              <p className="text-sm text-slate-500">暂无通知</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => n.read === 0 && onMarkRead(n.id)}
                className={`p-3 rounded-lg border transition-all cursor-pointer ${
                  n.read === 0
                    ? 'border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10'
                    : 'border-slate-800/40 bg-slate-800/20 opacity-60'
                }`}
              >
                <div className="flex items-start gap-2">
                  <span className="text-sm mt-0.5">
                    {n.type === 'keyword_match' ? '🔔' : '📡'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 line-clamp-1">{n.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {new Date(n.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  {n.read === 0 && (
                    <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 mt-1.5 shrink-0" />
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('news')
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)

  // SSE 实时连接
  const { connected } = useSSE({
    onNotification: (notification) => {
      setNotifications((prev) => [notification, ...prev])
      setUnreadCount((prev) => prev + 1)
      setToast({ message: notification.title, type: notification.type })
      setTimeout(() => setToast(null), 5000)
    },
    onHotspotUpdate: () => {
      // 热点更新时可以触发页面刷新
    },
  })

  // 加载通知
  const loadNotifications = useCallback(async () => {
    try {
      const result = await fetchNotifications()
      setNotifications(result.notifications)
      setUnreadCount(result.unreadCount)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    loadNotifications()
  }, [loadNotifications])

  const handleMarkRead = async (id: number) => {
    await markNotificationRead(id)
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: 1 } : n)))
    setUnreadCount((prev) => Math.max(0, prev - 1))
  }

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead()
    setNotifications((prev) => prev.map((n) => ({ ...n, read: 1 })))
    setUnreadCount(0)
  }

  const tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'news', label: '热点', icon: '📡' },
    { key: 'monitor', label: '监控', icon: '🎯' },
    { key: 'settings', label: '设置', icon: '⚙️' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* 背景网格 */}
      <div className="fixed inset-0 bg-grid-pattern opacity-[0.02] pointer-events-none" />
      {/* 背景光晕 */}
      <div className="fixed top-0 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center
                  shadow-lg shadow-cyan-500/20">
                  <span className="text-lg">⚡</span>
                </div>
                <div className="absolute -inset-0.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg blur opacity-30" />
              </div>
              <div>
                <h1 className="text-base font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
                  HotPulse
                </h1>
                <p className="text-[10px] text-slate-600 tracking-wider">AI 热点监控引擎</p>
              </div>
            </div>

            {/* 右侧控制 */}
            <div className="flex items-center gap-3">
              {/* 连接状态 */}
              <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full
                border border-slate-800/60 bg-slate-900/50">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  connected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-slate-600'
                }`} />
                <span className="text-[10px] text-slate-500">
                  {connected ? 'LIVE' : 'OFFLINE'}
                </span>
              </div>

              {/* 通知按钮 */}
              <button
                onClick={() => setShowNotifications(true)}
                className="relative p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-lg">🔔</span>
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center
                    text-[9px] font-bold bg-red-500 text-white rounded-full">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <nav className="sticky top-[57px] z-30 border-b border-slate-800/40 bg-slate-950/60 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`relative py-3 px-4 text-sm font-medium transition-all flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'text-cyan-400'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
              {activeTab === tab.key && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5 bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6 relative">
        {activeTab === 'news' && <NewsPage />}
        {activeTab === 'monitor' && <MonitorPage />}
        {activeTab === 'settings' && <SettingsPage />}
      </main>

      {/* Toast 通知 */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-toast-in">
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-500/20
            bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 max-w-sm">
            <span className="text-lg shrink-0">
              {toast.type === 'keyword_match' ? '🔔' : '📡'}
            </span>
            <p className="text-xs text-slate-200 line-clamp-2">{toast.message}</p>
            <button
              onClick={() => setToast(null)}
              className="text-slate-500 hover:text-slate-300 text-sm shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 通知面板 */}
      {showNotifications && (
        <NotificationPanel
          notifications={notifications}
          unreadCount={unreadCount}
          onClose={() => setShowNotifications(false)}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
        />
      )}
    </div>
  )
}
