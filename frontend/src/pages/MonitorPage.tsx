import { useState, useEffect, useCallback } from 'react'
import type { Keyword, NewsItem } from '@/types'
import {
  fetchKeywords,
  addKeyword,
  deleteKeyword,
  toggleKeyword,
  fetchKeywordMatches,
} from '@/utils/api'

function MatchCard({ item }: { item: NewsItem }) {
  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/40
      hover:border-cyan-500/20 transition-all group">
      {/* 热度指示灯 */}
      <div className="mt-1 shrink-0">
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: item.hotness >= 70 ? '#f97316' : item.hotness >= 40 ? '#fbbf24' : '#06b6d4',
            boxShadow: `0 0 6px ${item.hotness >= 70 ? '#f9731640' : item.hotness >= 40 ? '#fbbf2440' : '#06b6d440'}`,
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-300 transition-colors">
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-[10px] text-slate-500">{item.source}</span>
          <span className="text-[10px] text-slate-600">·</span>
          <span className="text-[10px] text-slate-500">热度 {item.hotness}</span>
          {item.verified === 1 && (
            <span className="text-[10px] text-emerald-500">✓ 已验证</span>
          )}
          {item.verified === 0 && (
            <span className="text-[10px] text-red-400">⚠ 可疑</span>
          )}
        </div>
      </div>
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-cyan-500/50 hover:text-cyan-400 shrink-0"
        >
          →
        </a>
      )}
    </div>
  )
}

function KeywordCard({
  kw,
  onDelete,
  onToggle,
}: {
  kw: Keyword
  onDelete: (id: number) => void
  onToggle: (id: number, active: boolean) => void
}) {
  const [matches, setMatches] = useState<NewsItem[]>([])
  const [expanded, setExpanded] = useState(false)
  const [loadingMatches, setLoadingMatches] = useState(false)

  const loadMatches = useCallback(async () => {
    if (matches.length > 0) return
    setLoadingMatches(true)
    try {
      const result = await fetchKeywordMatches(kw.id)
      setMatches(result.matches)
    } catch { /* ignore */ }
    finally { setLoadingMatches(false) }
  }, [kw.id, matches.length])

  const handleExpand = () => {
    if (!expanded) loadMatches()
    setExpanded(!expanded)
  }

  return (
    <div className="rounded-xl border border-slate-800/60 bg-gradient-to-br from-slate-900/80 to-slate-800/30
      overflow-hidden transition-all">
      <div className="p-4 flex items-center gap-4">
        {/* 监控状态灯 */}
        <div className="relative">
          <div className={`w-3 h-3 rounded-full ${kw.active ? 'bg-emerald-500' : 'bg-slate-600'}`} />
          {kw.active === 1 && (
            <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-30" />
          )}
        </div>

        {/* 关键词信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-100">{kw.keyword}</span>
            {kw.scope && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {kw.scope}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5">
            {kw.active === 1 ? '🟢 正在监控中' : '⏸ 已暂停'}
            {kw.lastCheckedAt && ` · 上次检查: ${new Date(kw.lastCheckedAt).toLocaleString('zh-CN')}`}
          </p>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleExpand}
            className="p-1.5 rounded-md text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all text-xs"
            title="查看匹配"
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            onClick={() => onToggle(kw.id, kw.active !== 1)}
            className={`p-1.5 rounded-md transition-all text-xs ${
              kw.active === 1
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-emerald-400 hover:bg-emerald-500/10'
            }`}
            title={kw.active === 1 ? '暂停' : '恢复'}
          >
            {kw.active === 1 ? '⏸' : '▶'}
          </button>
          <button
            onClick={() => onDelete(kw.id)}
            className="p-1.5 rounded-md text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs"
            title="删除"
          >
            ✕
          </button>
        </div>
      </div>

      {/* 匹配结果展开区 */}
      {expanded && (
        <div className="border-t border-slate-800/60 p-3 space-y-2 bg-slate-900/30">
          {loadingMatches ? (
            <div className="text-center py-4 text-xs text-slate-500">加载中...</div>
          ) : matches.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-xs text-slate-500">暂无匹配结果</p>
              <p className="text-[10px] text-slate-600 mt-1">系统正在持续监控中，发现匹配会自动通知</p>
            </div>
          ) : (
            matches.map((m) => <MatchCard key={m.id} item={m} />)
          )}
        </div>
      )}
    </div>
  )
}

export default function MonitorPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [input, setInput] = useState('')
  const [scope, setScope] = useState('')
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')

  const loadKeywords = useCallback(async () => {
    try {
      const result = await fetchKeywords()
      setKeywords(result.keywords)
    } catch {
      console.error('Failed to fetch keywords')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadKeywords()
  }, [loadKeywords])

  const handleAdd = async () => {
    const trimmed = input.trim()
    if (!trimmed) return
    setAdding(true)
    setError('')
    try {
      await addKeyword(trimmed, scope.trim())
      setInput('')
      setScope('')
      await loadKeywords()
    } catch (err: any) {
      setError(err.response?.data?.error || '添加失败')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: number) => {
    try {
      await deleteKeyword(id)
      setKeywords((prev) => prev.filter((k) => k.id !== id))
    } catch { /* ignore */ }
  }

  const handleToggle = async (id: number, active: boolean) => {
    try {
      const updated = await toggleKeyword(id, active)
      setKeywords((prev) => prev.map((k) => (k.id === id ? updated : k)))
    } catch { /* ignore */ }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleAdd()
    }
  }

  return (
    <div className="space-y-6">
      {/* 添加关键词区域 */}
      <div className="rounded-xl border border-slate-800/60 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-3 flex items-center gap-2">
          <span className="w-1 h-4 bg-cyan-500 rounded-full" />
          添加监控关键词
        </h3>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入关键词，如：AI编程、GPT-5..."
            className="flex-1 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm
              text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50
              focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="范围（可选，如：AI编程）"
            className="sm:w-40 bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2.5 text-sm
              text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50
              focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          <button
            onClick={handleAdd}
            disabled={adding || !input.trim()}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-medium
              rounded-lg hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
              transition-all shadow-lg shadow-cyan-500/10 whitespace-nowrap"
          >
            {adding ? '添加中...' : '+ 添加'}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400 mt-2">{error}</p>
        )}
      </div>

      {/* 雷达扫描动画 + 状态 */}
      <div className="flex items-center gap-3 px-1">
        <div className="relative w-5 h-5">
          <div className="absolute inset-0 border border-cyan-500/30 rounded-full" />
          <div className="absolute inset-[3px] border border-cyan-500/50 rounded-full" />
          <div className="absolute inset-0 rounded-full overflow-hidden">
            <div className="w-full h-full origin-center animate-spin" style={{ animationDuration: '3s' }}>
              <div className="w-1/2 h-full bg-gradient-to-b from-cyan-400/30 to-transparent" />
            </div>
          </div>
        </div>
        <span className="text-xs text-slate-500">
          正在监控 <span className="text-cyan-400 font-mono">{keywords.filter(k => k.active === 1).length}</span> 个关键词
        </span>
      </div>

      {/* 关键词列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 rounded-full bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-800 rounded w-24" />
                  <div className="h-2.5 bg-slate-800 rounded w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : keywords.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-4 animate-pulse">👁️</div>
          <p className="text-slate-400 font-medium">还没有监控关键词</p>
          <p className="text-xs text-slate-600 mt-2">在上方输入关键词开始监控，系统会自动搜索并在发现相关内容时通知您</p>
        </div>
      ) : (
        <div className="space-y-3">
          {keywords.map((kw) => (
            <KeywordCard
              key={kw.id}
              kw={kw}
              onDelete={handleDelete}
              onToggle={handleToggle}
            />
          ))}
        </div>
      )}
    </div>
  )
}
