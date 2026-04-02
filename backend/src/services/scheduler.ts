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

// 手动触发一次完整采集（遵守并发锁）
export async function triggerCollection() {
  logger.info('Manual collection triggered')
  const tasks: Promise<void>[] = []

  if (!isRunningHotspot) {
    isRunningHotspot = true
    tasks.push(
      runHotspotCollector()
        .catch(err => { logger.error('Manual hotspot collection error:', err) })
        .finally(() => { isRunningHotspot = false })
    )
  } else {
    logger.warn('Hotspot collection already running, skipping')
  }

  if (!isRunningKeyword) {
    isRunningKeyword = true
    tasks.push(
      runKeywordMonitor()
        .catch(err => { logger.error('Manual keyword monitor error:', err) })
        .finally(() => { isRunningKeyword = false })
    )
  } else {
    logger.warn('Keyword monitor already running, skipping')
  }

  await Promise.allSettled(tasks)
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
        let summary = item.content?.slice(0, 200) || ''

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

        // AI 生成摘要（仅对内容较长的条目）
        if (item.content && item.content.length > 100) {
          try {
            summary = await aiEngine.summarizeNews(item.content)
          } catch {
            // 降级使用截断文本
          }
        }

        // 保存新闻
        const news = upsertNews({
          title: item.title,
          summary,
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

    // 第二步：批量 AI 分析热点评分（将标题一次性提交，减少API调用）
    const titles = savedItems.map(s => s.item.title)
    let topicScores: Array<{ title: string; score: number; category: string }> = []
    try {
      topicScores = await aiEngine.analyzeTopics('综合热点', titles)
    } catch {
      logger.warn('AI batch topic analysis unavailable')
    }

    // 用批量结果更新数据库
    const { getDb } = await import('../models/database.js')
    const db = getDb()

    if (topicScores.length > 0) {
      const scoreMap = new Map(topicScores.map(t => [t.title, t]))
      for (const { item, newsId } of savedItems) {
        const matched = scoreMap.get(item.title)
        if (matched && matched.score > 0) {
          db.prepare('UPDATE news SET hotness = ?, aiAnalysis = ? WHERE id = ?').run(
            matched.score,
            JSON.stringify(matched),
            newsId
          )
        }
      }
      logger.info(`AI batch scored ${topicScores.length} items`)
    }

    // 第三步：对高热度条目逐条精细分析 + 生成摘要（前8条）
    const toAnalyze = savedItems.slice(0, 8)
    for (const { item, newsId } of toAnalyze) {
      try {
        const hotnessResult = await aiEngine.detectHotness(item.title, item.content || '')
        // 生成AI摘要
        let summary: string | undefined
        if (item.content && item.content.length > 100) {
          try { summary = await aiEngine.summarizeNews(item.content) } catch { /* skip */ }
        }
        const updateFields = summary
          ? db.prepare('UPDATE news SET hotness = ?, aiAnalysis = ?, summary = ? WHERE id = ?')
          : db.prepare('UPDATE news SET hotness = ?, aiAnalysis = ? WHERE id = ?')
        if (summary) {
          updateFields.run(hotnessResult.score, JSON.stringify(hotnessResult), summary, newsId)
        } else {
          updateFields.run(hotnessResult.score, JSON.stringify(hotnessResult), newsId)
        }
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
