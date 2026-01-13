'use client'

import { useEffect, useRef, useState } from 'react'
import { isNativeApp, getNativeBridge, setupNativeEventListener } from '@/lib/native-bridge'

type LocationPayload = {
  latitude: number
  longitude: number
  accuracy?: number | null
  address?: string | null
}

export function GlobalLocationTracker() {
  const [enabled, setEnabled] = useState(false)
  const watchIdRef = useRef<number | null>(null)
  const cleanupNativeListenerRef = useRef<null | (() => void)>(null)
  const lastSentAtRef = useRef<number>(0)

  const sendLocation = async (payload: LocationPayload) => {
    // Throttle to avoid DB spam
    const now = Date.now()
    const MIN_INTERVAL_MS = 15_000
    if (now - lastSentAtRef.current < MIN_INTERVAL_MS) return
    lastSentAtRef.current = now

    try {
      await fetch('/api/locations/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy: payload.accuracy ?? null,
          address: payload.address ?? null,
          location_type: 'tracking',
        }),
      })
    } catch (e) {
      // Silent failure; tracking should not disrupt the app UX
      console.error('[LOCATION_TRACKER] Failed to log location:', e)
    }
  }

  const stop = () => {
    if (watchIdRef.current !== null && typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    if (cleanupNativeListenerRef.current) {
      cleanupNativeListenerRef.current()
      cleanupNativeListenerRef.current = null
    }

    if (isNativeApp()) {
      try {
        getNativeBridge()?.stopTracking?.()
      } catch (e) {
        console.error('[LOCATION_TRACKER] Failed to stop native tracking:', e)
      }
    }
  }

  const start = () => {
    stop()

    if (isNativeApp()) {
      // Start native tracking and log via web API (authenticated via WebView cookies)
      cleanupNativeListenerRef.current = setupNativeEventListener((event) => {
        if (event.type === 'LOCATION_UPDATE') {
          const { latitude, longitude, accuracy, address } = event.data || {}
          if (typeof latitude === 'number' && typeof longitude === 'number') {
            sendLocation({
              latitude,
              longitude,
              accuracy: typeof accuracy === 'number' ? accuracy : null,
              address: typeof address === 'string' && address.length > 0 ? address : null,
            })
          }
        }
      })

      try {
        getNativeBridge()?.startTracking?.(15) // seconds
      } catch (e) {
        console.error('[LOCATION_TRACKER] Failed to start native tracking:', e)
      }
      return
    }

    // Web/PWA tracking (foreground only)
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords
        sendLocation({
          latitude,
          longitude,
          accuracy: typeof accuracy === 'number' ? accuracy : null,
        })
      },
      (err) => {
        console.warn('[LOCATION_TRACKER] Geolocation error:', err)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000,
        timeout: 10_000,
      }
    )
  }

  const refreshSetting = async () => {
    try {
      const res = await fetch('/api/locations/settings')
      if (!res.ok) return
      const data = await res.json()
      setEnabled(!!data?.is_tracking_enabled)
    } catch (e) {
      console.error('[LOCATION_TRACKER] Failed to fetch settings:', e)
    }
  }

  useEffect(() => {
    refreshSetting()

    const onChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ enabled?: boolean }>).detail
      if (typeof detail?.enabled === 'boolean') {
        setEnabled(detail.enabled)
      } else {
        refreshSetting()
      }
    }
    window.addEventListener('location-tracking-changed', onChanged as EventListener)

    const onFocus = () => refreshSetting()
    window.addEventListener('focus', onFocus)

    return () => {
      window.removeEventListener('location-tracking-changed', onChanged as EventListener)
      window.removeEventListener('focus', onFocus)
      stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (enabled) start()
    else stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled])

  return null
}


