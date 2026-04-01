// 新闻条目
export interface NewsItem {
  id: number
  title: string
  summary: string
  content: string
  url: string | null
  source: string
  hotness: number
  verified: number | null // 1=真, 0=假, null=未验证
  verifyConfidence: number
  verifyWarnings: string // JSON string of string[]
  aiAnalysis: string // JSON string
  publishedAt: string | null
  createdAt: string
}

// 关键词
export interface Keyword {
  id: number
  keyword: string
  scope: string
  active: number // 1=活跃, 0=暂停
  lastCheckedAt: string | null
  createdAt: string
  updatedAt: string
}

// 通知
export interface Notification {
  id: number
  type: string
  title: string
  message: string
  data: string // JSON string
  read: number
  createdAt: string
}

// API 响应类型
export interface NewsListResponse {
  data: NewsItem[]
  total: number
}

export interface KeywordListResponse {
  keywords: Keyword[]
}

export interface NotificationListResponse {
  notifications: Notification[]
  unreadCount: number
}

export interface NewsStats {
  total: number
  sources: Record<string, number>
  avgHotness: number
}

export interface SettingsData {
  dataSources: Record<string, { enabled: boolean; limit?: number; refreshInterval?: number }>
  ai: {
    provider: string
    model: string
    hasApiKey: boolean
    apiUrl: string
  }
  notifications: {
    enabled: boolean
    types: string[]
    web: { enabled: boolean; useWebSocket: boolean }
  }
}
