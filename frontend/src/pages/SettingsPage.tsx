import { useState, useEffect } from 'react'
import type { SettingsData } from '@/types'
import { fetchSettings, updateSettings } from '@/utils/api'

const SOURCE_LABELS: Record<string, string> = {
  hackerNews: 'HackerNews',
  bing: 'Bing 搜索',
  google: 'Google 搜索',
  duckduckgo: 'DuckDuckGo',
  twitter: 'Twitter / X',
  weibo: '微博',
  bili: 'B站',
  sogou: '搜狗/微信',
}

const SOURCE_ICONS: Record<string, string> = {
  hackerNews: '🟠',
  bing: '🔵',
  google: '🔴',
  duckduckgo: '🦆',
  twitter: '🐦',
  weibo: '📱',
  bili: '📺',
  sogou: '🔍',
}

export default function SettingsPage() {
  const [settings, setSettings] = useState<SettingsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // AI 配置表单
  const [aiApiUrl, setAiApiUrl] = useState('')
  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('')

  useEffect(() => {
    fetchSettings()
      .then((data) => {
        setSettings(data)
        setAiApiUrl(data.ai.apiUrl || '')
        setAiModel(data.ai.model || '')
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const handleSourceToggle = async (key: string, enabled: boolean) => {
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
          <div key={i} className="rounded-xl border border-slate-800/60 bg-slate-900/30 p-6 animate-pulse">
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
      <div className="rounded-xl border border-slate-800/60 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-purple-500 rounded-full" />
          AI 模型配置
          <span className="text-[10px] text-slate-500 font-normal">OpenAI 格式 API</span>
        </h3>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">API 地址</label>
            <input
              type="text"
              value={aiApiUrl}
              onChange={(e) => setAiApiUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm
                text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/50
                focus:ring-1 focus:ring-purple-500/20 transition-all font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">API Key</label>
            <input
              type="password"
              value={aiApiKey}
              onChange={(e) => setAiApiKey(e.target.value)}
              placeholder={settings?.ai.hasApiKey ? '••••••••（已配置，留空不修改）' : '输入 API Key'}
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm
                text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/50
                focus:ring-1 focus:ring-purple-500/20 transition-all font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">模型名称</label>
            <input
              type="text"
              value={aiModel}
              onChange={(e) => setAiModel(e.target.value)}
              placeholder="gpt-4o / qwen3.5-plus / deepseek-chat"
              className="w-full bg-slate-800/50 border border-slate-700/50 rounded-lg px-3 py-2 text-sm
                text-slate-100 placeholder-slate-600 focus:outline-none focus:border-purple-500/50
                focus:ring-1 focus:ring-purple-500/20 transition-all font-mono"
            />
          </div>
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
            当前配置: {settings?.ai.provider} / {settings?.ai.model}
            {settings?.ai.hasApiKey && (
              <span className="text-emerald-500">· Key 已配置</span>
            )}
          </div>
        </div>
      </div>

      {/* 数据源设置 */}
      <div className="rounded-xl border border-slate-800/60 bg-gradient-to-br from-slate-900/90 to-slate-800/40 p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-4 flex items-center gap-2">
          <span className="w-1 h-4 bg-cyan-500 rounded-full" />
          数据源管理
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {settings &&
            Object.entries(settings.dataSources).map(([key, val]) => (
              <label
                key={key}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                  val.enabled
                    ? 'border-cyan-500/20 bg-cyan-500/5'
                    : 'border-slate-800/40 bg-slate-900/30 opacity-60'
                }`}
              >
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={val.enabled}
                    onChange={(e) => handleSourceToggle(key, e.target.checked)}
                    className="sr-only"
                  />
                  <div className={`w-9 h-5 rounded-full transition-colors ${
                    val.enabled ? 'bg-cyan-600' : 'bg-slate-700'
                  }`}>
                    <div className={`w-4 h-4 bg-white rounded-full mt-0.5 transition-transform ${
                      val.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                    }`} />
                  </div>
                </div>
                <span className="text-base">{SOURCE_ICONS[key] || '🌐'}</span>
                <span className="text-sm text-slate-300">{SOURCE_LABELS[key] || key}</span>
              </label>
            ))}
        </div>
      </div>

      {/* 保存按钮 */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white text-sm font-medium
            rounded-lg hover:from-cyan-500 hover:to-blue-500 disabled:opacity-50 transition-all
            shadow-lg shadow-cyan-500/10"
        >
          {saving ? '保存中...' : '💾 保存设置'}
        </button>
        {saved && (
          <span className="text-sm text-emerald-400 animate-pulse">✓ 已保存（重启后生效）</span>
        )}
      </div>
    </div>
  )
}
