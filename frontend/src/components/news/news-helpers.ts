import type { NewsItem } from '@/types'

export type ParsedAiAnalysis = {
  reasoning?: string
  category?: string
  importance?: string
  score?: number
  riskFlag?: boolean
  analysisStage?: 'batch' | 'detailed'
}

export type ImportanceLevel = 'all' | 'urgent' | 'high' | 'medium' | 'low'
export type TimeRange = 'all' | '1h' | '6h' | '24h' | '7d'

export const SOURCE_CONFIG: Record<string, { label: string; icon: string }> = {
  all: { label: '全部', icon: '' },
  HackerNews: { label: 'HackerNews', icon: '' },
  Bing: { label: 'Bing', icon: '' },
  Google: { label: 'Google', icon: '' },
  DuckDuckGo: { label: 'DuckDuckGo', icon: '' },
  Twitter: { label: 'Twitter', icon: '' },
  微博: { label: '微博', icon: '' },
  搜狗: { label: '搜狗', icon: '' },
  百度: { label: '百度', icon: '' },
  知乎: { label: '知乎', icon: '' },
  头条: { label: '头条', icon: '' },
  '36氪': { label: '36氪', icon: '' },
  IT之家: { label: 'IT之家', icon: '' },
  虎嗅: { label: '虎嗅', icon: '' },
}

export const TIME_RANGE_OPTIONS: Array<{ value: TimeRange; label: string }> = [
  { value: 'all', label: '全部时间' },
  { value: '1h', label: '最近 1 小时' },
  { value: '6h', label: '最近 6 小时' },
  { value: '24h', label: '最近 24 小时' },
  { value: '7d', label: '最近 7 天' },
]

export const IMPORTANCE_OPTIONS: Array<{ value: ImportanceLevel; label: string }> = [
  { value: 'all', label: '全部级别' },
  { value: 'urgent', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

export function parseAiAnalysis(item: NewsItem): ParsedAiAnalysis {
  try {
    return item.aiAnalysis ? JSON.parse(item.aiAnalysis) as ParsedAiAnalysis : {}
  } catch {
    return {}
  }
}

export function getVerifyWarnings(item: NewsItem): string[] {
  try {
    return item.verifyWarnings ? JSON.parse(item.verifyWarnings) : []
  } catch {
    return []
  }
}

export function getAnalysisStage(item: NewsItem): 'batch' | 'detailed' | null {
  const parsed = parseAiAnalysis(item)
  return parsed.analysisStage === 'batch' || parsed.analysisStage === 'detailed' ? parsed.analysisStage : null
}

export function getRelationReason(item: NewsItem): string {
  const parsed = parseAiAnalysis(item)
  if (parsed.reasoning?.trim()) return parsed.reasoning.trim()
  if (item.summary?.trim()) return item.summary.trim()
  return '暂无 AI 解读'
}

export function normalizeImportance(raw?: string): Exclude<ImportanceLevel, 'all'> | null {
  const normalized = raw?.trim().toLowerCase()
  if (normalized === 'urgent' || normalized === 'high' || normalized === 'medium' || normalized === 'low') {
    return normalized
  }
  return null
}

export function deriveImportance(item: NewsItem & { isMatch?: number }): Exclude<ImportanceLevel, 'all'> {
  const parsed = parseAiAnalysis(item)
  const explicit = normalizeImportance(parsed.importance)
  if (explicit) return explicit

  const weightedHotness = item.hotness + ((item as any).isMatch === 1 ? 8 : 0) + (item.verified === 1 ? 4 : 0)
  if (weightedHotness >= 90) return 'urgent'
  if (weightedHotness >= 72) return 'high'
  if (weightedHotness >= 45) return 'medium'
  return 'low'
}

export function getImportanceLabel(level: Exclude<ImportanceLevel, 'all'>): string {
  return {
    urgent: '紧急',
    high: '高',
    medium: '中',
    low: '低',
  }[level]
}

export function getPublishedTimestamp(item: NewsItem): number {
  return new Date(item.publishedAt || item.createdAt).getTime()
}

export function isWithinTimeRange(item: NewsItem, range: TimeRange): boolean {
  if (range === 'all') return true

  const now = Date.now()
  const timestamp = getPublishedTimestamp(item)
  const limits: Record<Exclude<TimeRange, 'all'>, number> = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
  }
  return now - timestamp <= limits[range]
}

export function formatRelativeTime(item: NewsItem): string {
  const diff = Date.now() - getPublishedTimestamp(item)
  if (diff < 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / (60 * 1000)))} 分钟前`
  if (diff < 24 * 60 * 60 * 1000) return `${Math.max(1, Math.round(diff / (60 * 60 * 1000)))} 小时前`
  return `${Math.max(1, Math.round(diff / (24 * 60 * 60 * 1000)))} 天前`
}

export function getTopicLabel(item: NewsItem & { isMatch?: number }): string {
  const parsed = parseAiAnalysis(item)
  if (parsed.category?.trim()) return parsed.category.trim()
  return item.source
}