import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useSSE } from '@/hooks/useSSE'
import { fetchNotifications, markNotificationRead, markAllNotificationsRead } from '@/utils/api'
import type { AiProgressEvent, Notification } from '@/types'
import { Spotlight } from '@/components/ui/spotlight'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { FloatingDock } from '@/components/ui/floating-dock'
import MatchAnalysisPage from '@/pages/MatchAnalysisPage'
import HotspotExplorePage from '@/pages/HotspotExplorePage'
import MonitorPage from '@/pages/MonitorPage'
import SettingsPage from '@/pages/SettingsPage'

type Tab = 'matches' | 'hotspots' | 'monitor' | 'settings'

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
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="relative w-full max-w-sm h-full bg-slate-900/95 border-l border-slate-800/60 shadow-2xl shadow-black/40 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-slate-900/95 backdrop-blur-xl p-4 border-b border-slate-800/60 z-10">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-slate-100 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-cyan-400" />
              通知中心
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30"
                >
                  {unreadCount}
                </motion.span>
              )}
            </h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={onMarkAllRead}
                  className="text-[10px] text-cyan-500 hover:text-cyan-400 transition-colors"
                >
                  全部已读
                </button>
              )}
              <button
                onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 transition-all text-sm"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div className="p-3 space-y-2">
          {notifications.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center mb-3 opacity-30"><span className="w-2 h-2 rounded-full bg-slate-600" /></div>
              <p className="text-sm text-slate-500">暂无通知</p>
            </div>
          ) : (
            notifications.map((n, i) => (
              <motion.div
                key={n.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                onClick={() => n.read === 0 && onMarkRead(n.id)}
                className={`p-3 rounded-xl border transition-all cursor-pointer group ${
                  n.read === 0
                    ? 'border-cyan-500/20 bg-cyan-500/5 hover:bg-cyan-500/10 hover:border-cyan-500/30'
                    : 'border-slate-800/40 bg-slate-800/20 opacity-50 hover:opacity-70'
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-sm mt-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full inline-block ${n.type === 'keyword_match' ? 'bg-fuchsia-400' : 'bg-cyan-400'}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 line-clamp-1">{n.title}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-600 mt-1">
                      {new Date(n.createdAt).toLocaleString('zh-CN')}
                    </p>
                  </div>
                  {n.read === 0 && (
                    <div className="w-2 h-2 rounded-full bg-cyan-400 mt-1.5 shrink-0 animate-pulse" />
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('matches')
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [toast, setToast] = useState<{ message: string; type: string } | null>(null)
  const [aiProgress, setAiProgress] = useState<AiProgressEvent | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const refreshTimerRef = useRef<number | null>(null)

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) {
      window.clearTimeout(refreshTimerRef.current)
    }
    refreshTimerRef.current = window.setTimeout(() => {
      setRefreshTick((prev) => prev + 1)
      refreshTimerRef.current = null
    }, 500)
  }, [])

  // SSE 实时连接
  const { connected } = useSSE({
    onNotification: (notification) => {
      setNotifications((prev) => [notification, ...prev])
      setUnreadCount((prev) => prev + 1)
      setToast({ message: notification.title, type: notification.type })
      setTimeout(() => setToast(null), 5000)
    },
    onHotspotUpdate: () => {
      scheduleRefresh()
    },
    onAiProgress: (data) => {
      setAiProgress(data)
      if (data.stage === 'seeded' || data.stage === 'batch' || data.stage === 'detail' || data.stage === 'completed') {
        scheduleRefresh()
      }
      if (data.stage === 'completed') {
        window.setTimeout(() => {
          setAiProgress((current) => (current?.timestamp === data.timestamp ? null : current))
        }, 4000)
      }
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

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current)
      }
    }
  }, [])

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

  const dockItems = [
    {
      title: '命中分析',
      icon: <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-400" />,
      active: activeTab === 'matches',
      onClick: () => setActiveTab('matches'),
    },
    {
      title: '热点探索',
      icon: <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />,
      active: activeTab === 'hotspots',
      onClick: () => setActiveTab('hotspots'),
    },
    {
      title: '关键词',
      icon: <span className="w-1.5 h-1.5 rounded-full bg-violet-400" />,
      active: activeTab === 'monitor',
      onClick: () => setActiveTab('monitor'),
    },
    {
      title: '设置',
      icon: <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />,
      active: activeTab === 'settings',
      onClick: () => setActiveTab('settings'),
    },
  ]

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 relative overflow-hidden">
      {/* 背景效果 */}
      <BackgroundBeams className="fixed inset-0 pointer-events-none z-0" />
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/5 rounded-full blur-[150px] pointer-events-none z-0" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-blue-500/5 rounded-full blur-[150px] pointer-events-none z-0" />

      {/* Header with Spotlight */}
      <header className="sticky top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-xl overflow-hidden">
        <Spotlight className="-top-40 left-0 md:left-60 md:-top-20" fill="rgba(6,182,212,0.08)" />
        <div className="max-w-7xl mx-auto px-4 py-3 relative">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3"
            >
              <div className="relative">
                <motion.div
                  whileHover={{ scale: 1.05, rotate: 2 }}
                  className="w-9 h-9 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/25"
                >
                  <span className="text-lg font-bold text-cyan-400">/</span>
                </motion.div>
                <div className="absolute -inset-0.5 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg blur opacity-30 animate-pulse" />
              </div>
              <div>
                <h1 className="text-base font-bold bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-400 bg-clip-text text-transparent">
                  HotPulse
                </h1>
                <p className="text-[10px] text-slate-600 tracking-widest uppercase">实时热点情报台</p>
              </div>
            </motion.div>

            {/* 右侧控制 */}
            <div className="flex items-center gap-3">
              {/* 连接状态 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-slate-800/60 bg-slate-900/50"
              >
                <div className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  connected
                    ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse'
                    : 'bg-slate-600'
                }`} />
                <span className="text-[10px] text-slate-500 font-mono">
                  {connected ? 'LIVE' : 'OFFLINE'}
                </span>
              </motion.div>

              {/* 通知按钮 */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowNotifications(true)}
                className="relative p-2 rounded-lg hover:bg-slate-800/50 transition-colors"
              >
                <span className="w-2 h-2 rounded-full bg-cyan-400" />
                <AnimatePresence>
                  {unreadCount > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute -top-0.5 -right-0.5 w-4 h-4 flex items-center justify-center text-[9px] font-bold bg-red-500 text-white rounded-full shadow-lg shadow-red-500/30"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>
      </header>

      {/* Floating Dock Navigation */}
      <nav className="fixed bottom-3 left-4 right-4 z-30 rounded-3xl border border-slate-800/50 bg-slate-950/80 backdrop-blur-xl shadow-2xl shadow-black/30 sm:sticky sm:top-[57px] sm:left-auto sm:right-auto sm:bottom-auto sm:rounded-none sm:border-x-0 sm:border-t-0 sm:border-b sm:bg-slate-950/60 sm:shadow-none">
        <div className="max-w-7xl mx-auto px-0 py-0 sm:px-4 sm:py-2 flex justify-center">
          <FloatingDock items={dockItems} className="w-full sm:w-auto" />
        </div>
      </nav>

      {/* Main Content with page transitions */}
      <main className="max-w-7xl mx-auto px-4 py-6 pb-28 sm:pb-6 relative">
        <AnimatePresence>
          {aiProgress && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="mb-5 rounded-2xl border border-cyan-500/20 bg-slate-950/80 p-4 backdrop-blur-xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">实时 AI 状态</p>
                  <p className="mt-2 text-sm text-slate-100">{aiProgress.message}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    流水线：{aiProgress.pipeline === 'hotspots' ? '热点探索' : '关键词命中'}
                    {aiProgress.keyword ? ` · ${aiProgress.keyword}` : ''}
                  </p>
                </div>
                <div className="rounded-2xl border border-cyan-400/20 bg-slate-900/70 px-4 py-3 text-right">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">当前进度</p>
                  <p className="mt-1 text-2xl font-black text-white">{aiProgress.current}/{Math.max(aiProgress.total, aiProgress.current)}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'matches' && <MatchAnalysisPage refreshTick={refreshTick} aiProgress={aiProgress} />}
            {activeTab === 'hotspots' && <HotspotExplorePage refreshTick={refreshTick} aiProgress={aiProgress} />}
            {activeTab === 'monitor' && <MonitorPage />}
            {activeTab === 'settings' && <SettingsPage />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Toast 通知 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            className="fixed bottom-24 right-4 z-50 sm:bottom-6 sm:right-6"
          >
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-cyan-500/20
              bg-slate-900/95 backdrop-blur-xl shadow-2xl shadow-cyan-500/10 max-w-sm">
              <span className="text-lg shrink-0">
                <span className={`w-2 h-2 rounded-full inline-block ${toast.type === 'keyword_match' ? 'bg-fuchsia-400' : 'bg-cyan-400'}`} />
              </span>
              <p className="text-xs text-slate-200 line-clamp-2">{toast.message}</p>
              <button
                onClick={() => setToast(null)}
                className="text-slate-500 hover:text-slate-300 text-sm shrink-0 transition-colors"
              >
                ✕
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 通知面板 */}
      <AnimatePresence>
        {showNotifications && (
          <NotificationPanel
            notifications={notifications}
            unreadCount={unreadCount}
            onClose={() => setShowNotifications(false)}
            onMarkRead={handleMarkRead}
            onMarkAllRead={handleMarkAllRead}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
