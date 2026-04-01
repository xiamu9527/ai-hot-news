import schedule from 'node-schedule'
import { getConfig } from '../utils/config.js'
import { logger } from '../utils/logger.js'
import { getActiveKeywords, updateLastChecked } from './keywordService.js'
import { upsertNews, recordKeywordMatch } from './newsService.js'
import { createNotification, broadcastSSE } from './notificationService.js'
import { crawler } from '../datasources/crawler.js'
import { aiEngine } from '../ai/engine.js'

let keywordJob: schedule.Job | null = null
let hotspotJob: schedule.Job | null = null
let isRunningKeyword = false
let isRunningHotspot = false

export function startScheduler() {
  const config = getConfig()

  // 关键词监控任务 - 每5分钟
  keywordJob = schedule.scheduleJob('*/5 * * * *', async () => {
    if (isRunningKeyword) return
    isRunningKeyword = true
    try {
      await runKeywordMonitor()
    } catch (err) {
      logger.error('Keyword monitor error:', err)
    } finally {
      isRunningKeyword = false
    }
  })

  // 热点采集任务 - 每10分钟
  hotspotJob = schedule.scheduleJob('*/10 * * * *', async () => {
    if (isRunningHotspot) return
    isRunningHotspot = true
    try {
      await runHotspotCollector()
    } catch (err) {
      logger.error('Hotspot collector error:', err)
    } finally {
      isRunningHotspot = false
    }
  })

  logger.info('✅ Scheduler started: keyword monitor (5min), hotspot collector (10min)')

  // 启动时立即执行一次（使用锁防止重复）
  setTimeout(async () => {
    if (!isRunningHotspot) {
      isRunningHotspot = true
      try { await runHotspotCollector() }
      catch (err) { logger.error('Initial hotspot collection error:', err) }
      finally { isRunningHotspot = false }
    }
    if (!isRunningKeyword) {
      isRunningKeyword = true
      try { await runKeywordMonitor() }
      catch (err) { logger.error('Initial keyword monitor error:', err) }
      finally { isRunningKeyword = false }
    }
  }, 3000)
}

export function stopScheduler() {
  if (keywordJob) {
    keywordJob.cancel()
    keywordJob = null
  }
  if (hotspotJob) {
    hotspotJob.cancel()
    hotspotJob = null
  }
  logger.info('Scheduler stopped')
}

// 手动触发一次完整采集
export async function triggerCollection() {
  logger.info('Manual collection triggered')
  await Promise.allSettled([
    runHotspotCollector(),
    runKeywordMonitor()
  ])
}

async function runKeywordMonitor() {
  const keywords = getActiveKeywords()
  if (keywords.length === 0) return

  logger.info(`Monitoring ${keywords.length} keywords...`)

  for (const kw of keywords) {
    try {
      // 从多个源搜索关键词
      const results = await crawler.searchKeyword(kw.keyword)

      for (const item of results) {
        // AI 验证内容真实性
        let verified: boolean | null = null
        let confidence = 0
        let warnings: string[] = []
        let hotness = 0

        try {
          const [verifyResult, hotnessResult] = await Promise.all([
            aiEngine.verifyContent(item.title, item.content || '', item.source),
            aiEngine.detectHotness(item.title, item.content || '')
          ])
          verified = verifyResult.verified
          confidence = verifyResult.confidence
          warnings = verifyResult.warnings
          hotness = hotnessResult.score
        } catch {
          // AI 不可用时降级处理
          hotness = 30
          logger.warn('AI analysis unavailable, using default scores')
        }

        // 保存新闻
        const news = upsertNews({
          title: item.title,
          summary: item.content?.slice(0, 200) || '',
          content: item.content || '',
          url: item.url,
          source: item.source,
          hotness,
          verified,
          verifyConfidence: confidence,
          verifyWarnings: warnings,
          publishedAt: item.publishedAt
        })

        // 记录关键词匹配
        const matched = recordKeywordMatch(kw.id, news.id)

        // 如果是新匹配且内容已验证（或AI不可用），发送通知
        if (matched && (verified === true || verified === null)) {
          createNotification({
            type: 'keyword_match',
            title: `🔔 关键词命中: "${kw.keyword}"`,
            message: item.title,
            data: { keywordId: kw.id, newsId: news.id, source: item.source, hotness }
          })
        }
      }

      updateLastChecked(kw.id)
    } catch (err) {
      logger.error(`Error monitoring keyword "${kw.keyword}":`, err)
    }
  }
}

async function runHotspotCollector() {
  logger.info('Collecting hotspots...')

  try {
    // 从多个源采集热点
    const allItems = await crawler.collectHotspots()
    logger.info(`Collected ${allItems.length} items from all sources`)

    // 第一步：先全部入库（无AI分析，确保数据不丢失）
    const savedItems: Array<{ item: any; newsId: number }> = []
    for (const item of allItems.slice(0, 30)) {
      const news = upsertNews({
        title: item.title,
        summary: item.content?.slice(0, 200) || '',
        content: item.content || '',
        url: item.url,
        source: item.source,
        hotness: 20, // 默认热度
        publishedAt: item.publishedAt
      })
      savedItems.push({ item, newsId: news.id })
    }
    logger.info(`Saved ${savedItems.length} items to database`)

    // 广播热点更新事件
    broadcastSSE('hotspot_update', { timestamp: new Date().toISOString(), count: savedItems.length })

    // 第二步：异步AI分析（只分析前10条，避免API调用过多）
    const toAnalyze = savedItems.slice(0, 10)
    for (const { item, newsId } of toAnalyze) {
      try {
        const hotnessResult = await aiEngine.detectHotness(item.title, item.content || '')
        // 直接更新数据库
        const { getDb } = await import('../models/database.js')
        const db = getDb()
        db.prepare('UPDATE news SET hotness = ?, aiAnalysis = ? WHERE id = ?').run(
          hotnessResult.score,
          JSON.stringify(hotnessResult),
          newsId
        )
        logger.info(`AI scored "${item.title.slice(0, 30)}..." → ${hotnessResult.score}`)
      } catch {
        // AI不可用就跳过
      }
    }

    logger.info('Hotspot collection completed')
  } catch (err) {
    logger.error('Hotspot collection error:', err)
  }
}
