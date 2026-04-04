import { useEffect, useRef, useCallback, useState } from 'react'
import type { AiProgressEvent, Notification } from '@/types'

interface SSECallbacks {
  onNotification?: (notification: Notification) => void
  onHotspotUpdate?: (data: { timestamp: string; count: number }) => void
  onAiProgress?: (data: AiProgressEvent) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

export function useSSE(callbacks: SSECallbacks) {
  const [connected, setConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const callbacksRef = useRef(callbacks)
  callbacksRef.current = callbacks

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
    }

    const es = new EventSource('/api/notifications/stream')
    eventSourceRef.current = es

    es.addEventListener('connected', () => {
      setConnected(true)
      callbacksRef.current.onConnected?.()
    })

    es.addEventListener('notification', (event) => {
      try {
        const data = JSON.parse(event.data)
        callbacksRef.current.onNotification?.(data)
      } catch { /* ignore parse errors */ }
    })

    es.addEventListener('hotspot_update', (event) => {
      try {
        const data = JSON.parse(event.data)
        callbacksRef.current.onHotspotUpdate?.(data)
      } catch { /* ignore */ }
    })

    es.addEventListener('ai_progress', (event) => {
      try {
        const data = JSON.parse(event.data)
        callbacksRef.current.onAiProgress?.(data)
      } catch { /* ignore */ }
    })

    es.onerror = () => {
      setConnected(false)
      callbacksRef.current.onDisconnected?.()
      // 自动重连（浏览器 EventSource 内建重连机制）
    }

    return es
  }, [])

  useEffect(() => {
    const es = connect()
    return () => {
      es.close()
      setConnected(false)
    }
  }, [connect])

  return { connected }
}
