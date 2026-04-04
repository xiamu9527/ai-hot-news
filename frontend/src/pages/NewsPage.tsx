import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Keyword, NewsItem, NewsStats } from '@/types'
import { fetchKeywords, fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'
import { cn } from '@/lib/utils'
import { GlowingCard } from '@/components/ui/glowing-card'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { Meteors } from '@/components/ui/meteors'
import { TextGenerateEffect } from '@/components/ui/text-generate-effect'
import { BackgroundGradient } from '@/components/ui/background-gradient'

// ────────── 数据源配置 ──────────
const SOURCE_CONFIG: Record<string, { label: string; icon: string; color: string; gradient: string }> = {
  all:         { label: '全部',        icon: '🌐', color: 'cyan',   gradient: 'from-cyan-500/20 to-blue-500/10' },
  HackerNews:  { label: 'HackerNews',  icon: '🟠', color: 'orange', gradient: 'from-orange-500/20 to-amber-500/10' },
  Bing:        { label: 'Bing',        icon: '🔵', color: 'blue',   gradient: 'from-blue-500/20 to-sky-500/10' },
  Google:      { label: 'Google',      icon: '🔴', color: 'red',    gradient: 'from-red-500/20 to-rose-500/10' },
  DuckDuckGo:  { label: 'DuckDuckGo',  icon: '🦆', color: 'green',  gradient: 'from-green-500/20 to-emerald-500/10' },
  Twitter:     { label: 'Twitter',     icon: '🐦', color: 'sky',    gradient: 'from-sky-500/20 to-blue-400/10' },
  微博:        { label: '微博',        icon: '📱', color: 'rose',   gradient: 'from-rose-500/20 to-pink-500/10' },
  搜狗:        { label: '搜狗',        icon: '🔍', color: 'purple', gradient: 'from-purple-500/20 to-violet-500/10' },
}

type SortMode = 'hotness' | 'latest' | 'verified'

type ImportanceLevel = 'all' | 'urgent' | 'high' | 'medium' | 'low'
type TimeRange = 'all' | '1h' | '6h' | '24h' | '7d'
type AdvancedSortMode = 'hotness' | 'relevance' | 'published' | 'discovered' | 'importance'

type ParsedAiAnalysis = {
  reasoning?: string
  category?: string
  importance?: string
  score?: number
}

const IMPORTANCE_LABELS: Record<Exclude<ImportanceLevel, 'all'>, string> = {
  urgent: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

const TIME_RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: 'all', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: '6h', label: '最近 6 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
]

const SORT_OPTIONS: Array<{ key: AdvancedSortMode; label: string }> = [
  { key: 'hotness', label: '🔥 热度综合' },
  { key: 'relevance', label: '🎯 相关性' },
  { key: 'published', label: '📰 最新发布' },
  { key: 'discovered', label: '🕵 最新发现' },
  { key: 'importance', label: '🚨 重要程度' },
]

function parseAiAnalysis(item: NewsItem): ParsedAiAnalysis {
  try {
    return item.aiAnalysis ? JSON.parse(item.aiAnalysis) as ParsedAiAnalysis : {}
  } catch {
    return {}
  }
}

function normalizeImportance(raw?: string): Exclude<ImportanceLevel, 'all'> | null {
  if (!raw) return null
  const normalized = raw.trim().toLowerCase()
  if (normalized === 'urgent' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized
  }
  return null
}

function deriveImportance(item: NewsItem & { isMatch?: number }): Exclude<ImportanceLevel, 'all'> {
  const parsed = parseAiAnalysis(item)
  const explicitImportance = normalizeImportance(parsed.importance)
  if (explicitImportance) return explicitImportance

  const weightedHotness = item.hotness + ((item as any).isMatch === 1 ? 8 : 0) + (item.verified === 1 ? 4 : 0)
  if (weightedHotness >= 90) return 'urgent'
  if (weightedHotness >= 72) return 'high'
  if (weightedHotness >= 45) return 'medium'
  return 'low'
}

function getImportanceWeight(level: Exclude<ImportanceLevel, 'all'>): number {
  switch (level) {
    case 'urgent': return 4
    case 'high': return 3
    case 'medium': return 2
    case 'low': return 1
  }
}

function getPublishedTimestamp(item: NewsItem): number {
  return new Date(item.publishedAt || item.createdAt).getTime()
}

function getDiscoveredTimestamp(item: NewsItem): number {
  return new Date(item.createdAt).getTime()
}

function isWithinTimeRange(item: NewsItem, range: TimeRange): boolean {
  if (range === 'all') return true

  const timestamp = getDiscoveredTimestamp(item)
  const now = Date.now()
  const limits: Record<Exclude<TimeRange, 'all'>, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }

  return now - timestamp <= limits[range]
}

function getRelevanceScore(item: NewsItem & { isMatch?: number }, keywordTerm: string): number {
  const base = ((item as any).isMatch === 1 ? 80 : 0) + (item.verified === 1 ? 12 : 0) + item.hotness * 0.25
  const term = keywordTerm.trim().toLowerCase()
  if (!term) return base

  const parsed = parseAiAnalysis(item)
  const fields = [item.title, item.summary, item.content, parsed.reasoning || '']
  const weights = [50, 28, 12, 20]

  return fields.reduce((score, field, index) => {
    const normalizedField = field.toLowerCase()
    if (!normalizedField.includes(term)) return score
    if (index === 0 && normalizedField.startsWith(term)) return score + weights[index] + 8
    return score + weights[index]
  }, base)
}

function getRelationReason(item: NewsItem): string {
  const parsed = parseAiAnalysis(item)
  if (parsed.reasoning?.trim()) return parsed.reasoning.trim()
  if (parsed.category?.trim()) return `关联分类：${parsed.category.trim()}`

  return item.summary?.trim() || '暂无关联原因'
}

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
  if (verified === null) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-slate-700/30 text-slate-300 border border-slate-600/30">
        ⏳ 待验证
      </span>
    )
  }
  if (verified === 1) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        ✓ 已验证{confidence > 0 && ` · 置信度 ${Math.round(confidence * 100)}%`}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
      ⚠ 可疑{confidence > 0 && ` · 置信度 ${Math.round(confidence * 100)}%`}
    </span>
  )
}

// ────────── 新闻卡片 ──────────
function NewsCard({ item, index }: { item: NewsItem & { isMatch?: number }; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const relationReason = getRelationReason(item)
  const importanceLevel = deriveImportance(item)

  let warnings: string[] = []
  try { warnings = item.verifyWarnings ? JSON.parse(item.verifyWarnings) : [] } catch { /* ignore */ }

  const cardContent = (
    <GlowingCard containerClassName="h-full">
      <div className="p-4 flex flex-col h-full relative">
        {/* 顶部：来源 + 时间 + 验证 */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          {item.isMatch === 1 && (
            <span className="bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg shadow-pink-500/40 animate-pulse flex-shrink-0">
              🎯 命中
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-gradient-to-r from-slate-800 to-slate-800/60 text-slate-400 border border-slate-700/40 font-medium">
              {SOURCE_CONFIG[item.source]?.icon || '🌐'} {item.source}
            </span>
            <span className={cn(
              'text-[10px] px-2 py-0.5 rounded-md border font-medium',
              importanceLevel === 'urgent' && 'border-red-500/30 bg-red-500/10 text-red-300',
              importanceLevel === 'high' && 'border-orange-500/30 bg-orange-500/10 text-orange-300',
              importanceLevel === 'medium' && 'border-amber-500/30 bg-amber-500/10 text-amber-300',
              importanceLevel === 'low' && 'border-slate-700/40 bg-slate-800/60 text-slate-400',
            )}>
              {IMPORTANCE_LABELS[importanceLevel]}
            </span>
            <VerifyBadge verified={item.verified} confidence={item.verifyConfidence} />
            {item.publishedAt && (
              <span className="text-[10px] text-slate-600 ml-auto mr-8">
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

          <div className="mb-3 rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                关联原因
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-400/30 to-transparent" />
            </div>
            <p className="text-xs text-slate-300/90 leading-relaxed line-clamp-3">
              {relationReason}
            </p>
          </div>

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
                  {item.summary && item.summary.trim() && item.summary.trim() !== relationReason && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-1">原始摘要</p>
                      <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>
                    </div>
                  )}
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
  )

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.97 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      className="break-inside-avoid"
    >
      {item.isMatch === 1 || item.hotness >= 95 ? (
        <BackgroundGradient className="rounded-[22px] overflow-hidden" containerClassName="w-full">
          {cardContent}
        </BackgroundGradient>
      ) : (
        cardContent
      )}
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
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [stats, setStats] = useState<NewsStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [source, setSource] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedKeywordId, setSelectedKeywordId] = useState<string>('all')
  const [importance, setImportance] = useState<ImportanceLevel>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [sortMode, setSortMode] = useState<AdvancedSortMode>('hotness')
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

  const loadKeywords = useCallback(async () => {
    try {
      const result = await fetchKeywords()
      setKeywords(result.keywords)
    } catch {
      console.error('Failed to load keywords')
    }
  }, [])

  // 加载数据
  const loadNews = useCallback(async () => {
    try {
      const params: Record<string, string | number> = {}
      if (source !== 'all') params.source = source
      if (search.trim()) params.keyword = search.trim()
      if (selectedKeywordId !== 'all') params.keywordId = Number(selectedKeywordId)
      const result = await fetchNews(params)
      setNews(result.data)
    } catch {
      console.error('Failed to load news')
    } finally {
      setLoading(false)
    }
  }, [search, selectedKeywordId, source])

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

  useEffect(() => {
    loadKeywords()
  }, [loadKeywords])

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

  const selectedKeyword = useMemo(
    () => keywords.find((item) => String(item.id) === selectedKeywordId) ?? null,
    [keywords, selectedKeywordId]
  )

  const activeFilterCount = [
    source !== 'all',
    selectedKeywordId !== 'all',
    importance !== 'all',
    timeRange !== 'all',
    search.trim().length > 0,
    showFavOnly,
  ].filter(Boolean).length

  // 排序 + 筛选
  const filteredNews = useMemo(() => {
    let list = [...news]

    if (showFavOnly) {
      list = list.filter(n => favorites.has(n.id))
    }

    if (importance !== 'all') {
      list = list.filter((item) => deriveImportance(item as NewsItem & { isMatch?: number }) === importance)
    }

    if (timeRange !== 'all') {
      list = list.filter((item) => isWithinTimeRange(item, timeRange))
    }

    const relevanceTerm = search.trim() || selectedKeyword?.keyword || ''

    switch (sortMode) {
      case 'hotness':
        list.sort((a, b) => {
          const aMatch = (a as any).isMatch === 1 ? 1 : 0
          const bMatch = (b as any).isMatch === 1 ? 1 : 0
          if (aMatch !== bMatch) return bMatch - aMatch
          const hotnessA = a.hotness + (a.verified === 1 ? 6 : 0) + Math.max(0, 72 - (Date.now() - getDiscoveredTimestamp(a)) / (1000 * 60 * 60)) * 0.08
          const hotnessB = b.hotness + (b.verified === 1 ? 6 : 0) + Math.max(0, 72 - (Date.now() - getDiscoveredTimestamp(b)) / (1000 * 60 * 60)) * 0.08
          return hotnessB - hotnessA
        })
        break
      case 'relevance':
        list.sort((a, b) => {
          return getRelevanceScore(b as NewsItem & { isMatch?: number }, relevanceTerm) - getRelevanceScore(a as NewsItem & { isMatch?: number }, relevanceTerm)
        })
        break
      case 'published':
        list.sort((a, b) => {
          return getPublishedTimestamp(b) - getPublishedTimestamp(a)
        })
        break
      case 'discovered':
        list.sort((a, b) => getDiscoveredTimestamp(b) - getDiscoveredTimestamp(a))
        break
      case 'importance':
        list.sort((a, b) => {
          const importanceDiff = getImportanceWeight(deriveImportance(b as NewsItem & { isMatch?: number })) - getImportanceWeight(deriveImportance(a as NewsItem & { isMatch?: number }))
          if (importanceDiff !== 0) return importanceDiff
          return b.hotness - a.hotness
        })
        break
    }

    return list
  }, [favorites, importance, keywords, news, search, selectedKeyword, showFavOnly, sortMode, timeRange])

  // 可用数据源列表
  const activeSources = useMemo(() => {
    const sources = new Set(news.map(n => n.source))
    return ['all', ...Array.from(sources)]
  }, [news])

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <TextGenerateEffect
          words="全网热点实时追踪，一手掌握最全资讯"
          className="text-2xl md:text-3xl text-slate-200"
        />
      </div>

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

      {/* ── 搜索 + 刷新 ── */}
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

      {/* ── 高级筛选 ── */}
      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/40 p-4 backdrop-blur-sm">
        <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-200">筛选维度</p>
            <p className="text-xs text-slate-500">按来源、重要性、监控关键词和时间范围组合过滤信息流</p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-800/60 bg-slate-950/40 px-3 py-1 text-[11px] text-slate-400">
            <span>当前激活 {activeFilterCount} 项筛选</span>
            {activeFilterCount > 0 && (
              <button
                onClick={() => {
                  setSource('all')
                  setSelectedKeywordId('all')
                  setImportance('all')
                  setTimeRange('all')
                  setSearch('')
                  setShowFavOnly(false)
                }}
                className="text-cyan-400 transition-colors hover:text-cyan-300"
              >
                清空
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">重要性</span>
            <select
              value={importance}
              onChange={(event) => setImportance(event.target.value as ImportanceLevel)}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none transition-all focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
            >
              <option value="all">全部级别</option>
              <option value="urgent">urgent / 紧急</option>
              <option value="high">high / 高</option>
              <option value="medium">medium / 中</option>
              <option value="low">low / 低</option>
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">关键词</span>
            <select
              value={selectedKeywordId}
              onChange={(event) => setSelectedKeywordId(event.target.value)}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none transition-all focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
            >
              <option value="all">全部监控关键词</option>
              {keywords.map((keyword) => (
                <option key={keyword.id} value={String(keyword.id)}>
                  {keyword.keyword}{keyword.scope ? ` · ${keyword.scope}` : ''}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">时间范围</span>
            <select
              value={timeRange}
              onChange={(event) => setTimeRange(event.target.value as TimeRange)}
              className="w-full rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none transition-all focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
            >
              {TIME_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ── 排序方式 ── */}
      <div className="rounded-2xl border border-slate-800/50 bg-slate-900/30 p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-200">排序方式</p>
            <p className="text-xs text-slate-500">支持热度综合、相关性、最新发布、最新发现和重要程度排序</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setSortMode(key)}
              className={cn(
                'rounded-full border px-3 py-2 text-xs font-medium transition-all',
                sortMode === key
                  ? 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300 shadow-lg shadow-cyan-500/10'
                  : 'border-slate-800/60 bg-slate-950/40 text-slate-500 hover:border-slate-700/60 hover:text-slate-300'
              )}
            >
              {label}
            </button>
          ))}
        </div>
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
        <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
          <AnimatePresence mode="popLayout">
            {filteredNews.map((item, index) => (
              <div 
                key={item.id} 
                className="relative group mb-4 block w-full break-inside-avoid"
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <AnimatePresence>
                  {hoveredIndex === index && (
                    <motion.span
                      className="absolute inset-0 w-full bg-cyan-500/[0.08] block rounded-2xl -z-10"
                      layoutId="hoverBackground"
                      initial={{ opacity: 0 }}
                      animate={{
                        opacity: 1,
                        transition: { duration: 0.15 },
                      }}
                      exit={{
                        opacity: 0,
                        transition: { duration: 0.15, delay: 0.2 },
                      }}
                    />
                  )}
                </AnimatePresence>
                <NewsCard item={item} index={index} />
                {/* 收藏按钮（浮动） */}
                <motion.button
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => toggleFavorite(item.id)}
                  className={cn(
                    "absolute top-5 right-5 z-20 w-7 h-7 rounded-lg flex items-center justify-center transition-all",
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

