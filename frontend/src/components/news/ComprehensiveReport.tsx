import { useEffect, useMemo, useState } from 'react'
import type { NewsItem, NewsReport } from '@/types'
import { fetchNewsReport } from '@/utils/api'
import { GlowingCard } from '@/components/ui/glowing-card'

const REPORT_TIMEOUT_MS = 5 * 60 * 1000
const REPORT_SAMPLE_SIZE = 6
const REPORT_CACHE_TTL_MS = 10 * 60 * 1000

type CachedReportEntry = {
  value: NewsReport
  expiresAt: number
}

const reportCache = new Map<string, CachedReportEntry>()
const inflightReportRequests = new Map<string, Promise<NewsReport>>()

function buildReportFingerprint(mode: 'matched' | 'hotspots', items: NewsItem[]) {
  return `${mode}:${items
    .slice(0, REPORT_SAMPLE_SIZE)
    .map((item) => [
      item.id,
      item.hotness,
      item.verified,
      Number(item.verifyConfidence || 0).toFixed(2),
      item.summary,
      item.aiAnalysis,
    ].join('|'))
    .join('||')}`
}

function getCachedReport(cacheKey: string): NewsReport | null {
  const cached = reportCache.get(cacheKey)
  if (!cached) return null
  if (Date.now() > cached.expiresAt) {
    reportCache.delete(cacheKey)
    return null
  }
  return cached.value
}

function setCachedReport(cacheKey: string, report: NewsReport) {
  reportCache.set(cacheKey, {
    value: report,
    expiresAt: Date.now() + REPORT_CACHE_TTL_MS,
  })
}

export default function ComprehensiveReport({
  mode,
  items,
  suspended = false,
}: {
  mode: 'matched' | 'hotspots'
  items: NewsItem[]
  suspended?: boolean
}) {
  const [report, setReport] = useState<NewsReport | null>(null)
  const [loading, setLoading] = useState(false)

  const scopedItems = useMemo(() => items.slice(0, REPORT_SAMPLE_SIZE), [items])
  const ids = useMemo(() => scopedItems.map((item) => item.id), [scopedItems])
  const idsKey = useMemo(() => ids.join(','), [ids])
  const reportKey = useMemo(() => buildReportFingerprint(mode, scopedItems), [mode, scopedItems])

  const fallbackReport: NewsReport = useMemo(() => ({
    headline: mode === 'matched' ? '命中分析综合报告' : '热点探索综合报告',
    summary: 'AI 综合报告暂不可用。',
    keyFindings: [],
    riskAlerts: [],
    recommendedActions: [],
    stockMarketImpact: [],
  }), [mode])

  useEffect(() => {
    if (ids.length === 0) {
      setReport(null)
      return
    }

    const cached = getCachedReport(reportKey)
    if (cached) {
      setReport(cached)
      setLoading(false)
      return
    }

    if (suspended) {
      setLoading(false)
      return
    }

    let cancelled = false
    const controller = new AbortController()

    const timer = window.setTimeout(async () => {
      setLoading(true)
      try {
        const pendingRequest = inflightReportRequests.get(reportKey) || fetchNewsReport(
          { mode, ids },
          { signal: controller.signal, timeout: REPORT_TIMEOUT_MS }
        )

        if (!inflightReportRequests.has(reportKey)) {
          inflightReportRequests.set(reportKey, pendingRequest)
        }

        const result = await pendingRequest
        setCachedReport(reportKey, result)
        if (!cancelled) {
          setReport(result)
        }
      } catch (err: any) {
        if (!cancelled) {
          const isTimeout = err?.code === 'ECONNABORTED' || err?.message?.includes('timeout')
          setReport({
            ...fallbackReport,
            summary: isTimeout
              ? 'AI 综合报告生成超时（已等待 5 分钟），请稍后重试。'
              : fallbackReport.summary,
          })
        }
      } finally {
        inflightReportRequests.delete(reportKey)
        if (!cancelled) {
          setLoading(false)
        }
      }
    }, 250)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [fallbackReport, ids, idsKey, mode, reportKey, suspended])

  return (
    <GlowingCard>
      <div className="p-5 md:p-7">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/80">综合报告</p>
            <h3 className="mt-2 text-xl font-bold leading-tight text-white md:text-2xl">
              {report?.headline || (mode === 'matched' ? '命中分析综合报告' : '热点探索综合报告')}
            </h3>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-300">
              {suspended
                ? '当前新闻列表仍在被 AI 更新，综合报告会在本轮处理完成后自动生成。'
                : loading
                ? 'AI 正在生成综合报告，请稍候……'
                : report?.summary || '当前新闻数量不足，暂未生成综合报告。'}
            </p>
          </div>
          <div className="shrink-0 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-right">
            <p className="text-[11px] uppercase tracking-[0.2em] text-cyan-100/70">样本范围</p>
            <p className="mt-1 text-3xl font-black text-white">{ids.length}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="my-5 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

        {/* 2x2 Grid */}
        <div className="grid gap-4 md:grid-cols-2">
          {/* 核心发现 */}
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-cyan-500/15 text-[10px] text-cyan-400">K</span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-400/80">核心发现</p>
            </div>
            <div className="space-y-2.5">
              {(report?.keyFindings || []).length > 0 ? report?.keyFindings.map((item, i) => (
                <p key={i} className="text-sm leading-6 text-slate-300">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-cyan-400/60" />
                  {item}
                </p>
              )) : <p className="text-sm text-slate-500">暂无输出</p>}
            </div>
          </div>

          {/* 风险提示 */}
          <div className="rounded-2xl border border-amber-500/10 bg-amber-500/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/15 text-[10px] text-amber-400">!</span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-400/80">风险提示</p>
            </div>
            <div className="space-y-2.5">
              {(report?.riskAlerts || []).length > 0 ? report?.riskAlerts.map((item, i) => (
                <p key={i} className="text-sm leading-6 text-amber-200/80">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-amber-400/60" />
                  {item}
                </p>
              )) : <p className="text-sm text-slate-500">暂无明显风险提示</p>}
            </div>
          </div>

          {/* 建议动作 */}
          <div className="rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-500/15 text-[10px] text-emerald-400">A</span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400/80">建议动作</p>
            </div>
            <div className="space-y-2.5">
              {(report?.recommendedActions || []).length > 0 ? report?.recommendedActions.map((item, i) => (
                <p key={i} className="text-sm leading-6 text-emerald-200/80">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-emerald-400/60" />
                  {item}
                </p>
              )) : <p className="text-sm text-slate-500">暂无建议动作</p>}
            </div>
          </div>

          {/* 股市影响评估 */}
          <div className="rounded-2xl border border-violet-500/10 bg-violet-500/[0.03] p-5">
            <div className="mb-3 flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-violet-500/15 text-[10px] text-violet-400">S</span>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-violet-400/80">股市影响评估</p>
            </div>
            <div className="space-y-2.5">
              {(report?.stockMarketImpact || []).length > 0 ? report?.stockMarketImpact.map((item, i) => (
                <p key={i} className="text-sm leading-6 text-violet-200/80">
                  <span className="mr-1.5 inline-block h-1.5 w-1.5 translate-y-[-1px] rounded-full bg-violet-400/60" />
                  {item}
                </p>
              )) : <p className="text-sm text-slate-500">暂无股市影响评估</p>}
            </div>
          </div>
        </div>
      </div>
    </GlowingCard>
  )
}