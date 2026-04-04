import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Keyword, NewsItem, NewsStats } from '@/types'
import { fetchKeywords, fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'
import { cn } from '@/lib/utils'
import { GlowingCard } from '@/components/ui/glowing-card'
import { BentoGrid, BentoGridItem } from '@/components/ui/bento-grid'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { Meteors } from '@/components/ui/meteors'
import { BackgroundGradient } from '@/components/ui/background-gradient'
import { AnimatedTabs } from '@/components/ui/animated-tabs'
import { HoverEffect } from '@/components/ui/card-hover-effect'

// ────────── 数据源配置 ──────────
const SOURCE_CONFIG: Record<string, { label: string; icon: string; color: string; gradient: string }> = {
  all:         { label: '全部',        icon: '', color: 'cyan',   gradient: 'from-cyan-500/20 to-blue-500/10' },
  HackerNews:  { label: 'HackerNews',  icon: '', color: 'orange', gradient: 'from-orange-500/20 to-amber-500/10' },
  Bing:        { label: 'Bing',        icon: '', color: 'blue',   gradient: 'from-blue-500/20 to-sky-500/10' },
  Google:      { label: 'Google',      icon: '', color: 'red',    gradient: 'from-red-500/20 to-rose-500/10' },
  DuckDuckGo:  { label: 'DuckDuckGo',  icon: '', color: 'green',  gradient: 'from-green-500/20 to-emerald-500/10' },
  Twitter:     { label: 'Twitter',     icon: '', color: 'sky',    gradient: 'from-sky-500/20 to-blue-400/10' },
  微博:        { label: '微博',        icon: '', color: 'rose',   gradient: 'from-rose-500/20 to-pink-500/10' },
  搜狗:        { label: '搜狗',        icon: '', color: 'purple', gradient: 'from-purple-500/20 to-violet-500/10' },
}

type ImportanceLevel = 'all' | 'urgent' | 'high' | 'medium' | 'low'
type TimeRange = 'all' | '1h' | '6h' | '24h' | '7d'
type AdvancedSortMode = 'hotness' | 'relevance' | 'published' | 'discovered' | 'importance'
type NewsSubPage = 'overview' | 'explore'

type ParsedAiAnalysis = {
  reasoning?: string
  category?: string
  importance?: string
  score?: number
}

type EnrichedNewsItem = NewsItem & { isMatch?: number }

type TopicSignalCard = {
  item: EnrichedNewsItem
  title: string
  description: string
  tone: string
}

type TopicCluster = {
  key: string
  title: string
  count: number
  avgHotness: number
  verifiedCount: number
  uniqueSources: number
  leadTitles: string[]
}

type TrendStat = {
  title: string
  value: string | number
  description: string
  icon: string
  deltaLabel: string
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
  { key: 'hotness', label: '热度综合' },
  { key: 'relevance', label: '相关性' },
  { key: 'published', label: '最新发布' },
  { key: 'discovered', label: '最新发现' },
  { key: 'importance', label: '重要程度' },
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

function formatRelativeTime(item: NewsItem): string {
  const timestamp = getPublishedTimestamp(item)
  const diff = Date.now() - timestamp

  if (diff < 60 * 60 * 1000) {
    return `${Math.max(1, Math.round(diff / (60 * 1000)))} 分钟前`
  }
  if (diff < 24 * 60 * 60 * 1000) {
    return `${Math.max(1, Math.round(diff / (60 * 60 * 1000)))} 小时前`
  }
  return `${Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)))} 天前`
}

function getHotnessBand(hotness: number): string {
  if (hotness >= 90) return '头号爆点'
  if (hotness >= 70) return '高热上升'
  if (hotness >= 45) return '持续关注'
  return '普通信号'
}

function getSourceCount(stats: NewsStats | null, sourceKey: string): number {
  if (!stats) return 0
  return stats.sources[sourceKey] || 0
}

function getInsightLine(item: NewsItem, maxLength = 38): string {
  const base = getRelationReason(item).replace(/\s+/g, ' ').trim()
  if (base.length <= maxLength) return base
  return `${base.slice(0, Math.max(10, maxLength - 1))}…`
}

function getVerifyWarnings(item: NewsItem): string[] {
  try {
    return item.verifyWarnings ? JSON.parse(item.verifyWarnings) : []
  } catch {
    return []
  }
}

function hasOriginalSummary(item: NewsItem, relationReason: string): boolean {
  return Boolean(item.summary?.trim() && item.summary.trim() !== relationReason)
}

function hasExpandableDetails(item: NewsItem, relationReason: string): boolean {
  return Boolean(item.content?.trim() || getVerifyWarnings(item).length > 0 || hasOriginalSummary(item, relationReason))
}

function getSignalLabel(item: EnrichedNewsItem): { text: string; tone: string } {
  if (item.isMatch === 1 && item.verified === 1) {
    return { text: '关键词强命中', tone: 'fuchsia' }
  }
  if (item.hotness >= 75 && item.verified === 1) {
    return { text: '已验证热点', tone: 'emerald' }
  }
  if (item.hotness >= 75 && item.verified !== 1) {
    return { text: '高热低信', tone: 'amber' }
  }
  if (item.verified === null) {
    return { text: '待核实热点', tone: 'slate' }
  }
  return { text: '持续观察', tone: 'sky' }
}

function getSignalToneClass(tone: string): string {
  switch (tone) {
    case 'fuchsia':
      return 'border-fuchsia-400/30 bg-fuchsia-500/10 text-fuchsia-100'
    case 'emerald':
      return 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'
    case 'amber':
      return 'border-amber-400/30 bg-amber-500/10 text-amber-100'
    case 'sky':
      return 'border-sky-400/30 bg-sky-500/10 text-sky-100'
    default:
      return 'border-slate-600/40 bg-slate-800/60 text-slate-200'
  }
}

function getImportanceToneClass(level: Exclude<ImportanceLevel, 'all'>): string {
  switch (level) {
    case 'urgent':
      return 'border-red-400/40 bg-gradient-to-r from-red-500/20 to-orange-500/10 text-red-100 shadow-lg shadow-red-500/20 animate-pulse'
    case 'high':
      return 'border-orange-400/35 bg-gradient-to-r from-orange-500/20 to-amber-500/10 text-orange-100'
    case 'medium':
      return 'border-cyan-400/30 bg-gradient-to-r from-cyan-500/15 to-blue-500/10 text-cyan-100'
    case 'low':
      return 'border-slate-600/35 bg-slate-800/60 text-slate-300'
  }
}

function getTopicLabel(item: EnrichedNewsItem): string {
  const parsed = parseAiAnalysis(item)
  if (parsed.category?.trim()) return parsed.category.trim()
  if (item.isMatch === 1) return '监控命中'
  return `${item.source} 动态`
}

function NewsCardDetails({ item, relationReason, warnings }: {
  item: NewsItem
  relationReason: string
  warnings: string[]
}) {
  return (
    <div className="border-t border-slate-800/60 pt-3 mt-3 space-y-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-1">完整洞察</p>
        <p className="text-xs text-slate-400 leading-relaxed">{relationReason}</p>
      </div>
      {hasOriginalSummary(item, relationReason) && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-1">原始摘要</p>
          <p className="text-xs text-slate-400 leading-relaxed">{item.summary}</p>
        </div>
      )}
      {item.content?.trim() && (
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500 mb-1">原始内容</p>
          <p className="text-xs text-slate-500 leading-relaxed">{item.content}</p>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="space-y-1">
          {warnings.map((warning, index) => (
            <p key={index} className="text-[10px] text-amber-400/80 flex items-start gap-1.5">
              <span className="mt-0.5 w-1 h-1 rounded-full bg-amber-400 inline-block" />{warning}
            </p>
          ))}
        </div>
      )}
    </div>
  )
}

function NewsHero({ item, queueCount, onToggleFavorite, isFavorite }: {
  item: EnrichedNewsItem
  queueCount: number
  onToggleFavorite: (id: number) => void
  isFavorite: boolean
}) {
  const importanceLevel = deriveImportance(item)
  const relationReason = getRelationReason(item)
  const signalLabel = getSignalLabel(item)

  return (
    <BackgroundGradient containerClassName="w-full" className="rounded-[28px] overflow-hidden bg-slate-950/90">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.85fr)] p-5 md:p-7">
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200">
              今日主热点
            </span>
            <span className={cn('rounded-full border px-3 py-1 text-[11px] font-medium', getSignalToneClass(signalLabel.tone))}>
              {signalLabel.text}
            </span>
            <span className={cn('rounded-full border px-3 py-1 text-[11px] font-medium', getImportanceToneClass(importanceLevel))}>
              {IMPORTANCE_LABELS[importanceLevel]}
            </span>
            <span className="rounded-full border border-slate-700/60 bg-slate-900/60 px-3 py-1 text-[11px] font-medium text-slate-300">
              {getHotnessBand(item.hotness)}
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700/60 bg-slate-900/60 px-2.5 py-1">
                {item.source}
              </span>
              <span>{formatRelativeTime(item)}</span>
              <span>待跟进热点 {queueCount} 条</span>
            </div>

            <h2 className="max-w-4xl text-2xl font-black leading-tight text-white md:text-4xl md:leading-[1.1]">
              {item.title}
            </h2>

            <p className="max-w-3xl text-sm leading-7 text-slate-300 md:text-base">
              {relationReason}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">热度评分</p>
              <p className="mt-2 text-3xl font-black text-white">{item.hotness}</p>
              <p className="mt-1 text-xs text-slate-400">当前主热点的综合强度</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">可信度</p>
              <p className="mt-2 text-xl font-bold text-white">{signalLabel.text}</p>
              <p className="mt-1 text-xs text-slate-400">{item.verifyConfidence > 0 ? `置信度 ${Math.round(item.verifyConfidence * 100)}%` : '等待进一步核验'}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
              <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">处置优先级</p>
              <p className="mt-2 text-xl font-bold text-white">{IMPORTANCE_LABELS[importanceLevel]}</p>
              <p className="mt-1 text-xs text-slate-400">{item.isMatch === 1 ? '已命中监控词，建议优先处理' : '适合纳入今日热点跟进列表'}</p>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 rounded-[26px] border border-white/10 bg-black/20 p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">处理建议</p>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/5 p-4">
                <p className="text-xs font-medium text-cyan-100">摘要判断</p>
                <p className="mt-2 text-sm leading-6 text-slate-300">{relationReason}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => onToggleFavorite(item.id)}
                  aria-label={isFavorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
                  className={cn(
                    'rounded-2xl border px-4 py-3 text-left text-sm transition-all',
                    isFavorite
                      ? 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                      : 'border-slate-700/60 bg-slate-900/70 text-slate-200 hover:border-slate-500/60'
                  )}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">关注列表</p>
                  <p className="mt-2 font-semibold">{isFavorite ? '已加入重点关注' : '加入重点关注'}</p>
                </button>
                <a
                  href={item.url || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-2xl border border-slate-700/60 bg-slate-900/70 px-4 py-3 text-left text-sm text-slate-200 transition-all hover:border-cyan-400/40"
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">来源原文</p>
                  <p className="mt-2 font-semibold">查看完整内容</p>
                </a>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-white">热点热度</p>
              <span className="text-[11px] text-slate-500">{SOURCE_CONFIG[item.source]?.label || item.source}</span>
            </div>
            <div className="mt-4">
              <HotnessMeter value={item.hotness} />
            </div>
          </div>
        </div>
      </div>
    </BackgroundGradient>
  )
}

function KeywordHitCard({ item, onToggleFavorite, isFavorite }: {
  item: EnrichedNewsItem
  onToggleFavorite: (id: number) => void
  isFavorite: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const importanceLevel = deriveImportance(item)
  const signalLabel = getSignalLabel(item)
  const relationReason = getRelationReason(item)
  const warnings = getVerifyWarnings(item)
  const canExpand = hasExpandableDetails(item, relationReason)

  return (
    <BackgroundGradient className="rounded-[22px] overflow-hidden" containerClassName="w-full">
      <GlowingCard containerClassName="h-full">
        <div className="p-4 flex flex-col h-full relative">
          <div className="flex items-center gap-2 mb-2.5 flex-wrap">
            <span className="bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg shadow-pink-500/40 animate-pulse flex-shrink-0">
              命中
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-md bg-gradient-to-r from-slate-800 to-slate-800/60 text-slate-400 border border-slate-700/40 font-medium">
              {item.source}
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-md border font-medium', getImportanceToneClass(importanceLevel))}>
              {IMPORTANCE_LABELS[importanceLevel]}
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-md border font-medium', getSignalToneClass(signalLabel.tone))}>
              {signalLabel.text}
            </span>
            <VerifyBadge verified={item.verified} confidence={item.verifyConfidence} />
            <button
              onClick={() => onToggleFavorite(item.id)}
              aria-label={isFavorite ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
              className={cn(
                'ml-auto rounded-xl border px-2.5 py-1 text-xs transition-all',
                isFavorite
                  ? 'border-amber-400/30 bg-amber-400/10 text-amber-200'
                  : 'border-slate-700/60 bg-slate-900/60 text-slate-400 hover:text-slate-200'
              )}
            >
              {isFavorite ? '已收藏' : '收藏'}
            </button>
          </div>

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
                AI 洞察
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-400/30 to-transparent" />
            </div>
            <p className="text-xs text-slate-300/90 leading-relaxed truncate">
              {getInsightLine(item)}
            </p>
          </div>

          <div className="mt-auto space-y-2">
            <HotnessMeter value={item.hotness} />

            <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{formatRelativeTime(item)}</span>
              <span>{item.verified === 1 ? '已验证' : item.verified === 0 ? '需谨慎' : '待验证'}</span>
            </div>

            {canExpand && (
              <button
                onClick={() => setExpanded((prev) => !prev)}
                aria-label={`${expanded ? '收起详情' : '展开详情'} ${item.title}`}
                className="text-[10px] text-cyan-500/60 hover:text-cyan-400 transition-colors flex items-center gap-1"
              >
                <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }} className="inline-block">
                  ▼
                </motion.span>
                {expanded ? '收起详情' : '展开详情'}
              </button>
            )}
          </div>

          <AnimatePresence>
            {expanded && canExpand && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="overflow-hidden"
              >
                <NewsCardDetails item={item} relationReason={relationReason} warnings={warnings} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlowingCard>
    </BackgroundGradient>
  )
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
        已验证{confidence > 0 && ` · 置信度 ${Math.round(confidence * 100)}%`}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 border border-red-500/20">
      可疑{confidence > 0 && ` · 置信度 ${Math.round(confidence * 100)}%`}
    </span>
  )
}

// ────────── 新闻卡片 ──────────
function NewsCard({ item, index }: { item: NewsItem & { isMatch?: number }; index: number }) {
  const [expanded, setExpanded] = useState(false)
  const relationReason = getRelationReason(item)
  const importanceLevel = deriveImportance(item)
  const signalLabel = getSignalLabel(item)
  const warnings = getVerifyWarnings(item)
  const canExpand = hasExpandableDetails(item, relationReason)

  const cardContent = (
    <GlowingCard containerClassName="h-full">
      <div className="p-4 flex flex-col h-full relative">
        {/* 顶部：来源 + 时间 + 验证 */}
        <div className="flex items-center gap-2 mb-2.5 flex-wrap">
          {item.isMatch === 1 && (
            <span className="bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow-lg shadow-pink-500/40 animate-pulse flex-shrink-0">
              命中
            </span>
          )}
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-gradient-to-r from-slate-800 to-slate-800/60 text-slate-400 border border-slate-700/40 font-medium">
              {item.source}
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-md border font-medium', getImportanceToneClass(importanceLevel))}>
              {IMPORTANCE_LABELS[importanceLevel]}
            </span>
            <span className={cn('text-[10px] px-2 py-0.5 rounded-md border font-medium', getSignalToneClass(signalLabel.tone))}>
              {signalLabel.text}
            </span>
            <VerifyBadge verified={item.verified} confidence={item.verifyConfidence} />
          </div>

          {/* 标题 + 发布时间 */}
          <div className="flex items-start gap-2 mb-2">
            <h3 className="text-sm font-bold text-slate-100 leading-snug line-clamp-2 group-hover:text-cyan-300 transition-colors flex-1">
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 transition-colors">
                  {item.title}
                </a>
              ) : item.title}
            </h3>
            <span className={cn(
              'flex-shrink-0 mt-0.5 text-[10px] px-1.5 py-0.5 rounded-md border whitespace-nowrap',
              item.publishedAt
                ? 'bg-sky-500/10 text-sky-400/80 border-sky-500/20'
                : 'bg-slate-800/60 text-slate-500 border-slate-700/30'
            )}>
              {(() => {
                const d = new Date(item.publishedAt || item.createdAt)
                const label = d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                return item.publishedAt ? label : `${label} 抓取`
              })()}
            </span>
          </div>

          <div className="mb-3 rounded-xl border border-cyan-500/10 bg-cyan-500/5 px-3 py-2">
            <div className="mb-1 flex items-center gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300/80">
                AI 洞察
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-cyan-400/30 to-transparent" />
            </div>
            <p className="text-xs text-slate-300/90 leading-relaxed truncate">
              {getInsightLine(item)}
            </p>
          </div>

          <div className="mt-auto space-y-2">
            {/* 热度条 */}
            <HotnessMeter value={item.hotness} />

            {/* 展开详情 */}
            {canExpand && (
              <button
                onClick={() => setExpanded(!expanded)}
                aria-label={`${expanded ? '收起详情' : '展开详情'} ${item.title}`}
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
                <NewsCardDetails item={item} relationReason={relationReason} warnings={warnings} />
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
  const [viewMode, setViewMode] = useState<'ranked' | 'topic'>('ranked')
  const [activeSubPage, setActiveSubPage] = useState<NewsSubPage>('overview')
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
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

    return list as EnrichedNewsItem[]
  }, [favorites, importance, keywords, news, search, selectedKeyword, showFavOnly, sortMode, timeRange])

  const heroItem = filteredNews[0] ?? null
  const nonHeroNews = heroItem ? filteredNews.filter((item) => item.id !== heroItem.id) : filteredNews
  const keywordHitItems = nonHeroNews.filter((item) => item.isMatch === 1).slice(0, 4)
  const keywordHitIds = new Set(keywordHitItems.map((item) => item.id))
  const quickSignalItems = nonHeroNews.filter((item) => item.isMatch !== 1).slice(0, 4)
  const quickSignalIds = new Set(quickSignalItems.map((item) => item.id))
  const remainingNews = nonHeroNews.filter((item) => !keywordHitIds.has(item.id) && !quickSignalIds.has(item.id))

  const highlightCards = useMemo(() => {
    return quickSignalItems.map((item) => ({
      title: item.title,
      description: `${getRelationReason(item).slice(0, 100)}${getRelationReason(item).length > 100 ? '...' : ''}`,
      badge: (
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2 py-1 text-[10px] text-slate-300">
            {SOURCE_CONFIG[item.source]?.icon || ''} {item.source}
          </span>
          <span className="rounded-full border border-cyan-500/20 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-200">
            热度 {item.hotness}
          </span>
        </div>
      ),
      footer: (
        <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>{formatRelativeTime(item)}</span>
          <span>{item.verified === 1 ? '已验证' : item.verified === 0 ? '需谨慎' : '待验证'}</span>
        </div>
      ),
    }))
  }, [quickSignalItems])

  const keywordSignalCards = useMemo<TopicSignalCard[]>(() => {
    return keywordHitItems.map((item) => ({
      item,
      title: item.title,
      description: getRelationReason(item),
      tone: item.verified === 1 ? '可信命中' : item.verified === 0 ? '风险命中' : '待验证命中',
    }))
  }, [keywordHitItems])

  const pulseIndicators = useMemo(() => {
    const trustedCount = filteredNews.filter((item) => item.verified === 1).length
    const urgentCount = filteredNews.filter((item) => deriveImportance(item) === 'urgent').length
    const matchCount = filteredNews.filter((item) => item.isMatch === 1).length

    return [
      {
        title: '高优先级热点',
        value: urgentCount,
        description: '适合第一时间进入跟进队列',
      },
      {
        title: '可信热点',
        value: trustedCount,
        description: '已通过 AI 真实性校验的条目',
      },
      {
        title: '关键词命中',
        value: matchCount,
        description: '直接落在监控词范围内的内容',
      },
    ]
  }, [filteredNews])

  const topicClusters = useMemo<TopicCluster[]>(() => {
    const bucket = new Map<string, EnrichedNewsItem[]>()

    for (const item of filteredNews) {
      const key = getTopicLabel(item)
      const group = bucket.get(key) || []
      group.push(item)
      bucket.set(key, group)
    }

    return Array.from(bucket.entries())
      .map(([key, items]) => ({
        key,
        title: key,
        count: items.length,
        avgHotness: Math.round(items.reduce((sum, item) => sum + item.hotness, 0) / items.length),
        verifiedCount: items.filter((item) => item.verified === 1).length,
        uniqueSources: new Set(items.map((item) => item.source)).size,
        leadTitles: items.slice(0, 3).map((item) => item.title),
      }))
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count
        return b.avgHotness - a.avgHotness
      })
  }, [filteredNews])

  const trendStats = useMemo<TrendStat[]>(() => {
    const now = Date.now()
    const currentWindowStart = now - 24 * 60 * 60 * 1000
    const previousWindowStart = now - 48 * 60 * 60 * 1000

    const currentWindow = filteredNews.filter((item) => getDiscoveredTimestamp(item) >= currentWindowStart)
    const previousWindow = filteredNews.filter((item) => {
      const timestamp = getDiscoveredTimestamp(item)
      return timestamp >= previousWindowStart && timestamp < currentWindowStart
    })

    const verifiedCount = filteredNews.filter((item) => item.verified === 1).length
    const verifiedRatio = filteredNews.length > 0 ? Math.round((verifiedCount / filteredNews.length) * 100) : 0
    const previousVerifiedRatio = previousWindow.length > 0
      ? Math.round((previousWindow.filter((item) => item.verified === 1).length / previousWindow.length) * 100)
      : 0

    const crossSourceResonance = topicClusters.filter((cluster) => cluster.uniqueSources >= 2).length
    const previousClusters = Array.from(new Set(previousWindow.map((item) => getTopicLabel(item as EnrichedNewsItem)))).length

    return [
      {
        title: '今日新增热点',
        value: currentWindow.length,
        description: '24 小时内进入系统的新热点',
        icon: '',
        deltaLabel: `${currentWindow.length - previousWindow.length >= 0 ? '+' : ''}${currentWindow.length - previousWindow.length} 较前一日`,
      },
      {
        title: '高置信热点占比',
        value: `${verifiedRatio}%`,
        description: '已验证热点在当前结果中的比例',
        icon: '',
        deltaLabel: `${verifiedRatio - previousVerifiedRatio >= 0 ? '+' : ''}${verifiedRatio - previousVerifiedRatio}%`,
      },
      {
        title: '关键词命中数',
        value: filteredNews.filter((item) => item.isMatch === 1).length,
        description: '直接命中监控词的热点数量',
        icon: '',
        deltaLabel: `${selectedKeyword ? `当前聚焦 ${selectedKeyword.keyword}` : '覆盖全部监控词'}`,
      },
      {
        title: '跨源共振话题数',
        value: crossSourceResonance,
        description: '至少被两个来源同时提及的专题簇',
        icon: '',
        deltaLabel: `${crossSourceResonance - previousClusters >= 0 ? '+' : ''}${crossSourceResonance - previousClusters} 变化`,
      },
    ]
  }, [filteredNews, selectedKeyword, topicClusters])

  // 可用数据源列表
  const activeSources = useMemo(() => {
    const sources = new Set(news.map(n => n.source))
    return ['all', ...Array.from(sources)]
  }, [news])

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200">
          实时监控
        </div>
        <h2 className="mt-4 text-2xl font-black text-slate-100 md:text-4xl">今日热点总览</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          聚焦最值得跟进的公共热点、监控命中和持续升温话题，帮助值班与运营团队先处理高优先级内容。
        </p>
      </div>

      <section className="rounded-[28px] border border-slate-800/60 bg-slate-950/70 p-3 backdrop-blur-xl">
        <div className="grid gap-3 md:grid-cols-2">
          <button
            onClick={() => setActiveSubPage('overview')}
            className={cn(
              'rounded-[24px] border p-4 text-left transition-all',
              activeSubPage === 'overview'
                ? 'border-cyan-500/30 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                : 'border-slate-800/60 bg-slate-900/50 hover:border-slate-700/60'
            )}
          >
            <p className="text-[11px] uppercase tracking-[0.26em] text-cyan-200/80">实时总览</p>
            <h3 className="mt-2 text-lg font-bold text-white">首页总览</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">用于快速判断今天最值得跟进的主热点、监控命中和上升信号。</p>
          </button>

          <button
            onClick={() => setActiveSubPage('explore')}
            className={cn(
              'rounded-[24px] border p-4 text-left transition-all',
              activeSubPage === 'explore'
                ? 'border-fuchsia-500/30 bg-fuchsia-500/10 shadow-lg shadow-fuchsia-500/10'
                : 'border-slate-800/60 bg-slate-900/50 hover:border-slate-700/60'
            )}
          >
            <p className="text-[11px] uppercase tracking-[0.26em] text-fuchsia-200/80">深度筛选</p>
            <h3 className="mt-2 text-lg font-bold text-white">热点探索</h3>
            <p className="mt-2 text-sm leading-6 text-slate-400">适合按来源、关键词、时间和重要性做进一步筛选与交叉比对。</p>
          </button>
        </div>
      </section>

      {activeSubPage === 'overview' && (
        <>
          <BentoGrid>
            {trendStats.map((item) => (
              <BentoGridItem
                key={item.title}
                icon={item.icon}
                value={item.value}
                title={item.title}
                description={`${item.description} · ${item.deltaLabel}`}
              />
            ))}
          </BentoGrid>

          {heroItem && (
            <section className="space-y-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">优先看板</p>
                  <h3 className="mt-2 text-xl font-bold text-white md:text-2xl">先处理最强信号，再把握全局走势</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {pulseIndicators.map((indicator) => (
                    <div key={indicator.title} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{indicator.title}</p>
                      <div className="mt-2 flex items-end gap-2">
                        <span className="text-2xl font-black text-white">{indicator.value}</span>
                        <span className="pb-1 text-[11px] text-slate-500">{indicator.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <NewsHero
                item={heroItem}
                queueCount={Math.max(0, filteredNews.length - 1)}
                onToggleFavorite={toggleFavorite}
                isFavorite={favorites.has(heroItem.id)}
              />

              {highlightCards.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-200">次级上升信号</p>
                      <p className="text-xs text-slate-500">补充展示仍在升温、但尚未进入主热点位的内容。</p>
                    </div>
                    <span className="text-xs text-slate-500">{highlightCards.length} 条候选</span>
                  </div>
                  <HoverEffect items={highlightCards} className="grid-cols-1 lg:grid-cols-4" />
                </div>
              )}
            </section>
          )}

          {keywordSignalCards.length > 0 && (
            <section className="space-y-4 rounded-[28px] border border-fuchsia-500/15 bg-[linear-gradient(180deg,rgba(91,33,182,0.18),rgba(2,6,23,0.15))] p-5 md:p-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-fuchsia-200/80">监控命中</p>
                  <h3 className="mt-2 text-xl font-bold text-white md:text-2xl">关键词命中专区</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    这些内容直接落在监控词范围内，适合优先确认影响面、风险级别和后续动作。
                  </p>
                </div>
                <div className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/10 px-4 py-3 text-right">
                  <p className="text-[11px] uppercase tracking-[0.2em] text-fuchsia-100/70">直接命中</p>
                  <p className="mt-1 text-3xl font-black text-white">{keywordSignalCards.length}</p>
                </div>
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {keywordSignalCards.map((signal) => (
                  <KeywordHitCard
                    key={signal.item.id}
                    item={signal.item}
                    onToggleFavorite={toggleFavorite}
                    isFavorite={favorites.has(signal.item.id)}
                  />
                ))}
              </div>
            </section>
          )}

          <section className="rounded-[28px] border border-slate-800/60 bg-slate-950/60 p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">深度查看</p>
                <h3 className="mt-2 text-xl font-bold text-white md:text-2xl">需要交叉筛选时进入热点探索</h3>
                <p className="mt-2 text-sm leading-6 text-slate-400">当你需要按来源、时间、关键词或重要性进一步缩小范围时，再进入探索页继续筛选。</p>
              </div>
              <ShimmerButton onClick={() => setActiveSubPage('explore')}>
                进入热点探索
              </ShimmerButton>
            </div>
          </section>
        </>
      )}

      {activeSubPage === 'explore' && (
      <>
      <section className="sticky top-[72px] z-20 space-y-3 rounded-[28px] border border-slate-800/60 bg-slate-950/80 p-4 backdrop-blur-xl">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex-1 relative group w-full">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm pointer-events-none">○</div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索热点、关键词或专题..."
              className="relative w-full rounded-xl border border-slate-800/60 bg-slate-900/60 py-2.5 pl-9 pr-4 text-sm text-slate-100 placeholder-slate-600 transition-all focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as AdvancedSortMode)}
              className="min-w-[150px] rounded-xl border border-slate-800/60 bg-slate-900/70 px-3 py-2.5 text-sm text-slate-200 outline-none transition-all focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20"
            >
              {SORT_OPTIONS.map(({ key, label }) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowFavOnly(!showFavOnly)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                showFavOnly
                  ? 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                  : 'border-slate-800/60 bg-slate-900/60 text-slate-400 hover:text-slate-200'
              )}
            >
              {showFavOnly ? '仅收藏' : '收藏'}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              className={cn(
                'rounded-xl border px-3 py-2.5 text-sm font-medium transition-all',
                showAdvancedFilters
                  ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-200'
                  : 'border-slate-800/60 bg-slate-900/60 text-slate-400 hover:text-slate-200'
              )}
            >
              {showAdvancedFilters ? '收起筛选' : `更多筛选${activeFilterCount > 0 ? ` · ${activeFilterCount}` : ''}`}
            </motion.button>

            <ShimmerButton onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full border-2 border-cyan-400/30 border-t-cyan-400 animate-spin" />
                  采集中
                </span>
              ) : '获取当天新闻'}
            </ShimmerButton>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
          {activeSources.map((s) => {
            const cfg = SOURCE_CONFIG[s] || { label: s, icon: '', color: 'slate', gradient: 'from-slate-500/10' }
            const isActive = source === s
            return (
              <motion.button
                key={s}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setSource(s)}
                aria-label={`筛选来源 ${s}`}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-300',
                  isActive
                    ? 'border-cyan-500/30 bg-cyan-500/12 text-slate-100 shadow-lg shadow-cyan-500/10'
                    : 'border-slate-800/40 bg-slate-900/40 text-slate-500 hover:border-slate-700/60 hover:text-slate-300'
                )}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                {s !== 'all' && (
                  <span className="text-[10px] opacity-60">{getSourceCount(stats, s)}</span>
                )}
              </motion.button>
            )
          })}
        </div>

        <AnimatePresence initial={false}>
          {showAdvancedFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-3 border-t border-slate-800/60 pt-3 lg:grid-cols-3">
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

              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-slate-800/60 bg-slate-950/50 px-4 py-3 text-[11px] text-slate-400">
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
                    清空全部
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

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
              <div className="w-8 h-8 rounded-full bg-slate-800/60 mb-4 opacity-40" />
              <p className="text-lg text-slate-400 mb-2">
                {showFavOnly ? '暂无收藏的热点' : '暂无热点数据'}
              </p>
              <p className="text-sm text-slate-600 mb-6">
                {showFavOnly ? '点击新闻卡片上的收藏按钮来收藏感兴趣的热点' : '点击"获取当天新闻"抓取最新内容，或等待自动采集'}
              </p>
              {!showFavOnly && (
                <ShimmerButton onClick={handleRefresh} disabled={refreshing}>
                  {refreshing ? '采集中...' : '获取当天新闻'}
                </ShimmerButton>
              )}
            </div>
          </div>
        </motion.div>
      ) : (
        <section className="space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">展示方式</p>
              <h3 className="mt-2 text-xl font-bold text-white md:text-2xl">榜单与专题双视图</h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">榜单视图用于快速扫盘，专题视图用于看热点如何聚成事件簇。</p>
            </div>
            <span className="text-xs text-slate-500">当前模式：{viewMode === 'ranked' ? '榜单视图' : '专题视图'}</span>
          </div>

          <AnimatedTabs
            tabs={[
              {
                title: '榜单视图',
                value: 'ranked',
                content: remainingNews.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="rounded-2xl border border-slate-800/40 bg-slate-900/30 p-8 text-center"
                  >
                    <p className="text-lg text-slate-300">当前筛选仅命中了首屏热点</p>
                    <p className="mt-2 text-sm text-slate-500">当前热点已经被主热点、次级信号和关键词专区完整吸收，继续切换筛选条件可以扩展结果面。</p>
                  </motion.div>
                ) : (
                  <section className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">全网动态</p>
                        <h3 className="mt-2 text-xl font-bold text-white md:text-2xl">全网热点流</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">这里展示未进入首屏重点区域的剩余热点，方便完整浏览当天的全网动态。</p>
                      </div>
                      <span className="text-xs text-slate-500">剩余 {remainingNews.length} 条</span>
                    </div>

                    <div className="columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
                      <AnimatePresence mode="popLayout">
                        {remainingNews.map((item, index) => (
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
                                  animate={{ opacity: 1, transition: { duration: 0.15 } }}
                                  exit={{ opacity: 0, transition: { duration: 0.15, delay: 0.2 } }}
                                />
                              )}
                            </AnimatePresence>
                            <NewsCard item={item} index={index} />
                            <motion.button
                              whileHover={{ scale: 1.2 }}
                              whileTap={{ scale: 0.85 }}
                              onClick={() => toggleFavorite(item.id)}
                              aria-label={favorites.has(item.id) ? `取消收藏 ${item.title}` : `收藏 ${item.title}`}
                              className={cn(
                                "absolute top-5 right-5 z-20 w-7 h-7 rounded-lg flex items-center justify-center transition-all",
                                favorites.has(item.id)
                                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                  : 'bg-slate-800/60 text-slate-600 border border-slate-700/40 opacity-0 group-hover:opacity-100'
                              )}
                            >
                              {favorites.has(item.id) ? '★' : '☆'}
                            </motion.button>
                          </div>
                        ))}
                      </AnimatePresence>
                    </div>
                  </section>
                ),
              },
              {
                title: '专题视图',
                value: 'topic',
                content: (
                  <section className="space-y-4">
                    <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">专题地图</p>
                        <h3 className="mt-2 text-xl font-bold text-white md:text-2xl">专题聚类视图</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-400">系统会按主题语义和监控命中关系聚合热点，帮助你快速判断事件簇的扩散程度。</p>
                      </div>
                      <span className="text-xs text-slate-500">共 {topicClusters.length} 个专题簇</span>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                      {topicClusters.map((cluster) => (
                        <BackgroundGradient key={cluster.key} containerClassName="w-full" className="rounded-[24px] overflow-hidden bg-slate-950/90">
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">专题簇</p>
                                <h4 className="mt-2 text-lg font-bold text-white">{cluster.title}</h4>
                              </div>
                              <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-right">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">数量</p>
                                <p className="mt-1 text-2xl font-black text-white">{cluster.count}</p>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-3">
                              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">平均热度</p>
                                <p className="mt-2 text-lg font-bold text-white">{cluster.avgHotness}</p>
                              </div>
                              <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-3">
                                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">已验证</p>
                                <p className="mt-2 text-lg font-bold text-white">{cluster.verifiedCount}</p>
                              </div>
                            </div>

                            <div className="mt-4 space-y-2">
                              {cluster.leadTitles.map((title) => (
                                <div key={title} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                                  {title}
                                </div>
                              ))}
                            </div>
                          </div>
                        </BackgroundGradient>
                      ))}
                    </div>
                  </section>
                ),
              },
            ]}
            onChange={(tab) => setViewMode(tab.value as 'ranked' | 'topic')}
            containerClassName="gap-2 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-2"
            tabClassName="min-w-[120px]"
            contentClassName="mt-5"
          />
        </section>
      )}

      {/* ── 加载更多提示 ── */}
      {filteredNews.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4"
        >
          <p className="text-xs text-slate-600">
            首屏展示 1 条主热点 + {quickSignalItems.length} 条次级信号 + {keywordHitItems.length} 条关键词命中 · 列表展示 {remainingNews.length} 条热点 · 共 {stats?.total ?? news.length} 条
          </p>
        </motion.div>
      )}
      </>
      )}
    </div>
  )
}

