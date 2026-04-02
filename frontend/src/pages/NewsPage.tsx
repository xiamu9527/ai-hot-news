import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { NewsItem, NewsStats } from '@/types'
import { fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'
import { cn } from '@/lib/utils'
import { GlowingCard } from '@/components/ui/glowing-card'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { Meteors } from '@/components/ui/meteors'

// ────────── 数据源配置 ──────────
const SOURCE_CONFIG: Record<string, { label: string; icon: string; color: string; gradient: string }> = {
  all:         { label: '全部',        icon: '🌐', color: 'cyan',   gradient: 'from-cyan-500/20 to-blue-500/10' },
  HackerNews:  { label: 'HackerNews',  icon: '🟠', color: 'orange', gradient: 'from-orange-500/20 to-amber-500/10' },
  Bing:        { label: 'Bing',        icon: '🔵', color: 'blue',   gradient: 'from-blue-500/20 to-sky-500/10' },
  Google:      { label: 'Google',      icon: '🔴', color: 'red',    gradient: 'from-red-500/20 to-rose-500/10' },
  DuckDuckGo:  { label: 'DuckDuckGo',  icon: '🦆', color: 'green',  gradient: 'from-green-500/20 to-emerald-500/10' },
  Twitter:     { label: 'Twitter',     icon: '🐦', color: 'sky',    gradient: 'from-sky-500/20 to-blue-400/10' },
  微博:        { label: '微博',        icon: '📱', color: 'rose',   gradient: 'from-rose-500/20 to-pink-500/10' },
  B站:         { label: 'B站',         icon: '📺', color: 'indigo', gradient: 'from-blue-500/20 to-indigo-500/10' },
  搜狗:        { label: '搜狗',        icon: '🔍', color: 'purple', gradient: 'from-purple-500/20 to-violet-500/10' },
}

type SortMode = 'hotness' | 'latest' | 'verified'

// ────────── 热度渐变条 ──────────
function HotnessMeter({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  const color =
    clamped >= 80 ? 'from-red-500 to-orange-400' :
    clamped >= 50 ? 'from-orange-400 to-amber-400' :
    clamped >= 30 ? 'from-amber-400 to-yellow-400' :
                    'from-cyan-400 to-blue-400'
  const glow =
    clamped >= 80 ? 'shadow-red-500/30' :
    clamped >= 50 ? 'shadow-orange-400/20' :
                    'shadow-cyan-400/10'
  return (
    <div className="flex items-center gap-2">
      <div className={cn("h-1.5 rounded-full bg-slate-800/80 flex-1 overflow-hidden shadow-inner", glow)}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={cn("h-full rounded-full bg-gradient-to-r", color)}
        />
      </div>
      <span className={cn(
        "text-[10px] font-mono font-bold tabular-nums w-7 text-right",
        clamped >= 80 ? 'text-red-400' : clamped >= 50 ? 'text-orange-400' : 'text-cyan-400'
      )}>
        {clamped}
      </span>
    </div>
  )
}

// ────────── 验证徽章 ──────────
function VerifyBadge({ verified, confidence }: { verified: number | null; confidence: number }) {
  if (verified === null) return null
  if (verified === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        ✓ 已验证{confidence > 0 && ` ${Math.round(confidence * 100)}%`}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
      ⚠ 可疑{confidence > 0 && ` ${Math.round(confidence * 100)}%`}
    </span>
  )
}

// ────────── 新闻卡片 ──────────
function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const [expanded, setExpanded] = useState(false)

  let warnings: string[] = []
  try { warnings = item.verifyWarnings ? JSON.parse(item.verifyWarnings) : [] } catch { /* ignore */ }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      layout
    >
      <GlowingCard containerClassName="h-full">
        <div className="p-4 flex flex-col h-full">
          {/* 顶部：来源 + 时间 + 验证 */}
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-gradient-to-r from-slate-800 to-slate-800/60 text-slate-400 border border-slate-700/40 font-medium">
              {SOURCE_CONFIG[item.source]?.icon || '🌐'} {item.source}
            </span>
            <VerifyBadge verified={item.verified} confidence={item.verifyConfidence} />
            {item.publishedAt && (
              <span className="text-[10px] text-slate-600 ml-auto">
                {new Date(item.publishedAt).toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>

          {/* 标题 */}
          <h3 className="text-sm font-bold text-slate-100 leading-snug mb-2 line-clamp-2 group-hover:text-cyan-300 transition-colors">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors">
                {item.title}
              </a>
            ) : item.title}
          </h3>

          {/* 摘要 */}
          {item.summary && (
            <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-3">
              {item.summary}
            </p>
          )}

          <div className="mt-auto space-y-2">
            {/* 热度条 */}
            <HotnessMeter value={item.hotness} />

            {/* 展开详情 */}
            {(item.content || warnings.length > 0) && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-[10px] text-cyan-500/60 hover:text-cyan-400 transition-colors flex items-center gap-1"
              >
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-block">
                  ▼
                </motion.span>
                {expanded ? '收起详情' : '展开详情'}
              </button>
            )}
          </div>

          {/* 展开内容 */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <div className="border-t border-slate-800/60 pt-3 mt-3 space-y-2">
                  {item.content && (
                    <p className="text-xs text-slate-500 leading-relaxed">{item.content}</p>
                  )}
                  {warnings.length > 0 && (
                    <div className="space-y-1">
                      {warnings.map((w, i) => (
                        <p key={i} className="text-[10px] text-amber-400/80 flex items-start gap-1.5">
                          <span className="mt-0.5">⚠</span>{w}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlowingCard>
    </motion.div>
  )
}

// ────────── 骨架屏 ──────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-slate-800/40 bg-slate-900/30 p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-3">
        <div className="h-4 bg-slate-800 rounded w-16" />
        <div className="h-4 bg-slate-800 rounded w-12" />
      </div>
      <div className="h-4 bg-slate-800 rounded w-full mb-2" />
      <div className="h-4 bg-slate-800 rounded w-4/5 mb-3" />
      <div className="h-3 bg-slate-800 rounded w-full mb-1" />
      <div className="h-3 bg-slate-800 rounded w-2/3 mb-3" />
      <div className="h-1.5 bg-slate-800 rounded w-full" />
    </div>
  )
}

// ────────── 主页面 ──────────
export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [stats, setStats] = useState<NewsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [source, setSource] = useState('all')
  const [search, setSearch] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('hotness')
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try {
      const saved = localStorage.getItem('hotpulse_favorites')
      return saved ? new Set(JSON.parse(saved)) : new Set()
    } catch { return new Set() }
  })
  const [showFavOnly, setShowFavOnly] = useState(false)

  // 持久化收藏
  useEffect(() => {
    localStorage.setItem('hotpulse_favorites', JSON.stringify([...favorites]))
  }, [favorites])

  const toggleFavorite = (id: number) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 加载数据
  const loadNews = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {}
      if (source !== 'all') params.source = source
      if (search.trim()) params.keyword = search.trim()
      const result = await fetchNews(params)
      setNews(result.data)
    } catch {
      console.error('Failed to load news')
    } finally {
      setLoading(false)
    }
  }, [source, search])

  const loadStats = useCallback(async () => {
    try {
      const data = await fetchNewsStats()
      setStats(data)
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    setLoading(true)
    loadNews()
  }, [loadNews])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  // 手动刷新采集
  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshNews()
      // 采集是异步的，给一点延迟后刷新列表
      setTimeout(async () => {
        await loadNews()
        await loadStats()
        setRefreshing(false)
      }, 3000)
    } catch {
      setRefreshing(false)
    }
  }

  // 排序 + 筛选
  const filteredNews = useMemo(() => {
    let list = [...news]
    if (showFavOnly) {
      list = list.filter(n => favorites.has(n.id))
    }
    switch (sortMode) {
      case 'hotness':
        list.sort((a, b) => b.hotness - a.hotness)
        break
      case 'latest':
        list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        break
      case 'verified':
        list.sort((a, b) => (b.verified === 1 ? 1 : 0) - (a.verified === 1 ? 1 : 0) || b.hotness - a.hotness)
        break
    }
    return list
  }, [news, sortMode, showFavOnly, favorites])

  // 可用数据源列表
  const activeSources = useMemo(() => {
    const sources = new Set(news.map(n => n.source))
    return ['all', ...Array.from(sources)]
  }, [news])

  return (
    <div className="space-y-6">
      {/* ── 统计 BentoGrid ── */}
      <BentoGrid>
        <BentoGridItem
          icon="📊"
          value={stats?.total ?? '—'}
          title="总热点数"
          description="已采集新闻条目"
        />
        <BentoGridItem
          icon="📡"
          value={stats?.sources ? Object.keys(stats.sources).length : '—'}
          title="活跃源"
          description="正在采集的数据源"
        />
        <BentoGridItem
          icon="🔥"
          value={stats?.avgHotness ? Math.round(stats.avgHotness) : '—'}
          title="平均热度"
          description="综合热度评分"
        />
        <BentoGridItem
          icon="⭐"
          value={favorites.size}
          title="我的收藏"
          description="已标记的热点"
        />
      </BentoGrid>

      {/* ── 搜索 + 排序 + 刷新 ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        {/* 搜索框 */}
        <div className="flex-1 relative group w-full">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">🔍</div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索热点新闻..."
            className="relative w-full bg-slate-900/60 border border-slate-800/60 rounded-xl pl-9 pr-4 py-2.5 text-sm
              text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40
              focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
        </div>

        {/* 排序按钮组 */}
        <div className="flex items-center gap-1 bg-slate-900/60 border border-slate-800/60 rounded-xl p-1">
          {([
            { key: 'hotness', label: '🔥 热度', },
            { key: 'latest', label: '🕐 最新', },
            { key: 'verified', label: '✓ 已验证', },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortMode(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all",
                sortMode === key
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 border border-transparent'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* 收藏筛选 */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowFavOnly(!showFavOnly)}
          className={cn(
            "px-3 py-2 rounded-xl text-[11px] font-medium border transition-all",
            showFavOnly
              ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
              : 'bg-slate-900/60 text-slate-500 border-slate-800/60 hover:text-slate-300'
          )}
        >
          {showFavOnly ? '⭐ 仅收藏' : '☆ 收藏'}
        </motion.button>

        {/* 刷新按钮 */}
        <ShimmerButton
          onClick={handleRefresh}
          disabled={refreshing}
        >
          {refreshing ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              采集中
            </span>
          ) : '🔄 采集热点'}
        </ShimmerButton>
      </div>

      {/* ── 数据源筛选 ── */}
      <div className="flex flex-wrap gap-2">
        {activeSources.map((s) => {
          const cfg = SOURCE_CONFIG[s] || { label: s, icon: '🌐', color: 'slate', gradient: 'from-slate-500/10' }
          const isActive = source === s
          return (
            <motion.button
              key={s}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSource(s)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-300",
                isActive
                  ? `bg-gradient-to-r ${cfg.gradient} border-${cfg.color}-500/30 text-slate-100 shadow-lg shadow-${cfg.color}-500/10`
                  : 'border-slate-800/40 text-slate-500 hover:text-slate-300 hover:border-slate-700/60 bg-slate-900/40'
              )}
            >
              <span>{cfg.icon}</span>
              <span>{cfg.label}</span>
              {isActive && stats?.sources && s !== 'all' && (
                <span className="text-[9px] opacity-60">
                  ({stats.sources[s] || 0})
                </span>
              )}
            </motion.button>
          )
        })}
      </div>

      {/* ── 新闻列表 ── */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : filteredNews.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-20 relative"
        >
          <div className="relative overflow-hidden rounded-2xl border border-slate-800/40 bg-slate-900/30 p-12">
            <Meteors number={8} />
            <div className="relative z-10">
              <div className="text-5xl mb-4 opacity-40">📡</div>
              <p className="text-lg text-slate-400 mb-2">
                {showFavOnly ? '暂无收藏的热点' : '暂无热点数据'}
              </p>
              <p className="text-sm text-slate-600 mb-6">
                {showFavOnly ? '点击新闻卡片上的 ⭐ 来收藏感兴趣的热点' : '点击"采集热点"获取最新新闻，或稍后自动采集'}
              </p>
              {!showFavOnly && (
                <ShimmerButton onClick={handleRefresh} disabled={refreshing}>
                  {refreshing ? '采集中...' : '🚀 立即采集'}
                </ShimmerButton>
              )}
            </div>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredNews.map((item, index) => (
              <div key={item.id} className="relative group">
                <NewsCard item={item} index={index} />
                {/* 收藏按钮（浮动） */}
                <motion.button
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => toggleFavorite(item.id)}
                  className={cn(
                    "absolute top-3 right-3 z-20 w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                    favorites.has(item.id)
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-slate-800/60 text-slate-600 border border-slate-700/40 opacity-0 group-hover:opacity-100'
                  )}
                >
                  {favorites.has(item.id) ? '⭐' : '☆'}
                </motion.button>
              </div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── 加载更多提示 ── */}
      {filteredNews.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4"
        >
          <p className="text-xs text-slate-600">
            显示 {filteredNews.length} 条热点 · 共 {stats?.total ?? news.length} 条
          </p>
        </motion.div>
      )}
    </div>
  )
}
