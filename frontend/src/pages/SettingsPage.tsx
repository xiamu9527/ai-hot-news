import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SettingsData } from '@/types'
import { fetchSettings, updateSettings } from '@/utils/api'
import { cn } from '@/lib/utils'
import { GlowingCard } from '@/components/ui/glowing-card'
import { ShimmerButton } from '@/components/ui/shimmer-button'

const SOURCE_LABELS: Record<string, string> = {
  hackerNews: 'HackerNews',
  bing: 'Bing 搜索',
  google: 'Google 搜索',
  duckduckgo: 'DuckDuckGo',
  twitter: 'Twitter / X',
  weibo: '微博',
  sogou: '搜狗/微信',
  baidu: '百度',
  zhihu: '知乎',
  toutiao: '今日头条',
  news36kr: '36氪',
  ithome: 'IT之家',
  huxiu: '虎嗅',
  douyin: '抖音',
  thepaper: '澎湃新闻',
  juejin: '掘金',
  sspai: '少数派',
  v2ex: 'V2EX',
  douban: '豆瓣',
  tieba: '贴吧',
  hupu: '虎扑',
  ifeng: '凤凰网',
  github: 'GitHub',
  solidot: 'Solidot',
  wallstreetcn: '华尔街见闻',
  linuxdo: 'LinuxDO',
  freebuf: 'FreeBuf',
  nowcoder: '牛客',
}

const SOURCE_ICONS: Record<string, string> = {
  hackerNews: '',
  bing: '',
  google: '',
  duckduckgo: '',
  twitter: '',
  weibo: '',
  sogou: '',
  baidu: '',
  zhihu: '',
  toutiao: '',
  news36kr: '',
  ithome: '',
  huxiu: '',
  douyin: '',
  thepaper: '',
  juejin: '',
  sspai: '',
  v2ex: '',
  douban: '',
  tieba: '',
  hupu: '',
  ifeng: '',
  github: '',
  solidot: '',
  wallstreetcn: '',
  linuxdo: '',
  freebuf: '',
  nowcoder: '',
}

const SOURCE_GRADIENT: Record<string, string> = {
  hackerNews: 'from-orange-500/10 to-amber-500/5',
  bing: 'from-blue-500/10 to-cyan-500/5',
  google: 'from-red-500/10 to-yellow-500/5',
  duckduckgo: 'from-green-500/10 to-emerald-500/5',
  twitter: 'from-sky-500/10 to-blue-500/5',
  weibo: 'from-rose-500/10 to-pink-500/5',
  sogou: 'from-purple-500/10 to-violet-500/5',
  baidu: 'from-blue-600/10 to-blue-400/5',
  zhihu: 'from-blue-500/10 to-indigo-500/5',
  toutiao: 'from-red-500/10 to-rose-500/5',
  news36kr: 'from-blue-500/10 to-sky-500/5',
  ithome: 'from-red-500/10 to-orange-500/5',
  huxiu: 'from-orange-500/10 to-yellow-500/5',
  douyin: 'from-gray-500/10 to-slate-500/5',
  thepaper: 'from-gray-500/10 to-zinc-500/5',
  juejin: 'from-blue-500/10 to-sky-500/5',
  sspai: 'from-red-500/10 to-rose-500/5',
  v2ex: 'from-slate-500/10 to-gray-500/5',
  douban: 'from-green-500/10 to-teal-500/5',
  tieba: 'from-blue-600/10 to-indigo-500/5',
  hupu: 'from-red-600/10 to-orange-500/5',
  ifeng: 'from-red-500/10 to-amber-500/5',
  github: 'from-gray-500/10 to-slate-500/5',
  solidot: 'from-teal-500/10 to-cyan-500/5',
  wallstreetcn: 'from-blue-500/10 to-indigo-500/5',
  linuxdo: 'from-slate-500/10 to-cyan-500/5',
  freebuf: 'from-green-500/10 to-emerald-500/5',
  nowcoder: 'from-blue-500/10 to-sky-500/5',
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-5 rounded-full transition-colors duration-300",
        checked ? 'bg-cyan-600' : 'bg-slate-700'
      )}
    >
      <motion.div
        animate={{ x: checked ? 20 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm"
      />
    </button>
  )
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [aiApiUrl, setAiApiUrl] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')
  const [lmStudioEnabled, setLmStudioEnabled] = useState(false)
  const [lmStudioApiUrl, setLmStudioApiUrl] = useState('')
  const [lmStudioApiKey, setLmStudioApiKey] = useState('')
  const [lmStudioModel, setLmStudioModel] = useState('')
  const [schedulerEnabled, setSchedulerEnabled] = useState(false)

  const effectiveAi = settings?.ai.effective
  const isLmStudioActive = effectiveAi?.mode === 'lmstudio'
  const aiSectionTitle = lmStudioEnabled ? '云端备用配置' : 'AI 模型配置'
  const aiSectionHint = lmStudioEnabled
    ? '本地 LM Studio 已启用，下面这组云端配置会保留在配置文件中，关闭本地优先后再生效。'
    : '当前直接使用这组 OpenAI 兼容配置作为主模型入口。'

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setSettings(data)
        setAiApiUrl(data.ai.apiUrl || '')
        setAiModel(data.ai.model || '')
        setLmStudioEnabled(data.ai.lmStudio.enabled)
        setLmStudioApiUrl(data.ai.lmStudio.apiUrl || '')
        setLmStudioModel(data.ai.lmStudio.model || '')
        setSchedulerEnabled(data.scheduler?.enabled ?? false)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSourceToggle = (key: string, enabled: boolean) => {
    if (!settings) return
    const newSources = {
      ...settings.dataSources,
      [key]: { ...settings.dataSources[key], enabled },
    }
    setSettings({ ...settings, dataSources: newSources })
  }

  const handleSave = async () => {
    if (!settings) return
    setSaving(true)
    try {
      await updateSettings({
        dataSources: Object.fromEntries(
          Object.entries(settings.dataSources).map(([k, v]) => [k, { enabled: v.enabled }])
        ),
        ai: {
          apiUrl: aiApiUrl || undefined,
          apiKey: aiApiKey || undefined,
          model: aiModel || undefined,
          lmStudio: {
            enabled: lmStudioEnabled,
            apiUrl: lmStudioApiUrl || undefined,
            apiKey: lmStudioApiKey || undefined,
            model: lmStudioModel || undefined,
          },
        },
        scheduler: {
          enabled: schedulerEnabled,
          intervalHours: settings.scheduler?.intervalHours ?? 6,
        },
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-2xl space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-slate-800/40 bg-slate-900/30 p-6 animate-pulse">
            <div className="h-4 bg-slate-800 rounded w-24 mb-4" />
            <div className="space-y-3">
              <div className="h-3 bg-slate-800 rounded w-full" />
              <div className="h-3 bg-slate-800 rounded w-3/4" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* AI 配置 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GlowingCard>
          <div className="p-5">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-gradient-to-b from-purple-500 to-violet-500 rounded-full" />
              {aiSectionTitle}
              <span className="text-[10px] text-slate-500 font-normal px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20">
                {lmStudioEnabled ? '保留配置' : 'OpenAI 格式 API'}
              </span>
            </h3>

            <div className="mb-4 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn(
                  'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium',
                  isLmStudioActive
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
                    : 'border-violet-500/30 bg-violet-500/10 text-violet-200'
                )}>
                  <span className={cn('h-1.5 w-1.5 rounded-full', isLmStudioActive ? 'bg-emerald-400' : 'bg-violet-400')} />
                  {isLmStudioActive ? '当前正在使用本地 LM Studio' : '当前正在使用云端 AI'}
                </span>
                <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">
                  生效 Provider: {effectiveAi?.provider || '--'}
                </span>
                <span className="rounded-full border border-slate-700/60 bg-slate-900/70 px-2.5 py-1 text-[10px] text-slate-300">
                  生效模型: {effectiveAi?.model || '--'}
                </span>
              </div>
              <p className="mt-3 text-xs leading-6 text-slate-400">{aiSectionHint}</p>
              <p className="mt-2 text-[11px] text-slate-500 font-mono break-all">
                Effective Base URL: {effectiveAi?.apiUrl || '--'}
              </p>
            </div>

            <div className="space-y-3">
              <div className="group">
                <label className="text-xs text-slate-400 mb-1.5 block">API 地址</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/10 to-violet-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                  <input
                    type="text"
                    value={aiApiUrl}
                    onChange={(e) => setAiApiUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                    className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
                      text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/50
                      focus:ring-1 focus:ring-purple-500/20 transition-all font-mono"
                  />
                </div>
              </div>
              <div className="group">
                <label className="text-xs text-slate-400 mb-1.5 block">API Key</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/10 to-violet-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                  <input
                    type="password"
                    value={aiApiKey}
                    onChange={(e) => setAiApiKey(e.target.value)}
                    placeholder={settings?.ai.hasApiKey ? '••••••••（已配置，留空不修改）' : '输入 API Key'}
                    className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
                      text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/50
                      focus:ring-1 focus:ring-purple-500/20 transition-all font-mono"
                  />
                </div>
              </div>
              <div className="group">
                <label className="text-xs text-slate-400 mb-1.5 block">模型名称</label>
                <div className="relative">
                  <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-purple-500/10 to-violet-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                  <input
                    type="text"
                    value={aiModel}
                    onChange={(e) => setAiModel(e.target.value)}
                    placeholder="gpt-4o / qwen3.5-plus / deepseek-chat"
                    className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
                      text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/50
                      focus:ring-1 focus:ring-purple-500/20 transition-all font-mono"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-slate-500 pt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
                当前保存的云端配置: {settings?.ai.provider} / {settings?.ai.model}
                {settings?.ai.hasApiKey && (
                  <span className="text-emerald-500 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-emerald-500" />
                    Key 已配置
                  </span>
                )}
              </div>

              <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-slate-100">本地 LM Studio 接口</p>
                    <p className="text-xs leading-5 text-slate-400">
                      启用后，后端会优先改用本地 LM Studio OpenAI 兼容服务；当前展示值直接来自配置文件。
                    </p>
                  </div>
                  <ToggleSwitch checked={lmStudioEnabled} onChange={setLmStudioEnabled} />
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="group md:col-span-2">
                    <label className="text-xs text-slate-400 mb-1.5 block">LM Studio 地址</label>
                    <div className="relative">
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                      <input
                        type="text"
                        value={lmStudioApiUrl}
                        onChange={(e) => setLmStudioApiUrl(e.target.value)}
                        placeholder="http://localhost:1234/v1"
                        className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
                          text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50
                          focus:ring-1 focus:ring-emerald-500/20 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-xs text-slate-400 mb-1.5 block">LM Studio Key</label>
                    <div className="relative">
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                      <input
                        type="password"
                        value={lmStudioApiKey}
                        onChange={(e) => setLmStudioApiKey(e.target.value)}
                        placeholder={settings?.ai.lmStudio.hasApiKey ? '••••••••（已配置，留空不修改）' : 'lm-studio'}
                        className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
                          text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50
                          focus:ring-1 focus:ring-emerald-500/20 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div className="group">
                    <label className="text-xs text-slate-400 mb-1.5 block">LM Studio 模型 ID</label>
                    <div className="relative">
                      <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 opacity-0 group-focus-within:opacity-100 transition-opacity blur-sm" />
                      <input
                        type="text"
                        value={lmStudioModel}
                        onChange={(e) => setLmStudioModel(e.target.value)}
                        placeholder="your-loaded-model-id"
                        className="relative w-full bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-2.5 text-sm
                          text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50
                          focus:ring-1 focus:ring-emerald-500/20 transition-all font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className={cn(
                    'inline-flex items-center gap-1 rounded-full border px-2 py-1',
                    lmStudioEnabled ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700/60 bg-slate-900/40'
                  )}>
                    <span className={cn('h-1.5 w-1.5 rounded-full', lmStudioEnabled ? 'bg-emerald-400' : 'bg-slate-600')} />
                    {lmStudioEnabled ? '已启用本地优先' : '未启用本地优先'}
                  </span>
                  <span>模型名需与 LM Studio 已加载模型的 ID 保持一致。</span>
                </div>
              </div>
            </div>
          </div>
        </GlowingCard>
      </motion.div>

      {/* 数据源设置 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <GlowingCard>
          <div className="p-5">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-gradient-to-b from-cyan-500 to-blue-500 rounded-full" />
              数据源管理
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {settings &&
                Object.entries(settings.dataSources).filter(([key]) => key !== 'bili').map(([key, val], idx) => (
                  <motion.div
                    key={key}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.05 * idx }}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-xl border transition-all duration-300",
                      val.enabled
                        ? `border-cyan-500/20 bg-gradient-to-r ${SOURCE_GRADIENT[key] || 'from-cyan-500/5 to-transparent'}`
                        : 'border-slate-800/40 bg-slate-900/30 opacity-50'
                    )}
                  >
                    <ToggleSwitch
                      checked={val.enabled}
                      onChange={(v) => handleSourceToggle(key, v)}
                    />
                    {SOURCE_ICONS[key] && <span className="text-lg">{SOURCE_ICONS[key]}</span>}
                    <span className={cn(
                      "text-sm transition-colors",
                      val.enabled ? "text-slate-200" : "text-slate-500"
                    )}>
                      {SOURCE_LABELS[key] || key}
                    </span>
                  </motion.div>
                ))}
            </div>
          </div>
        </GlowingCard>
      </motion.div>

      {/* 保存按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
      >
        <GlowingCard>
          <div className="p-5">
            <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
              <span className="w-1.5 h-5 bg-gradient-to-b from-emerald-500 to-teal-500 rounded-full" />
              自动采集调度
              <span className="text-[10px] text-slate-500 font-normal px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
                {schedulerEnabled ? '已启用' : '已关闭'}
              </span>
            </h3>
            <div className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
              <div>
                <p className="text-sm text-slate-200">启用自动采集</p>
                <p className="text-xs text-slate-500 mt-1">
                  开启后每 {settings?.scheduler?.intervalHours ?? 6} 小时自动采集当天热点新闻
                </p>
              </div>
              <ToggleSwitch checked={schedulerEnabled} onChange={setSchedulerEnabled} />
            </div>
          </div>
        </GlowingCard>
      </motion.div>

      {/* 保存按钮 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-3"
      >
        <ShimmerButton
          onClick={handleSave}
          disabled={saving}
          className="px-8"
        >
          {saving ? (
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              保存中...
            </span>
          ) : '保存设置'}
        </ShimmerButton>

        <AnimatePresence>
          {saved && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              className="text-sm text-emerald-400 flex items-center gap-1"
            >
              ✓ 已保存（重启后端生效）
            </motion.span>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
