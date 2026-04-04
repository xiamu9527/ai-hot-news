import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { NewsItem } from '@/types'
import { cn } from '@/lib/utils'
import { BackgroundGradient } from '@/components/ui/background-gradient'
import { GlowingCard } from '@/components/ui/glowing-card'
import {
  getAnalysisStage,
  SOURCE_CONFIG,
  deriveImportance,
  formatRelativeTime,
  getImportanceLabel,
  getRelationReason,
  getVerifyWarnings,
} from './news-helpers'

function HotnessMeter({ value }: { value: number }) {
  const clamped = Math.max(0, Math.min(100, value))
  const color =
    clamped >= 80 ? 'from-red-500 to-orange-400' :
    clamped >= 50 ? 'from-orange-400 to-amber-400' :
    clamped >= 30 ? 'from-amber-400 to-yellow-400' :
    'from-cyan-400 to-blue-400'

  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-800/80 shadow-inner">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clamped}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className={cn('h-full rounded-full bg-gradient-to-r', color)}
        />
      </div>
      <span className="w-8 text-right text-[10px] font-bold tabular-nums text-cyan-300">{clamped}</span>
    </div>
  )
}

export default function NewsInsightCard({
  item,
  accent = 'cyan',
}: {
  item: NewsItem & { isMatch?: number }
  accent?: 'cyan' | 'fuchsia'
}) {
  const [expanded, setExpanded] = useState(false)
  const relationReason = getRelationReason(item)
  const warnings = getVerifyWarnings(item)
  const importance = deriveImportance(item)
  const analysisStage = getAnalysisStage(item)
  const verifyConfidence = item.verifyConfidence > 0 ? Math.round(item.verifyConfidence * 100) : null

  const accentClass = accent === 'fuchsia'
    ? 'border-fuchsia-500/20 bg-fuchsia-500/10 text-fuchsia-100'
    : 'border-cyan-500/20 bg-cyan-500/10 text-cyan-100'

  return (
    <BackgroundGradient containerClassName="w-full self-start" className="overflow-hidden rounded-[22px] bg-slate-950/90">
      <GlowingCard containerClassName="h-full">
        <div className="flex h-full flex-col p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={cn('rounded-full border px-2.5 py-1 text-[10px] font-semibold', accentClass)}>
              {item.isMatch === 1 ? '命中分析' : '热点探索'}
            </span>
            <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">
              {SOURCE_CONFIG[item.source]?.label || item.source}
            </span>
            <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">
              优先级 {getImportanceLabel(importance)}
            </span>
            <span className="ml-auto text-[10px] text-slate-500">{formatRelativeTime(item)}</span>
          </div>

          <h3 className="text-sm font-bold leading-6 text-white">
            {item.url ? (
              <a href={item.url} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-cyan-300">
                {item.title}
              </a>
            ) : item.title}
          </h3>

          <p className="mt-3 text-sm leading-6 text-slate-300">{relationReason}</p>

          <div className="mt-4 rounded-2xl border border-white/8 bg-white/[0.03] p-3">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-500">
              <span>热度</span>
              <span>
                {item.verified === 1 ? '已验证' : item.verified === 0 ? '需谨慎' : '待验证'}
              </span>
            </div>
            <HotnessMeter value={item.hotness} />
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
              {verifyConfidence !== null && (
                <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2 py-1">
                  可信度 {verifyConfidence}%
                </span>
              )}
              {analysisStage && (
                <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2 py-1">
                  {analysisStage === 'batch' ? 'AI 已初筛' : 'AI 已深度分析'}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 text-xs text-slate-400">
            <span>{item.summary || '暂无摘要'}</span>
            <button
              onClick={() => setExpanded((prev) => !prev)}
              className="shrink-0 text-cyan-400 transition-colors hover:text-cyan-300"
            >
              {expanded ? '收起详情' : '展开详情'}
            </button>
          </div>

          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="mt-4 space-y-3 border-t border-slate-800/60 pt-4">
                  {item.content?.trim() && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">原始内容</p>
                      <p className="mt-1 text-xs leading-6 text-slate-400">{item.content}</p>
                    </div>
                  )}
                  {warnings.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">风险提示</p>
                      <div className="mt-1 space-y-1">
                        {warnings.map((warning, index) => (
                          <p key={index} className="text-xs text-amber-300">{warning}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </GlowingCard>
    </BackgroundGradient>
  )
}