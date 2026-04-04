import axios from 'axios'
import type {
  NewsListResponse,
  NewsItem,
  KeywordListResponse,
  Keyword,
  NotificationListResponse,
  NewsStats,
  SettingsData,
} from '@/types'

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
})

// ===== 新闻 =====
export async function fetchNews(params?: {
  source?: string
  keyword?: string
  keywordId?: number
  limit?: number
  offset?: number
}): Promise<NewsListResponse> {
  const { data } = await api.get('/news', { params })
  return data
}

export async function fetchNewsById(id: number): Promise<NewsItem> {
  const { data } = await api.get(`/news/${id}`)
  return data
}

export async function fetchNewsStats(): Promise<NewsStats> {
  const { data } = await api.get('/news/stats')
  return data
}

export async function refreshNews(): Promise<void> {
  await api.post('/news/refresh')
}

// ===== 关键词 =====
export async function fetchKeywords(): Promise<KeywordListResponse> {
  const { data } = await api.get('/keywords')
  return data
}

export async function addKeyword(keyword: string, scope?: string): Promise<Keyword> {
  const { data } = await api.post('/keywords', { keyword, scope })
  return data
}

export async function deleteKeyword(id: number): Promise<void> {
  await api.delete(`/keywords/${id}`)
}

export async function toggleKeyword(id: number, active: boolean): Promise<Keyword> {
  const { data } = await api.put(`/keywords/${id}/toggle`, { active })
  return data
}

export async function fetchKeywordMatches(id: number): Promise<{ matches: NewsItem[] }> {
  const { data } = await api.get(`/keywords/${id}/matches`)
  return data
}

// ===== 通知 =====
export async function fetchNotifications(unreadOnly = false): Promise<NotificationListResponse> {
  const { data } = await api.get('/notifications', { params: { unreadOnly } })
  return data
}

export async function markNotificationRead(id: number): Promise<void> {
  await api.put(`/notifications/${id}/read`)
}

export async function markAllNotificationsRead(): Promise<void> {
  await api.put('/notifications/read-all')
}

// ===== 设置 =====
export async function fetchSettings(): Promise<SettingsData> {
  const { data } = await api.get('/settings')
  return data
}

export async function updateSettings(settings: Partial<{
  dataSources: Record<string, { enabled: boolean }>
  ai: { apiKey?: string; apiUrl?: string; model?: string; provider?: string }
  notifications: Record<string, any>
}>): Promise<void> {
  await api.put('/settings', settings)
}
