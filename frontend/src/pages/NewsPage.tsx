import { useState, useEffect, useCallback } from 'react'
import type { NewsItem, NewsStats } from '@/types'
import { fetchNews, fetchNewsStats, refreshNews } from '@/utils/api'
import { formatDistanceToNow } from 'date-fns'
import { zhCN } from 'date-fns/locale'

const SOURCE_COLORS: Record<string, string> = {
  HackerNews: 'from-orange-500 to-amber-500',
  Bing: 'from-blue-500 to-cyan-500',
  DuckDuckGo: 'from-green-500 to-emerald-500',
  Twitter: 'from-sky-500 to-blue-500',
  Google: 'from-red-500 to-yellow-500',
  微博: 'from-rose-500 to-pink-500',
}

function HotnessMeter({ score }: { score: number }) {
  const pct = Math.min(100, Math.max(0, score))
  const color =
    pct >= 80 ? 'from-red-500 to-orange-400' :
    pct >= 50 ? 'from-orange-400 to-yellow-400' :
    pct >= 30 ? 'from-yellow-400 to-cyan-400' :
    'from-cyan-400 to-blue-400'

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
        <div
          className={`h-full bg-gradient-to-r ${color} rounded-full transition-all duration-700`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums min-w-[2rem] text-right" style={{
        color: pct >= 80 ? '#f97316' : pct >= 50 ? '#fbbf24' : '#06b6d4'
      }}>
        {score}
      </span>
    </div>
  )
}

function VerifyBadge({ verified, confidence }: { verified: number | null; confidence: number }) {
  if (verified === null) {
    return <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-500">未验证</span>
  }
  if (verified === 1) {
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        ✓ 已验证 {Math.round(confidence * 100)}%
      </span>
    )
  }
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
      ⚠ 可疑 {Math.round(confidence * 100)}%
    </span>
  )
}

function NewsCard({ item, featured = false }: { item: NewsItem; featured?: boolean }) {
  const sourceColor = SOURCE_COLORS[item.source] || 'from-violet-500 to-purple-500'
  const timeAgo = item.publishedAt
    ? formatDistanceToNow(new Date(item.publishedAt), { addSuffix: true, locale: zhCN })
    : item.createdAt
      ? formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: zhCN })
      : ''

  return (
    <div className={`group relative rounded-xl border border-slate-800/80 bg-gradient-to-br from-slate-900/90 to-slate-800/40
      backdrop-blur-sm overflow-hidden transition-all duration-300
      hover:border-cyan-500/30 hover:shadow-lg hover:shadow-cyan-500/5 hover:-translate-y-0.5
      ${featured ? 'md:col-span-2 md:row-span-2' : ''}`}
    >
      {/* 顶部光条 */}
      <div className={`h-0.5 bg-gradient-to-r ${sourceColor} opacity-60 group-hover:opacity-100 transition-opacity`} />

      <div className={`p-4 ${featured ? 'md:p-6' : ''} space-y-3`}>
        {/* Meta 行 */}
        <div className="flex items-center justify-between gap-2">
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full
            bg-gradient-to-r ${sourceColor} text-white/90`}>
            {item.source}
          </span>
          <div className="flex items-center gap-2">
            <VerifyBadge verified={item.verified} confidence={item.verifyConfidence} />
            <span className="text-[10px] text-slate-500">{timeAgo}</span>
          </div>
        </div>

        {/* 标题 */}
        <h3 className={`font-bold text-slate-100 leading-snug
          ${featured ? 'text-lg md:text-xl line-clamp-3' : 'text-sm line-clamp-2'}
          group-hover:text-cyan-300 transition-colors`}>
          {item.title}
        </h3>

        {/* 摘要 */}
        {item.summary && (
          <p className={`text-slate-400 leading-relaxed ${featured ? 'text-sm line-clamp-4' : 'text-xs line-clamp-2'}`}>
            {item.summary}
          </p>
        )}

        {/* 底部 */}
        <div className="pt-1">
          <HotnessMeter score={item.hotness} />
        </div>

        {/* 链接 */}
        {item.url && (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-cyan-500/70 hover:text-cyan-400 transition-colors"
          >
            查看原文 →
          </a>
        )}
      </div>
    </div>
  )
}

export default function NewsPage() {
  const [news, setNews] = useState<NewsItem[]>([])
  const [stats, setStats] = useState<NewsStats | null>(null)
  const [source, setSource] = useState('all')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const loadNews = useCallback(async () => {
    try {
      const result = await fetchNews({
        source: source !== 'all' ? source : undefined,
        keyword: keyword || undefined,
        limit: 30,
      })
      setNews(result.data)
    } catch (err) {
      console.error('Failed to fetch news:', err)
    } finally {
      setLoading(false)
    }
  }, [source, keyword])

  useEffect(() => {
    loadNews()
    fetchNewsStats().then(setStats).catch(() => {})
  }, [loadNews])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await refreshNews()
      // 给后端一些采集时间
      setTimeout(() => {
        loadNews()
        fetchNewsStats().then(setStats).catch(() => {})
        setRefreshing(false)
      }, 3000)
    } catch {
      setRefreshing(false)
    }
  }

  const sources = stats ? Object.keys(stats.sources) : []

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '总条目', value: stats.total, icon: '📊' },
            { label: '数据源', value: Object.keys(stats.sources).length, icon: '🌐' },
            { label: '平均热度', value: stats.avgHotness, icon: '🔥' },
            { label: '今日新增', value: news.filter(n => {
              const d = new Date(n.createdAt)
              const now = new Date()
              return d.toDateString() === now.toDateString()
            }).length, icon: '📰' },
          ].map((s) => (
            <div key={s.label} className="relative rounded-lg border border-slate-800/60 bg-slate-900/50 p-3
              overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent" />
              <div className="relative">
                <div className="text-lg mb-0.5">{s.icon}</div>
                <div className="text-2xl font-bold font-mono text-slate-100">{s.value}</div>
                <div className="text-[10px] text-slate-500 uppercase tracking-wider">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-slate-900/50 rounded-lg border border-slate-800/60 p-0.5">
          <button
            onClick={() => setSource('all')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              source === 'all'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-sm'
                : 'text-slate-400 hover:text-slate-300'
            }`}
          >
            全部
          </button>
          {sources.map((s) => (
            <button
              key={s}
              onClick={() => setSource(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                source === s
                  ? 'bg-cyan-500/20 text-cyan-400 shadow-sm'
                  : 'text-slate-400 hover:text-slate-300'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索新闻..."
            className="w-full bg-slate-900/50 border border-slate-800/60 rounded-lg px-3 py-1.5 text-sm
              text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40
              focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-1.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-xs font-medium
            rounded-lg hover:from-cyan-500 hover:to-blue-500 transition-all disabled:opacity-50
            shadow-lg shadow-cyan-500/10"
        >
          {refreshing ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              采集中...
            </span>
          ) : '🔄 立即采集'}
        </button>
      </div>

      {/* 新闻网格 - Bento Grid 布局 */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 space-y-3 animate-pulse">
              <div className="h-3 bg-slate-800 rounded w-16" />
              <div className="h-4 bg-slate-800 rounded w-4/5" />
              <div className="h-3 bg-slate-800 rounded w-full" />
              <div className="h-1.5 bg-slate-800 rounded w-full" />
            </div>
          ))}
        </div>
      ) : news.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-4xl mb-4">📡</div>
          <p className="text-slate-500">暂无新闻数据</p>
          <p className="text-xs text-slate-600 mt-1">点击"立即采集"开始获取热点</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-auto">
          {news.map((item, idx) => (
            <NewsCard
              key={item.id}
              item={item}
              featured={idx === 0 && item.hotness >= 60}
            />
          ))}
        </div>
      )}
    </div>
  )
}
