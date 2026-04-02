import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Keyword, NewsItem } from '@/types'
import {
  fetchKeywords,
  addKeyword,
  deleteKeyword,
  toggleKeyword,
  fetchKeywordMatches,
} from '@/utils/api'
import { cn } from '@/lib/utils'
import { GlowingCard } from '@/components/ui/glowing-card'
import { ShimmerButton } from '@/components/ui/shimmer-button'
import { BackgroundGradient } from '@/components/ui/background-gradient'

function MatchCard({ item }: { item: NewsItem }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-3 p-3 rounded-lg bg-slate-800/30 border border-slate-700/30
        hover:border-cyan-500/20 transition-all group"
    >
      <div className="mt-1.5 shrink-0">
        <div
          className="w-2 h-2 rounded-full"
          style={{
            backgroundColor: item.hotness >= 70 ? '#f97316' : item.hotness >= 40 ? '#fbbf24' : '#06b6d4',
            boxShadow: `0 0 8px ${item.hotness >= 70 ? '#f9731660' : item.hotness >= 40 ? '#fbbf2460' : '#06b6d460'}`,
          }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-200 line-clamp-2 group-hover:text-cyan-300 transition-colors">
          {item.title}
        </p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/50 text-slate-500">{item.source}</span>
          <span className="text-[10px] text-slate-600">热度 {item.hotness}</span>
          {item.verified === 1 && <span className="text-[10px] text-emerald-500">✓ 已验证</span>}
          {item.verified === 0 && <span className="text-[10px] text-red-400">⚠ 可疑</span>}
        </div>
      </div>
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          className="text-xs text-cyan-500/50 hover:text-cyan-400 shrink-0">→</a>
      )}
    </motion.div>
  )
}

function KeywordCard({
  kw,
  index,
  onDelete,
  onToggle,
}: {
  kw: Keyword
  index: number
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
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20, scale: 0.95 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
    >
      <GlowingCard containerClassName="overflow-visible">
        <div className="p-4 flex items-center gap-4">
          {/* 监控状态灯 */}
          <div className="relative">
            <div className={cn(
              "w-3 h-3 rounded-full transition-colors",
              kw.active ? 'bg-emerald-500' : 'bg-slate-600'
            )} />
            {kw.active === 1 && (
              <div className="absolute inset-0 w-3 h-3 rounded-full bg-emerald-500 animate-ping opacity-30" />
            )}
          </div>

          {/* 关键词信息 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-100 text-sm">{kw.keyword}</span>
              {kw.scope && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
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
          <div className="flex items-center gap-1">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleExpand}
              className="p-2 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-cyan-500/10 transition-all text-xs"
              title="查看匹配"
            >
              <motion.span
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                className="inline-block"
              >▼</motion.span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onToggle(kw.id, kw.active !== 1)}
              className={cn(
                "p-2 rounded-lg transition-all text-xs",
                kw.active === 1
                  ? 'text-amber-400 hover:bg-amber-500/10'
                  : 'text-emerald-400 hover:bg-emerald-500/10'
              )}
              title={kw.active === 1 ? '暂停' : '恢复'}
            >
              {kw.active === 1 ? '⏸' : '▶'}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => onDelete(kw.id)}
              className="p-2 rounded-lg text-red-400/60 hover:text-red-400 hover:bg-red-500/10 transition-all text-xs"
              title="删除"
            >
              ✕
            </motion.button>
          </div>
        </div>

        {/* 匹配结果展开区 */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="border-t border-slate-800/60 p-3 space-y-2 bg-slate-900/30">
                {loadingMatches ? (
                  <div className="text-center py-6">
                    <div className="w-5 h-5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-slate-500 mt-2">加载中...</p>
                  </div>
                ) : matches.length === 0 ? (
                  <div className="text-center py-6">
                    <motion.p
                      animate={{ opacity: [0.5, 1, 0.5] }}
                      transition={{ duration: 2, repeat: Infinity }}
                      className="text-xs text-slate-500"
                    >
                      🔍 暂无匹配结果，系统持续监控中...
                    </motion.p>
                  </div>
                ) : (
                  matches.map((m) => <MatchCard key={m.id} item={m} />)
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlowingCard>
    </motion.div>
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
      await toggleKeyword(id, active)
      setKeywords((prev) =>
        prev.map((k) => (k.id === id ? { ...k, active: active ? 1 : 0 } : k))
      )
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      {/* 添加关键词 */}
      <BackgroundGradient containerClassName="rounded-2xl" className="rounded-2xl bg-slate-900 p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span className="w-1.5 h-5 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
          添加监控关键词
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative group">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-cyan-500/10 to-blue-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="输入关键词，如：AI、ChatGPT、量子计算..."
              className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-4 py-2.5 text-sm
                text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40
                focus:ring-1 focus:ring-cyan-500/20 transition-all"
            />
          </div>
          <input
            type="text"
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            placeholder="领域(可选)"
            className="w-full sm:w-28 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
              text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500/40
              focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          <ShimmerButton
            onClick={handleAdd}
            disabled={adding || !input.trim()}
          >
            {adding ? (
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
                添加中
              </span>
            ) : '+ 添加监控'}
          </ShimmerButton>
        </div>

        <AnimatePresence>
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="text-xs text-red-400 mt-2 flex items-center gap-1"
            >
              ⚠ {error}
            </motion.p>
          )}
        </AnimatePresence>
      </BackgroundGradient>

      {/* 关键词列表 */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-800/40 bg-slate-900/30 p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-3 h-3 bg-slate-800 rounded-full" />
                <div className="flex-1">
                  <div className="h-4 bg-slate-800 rounded w-24" />
                  <div className="h-3 bg-slate-800/60 rounded w-32 mt-1" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : keywords.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <motion.div
            animate={{ rotateY: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="text-5xl mb-4 inline-block"
          >🎯</motion.div>
          <p className="text-slate-400 font-medium">尚未添加监控关键词</p>
          <p className="text-xs text-slate-600 mt-2">在上方输入关键词开始监控</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              共 <span className="text-cyan-400 font-medium">{keywords.length}</span> 个关键词 ·
              <span className="text-emerald-400 font-medium"> {keywords.filter(k => k.active === 1).length}</span> 个监控中
            </p>
          </div>
          <AnimatePresence>
            {keywords.map((kw, idx) => (
              <KeywordCard
                key={kw.id}
                kw={kw}
                index={idx}
                onDelete={handleDelete}
                onToggle={handleToggle}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
