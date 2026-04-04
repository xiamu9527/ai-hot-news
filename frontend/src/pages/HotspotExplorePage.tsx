import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import type { AiProgressEvent, NewsItem } from '@/types'
import { fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'
import { cn } from '@/lib/utils'
import { AnimatedTabs } from '@/components/ui/animated-tabs'
import { BackgroundGradient } from '@/components/ui/background-gradient'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import ComprehensiveReport from '@/components/news/ComprehensiveReport'
import NewsInsightCard from '@/components/news/NewsInsightCard'
import {
  IMPORTANCE_OPTIONS,
  SOURCE_CONFIG,
  TIME_RANGE_OPTIONS,
  deriveImportance,
  getTopicLabel,
  isWithinTimeRange,
  type ImportanceLevel,
  type TimeRange,
} from '@/components/news/news-helpers'

type ViewMode = 'ranked' | 'topic'

export default function HotspotExplorePage({
  refreshTick = 0,
  aiProgress = null,
}: {
  refreshTick?: number
  aiProgress?: AiProgressEvent | null
}) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [source, setSource] = useState('all')
  const [importance, setImportance] = useState<ImportanceLevel>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('ranked')
  const [stats, setStats] = useState<Record<string, number>>({})
  const hotspotProgress = aiProgress?.pipeline === 'hotspots' ? aiProgress : null

  const loadNews = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    try {
      const [newsResult, statsResult] = await Promise.all([
        fetchNews({
          matchMode: 'unmatched',
          source: source !== 'all' ? source : undefined,
          keyword: search.trim() || undefined,
          limit: 80,
        }),
        fetchNewsStats(),
      ])
      setNews(newsResult.data)
      setStats(statsResult.sources)
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [search, source])

  useEffect(() => {
    loadNews()
  }, [loadNews])

  useEffect(() => {
    if (refreshTick === 0) return
    loadNews({ silent: true })
  }, [refreshTick, loadNews])

  useEffect(() => {
    if (hotspotProgress?.stage === 'completed') {
      setRefreshing(false)
    }
  }, [hotspotProgress])

  const filteredNews = useMemo(() => {
    return [...news]
      .filter((item) => (importance === 'all' ? true : deriveImportance(item as NewsItem & { isMatch?: number }) === importance))
      .filter((item) => isWithinTimeRange(item, timeRange))
      .sort((left, right) => right.hotness - left.hotness)
  }, [importance, news, timeRange])

  const sourceSummary = useMemo(() => {
    const sourceMap = new Map<string, { count: number; avgHotness: number }>()
    for (const item of filteredNews) {
      const current = sourceMap.get(item.source) || { count: 0, avgHotness: 0 }
      current.count += 1
      current.avgHotness += item.hotness
      sourceMap.set(item.source, current)
    }

    return Array.from(sourceMap.entries()).map(([key, value]) => ({
      key,
      count: value.count,
      avgHotness: Math.round(value.avgHotness / value.count),
    }))
  }, [filteredNews])

  const topicClusters = useMemo(() => {
    const bucket = new Map<string, NewsItem[]>()
    for (const item of filteredNews) {
      const key = getTopicLabel(item as NewsItem & { isMatch?: number })
      const group = bucket.get(key) || []
      group.push(item)
      bucket.set(key, group)
    }

    return Array.from(bucket.entries())
      .map(([key, items]) => ({
        key,
        count: items.length,
        avgHotness: Math.round(items.reduce((sum, item) => sum + item.hotness, 0) / items.length),
        titles: items.slice(0, 3).map((item) => item.title),
      }))
      .sort((left, right) => right.avgHotness - left.avgHotness)
  }, [filteredNews])

  const sources = useMemo(() => ['all', ...Array.from(new Set(news.map((item) => item.source)))], [news])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshNews()
    } catch {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-cyan-200">
          热点探索
        </div>
        <h2 className="mt-4 text-2xl font-black text-slate-100 md:text-4xl">多源热点探索</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          聚焦各个数据源的热点汇总数据，适合查看当天的全网趋势、来源分布和主题聚类。
        </p>
      </div>

      <ComprehensiveReport mode="hotspots" items={filteredNews} suspended={Boolean(hotspotProgress && hotspotProgress.stage !== 'completed')} />

      {hotspotProgress && (
        <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/8 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-300/80">AI 处理进度</p>
              <p className="mt-2 text-sm text-slate-100">{hotspotProgress.message}</p>
              <p className="mt-1 text-xs text-slate-400">阶段：{hotspotProgress.stage}</p>
            </div>
            <div className="rounded-2xl border border-cyan-400/20 bg-slate-950/50 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">进度</p>
              <p className="mt-1 text-2xl font-black text-white">{hotspotProgress.current}/{Math.max(hotspotProgress.total, hotspotProgress.current)}</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {sourceSummary.length === 0 ? (
          <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4 text-sm text-slate-500 xl:col-span-4">
            当前暂无数据源汇总
          </div>
        ) : sourceSummary.slice(0, 4).map((sourceItem) => (
          <div key={sourceItem.key} className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">
              {SOURCE_CONFIG[sourceItem.key]?.label || sourceItem.key}
            </p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <span className="text-3xl font-black text-white">{sourceItem.count}</span>
              <span className="text-sm text-slate-400">均热 {sourceItem.avgHotness}</span>
            </div>
          </div>
        ))}
      </section>

      <section className="space-y-4 rounded-[28px] border border-slate-800/60 bg-slate-950/70 p-4 backdrop-blur-xl">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">○</div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索热点、专题或来源..."
              className="w-full rounded-xl border border-slate-800/60 bg-slate-900/60 py-2.5 pl-9 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:border-cyan-500/40 focus:outline-none focus:ring-1 focus:ring-cyan-500/20"
            />
          </div>
          <ShimmerButton onClick={handleRefresh} disabled={refreshing}>
            {refreshing
              ? hotspotProgress && hotspotProgress.total > 0
                ? `AI处理中 ${hotspotProgress.current}/${hotspotProgress.total}`
                : '采集中'
              : '获取当天新闻'}
          </ShimmerButton>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4">
          <select
            value={importance}
            onChange={(event) => setImportance(event.target.value as ImportanceLevel)}
            className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500/40"
          >
            {IMPORTANCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value as TimeRange)}
            className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-cyan-500/40"
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-400">
            当前结果 {filteredNews.length} 条
          </div>
          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-400">
            数据源 {Object.keys(stats).length} 个
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {sources.map((sourceKey) => {
            const active = sourceKey === source
            return (
              <button
                key={sourceKey}
                onClick={() => setSource(sourceKey)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs transition-all',
                  active
                    ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-100'
                    : 'border-slate-800/60 bg-slate-900/40 text-slate-400 hover:text-slate-200'
                )}
              >
                {SOURCE_CONFIG[sourceKey]?.label || sourceKey}
              </button>
            )
          })}
        </div>
      </section>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-52 animate-pulse rounded-2xl border border-slate-800/40 bg-slate-900/30" />
          ))}
        </div>
      ) : filteredNews.length === 0 ? (
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/40 p-12 text-center text-slate-400">
          当前筛选下没有热点数据
        </div>
      ) : (
        <AnimatedTabs
          tabs={[
            {
              title: '榜单视图',
              value: 'ranked',
              content: (
                <div className="grid items-start gap-4 xl:grid-cols-2">
                  {filteredNews.map((item) => (
                    <NewsInsightCard key={item.id} item={item} accent="cyan" />
                  ))}
                </div>
              ),
            },
            {
              title: '专题视图',
              value: 'topic',
              content: (
                <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
                  {topicClusters.map((cluster) => (
                    <BackgroundGradient key={cluster.key} containerClassName="w-full" className="overflow-hidden rounded-[24px] bg-slate-950/90">
                      <div className="p-5">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">专题</p>
                            <h4 className="mt-2 text-lg font-bold text-white">{cluster.key}</h4>
                          </div>
                          <div className="rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-right">
                            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/70">数量</p>
                            <p className="mt-1 text-2xl font-black text-white">{cluster.count}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm text-slate-400">平均热度 {cluster.avgHotness}</p>
                        <div className="mt-4 space-y-2">
                          {cluster.titles.map((title, titleIndex) => (
                            <motion.div key={`${cluster.key}-${titleIndex}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 px-3 py-2 text-sm text-slate-300">
                              {title}
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </BackgroundGradient>
                  ))}
                </div>
              ),
            },
          ]}
          onChange={(tab) => setViewMode(tab.value as ViewMode)}
          containerClassName="gap-2 rounded-2xl border border-slate-800/60 bg-slate-950/40 p-2"
          tabClassName="min-w-[120px]"
          contentClassName="mt-5"
        />
      )}
    </div>
  )
}