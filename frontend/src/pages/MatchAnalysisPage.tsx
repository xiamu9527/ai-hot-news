import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AiProgressEvent, Keyword, NewsItem } from '@/types'
import { fetchKeywords, fetchNews, refreshNews } from '@/utils/api'
import { cn } from '@/lib/utils'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import ComprehensiveReport from '@/components/news/ComprehensiveReport'
import NewsInsightCard from '@/components/news/NewsInsightCard'
import {
  IMPORTANCE_OPTIONS,
  SOURCE_CONFIG,
  TIME_RANGE_OPTIONS,
  deriveImportance,
  isWithinTimeRange,
  type ImportanceLevel,
  type TimeRange,
} from '@/components/news/news-helpers'

export default function MatchAnalysisPage({
  refreshTick = 0,
  aiProgress = null,
}: {
  refreshTick?: number
  aiProgress?: AiProgressEvent | null
}) {
  const [news, setNews] = useState<NewsItem[]>([])
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedKeywordId, setSelectedKeywordId] = useState('all')
  const [source, setSource] = useState('all')
  const [importance, setImportance] = useState<ImportanceLevel>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const keywordProgress = aiProgress?.pipeline === 'keywords' ? aiProgress : null

  const loadKeywords = useCallback(async () => {
    const result = await fetchKeywords()
    setKeywords(result.keywords)
  }, [])

  const loadNews = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true)
    try {
      const result = await fetchNews({
        matchMode: 'matched',
        source: source !== 'all' ? source : undefined,
        keyword: search.trim() || undefined,
        keywordId: selectedKeywordId !== 'all' ? Number(selectedKeywordId) : undefined,
        limit: 60,
      })
      setNews(result.data)
    } finally {
      if (!options?.silent) setLoading(false)
    }
  }, [search, selectedKeywordId, source])

  useEffect(() => {
    loadKeywords()
  }, [loadKeywords])

  useEffect(() => {
    loadNews()
  }, [loadNews])

  useEffect(() => {
    if (refreshTick === 0) return
    loadNews({ silent: true })
  }, [refreshTick, loadNews])

  useEffect(() => {
    if (keywordProgress?.stage === 'completed') {
      setRefreshing(false)
    }
  }, [keywordProgress])

  const filteredNews = useMemo(() => {
    return [...news]
      .filter((item) => (importance === 'all' ? true : deriveImportance(item as NewsItem & { isMatch?: number }) === importance))
      .filter((item) => isWithinTimeRange(item, timeRange))
      .sort((left, right) => right.hotness - left.hotness)
  }, [importance, news, timeRange])

  const sources = useMemo(() => ['all', ...Array.from(new Set(news.map((item) => item.source)))], [news])
  const verifiedCount = filteredNews.filter((item) => item.verified === 1).length
  const urgentCount = filteredNews.filter((item) => deriveImportance(item as NewsItem & { isMatch?: number }) === 'urgent').length

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
        <div className="inline-flex items-center gap-2 rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.26em] text-fuchsia-200">
          命中分析
        </div>
        <h2 className="mt-4 text-2xl font-black text-slate-100 md:text-4xl">关键词命中分析</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-400">
          只聚焦命中监控词的新闻，适合值班、舆情和运营团队快速判断哪些内容需要优先跟进。
        </p>
      </div>

      <ComprehensiveReport mode="matched" items={filteredNews} suspended={Boolean(keywordProgress && keywordProgress.stage !== 'completed')} />

      {keywordProgress && (
        <section className="rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/8 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em] text-fuchsia-300/80">AI 处理进度</p>
              <p className="mt-2 text-sm text-slate-100">{keywordProgress.message}</p>
              <p className="mt-1 text-xs text-slate-400">
                {keywordProgress.keyword ? `关键词：${keywordProgress.keyword} · ` : ''}
                阶段：{keywordProgress.stage}
              </p>
            </div>
            <div className="rounded-2xl border border-fuchsia-400/20 bg-slate-950/50 px-4 py-3 text-right">
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">进度</p>
              <p className="mt-1 text-2xl font-black text-white">{keywordProgress.current}/{Math.max(keywordProgress.total, keywordProgress.current)}</p>
            </div>
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">命中总数</p>
          <p className="mt-2 text-3xl font-black text-white">{filteredNews.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">已验证</p>
          <p className="mt-2 text-3xl font-black text-white">{verifiedCount}</p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-4">
          <p className="text-[11px] uppercase tracking-[0.24em] text-slate-500">紧急处理</p>
          <p className="mt-2 text-3xl font-black text-white">{urgentCount}</p>
        </div>
      </section>

      <section className="space-y-4 rounded-[28px] border border-slate-800/60 bg-slate-950/70 p-4 backdrop-blur-xl">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500">○</div>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索命中标题、摘要或主题..."
              className="w-full rounded-xl border border-slate-800/60 bg-slate-900/60 py-2.5 pl-9 pr-4 text-sm text-slate-100 placeholder-slate-600 focus:border-fuchsia-500/40 focus:outline-none focus:ring-1 focus:ring-fuchsia-500/20"
            />
          </div>
          <ShimmerButton onClick={handleRefresh} disabled={refreshing}>
            {refreshing
              ? keywordProgress && keywordProgress.total > 0
                ? `AI处理中 ${keywordProgress.current}/${keywordProgress.total}`
                : '采集中'
              : '获取当天新闻'}
          </ShimmerButton>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <select
            value={selectedKeywordId}
            onChange={(event) => setSelectedKeywordId(event.target.value)}
            className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-fuchsia-500/40"
          >
            <option value="all">全部监控关键词</option>
            {keywords.map((keyword) => (
              <option key={keyword.id} value={String(keyword.id)}>
                {keyword.keyword}{keyword.scope ? ` · ${keyword.scope}` : ''}
              </option>
            ))}
          </select>

          <select
            value={importance}
            onChange={(event) => setImportance(event.target.value as ImportanceLevel)}
            className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-fuchsia-500/40"
          >
            {IMPORTANCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <select
            value={timeRange}
            onChange={(event) => setTimeRange(event.target.value as TimeRange)}
            className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-fuchsia-500/40"
          >
            {TIME_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <div className="rounded-xl border border-slate-800/60 bg-slate-950/60 px-3 py-2.5 text-sm text-slate-400">
            当前结果 {filteredNews.length} 条
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
                    ? 'border-fuchsia-500/30 bg-fuchsia-500/10 text-fuchsia-100'
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
          当前筛选下没有命中新闻
        </div>
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-2">
          {filteredNews.map((item) => (
            <NewsInsightCard key={item.id} item={{ ...item, isMatch: 1 }} accent="fuchsia" />
          ))}
        </div>
      )}
    </div>
  )
}